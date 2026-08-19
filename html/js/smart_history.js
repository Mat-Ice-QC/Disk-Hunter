document.addEventListener('DOMContentLoaded', () => {
    fetchHistory();

    document.getElementById('btn-refresh').addEventListener('click', fetchHistory);
    document.getElementById('btn-clear-history').addEventListener('click', clearHistory);
    
    const btnExport = document.getElementById('btn-export-csv');
    if (btnExport) {
        btnExport.addEventListener('click', exportToCSV);
    }
    
    
    const btnCloseLogs = document.getElementById('btn-close-logs');
    if (btnCloseLogs) {
        btnCloseLogs.addEventListener('click', () => {
            document.getElementById('logs-modal').classList.remove('active');
        });
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
            tbody.innerHTML = `<tr><td colspan="5" style="color: var(--accent-red); text-align: center;">Error: ${data.message}</td></tr>`;
        }
    } catch (error) {
        console.error("History fetch error:", error);
        tbody.innerHTML = '<tr><td colspan="5" style="color: var(--accent-red); text-align: center;">Failed to load history due to a network error.</td></tr>';
    }
}

function renderHistory(history) {
    const tbody = document.getElementById('history-body');
    tbody.innerHTML = '';
    
    if (!history || history.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">No S.M.A.R.T. history found.</td></tr>';
        return;
    }
    
    history.forEach(entry => {
        let statusColor = "var(--text-main)";
        if (entry.status === 'completed') statusColor = "var(--accent-green)";
        if (entry.status === 'failed') statusColor = "var(--accent-red)";
        if (entry.status === 'started') statusColor = "var(--primary)";

        const tr = document.createElement('tr');
        
        if (entry.container_name) {
            tr.style.cursor = 'pointer';
            tr.title = 'Click to view logs';
            tr.addEventListener('click', () => showLogsModal(entry.container_name));
            tr.addEventListener('mouseover', () => { tr.style.backgroundColor = 'var(--bg-lighter)'; });
            tr.addEventListener('mouseout', () => { tr.style.backgroundColor = ''; });
        }

        tr.innerHTML = `
            <td style="white-space: nowrap;">${new Date(entry.timestamp).toLocaleString()}</td>
            <td style="color: var(--text-main); font-weight: bold;">${entry.event}</td>
            <td>${entry.username || 'Unknown'}</td>
            <td>${entry.serial || 'N/A'}</td>
            <td style="color: ${statusColor}; font-weight: bold; text-transform: uppercase;">${entry.status}</td>
        `;
        
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

async function showLogsModal(containerName) {
    const logsOutput = document.getElementById('logs-output');
    logsOutput.textContent = 'Loading logs...';
    document.getElementById('logs-modal').classList.add('active');

    try {
        const response = await fetch(`/api/smart/logs/${containerName}`);
        const data = await response.json();
        
        if (data.status === 'success') {
            logsOutput.textContent = data.logs || 'No logs available.';
        } else {
            logsOutput.textContent = `Error: ${data.message}`;
        }
    } catch (error) {
        console.error("Failed to fetch logs:", error);
        logsOutput.textContent = 'Failed to load logs due to a network error.';
    }
}

function exportToCSV() {
    const tbody = document.getElementById('history-body');
    const rows = Array.from(tbody.querySelectorAll('tr'));
    
    if (rows.length === 0 || rows[0].innerText.includes('No S.M.A.R.T. history found') || rows[0].innerText.includes('Loading...')) {
        customAlert('No history data available to export.');
        return;
    }

    let csvContent = "Date & Time,Event,User (IP),Serial Number,Status\n";

    rows.forEach(row => {
        const cols = row.querySelectorAll('td');
        if (cols.length === 5) {
            const rowData = Array.from(cols).map(col => `"${String(col.innerText).replace(/"/g, '""')}"`);
            csvContent += rowData.join(",") + "\n";
        }
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
