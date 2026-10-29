document.addEventListener('DOMContentLoaded', async () => {
    // --- Settings Toggles & Initializers ---
    const pdfToggle = document.getElementById('pdf-report-toggle');
    const debugToggle = document.getElementById('debug-mode-toggle');
    const protectRootToggle = document.getElementById('protect-root-toggle');
    const potatoModeToggle = document.getElementById('potato-mode-toggle');

    // --- Force Fresh Logo Fetch ---
    const logoPreview = document.getElementById('logo-preview-img');
    if (logoPreview) {
        logoPreview.src = '/api/images/logo.png?t=' + new Date().getTime();
        logoPreview.onerror = () => {
            logoPreview.style.display = 'none';
            const noLogoText = document.getElementById('no-logo-text');
            if (noLogoText) noLogoText.style.display = 'block';
        };
        logoPreview.onload = () => {
            logoPreview.style.display = 'block';
            const noLogoText = document.getElementById('no-logo-text');
            if (noLogoText) noLogoText.style.display = 'none';
        }
    }
    
    // --- Timezone Logic ---
    const tzSelect = document.getElementById('timezone-select');
    if (tzSelect) {
        tzSelect.value = localStorage.getItem('dh_timezone') || 'UTC';
        document.getElementById('btn-save-tz').addEventListener('click', (e) => {
            localStorage.setItem('dh_timezone', tzSelect.value);
            e.target.innerText = "Saved!";
            setTimeout(() => e.target.innerText = "Save Timezone", 2000);
        });
    }

    if (localStorage.getItem('disk_hunter_debug') === 'true') debugToggle.checked = true;
    if (localStorage.getItem('potatoMode') === 'true') potatoModeToggle.checked = true;
    
    if (localStorage.getItem('disk_hunter_protect_root') === 'false') {
        protectRootToggle.checked = false;
    }

    pdfToggle.addEventListener('change', async (e) => {
        // localStorage is kept as an offline cache; the server is the source of truth
        localStorage.setItem('disk_hunter_pdf', e.target.checked);
        await savePdfSettingToServer(e.target.checked);
    });
    debugToggle.addEventListener('change', (e) => localStorage.setItem('disk_hunter_debug', e.target.checked));
    protectRootToggle.addEventListener('change', (e) => localStorage.setItem('disk_hunter_protect_root', e.target.checked));

    potatoModeToggle.addEventListener('change', (e) => {
        localStorage.setItem('potatoMode', e.target.checked);
        if (e.target.checked) {
            document.body.classList.add('potato-mode');
        } else {
            document.body.classList.remove('potato-mode');
        }
    });

    // --- Generate Certificate setting (server-side persistence + localStorage cache) ---
    async function savePdfSettingToServer(value, showStatus = true) {
        const status = document.getElementById('pdf-status');
        try {
            const res = await fetch('/api/settings/app', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ generate_pdf: value })
            });
            const data = await res.json();
            if (showStatus && status) {
                status.innerHTML = `<span style="color: ${data.status === 'success' ? 'var(--accent-green)' : 'red'};">${data.message}</span>`;
            }
            return data.status === 'success';
        } catch (e) {
            if (showStatus && status) {
                status.innerHTML = `<span style="color: red;">Network error. Kept as a local cache only.</span>`;
            }
            return false;
        }
    }

    try {
        const res = await fetch('/api/settings/app');
        const data = await res.json();
        if (data.status === 'success' && data.settings) {
            if (!data.settings.generate_pdf_set) {
                // One-time migration: push the cached local value to the server
                const cached = localStorage.getItem('disk_hunter_pdf');
                if (cached !== null) {
                    pdfToggle.checked = cached === 'true';
                    localStorage.setItem('disk_hunter_pdf', pdfToggle.checked);
                    await savePdfSettingToServer(pdfToggle.checked, false);
                } else {
                    pdfToggle.checked = data.settings.generate_pdf === true;
                }
            } else {
                pdfToggle.checked = data.settings.generate_pdf === true;
                localStorage.setItem('disk_hunter_pdf', pdfToggle.checked);
            }
        } else {
            pdfToggle.checked = localStorage.getItem('disk_hunter_pdf') === 'true';
        }
    } catch (e) {
        pdfToggle.checked = localStorage.getItem('disk_hunter_pdf') === 'true';
    }

    // --- Config Export/Import ---
    document.getElementById('btn-export-config').addEventListener('click', () => {
        const config = {
            'disk_hunter_pdf': localStorage.getItem('disk_hunter_pdf') || 'false',
            'disk_hunter_debug': localStorage.getItem('disk_hunter_debug') || 'false',
            'disk_hunter_protect_root': localStorage.getItem('disk_hunter_protect_root') || 'true',
            'dh_timezone': localStorage.getItem('dh_timezone') || 'UTC',
            'dh_comp_name': localStorage.getItem('dh_comp_name') || '',
            'dh_comp_addr': localStorage.getItem('dh_comp_addr') || '',
            'dh_comp_phone': localStorage.getItem('dh_comp_phone') || '',
            'dh_dc_tags': localStorage.getItem('dh_dc_tags') || '["DatacenterX","DatacenterY"]'
        };
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(config, null, 2));
        const dlAnchorElem = document.createElement('a');
        dlAnchorElem.setAttribute("href",     dataStr     );
        dlAnchorElem.setAttribute("download", "disk_hunter_config.json");
        dlAnchorElem.click();
    });

    document.getElementById('btn-import-config').addEventListener('click', () => {
        document.getElementById('import-config-file').click();
    });

    document.getElementById('import-config-file').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const config = JSON.parse(event.target.result);
                for (const [key, value] of Object.entries(config)) {
                    localStorage.setItem(key, value);
                }
                const status = document.getElementById('config-status');
                status.innerHTML = `<span style="color: var(--accent-green);">Config imported successfully. Reloading...</span>`;
                setTimeout(() => location.reload(), 1500);
            } catch (err) {
                document.getElementById('config-status').innerHTML = `<span style="color: red;">Invalid JSON file.</span>`;
            }
        };
        reader.readAsText(file);
    });

    // --- Mock Pipeline Logic ---
    document.getElementById('btn-mock-pipeline').addEventListener('click', async (e) => {
        const status = document.getElementById('mock-pipeline-status');
        e.target.disabled = true;
        e.target.innerText = "Simulating Pipeline...";
        
        try {
            const currentTz = localStorage.getItem('dh_timezone') || 'UTC';
            
            const res = await fetch('/api/settings/mock-pipeline', { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ timezone: currentTz })
            });
            const data = await res.json();
            status.innerHTML = `<span style="color: ${data.status === 'success' ? 'var(--accent-green)' : 'red'};">${data.message}</span>`;
        } catch (err) {
            status.innerHTML = `<span style="color: red;">Network error. Check backend logs.</span>`;
        } finally {
            e.target.disabled = false;
            e.target.innerText = "Trigger Mock Success";
        }
    });

    // --- Branding Logic (server-side persistence + localStorage cache) ---
    const iName = document.getElementById('comp-name');
    const iAddr = document.getElementById('comp-addr');
    const iPhone = document.getElementById('comp-phone');

    // Load branding from the server (source of truth) and cache locally.
    let dcTags = ['DatacenterX', 'DatacenterY'];
    try {
        const res = await fetch('/api/settings/branding');
        const data = await res.json();
        if (data.status === 'success' && data.branding) {
            const b = data.branding;
            iName.value = b.company_name || '';
            iAddr.value = b.company_address || '';
            iPhone.value = b.company_phone || '';
            dcTags = Array.isArray(b.dc_tags) && b.dc_tags.length ? b.dc_tags : ['DatacenterX', 'DatacenterY'];
            // cache to localStorage so other pages (e.g. shredding) read the same values offline
            localStorage.setItem('dh_comp_name', b.company_name || '');
            localStorage.setItem('dh_comp_addr', b.company_address || '');
            localStorage.setItem('dh_comp_phone', b.company_phone || '');
            localStorage.setItem('dh_dc_tags', JSON.stringify(dcTags));
        } else {
            iName.value = localStorage.getItem('dh_comp_name') || '';
            iAddr.value = localStorage.getItem('dh_comp_addr') || '';
            iPhone.value = localStorage.getItem('dh_comp_phone') || '';
            dcTags = JSON.parse(localStorage.getItem('dh_dc_tags')) || ['DatacenterX', 'DatacenterY'];
        }
    } catch (e) {
        iName.value = localStorage.getItem('dh_comp_name') || '';
        iAddr.value = localStorage.getItem('dh_comp_addr') || '';
        iPhone.value = localStorage.getItem('dh_comp_phone') || '';
        dcTags = JSON.parse(localStorage.getItem('dh_dc_tags')) || ['DatacenterX', 'DatacenterY'];
    }

    async function saveBrandingToServer() {
        try {
            await fetch('/api/settings/branding', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    company_name: iName.value,
                    company_address: iAddr.value,
                    company_phone: iPhone.value,
                    dc_tags: dcTags
                })
            });
        } catch (e) {
            console.error('Failed to sync branding to server:', e);
        }
    }

    document.getElementById('btn-save-branding').addEventListener('click', (e) => {
        localStorage.setItem('dh_comp_name', iName.value);
        localStorage.setItem('dh_comp_addr', iAddr.value);
        localStorage.setItem('dh_comp_phone', iPhone.value);
        saveBrandingToServer();
        e.target.innerText = "Saved!";
        setTimeout(() => e.target.innerText = "Save Text Details", 2000);
    });

    document.getElementById('logo-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fileInput = document.getElementById('logo-file').files[0];
        const statusDiv = document.getElementById('logo-status');
        if (!fileInput) return;

        const formData = new FormData();
        formData.append('file', fileInput);

        try {
            const response = await fetch('/api/settings/upload-logo', { method: 'POST', body: formData });
            const result = await response.json();
            statusDiv.innerHTML = `<span style="color: ${result.status==='success'?'var(--accent-green)':'red'};">${result.message}</span>`;
            if (result.status === 'success') {
                if (logoPreview) {
                    logoPreview.src = '/api/images/logo.png?t=' + new Date().getTime();
                    logoPreview.style.display = 'block';
                    const noLogoText = document.getElementById('no-logo-text');
                    if (noLogoText) noLogoText.style.display = 'none';
                }
            }
        } catch (error) {
            statusDiv.innerHTML = `<span style="color: red;">Upload failed.</span>`;
        }
    });

    // --- Datacenter Tags Logic ---
    const tagContainer = document.getElementById('tag-container');
    const tagInput = document.getElementById('new-tag-input');

    function renderTags() {
        tagContainer.innerHTML = '';
        localStorage.setItem('dh_dc_tags', JSON.stringify(dcTags));
        saveBrandingToServer();
        dcTags.forEach(tag => {
            const pill = document.createElement('span');
            pill.innerHTML = `${tag} <span style="color: var(--accent-red); cursor: pointer; font-weight: bold;" onclick="removeTag('${tag}')">×</span>`;
            tagContainer.appendChild(pill);
        });
    }

    window.removeTag = function(tag) {
        dcTags = dcTags.filter(t => t !== tag);
        renderTags();
    }

    document.getElementById('btn-add-tag').addEventListener('click', () => {
        const val = tagInput.value.trim();
        if (val && !dcTags.includes(val)) {
            dcTags.push(val);
            tagInput.value = '';
            renderTags();
        }
    });
    renderTags();

    // --- Temperature Monitoring Settings ---
    const thermalList = document.getElementById('thermal-device-list');
    const collectToggle = document.getElementById('collect-temperature-toggle');
    const btnSaveTemp = document.getElementById('btn-save-temperature');
    const tempStatus = document.getElementById('temperature-status');
    let thermalConfigLoaded = false;

    async function loadTemperatureConfig() {
        if (!thermalList || !collectToggle) return;
        try {
            const res = await fetch('/api/settings/temperature');
            const data = await res.json();
            if (data.status !== 'success') return;
            const cfg = data.config || {};
            const available = data.available || [];
            collectToggle.checked = cfg.collect_temperature !== false;
            const selected = Array.isArray(cfg.thermal_devices) ? cfg.thermal_devices : [];

            if (available.length === 0) {
                thermalList.innerHTML = '<p style="color:var(--text-muted); font-size:13px;">No thermal sensors detected on this machine.</p>';
            } else {
                thermalList.innerHTML = '';
                available.forEach(zone => {
                    const id = `thermal-${zone.id}`;
                    const row = document.createElement('label');
                    row.style.cssText = 'display:flex; align-items:center; gap:8px; cursor:pointer; font-size:13px;';
                    const checked = selected.includes(zone.id) ? 'checked' : '';
                    row.innerHTML = `<input type="checkbox" id="${id}" class="setting-checkbox" value="${zone.id}" ${checked}> <span><strong>${zone.name}</strong> <code style="color:var(--text-muted);">${zone.id}</code> — <span style="color:var(--accent-blue);">${zone.temp !== null && zone.temp !== undefined ? zone.temp + '°C' : 'N/A'}</span></span>`;
                    thermalList.appendChild(row);
                });
            }
            thermalConfigLoaded = true;
        } catch (e) {
            console.error('Failed to load temperature config:', e);
        }
    }

    if (btnSaveTemp) {
        btnSaveTemp.addEventListener('click', async () => {
            if (!thermalConfigLoaded) return;
            const checked = Array.from(thermalList.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
            const collect = collectToggle.checked;
            btnSaveTemp.disabled = true;
            btnSaveTemp.innerText = 'Saving...';
            try {
                const res = await fetch('/api/settings/temperature', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ collect_temperature: collect, thermal_devices: checked })
                });
                const data = await res.json();
                tempStatus.innerHTML = `<span style="color: ${data.status === 'success' ? 'var(--accent-green)' : 'red'};">${data.message}</span>`;
            } catch (e) {
                tempStatus.innerHTML = `<span style="color: red;">Network error.</span>`;
            } finally {
                btnSaveTemp.disabled = false;
                btnSaveTemp.innerText = 'Save Temperature Settings';
            }
        });
    }
    loadTemperatureConfig();

    // --- System Time Logic ---
    const timeDisplay = document.getElementById('system-time-display');
    const timeNtp = document.getElementById('system-time-ntp');
    const timeInput = document.getElementById('system-time-input');
    const btnSetTime = document.getElementById('btn-set-system-time');
    const btnSyncNtp = document.getElementById('btn-sync-ntp');
    const timeStatus = document.getElementById('system-time-status');

    async function loadSystemTime() {
        if (!timeDisplay) return;
        try {
            const res = await fetch('/api/system/time');
            const data = await res.json();
            if (data.status === 'success') {
                timeDisplay.textContent = data.local + ' (' + data.timezone + ')';
                timeNtp.textContent = 'NTP: ' + (data.ntp_status || 'unknown');
                if (timeInput) {
                    // datetime-local expects YYYY-MM-DDTHH:MM
                    timeInput.value = data.iso ? data.iso.substring(0, 16) : '';
                }
            } else {
                timeDisplay.textContent = 'Unavailable';
            }
        } catch (e) {
            timeDisplay.textContent = 'Unavailable';
        }
    }

    if (btnSetTime) {
        btnSetTime.addEventListener('click', async () => {
            if (!timeInput.value) return;
            timeStatus.innerHTML = '<span style="color:var(--text-muted)">Setting...</span>';
            try {
                const res = await fetch('/api/system/time', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ datetime: timeInput.value })
                });
                const data = await res.json();
                timeStatus.innerHTML = `<span style="color: ${data.status === 'success' ? 'var(--accent-green)' : 'red'};">${data.message}</span>`;
                if (data.status === 'success') loadSystemTime();
            } catch (e) {
                timeStatus.innerHTML = '<span style="color:red;">Network error.</span>';
            }
        });
    }

    if (btnSyncNtp) {
        btnSyncNtp.addEventListener('click', async () => {
            timeStatus.innerHTML = '<span style="color:var(--text-muted)">Syncing...</span>';
            try {
                const res = await fetch('/api/system/time/ntp-sync', { method: 'POST' });
                const data = await res.json();
                timeStatus.innerHTML = `<span style="color: ${data.status === 'success' ? 'var(--accent-green)' : 'red'};">${data.message}</span>`;
                if (data.status === 'success') loadSystemTime();
            } catch (e) {
                timeStatus.innerHTML = '<span style="color:red;">Network error.</span>';
            }
        });
    }
    loadSystemTime();

    // --- Inventory ID Manager ---
    function invEscapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = String(text == null ? '' : text);
        return div.innerHTML;
    }
    function invEscapeAttr(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    const btnOpenInventoryManager = document.getElementById('btn-open-inventory-manager');
    if (btnOpenInventoryManager) {
        // Late-bound: window.openInventoryManager is assigned further below
        // in this same callback, so resolve it at click time.
        btnOpenInventoryManager.addEventListener('click', () => window.openInventoryManager());
    }
    const invRows = document.getElementById('inventory-rows');
    const invAddSerial = document.getElementById('inv-add-serial');
    const invAddId = document.getElementById('inv-add-id');
    const invManagerStatus = document.getElementById('inventory-manager-status');

    function setInvStatus(msg, ok) {
        if (!invManagerStatus) return;
        invManagerStatus.innerHTML = '<span style="color: ' + (ok ? 'var(--accent-green)' : 'var(--accent-red)') + ';">' + invEscapeHtml(msg) + '</span>';
    }

    async function fetchInventory() {
        try {
            const res = await fetch('/api/inventory');
            const data = await res.json();
            if (data.status === 'success') return data.inventory || {};
        } catch (e) { /* fall through */ }
        return null;
    }

    async function refreshInventoryManager() {
        if (!invRows) return;
        invRows.innerHTML = '<p class="inv-empty">' + invEscapeHtml(window.translate('inv_loading', 'Loading mappings...')) + '</p>';
        const inventory = await fetchInventory();
        if (inventory === null) {
            invRows.innerHTML = '<p class="inv-empty" style="color: var(--accent-red);">' + invEscapeHtml(window.translate('inv_load_failed', 'Failed to load mappings.')) + '</p>';
            return;
        }
        const entries = Object.entries(inventory);
        if (entries.length === 0) {
            invRows.innerHTML = '<p class="inv-empty">' + invEscapeHtml(window.translate('inv_empty', 'No inventory mappings saved.')) + '</p>';
            return;
        }
        invRows.innerHTML = '';
        entries.forEach(([serial, id]) => {
            const row = document.createElement('div');
            row.className = 'inv-row';
            row.innerHTML =
                '<span class="inv-serial" title="' + invEscapeAttr(serial) + '">' + invEscapeHtml(serial) + '</span>' +
                '<input type="text" class="settings-input inv-id-input" value="' + invEscapeAttr(id) + '" data-serial="' + invEscapeAttr(serial) + '">' +
                '<button class="btn-action btn-sm inv-row-save" data-serial="' + invEscapeAttr(serial) + '">' + invEscapeHtml(window.translate('inv_save', 'Save')) + '</button>' +
                '<button class="btn-action btn-sm btn-accent-red inv-row-delete" data-serial="' + invEscapeAttr(serial) + '">' + invEscapeHtml(window.translate('inv_remove', 'Remove')) + '</button>';
            invRows.appendChild(row);
        });
    }

    window.openInventoryManager = function() {
        const modal = document.getElementById('inventory-manager-modal');
        if (modal) modal.classList.add('active');
        refreshInventoryManager();
    };

    window.closeInventoryManager = function() {
        const modal = document.getElementById('inventory-manager-modal');
        if (modal) modal.classList.remove('active');
        if (invManagerStatus) invManagerStatus.innerHTML = '';
    };

    // Delegated row actions: save an inline edit, remove a mapping
    if (invRows) {
        invRows.addEventListener('click', (e) => {
            const saveBtn = e.target.closest('.inv-row-save');
            if (saveBtn) {
                const input = saveBtn.closest('.inv-row').querySelector('.inv-id-input');
                const serial = saveBtn.dataset.serial;
                const id = input ? input.value.trim() : '';
                if (!id) {
                    setInvStatus(window.translate('inv_both_required', 'Inventory ID is required.'), false);
                    return;
                }
                window.saveInventoryMapping(serial, id).then((ok) => {
                    setInvStatus(ok ? window.translate('inv_saved', 'Inventory ID saved.') : window.translate('inv_save_failed', 'Failed to save Inventory ID.'), ok);
                    if (ok) refreshInventoryManager();
                });
                return;
            }
            const delBtn = e.target.closest('.inv-row-delete');
            if (delBtn) {
                const serial = delBtn.dataset.serial;
                customConfirm(
                    window.translate('inv_delete_confirm', 'Remove the Inventory ID mapping for this serial?'),
                    async () => {
                        try {
                            const res = await fetch('/api/inventory?serial=' + encodeURIComponent(serial), { method: 'DELETE' });
                            const data = await res.json();
                            setInvStatus(data.message || (data.status === 'success' ? window.translate('inv_removed', 'Mapping removed.') : 'Failed'), data.status === 'success');
                            if (data.status === 'success') refreshInventoryManager();
                        } catch (err) {
                            setInvStatus(window.translate('inv_network', 'Network error.'), false);
                        }
                    },
                    window.translate('inv_delete_title', 'Remove Mapping')
                );
            }
        });
        // Enter in an inline edit saves it
        invRows.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' || !e.target.classList.contains('inv-id-input')) return;
            e.preventDefault();
            const row = e.target.closest('.inv-row');
            const saveBtn = row && row.querySelector('.inv-row-save');
            if (saveBtn) saveBtn.click();
        });
    }

    // Re-render the open manager when the language changes so the row
    // buttons (rendered with translate() at build time) follow the switch
    document.addEventListener('dh-language-changed', () => {
        const modal = document.getElementById('inventory-manager-modal');
        if (modal && modal.classList.contains('active')) refreshInventoryManager();
    });

    // Add a new mapping
    const btnInvAdd = document.getElementById('btn-inv-add');
    if (btnInvAdd) {
        btnInvAdd.addEventListener('click', () => {
            const serial = invAddSerial ? invAddSerial.value.trim() : '';
            const id = invAddId ? invAddId.value.trim() : '';
            if (!serial || !id) {
                setInvStatus(window.translate('inv_both_required', 'Serial and Inventory ID are both required.'), false);
                return;
            }
            window.saveInventoryMapping(serial, id).then((ok) => {
                setInvStatus(ok ? window.translate('inv_saved', 'Inventory ID saved.') : window.translate('inv_save_failed', 'Failed to save Inventory ID.'), ok);
                if (ok) {
                    if (invAddSerial) invAddSerial.value = '';
                    if (invAddId) invAddId.value = '';
                    refreshInventoryManager();
                }
            });
        });
    }

    // --- Drive Manager Modal Logic ---
    const btnOpenDriveManager = document.getElementById('btn-open-drive-manager');
    if (btnOpenDriveManager) {
        btnOpenDriveManager.addEventListener('click', openDriveManager);
    }
});

