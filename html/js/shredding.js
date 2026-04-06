let selectedDrives = [];
let availableDisksData = [];
let refreshInterval;
let previousDiskStateHash = ""; // NEW: Tracks structural changes to prevent flickering

document.addEventListener('DOMContentLoaded', () => {
    fetchDrivesAndStatus();
    refreshInterval = setInterval(fetchDrivesAndStatus, 5000);

    document.getElementById('btn-initiate-wipe').addEventListener('click', showConfirmationModal);
    document.getElementById('btn-cancel').addEventListener('click', hideModal);
    document.getElementById('btn-confirm').addEventListener('click', executeWipe);
});

function formatBytes(bytes, decimals = 1) {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

async function fetchDrivesAndStatus() {
    try {
        const protectRoot = localStorage.getItem('disk_hunter_protect_root') !== 'false';
        const [disksRes, statusRes] = await Promise.all([
            fetch(`/api/disks?exclude_root=${protectRoot}`),
            fetch('/api/wipe-status')
        ]);

        const diskData = await disksRes.json();
        const statusData = await statusRes.json();

        if (diskData.status !== 'success') {
            document.getElementById('shred-list-container').innerHTML = `<p style="color: red;">Error: ${diskData.message}</p>`;
            return;
        }

        const wipingJobs = statusData.wiping || [];
        availableDisksData = diskData.disks;

        // Create a unique fingerprint of the current drive state (Ignoring the rapidly changing log text)
        const currentStateHash = diskData.disks.map(d => {
            const isWiping = wipingJobs.some(job => job.drive === d.name);
            return `${d.path}:${isWiping}`;
        }).join('|');

        if (currentStateHash !== previousDiskStateHash) {
            // Structural change detected! (Drive added/removed or wipe started/stopped)
            rebuildUI(diskData.disks, wipingJobs);
            previousDiskStateHash = currentStateHash;
        } else {
            // No structural changes. Just silently update the live terminal logs to stop the flicker!
            updateLiveLogs(wipingJobs);
        }

    } catch (error) {
        console.error("Failed to fetch drives:", error);
    }
}

// Function to smoothly update the text inside the terminal without redrawing the whole card
function updateLiveLogs(wipingJobs) {
    wipingJobs.forEach(job => {
        const logElement = document.getElementById(`log-${job.drive}`);
        if (logElement) {
            logElement.innerText = `> ${job.log}`;
            logElement.title = job.log;
        }
    });
}

// Function to completely rebuild the UI cards (Only called when absolutely necessary)
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
        
        const imageUrl = `/api/images/drives/${normalizedId}.jpg`;
        const fallbackSVG = `data:image/svg+xml;charset=UTF-8,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300" style="background:%231e293b; border-radius: 4px;"%3E%3Ctext fill="%2394a3b8" x="50%25" y="50%25" font-family="sans-serif" font-weight="bold" font-size="30" text-anchor="middle" dominant-baseline="middle"%3EDRIVE%3C/text%3E%3C/svg%3E`;
        
        const card = document.createElement('div');
        card.dataset.path = disk.path; 

        const activeJob = wipingJobs.find(job => job.drive === driveName);

        if (activeJob) {
            // ACTIVE WIPE CARD
            card.className = 'drive-card wiping-card';
            card.innerHTML = `
                <div class="drive-header" style="justify-content: space-between; width: 100%;">
                    <div style="display: flex; gap: 20px;">
                        <div class="drive-image" style="width: 100px;">
                            <img src="${imageUrl}" onerror="this.onerror=null; this.src='${fallbackSVG}';" alt="Drive Image">
                        </div>
                        <div class="drive-info">
                            <h3 style="font-size: 18px; color: var(--accent-red); margin-bottom: 5px;">${fullName} <span class="badge" style="background: var(--accent-red); color: white; margin-left: 10px;">WIPING IN PROGRESS</span></h3>
                            <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 8px;">
                                <strong>Path:</strong> ${disk.path} | <strong>Size:</strong> ${formatBytes(diskSize)} | <strong>S/N:</strong> ${serial}
                            </p>
                            <div id="log-${driveName}" style="background: #000; color: #10b981; font-family: monospace; font-size: 12px; padding: 8px 10px; border-radius: 4px; width: 100%; max-width: 550px; white-space: pre-wrap; word-break: break-word; border: 1px solid #334155; line-height: 1.4; margin-top: 8px;" title="${activeJob.log.replace(/"/g, '&quot;')}"></div>
                        </div>
                    </div>
                    <div style="padding-left: 15px;">
                        <button onclick="stopWipeJob('${activeJob.container}')" style="background: transparent; color: var(--accent-red); border: 1px solid var(--accent-red); padding: 8px 15px; border-radius: 6px; cursor: pointer; font-weight: bold; transition: 0.2s;" onmouseover="this.style.background='rgba(239, 68, 68, 0.1)'" onmouseout="this.style.background='transparent'">Emergency Stop</button>
                    </div>
                </div>
            `;
            activeContainer.appendChild(card);
            activeCount++;
        } else {
            // AVAILABLE TARGET CARD
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
                            <strong>Path:</strong> <span style="color: var(--accent-red);">${disk.path}</span> | 
                            <strong>Size:</strong> ${formatBytes(diskSize)} | 
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
            });

            availContainer.appendChild(card);
            availableCount++;
        }
    });

    activeSection.style.display = activeCount > 0 ? 'block' : 'none';
    if (availableCount === 0) availContainer.innerHTML = '<p style="color: var(--text-muted);">No available drives to wipe.</p>';
}

