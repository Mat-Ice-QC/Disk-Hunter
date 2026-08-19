let selectedDrives = [];
let availableDisksData = [];
let previousDisks = '';
let previousStatus = '';

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-initiate-tests').addEventListener('click', startSelectedTests);
    document.getElementById('btn-close-raw-modal').addEventListener('click', () => {
        document.getElementById('smart-data-raw-modal').classList.remove('active');
    });
    document.getElementById('btn-close-parsed-modal').addEventListener('click', () => {
        document.getElementById('smart-data-parsed-modal').classList.remove('active');
    });

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

function formatBytes(bytes, decimals = 1) {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

let currentDisks = null;
let currentSmartStatus = null;

document.addEventListener('ws-disks', (e) => {
    currentDisks = e.detail;
    updateSmartUI();
});

document.addEventListener('ws-smart_status', (e) => {
    currentSmartStatus = e.detail;
    updateSmartUI();
});

let previousSmartStateHash = "";

function updateSmartUI() {
    if (!currentDisks || !currentSmartStatus) return;

    const diskData = currentDisks;
    const statusData = currentSmartStatus;

    if (diskData.status !== 'success') {
        document.getElementById('drive-list-container').innerHTML = `<p style="color: red;">Error fetching disks: ${diskData.message}</p>`;
        return;
    }

    const protectRoot = localStorage.getItem('disk_hunter_protect_root') !== 'false';
    const filteredDisks = diskData.disks.filter(d => !(protectRoot && d.is_root));

    availableDisksData = filteredDisks;
    const runningTests = statusData.running_tests || [];

    const currentStateHash = filteredDisks.map(d => {
        const activeTest = runningTests.find(test => test.drive === d.name);
        return `${d.path}:${activeTest ? 'active' : 'idle'}`;
    }).join('|');

    if (currentStateHash !== previousSmartStateHash) {
        rebuildUI(filteredDisks, runningTests);
        previousSmartStateHash = currentStateHash;
    } else {
        updateLiveSmartLogs(runningTests);
    }
}

function updateLiveSmartLogs(runningTests) {
    runningTests.forEach(test => {
        const progressEl = document.getElementById(`progress-${test.drive}`);
        const logEl = document.getElementById(`log-${test.drive}`);
        if (progressEl) progressEl.innerText = test.progress;
        if (logEl) logEl.innerText = test.log;
    });
}

function rebuildUI(disks, runningTests) {
    const availContainer = document.getElementById('drive-list-container');
    const activeContainer = document.getElementById('active-list-container');
    const activeSection = document.getElementById('active-tests-section');

    availContainer.innerHTML = '';
    activeContainer.innerHTML = '';

    let activeCount = 0;
    let availableCount = 0;

    disks.forEach(disk => {
        const diskSize = parseInt(disk.size);
        const rawVendor = disk.vendor ? disk.vendor.trim() + ' ' : '';
        const rawModel = disk.model ? disk.model.trim() : 'Unknown';
        const fullName = (rawVendor && rawModel) ? rawVendor + rawModel : 'Unknown Drive';
        const normalizedId = fullName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
        const serial = disk.serial ? disk.serial.trim() : 'N/A';
        const driveName = disk.name;

        const imageUrl = `/api/images/drives/${normalizedId}.jpg?name=${disk.name}&tran=${disk.tran || ''}&rota=${disk.rota !== undefined ? disk.rota : ''}&model=${disk.model || ''}`;
        const fallbackSVG = `data:image/svg+xml;charset=UTF-8,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300" style="background:%231e293b; border-radius: 4px;"%3E%3Ctext fill="%2394a3b8" x="50%25" y="50%25" font-family="sans-serif" font-weight="bold" font-size="30" text-anchor="middle" dominant-baseline="middle"%3EDRIVE%3C/text%3E%3C/svg%3E`;

        const card = document.createElement('div');
        card.dataset.path = disk.path;

        const activeTest = runningTests.find(test => test.drive === driveName);

        if (activeTest) {
            card.className = 'drive-card wiping-card';
            card.innerHTML = `
                <div class="drive-header" style="justify-content: space-between; width: 100%;">
                    <div style="display: flex; gap: 20px; align-items: center;">
                        <div class="drive-image" style="width: 100px;">
                            <img src="${imageUrl}" onerror="this.onerror=null; this.src='${fallbackSVG}';" alt="Drive Image">
                        </div>
                        <div class="drive-info">
                            <h3 style="font-size: 18px; color: var(--accent-blue); margin-bottom: 5px;">${fullName} <span class="badge" style="background: var(--accent-blue); color: white; margin-left: 10px;">${activeTest.test_type} Test in Progress</span></h3>
                            <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 8px;">
                                <strong>Path:</strong> ${disk.path} | <strong>Size:</strong> ${formatBytes(diskSize)} | <strong>S/N:</strong> ${serial}
                            </p>
                            <div id="progress-${driveName}" style="font-family: monospace; font-size: 14px; color: var(--accent-green); margin-top: 8px;">
                                ${activeTest.progress}
                            </div>
                            <div id="log-${driveName}" class="log-output" style="margin-top: 8px;">${activeTest.log}</div>
                        </div>
                    </div>
                    <div style="padding-left: 15px;">
                        <button onclick="stopTest('${activeTest.container}')" class="btn-action red">Abort Test</button>
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
                <div class="drive-header">
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
                <div class="drive-actions">
                    <button onclick="showRawSmartDataModal('${driveName}')" class="btn-action">View Raw</button>
                    <button onclick="showParsedSmartDataModal('${driveName}')" class="btn-action btn-smart">View Parsed</button>
                </div>
            `;

            const checkbox = card.querySelector('.drive-checkbox');
            
            const toggleSelection = () => {
                if (checkbox.checked) {
                    if (!selectedDrives.includes(disk.path)) selectedDrives.push(disk.path);
                    card.classList.add('selected');
                } else {
                    selectedDrives = selectedDrives.filter(p => p !== disk.path);
                    card.classList.remove('selected');
                }
            };

            card.addEventListener('click', (e) => {
                if (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'INPUT') {
                    checkbox.checked = !checkbox.checked;
                    toggleSelection();
                }
            });

            checkbox.addEventListener('change', toggleSelection);
            
            availContainer.appendChild(card);
            availableCount++;
        }
    });

    activeSection.style.display = activeCount > 0 ? 'block' : 'none';
    if (availableCount === 0 && activeCount === 0) {
        availContainer.innerHTML = '<p style="color: var(--text-muted);">No available drives.</p>';
    }
    if (window.applyGlobalLayout) window.applyGlobalLayout();
}


async function showRawSmartDataModal(driveName) {
    const modal = document.getElementById('smart-data-raw-modal');
    const output = document.getElementById('smart-data-raw-output');
    output.textContent = 'Loading...';
    modal.classList.add('active');

    try {
        const res = await fetch(`/api/disks/${driveName}/smart-data`);
        const data = await res.json();
        if (data.status === 'success') {
            output.textContent = data.data;
        } else {
            output.textContent = `Error: ${data.message}`;
        }
    } catch (error) {
        output.textContent = `Network Error: ${error}`;
    }
}

async function showParsedSmartDataModal(driveName) {
    const modal = document.getElementById('smart-data-parsed-modal');
    const output = document.getElementById('smart-data-parsed-output');
    output.innerHTML = '<p>Loading...</p>';
    modal.classList.add('active');

    try {
        const res = await fetch(`/api/disks/${driveName}/smart-attributes`);
        const data = await res.json();
        if (data.status === 'success') {
            output.innerHTML = renderSmartTable(data.data);
        } else {
            output.innerHTML = `<p>Error: ${data.message}</p>`;
        }
    } catch (error) {
        output.innerHTML = `<p>Network Error: ${error}</p>`;
    }
}

function renderSmartTable(data) {
    if (!data || !data.attributes || data.attributes.length === 0) {
        let health = data.health || "Not Supported";
        return `<p>Overall Health: ${health}. No detailed attributes found or S.M.A.R.T. is not supported.</p>`;
    }

    let overallHealth = data.health || "Unknown";
    let healthClass = overallHealth.toLowerCase() === 'passed' ? 'status-ok' : 'status-failing';

    let table = `<div class="smart-overall-health">Overall Health Assessment: <span class="status-badge ${healthClass}">${overallHealth}</span></div>`;
    
    table += '<table class="smart-table"><thead><tr>';
    const headers = ['ID', 'Attribute Name', 'Value', 'Worst', 'Threshold', 'Raw Value', 'Status'];
    headers.forEach(h => table += `<th>${h}</th>`);
    table += '</tr></thead><tbody>';

    data.attributes.forEach(attr => {
        let statusClass = 'status-ok';
        if (attr.status === 'failing') {
            statusClass = 'status-failing';
        } else if (attr.status === 'pre-fail') {
            statusClass = 'status-pre-fail';
        }

        table += '<tr>';
        table += `<td>${attr.id}</td>`;
        table += `<td>${attr.name}</td>`;
        table += `<td>${attr.value}</td>`;
        table += `<td>${attr.worst}</td>`;
        table += `<td>${attr.thresh}</td>`;
        table += `<td>${attr.raw_value}</td>`;
        table += `<td><span class="status-badge ${statusClass}">${attr.status}</span></td>`;
        table += '</tr>';
    });

    table += '</tbody></table>';
    return table;
}

async function startSelectedTests() {
    const testType = document.getElementById('test-type').value;
    if (selectedDrives.length === 0) {
        customAlert("Please select at least one drive to start a test.");
        return;
    }

    const userFriendlyType = testType === 'long' ? 'Extended' : 'Short';
    customConfirm(`Are you sure you want to start a ${userFriendlyType} S.M.A.R.T. test on ${selectedDrives.length} drive(s)?`, async () => {
        const isDebug = localStorage.getItem('disk_hunter_debug') === 'true';
        const debugConsole = document.getElementById('debug-console');
        const debugOutput = document.getElementById('debug-output');
        if (isDebug && debugConsole && debugOutput) {
            debugConsole.style.display = 'block';
            debugOutput.innerHTML = `<span style="color: #3b82f6;">[System]</span> Initiate clicked. Sending request...<br>`;
        }

        const payload = { drives: selectedDrives, test_type: testType };
        if (isDebug && debugOutput) {
            debugOutput.innerHTML += `<span style="color: #3b82f6;">[Payload]</span> ${JSON.stringify(payload)}<br>`;
        }

        try {
            const response = await fetch('/api/smart/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await response.json();
            if (isDebug && debugOutput && result.debug) {
                debugOutput.innerHTML += `<span style="color: #a855f7;">[Backend Logs]</span><br>${result.debug.join('<br>')}<br>------------------------<br>`;
            }

            if (result.status !== 'success') {
                if (isDebug && debugOutput) debugOutput.innerHTML += `<span style="color: red;">[Error]</span> ${result.message}<br>`;
                customAlert(`Error starting tests: ${result.message}`);
            } else {
                if (isDebug && debugOutput) debugOutput.innerHTML += `<span style="color: var(--accent-green);">[Success]</span> ${result.message}<br>`;
            }
        } catch (error) {
            console.error(`Failed to start tests:`, error);
            if (isDebug && debugOutput) debugOutput.innerHTML += `<span style="color: red;">[Critical Error]</span> ${error}<br>`;
            customAlert(`Network error while trying to start the tests.`);
        }
        
        selectedDrives = [];
    });
}

window.stopTest = async function(containerName) {
    customConfirm("Are you sure you want to abort this test?", async () => {
        try {
            const response = await fetch('/api/smart/stop', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ container_name: containerName })
            });
            const result = await response.json();
            if (result.status !== 'success') {
                customAlert("Error stopping test: " + result.message);
            }
        } catch (error) {
            console.error("Failed to stop test:", error);
            customAlert("Network error while trying to stop the test.");
        }
    });
};