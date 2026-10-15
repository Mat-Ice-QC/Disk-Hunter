from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import asyncio
import ipaddress
import json
import os
import re
import shutil
import socket
import subprocess
import threading
import time
from .system import get_local_time, get_client_ip

router = APIRouter(prefix="/api/network", tags=["network"])

NETWORK_HISTORY_FILE = "/app/data/network_history.json"

INTERFACE_NAME_RE = re.compile(r"^[a-zA-Z0-9_.-]{1,15}$")
HIDDEN_INTERFACE_PREFIXES = ("docker", "veth", "br-")

# In-memory pending change record + rollback timer task (single uvicorn worker)
_pending = None
_rollback_task = None
_history_lock = threading.Lock()


def apply_enabled():
    return os.getenv("NETWORK_APPLY_ENABLED", "false").lower() == "true"


def append_network_history(entry):
    try:
        with _history_lock:
            history = []
            if os.path.exists(NETWORK_HISTORY_FILE):
                try:
                    with open(NETWORK_HISTORY_FILE, "r") as f:
                        content = f.read().strip()
                        if content:
                            history = json.loads(content)
                except Exception:
                    history = []
            history.insert(0, entry)
            tmp_path = NETWORK_HISTORY_FILE + ".tmp"
            with open(tmp_path, "w") as f:
                json.dump(history, f, indent=4)
            os.replace(tmp_path, NETWORK_HISTORY_FILE)
    except Exception as e:
        print(f"Failed to save network history: {e}")


def _log_event(event, ip, status, commands):
    if isinstance(commands, (list, tuple)):
        command = "; ".join(str(c) for c in commands)
    else:
        command = str(commands)
    append_network_history({
        "timestamp": get_local_time(),
        "event": event,
        "username": ip,
        "drive": "-",
        "status": status,
        "command": command,
    })


def _run_ip(args, timeout=10):
    return subprocess.run(["ip"] + args, capture_output=True, text=True, timeout=timeout)


def get_live_interfaces():
    """Raw interface list from `ip -j addr`. The API container uses network_mode
    host, so this reads the host network namespace."""
    result = _run_ip(["-j", "addr"])
    if result.returncode != 0:
        raise RuntimeError(f"ip addr failed: {result.stderr.strip() or 'unknown error'}")
    return json.loads(result.stdout or "[]")


def _parse_iface(raw):
    flags = raw.get("flags", [])
    ipv4 = []
    ipv6 = []
    for info in raw.get("addr_info", []):
        entry = {"address": info.get("local"), "prefix": info.get("prefixlen")}
        if info.get("family") == "inet":
            ipv4.append(entry)
        elif info.get("family") == "inet6":
            ipv6.append(entry)
    return {
        "name": raw.get("ifname"),
        "state": raw.get("operstate") or ("UP" if "UP" in flags else "DOWN"),
        "mac": raw.get("address"),
        "ipv4": ipv4,
        "ipv6": ipv6,
    }


def get_default_gateway():
    result = _run_ip(["-j", "route"])
    if result.returncode != 0:
        return None
    try:
        for route in json.loads(result.stdout or "[]"):
            if route.get("dst") == "default":
                return {"gateway": route.get("gateway"), "dev": route.get("dev")}
    except Exception:
        pass
    return None


def get_dns_servers():
    servers = []
    try:
        with open("/etc/resolv.conf", "r") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith(("#", ";")):
                    continue
                parts = line.split()
                if len(parts) >= 2 and parts[0] == "nameserver":
                    servers.append(parts[1])
    except Exception:
        pass
    return servers


def get_live_links_detailed():
    """Raw `ip -d -j link` list (includes linkinfo for vlan devices). The API
    container uses network_mode host, so this reads the host namespace."""
    result = _run_ip(["-d", "-j", "link"])
    if result.returncode != 0:
        raise RuntimeError(f"ip -d link failed: {result.stderr.strip() or 'unknown error'}")
    return json.loads(result.stdout or "[]")


def _vlan_details(raw, ifindex_map):
    """Parse {id, parent} from one `ip -d -j link` entry; None when the device
    is not a vlan or the output lacks linkinfo."""
    if not isinstance(raw, dict):
        return None
    linkinfo = raw.get("linkinfo") or {}
    if not isinstance(linkinfo, dict) or linkinfo.get("info_kind") != "vlan":
        return None
    info_data = linkinfo.get("info_data") or {}
    vlan_id = info_data.get("id") if isinstance(info_data, dict) else None
    parent = raw.get("link")
    if not isinstance(parent, str) or not parent:
        link_index = raw.get("link_index") if not isinstance(parent, int) else parent
        parent = ifindex_map.get(link_index) if isinstance(link_index, int) else None
    return {"id": vlan_id, "parent": parent}


