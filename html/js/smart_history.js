let currentHistory = [];

document.addEventListener('DOMContentLoaded', () => {
    fetchHistory();

    document.getElementById('btn-refresh').addEventListener('click', fetchHistory);
    document.getElementById('btn-clear-history').addEventListener('click', clearHistory);
    
    const btnExport = document.getElementById('btn-export-csv');
    if (btnExport) {
        btnExport.addEventListener('click', exportToCSV);
    }
});

async function fetchHistory() {
    const tbody = document.getElementById('history-body');
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">Loading...</td></tr>';
    
    try {
        const response = await fetch('/api/smart-history');
        const data = await response.json();
        
        if (data.status === 'success') {
            renderHistory(data.history);
        } else {
            tbody.innerHTML = `<tr><td colspan="5" style="color: var(--accent-red); text-align: center;">Error: ${HistoryCommon.escapeHtml(data.message)}</td></tr>`;
        }
    } catch (error) {
        console.error("History fetch error:", error);
        tbody.innerHTML = '<tr><td colspan="5" style="color: var(--accent-red); text-align: center;">Failed to load history due to a network error.</td></tr>';
    }
}

function renderHistory(history) {
    const tbody = document.getElementById('history-body');
    tbody.innerHTML = '';
    currentHistory = history || [];
    
    if (currentHistory.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">No S.M.A.R.T. history found.</td></tr>';
        return;
    }
    
    currentHistory.forEach(entry => {
        const details = entry.test_type ? ['Test: ' + entry.test_type] : [];

        const options = {
            title: 'S.M.A.R.T. Test Logs',
            details: details,
            logUrl: entry.container_name ? () => `/api/smart/logs/${encodeURIComponent(entry.container_name)}` : null,
            extraHtml: entry.drive ? `<button class="btn-action btn-sm" style="margin-top:8px;" onclick="event.stopPropagation(); viewSelfTestLog('${entry.drive.replace('/dev/', '')}')">View Self-Test Log</button>` : ''
        };

        const tr = document.createElement('tr');
        tr.innerHTML = HistoryCommon.renderLogHeader(entry, options);
        HistoryCommon.makeRowClickable(tr, entry, options);

        tbody.appendChild(tr);
    });
}

function clearHistory() {
    customConfirm("Are you sure you want to clear all S.M.A.R.T. history? This cannot be undone.", async () => {
        try {
            const response = await fetch('/api/smart-history/clear', { method: 'DELETE' });
            const result = await response.json();
            if (result.status === 'success') {
                fetchHistory();
            } else {
                customAlert("Error clearing history: " + result.message, "Error");
            }
        } catch (error) {
            console.error("Failed to clear history:", error);
            customAlert("Failed to clear history due to a network error.", "Error");
        }
    });
}

async function viewSelfTestLog(diskName) {
    try {
        const res = await fetch(`/api/smart/selftest-log/${encodeURIComponent(diskName)}`);
        const data = await res.json();
        if (data.status !== 'success') {
            customAlert('Could not load self-test log: ' + (data.message || 'Unknown error'));
            return;
        }
        const entries = data.entries || [];
        let html = '';
        if (entries.length === 0) {
            html = '<p>No self-test log entries found.</p>';
        } else {
            html = '<table class="selftest-log-table"><thead><tr><th>#</th><th>Description</th><th>Status</th><th>Remaining</th><th>Lifetime</th><th>LBA</th></tr></thead><tbody>';
            entries.forEach(e => {
                html += `<tr><td>${HistoryCommon.escapeHtml(e.num)}</td><td>${HistoryCommon.escapeHtml(e.description)}</td><td>${HistoryCommon.escapeHtml(e.status)}</td><td>${HistoryCommon.escapeHtml(e.remaining)}</td><td>${HistoryCommon.escapeHtml(e.lifetime)}</td><td>${HistoryCommon.escapeHtml(e.lba)}</td></tr>`;
            });
            html += '</tbody></table>';
        }
        const modal = document.createElement('div');
        modal.className = 'modal-overlay active';
        modal.id = 'selftest-log-modal';
        modal.innerHTML = `
            <div class="modal-box" style="max-width: 900px;">
                <div class="modal-header">Self-Test Log: /dev/${HistoryCommon.escapeHtml(diskName)} <span class="close-btn" onclick="document.getElementById('selftest-log-modal').remove()">&times;</span></div>
                <div class="modal-content">${html}</div>
                <div class="modal-actions"><button class="btn-modal-cancel" onclick="document.getElementById('selftest-log-modal').remove()">Close</button></div>
            </div>
        `;
        document.body.appendChild(modal);
    } catch (e) {
        customAlert('Network error loading self-test log.');
    }
}
window.viewSelfTestLog = viewSelfTestLog;

function exportToCSV() {
    if (currentHistory.length === 0) {
        customAlert('No history data available to export.');
        return;
    }

    let csvContent = "Date & Time,Event,User (IP),Serial Number,Inventory ID,Status\n";

    currentHistory.forEach(entry => {
        const rowData = [
            HistoryCommon.formatTimestamp(entry.timestamp),
            entry.event || 'N/A',
            entry.username || 'N/A',
            entry.serial || 'N/A',
            entry.inventory_id || 'N/A',
            entry.status || 'N/A'
        ].map(val => `"${String(val).replace(/"/g, '""')}"`);
        csvContent += rowData.join(",") + "\n";
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "smart_history.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
