/* html/js/shredding.js */

let selectedDrives = [];
let availableDisksData = [];
let refreshInterval;
let previousDiskStateHash = ""; 
let activeShredTab = 'standard';

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

    // Tab switching event listeners
    const tabButtons = document.querySelectorAll('.shred-ui-tab');
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.getAttribute('data-shred-tab');
            if (activeShredTab === targetTab) return;

            // Clear previous selections to prevent mixing incompatible targets
            selectedDrives = [];
            
            tabButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            activeShredTab = targetTab;
            
            // Update UI config box elements
            updateShredConfigUI();
            
            // Redraw available drives
            if (currentDisks && currentWipeStatus) {
                updateShreddingUI();
            }
        });
    });

    window.applyLocalization();
    updateShredConfigUI();

    // Show/hide API Debug Console based on settings
    const isDebug = localStorage.getItem('disk_hunter_debug') === 'true';
    const debugConsole = document.getElementById('debug-console');
    if (debugConsole) {
        if (isDebug) {
            debugConsole.style.display = 'block';
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

function updateShredConfigUI() {
    const select = document.getElementById('wipe-method');
    const verifyWrapper = document.getElementById('verification-wrapper');
    if (!select) return;

    const prevVal = select.value;
    select.innerHTML = '';

    if (activeShredTab === 'nvme') {
        if (verifyWrapper) verifyWrapper.style.display = 'none';

        const optUser = document.createElement('option');
        optUser.value = 'nvme-user';
        optUser.setAttribute('data-i18n', 'method_nvme_user');
        optUser.innerText = window.translate('method_nvme_user', 'NVMe Secure Erase (User Data Format)');
        
        const optCrypto = document.createElement('option');
        optCrypto.value = 'nvme-crypto';
        optCrypto.setAttribute('data-i18n', 'method_nvme_crypto');
        optCrypto.innerText = window.translate('method_nvme_crypto', 'NVMe Secure Erase (Cryptographic Format)');

        select.appendChild(optUser);
        select.appendChild(optCrypto);

        if (prevVal === 'nvme-user' || prevVal === 'nvme-crypto') {
            select.value = prevVal;
        } else {
            select.value = 'nvme-user';
        }
    } else {
        if (verifyWrapper) verifyWrapper.style.display = 'block';

        const methods = [
            { val: 'zero', i18n: 'method_zero', label: 'Fill With Zeros (1 Pass)' },
            { val: 'dodshort', i18n: 'method_dodshort', label: 'DoD Short 5220.22-M (3 Passes)' },
            { val: 'dod522022m', i18n: 'method_dod522022m', label: 'DoD Full 5220.22-M (7 Passes)' },
            { val: 'gutmann', i18n: 'method_gutmann', label: 'Gutmann Wipe (35 Passes)' },
            { val: 'ops2', i18n: 'method_ops2', label: 'RCMP TSSIT OPS-II (7 Passes)' },
            { val: 'is5enh', i18n: 'method_is5enh', label: 'HMG IS5 Enhanced (3 Passes)' },
            { val: 'schneier', i18n: 'method_schneier', label: 'Schneier Wipe (7 Passes)' },
            { val: 'prng', i18n: 'method_prng', label: 'PRNG Stream (Random Pass)' }
        ];

        methods.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.val;
            opt.setAttribute('data-i18n', m.i18n);
            opt.innerText = window.translate(m.i18n, m.label);
            select.appendChild(opt);
        });

        // Add ATA Secure Erase dynamically if all selected are SATA/HDD
        const allSelectedAreSata = selectedDrives.length > 0 && selectedDrives.every(path => {
            const disk = availableDisksData.find(d => d.path === path);
            if (!disk) return false;
            const tran = (disk.tran || '').toLowerCase();
            const name = (disk.name || '').toLowerCase();
            return tran === 'sata' || name.startsWith('sd');
        });

        if (allSelectedAreSata) {
            const optAtaSec = document.createElement('option');
            optAtaSec.value = 'ata-secure';
            optAtaSec.setAttribute('data-i18n', 'method_ata_secure');
            optAtaSec.innerText = window.translate('method_ata_secure', 'ATA Secure Erase (User Data Format)');
            
            const optAtaEnh = document.createElement('option');
            optAtaEnh.value = 'ata-enhanced';
            optAtaEnh.setAttribute('data-i18n', 'method_ata_enhanced');
            optAtaEnh.innerText = window.translate('method_ata_enhanced', 'ATA Enhanced Secure Erase (Cryptographic Format)');
            
            select.appendChild(optAtaSec);
            select.appendChild(optAtaEnh);
        }

        const allowedVals = methods.map(m => m.val).concat(allSelectedAreSata ? ['ata-secure', 'ata-enhanced'] : []);
        if (allowedVals.includes(prevVal)) {
            select.value = prevVal;
        } else {
            select.value = 'dodshort';
        }
    }
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

function showConfirmationModal() {
    if (selectedDrives.length === 0) {
        customAlert("Please select at least one available drive to wipe.");
        return;
    }
    console.log("Showing confirmation modal. Selected drives:", selectedDrives);
    const modalList = document.getElementById('modal-drive-list');
    modalList.innerHTML = '';

    const generatePdf = localStorage.getItem('disk_hunter_pdf') === 'true';
    let dcTags = JSON.parse(localStorage.getItem('dh_dc_tags')) || ['DatacenterX'];
    let options = dcTags.map(tag => `<option value="${tag}">${tag}</option>`).join('');

    selectedDrives.forEach(path => {
        const disk = availableDisksData.find(d => d.path === path);
        if (!disk) return;
        
        const rawVendor = disk.vendor ? disk.vendor.trim() + ' ' : '';
        const rawModel = disk.model ? disk.model.trim() : 'Unknown';
        const normalizedId = (rawVendor + rawModel).replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();

        const imageUrl = `/api/images/drives/${normalizedId}.jpg?name=${disk.name}&tran=${disk.tran || ''}&rota=${disk.rota !== undefined ? disk.rota : ''}&model=${disk.model || ''}`;
        const fallbackSVG = `data:image/svg+xml;charset=UTF-8,%3Csvg xmlns="http://www.w3.org/2000/svg" width="70" height="50" style="background:%231e293b; border-radius: 4px;"%3E%3Ctext fill="%2394a3b8" x="50%25" y="50%25" font-family="sans-serif" font-weight="bold" font-size="12" text-anchor="middle" dominant-baseline="middle"%3EDRIVE%3C/text%3E%3C/svg%3E`;
        
        let extraInputs = "";
        if (generatePdf) {
            extraInputs = `
                <div style="margin-top: 15px; display: flex; gap: 10px; flex-wrap: wrap;">
                    <div style="flex: 1; min-width: 150px;">
                        <label style="font-size: 11px; color: var(--text-muted); display:block; margin-bottom:4px;">${window.translate('datacenter', 'Datacenter')}</label>
                        <select id="dc-${disk.path}" style="width: 100%; padding: 8px; font-size: 12px; background: #0f172a; color: white; border: 1px solid #334155; border-radius: 4px;">
                            ${options}
                        </select>
                    </div>
                    <div style="flex: 1; min-width: 150px;">
                        <label style="font-size: 11px; color: var(--text-muted); display:block; margin-bottom:4px;">${window.translate('server_name', 'Server Name')}</label>
                        <input type="text" id="srv-${disk.path}" placeholder="Optional" style="width: 100%; padding: 8px; font-size: 12px; background: #0f172a; color: white; border: 1px solid #334155; border-radius: 4px;">
                    </div>
                    <div style="flex: 1; min-width: 150px;">
                        <label style="font-size: 11px; color: var(--text-muted); display:block; margin-bottom:4px;">${window.translate('inventory_id', 'Inventory ID')}</label>
                        <input type="text" id="inv-${disk.path}" placeholder="Optional" style="width: 100%; padding: 8px; font-size: 12px; background: #0f172a; color: white; border: 1px solid #334155; border-radius: 4px;">
                    </div>
                </div>
            `;
        }

        modalList.innerHTML += `
            <div class="modal-drive-item" style="display: block; padding: 15px; margin-bottom: 10px; background: var(--bg-panel); border: 1px solid #334155; border-radius: 6px;">
                <div style="display: flex; gap: 15px;">
                    <img src="${imageUrl}" onerror="this.onerror=null; this.src='${fallbackSVG}';" alt="Drive Image">
                    <div>
                        <div style="font-weight: bold; color: white; font-size: 16px;">${rawVendor + rawModel}</div>
                        <div style="font-size: 13px; color: var(--text-muted); margin-top: 4px;">${disk.path} | S/N: ${disk.serial || 'N/A'} | ${formatBytes(parseInt(disk.size))}</div>
                    </div>
                </div>
                ${extraInputs}
            </div>
        `;
    });
    document.getElementById('shred-modal').classList.add('active');
    window.applyLocalization();
}

function hideModal() {
    document.getElementById('shred-modal').classList.remove('active');
}

async function executeWipe() {
    const method = document.getElementById('wipe-method').value;
    const verify = document.getElementById('wipe-verify').value;
    const btn = document.getElementById('btn-confirm');
    
    const isDebug = localStorage.getItem('disk_hunter_debug') === 'true';
    const generatePdf = localStorage.getItem('disk_hunter_pdf') === 'true';
    
    const debugConsole = document.getElementById('debug-console');
    const debugOutput = document.getElementById('debug-output');
    
    if (isDebug) {
        debugConsole.style.display = 'block';
        debugOutput.innerHTML = `<span style="color: #3b82f6;">[System]</span> Initiate clicked. Sending request...<br>`;
    }
    
    btn.innerText = "Spawning Containers...";
    btn.disabled = true;

    try {
        let driveObjects = selectedDrives.map(path => {
            const srvInput = document.getElementById(`srv-${path}`);
            const invInput = document.getElementById(`inv-${path}`);
            const dcSelect = document.getElementById(`dc-${path}`);
            
            return {
                path: path,
                server_name: (generatePdf && srvInput && srvInput.value.trim() !== '') ? srvInput.value.trim() : 'N/A',
                inventory_id: (generatePdf && invInput && invInput.value.trim() !== '') ? invInput.value.trim() : 'N/A',
                datacenter: (generatePdf && dcSelect) ? dcSelect.value : 'N/A'
            };
        });

        const payload = { 
            drives: driveObjects, 
            method: method, 
            verify: verify, 
            generate_pdf: generatePdf,
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