def _annotate_vlans(interfaces, detailed_links):
    """Attach vlan {id, parent} to each parsed interface and return the
    top-level vlan device list. Tolerates entries lacking linkinfo."""
    ifindex_map = {raw.get("ifindex"): raw.get("ifname") for raw in detailed_links
                   if isinstance(raw, dict) and raw.get("ifindex") is not None}
    by_name = {raw.get("ifname"): raw for raw in detailed_links if isinstance(raw, dict)}
    vlans = []
    for iface in interfaces:
        details = _vlan_details(by_name.get(iface.get("name")), ifindex_map)
        iface["vlan"] = details
        if details is not None:
            vlans.append({"name": iface["name"], "id": details.get("id"), "parent": details.get("parent")})
    return vlans


def get_network_state_data(all_interfaces: bool = False):
    raw_interfaces = get_live_interfaces()
    interfaces = []
    for raw in raw_interfaces:
        name = raw.get("ifname", "")
        if not all_interfaces and (name == "lo" or name.startswith(HIDDEN_INTERFACE_PREFIXES)):
            continue
        interfaces.append(_parse_iface(raw))
    try:
        detailed_links = get_live_links_detailed()
    except Exception:
        detailed_links = []
    return {
        "interfaces": interfaces,
        "vlans": _annotate_vlans(interfaces, detailed_links),
        "default_gateway": get_default_gateway(),
        "dns": get_dns_servers(),
        "hostname": socket.gethostname(),
    }


class NetworkConfigRequest(BaseModel):
    interface: str
    mode: str
    address: Optional[str] = None
    prefix: Optional[int] = None
    gateway: Optional[str] = None
    dns: Optional[List[str]] = None
    vlan_id: Optional[int] = None
    set_default_route: Optional[bool] = False


class ApplyRequest(NetworkConfigRequest):
    confirm: bool = False
    rollback_seconds: int = 90


class VlanRemoveRequest(BaseModel):
    interface: str
    confirm: bool = False
    force: bool = False
    dry_run: bool = False


def _parse_ipv4(text):
    """Strictly validate an IPv4 host address. Returns (error, address)."""
    try:
        addr = ipaddress.ip_address(text)
    except Exception:
        return f"Invalid IP address: {text}", None
    if not isinstance(addr, ipaddress.IPv4Address):
        return f"Only IPv4 addresses are supported: {text}", None
    if addr.is_loopback:
        return f"Loopback address not allowed: {text}", None
    if addr.is_multicast:
        return f"Multicast address not allowed: {text}", None
    if addr.is_unspecified:
        return f"Unspecified address not allowed: {text}", None
    return None, addr


def _validate_static_address(address_text, prefix):
    err, addr = _parse_ipv4(address_text)
    if err:
        return err, None
    if not (8 <= prefix <= 30):
        return f"Prefix must be between 8 and 30 for IPv4 (got {prefix}).", None
    try:
        iface_obj = ipaddress.ip_interface(f"{addr}/{prefix}")
    except Exception:
        return f"Invalid address/prefix combination: {address_text}/{prefix}", None
    network = iface_obj.network
    if addr == network.network_address:
        return f"{addr} is the network address of {network}; use a host address.", None
    if addr == network.broadcast_address:
        return f"{addr} is the broadcast address of {network}; use a host address.", None
    return None, iface_obj


def _validate_gateway(gateway_text, network):
    err, gw = _parse_ipv4(gateway_text)
    if err:
        return err, None
    if gw not in network:
        return f"Gateway {gw} is outside the subnet {network}.", None
    return None, gw


def _validate_dns(entry_text):
    try:
        entry = ipaddress.ip_address(entry_text)
    except Exception:
        return f"Invalid DNS server address: {entry_text}", None
    if entry.is_multicast or entry.is_unspecified:
        return f"DNS server address not allowed: {entry_text}", None
    return None, entry


def _connection_warning(http_request, interface, live_interfaces):
    """Warn when the target interface carries the current client connection
    (matched by request client IP or Host header against its addresses)."""
    target = None
    for raw in live_interfaces or []:
        if raw.get("ifname") == interface:
            target = raw
            break
    if target is None:
        return None
    current = [info.get("local") for info in target.get("addr_info", []) if info.get("family") == "inet"]
    client_ip = get_client_ip(http_request)
    host_header = http_request.headers.get("host") or ""
    host_ip = host_header
    if host_ip.startswith("["):
        host_ip = host_ip[1:host_ip.find("]")] if "]" in host_ip else host_ip
    else:
        host_ip = host_ip.split(":")[0]
    if client_ip in current or host_ip in current:
        return (f"The interface {interface} carries your current connection (client {client_ip}). "
                f"Applying this change drops your session — reconnect via the new address to confirm, "
                f"otherwise the change rolls back automatically.")
    return None


