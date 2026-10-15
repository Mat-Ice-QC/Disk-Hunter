# Disk Hunter

> **An all-in-one web utility for testing, managing, wiping, and formatting physical storage drives.**

Disk Hunter provides a glassmorphic dashboard for administrative disk operations. A Python FastAPI backend orchestrates root-level commands inside ephemeral privileged Docker containers, keeping the host system isolated from destructive operations.

---

<div align="center">
  <table>
    <tr>
      <td align="center">
        <img src="screenshots/smarttest.png" alt="SMART Test" width="400"/><br>
        <b>SMART Test</b>
      </td>
      <td align="center">
        <img src="screenshots/diskshredding.png" alt="Disk Shredding" width="400"/><br>
        <b>Disk Shredding</b>
      </td>
    </tr>
    <tr>
      <td align="center">
        <img src="screenshots/partitioneditor.png" alt="Partition Editor" width="400"/><br>
        <b>Partition Editor</b>
      </td>
      <td align="center">
        <img src="screenshots/speedtest.png" alt="Speed Test" width="400"/><br>
        <b>Speed Test</b>
      </td>
    </tr>
    <tr>
      <td align="center" colspan="2">
        <img src="screenshots/isomodule.png" alt="ISO Module" width="400"/><br>
        <b>ISO Module</b>
      </td>
    </tr>
  </table>
</div>

## Key Features

- **Interactive Dashboard** — View connected drives, partition structures, device health, and hardware specs in a unified grid. List and squares layouts with drive image lightbox.
- **Secure Wiping** — Erase drives via `nwipe` (DoD 5220.22-M, Gutmann, PRNG, zero fill), `hdparm` ATA Secure Erase (standard + enhanced), or `nvme-cli` NVMe format (crypto + user-data erase). Real-time log streaming and automatic PDF Certificate of Erasure generation.
- **ATA Frozen Drive Handling** — Multi-method unfreeze (ATA sleep/wake, SATA link-power cycle, SCSI device-state reset) with automatic fallback to block-level zero overwrite (NIST SP 800-88 Clear) when the drive stays frozen.
- **Speed Benchmarks** — Sequential read/write `fio` benchmarks directly from the UI with history tracking.
- **S.M.A.R.T. Diagnostics** — Run short/extended self-tests, monitor real-time progress, and view structured attribute health tables.
- **Visual Partition Editor** — Create, delete, and format partitions (ext3, ext4, fat32, ntfs) with batch operations and a partition graphic.
- **OS Image Flashing** — Download and write `.iso` / `.img` files to targeted devices.
- **Temperature Monitoring** — Multi-sensor thermal page with configurable thresholds, colour-coded readings, and server-side settings.
- **Air-Gapped Kiosk Mode** — Optional Firefox ESR kiosk container for bare-metal deployments with no desktop environment.
- **Onboard Help Center** — Modular Markdown guides with localized translations.
- **Glassmorphic UI** — Consistent dark mode design with custom modals, responsive layout, and a Potato Mode toggle for low-end hardware.
- **Custom Drive Imagery & Badges** — Per-product drive images replace the default graphic instead of overlapping it; unpartitioned drives are flagged with a `NO TABLE` badge and the label "No partitions (unpartitioned / raw)"; a form-factor badge (e.g. `U.2`, `U.3` for KIOXIA KCD models, otherwise a model-prefix heuristic) is shown when known.
- **NVMe S.M.A.R.T. Health Attributes** — NVMe drives (including U.2/U.3) display parsed health attributes (Critical Warning, Available Spare, Percentage Used, Media and Data Integrity Errors, temperature, power-on hours, etc.) with an `OK`/`WARN`/`FAIL` status.
- **Unified Serial Number Lookup** — Every module (Shredding, S.M.A.R.T., Speed Test, Partition, History, Certificates) uses the same serial-number lookup as the Overview, so NVMe drives no longer report `UNKNOWN`.
- **Bulk Shredding Tools & IP Audit Trail** — Drive selection survives switching between Shredding and Secure Erase; the Confirm Data Destruction modal keeps Datacenter, Server Name and Inventory ID when toggling Detailed / Simple List; new bulk tools apply Datacenter and Server Name to selected or all drives and let you select drives by server; the initiating user's IP is recorded when a shredding job starts or stops.
- **ISO Downloader & Writer** — `.iso` is appended automatically to filenames that lack `.iso` / `.img`; Start Download and Write Image use the application's standard primary and danger buttons; every download is recorded in the ISO Action History (`iso_history.json`) with the user's IP, the URL, size, and status.
- **Unified History Views** — Audit Logs & PDFs, Test History, and Action History share the same columns (`Timestamp | User IP | Drive / Target | Status | Event / Details`); clicking any row opens a detail window showing the exact command the backend executed (entries created before this change show `Command not recorded`) and the corresponding output or logs, with a Copy button.
- **Module-Aware Sidebar History Entries** — Each module's history link appears only while that module (or its history page) is open.
- **Network Page (read-only by default)** — Address the in-app IP from the top bar or open `network.html` directly; no login needed (the application has no login yet). Shows interfaces, gateway, and DNS; validates a static or DHCP plan and shows the commands and the resulting netplan YAML. Applying changes to the running host is disabled by default and only enabled when `NETWORK_APPLY_ENABLED=true` is set in `.env`; apply has an automatic rollback timer (30-300 s) and a Confirm button, and is not persistent across reboots — the generated netplan YAML is provided so it can be placed manually.
- **VLAN (802.1Q) sub-interfaces** — Check **Use VLAN (802.1Q)** to apply a static address to a sub-interface named `<parent>.<vlan_id>` instead of the parent; the parent is never modified so a VLAN plan cannot drop the connection. Optionally mark the VLAN as the default route. Remove VLAN cards back the device with `ip link del`. Network apply and VLAN remove are all disabled by default and only enabled when `NETWORK_APPLY_ENABLED=true`.
- **Safe First Start** — The backend entrypoint creates the data folders and JSON files with safe permissions (directories `755`, files `644`, never group or world writable); optional `DATA_UID` and `DATA_GID` environment variables `chown` the data directory.