let selectedPoolImage = null;

window.openDriveManager = function() {
    document.getElementById('drive-manager-modal').classList.add('active');
    loadDriveModels();
    loadPoolImages();
};

window.closeDriveManager = function() {
    document.getElementById('drive-manager-modal').classList.remove('active');
};

async function loadDriveModels() {
    const listDiv = document.getElementById('drive-models-list');
    listDiv.innerHTML = 'Loading...';
    try {
        const data = await window.diskService.getDisks();

        if (data.status !== 'success' || !data.disks || data.disks.length === 0) {
            listDiv.innerHTML = '<p style="color:var(--text-muted); font-size:13px;">No drives found on system.</p>';
            return;
        }

        const uniqueModels = Array.from(new Set(data.disks.map(disk => {
            const rawVendor = disk.vendor ? disk.vendor.trim() + ' ' : '';
            const rawModel = disk.model ? disk.model.trim() : 'Unknown';
            return rawVendor + rawModel;
        })));

        listDiv.innerHTML = '';
        uniqueModels.forEach(modelName => {
            const disk = data.disks.find(d => {
                const rawVendor = d.vendor ? d.vendor.trim() + ' ' : '';
                const rawModel = d.model ? d.model.trim() : 'Unknown';
                return (rawVendor + rawModel) === modelName;
            });
            const normalizedId = modelName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
            const item = document.createElement('div');
            item.className = 'drive-item';
            
            const queryParams = disk ? `?name=${disk.name}&tran=${disk.tran || ''}&rota=${disk.rota !== undefined ? disk.rota : ''}&model=${disk.model || ''}&t=${Date.now()}` : `?t=${Date.now()}`;
            
            item.innerHTML = `
                <div class="drive-item-info">
                    <img src="/api/images/drives/${normalizedId}.jpg${queryParams}" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' viewBox=\\'0 0 100 100\\'%3E%3Crect width=\\'100\\' height=\\'100\\' fill=\\'%23334155\\'/%3E%3C/svg%3E';">
                    <span class="drive-item-name">${modelName}</span>
                </div>
                <div class="drive-item-actions">
                    <button class="btn-assign" onclick="assignSelectedImage('${normalizedId}', this)">Assign Selected</button>
                    <button class="btn-assign btn-delete" onclick="deleteDriveImage('${normalizedId}', this)" title="Remove assigned image">Delete</button>
                </div>
            `;
            listDiv.appendChild(item);
        });
    } catch (error) {
        listDiv.innerHTML = '<span style="color:red;">Error loading drive models.</span>';
    }
}