def _validate_vlan(interface, vlan_id, set_default_route, address, network,
                    live_interfaces, errors, warnings):
    """VLAN-specific checks. Appends to errors/warnings and returns the vlan
    part of the validated dict, or None when the request cannot proceed.
    Never touches the system."""
    vlan_device = f"{interface}.{vlan_id}"
    if len(vlan_device) > 15:
        errors.append(f"VLAN sub-interface name '{vlan_device}' is {len(vlan_device)} characters long; "
                      "Linux interface names are limited to 15 characters (IFNAMSIZ). "
                      "Use a shorter parent name or VLAN id.")
        return None
    try:
        detailed_links = get_live_links_detailed()
    except Exception as e:
        errors.append(f"Could not read live link details from the host: {e}")
        return None
    ifindex_map = {raw.get("ifindex"): raw.get("ifname") for raw in detailed_links
                   if raw.get("ifindex") is not None}
    by_name = {raw.get("ifname"): raw for raw in detailed_links}
    parent_details = _vlan_details(by_name.get(interface), ifindex_map)
    if "." in interface and parent_details is not None:
        errors.append(f"{interface} is itself a VLAN device (id {parent_details.get('id')} on "
                      f"{parent_details.get('parent')}); nested VLANs (QinQ) are not supported. "
                      "Use a physical parent interface.")
        return None
    vlan_exists = False
    existing_raw = next((raw for raw in live_interfaces if raw.get("ifname") == vlan_device), None)
    if existing_raw is not None:
        existing_details = _vlan_details(by_name.get(vlan_device), ifindex_map)
        if existing_details is None:
            errors.append(f"A device named {vlan_device} already exists and is not a VLAN device; "
                          "choose a different VLAN id or parent.")
        elif existing_details.get("id") != vlan_id or existing_details.get("parent") != interface:
            errors.append(f"VLAN device {vlan_device} already exists with a different id/parent "
                          f"(id {existing_details.get('id')} on {existing_details.get('parent')}); "
                          "choose a different VLAN id or parent.")
        else:
            vlan_exists = True
    vlan_address_present = False
    if existing_raw is not None and address is not None and network is not None:
        for info in existing_raw.get("addr_info", []):
            if (info.get("family") == "inet" and info.get("local") == str(address)
                    and info.get("prefixlen") == network.prefixlen):
                vlan_address_present = True
                break
    if network is not None:
        for raw in live_interfaces:
            if raw.get("ifname") == vlan_device:
                continue
            for info in raw.get("addr_info", []):
                if info.get("family") != "inet" or not info.get("local") or info.get("prefixlen") is None:
                    continue
                try:
                    existing_net = ipaddress.ip_interface(f"{info.get('local')}/{info.get('prefixlen')}").network
                except Exception:
                    continue
                if existing_net.version == 4 and network.overlaps(existing_net):
                    errors.append(f"The VLAN subnet {network} overlaps the subnet {existing_net} "
                                  f"already configured on {raw.get('ifname')}.")
    warnings.append(f"The upstream switch port for {interface} must carry VLAN {vlan_id} tagged (802.1Q); "
                    "otherwise the VLAN sub-interface passes no traffic.")
    warnings.append("The kernel 8021q module must be loaded on the host for VLAN devices to work.")
    # TODO: needs a source for how to load the 8021q module from the privileged
    # API container; until then the owner must run 'modprobe 8021q' on the host
    # when 'ip link add ... type vlan' fails with 'Operation not supported'.
    if set_default_route:
        warnings.append(f"The default route will be replaced and moved to {vlan_device} via the VLAN "
                        "gateway; traffic to other subnets is then routed through the VLAN.")
    return {
        "vlan_id": vlan_id,
        "vlan_parent": interface,
        "vlan_device": vlan_device,
        "vlan_exists": vlan_exists,
        "vlan_address_present": vlan_address_present,
    }


