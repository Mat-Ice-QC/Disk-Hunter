/* html/js/shredding.js */

let selectedDrives = [];
let availableDisksData = [];
let refreshInterval;
let previousDiskStateHash = ""; 
let activeShredTab = 'standard';
let selectedMethod = 'dodshort';
let modalMeta = {};
let generatePdfSetting = localStorage.getItem('disk_hunter_pdf') === 'true';
let shredNoticeTimer = null;

// Generate Cert setting lives on the server; localStorage is an offline cache only
function loadGeneratePdfSetting() {
    fetch('/api/settings/app')
        .then(res => res.json())
        .then(data => {
            if (data.status !== 'success' || !data.settings) return;
            if (!data.settings.generate_pdf_set) {
                // One-time migration: push the cached local value to the server
                const cached = localStorage.getItem('disk_hunter_pdf');
                if (cached !== null) {
                    generatePdfSetting = cached === 'true';
                    fetch('/api/settings/app', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ generate_pdf: generatePdfSetting })
                    }).catch(() => {});
                    return;
                }
            }
            generatePdfSetting = data.settings.generate_pdf === true;
            localStorage.setItem('disk_hunter_pdf', generatePdfSetting);
        })
        .catch(() => {
            // Offline fallback: keep the localStorage cache value
        });
}
loadGeneratePdfSetting();

document.addEventListener('dh-language-changed', () => {
    window.applyLocalization();
    updateShredConfigUI();
    if (currentDisks && currentWipeStatus) {
        updateShreddingUI();
    }
});

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-initiate-wipe').addEventListener('click', showConfirmationModal);
    document.getElementById('btn-cancel').addEventListener('click', hideModal);
    document.getElementById('btn-confirm').addEventListener('click', executeWipe);

    document.getElementById('btn-view-detailed').addEventListener('click', () => switchModalView('detailed'));
    document.getElementById('btn-view-simple').addEventListener('click', () => switchModalView('simple'));

    // Tab switching event listeners
    const tabButtons = document.querySelectorAll('.shred-ui-tab');
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.getAttribute('data-shred-tab');
            if (activeShredTab === targetTab) return;

            selectedMethod = targetTab === 'nvme' ? 'nvme-user' : 'dodshort';
            const container = document.getElementById('wipe-method-list');
            if (container) { container.dataset.hash = ''; }
            
            tabButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            activeShredTab = targetTab;

            // Keep the selection, dropping only drives not eligible for the new mode
            const dropped = pruneSelectedDrivesForTab(targetTab);
            if (dropped.length > 0) {
                const modeName = window.translate(
                    targetTab === 'nvme' ? 'shred_tab_nvme' : 'shred_tab_standard',
                    targetTab === 'nvme' ? 'NVMe Secure Erase' : 'Block-Level'
                );
                showShredNotice(`Dropped ${dropped.length} drive${dropped.length > 1 ? 's' : ''} not eligible for ${modeName}: ${dropped.join(', ')}`);
            }

            // Update UI config box elements
            updateShredConfigUI();
            
            // Redraw available drives
            if (currentDisks && currentWipeStatus) {
                updateShreddingUI();
            }

            // Keep visible cards and checkboxes in sync with the kept selection
            syncDriveCardSelections();
        });
    });

    window.applyLocalization();
    updateShredConfigUI();

    // Show/hide API Debug Console based on settings
    const isDebug = localStorage.getItem('disk_hunter_debug') === 'true';
    const debugConsole = document.getElementById('debug-console');
    if (debugConsole) {
        if (isDebug) {
            debugConsole.style.display = 'flex';
            const debugOutput = document.getElementById('debug-output');
            if (debugOutput) {
                debugOutput.innerHTML = `<span style="color: #3b82f6;">[System]</span> Diagnostic terminal active. Awaiting execution...<br>`;
            }
        } else {
            debugConsole.style.display = 'none';
        }
    }
});

let currentDisks = null;
let currentWipeStatus = null;

document.addEventListener('ws-disks', (e) => {
    currentDisks = e.detail;
    updateShreddingUI();
});

document.addEventListener('ws-wipe_status', (e) => {
    currentWipeStatus = e.detail;
    updateShreddingUI();
});