// Global function for the Emergency Stop button
window.stopWipeJob = async function(containerName) {
    if(!confirm("⚠️ DANGER: Are you sure you want to stop this wipe?\n\nThe process will stop gracefully and the container will be removed in 2 minutes.")) return;
    
    try {
        const response = await fetch('/api/shred/stop', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ container_name: containerName }) 
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
            fetchDrivesAndStatus(); // Instantly refresh UI
        } else {
            alert("Error stopping wipe: " + result.message);
        }
    } catch (error) {
        console.error("Network error while trying to stop the container:", error);
    }
};

function showConfirmationModal() {
    if (selectedDrives.length === 0) {
        alert("Please select at least one available drive to wipe.");
        return;
    }
    console.log("Showing confirmation modal. Selected drives:", selectedDrives);
    clearInterval(refreshInterval);
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

        const imageUrl = `/api/images/drives/${normalizedId}.jpg`;
        const fallbackSVG = `data:image/svg+xml;charset=UTF-8,%3Csvg xmlns="http://www.w3.org/2000/svg" width="70" height="50" style="background:%231e293b; border-radius: 4px;"%3E%3Ctext fill="%2394a3b8" x="50%25" y="50%25" font-family="sans-serif" font-weight="bold" font-size="12" text-anchor="middle" dominant-baseline="middle"%3EDRIVE%3C/text%3E%3C/svg%3E`;
        
        let extraInputs = "";
        if (generatePdf) {
            extraInputs = `
                <div style="margin-top: 15px; display: flex; gap: 10px; flex-wrap: wrap;">
                    <div style="flex: 1; min-width: 150px;">
                        <label style="font-size: 11px; color: var(--text-muted); display:block; margin-bottom:4px;">Datacenter</label>
                        <select id="dc-${disk.path}" style="width: 100%; padding: 8px; font-size: 12px; background: #0f172a; color: white; border: 1px solid #334155; border-radius: 4px;">
                            ${options}
                        </select>
                    </div>
                    <div style="flex: 1; min-width: 150px;">
                        <label style="font-size: 11px; color: var(--text-muted); display:block; margin-bottom:4px;">Server Name</label>
                        <input type="text" id="srv-${disk.path}" placeholder="Optional" style="width: 100%; padding: 8px; font-size: 12px; background: #0f172a; color: white; border: 1px solid #334155; border-radius: 4px;">
                    </div>
                    <div style="flex: 1; min-width: 150px;">
                        <label style="font-size: 11px; color: var(--text-muted); display:block; margin-bottom:4px;">Inventory ID</label>
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
}

function hideModal() {
    document.getElementById('shred-modal').classList.remove('active');
    refreshInterval = setInterval(fetchDrivesAndStatus, 5000);
}

// The Main Execution Function

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
        // Build the complex drives array, now including the per-disk Datacenter!
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
            fetchDrivesAndStatus(); 
        } else {
            if (isDebug) debugOutput.innerHTML += `<span style="color: red;">[Error]</span> ${result.message}<br>`;
            alert("Error: " + result.message);
            hideModal();
        }
    } catch (error) {
        if (isDebug) debugOutput.innerHTML += `<span style="color: red;">[Critical Error]</span> ${error}<br>`;
        alert("Network error.");
        hideModal();
    } finally {
        btn.innerText = "I Understand, Destroy Data";
        btn.disabled = false;
    }
}