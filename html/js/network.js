let netState = null;
let currentMode = 'dhcp';
let dnsEntries = [];
let countdownTimer = null;

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('net-mode-dhcp').addEventListener('click', () => setMode('dhcp'));
    document.getElementById('net-mode-static').addEventListener('click', () => setMode('static'));
    document.getElementById('net-interface-select').addEventListener('change', prefillFromInterface);
    document.getElementById('net-vlan-enabled').addEventListener('change', () => {
        if (document.getElementById('net-vlan-enabled').checked && currentMode !== 'static') setMode('static');
        updateVlanUI();
    });
    document.getElementById('net-vlan-id').addEventListener('input', updateVlanUI);
    document.getElementById('net-gateway').addEventListener('input', updateVlanDefaultVisibility);
    document.getElementById('net-vlan-default-route').addEventListener('change', updateVlanUI);
    document.getElementById('btn-net-dns-add').addEventListener('click', addDnsEntry);
    document.getElementById('net-dns-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); addDnsEntry(); }
    });
    document.getElementById('btn-net-validate').addEventListener('click', validateConfig);
    document.getElementById('btn-net-apply').addEventListener('click', onApplyClick);
    document.getElementById('btn-net-confirm').addEventListener('click', confirmChange);

    renderDnsList();
    setMode('dhcp');
    fetchNetworkState();
    fetchNetworkHistory();
});

function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function setStatus(message, kind, elementId) {
    const el = document.getElementById(elementId || 'net-status');
    if (!el) return;
    el.textContent = message;
    el.className = 'network-status' + (kind ? ' ' + kind : '');
}

async function fetchNetworkState() {
    try {
        const res = await fetch('/api/network');
        const data = await res.json();
        if (data.status !== 'success') {
            setStatus(data.message || 'Failed to load network state.', 'err');
            return;
        }
        netState = data;
        renderState(data);
    } catch (e) {
        console.error('Network state fetch error:', e);
        setStatus('Cannot reach the server. Reload the page once it is reachable.', 'err');
    }
}

function renderState(data) {
    setText('net-hostname', data.hostname || 'Unknown');
    const gw = data.default_gateway;
    setText('net-gateway', gw ? (gw.gateway + ' via ' + gw.dev) : 'None set');
    setText('net-dns', Array.isArray(data.dns) && data.dns.length ? data.dns.join(', ') : 'None set');
    renderInterfaces(data.interfaces || []);
    renderInterfaceSelect(data.interfaces || []);

    const applyBtn = document.getElementById('btn-net-apply');
    const applyNote = document.getElementById('net-apply-note');
    if (data.config_apply_enabled) {
        applyBtn.disabled = false;
        applyNote.textContent = 'Apply changes the live network settings and starts a rollback timer. Nothing is written to disk.';
    } else {
        applyBtn.disabled = true;
        applyNote.textContent = 'Applying changes is disabled on this server (NETWORK_APPLY_ENABLED != \'true\'). Validation still shows the plan; contact the owner to enable apply.';
    }

    const pending = data.pending_change;
    if (pending && pending.state === 'applied' && pending.seconds_left > 0) {
        startCountdown(pending.seconds_left, pending.vlan_device || pending.interface, null);
    }
}

function renderInterfaces(interfaces) {
    const grid = document.getElementById('net-interfaces');
    grid.replaceChildren();
    if (!interfaces.length) {
        const p = document.createElement('p');
        p.className = 'network-muted-note';
        p.textContent = 'No physical interfaces detected.';
        grid.appendChild(p);
        return;
    }
    interfaces.forEach(iface => {
        const card = document.createElement('div');
        card.className = 'network-interface-card';

        const header = document.createElement('div');
        header.className = 'network-if-header';
        const name = document.createElement('span');
        name.className = 'network-if-name';
        name.textContent = iface.name;
        const state = document.createElement('span');
        state.className = 'network-if-state ' + (iface.state === 'UP' ? 'up' : 'down');
        state.textContent = iface.state || 'UNKNOWN';
        header.appendChild(name);
        header.appendChild(state);
        card.appendChild(header);

        card.appendChild(buildIfRow('MAC', iface.mac || 'N/A'));
        card.appendChild(buildIfRow('IPv4', formatAddrs(iface.ipv4)));
        card.appendChild(buildIfRow('IPv6', formatAddrs(iface.ipv6)));
        if (iface.vlan) {
            const vlanLabel = (iface.vlan.id !== null && iface.vlan.id !== undefined ? iface.vlan.id : '?')
                + ' on ' + (iface.vlan.parent || 'unknown parent');
            card.appendChild(buildIfRow('VLAN', vlanLabel));
            card.appendChild(buildVlanRemoveButton(iface.name, iface.vlan));
        }
        grid.appendChild(card);
    });
}