def _validate_request(req, http_request):
    """Shared validation for /validate and /apply. Returns (errors, validated,
    warning, warnings). Never touches the system."""
    errors = []
    warnings = []
    interface = (req.interface or "").strip()
    mode = (req.mode or "").strip().lower()
    vlan_id = req.vlan_id
    set_default_route = bool(req.set_default_route) if req.set_default_route is not None else False

    if vlan_id is not None and not (isinstance(vlan_id, int) and not isinstance(vlan_id, bool)
                                    and 1 <= vlan_id <= 4094):
        errors.append(f"vlan_id must be an integer between 1 and 4094 (got {vlan_id}).")
        vlan_id = None

    try:
        live_interfaces = get_live_interfaces()
    except Exception as e:
        errors.append(f"Could not read live interfaces from the host: {e}")
        live_interfaces = []
    live_names = [raw.get("ifname", "") for raw in live_interfaces]

    if not interface:
        errors.append("An interface name is required.")
    elif not INTERFACE_NAME_RE.match(interface):
        errors.append(f"Invalid interface name: {interface}")
    elif live_interfaces and interface not in live_names:
        errors.append(f"Interface {interface} does not exist on this machine.")

    if mode not in ("dhcp", "static"):
        errors.append("Mode must be 'dhcp' or 'static'.")

    address = None
    prefix = None
    gateway = None
    network = None

    if mode == "static":
        address_text = str(req.address).strip() if req.address else ""
        prefix = int(req.prefix) if req.prefix is not None else None
        if not address_text:
            errors.append("An address is required in static mode.")
        if req.prefix is None:
            errors.append("A prefix length is required in static mode.")
        if address_text and prefix is not None:
            err, iface_obj = _validate_static_address(address_text, prefix)
            if err:
                errors.append(err)
            else:
                address = iface_obj.ip
                network = iface_obj.network
                prefix = iface_obj.network.prefixlen
        gateway_text = str(req.gateway).strip() if req.gateway else ""
        if gateway_text:
            if network is None:
                err, _gw = _parse_ipv4(gateway_text)
                if err:
                    errors.append(err)
            else:
                err, gw = _validate_gateway(gateway_text, network)
                if err:
                    errors.append(err)
                elif address is not None and gw == address:
                    errors.append(f"Gateway cannot be the interface address itself ({address}).")
                else:
                    gateway = gw
    elif mode == "dhcp":
        if req.address is not None and str(req.address).strip():
            errors.append("Field 'address' is not valid in dhcp mode.")
        if req.prefix is not None:
            errors.append("Field 'prefix' is not valid in dhcp mode.")
        if req.gateway is not None and str(req.gateway).strip():
            errors.append("Field 'gateway' is not valid in dhcp mode.")
        # TODO: dhclient is not installed in the API image (see backend/Dockerfile);
        # DHCP apply needs it added — owner decision.
        if not shutil.which("dhclient"):
            errors.append("DHCP mode requires the dhclient binary, which is not available in the API container. Static mode is available.")

    vlan = None
    if vlan_id is not None:
        if mode != "static":
            errors.append("VLAN configuration requires static mode.")
        if set_default_route and not gateway:
            errors.append("set_default_route=true requires a gateway.")
        vlan = _validate_vlan(interface, vlan_id, set_default_route, address, network,
                              live_interfaces, errors, warnings)

    dns_entries = []
    if req.dns:
        seen = set()
        for entry in req.dns:
            text = str(entry).strip()
            if not text:
                continue
            err, addr = _validate_dns(text)
            if err:
                errors.append(err)
            elif str(addr) not in seen:
                seen.add(str(addr))
                dns_entries.append(str(addr))

    validated = None
    if not errors:
        validated = {
            "interface": interface,
            "mode": mode,
            "address": str(address) if address else None,
            "prefix": prefix if mode == "static" else None,
            "gateway": str(gateway) if gateway else None,
            "dns": dns_entries,
        }
        if vlan is not None:
            validated.update(vlan)
            validated["set_default_route"] = set_default_route and bool(gateway)

    if vlan_id is None:
        warning = _connection_warning(http_request, interface, live_interfaces) if interface else None
    else:
        warning = None
    return errors, validated, warning, warnings


def _render_netplan(validated):
    """Render a netplan YAML file from strictly validated values only
    (interface matched against the regex and the live list, all addresses
    normalized through the ipaddress module), so no raw user text can reach
    this output. Manual formatting; PyYAML is not part of the pinned
    requirements."""
    if validated.get("vlan_id") is not None:
        return _render_vlan_netplan(validated)
    interface = validated["interface"]
    lines = [
        "network:",
        "  version: 2",
        "  ethernets:",
        f"    {interface}:",
    ]
    if validated["mode"] == "dhcp":
        lines.append("      dhcp4: true")
    else:
        lines.append("      dhcp4: false")
        lines.append("      addresses:")
        lines.append(f"        - {validated['address']}/{validated['prefix']}")
        if validated["gateway"]:
            lines.append("      routes:")
            lines.append("        - to: default")
            lines.append(f"          via: {validated['gateway']}")
    if validated["dns"]:
        lines.append("      nameservers:")
        lines.append("        addresses:")
        for entry in validated["dns"]:
            lines.append(f"          - {entry}")
    return "\n".join(lines) + "\n"


def _render_vlan_netplan(validated):
    """vlans block from strictly validated values only (see _render_netplan)."""
    lines = [
        "network:",
        "  version: 2",
        "  vlans:",
        f"    {validated['vlan_device']}:",
        f"      id: {validated['vlan_id']}",
        f"      link: {validated['vlan_parent']}",
        "      addresses:",
        f"        - {validated['address']}/{validated['prefix']}",
    ]
    if validated.get("set_default_route") and validated["gateway"]:
        lines.append("      routes:")
        lines.append("        - to: default")
        lines.append(f"          via: {validated['gateway']}")
    if validated["dns"]:
        lines.append("      nameservers:")
        lines.append("        addresses:")
        for entry in validated["dns"]:
            lines.append(f"          - {entry}")
    return "\n".join(lines) + "\n"


