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
            logUrl: entry.container_name ? () => `/api/smart/logs/${encodeURIComponent(entry.container_name)}` : null
        };

        const tr = document.createElement('tr');
        tr.innerHTML = HistoryCommon.renderLogHeader(entry, { details: details });
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

function exportToCSV() {
    if (currentHistory.length === 0) {
        customAlert('No history data available to export.');
        return;
    }

    let csvContent = "Date & Time,Event,User (IP),Serial Number,Status\n";

    currentHistory.forEach(entry => {
        const rowData = [
            HistoryCommon.formatTimestamp(entry.timestamp),
            entry.event || 'N/A',
            entry.username || 'N/A',
            entry.serial || 'N/A',
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
