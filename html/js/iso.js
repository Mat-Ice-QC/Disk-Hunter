document.addEventListener('DOMContentLoaded', () => {
    console.log("ISO downloader module loaded.");
    loadIsos();
    loadDisks();

    document.getElementById('btn-download-iso').addEventListener('click', startDownload);
    document.getElementById('btn-write-iso').addEventListener('click', startWrite);

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

// Cached last-rendered HTML for the status containers. Skip DOM writes when
// nothing changed. Keys map to per-task state snapshots so progress-only
// updates can be applied in place.
let lastDownloadHtml = '';
let lastWriteHtml = '';
let lastDownloadStates = {};
let lastWriteStates = {};

function ensureIsoExtension(name) {
    const lower = name.toLowerCase();
    if (lower.endsWith('.iso') || lower.endsWith('.img')) return name;
    return name + '.iso';
}

async function loadIsos() {
    try {
        const response = await fetch('/api/iso/list');
        const isos = await response.json();
        const select = document.getElementById('select-iso');
        select.innerHTML = '<option value="">Select an ISO...</option>';
        isos.forEach(iso => {
            const sizeMb = (iso.size / (1024 * 1024)).toFixed(2);
            select.innerHTML += `<option value="${iso.filename}">${iso.filename} (${sizeMb} MB)</option>`;
        });
    } catch (e) {
        console.error("Failed to load ISOs", e);
    }
}

async function loadDisks() {
    try {
        const data = await window.diskService.getDisks();
        const disks = data.disks || [];
        const select = document.getElementById('select-disk');
        select.innerHTML = '<option value="">Select a Disk...</option>';
        disks.forEach(disk => {
            select.innerHTML += `<option value="${disk.name}">${disk.name} - ${disk.model} (${disk.size})</option>`;
        });
    } catch (e) {
        console.error("Failed to load Disks", e);
    }
}

async function startDownload() {
    const url = document.getElementById('iso-url').value;
    let filename = document.getElementById('iso-filename').value;

    if(!url || !filename) {
        customAlert("Please provide URL and Filename");
        return;
    }

    filename = ensureIsoExtension(filename);
    document.getElementById('iso-filename').value = filename;

    const isDebug = localStorage.getItem('disk_hunter_debug') === 'true';
    const debugConsole = document.getElementById('debug-console');
    const debugOutput = document.getElementById('debug-output');
    if (isDebug && debugConsole && debugOutput) {
        debugConsole.style.display = 'flex';
        debugOutput.innerHTML = `<span style="color: #3b82f6;">[System]</span> Download clicked. Sending request...<br>`;
    }

    const payload = {url, filename};
    if (isDebug && debugOutput) {
        debugOutput.innerHTML += `<span style="color: #3b82f6;">[Payload]</span> ${JSON.stringify(payload)}<br>`;
    }

    try {
        const res = await fetch('/api/iso/download', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        const result = await res.json();

        if (isDebug && debugOutput && result.debug) {
            debugOutput.innerHTML += `<span style="color: #a855f7;">[Backend Logs]</span><br>${result.debug.join('<br>')}<br>------------------------<br>`;
        }

        if(!res.ok) {
            if (isDebug && debugOutput) debugOutput.innerHTML += `<span style="color: red;">[Error]</span> ${result.detail || result.message}<br>`;
            customAlert("Error: " + (result.detail || result.message));
        } else {
            if (isDebug && debugOutput) debugOutput.innerHTML += `<span style="color: var(--accent-green);">[Success]</span> ${result.message || 'Download started'}<br>`;
            document.getElementById('iso-url').value = '';
            document.getElementById('iso-filename').value = '';
        }
    } catch (e) {
        if (isDebug && debugOutput) debugOutput.innerHTML += `<span style="color: red;">[Critical Error]</span> ${e}<br>`;
        customAlert("Request failed");
    }
}

async function startWrite() {
    const filename = document.getElementById('select-iso').value;
    const device = document.getElementById('select-disk').value;
    
    if(!filename || !device) {
        customAlert("Please select both ISO and Target Disk");
        return;
    }
    
    customConfirm(`Are you absolutely sure you want to write ${filename} to /dev/${device}? ALL DATA WILL BE ERASED.`, async () => {
        const isDebug = localStorage.getItem('disk_hunter_debug') === 'true';
        const debugConsole = document.getElementById('debug-console');
        const debugOutput = document.getElementById('debug-output');
        if (isDebug && debugConsole && debugOutput) {
            debugConsole.style.display = 'flex';
            debugOutput.innerHTML = `<span style="color: #3b82f6;">[System]</span> Write clicked. Sending request...<br>`;
        }

        const payload = {filename, device};
        if (isDebug && debugOutput) {
            debugOutput.innerHTML += `<span style="color: #3b82f6;">[Payload]</span> ${JSON.stringify(payload)}<br>`;
        }

        try {
            const res = await fetch('/api/iso/write', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(payload)
            });
            const result = await res.json();
            
            if (isDebug && debugOutput && result.debug) {
                debugOutput.innerHTML += `<span style="color: #a855f7;">[Backend Logs]</span><br>${result.debug.join('<br>')}<br>------------------------<br>`;
            }

            if(!res.ok) {
                if (isDebug && debugOutput) debugOutput.innerHTML += `<span style="color: red;">[Error]</span> ${result.detail || result.message}<br>`;
                customAlert("Error: " + (result.detail || result.message));
            } else {
                if (isDebug && debugOutput) debugOutput.innerHTML += `<span style="color: var(--accent-green);">[Success]</span> ${result.message || 'Write started'}<br>`;
                // Success, wait for WebSocket updates
            }
        } catch (e) {
            if (isDebug && debugOutput) debugOutput.innerHTML += `<span style="color: red;">[Critical Error]</span> ${e}<br>`;
            customAlert("Request failed");
        }
    }, "DANGER: Confirm ISO Write");
}

document.addEventListener('ws-iso_download_status', (e) => {
    updateDownloadStatus(e.detail);
});

function updateDownloadStatus(tasks) {
    try {
        const container = document.getElementById('download-status-container');
        const entries = Object.entries(tasks);

        // Progress-only updates: update bar in place to avoid innerHTML churn.
        let progressOnly = entries.length === Object.keys(lastDownloadStates).length;
        if (progressOnly) {
            for (const [taskId, task] of entries) {
                const prev = lastDownloadStates[taskId];
                if (!prev) { progressOnly = false; break; }
                if (prev.status !== task.status ||
                    prev.error !== task.error ||
                    prev.filename !== task.filename) {
                    progressOnly = false;
                    break;
                }
            }
        }

        if (progressOnly) {
            for (const [taskId, task] of entries) {
                const prev = lastDownloadStates[taskId];
                if (prev.progress === task.progress) continue;
                const row = container.querySelector(`[data-task-id="${taskId}"] .progress-bar`);
                if (row) row.style.width = `${task.progress}%`;
            }
            lastDownloadStates = {};
            for (const [taskId, task] of entries) {
                lastDownloadStates[taskId] = {
                    status: task.status,
                    progress: task.progress,
                    filename: task.filename,
                    error: task.error
                };
            }
            const hasCompleted = entries.some(([, t]) => t.status === 'completed');
            if (hasCompleted && Math.random() < 0.2) {
                loadIsos();
            }
            return;
        }

        let html = '';
        for(const [taskId, task] of entries) {
            let cls = '';
            if(task.status === 'completed') cls = 'completed';
            if(task.status === 'error') cls = 'error';

            html += `<div class="status-item ${cls}" data-task-id="${taskId}">
                <strong>Downloading:</strong> ${task.filename}
                <span style="color: var(--text-muted);">(${task.status})</span>
                ${task.status === 'downloading' ? `<div class="progress-bar-container"><div class="progress-bar" style="width: ${task.progress}%"></div></div>` : ''}
                ${task.error ? `<p style="color: var(--accent-red); background: transparent; border: none;">${task.error}</p>` : ''}
            </div>`;
        }

        if (html === lastDownloadHtml) return;
        lastDownloadHtml = html;
        container.innerHTML = html;

        lastDownloadStates = {};
        for (const [taskId, task] of entries) {
            lastDownloadStates[taskId] = {
                status: task.status,
                progress: task.progress,
                filename: task.filename,
                error: task.error
            };
        }

        // Refresh ISO list if any completed
        const hasCompleted = entries.some(([, t]) => t.status === 'completed');
        if(hasCompleted && Math.random() < 0.2) { // just randomly refresh so we don't spam
            loadIsos();
        }
    } catch (e) {
        console.error("Update failed", e);
    }
}

document.addEventListener('ws-iso_write_status', (e) => {
    updateWriteStatus(e.detail);
});

function updateWriteStatus(tasks) {
    try {
        let html = '';
        for(const [taskId, task] of Object.entries(tasks)) {
            let cls = '';
            if(task.status === 'completed') cls = 'completed';
            if(task.status === 'error') cls = 'error';

            html += `<div class="status-item ${cls}" data-task-id="${taskId}">
                <strong>Writing:</strong> ${task.filename} to /dev/${task.device}
                <span style="color: var(--text-muted);">(${task.status})</span>
                ${task.last_log ? `<p>> ${task.last_log}</p>` : ''}
                ${task.error ? `<p style="color: var(--accent-red); background: transparent; border: none;">${task.error}</p>` : ''}
            </div>`;
        }

        const container = document.getElementById('write-status-container');
        if (html === lastWriteHtml) return;
        lastWriteHtml = html;
        container.innerHTML = html;
    } catch (e) {
        console.error("Update failed", e);
    }
}