def _build_apply_argv(validated):
    if validated.get("vlan_id") is not None:
        return _build_vlan_argv(validated)
    interface = validated["interface"]
    argv_list = [["ip", "-4", "addr", "flush", "dev", interface]]
    if validated["mode"] == "dhcp":
        argv_list.append(["dhclient", "-1", interface])
    else:
        argv_list.append(["ip", "addr", "add", f"{validated['address']}/{validated['prefix']}", "dev", interface])
        if validated["gateway"]:
            argv_list.append(["ip", "route", "replace", "default", "via", validated["gateway"], "dev", interface])
    return argv_list


def _build_vlan_argv(validated):
    """Commands for a VLAN sub-interface. Never flushes or otherwise touches
    the parent's addresses or routes, so the current management connection
    cannot be lost. The subnet route is created implicitly by the address;
    the default route is only touched when set_default_route is true."""
    vlan_device = validated["vlan_device"]
    argv_list = []
    if not validated["vlan_exists"]:
        argv_list.append(["ip", "link", "add", "link", validated["vlan_parent"],
                          "name", vlan_device, "type", "vlan", "id", str(validated["vlan_id"])])
    argv_list.append(["ip", "link", "set", vlan_device, "up"])
    if not validated["vlan_address_present"]:
        argv_list.append(["ip", "addr", "add", f"{validated['address']}/{validated['prefix']}",
                          "dev", vlan_device])
    if validated.get("set_default_route") and validated["gateway"]:
        argv_list.append(["ip", "route", "replace", "default", "via", validated["gateway"],
                          "dev", vlan_device])
    return argv_list


def _build_plan(validated):
    return {
        "commands": [" ".join(argv) for argv in _build_apply_argv(validated)],
        "netplan_yaml": _render_netplan(validated),
    }


def _capture_previous_state(interface):
    raw_interfaces = get_live_interfaces()
    target = next((raw for raw in raw_interfaces if raw.get("ifname") == interface), None)
    addresses = []
    if target:
        for info in target.get("addr_info", []):
            if info.get("family") == "inet":
                addresses.append(f"{info.get('local')}/{info.get('prefixlen')}")
    return {"interface": interface, "addresses": addresses, "default_gateway": get_default_gateway()}


def _capture_vlan_previous_state(validated):
    """Pre-apply state for a VLAN change: whether this apply creates the VLAN
    device and the default route it may replace."""
    return {
        "type": "vlan",
        "interface": validated["vlan_parent"],
        "vlan_device": validated["vlan_device"],
        "vlan_id": validated["vlan_id"],
        "created": not validated["vlan_exists"],
        "default_route_replaced": bool(validated.get("set_default_route") and validated["gateway"]),
        "previous_default_gateway": get_default_gateway(),
    }


def _build_restore_argv(previous):
    if previous.get("type") == "vlan":
        return _build_vlan_restore_argv(previous)
    interface = previous["interface"]
    argv_list = [["ip", "-4", "addr", "flush", "dev", interface]]
    for cidr in previous["addresses"]:
        argv_list.append(["ip", "addr", "add", cidr, "dev", interface])
    gateway = previous.get("default_gateway")
    if gateway and gateway.get("gateway") and gateway.get("dev"):
        argv_list.append(["ip", "route", "replace", "default", "via", gateway["gateway"], "dev", gateway["dev"]])
    if not previous["addresses"]:
        # Previous state had no static IPv4 address (DHCP): retry DHCP.
        argv_list.append(["dhclient", "-1", interface])
    return argv_list


def _build_vlan_restore_argv(previous):
    """Rollback for a VLAN change: delete the VLAN device this apply created
    (pre-existing VLAN devices are left alone) and restore a replaced default
    route. `ip link del` removes the device with its addresses and routes."""
    argv_list = []
    if previous.get("created"):
        argv_list.append(["ip", "link", "del", previous["vlan_device"]])
    if previous.get("default_route_replaced"):
        gateway = previous.get("previous_default_gateway")
        if gateway and gateway.get("gateway") and gateway.get("dev"):
            argv_list.append(["ip", "route", "replace", "default",
                              "via", gateway["gateway"], "dev", gateway["dev"]])
        else:
            argv_list.append(["ip", "route", "del", "default"])
    return argv_list


def _vlan_log_summary(validated):
    """History line prefix for VLAN events: includes the vlan id and device name."""
    return (f"vlan {validated['vlan_id']} on {validated['vlan_parent']} "
            f"(device {validated['vlan_device']})")


def _vlan_module_hint(error):
    """Clear guidance when the host kernel lacks the 8021q module.
    TODO: needs a source for how to load the 8021q module from the privileged
    API container; until then the owner must run it on the host."""
    lowered = str(error).lower()
    if "not supported" in lowered:
        return (" The host kernel may not have the 8021q module loaded; "
                "run 'modprobe 8021q' on the host (not in this container) and retry.")
    return ""


