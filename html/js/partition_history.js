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
        const response = await fetch('/api/partition-history');
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
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">No partition history found.</td></tr>';
        return;
    }
    
    currentHistory.forEach(entry => {
        const paramsStr = entry.params && Array.isArray(entry.params) ? entry.params.join(', ') : 'None';
        const details = [
            'Action: ' + (entry.action || 'N/A').toUpperCase(),
            'Params: ' + paramsStr
        ];

        // Partition entries carry the worker output inline; no per-entry log endpoint
        const options = {
            title: 'Log Details',
            details: details
        };

        const tr = document.createElement('tr');
        tr.innerHTML = HistoryCommon.renderLogHeader(entry, { details: details });
        HistoryCommon.makeRowClickable(tr, entry, options);

        tbody.appendChild(tr);
    });
}

function clearHistory() {
    customConfirm("Are you sure you want to clear all partition history? This cannot be undone.", async () => {
        try {
            const response = await fetch('/api/partition-history/clear', { method: 'DELETE' });
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

function exportToCSV() {
    if (currentHistory.length === 0) {
        customAlert('No history data available to export.');
        return;
    }

    let csvContent = "Date & Time,Event,Drive,S/N,Inventory ID,Action,Parameters,User (IP),Status\n";

    currentHistory.forEach(entry => {
        const rowData = [
            HistoryCommon.formatTimestamp(entry.timestamp),
            entry.event || 'N/A',
            entry.drive || 'N/A',
            entry.serial || 'N/A',
            entry.inventory_id || 'N/A',
            entry.action || 'N/A',
            entry.params && Array.isArray(entry.params) ? entry.params.join(', ') : 'None',
            entry.username || 'N/A',
            entry.status || 'N/A'
        ].map(val => `"${String(val).replace(/"/g, '""')}"`);
        csvContent += rowData.join(",") + "\n";
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "partition_history.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
