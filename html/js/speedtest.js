let selectedDrives = {}; // drivePath -> selectedPartitionPath
let availableDisksData = [];
let testQueue = [];
let isTesting = false;
let unpartitionedDrives = []; // non-root drives lacking partitions (for mass-create)

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-start-speedtest').addEventListener('click', startSelectedTests);
    document.getElementById('btn-cancel-partition').addEventListener('click', () => {
        document.getElementById('create-partition-modal').classList.remove('active');
    });
    document.getElementById('btn-confirm-partition').addEventListener('click', createPartition);

    const btnPrepareAll = document.getElementById('btn-prepare-all-partitions');
    if (btnPrepareAll) btnPrepareAll.addEventListener('click', prepareAllPartitions);

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
let currentSpeedtestStatus = null;

document.addEventListener('ws-disks', (e) => {
    currentDisks = e.detail;
    updateSpeedtestUI();
});

document.addEventListener('ws-speedtest_status', (e) => {
    currentSpeedtestStatus = e.detail;
    updateSpeedtestUI();
});

let previousSpeedtestStateHash = "";

function updateSpeedtestUI() {
    if (!currentDisks || !currentSpeedtestStatus) return;

    const diskData = currentDisks;
    const statusData = currentSpeedtestStatus;

    if (diskData.status === 'success') {
        availableDisksData = diskData.disks;
        const runningTests = statusData.running_tests || [];
        
        const currentStateHash = diskData.disks.map(d => {
            const activeTest = runningTests.find(test => test.drive === d.name || (d.children && d.children.some(c => c.name === test.drive)));
            return `${d.path}:${activeTest ? activeTest.test_type : 'idle'}`;
        }).join('|');
        
        if (currentStateHash !== previousSpeedtestStateHash) {
            rebuildUI(diskData.disks, runningTests);
            previousSpeedtestStateHash = currentStateHash;
        } else {
            updateLiveSpeedtestLogs(runningTests);
        }
        
        // Queue manager: if nothing is running, start the next one in the queue
        if (runningTests.length === 0 && testQueue.length > 0 && !isTesting) {
            processNextInQueue();
        } else if (runningTests.length > 0) {
            isTesting = true;
        } else {
            isTesting = false;
        }
    }
}

function updateLiveSpeedtestLogs(runningTests) {
    runningTests.forEach(test => {
        const progressEl = document.getElementById(`progress-${test.drive}`);
        const logEl = document.getElementById(`log-${test.drive}`);
        if (progressEl) progressEl.innerText = `Status: ${test.progress}`;
        if (logEl) logEl.innerText = test.log;
    });
}

async function processNextInQueue() {
    if (testQueue.length === 0) return;
    isTesting = true;
    const task = testQueue.shift();
    
    try {
        const currentTz = localStorage.getItem('dh_timezone') || 'UTC';
        await window.speedtestService.start([task.partition], task.testType, task.size, currentTz);
    } catch (e) {
        console.error("Error starting queued test:", e);
        isTesting = false;
    }
}