window.deleteDriveImage = async function(normalizedId, btnElement) {
    customConfirm(`Remove the assigned image for ${normalizedId}? The default drive graphic will be shown instead.`, async () => {
        const originalText = btnElement.innerText;
        btnElement.innerText = "Deleting...";
        btnElement.disabled = true;
        try {
            const res = await fetch(`/api/images/drives/${encodeURIComponent(normalizedId)}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.status === 'success') {
                btnElement.innerText = "Deleted!";
                const imgEl = btnElement.closest('.drive-item').querySelector('img');
                if (imgEl) {
                    imgEl.src = `/api/images/drives/${normalizedId}.jpg?t=${Date.now()}`;
                }
                setTimeout(() => { btnElement.innerText = originalText; btnElement.disabled = false; }, 2000);
            } else {
                customAlert(data.message || "Failed to delete.");
                btnElement.innerText = originalText;
                btnElement.disabled = false;
            }
        } catch (err) {
            customAlert("Network error.");
            btnElement.innerText = originalText;
            btnElement.disabled = false;
        }
    });
};

async function loadPoolImages() {
    const grid = document.getElementById('image-pool-grid');
    grid.innerHTML = 'Loading...';
    selectedPoolImage = null;
    try {
        const res = await fetch('/api/images/pool');
        const data = await res.json();
        
        grid.innerHTML = '';
        if (!data.images || data.images.length === 0) {
            grid.innerHTML = '<p style="grid-column: 1/-1; color:var(--text-muted); font-size:13px; text-align:center;">Pool is empty.</p>';
            return;
        }

        const seen = new Set();
        data.images.forEach(filename => {
            if (seen.has(filename)) return;
            seen.add(filename);
            const wrapper = document.createElement('div');
            wrapper.className = 'pool-image-wrapper';
            wrapper.onclick = (e) => {
                if (e.target.closest('.pool-image-delete')) return;
                selectPoolImage(wrapper, filename);
            };
            
            const img = document.createElement('img');
            img.src = `/api/images/pool/${filename}?t=${Date.now()}`;
            img.className = 'pool-image';
            img.title = filename;
            
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'pool-image-delete';
            deleteBtn.innerHTML = '×';
            deleteBtn.title = 'Delete image from pool';
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                deletePoolImage(filename, wrapper);
            };
            
            wrapper.appendChild(img);
            wrapper.appendChild(deleteBtn);
            grid.appendChild(wrapper);
        });
    } catch (err) {
        grid.innerHTML = '<span style="color:red;">Error loading pool images.</span>';
    }
}

async function deletePoolImage(filename, wrapper) {
    customConfirm(`Delete ${filename} from the image pool?`, async () => {
        try {
            const res = await fetch(`/api/images/pool/${encodeURIComponent(filename)}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.status === 'success') {
                wrapper.remove();
                if (selectedPoolImage === filename) selectedPoolImage = null;
                if (document.querySelectorAll('.pool-image-wrapper').length === 0) {
                    document.getElementById('image-pool-grid').innerHTML = '<p style="grid-column: 1/-1; color:var(--text-muted); font-size:13px; text-align:center;">Pool is empty.</p>';
                }
            } else {
                customAlert(data.message || "Failed to delete.");
            }
        } catch (err) {
            customAlert("Network error.");
        }
    });
}

