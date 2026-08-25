document.addEventListener('DOMContentLoaded', () => {
    fetchHistory();

    document.getElementById('btn-refresh').addEventListener('click', fetchHistory);
    document.getElementById('btn-clear-history').addEventListener('click', clearHistory);
    
    const btnExport = document.getElementById('btn-export-csv');
    if (btnExport) {
        btnExport.addEventListener('click', exportToCSV);
    }

    const btnCloseDetail = document.getElementById('btn-log-detail-close');
    if (btnCloseDetail) {
        btnCloseDetail.addEventListener('click', () => document.getElementById('log-detail-modal').classList.remove('active'));
    }
});

async function fetchHistory() {
    const tbody = document.getElementById('history-body');
    tbody.innerHTML = '<tr><td colspan="8" style="text-align: center;">Loading...</td></tr>';
    
    try {
        const response = await fetch('/api/partition-history');
        const data = await response.json();
        
        if (data.status === 'success') {
            renderHistory(data.history);
        } else {
            tbody.innerHTML = `<tr><td colspan="8" style="color: var(--accent-red); text-align: center;">Error: ${data.message}</td></tr>`;
        }
    } catch (error) {
        console.error("History fetch error:", error);
        tbody.innerHTML = '<tr><td colspan="8" style="color: var(--accent-red); text-align: center;">Failed to load history due to a network error.</td></tr>';
    }
}

function renderHistory(history) {
    const tbody = document.getElementById('history-body');
    tbody.innerHTML = '';
    
    if (!history || history.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--text-muted);">No partition history found.</td></tr>';
        return;
    }
    
    history.forEach((entry, index) => {
        let statusColor = "var(--text-main)";
        if (entry.status === 'success') statusColor = "var(--accent-green)";
        if (entry.status === 'error') statusColor = "var(--accent-red)";

        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';
        tr.title = 'Click to view the command and worker output';
        
        const paramsStr = entry.params && Array.isArray(entry.params) ? entry.params.join(', ') : 'None';

        tr.innerHTML = `
            <td style="white-space: nowrap;">${new Date(entry.timestamp).toLocaleString()}</td>
            <td style="color: var(--text-main); font-weight: bold;">${entry.event}</td>
            <td>${entry.drive || 'N/A'}</td>
            <td><code>${entry.serial || 'N/A'}</code></td>
            <td style="text-transform: uppercase; font-size: 12px; font-weight: bold; color: var(--primary);">${entry.action || 'N/A'}</td>
            <td><code>${paramsStr}</code></td>
            <td>${entry.username || 'Unknown'}</td>
            <td style="color: ${statusColor}; font-weight: bold; text-transform: uppercase;">${entry.status}</td>
        `;

        tr.addEventListener('click', () => showLogDetail(entry));
        tbody.appendChild(tr);
    });
}

function showLogDetail(entry) {
    const modal = document.getElementById('log-detail-modal');
    if (!modal) return;
    document.getElementById('log-detail-drive').innerText = entry.drive || 'N/A';
    document.getElementById('log-detail-serial').innerText = entry.serial || 'N/A';
    document.getElementById('log-detail-event').innerText = entry.event || 'N/A';
    const statusEl = document.getElementById('log-detail-status');
    if (statusEl) {
        statusEl.innerText = entry.status || 'N/A';
        statusEl.style.color = entry.status === 'success' ? 'var(--accent-green)' : (entry.status === 'error' ? 'var(--accent-red)' : 'var(--text-main)');
    }
    document.getElementById('log-detail-command').textContent = entry.command || 'N/A';
    document.getElementById('log-detail-output').textContent = entry.output || 'N/A';
    modal.classList.add('active');
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
    const tbody = document.getElementById('history-body');
    const rows = Array.from(tbody.querySelectorAll('tr'));
    
    if (rows.length === 0 || rows[0].innerText.includes('No partition history found') || rows[0].innerText.includes('Loading...')) {
        customAlert('No history data available to export.');
        return;
    }

    let csvContent = "Date & Time,Event,Drive,S/N,Action,Parameters,User (IP),Status\n";

    rows.forEach(row => {
        const cols = row.querySelectorAll('td');
        if (cols.length === 8) {
            const rowData = Array.from(cols).map(col => `"${String(col.innerText).replace(/"/g, '""')}"`);
            csvContent += rowData.join(",") + "\n";
        }
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