function rebuildUI(disks, runningTests) {
    const availContainer = document.getElementById('drive-list-container');
    const activeContainer = document.getElementById('active-speedtest-list');
    const activeSection = document.getElementById('active-speedtests-section');

    availContainer.innerHTML = '';
    activeContainer.innerHTML = '';

    const protectRoot = localStorage.getItem('disk_hunter_protect_root') !== 'false';
    disks = disks.filter(d => !(protectRoot && d.is_root));

    let activeCount = 0;
    let availableCount = 0;
    unpartitionedDrives = [];

    disks.forEach(disk => {
        const diskSize = parseInt(disk.size);
        const rawVendor = disk.vendor ? disk.vendor.trim() + ' ' : '';
        const rawModel = disk.model ? disk.model.trim() : 'Unknown';
        const fullName = (rawVendor && rawModel) ? rawVendor + rawModel : 'Unknown Drive';
        const normalizedId = fullName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
        const serial = disk.serial ? disk.serial.trim() : 'N/A';
        const driveName = disk.name;
        const isReadOnly = disk.ro === true || disk.ro === "1";

        const imageUrl = `/api/images/drives/${normalizedId}.jpg?name=${disk.name}&tran=${disk.tran || ''}&rota=${disk.rota !== undefined ? disk.rota : ''}&model=${disk.model || ''}`;
        const fallbackSVG = `data:image/svg+xml;charset=UTF-8,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300" style="background:%231e293b; border-radius: 4px;"%3E%3Ctext fill="%2394a3b8" x="50%25" y="50%25" font-family="sans-serif" font-weight="bold" font-size="30" text-anchor="middle" dominant-baseline="middle"%3EDRIVE%3C/text%3E%3C/svg%3E`;

        const activeTest = runningTests.find(test => test.drive === driveName || (disk.children && disk.children.some(c => c.name === test.drive)));

        if (activeTest) {
            const card = document.createElement('div');
            card.className = 'drive-card wiping-card';
            card.innerHTML = `
                <div class="drive-header" style="justify-content: space-between; width: 100%;">
                    <div style="display: flex; gap: 20px; align-items: center;">
                        <div class="drive-image" style="width: 100px;">
                            <img src="${imageUrl}" onerror="this.onerror=null; this.src='${fallbackSVG}';" alt="Drive Image">
                        </div>
                        <div class="drive-info">
                            <h3 style="font-size: 18px; color: var(--accent-blue); margin-bottom: 5px;">${fullName} <span class="badge" style="background: var(--accent-blue); color: white; margin-left: 10px;">${activeTest.test_type} Test Running</span></h3>
                            <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 8px;">
                                <strong>Target:</strong> /dev/${activeTest.drive} | <strong>S/N:</strong> ${serial}
                            </p>
                            <div id="progress-${activeTest.drive}" style="font-family: monospace; font-size: 14px; color: var(--accent-green); margin-top: 8px;">
                                Status: ${activeTest.progress}
                            </div>
                            <div id="log-${activeTest.drive}" class="log-output" style="margin-top: 8px; font-size: 12px; color: #ccc;">${activeTest.log}</div>
                        </div>
                    </div>
                    <div style="padding-left: 15px;">
                        <button onclick="stopTest('${activeTest.container}')" class="btn-action red">Stop Test</button>
                    </div>
                </div>
            `;
            activeContainer.appendChild(card);
            activeCount++;
        } else {
            const card = document.createElement('div');
            card.className = 'drive-card';
            if (isReadOnly) card.classList.add('read-only');

            const isChecked = selectedDrives.hasOwnProperty(disk.path) ? 'checked' : '';
            if (isChecked) card.classList.add('selected');

            // Build partitions dropdown
            let partitionUI = '';
            const partitions = disk.children || [];
            if (partitions.length > 0) {
                let options = partitions.map(p => `<option value="${p.path}">${p.path} (${formatBytes(p.size)})</option>`).join('');
                partitionUI = `<select class="partition-select" id="part-sel-${driveName}">${options}</select>`;
            } else {
                if (!isReadOnly) unpartitionedDrives.push(disk.path);
                partitionUI = `<button class="btn-action" style="width:100%; margin-top: 10px;" onclick="openCreatePartitionModal('${disk.path}', event)">No Partitions - Create One</button>`;
            }

            card.innerHTML = `
                <div class="drive-header">
                    <div style="padding-right: 10px; display: flex; align-items: center;">
                        <input type="checkbox" class="drive-checkbox" value="${disk.path}" ${isChecked} ${isReadOnly || partitions.length === 0 ? 'disabled' : ''}>
                    </div>
                    <div class="drive-image" style="width: 100px;">
                        <img src="${imageUrl}" onerror="this.onerror=null; this.src='${fallbackSVG}';" alt="Drive Image">
                    </div>
                    <div class="drive-info" style="flex: 1;">
                        <h3 style="font-size: 18px;">${fullName}</h3>
                        <p style="font-size: 13px; color: var(--text-muted);">
                            <strong>Path:</strong> <span style="color: var(--accent-red);">${disk.path}</span> | 
                            <strong>Size:</strong> ${formatBytes(diskSize)}
                        </p>
                        ${partitionUI}
                    </div>
                </div>
            `;

            const checkbox = card.querySelector('.drive-checkbox');
            if (checkbox) {
                const toggleSelection = () => {
                    if (checkbox.checked) {
                        const sel = document.getElementById(`part-sel-${driveName}`);
                        if (sel) {
                            selectedDrives[disk.path] = sel.value;
                            card.classList.add('selected');
                        } else {
                            checkbox.checked = false; // Cannot select if no partition
                        }
                    } else {
                        delete selectedDrives[disk.path];
                        card.classList.remove('selected');
                    }
                };

                card.addEventListener('click', (e) => {
                    if (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT' && !checkbox.disabled) {
                        checkbox.checked = !checkbox.checked;
                        toggleSelection();
                    }
                });
                checkbox.addEventListener('change', toggleSelection);
                
                const partSelect = card.querySelector('.partition-select');
                if (partSelect) {
                    partSelect.addEventListener('change', () => {
                        if (checkbox.checked) {
                            selectedDrives[disk.path] = partSelect.value;
                        }
                    });
                }
            }
            availContainer.appendChild(card);
            availableCount++;
        }
    });

    activeSection.style.display = activeCount > 0 ? 'block' : 'none';
    if (availableCount === 0 && activeCount === 0) {
        availContainer.innerHTML = '<p style="color: var(--text-muted);">No available drives.</p>';
    }

    // Show the mass-create button only when there are unpartitioned drives
    const btnPrepareAll = document.getElementById('btn-prepare-all-partitions');
    if (btnPrepareAll) {
        btnPrepareAll.style.display = unpartitionedDrives.length > 0 ? '' : 'none';
        btnPrepareAll.textContent = `Create Partitions on ${unpartitionedDrives.length} Unpartitioned Drive${unpartitionedDrives.length === 1 ? '' : 's'}`;
    }

    if (window.applyGlobalLayout) window.applyGlobalLayout();
}