---

## System Architecture

```mermaid
graph TD
    UI[nginx - Frontend UI] -->|HTTP / WebSocket| API[FastAPI - Main API]
    API -->|smartctl proxy| SP[FastAPI - SMART Provider]
    API -->|spawns ephemeral containers| Workers[Worker Containers]
    
    SP -->|privileged| SMART[smartctl - /dev/*]
    Workers -->|privileged| DISK[nvme-cli, nwipe, hdparm, parted, dd, fio]
```

| Component | Container | Role |
|-----------|-----------|------|
| **Frontend** | `disk-hunter-ui` | Vanilla HTML/CSS/JS served by nginx |
| **Main API** | `disk-hunter-api` | FastAPI orchestrator — spawns, monitors, and terminates worker containers via Docker |
| **SMART Provider** | `disk-hunter-smart-provider` | Privileged FastAPI microservice — proxy for `smartctl` queries |
| **Workers** | `disk-hunter-*` | Ephemeral single-purpose containers (`nwipe`, `hdparm`, `nvme-cli`, `parted`, `smartctl`, `fio`) |

All base images are digest-pinned and all packages are version-locked to prevent supply chain attacks.

---

## Directory Layout

```
.
├── backend/                   # FastAPI orchestrator
│   ├── api/                   # Router modules (disks, shredding, history, partition, etc.)
│   ├── docker-entrypoint.sh   # First-start: creates data folders + JSON files with safe permissions
│   └── Dockerfile
├── html/                      # Frontend served by nginx
│   ├── css/                   # Glassmorphism theme stylesheets
│   ├── js/                    # Page logic and shared helpers
│   ├── components/            # Header, footer, sidebar fragments
│   ├── network.html           # Network page (interfaces, gateway, DNS, netplan validation)
│   └── docs/                  # On-site help center Markdown
├── smart-provider/            # SMART data microservice
├── workers/                   # Ephemeral task containers
│   ├── hdparm/                # ATA secure erase
│   ├── nvme/                  # NVMe format / crypto erase
│   ├── nwipe/                 # DBAN-based multi-pass eraser
│   ├── parted/                # Partition management
│   ├── smartctl-test/         # SMART self-test runner
│   ├── speedtest-worker/      # fio benchmark runner
│   └── firefox-kiosk/         # Air-gapped kiosk mode (compose profile)
├── data/                      # Runtime logs, PDFs, caches (gitignored)
├── docker-compose.yml
├── .env.example               # Configuration template
└── nginx-entrypoint.sh        # SSL / routing startup script
```

---

## Quick Start

### Prerequisites

- Linux host with Docker and Docker Compose
- Physical drive access (`/dev`, `/sys`, `/run/udev` are bind-mounted)
- Root or sudo access for Docker

### Deploy

```bash
git clone <repo-url> Disk-Hunter
cd Disk-Hunter
cp .env.example .env   # Edit if needed
docker compose up -d --build
```