function formatBytes(bytes, decimals = 1) {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

function isDriveEligibleForTab(disk, tab) {
    if (tab !== 'nvme') return true;
    const tran = (disk.tran || '').toLowerCase();
    const name = (disk.name || '').toLowerCase();
    return tran === 'nvme' || name.includes('nvme');
}

function pruneSelectedDrivesForTab(tab) {
    const dropped = [];
    selectedDrives = selectedDrives.filter(path => {
        const disk = availableDisksData.find(d => d.path === path);
        if (disk && !isDriveEligibleForTab(disk, tab)) {
            dropped.push(path);
            return false;
        }
        return true;
    });
    return dropped;
}

function syncDriveCardSelections() {
    document.querySelectorAll('#shred-list-container .drive-card').forEach(card => {
        const checkbox = card.querySelector('.drive-checkbox');
        if (!checkbox) return;
        const isSelected = selectedDrives.includes(checkbox.value);
        checkbox.checked = isSelected;
        card.classList.toggle('selected', isSelected);
    });
    if (typeof updateSelectionCount === 'function') updateSelectionCount('shred-list-container');
}

function showShredNotice(msg) {
    const el = document.getElementById('shred-status-notice');
    if (!el) {
        customAlert(msg);
        return;
    }
    el.innerText = msg;
    el.style.display = 'block';
    if (shredNoticeTimer) clearTimeout(shredNoticeTimer);
    shredNoticeTimer = setTimeout(() => { el.style.display = 'none'; }, 6000);
}

function updateShredConfigUI() {
    const container = document.getElementById('wipe-method-list');
    const verifyWrapper = document.getElementById('verification-wrapper');
    if (!container) return;

    let availableMethods = [];

    if (activeShredTab === 'nvme') {
        if (verifyWrapper) verifyWrapper.style.display = 'none';
        availableMethods = [
            { val: 'nvme-user', i18n: 'method_nvme_user', label: 'NVMe Secure Erase (User Data Format)' },
            { val: 'nvme-crypto', i18n: 'method_nvme_crypto', label: 'NVMe Secure Erase (Cryptographic Format)' }
        ];
    } else {
        if (verifyWrapper) verifyWrapper.style.display = 'block';
        availableMethods = [
            { val: 'zero', i18n: 'method_zero', label: 'Fill With Zeros (1 Pass)' },
            { val: 'dodshort', i18n: 'method_dodshort', label: 'DoD Short 5220.22-M (3 Passes)' },
            { val: 'dod522022m', i18n: 'method_dod522022m', label: 'DoD Full 5220.22-M (7 Passes)' },
            { val: 'gutmann', i18n: 'method_gutmann', label: 'Gutmann Wipe (35 Passes)' },
            { val: 'ops2', i18n: 'method_ops2', label: 'RCMP TSSIT OPS-II (7 Passes)' },
            { val: 'is5enh', i18n: 'method_is5enh', label: 'HMG IS5 Enhanced (3 Passes)' },
            { val: 'schneier', i18n: 'method_schneier', label: 'Schneier Wipe (7 Passes)' },
            { val: 'prng', i18n: 'method_prng', label: 'PRNG Stream (Random Pass)' }
        ];

        const allSelectedAreSata = selectedDrives.length > 0 && selectedDrives.every(path => {
            const disk = availableDisksData.find(d => d.path === path);
            if (!disk) return false;
            const tran = (disk.tran || '').toLowerCase();
            const name = (disk.name || '').toLowerCase();
            return tran === 'sata' || name.startsWith('sd');
        });

        if (allSelectedAreSata) {
            availableMethods.push(
                { val: 'ata-secure', i18n: 'method_ata_secure', label: 'ATA Secure Erase (User Data Format)' },
                { val: 'ata-enhanced', i18n: 'method_ata_enhanced', label: 'ATA Enhanced Secure Erase (Cryptographic Format)' }
            );
        }
    }

    const validVals = availableMethods.map(m => m.val);
    if (!validVals.includes(selectedMethod)) {
        selectedMethod = activeShredTab === 'nvme' ? 'nvme-user' : 'dodshort';
    }

    const currentHash = availableMethods.map(m => m.val).join(',');
    if (container.dataset.hash === currentHash) return;
    container.dataset.hash = currentHash;
    container.innerHTML = '';

    availableMethods.forEach(m => {
        const label = document.createElement('label');
        label.className = 'wipe-method-item' + (m.val === selectedMethod ? ' selected' : '');

        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'wipe-method';
        radio.value = m.val;
        radio.checked = (m.val === selectedMethod);

        radio.addEventListener('change', () => {
            selectedMethod = m.val;
            container.querySelectorAll('.wipe-method-item').forEach(el => el.classList.remove('selected'));
            label.classList.add('selected');
        });

        const text = document.createElement('span');
        text.setAttribute('data-i18n', m.i18n);
        text.innerText = window.translate(m.i18n, m.label);

        label.appendChild(radio);
        label.appendChild(text);
        container.appendChild(label);
    });
}

function updateShreddingUI() {
    if (!currentDisks || !currentWipeStatus) return;
    
    const diskData = currentDisks;
    const statusData = currentWipeStatus;

    if (diskData.status !== 'success') {
        document.getElementById('shred-list-container').innerHTML = `<p style="color: red;">Error: ${diskData.message}</p>`;
        return;
    }

    const protectRoot = localStorage.getItem('disk_hunter_protect_root') !== 'false';
    let filteredDisks = diskData.disks.filter(d => !(protectRoot && d.is_root));

    // If active tab is NVMe secure erase, filter to only show NVMe drives
    if (activeShredTab === 'nvme') {
        filteredDisks = filteredDisks.filter(d => {
            const tran = (d.tran || '').toLowerCase();
            const name = (d.name || '').toLowerCase();
            return tran === 'nvme' || name.includes('nvme');
        });
    }

    const wipingJobs = statusData.wiping || [];
    availableDisksData = filteredDisks;

    // Check if selected value matches any removed NVMe items after state mutation
    updateShredConfigUI();

    const currentStateHash = filteredDisks.map(d => {
        const isWiping = wipingJobs.some(job => job.drive === d.name);
        return `${d.path}:${isWiping}`;
    }).join('|');

    if (currentStateHash !== previousDiskStateHash) {
        rebuildUI(filteredDisks, wipingJobs);
        previousDiskStateHash = currentStateHash;
    } else {
        updateLiveLogs(wipingJobs);
    }
}

function updateLiveLogs(wipingJobs) {
    wipingJobs.forEach(job => {
        const logElement = document.getElementById(`log-${job.drive}`);
        if (logElement) {
            logElement.innerText = `> ${job.log}`;
            logElement.title = job.log;
        }
    });
}

function rebuildUI(disks, wipingJobs) {
    const availContainer = document.getElementById('shred-list-container');
    const activeContainer = document.getElementById('active-list-container');
    const activeSection = document.getElementById('active-wipes-section');

    availContainer.innerHTML = ''; 
    activeContainer.innerHTML = '';

    let activeCount = 0;
    let availableCount = 0;

    disks.forEach(disk => {
        const diskSize = parseInt(disk.size);
        const rawVendor = disk.vendor ? disk.vendor.trim() + ' ' : '';
        const rawModel = disk.model ? disk.model.trim() : 'Unknown';
        const fullName = rawVendor + rawModel;
        const normalizedId = fullName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
        const serial = disk.serial ? disk.serial.trim() : 'N/A';
        const driveName = disk.name; 
        
        const imageUrl = `/api/images/drives/${normalizedId}.jpg?name=${disk.name}&tran=${disk.tran || ''}&rota=${disk.rota !== undefined ? disk.rota : ''}&model=${disk.model || ''}`;
        const fallbackSVG = `data:image/svg+xml;charset=UTF-8,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300" style="background:%231e293b; border-radius: 4px;"%3E%3Ctext fill="%2394a3b8" x="50%25" y="50%25" font-family="sans-serif" font-weight="bold" font-size="30" text-anchor="middle" dominant-baseline="middle"%3EDRIVE%3C/text%3E%3C/svg%3E`;
        
        const card = document.createElement('div');
        card.dataset.path = disk.path; 

        const activeJob = wipingJobs.find(job => job.drive === driveName);

        if (activeJob) {
            card.className = 'drive-card wiping-card';
            card.innerHTML = `
                <div class="drive-header" style="justify-content: space-between; width: 100%;">
                    <div style="display: flex; gap: 20px;">
                        <div class="drive-image" style="width: 100px;">
                            <img src="${imageUrl}" onerror="this.onerror=null; this.src='${fallbackSVG}';" alt="Drive Image">
                        </div>
                        <div class="drive-info">
                            <h3 style="font-size: 18px; color: var(--accent-red); margin-bottom: 5px;">${fullName} <span class="badge" style="background: var(--accent-red); color: white; margin-left: 10px;">${window.translate('wiping', 'Wiping').toUpperCase()}</span></h3>
                            <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 8px;">
                                <strong>${window.translate('path', 'Path')}:</strong> ${disk.path} | <strong>${window.translate('size', 'Size')}:</strong> ${formatBytes(diskSize)} | <strong>S/N:</strong> ${serial}
                            </p>
                            <div id="log-${driveName}" style="background: #000; color: #10b981; font-family: monospace; font-size: 12px; padding: 8px 10px; border-radius: 4px; width: 100%; max-width: 550px; white-space: pre-wrap; word-break: break-word; border: 1px solid #334155; line-height: 1.4; margin-top: 8px;" title="${activeJob.log.replace(/"/g, '&quot;')}"></div>
                        </div>
                    </div>
                    <div style="padding-left: 15px;">
                        <button onclick="stopWipeJob('${activeJob.container}')" style="background: transparent; color: var(--accent-red); border: 1px solid var(--accent-red); padding: 8px 15px; border-radius: 6px; cursor: pointer; font-weight: bold; transition: 0.2s;" onmouseover="this.style.background='rgba(239, 68, 68, 0.1)'" onmouseout="this.style.background='transparent'">${window.translate('stop_wipe', 'Stop Wipe')}</button>
                    </div>
                </div>
            `;
            activeContainer.appendChild(card);
            activeCount++;
        } else {
            card.className = 'drive-card';
            const isChecked = selectedDrives.includes(disk.path) ? 'checked' : '';
            if (isChecked) card.classList.add('selected');

            card.innerHTML = `
                <div class="drive-header" style="cursor: pointer;">
                    <div style="padding-right: 10px; display: flex; align-items: center;">
                        <input type="checkbox" class="drive-checkbox" value="${disk.path}" ${isChecked}>
                    </div>
                    <div class="drive-image" style="width: 100px;">
                        <img src="${imageUrl}" onerror="this.onerror=null; this.src='${fallbackSVG}';" alt="Drive Image">
                    </div>
                    <div class="drive-info">
                        <h3 style="font-size: 18px;">${fullName}</h3>
                        <p style="font-size: 13px; color: var(--text-muted);">
                            <strong>${window.translate('path', 'Path')}:</strong> <span style="color: var(--accent-red);">${disk.path}</span> | 
                            <strong>${window.translate('size', 'Size')}:</strong> ${formatBytes(diskSize)} | 
                            <strong>S/N:</strong> ${serial}
                        </p>
                    </div>
                </div>
            `;

            const headerArea = card.querySelector('.drive-header');
            const checkbox = card.querySelector('.drive-checkbox');
            
            headerArea.addEventListener('click', (e) => {
                if (e.target !== checkbox) checkbox.checked = !checkbox.checked;

                if (checkbox.checked) {
                    if (!selectedDrives.includes(disk.path)) selectedDrives.push(disk.path);
                    card.classList.add('selected');
                } else {
                    selectedDrives = selectedDrives.filter(p => p !== disk.path);
                    card.classList.remove('selected');
                }
                updateShredConfigUI();
            });

            checkbox.addEventListener('change', () => {
                if (checkbox.checked) {
                    if (!selectedDrives.includes(disk.path)) selectedDrives.push(disk.path);
                    card.classList.add('selected');
                } else {
                    selectedDrives = selectedDrives.filter(p => p !== disk.path);
                    card.classList.remove('selected');
                }
                updateShredConfigUI();
            });

            availContainer.appendChild(card);
            availableCount++;
        }
    });

    activeSection.style.display = activeCount > 0 ? 'block' : 'none';
    if (availableCount === 0) availContainer.innerHTML = `<p style="color: var(--text-muted);">${window.translate('no_avail_drives', 'No available drives to wipe.')}</p>`;
    window.applyLocalization();
    if (window.applyGlobalLayout) window.applyGlobalLayout();
}

window.stopWipeJob = async function(containerName) {
    const confirmMsg = window.translate('emergency_stop_confirm', "DANGER: Are you sure you want to stop this wipe?\n\nThe process will stop gracefully and the container will be removed in 2 minutes.");
    const confirmTitle = window.translate('emergency_stop_title', "Confirm Emergency Stop");
    
    customConfirm(confirmMsg, async () => {
        try {
            const response = await fetch('/api/shred/stop', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ container_name: containerName }) 
            });
            
            const result = await response.json();
            
            if (result.status === 'success') {
                // Wait for WebSocket event
            } else {
                customAlert("Error stopping wipe: " + result.message);
            }
        } catch (error) {
            console.error("Network error while trying to stop the container:", error);
        }
    }, confirmTitle);
};

