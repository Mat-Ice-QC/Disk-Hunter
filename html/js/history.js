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
        const response = await fetch('/api/history');
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
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">No shredding history found.</td></tr>';
        return;
    }
    
    currentHistory.forEach(log => {
        // Fallback: If it's an old log without an "event", piece it together from "drive"
        const eventText = log.event || `USER started wipe of ${log.drive || 'Unknown'}`;
        const details = ['Method: ' + (log.method ? log.method.toUpperCase() : 'UNKNOWN')];

        const reportLink = log.report_file 
            ? `<a href="/api/reports/${encodeURIComponent(log.report_file)}" target="_blank" class="btn-pdf" onclick="event.stopPropagation()">View PDF</a>` 
            : '';

        const options = {
            title: 'Shredding Logs',
            event: eventText,
            details: details,
            logUrl: log.container_name ? () => `/api/shredding/logs/${encodeURIComponent(log.container_name)}` : null
        };

        const tr = document.createElement('tr');
        tr.innerHTML = HistoryCommon.renderLogHeader(log, { event: eventText, details: details, extraHtml: reportLink });
        HistoryCommon.makeRowClickable(tr, log, options);

        const duration = log.duration ? `${log.duration}s` : 'Unknown';
        const tooltipHTML = `<strong>Operation Details</strong>` +
                            `Started: ${HistoryCommon.escapeHtml(log.timestamp || 'N/A')}<br>` +
                            `IP Address: ${HistoryCommon.escapeHtml(log.user_ip || log.username || 'N/A')}<br>` +
                            `Duration: ${HistoryCommon.escapeHtml(duration)}`;
        tr.setAttribute('data-tooltip', tooltipHTML.replace(/"/g, '&quot;'));

        tbody.appendChild(tr);
    });
}

function clearHistory() {
    customConfirm("Are you sure you want to clear all shredding history? This cannot be undone.", async () => {
        try {
            const response = await fetch('/api/history/clear', { method: 'DELETE' });
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

    let csvContent = "Date & Time,Event,User (IP),Serial Number,Inventory ID,Algorithm,Report File\n";

    currentHistory.forEach(log => {
        const rowData = [
            HistoryCommon.formatTimestamp(log.timestamp),
            log.event || `USER started wipe of ${log.drive || 'Unknown'}`,
            log.user_ip || log.username || 'N/A',
            log.serial || 'N/A',
            log.inventory_id || 'N/A',
            log.method ? log.method.toUpperCase() : 'UNKNOWN',
            log.report_file || 'N/A'
        ].map(val => `"${String(val).replace(/"/g, '""')}"`);
        csvContent += rowData.join(",") + "\n";
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "shredding_history.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