function buildVlanRemoveButton(name, vlan) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'net-vlan-remove';
    btn.textContent = 'Remove';
    if (!netState || !netState.config_apply_enabled) {
        btn.disabled = true;
        btn.title = 'Removing VLAN devices is disabled on this server (NETWORK_APPLY_ENABLED != \'true\'). Validation is still available; contact the owner to enable apply.';
    }
    btn.addEventListener('click', () => onRemoveVlanClick(name, vlan));
    return btn;
}

function onRemoveVlanClick(name, vlan) {
    if (!netState || !netState.config_apply_enabled) return;
    const vlanLabel = 'VLAN ' + (vlan && vlan.id !== null && vlan.id !== undefined ? vlan.id : '?')
        + ' on ' + (vlan && vlan.parent ? vlan.parent : 'unknown parent');
    const message = 'Remove ' + vlanLabel + ' (device ' + name + ')? The VLAN device and its addresses and routes are deleted immediately. The parent interface is not modified.';
    window.customConfirm(message, () => doRemoveVlan(name), 'Remove VLAN Device');
}

async function doRemoveVlan(name) {
    setStatus('Removing ' + name + '...', 'muted');
    try {
        const res = await fetch('/api/network/vlan/remove', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ interface: name, confirm: true })
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            setStatus(extractErrorDetail(err), 'err');
            return;
        }
        const data = await res.json();
        setStatus(data.message || ('Removed ' + name + '.'), 'ok');
        fetchNetworkState();
        fetchNetworkHistory();
    } catch (e) {
        console.error('VLAN remove error:', e);
        setStatus('Network error while removing the VLAN device.', 'err');
    }
}

function formatAddrs(addrs) {
    if (!Array.isArray(addrs) || !addrs.length) return 'none';
    return addrs.map(a => a.address + '/' + a.prefix).join(', ');
}

function buildIfRow(label, value) {
    const row = document.createElement('div');
    row.className = 'network-if-row';
    const lbl = document.createElement('span');
    lbl.className = 'network-if-row-label';
    lbl.textContent = label;
    const val = document.createElement('span');
    val.className = 'network-if-row-value';
    val.textContent = value;
    row.appendChild(lbl);
    row.appendChild(val);
    return row;
}

function renderInterfaceSelect(interfaces) {
    const select = document.getElementById('net-interface-select');
    const previous = select.value;
    select.replaceChildren();
    interfaces.forEach(iface => {
        const option = document.createElement('option');
        option.value = iface.name;
        option.textContent = iface.name;
        select.appendChild(option);
    });
    if (previous && interfaces.some(i => i.name === previous)) {
        select.value = previous;
    }
    if (select.value) prefillFromInterface();
}

function selectedInterface() {
    return document.getElementById('net-interface-select').value || '';
}

function prefillFromInterface() {
    if (!netState) return;
    const iface = (netState.interfaces || []).find(i => i.name === selectedInterface());
    if (!iface) return;
    const firstV4 = (iface.ipv4 || [])[0];
    document.getElementById('net-address').value = firstV4 ? firstV4.address : '';
    document.getElementById('net-prefix').value = firstV4 ? firstV4.prefix : '';
    const gw = netState.default_gateway;
    document.getElementById('net-gateway').value = (gw && gw.dev === iface.name && gw.gateway) ? gw.gateway : '';
    dnsEntries = (netState.dns || []).slice();
    renderDnsList();
    updateVlanUI();
}