def _execute_argv_list(argv_list):
    """Run commands sequentially (list-form argv, timeouts); raise on first failure."""
    for argv in argv_list:
        timeout = 120 if argv[0] == "dhclient" else 30
        try:
            proc = subprocess.run(argv, capture_output=True, text=True, timeout=timeout)
        except subprocess.TimeoutExpired:
            raise RuntimeError(f"Command timed out: {' '.join(argv)}")
        if proc.returncode != 0:
            raise RuntimeError(f"Command failed: {' '.join(argv)}: {proc.stderr.strip() or proc.stdout.strip() or 'unknown error'}")
    return [" ".join(argv) for argv in argv_list]


def _pending_change_summary():
    record = _pending
    if record is None or record.get("state") != "applied":
        return None
    seconds_left = int(record["expires_at"] - time.time())
    summary = {
        "interface": record["interface"],
        "mode": record["mode"],
        "seconds_left": max(0, seconds_left),
        "state": record["state"],
    }
    if record.get("vlan_device"):
        summary["vlan_id"] = record.get("vlan_id")
        summary["vlan_device"] = record["vlan_device"]
    return summary


@router.get("")
def get_network_state(all: bool = False):
    try:
        data = get_network_state_data(all_interfaces=all)
    except Exception as e:
        return {"status": "error", "message": str(e)}
    return {
        "status": "success",
        "hostname": data["hostname"],
        "interfaces": data["interfaces"],
        "vlans": data["vlans"],
        "default_gateway": data["default_gateway"],
        "dns": data["dns"],
        "config_apply_enabled": apply_enabled(),
        "pending_change": _pending_change_summary(),
    }


@router.post("/validate")
def validate_config(req: NetworkConfigRequest, http_request: Request):
    """Validate a proposed network configuration. Never touches the system;
    returns the exact commands that would run plus the netplan YAML."""
    ip = get_client_ip(http_request)
    errors, validated, warning, warnings = _validate_request(req, http_request)
    plan = _build_plan(validated) if validated else None
    log_commands = plan["commands"] if plan else "-"
    if validated and validated.get("vlan_device"):
        log_commands = [_vlan_log_summary(validated)] + plan["commands"]
    _log_event("network_validate", ip, "valid" if validated else "invalid",
               log_commands)
    return {"valid": validated is not None, "errors": errors, "plan": plan,
            "warning": warning, "warnings": warnings}


@router.post("/apply")
async def apply_config(req: ApplyRequest, http_request: Request):
    """Apply a network configuration at runtime with an automatic rollback
    timer unless /confirm is called within rollback_seconds."""
    global _pending, _rollback_task
    ip = get_client_ip(http_request)
    if not apply_enabled():
        _log_event("network_apply", ip, "refused", "-")
        raise HTTPException(status_code=403, detail=(
            "Applying network changes is disabled on this server "
            "(NETWORK_APPLY_ENABLED != 'true'). Validation is still available."))

    errors, validated, warning, warnings = _validate_request(req, http_request)
    if not validated:
        _log_event("network_apply", ip, "failed", "-")
        raise HTTPException(status_code=400, detail={"errors": errors})
    if req.confirm is not True:
        _log_event("network_apply", ip, "failed", "-")
        raise HTTPException(status_code=400, detail="Set confirm=true to apply network changes.")
    if not (30 <= req.rollback_seconds <= 300):
        _log_event("network_apply", ip, "failed", "-")
        raise HTTPException(status_code=400, detail="rollback_seconds must be between 30 and 300.")
    if _pending is not None:
        _log_event("network_apply", ip, "failed", "-")
        raise HTTPException(status_code=409, detail=(
            "Another network change is pending confirmation. Confirm it or wait for its rollback first."))

    interface = validated["interface"]
    is_vlan = validated.get("vlan_id") is not None
    try:
        if is_vlan:
            previous = await asyncio.to_thread(_capture_vlan_previous_state, validated)
        else:
            previous = await asyncio.to_thread(_capture_previous_state, interface)
    except Exception as e:
        _log_event("network_apply", ip, "failed", [f"could not read current state: {e}"])
        raise HTTPException(status_code=500, detail=f"Could not read current network state: {e}")

    try:
        commands_run = await asyncio.to_thread(_execute_argv_list, _build_apply_argv(validated))
    except Exception as e:
        if is_vlan:
            e = RuntimeError(f"{e}{_vlan_module_hint(e)}")
        restore_note = "Previous settings restored."
        try:
            await asyncio.to_thread(_execute_argv_list, _build_restore_argv(previous))
        except Exception as restore_err:
            restore_note = f"Automatic restore failed: {restore_err}"
        _log_event("network_apply", ip, "failed",
                   ([_vlan_log_summary(validated)] if is_vlan else []) + [f"apply failed: {e}", restore_note])
        raise HTTPException(status_code=500, detail=f"Apply failed: {e}. {restore_note}")

    # TODO: persisting across reboot requires writing a netplan file, which needs
    # a bind mount of /etc/netplan into the API container (owner decision); this
    # version applies runtime state only and returns the netplan YAML for
    # manual placement.
    record = {
        "state": "applied",
        "interface": interface,
        "mode": validated["mode"],
        "previous": previous,
        "validated": validated,
        "client_ip": ip,
        "rollback_seconds": req.rollback_seconds,
        "expires_at": time.time() + req.rollback_seconds,
    }
    if is_vlan:
        record["vlan_id"] = validated["vlan_id"]
        record["vlan_device"] = validated["vlan_device"]
    _pending = record
    _rollback_task = asyncio.create_task(_rollback_timer(record))
    _log_event("network_apply", ip, "applied",
               ([_vlan_log_summary(validated)] + commands_run) if is_vlan else commands_run)

    plan = _build_plan(validated)
    new_url = f"http://{validated['address']}/network.html" if validated["address"] else None
    if is_vlan:
        message = (f"Applied to VLAN device {validated['vlan_device']} (VLAN {validated['vlan_id']} on "
                   f"{interface}) at runtime. Confirm within {req.rollback_seconds}s or the change is "
                   f"rolled back automatically. The parent interface {interface} was not modified.")
    else:
        message = (f"Applied to {interface} at runtime. Confirm within {req.rollback_seconds}s or the "
                   f"previous settings are restored automatically.")
    return {
        "status": "success",
        "message": message,
        "persistent": False,
        "netplan_yaml": plan["netplan_yaml"],
        "commands": commands_run,
        "rollback_seconds": req.rollback_seconds,
        "warning": warning,
        "warnings": warnings,
        "new_url": new_url,
    }