window.prepareAllPartitions = async function() {
    if (unpartitionedDrives.length === 0) {
        customAlert('No unpartitioned drives detected.', 'Nothing to do');
        return;
    }
    const label = 'gpt';
    const fsType = 'ext4';
    const size = '100%';
    customConfirm(
        `This will DESTROY any existing data and create a fresh ${label.toUpperCase()} partition table ` +
        `with a single ${fsType} partition (${size}) on each of the following ${unpartitionedDrives.length} drive(s):\n\n` +
        unpartitionedDrives.join('\n') +
        `\n\nThis cannot be undone. Continue?`,
        async () => {
            try {
                const res = await fetch('/api/partitions/prepare', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ drives: unpartitionedDrives, label: label, fs_type: fsType, size: size })
                });
                const data = await res.json();
                if (data.status === 'success' || data.status === 'partial') {
                    const msg = `Prepared ${data.succeeded}/${data.total} drive(s).` +
                        (data.failed ? ` ${data.failed} failed.` : '');
                    customAlert(msg, data.status === 'success' ? 'Success' : 'Partial');
                } else {
                    customAlert('Error: ' + (data.message || 'Failed to prepare partitions.'), 'Error');
                }
            } catch (e) {
                console.error('Prepare partitions error:', e);
                customAlert('Network error while preparing partitions.', 'Error');
            }
        },
        'Create Partitions (Destructive)'
    );
};

let pendingPartitionDrive = null;
window.openCreatePartitionModal = function(drivePath, event) {
    event.stopPropagation();
    pendingPartitionDrive = drivePath;
    document.getElementById('create-partition-modal').classList.add('active');
};

async function createPartition() {
    if (!pendingPartitionDrive) return;
    const size = document.getElementById('partition-size-input').value || '100%';
    const btn = document.getElementById('btn-confirm-partition');
    btn.disabled = true;
    btn.textContent = 'Creating...';

    try {
        // Step 1: Create GPT label
        await window.partitionService.action(pendingPartitionDrive, 'mklabel', ['gpt']);
        
        // Step 2: Create Partition
        const data = await window.partitionService.action(pendingPartitionDrive, 'mkpart', ['primary', 'ext4', '0%', size]);
        if (data.status === 'success') {
            customAlert('Partition created successfully.', 'Success');
            document.getElementById('create-partition-modal').classList.remove('active');
        } else {
            customAlert('Error creating partition: ' + data.message, 'Error');
        }
    } catch (e) {
        customAlert('Network error while creating partition.', 'Error');
    }

    btn.disabled = false;
    btn.textContent = 'Create Partition';
}

function startSelectedTests() {
    const testType = document.getElementById('speedtest-type').value;
    const testSize = document.getElementById('speedtest-size').value;
    const drivesToTest = Object.values(selectedDrives);

    if (drivesToTest.length === 0) {
        customAlert("Please select at least one drive partition to test.", "No Selection");
        return;
    }

    const sizeText = testSize === 'all' ? '1G, 10G, and 100G sizes' : `${testSize} size`;

    customConfirm(`Start speed test on ${drivesToTest.length} partition(s) with ${sizeText} each? Tests will run in the background.`, async () => {
        try {
            const currentTz = localStorage.getItem('dh_timezone') || 'UTC';
            await window.speedtestService.start(drivesToTest, testType, testSize, currentTz);
            selectedDrives = {}; // Clear selection
        } catch (e) {
            console.error("Error starting tests:", e);
            customAlert("Network error while trying to start tests.", "Error");
        }
    });
}

window.stopTest = async function(containerName) {
    customConfirm("Are you sure you want to stop this test?", async () => {
        try {
            await fetch('/api/speedtest/stop', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ container_name: containerName })
            });
        } catch (error) {
            console.error("Failed to stop test:", error);
            customAlert("Network error while trying to stop the test.", "Error");
        }
    });
};;