let modalViewMode = 'detailed';

function switchModalView(mode) {
    modalViewMode = mode;
    document.getElementById('btn-view-detailed').classList.toggle('active', mode === 'detailed');
    document.getElementById('btn-view-simple').classList.toggle('active', mode === 'simple');
    const list = document.getElementById('modal-drive-list');
    if (mode === 'detailed') {
        document.getElementById('modal-detailed-view').style.display = '';
        const simple = document.getElementById('modal-simple-view');
        if (simple) simple.style.display = 'none';
    } else {
        document.getElementById('modal-detailed-view').style.display = 'none';
        let simple = document.getElementById('modal-simple-view');
        if (!simple) {
            simple = document.createElement('div');
            simple.id = 'modal-simple-view';
            simple.className = 'modal-drive-simple';
            list.appendChild(simple);
        }
        simple.style.display = '';
    }
    // Both views render from modalMeta so switching never rebuilds from blank
    syncModalFieldsFromMeta();
}

function escapeHtmlAttr(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function getModalMeta(path) {
    if (!modalMeta[path]) {
        modalMeta[path] = { datacenter: '', serverName: '', inventoryId: '' };
    }
    return modalMeta[path];
}

function getDistinctServerNames() {
    const names = [];
    Object.keys(modalMeta).forEach(path => {
        const serverName = (modalMeta[path].serverName || '').trim();
        if (serverName !== '' && !names.includes(serverName)) names.push(serverName);
    });
    return names;
}

function buildModalPdfFields(path, suffix, dcTags) {
    const meta = getModalMeta(path);
    // Default the stored datacenter to the first tag so meta matches the select default
    if (!meta.datacenter && dcTags.length > 0) meta.datacenter = dcTags[0];
    const options = dcTags.map(tag => `<option value="${escapeHtmlAttr(tag)}"${tag === meta.datacenter ? ' selected' : ''}>${escapeHtmlAttr(tag)}</option>`).join('');
    return `
        <div class="modal-pdf-fields" style="margin-top: 10px; display: flex; gap: 10px; flex-wrap: wrap;">
            <div style="flex: 1; min-width: 130px;">
                <label style="font-size: 11px; color: var(--text-muted); display:block; margin-bottom:4px;">${window.translate('datacenter', 'Datacenter')}</label>
                <select id="dc-${suffix}" style="width: 100%; padding: 6px 8px; font-size: 12px; background: #0f172a; color: white; border: 1px solid #334155; border-radius: 4px;">
                    ${options}
                </select>
            </div>
            <div style="flex: 1; min-width: 130px;">
                <label style="font-size: 11px; color: var(--text-muted); display:block; margin-bottom:4px;">${window.translate('server_name', 'Server Name')}</label>
                <input type="text" id="srv-${suffix}" placeholder="Optional" value="${escapeHtmlAttr(meta.serverName || '')}" style="width: 100%; padding: 6px 8px; font-size: 12px; background: #0f172a; color: white; border: 1px solid #334155; border-radius: 4px;">
            </div>
            <div style="flex: 1; min-width: 130px;">
                <label style="font-size: 11px; color: var(--text-muted); display:block; margin-bottom:4px;">${window.translate('inventory_id', 'Inventory ID')}</label>
                <input type="text" id="inv-${suffix}" placeholder="Optional" value="${escapeHtmlAttr(meta.inventoryId || '')}" style="width: 100%; padding: 6px 8px; font-size: 12px; background: #0f172a; color: white; border: 1px solid #334155; border-radius: 4px;">
            </div>
        </div>
    `;
}

function bindModalMetaFields(path) {
    const fieldSpecs = [
        { prefix: 'dc', field: 'datacenter' },
        { prefix: 'srv', field: 'serverName' },
        { prefix: 'inv', field: 'inventoryId' }
    ];
    ['--d', '--s'].forEach(suffix => {
        const twinSuffix = suffix === '--d' ? '--s' : '--d';
        fieldSpecs.forEach(spec => {
            const el = document.getElementById(`${spec.prefix}-${path}${suffix}`);
            if (!el) return;
            const twinEl = document.getElementById(`${spec.prefix}-${path}${twinSuffix}`);
            const sync = () => {
                const value = el.value.trim();
                getModalMeta(path)[spec.field] = value;
                // Mirror into the other view so both stay in sync
                if (twinEl && twinEl !== el && twinEl.value !== value) {
                    twinEl.value = value;
                    if (twinEl.tagName === 'SELECT') twinEl.dispatchEvent(new Event('change'));
                }
            };
            el.addEventListener('input', sync);
            el.addEventListener('change', sync);
        });
    });
}

function syncModalFieldsFromMeta() {
    Object.keys(modalMeta).forEach(path => {
        const meta = modalMeta[path];
        ['--d', '--s'].forEach(suffix => {
            const dcSelect = document.getElementById(`dc-${path}${suffix}`);
            if (dcSelect && meta.datacenter && dcSelect.value !== meta.datacenter) {
                dcSelect.value = meta.datacenter;
                dcSelect.dispatchEvent(new Event('change'));
            }
            const srvInput = document.getElementById(`srv-${path}${suffix}`);
            if (srvInput && srvInput.value !== (meta.serverName || '')) {
                srvInput.value = meta.serverName || '';
            }
            const invInput = document.getElementById(`inv-${path}${suffix}`);
            if (invInput && invInput.value !== (meta.inventoryId || '')) {
                invInput.value = meta.inventoryId || '';
            }
        });
    });
}

function buildBulkAssignmentToolbar(dcTags) {
    const dcOptions = dcTags.map(tag => `<option value="${escapeHtmlAttr(tag)}">${escapeHtmlAttr(tag)}</option>`).join('');
    const driveChecks = selectedDrives.map(path =>
        `<label class="modal-bulk-drive"><input type="checkbox" class="modal-bulk-drive-check" value="${escapeHtmlAttr(path)}" checked> <span>${escapeHtmlAttr(path)}</span></label>`
    ).join('');

    const toolbar = document.createElement('div');
    toolbar.className = 'modal-bulk-toolbar';
    toolbar.innerHTML = `
        <div class="modal-bulk-row">
            <label class="modal-bulk-selectall"><input type="checkbox" id="bulk-select-all" checked> <span>All</span></label>
            <div class="modal-bulk-field">
                <label>${window.translate('datacenter', 'Datacenter')}</label>
                <select id="bulk-dc">${dcOptions}</select>
            </div>
            <div class="modal-bulk-field">
                <label>${window.translate('server_name', 'Server Name')}</label>
                <input type="text" id="bulk-server" placeholder="Optional">
            </div>
            <div class="modal-bulk-field">
                <label>Select drives of server</label>
                <select id="bulk-server-filter"></select>
            </div>
            <div class="modal-bulk-actions">
                <button type="button" id="bulk-apply-selected">Apply to selected</button>
                <button type="button" id="bulk-apply-all">Apply to all drives</button>
            </div>
        </div>
        <div class="modal-bulk-drives" id="bulk-drive-checks">${driveChecks}</div>
    `;

    const masterCheck = toolbar.querySelector('#bulk-select-all');
    const driveChecksWrap = toolbar.querySelector('#bulk-drive-checks');
    const dcSelect = toolbar.querySelector('#bulk-dc');
    const serverInput = toolbar.querySelector('#bulk-server');
    const serverFilter = toolbar.querySelector('#bulk-server-filter');

    function refreshServerFilterOptions() {
        const names = getDistinctServerNames();
        serverFilter.innerHTML = `<option value="">--</option>` + names.map(name => `<option value="${escapeHtmlAttr(name)}">${escapeHtmlAttr(name)}</option>`).join('');
    }
    refreshServerFilterOptions();

    function refreshMasterState() {
        const checks = Array.from(driveChecksWrap.querySelectorAll('.modal-bulk-drive-check'));
        const allChecked = checks.length > 0 && checks.every(cb => cb.checked);
        masterCheck.checked = allChecked;
        masterCheck.indeterminate = !allChecked && checks.some(cb => cb.checked);
    }

    masterCheck.addEventListener('change', () => {
        driveChecksWrap.querySelectorAll('.modal-bulk-drive-check').forEach(cb => { cb.checked = masterCheck.checked; });
    });

    driveChecksWrap.addEventListener('change', (e) => {
        if (e.target.classList.contains('modal-bulk-drive-check')) refreshMasterState();
    });

    // Selecting a server checks only its drives and preselects their datacenter
    serverFilter.addEventListener('change', () => {
        const serverName = serverFilter.value;
        if (!serverName) return;
        let datacenter = '';
        driveChecksWrap.querySelectorAll('.modal-bulk-drive-check').forEach(cb => {
            const meta = modalMeta[cb.value] || {};
            const isMatch = (meta.serverName || '').trim() === serverName;
            cb.checked = isMatch;
            if (isMatch && meta.datacenter && !datacenter) datacenter = meta.datacenter;
        });
        if (datacenter && dcSelect.value !== datacenter) {
            dcSelect.value = datacenter;
            dcSelect.dispatchEvent(new Event('change'));
        }
        refreshMasterState();
    });

    function applyBulkAssign(paths) {
        const datacenter = dcSelect ? dcSelect.value : '';
        const serverName = serverInput ? serverInput.value.trim() : '';
        paths.forEach(path => {
            const meta = getModalMeta(path);
            if (datacenter) meta.datacenter = datacenter;
            meta.serverName = serverName;
        });
        syncModalFieldsFromMeta();
        refreshServerFilterOptions();
    }

    toolbar.querySelector('#bulk-apply-selected').addEventListener('click', () => {
        const targets = Array.from(driveChecksWrap.querySelectorAll('.modal-bulk-drive-check:checked')).map(cb => cb.value);
        if (targets.length === 0) {
            customAlert("No drives checked for bulk assignment.");
            return;
        }
        applyBulkAssign(targets);
    });

    toolbar.querySelector('#bulk-apply-all').addEventListener('click', () => {
        applyBulkAssign(selectedDrives.slice());
    });

    return toolbar;
}

function showConfirmationModal() {
    // Derive the selection from the DOM checkboxes right before validation
    selectedDrives = Array.from(document.querySelectorAll('#shred-list-container .drive-checkbox:checked')).map(cb => cb.value);
    if (selectedDrives.length === 0) {
        customAlert("Please select at least one available drive to wipe.");
        return;
    }
    console.log("Showing confirmation modal. Selected drives:", selectedDrives);

    let dcTags = JSON.parse(localStorage.getItem('dh_dc_tags')) || ['DatacenterX'];

    const countEl = document.getElementById('modal-drive-count');
    if (countEl) countEl.innerText = `${selectedDrives.length} drive${selectedDrives.length > 1 ? 's' : ''} selected`;

    const list = document.getElementById('modal-drive-list');
    list.innerHTML = '';

    const detailedView = document.createElement('div');
    detailedView.id = 'modal-detailed-view';

    const simpleView = document.createElement('div');
    simpleView.id = 'modal-simple-view';
    simpleView.className = 'modal-drive-simple';
    simpleView.style.display = 'none';

    selectedDrives.forEach(path => {
        const disk = availableDisksData.find(d => d.path === path);
        if (!disk) return;

        const rawVendor = disk.vendor ? disk.vendor.trim() + ' ' : '';
        const rawModel = disk.model ? disk.model.trim() : 'Unknown';
        const normalizedId = (rawVendor + rawModel).replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
        const serial = disk.serial || 'N/A';
        const sizeStr = formatBytes(parseInt(disk.size));

        const imageUrl = `/api/images/drives/${normalizedId}.jpg?name=${disk.name}&tran=${disk.tran || ''}&rota=${disk.rota !== undefined ? disk.rota : ''}&model=${disk.model || ''}`;
        const fallbackSVG = `data:image/svg+xml;charset=UTF-8,%3Csvg xmlns="http://www.w3.org/2000/svg" width="70" height="50" style="background:%231e293b; border-radius: 4px;"%3E%3Ctext fill="%2394a3b8" x="50%25" y="50%25" font-family="sans-serif" font-weight="bold" font-size="12" text-anchor="middle" dominant-baseline="middle"%3EDRIVE%3C/text%3E%3C/svg%3E`;

        let extraInputsDetailed = "";
        let extraInputsSimple = "";
        if (generatePdfSetting) {
            extraInputsDetailed = buildModalPdfFields(disk.path, disk.path + '--d', dcTags);
            extraInputsSimple = buildModalPdfFields(disk.path, disk.path + '--s', dcTags);
        }

        detailedView.innerHTML += `
            <div class="modal-drive-item" style="display: block; padding: 15px; margin-bottom: 10px; background: var(--bg-panel); border: 1px solid #334155; border-radius: 6px;">
                <div style="display: flex; gap: 15px;">
                    <img src="${imageUrl}" onerror="this.onerror=null; this.src='${fallbackSVG}';" alt="Drive Image">
                    <div>
                        <div style="font-weight: bold; color: white; font-size: 16px;">${rawVendor + rawModel}</div>
                        <div style="font-size: 13px; color: var(--text-muted); margin-top: 4px;">${disk.path} | S/N: ${serial} | ${sizeStr}</div>
                    </div>
                </div>
                ${extraInputsDetailed}
            </div>
        `;

        simpleView.innerHTML += `
            <div class="modal-drive-simple-row">
                <div class="modal-drive-simple-item">
                    <span class="modal-drive-simple-path">${disk.path}</span>
                    <span class="modal-drive-simple-model">${rawVendor + rawModel}</span>
                    <span class="modal-drive-simple-serial">${serial}</span>
                    <span class="modal-drive-simple-size">${sizeStr}</span>
                </div>
                ${extraInputsSimple}
            </div>
        `;
    });

    list.appendChild(detailedView);
    list.appendChild(simpleView);

    // Metadata inputs write into modalMeta; both views render from it
    selectedDrives.forEach(path => bindModalMetaFields(path));

    // Bulk assignment toolbar, only shown when the Generate Cert metadata fields are shown
    const toolbarWrap = document.getElementById('modal-bulk-toolbar-container');
    if (toolbarWrap) {
        toolbarWrap.innerHTML = '';
        if (generatePdfSetting) toolbarWrap.appendChild(buildBulkAssignmentToolbar(dcTags));
    }

    modalViewMode = 'detailed';
    document.getElementById('btn-view-detailed').classList.add('active');
    document.getElementById('btn-view-simple').classList.remove('active');
    switchModalView('detailed');

    document.getElementById('shred-modal').classList.add('active');
    window.applyLocalization();
}

function hideModal() {
    document.getElementById('shred-modal').classList.remove('active');
    // Reset modal metadata when the modal is closed, cancelled, or the wipe is confirmed
    modalMeta = {};
}

async function executeWipe() {
    const method = selectedMethod;
    const verify = document.getElementById('wipe-verify').value;
    const btn = document.getElementById('btn-confirm');
    
    const isDebug = localStorage.getItem('disk_hunter_debug') === 'true';
    
    const debugConsole = document.getElementById('debug-console');
    const debugOutput = document.getElementById('debug-output');
    
    if (isDebug) {
        debugConsole.style.display = 'flex';
        debugOutput.innerHTML = `<span style="color: #3b82f6;">[System]</span> Initiate clicked. Sending request...<br>`;
    }
    
    btn.innerText = "Spawning Containers...";
    btn.disabled = true;

    try {
        // Read drive metadata from modalMeta regardless of which view is visible
        let driveObjects = selectedDrives.map(path => {
            const meta = modalMeta[path] || {};
            const serverName = (meta.serverName || '').trim();
            const inventoryId = (meta.inventoryId || '').trim();
            
            return {
                path: path,
                server_name: (generatePdfSetting && serverName !== '') ? serverName : 'N/A',
                inventory_id: (generatePdfSetting && inventoryId !== '') ? inventoryId : 'N/A',
                datacenter: (generatePdfSetting && meta.datacenter) ? meta.datacenter : 'N/A'
            };
        });

        const payload = { 
            drives: driveObjects, 
            method: method, 
            verify: verify, 
            generate_pdf: generatePdfSetting,
            company_name: localStorage.getItem('dh_comp_name') || 'Disk Hunter',
            company_address: localStorage.getItem('dh_comp_addr') || 'N/A',
            company_phone: localStorage.getItem('dh_comp_phone') || 'N/A',
            timezone: localStorage.getItem('dh_timezone') || 'UTC' 
        };
        
        if (isDebug) { debugOutput.innerHTML += `<span style="color: #3b82f6;">[Payload]</span> ${JSON.stringify(payload)}<br>`; }

        const response = await fetch('/api/shred', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const rawText = await response.text();
        const result = JSON.parse(rawText);

        if (isDebug && result.debug) { debugOutput.innerHTML += `<span style="color: #a855f7;">[Backend Logs]</span><br>${result.debug.join('<br>')}<br>------------------------<br>`; }

        if (result.status === 'success') {
            if (isDebug) debugOutput.innerHTML += `<span style="color: var(--accent-green);">[Success]</span> ${result.message}<br>`;
            selectedDrives = [];
            selectedMethod = activeShredTab === 'nvme' ? 'nvme-user' : 'dodshort';
            const container = document.getElementById('wipe-method-list');
            if (container) { container.dataset.hash = ''; }
            updateShredConfigUI();
            hideModal();
        } else {
            if (isDebug) debugOutput.innerHTML += `<span style="color: red;">[Error]</span> ${result.message}<br>`;
            customAlert("Error: " + result.message);
            hideModal();
        }
    } catch (error) {
        if (isDebug) debugOutput.innerHTML += `<span style="color: red;">[Critical Error]</span> ${error}<br>`;
        customAlert("Network error.");
        hideModal();
    } finally {
        btn.innerText = window.translate('btn_confirm_wipe', "I Understand, Destroy Data");
        btn.disabled = false;
    }
}