async def _rollback_timer(record):
    global _pending
    try:
        await asyncio.sleep(record["rollback_seconds"])
    except asyncio.CancelledError:
        return
    if _pending is not record or record.get("state") != "applied":
        return
    record["state"] = "rolling-back"
    _pending = None
    try:
        commands_run = await asyncio.to_thread(_execute_argv_list, _build_restore_argv(record["previous"]))
        log_commands = commands_run
        if record.get("vlan_device"):
            log_commands = [f"rollback of vlan {record.get('vlan_id')} device {record['vlan_device']}"] + commands_run
        _log_event("network_rollback", record.get("client_ip", "-"), "rolled-back", log_commands)
    except Exception as e:
        _log_event("network_rollback", record.get("client_ip", "-"), "failed", [f"restore failed: {e}"])


@router.post("/confirm")
async def confirm_change(http_request: Request):
    """Confirm the pending change and cancel its automatic rollback."""
    ip = get_client_ip(http_request)
    global _pending, _rollback_task
    if _pending is None or _pending.get("state") != "applied":
        _log_event("network_confirm", ip, "failed", "-")
        raise HTTPException(status_code=400, detail=(
            "No pending network change to confirm (it may have already been rolled back)."))
    record = _pending
    _pending = None
    if _rollback_task is not None and not _rollback_task.done():
        _rollback_task.cancel()
    _rollback_task = None
    target = record["interface"]
    log_target = target
    if record.get("vlan_device"):
        target = record["vlan_device"]
        log_target = f"{target} (VLAN {record.get('vlan_id')} on {record['interface']})"
    _log_event("network_confirm", ip, "confirmed", log_target)
    return {
        "status": "success",
        "message": f"New settings for {target} confirmed. Rollback cancelled.",
        "interface": target,
    }


def _vlan_removal_summary(interface, details):
    if details is not None:
        return f"remove vlan device {interface} (id {details.get('id')} on {details.get('parent')})"
    return f"remove vlan device {interface}"