The dashboard is available at `http://localhost` (or the host's IP on port 80/443 if HTTPS is configured).

---

## Configuration

All configuration is via `.env` (copy from `.env.example`). Docker Compose reads it automatically.

### Feature Toggles

| Variable | Description | Default |
|----------|-------------|---------|
| `ALLOWED_IPS` | Comma-separated allowed client IPs, or `*` for any | `*` |
| `ENABLE_SHREDDER` | Disk shredding (nwipe, hdparm, nvme) | `true` |
| `ENABLE_SPEEDTEST` | fio speed benchmarks | `true` |
| `ENABLE_ISOWRITER` | ISO download and flashing | `true` |
| `ENABLE_SMARTCTL` | SMART self-testing and analytics | `true` |
| `ENABLE_DATA_MANAGEMENT` | PDF/ISO/data file browsing | `true` |
| `ENABLE_NETWORK_SHARE` | Network share module (frontend toggle) | `true` |
| `ENABLE_DELETE_HISTORY` | Allow log/history deletion; `false` for immutable audits | `true` |
| `DATA_DIR` | Host path for logs, PDFs, and metadata | `./data` |

### HTTPS

Set `HTTPS_CERT_PATH` and `HTTPS_KEY_PATH` to your SSL certificate and key. nginx handles TLS automatically.

### ATA Secure Erase

| Variable | Description | Default |
|----------|-------------|---------|
| `FROZEN_FALLBACK_WIPE` | `1` = fall back to block-level zero overwrite if drive stays frozen; `0` = hard-fail | `1` |

### Kiosk Mode

| Variable | Description | Default |
|----------|-------------|---------|
| `KIOSK_URL` | URL for the Firefox kiosk to open | `http://localhost` |

### Network Page

| Variable | Description | Default |
|----------|-------------|---------|
| `NETWORK_APPLY_ENABLED` | Allow the Network page to apply changes to the running host (`true` / `false`). When `false`, the page stays read-only and only shows the validated netplan YAML for manual placement. | `false` |

### Data Directory Ownership

| Variable | Description | Default |
|----------|-------------|---------|
| `DATA_UID` | Optional numeric user id used by `docker-entrypoint.sh` to `chown` the data directory on first start. | unset |
| `DATA_GID` | Optional numeric group id used by `docker-entrypoint.sh` to `chown` the data directory on first start. | unset |

### First-Start Permissions

The backend entrypoint creates the data folders and JSON files with safe permissions on every container start: directories are `755`, files are `644`, and nothing is group or world writable. If `DATA_UID` / `DATA_GID` are set, the data directory is `chown`-ed to those ids.

### Server-Side Settings

Branding (company name, address, phone, datacenter tags), temperature sensor selection, and temperature collection are persisted in `data/branding.json` and `data/app_settings.json` on the Disk Hunter machine, shared across all clients.

### Applying Changes

```bash
docker compose down
docker compose up -d --build --force-recreate
```

---

## Air-Gapped Kiosk Mode

For bare, air-gapped Linux hosts with no desktop environment, an optional Firefox kiosk container launches a self-contained X server on the host's **tty2** and opens Firefox ESR in fullscreen kiosk mode at the Disk Hunter UI.

```bash
docker compose --profile kiosk up -d --build
```

Switch to tty2 with `Ctrl+Alt+F2` (or the container runs `chvt 2` automatically). 

---

## Supply Chain Security

All Docker base images are pinned by SHA256 digest and all APK/pip packages are locked to exact versions. Floating tags can be repointed upstream to a compromised or broken image without notice — digest pinning eliminates that risk. Version lock variables are defined in `.env.example` and passed as build args to every Dockerfile.

---

## TODO

- Active Directory / LDAP integration with role-based access control
- Automated SMTP emailing of PDF erasure certificates
- Bulk firmware updates across uniform drive batches
- Network share / disk browsing module
- Default drive images for nvme / usb / ssd / hdd / sd
- Debian APT package pinning (backend, smart-provider, nwipe, firefox-kiosk)
- Authentication on API endpoints
- Active Directory / LDAP (SSSD, Kerberos) authentication for the portable boot environment: planned, not started
- Disk and partition cloning module (partclone / Clonezilla)
- Drive array / ZFS management module (zpool / zfs)
- Retake all screenshots after the UI changes

---

## Recent Updates

- Fixed the ATA frozen drive issue by adding multi-method unfreezing and a fallback to block-level zero wipe
- Fixed the "Select All" bug in shredding so it actually populates the selected drives list now
- Added NVMe secure erase with a fallback to user-data erase
- Huge security hardening pass: added server-side drive validation, path traversal fixes, command injection guards, and better root-disk protection
- Added a new multi-sensor temperature monitoring page with server-side config
- Pinned supply chain dependencies and consolidated the versions file into .env
- Assorted other changes from before like the partition editor redesign, kiosk mode, and websocket optimizations

### 2026-10-15 - VLAN (802.1Q) option added to the Network page

- **Network page** now supports a VLAN (802.1Q) sub-interface path: a checkbox reveals the VLAN id input (1-4094) and a live sub-interface preview, the interface select becomes the parent, an optional `Set as default route` checkbox appears when a gateway is set, and VLAN interface cards in each state card show `VLAN <id> on <parent>` with a Remove button. Backend endpoints: `POST /api/network/validate` and `POST /api/network/apply` accept `vlan_id` and `set_default_route`; the new `POST /api/network/vlan/remove` (and `POST /api/network/vlan/remove/validate`) handle removal. `GET /api/network` annotates each interface with `vlan: {id, parent}` and adds a top-level `vlans` list. Apply and VLAN remove share the `NETWORK_APPLY_ENABLED` gate (HTTP 403 first); the validate paths are never gated. The parent interface is never modified by a VLAN apply or remove. **Deployed to the dev machine on 2026-10-15** (API image rebuilt, html live via bind mount). **Verified**: validate and gate behaviour (VLAN 100 on `enp3s0` returns the three commands and the vlans netplan block with the two standard warnings; with `set_default_route` the extra route command and a third warning; vlan_id 0 and 4095 rejected with HTTP 200 valid false; non-numeric vlan_id rejected with HTTP 422; VLAN subnet overlapping `192.168.2.0/24` on `enp3s0` rejected; the non-VLAN validate output is unchanged; apply and vlan/remove return 403 while the flag is off; vlan/remove/validate for a nonexistent device returns an error; the host's interfaces and address `192.168.2.245/24` were unchanged; in a browser the VLAN fields toggle, the preview shows `enp3s0.100`, and id 5000 shows the range hint and disables Validate). **Not verified** (apply was never enabled, so apply, traffic over a VLAN, the 8021q module on the host, rollback of a VLAN apply, and the real `ip -d -j link` output against a VLAN device were not exercised).

### 2026-10-14 - implemented, deployed to the dev machine 2026-10-15; see the change log for what was verified

- Custom drive product images now replace the default graphic instead of overlapping it; unpartitioned drives show a `NO TABLE` badge and "No partitions (unpartitioned / raw)"; a form-factor badge (`U.2`, `U.3` for KIOXIA KCD models, model-prefix heuristic otherwise) is shown when known.
- S.M.A.R.T. module now displays parsed NVMe (including U.2/U.3) health attributes (Critical Warning, Available Spare, Percentage Used, Media and Data Integrity Errors, temperature, power-on hours, etc.) with an `OK` / `WARN` / `FAIL` status.
- Every module (Shredding, S.M.A.R.T., Speed Test, Partition, History, Certificates) now reads the serial through the same lookup as the Overview; NVMe serials no longer report `UNKNOWN`.
- Disk Shredding selection now survives switching between Shredding and Secure Erase; the Confirm Data Destruction modal keeps Datacenter, Server Name, and Inventory ID when toggling Detailed / Simple List; new bulk tools apply Datacenter and Server Name to selected or all drives and let you select drives by server; the initiating user's IP is recorded when a job starts or stops; the Generate Cert (Certificate of Erasure) toggle is now a server-wide setting stored in `app_settings.json`.
- ISO Downloader & Writer appends `.iso` automatically when the filename lacks `.iso` / `.img`; Start Download and Write Image now use the application's standard primary and danger buttons; every download is recorded in the ISO Action History (`iso_history.json`) with the user IP, URL, size, and status.
- History views (Audit Logs & PDFs, Test History, Action History) now share the same columns (`Timestamp | User IP | Drive / Target | Status | Event / Details`); clicking any row opens a detail window showing the exact command the backend executed (entries created before this change show `Command not recorded`) and the output or logs, with a Copy button.
- Each module's sidebar history entry appears only while that module (or its history page) is open.
- Data Management file browser header stays opaque and rows no longer show through it when scrolling.
- Smarter WebSocket updates and fewer re-renders; the temperature page refreshes every 5 s and pauses when the tab is hidden; fewer blur effects overall.
- New Network page reachable from the IP shown in the top bar and by URL `network.html`; no login needed (the application has no login yet); shows interfaces, gateway, DNS; validates a static or DHCP plan and shows the commands and netplan YAML; applying to the running host is disabled by default and only enabled when `NETWORK_APPLY_ENABLED=true` in `.env`; apply has an automatic rollback timer (30-300 s) and a Confirm button; not persistent across reboots - the netplan YAML is provided to place manually.
- First start: the backend entrypoint creates the data folders and JSON files with safe permissions (directories `755`, files `644`, never group or world writable); optional `DATA_UID` and `DATA_GID` environment variables `chown` the data directory.
