let selectedDrives = [];
let availableDisksData = [];
let previousDisks = '';
let previousStatus = '';

document.addEventListener('DOMContentLoaded', () => {
    fetchData();
    setInterval(fetchData, 5000);

    document.getElementById('btn-initiate-tests').addEventListener('click', startSelectedTests);
    document.getElementById('btn-close-raw-modal').addEventListener('click', () => {
        document.getElementById('smart-data-raw-modal').classList.remove('active');
    });
    document.getElementById('btn-close-parsed-modal').addEventListener('click', () => {
        document.getElementById('smart-data-parsed-modal').classList.remove('active');
    });
});

function formatBytes(bytes, decimals = 1) {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

async function fetchData() {
    try {
        const protectRoot = localStorage.getItem('disk_hunter_protect_root') !== 'false';
        const [disksRes, statusRes] = await Promise.all([
            fetch(`/api/disks?exclude_root=${protectRoot}`).catch(e => ({ error: 'disks', details: e })),
            fetch('/api/smart-status').catch(e => ({ error: 'smart-status', details: e }))
        ]);

        if (disksRes.error || statusRes.error) {
            const errors = [disksRes, statusRes].filter(r => r.error);
            for (const err of errors) {
                console.error(`Failed to fetch ${err.error}:`, err.details);
            }
            document.getElementById('drive-list-container').innerHTML = `<p style="color: red;">Error fetching data. Check console for details.</p>`;
            return;
        }

        const diskData = await disksRes.json();
        const statusData = await statusRes.json();

        if (diskData.status !== 'success') {
            document.getElementById('drive-list-container').innerHTML = `<p style="color: red;">Error fetching disks: ${diskData.message}</p>`;
            return;
        }

        const disksJson = JSON.stringify(diskData.disks);
        const statusJson = JSON.stringify(statusData);

        if (disksJson !== previousDisks || statusJson !== previousStatus) {
            availableDisksData = diskData.disks;
            const runningTests = statusData.running_tests || [];
            rebuildUI(diskData.disks, runningTests);
            previousDisks = disksJson;
            previousStatus = statusJson;
        }

    } catch (error) {
        console.error("Failed to process data:", error);
         document.getElementById('drive-list-container').innerHTML = `<p style="color: red;">A critical error occurred while processing data.</p>`;
    }
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

        const imageUrl = `/api/images/drives/${normalizedId}.jpg`;
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
                            <div style="font-family: monospace; font-size: 14px; color: var(--accent-green); margin-top: 8px;">
                                ${activeTest.progress}
                            </div>
                            <div class="log-output" style="margin-top: 8px;">${activeTest.log}</div>
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
        alert("Please select at least one drive to start a test.");
        return;
    }

    const userFriendlyType = testType === 'long' ? 'Extended' : 'Short';
    if (!confirm(`Are you sure you want to start a ${userFriendlyType} S.M.A.R.T. test on ${selectedDrives.length} drive(s)?`)) return;

    try {
        const response = await fetch('/api/smart/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ drives: selectedDrives, test_type: testType })
        });
        const result = await response.json();
        if (result.status !== 'success') {
            alert(`Error starting tests: ${result.message}`);
        }
    } catch (error) {
        console.error(`Failed to start tests:`, error);
        alert(`Network error while trying to start the tests.`);
    }
    
    selectedDrives = [];
    fetchData();
}

window.stopTest = async function(containerName) {
    if (!confirm("Are you sure you want to abort this test?")) return;

    try {
        const response = await fetch('/api/smart/stop', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ container_name: containerName })
        });
        const result = await response.json();
        if (result.status !== 'success') {
            alert("Error stopping test: " + result.message);
        }
        fetchData();
    } catch (error) {
        console.error("Failed to stop test:", error);
        alert("Network error while trying to stop the test.");
    }
};