def _validate_vlan_removal(interface, http_request, force):
    """Checks for /vlan/remove. Appends to errors/warnings and returns
    (errors, warnings, plan, vlan_details). The plan holds the exact command.
    Never touches the system."""
    errors = []
    warnings = []
    interface = (interface or "").strip()
    valid_name = bool(interface) and bool(INTERFACE_NAME_RE.match(interface))
    if not interface:
        errors.append("A VLAN device name is required.")
    elif not valid_name:
        errors.append(f"Invalid interface name: {interface}")

    live_interfaces = []
    try:
        live_interfaces = get_live_interfaces()
    except Exception as e:
        errors.append(f"Could not read live interfaces from the host: {e}")
    live_names = [raw.get("ifname", "") for raw in live_interfaces]
    if valid_name and live_interfaces and interface not in live_names:
        errors.append(f"Interface {interface} does not exist on this machine.")

    details = None
    if valid_name and interface in live_names:
        try:
            detailed_links = get_live_links_detailed()
        except Exception as e:
            errors.append(f"Could not read live link details from the host: {e}")
        else:
            ifindex_map = {raw.get("ifindex"): raw.get("ifname") for raw in detailed_links
                           if raw.get("ifindex") is not None}
            by_name = {raw.get("ifname"): raw for raw in detailed_links}
            details = _vlan_details(by_name.get(interface), ifindex_map)
            if details is None:
                errors.append(f"{interface} is not a VLAN device; only VLAN sub-interfaces can be removed here.")
    if details is not None:
        if _connection_warning(http_request, interface, live_interfaces):
            if force:
                warnings.append(f"{interface} carries your current connection; removing it with "
                                "force=true drops your session immediately.")
            else:
                errors.append(f"Refusing to remove {interface}: it carries your current connection. "
                              "Reconnect through another interface or pass force=true.")
        default_gateway = get_default_gateway()
        if default_gateway and default_gateway.get("dev") == interface:
            if force:
                warnings.append(f"{interface} carries the current default route (via "
                                f"{default_gateway.get('gateway')}); removing it deletes that route.")
            else:
                errors.append(f"Refusing to remove {interface}: it carries the current default route "
                                f"(via {default_gateway.get('gateway')}). Pass force=true to remove it anyway.")
    plan = {"commands": [" ".join(["ip", "link", "del", interface])]} if not errors else None
    return errors, warnings, plan, details


@router.post("/vlan/remove/validate")
def validate_vlan_removal(req: VlanRemoveRequest, http_request: Request):
    """Validate a VLAN device removal without touching the system; returns
    the exact command that would run."""
    ip = get_client_ip(http_request)
    errors, warnings, plan, details = _validate_vlan_removal(req.interface, http_request, req.force)
    summary = _vlan_removal_summary(req.interface, details)
    _log_event("network_vlan_remove", ip, "valid" if not errors else "invalid",
               [summary] + (plan["commands"] if plan else errors))
    return {"valid": not errors, "errors": errors, "warnings": warnings,
            "plan": plan, "interface": req.interface}


@router.post("/vlan/remove")
async def remove_vlan(req: VlanRemoveRequest, http_request: Request):
    """Remove a VLAN sub-interface at runtime with `ip link del`, which also
    deletes its addresses and routes (including a default route via it). The
    parent interface is untouched."""
    ip = get_client_ip(http_request)
    if not apply_enabled():
        _log_event("network_vlan_remove", ip, "refused", [f"remove vlan device {req.interface}"])
        raise HTTPException(status_code=403, detail=(
            "Applying network changes is disabled on this server "
            "(NETWORK_APPLY_ENABLED != 'true'). Validation is still available."))

    errors, warnings, plan, details = _validate_vlan_removal(req.interface, http_request, req.force)
    summary = _vlan_removal_summary(req.interface, details)
    if errors:
        _log_event("network_vlan_remove", ip, "refused", [summary] + errors)
        raise HTTPException(status_code=400, detail={"errors": errors})
    if req.dry_run:
        _log_event("network_vlan_remove", ip, "valid", [summary] + plan["commands"])
        return {"status": "success", "dry_run": True, "message": "Dry run only; no command was run.",
                "interface": req.interface, "warnings": warnings, "plan": plan}
    if req.confirm is not True:
        _log_event("network_vlan_remove", ip, "failed", [summary])
        raise HTTPException(status_code=400, detail="Set confirm=true to remove a VLAN device.")
    if _pending is not None and _pending.get("vlan_device") == req.interface:
        _log_event("network_vlan_remove", ip, "refused",
                   [summary, f"a change for {req.interface} is pending confirmation"])
        raise HTTPException(status_code=409, detail=(
            f"A change for VLAN device {req.interface} is pending confirmation. "
            "Confirm it or wait for its rollback first."))

    try:
        commands_run = await asyncio.to_thread(_execute_argv_list, [["ip", "link", "del", req.interface]])
    except Exception as e:
        _log_event("network_vlan_remove", ip, "failed", [summary, f"remove failed: {e}"])
        raise HTTPException(status_code=500, detail=f"Remove failed: {e}")
    _log_event("network_vlan_remove", ip, "removed", [summary] + commands_run)
    return {
        "status": "success",
        "message": (f"Removed VLAN device {req.interface}. The device with its addresses and routes is "
                    f"gone; the parent interface was not modified."),
        "commands": commands_run,
        "warnings": warnings,
    }


@router.get("/history")
def get_network_history():
    try:
        if not os.path.exists(NETWORK_HISTORY_FILE):
            return {"status": "success", "history": []}
        with open(NETWORK_HISTORY_FILE, "r") as f:
            content = f.read().strip()
            if not content:
                return {"status": "success", "history": []}
            return {"status": "success", "history": json.loads(content)}
    except Exception as e:
        return {"status": "error", "message": str(e)}