function selectPoolImage(wrapper, filename) {
    document.querySelectorAll('.pool-image-wrapper').forEach(w => w.classList.remove('selected'));
    wrapper.classList.add('selected');
    selectedPoolImage = filename;
}

window.assignSelectedImage = async function(normalizedId, btnElement) {
    if (!selectedPoolImage) {
        customAlert("Please select an image from the pool first.");
        return;
    }
    
    const originalText = btnElement.innerText;
    btnElement.innerText = "Assigning...";
    btnElement.disabled = true;
    
    const formData = new FormData();
    formData.append('drive_id', normalizedId);
    formData.append('pool_filename', selectedPoolImage);
    
    try {
        const res = await fetch('/api/images/assign', { method: 'POST', body: formData });
        const data = await res.json();
        if (data.status === 'success') {
            btnElement.innerText = "Assigned!";
            // Force reload the image next to it
            const imgEl = btnElement.previousElementSibling.querySelector('img');
            if (imgEl) {
                try {
                    const urlObj = new URL(imgEl.src, window.location.origin);
                    urlObj.searchParams.set('t', new Date().getTime());
                    imgEl.src = urlObj.pathname + urlObj.search;
                } catch (e) {
                    imgEl.src = `/api/images/drives/${normalizedId}.jpg?t=${new Date().getTime()}`;
                }
            }
            setTimeout(() => { btnElement.innerText = originalText; btnElement.disabled = false; }, 2000);
        } else {
            customAlert(data.message || "Failed to assign.");
            btnElement.innerText = originalText;
            btnElement.disabled = false;
        }
    } catch (err) {
        customAlert("Network error.");
        btnElement.innerText = originalText;
        btnElement.disabled = false;
    }
}