function setMode(mode) {
    currentMode = mode;
    document.getElementById('net-mode-dhcp').classList.toggle('active', mode === 'dhcp');
    document.getElementById('net-mode-static').classList.toggle('active', mode === 'static');
    document.getElementById('net-static-fields').style.display = mode === 'static' ? '' : 'none';
    if (mode === 'dhcp') {
        const vlanCheckbox = document.getElementById('net-vlan-enabled');
        if (vlanCheckbox.checked) {
            vlanCheckbox.checked = false;
            updateVlanUI();
        }
    } else {
        updateVlanDefaultVisibility();
    }
}

function readVlanId() {
    const raw = document.getElementById('net-vlan-id').value.trim();
    if (raw === '') return { ok: false, empty: true, id: null };
    const id = Number(raw);
    if (!Number.isInteger(id) || String(id) !== raw || id < 1 || id > 4094) {
        return { ok: false, empty: false, id: null };
    }
    return { ok: true, empty: false, id: id };
}

function currentVlanDeviceName() {
    if (!document.getElementById('net-vlan-enabled').checked) return null;
    const parent = selectedInterface();
    const vlanId = readVlanId();
    if (!parent || !vlanId.ok) return null;
    const name = parent + '.' + vlanId.id;
    return name.length <= 15 ? name : null;
}

function updateVlanUI() {
    const enabled = document.getElementById('net-vlan-enabled').checked;
    document.getElementById('net-vlan-fields').style.display = enabled ? '' : 'none';
    document.getElementById('net-interface-label').textContent = enabled ? 'Interface (parent when VLAN is on)' : 'Interface';
    updateVlanPreview();
    updateVlanDefaultVisibility();
    updateValidateEnabled();
}

function updateVlanPreview() {
    const preview = document.getElementById('net-vlan-device-preview');
    const hint = document.getElementById('net-vlan-hint');
    if (!document.getElementById('net-vlan-enabled').checked) {
        preview.textContent = '--';
        hint.textContent = '';
        return;
    }
    const parent = selectedInterface();
    const vlanId = readVlanId();
    let name = '--';
    let hintText = '';
    if (!parent) {
        hintText = 'Select a parent interface.';
    } else if (vlanId.empty) {
        hintText = 'Enter a VLAN ID (1-4094).';
    } else if (!vlanId.ok) {
        hintText = 'VLAN ID must be an integer between 1 and 4094.';
    } else {
        name = parent + '.' + vlanId.id;
        if (name.length > 15) {
            hintText = 'Sub-interface name ' + name + ' is ' + name.length + ' characters; Linux allows at most 15.';
        }
    }
    preview.textContent = name;
    hint.textContent = hintText;
}

function updateVlanDefaultVisibility() {
    const field = document.getElementById('net-vlan-default-field');
    const checkbox = document.getElementById('net-vlan-default-route');
    const visible = document.getElementById('net-vlan-enabled').checked
        && currentMode === 'static'
        && document.getElementById('net-gateway').value.trim() !== '';
    field.style.display = visible ? '' : 'none';
    if (!visible) checkbox.checked = false;
}

function updateValidateEnabled() {
    const btn = document.getElementById('btn-net-validate');
    if (!document.getElementById('net-vlan-enabled').checked) {
        btn.disabled = false;
        return;
    }
    btn.disabled = currentVlanDeviceName() === null;
}

function addDnsEntry() {
    const input = document.getElementById('net-dns-input');
    const value = input.value.trim();
    if (value && !dnsEntries.includes(value)) {
        dnsEntries.push(value);
        renderDnsList();
    }
    input.value = '';
}

function renderDnsList() {
    const list = document.getElementById('net-dns-list');
    list.replaceChildren();
    if (!dnsEntries.length) {
        const empty = document.createElement('span');
        empty.className = 'net-dns-empty';
        empty.textContent = 'No DNS servers set (current host values are kept).';
        list.appendChild(empty);
        return;
    }
    dnsEntries.forEach((entry, idx) => {
        const pill = document.createElement('span');
        pill.className = 'net-dns-pill';
        pill.textContent = entry + ' ';
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'net-dns-remove';
        remove.textContent = 'x';
        remove.addEventListener('click', () => {
            dnsEntries.splice(idx, 1);
            renderDnsList();
        });
        pill.appendChild(remove);
        list.appendChild(pill);
    });
}

function rollbackSeconds() {
    const value = parseInt(document.getElementById('net-rollback-seconds').value, 10);
    if (isNaN(value)) return 90;
    return Math.min(300, Math.max(30, value));
}

