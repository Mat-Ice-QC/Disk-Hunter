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
    const list = document.getElementById('history-list');
    list.innerHTML = '<tr><td colspan="5">Loading...</td></tr>';
    
    try {
        const response = await fetch('/api/iso-history');
        const data = await response.json();
        
        if (data.status === 'success') {
            renderHistory(data.history);
        } else {
            list.innerHTML = `<tr><td colspan="5" style="color: var(--accent-red);">Error: ${HistoryCommon.escapeHtml(data.message)}</td></tr>`;
        }
    } catch (error) {
        console.error("Failed to fetch history:", error);
        list.innerHTML = '<tr><td colspan="5" style="color: var(--accent-red);">Failed to load history due to a network error.</td></tr>';
    }
}

function renderHistory(history) {
    const list = document.getElementById('history-list');
    list.innerHTML = '';
    currentHistory = history || [];
    
    if (currentHistory.length === 0) {
        list.innerHTML = '<tr><td colspan="5">No history found.</td></tr>';
        return;
    }
    
    currentHistory.forEach(entry => {
        const details = [];
        if (entry.filename) details.push('File: ' + entry.filename);
        if (entry.url) details.push('URL: ' + entry.url);
        if (entry.size_bytes != null) details.push('Size: ' + entry.size_bytes + ' bytes');

        // ISO entries have no per-entry log endpoint; the modal shows entry.output if present
        const options = {
            title: 'ISO Log Details',
            details: details
        };

        const tr = document.createElement('tr');
        tr.innerHTML = HistoryCommon.renderLogHeader(entry, { details: details });
        HistoryCommon.makeRowClickable(tr, entry, options);

        list.appendChild(tr);
    });
}

function clearHistory() {
    customConfirm("Are you sure you want to clear all ISO history? This cannot be undone.", async () => {
        try {
            const response = await fetch('/api/iso-history/clear', { method: 'DELETE' });
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

    let csvContent = "Date / Time,Event,User (IP),Status\n";

    currentHistory.forEach(entry => {
        const rowData = [
            HistoryCommon.formatTimestamp(entry.timestamp),
            entry.event || 'N/A',
            entry.username || 'N/A',
            entry.status || 'N/A'
        ].map(val => `"${String(val).replace(/"/g, '""')}"`);
        csvContent += rowData.join(",") + "\n";
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "iso_history.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