// Mass upload drag & drop
const dropzone = document.getElementById('dropzone');
const uploadInput = document.getElementById('mass-upload-input');
const uploadStatus = document.getElementById('mass-upload-status');

if (dropzone && uploadInput) {
    dropzone.addEventListener('click', () => uploadInput.click());
    
    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
    });
    
    dropzone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
    });
    
    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        if (e.dataTransfer.files.length) {
            handleMassUpload(e.dataTransfer.files);
        }
    });
    
    uploadInput.addEventListener('change', (e) => {
        if (e.target.files.length) {
            handleMassUpload(e.target.files);
        }
    });
}

async function handleMassUpload(files) {
    const formData = new FormData();
    let validCount = 0;
    
    for (let i = 0; i < files.length; i++) {
        if (files[i].type.startsWith('image/')) {
            formData.append('files', files[i]);
            validCount++;
        }
    }
    
    if (validCount === 0) {
        uploadStatus.innerHTML = '<span style="color:red;">No valid image files selected.</span>';
        return;
    }
    
    uploadStatus.innerHTML = '<span style="color:var(--text-muted);">Uploading...</span>';
    
    try {
        const res = await fetch('/api/images/pool/upload', { method: 'POST', body: formData });
        const data = await res.json();
        
        if (data.status === 'success') {
            uploadStatus.innerHTML = '<span style="color:var(--accent-green);">Upload successful!</span>';
            loadPoolImages();
        } else {
            uploadStatus.innerHTML = `<span style="color:red;">${data.message || 'Upload failed.'}</span>`;
        }
    } catch (err) {
        uploadStatus.innerHTML = '<span style="color:red;">Network error during upload.</span>';
    }
    
    // reset input
    uploadInput.value = '';
}