function buildPayload() {
    const payload = {
        interface: selectedInterface(),
        mode: currentMode
    };
    if (currentMode === 'static') {
        const address = document.getElementById('net-address').value.trim();
        const gateway = document.getElementById('net-gateway').value.trim();
        payload.address = address || null;
        payload.prefix = parseInt(document.getElementById('net-prefix').value, 10) || null;
        payload.gateway = gateway || null;
    }
    payload.dns = dnsEntries.slice();
    if (document.getElementById('net-vlan-enabled').checked) {
        const vlanId = readVlanId();
        payload.vlan_id = vlanId.ok ? vlanId.id : null;
        payload.set_default_route = document.getElementById('net-vlan-default-route').checked;
    } else {
        payload.vlan_id = null;
        payload.set_default_route = false;
    }
    return payload;
}

async function validateConfig() {
    setStatus('Validating...', 'muted');
    try {
        const res = await fetch('/api/network/validate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(buildPayload())
        });
        const data = await res.json();
        renderValidation(data);
        setStatus(data.valid ? 'Configuration is valid. Review the plan below before applying.' : 'Validation failed. See the errors below.',
            data.valid ? 'ok' : 'err');
    } catch (e) {
        console.error('Validate error:', e);
        setStatus('Network error while validating.', 'err');
    }
}

function renderValidation(data) {
    document.getElementById('net-plan-group').style.display = '';

    const errorList = document.getElementById('net-validation-errors');
    errorList.replaceChildren();
    (data.errors || []).forEach(error => {
        const item = document.createElement('div');
        item.className = 'network-error-item';
        item.textContent = error;
        errorList.appendChild(item);
    });
    errorList.style.display = (data.errors && data.errors.length) ? '' : 'none';

    const warningList = document.getElementById('net-validation-warnings');
    const warnings = data.warnings || [];
    warningList.replaceChildren();
    warnings.forEach(warning => {
        const item = document.createElement('div');
        item.className = 'network-warning-item';
        item.textContent = warning;
        warningList.appendChild(item);
    });
    warningList.style.display = warnings.length ? '' : 'none';

    const warningEl = document.getElementById('net-validation-warning');
    if (data.warning && !warnings.includes(data.warning)) {
        warningEl.textContent = data.warning;
        warningEl.style.display = '';
    } else {
        warningEl.style.display = 'none';
    }

    const planBlock = document.getElementById('net-plan-block');
    if (data.valid && data.plan) {
        document.getElementById('net-plan-commands').textContent = (data.plan.commands || []).join('\n');
        document.getElementById('net-plan-yaml').textContent = data.plan.netplan_yaml || '';
        planBlock.style.display = '';
    } else {
        planBlock.style.display = 'none';
    }
}

function onApplyClick() {
    if (!netState || !netState.config_apply_enabled) return;
    if (document.getElementById('net-vlan-enabled').checked && currentVlanDeviceName() === null) {
        setStatus('Fix the VLAN settings (VLAN ID 1-4094, sub-interface name at most 15 characters) before applying.', 'err');
        return;
    }
    const seconds = rollbackSeconds();
    const vlanName = currentVlanDeviceName();
    let message;
    if (vlanName) {
        message = 'Apply the VLAN configuration to ' + vlanName + ' (VLAN ' + readVlanId().id + ' on '
            + selectedInterface() + ')? The parent interface is not modified. If you cannot confirm within '
            + seconds + ' seconds, the change is rolled back automatically.';
    } else {
        message = 'Apply new network settings to ' + selectedInterface() + '? The change takes effect immediately and your session may drop. '
            + 'If you cannot reach the new address, the previous settings are restored automatically after ' + seconds + ' seconds.';
    }
    window.customConfirm(message, doApply, 'Apply Network Change');
}

