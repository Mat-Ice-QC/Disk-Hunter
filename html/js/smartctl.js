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

    // --- Delegated drive-card events (one listener per container for the
    // whole page lifetime instead of per-card listeners on every rebuild) ---
    const driveList = document.getElementById('drive-list-container');
    if (driveList) {
        driveList.addEventListener('click', (e) => {
            const actionBtn = e.target.closest('[data-action]');
            if (actionBtn) {
                const action = actionBtn.dataset.action;
                if (action === 'smart-raw') showRawSmartDataModal(actionBtn.dataset.drive);
                else if (action === 'smart-parsed') showParsedSmartDataModal(actionBtn.dataset.drive);
                else if (action === 'smart-stop') stopTest(actionBtn.dataset.container);
                return;
            }
            if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') return;
            const card = e.target.closest('.drive-card');
            if (!card) return;
            const checkbox = card.querySelector('.drive-checkbox');
            if (checkbox && !checkbox.disabled) {
                checkbox.checked = !checkbox.checked;
                applySmartSelection(card, checkbox);
            }
        });
        driveList.addEventListener('change', (e) => {
            if (e.target.classList && e.target.classList.contains('drive-checkbox')) {
                applySmartSelection(e.target.closest('.drive-card'), e.target);
            }
        });
    }
    const activeList = document.getElementById('active-list-container');
    if (activeList) {
        activeList.addEventListener('click', (e) => {
            const actionBtn = e.target.closest('[data-action]');
            if (!actionBtn) return;
            if (actionBtn.dataset.action === 'smart-stop') stopTest(actionBtn.dataset.container);
        });
    }

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
        return `${d.path}:${d.busy ? 1 : 0}:${activeTest ? 'active' : 'idle'}`;
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

// Shared selection state update used by both the delegated card click and
// the checkbox change event.
function applySmartSelection(card, checkbox) {
    if (checkbox.checked) {
        if (!selectedDrives.includes(checkbox.value)) selectedDrives.push(checkbox.value);
        card.classList.add('selected');
    } else {
        selectedDrives = selectedDrives.filter(p => p !== checkbox.value);
        card.classList.remove('selected');
    }
}

function rebuildUI(disks, runningTests) {
    const availContainer = document.getElementById('drive-list-container');
    const activeContainer = document.getElementById('active-list-container');
    const activeSection = document.getElementById('active-tests-section');

    // Keyed card cache: disk.path -> { el, html, parent }. Unchanged cards
    // keep their elements (and <img>), so one test starting or stopping does
    // not rebuild every card on the page.
    if (!window.__smartCardCache) window.__smartCardCache = new Map();
    const cardCache = window.__smartCardCache;
    const cachedEls = new Set();
    cardCache.forEach(entry => cachedEls.add(entry.el));
    [availContainer, activeContainer].forEach(c => {
        Array.from(c.children).forEach(child => {
            if (!cachedEls.has(child)) child.remove(); // placeholders / stale text
        });
    });

    let activeCount = 0;
    let availableCount = 0;
    const anchors = { avail: null, active: null };
    const seen = new Set();

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

        const activeTest = runningTests.find(test => test.drive === driveName);
        const cardKey = String(disk.path);
        seen.add(cardKey);

        let kind;
        let cardHtml;
        let wantedClass;

        if (activeTest) {
            kind = 'active';
            wantedClass = 'drive-card wiping-card';
            cardHtml = `
                <div class="drive-header" style="justify-content: space-between; width: 100%;">
                    <div style="display: flex; gap: 20px; align-items: center;">
                        <div class="drive-image" style="width: 100px;">
                            <img src="${imageUrl}" onerror="this.onerror=null; this.src='${fallbackSVG}';" alt="Drive Image" decoding="async">
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
                        <button data-action="smart-stop" data-container="${activeTest.container}" class="btn-action red">Abort Test</button>
                    </div>
                </div>
            `;
        } else if (disk.busy) {
            kind = 'avail';
            wantedClass = 'drive-card busy-card';
            cardHtml = `
                <div class="drive-header">
                    <div class="drive-image" style="width: 100px;">
                        <img src="${imageUrl}" onerror="this.onerror=null; this.src='${fallbackSVG}';" alt="Drive Image" decoding="async">
                    </div>
                    <div class="drive-info">
                        <h3 style="font-size: 18px;">${fullName} <span class="badge" style="background: var(--accent-amber); color: white; margin-left: 10px;">BUSY</span></h3>
                        <p style="font-size: 13px; color: var(--text-muted);">
                            <strong>Path:</strong> <span style="color: var(--accent-red);">${disk.path}</span> | 
                            <strong>Size:</strong> ${formatBytes(diskSize)} | 
                            <strong>S/N:</strong> ${serial}
                        </p>
                        <p style="font-size: 12px; color: var(--accent-amber); margin-top: 4px;">This drive is active in another operation.</p>
                    </div>
                </div>
            `;
        } else {
            kind = 'avail';
            const isChecked = selectedDrives.includes(disk.path) ? 'checked' : '';
            wantedClass = 'drive-card' + (isChecked ? ' selected' : '');
            cardHtml = `
                <div class="drive-header">
                    <div style="padding-right: 10px; display: flex; align-items: center;">
                        <input type="checkbox" class="drive-checkbox" value="${disk.path}" ${isChecked}>
                    </div>
                    <div class="drive-image" style="width: 100px;">
                        <img src="${imageUrl}" onerror="this.onerror=null; this.src='${fallbackSVG}';" alt="Drive Image" decoding="async">
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
                    <button data-action="smart-raw" data-drive="${driveName}" class="btn-action">View Raw</button>
                    <button data-action="smart-parsed" data-drive="${driveName}" class="btn-action btn-smart">View Parsed</button>
                </div>
            `;
        }

        let entry = cardCache.get(cardKey);
        if (!entry) {
            const el = document.createElement('div');
            el.dataset.path = disk.path;
            entry = { el: el, html: '', parent: null };
            cardCache.set(cardKey, entry);
        }
        if (entry.el.className !== wantedClass) entry.el.className = wantedClass;
        if (entry.html !== cardHtml) {
            entry.el.innerHTML = cardHtml;
            entry.html = cardHtml;
        }

        const targetParent = kind === 'active' ? activeContainer : availContainer;
        if (entry.parent !== targetParent || entry.el.parentNode !== targetParent) {
            targetParent.appendChild(entry.el);
            entry.parent = targetParent;
        }
        const anchor = anchors[kind];
        if (anchor && entry.el.previousElementSibling !== anchor) {
            targetParent.insertBefore(entry.el, anchor.nextElementSibling);
        }
        anchors[kind] = entry.el;

        if (kind === 'active') activeCount++;
        else availableCount++;
    });

    // Remove cards for disks that no longer exist
    cardCache.forEach((entry, key) => {
        if (!seen.has(key)) {
            entry.el.remove();
            cardCache.delete(key);
        }
    });

    activeSection.style.display = activeCount > 0 ? 'block' : 'none';
    if (availableCount === 0 && activeCount === 0 && availContainer.children.length === 0) {
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
        let health = (data && data.health) || "Not Supported";
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
        const statusLower = String(attr.status || '').toLowerCase();
        let statusClass = 'status-ok';
        if (statusLower === 'failing' || statusLower === 'fail') {
            statusClass = 'status-failing';
        } else if (statusLower === 'pre-fail' || statusLower === 'warn') {
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
            debugConsole.style.display = 'flex';
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