async function doApply() {
    const applyBtn = document.getElementById('btn-net-apply');
    const payload = buildPayload();
    payload.confirm = true;
    payload.rollback_seconds = rollbackSeconds();
    applyBtn.disabled = true;
    applyBtn.textContent = 'Applying...';
    setStatus('Applying...', 'muted');
    try {
        const res = await fetch('/api/network/apply', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            setStatus(extractErrorDetail(err), 'err');
            return;
        }
        const data = await res.json();
        setStatus(data.message || 'Applied.', 'ok');
        startCountdown(data.rollback_seconds || 90, payload.interface, data.new_url);
        fetchNetworkState();
        fetchNetworkHistory();
    } catch (e) {
        console.error('Apply error:', e);
        setStatus('The request did not complete. The server address may have changed: reconnect via the new address and confirm there, otherwise the change rolls back automatically.', 'err');
        startCountdown(payload.rollback_seconds, payload.interface, null);
    } finally {
        applyBtn.disabled = false;
        applyBtn.textContent = 'Apply with rollback';
    }
}

function extractErrorDetail(data) {
    const detail = data && data.detail;
    if (typeof detail === 'string') return detail;
    if (detail && Array.isArray(detail.errors)) return detail.errors.join(' ');
    if (detail) return JSON.stringify(detail);
    return 'Request failed.';
}

function startCountdown(seconds, iface, newUrl) {
    const group = document.getElementById('net-countdown-group');
    group.style.display = '';
    document.getElementById('net-countdown-status').textContent = '';
    const hint = document.getElementById('net-countdown-hint');
    hint.textContent = newUrl
        ? 'If your session dropped, reconnect at ' + newUrl + ' and confirm there.'
        : 'If your session dropped, reconnect via the new address and confirm there.';
    let remaining = seconds;
    setText('net-countdown-seconds', remaining);
    if (countdownTimer) clearInterval(countdownTimer);
    countdownTimer = setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
            remaining = 0;
            stopCountdownTimer();
            onCountdownExpired();
        }
        setText('net-countdown-seconds', remaining);
    }, 1000);
}

function stopCountdownTimer() {
    if (countdownTimer) clearInterval(countdownTimer);
    countdownTimer = null;
}

async function onCountdownExpired() {
    setStatus('Rollback timer expired. Refreshing network state...', 'muted', 'net-countdown-status');
    try {
        await fetchNetworkState();
        fetchNetworkHistory();
        document.getElementById('net-countdown-group').style.display = 'none';
    } catch (e) {
        setStatus('Cannot reach the server at this address. It may have rolled back to the previous address. Reconnect there.', 'err', 'net-countdown-status');
    }
}

async function confirmChange() {
    const btn = document.getElementById('btn-net-confirm');
    btn.disabled = true;
    btn.textContent = 'Confirming...';
    try {
        const res = await fetch('/api/network/confirm', { method: 'POST' });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            setStatus(extractErrorDetail(err), 'err', 'net-countdown-status');
            return;
        }
        const data = await res.json();
        setStatus(data.message || 'New settings confirmed. Rollback cancelled.', 'ok');
        stopCountdownTimer();
        document.getElementById('net-countdown-group').style.display = 'none';
        fetchNetworkState();
        fetchNetworkHistory();
    } catch (e) {
        console.error('Confirm error:', e);
        setStatus('Cannot reach the server. Its address may have changed: reconnect via the new address and confirm there; otherwise the change rolls back automatically.', 'err', 'net-countdown-status');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Confirm new settings';
    }
}

async function fetchNetworkHistory() {
    try {
        const res = await fetch('/api/network/history');
        const data = await res.json();
        if (data.status === 'success') renderHistory(data.history || []);
    } catch (e) {
        console.error('Network history fetch error:', e);
    }
}

function renderHistory(entries) {
    const list = document.getElementById('net-history-list');
    list.replaceChildren();
    if (!entries.length) {
        const empty = document.createElement('span');
        empty.className = 'network-muted-note';
        empty.textContent = 'No network events recorded yet.';
        list.appendChild(empty);
        return;
    }
    entries.slice(0, 15).forEach(entry => {
        const row = document.createElement('div');
        row.className = 'network-history-row';
        const event = document.createElement('span');
        event.className = 'network-history-event';
        event.textContent = (entry.timestamp || '-') + ' - ' + (entry.event || '-') + ' (' + (entry.status || '-') + ')';
        const user = document.createElement('span');
        user.className = 'network-history-user';
        user.textContent = entry.username || '';
        row.appendChild(event);
        row.appendChild(user);
        list.appendChild(row);
    });
}
