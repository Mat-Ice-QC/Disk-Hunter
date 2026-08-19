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
    list.innerHTML = '<tr><td colspan="4">Loading...</td></tr>';
    
    try {
        const response = await fetch('/api/iso-history');
        const data = await response.json();
        
        if (data.status === 'success') {
            renderHistory(data.history);
        } else {
            list.innerHTML = `<tr><td colspan="4" style="color: var(--accent-red);">Error: ${data.message}</td></tr>`;
        }
    } catch (error) {
        console.error("Failed to fetch history:", error);
        list.innerHTML = '<tr><td colspan="4" style="color: var(--accent-red);">Failed to load history due to a network error.</td></tr>';
    }
}

function renderHistory(history) {
    const list = document.getElementById('history-list');
    list.innerHTML = '';
    
    if (!history || history.length === 0) {
        list.innerHTML = '<tr><td colspan="4">No history found.</td></tr>';
        return;
    }
    
    history.forEach(entry => {
        let statusClass = 'status-ok';
        if (entry.status && (entry.status.toLowerCase() === 'failed' || entry.status.toLowerCase() === 'error')) {
            statusClass = 'status-failing';
        } else if (entry.status && entry.status.toLowerCase() === 'started') {
            statusClass = 'status-pre-fail'; 
        }

        const tr = document.createElement('tr');

        tr.innerHTML = `
            <td>${entry.timestamp || 'N/A'}</td>
            <td>${entry.event || 'N/A'}</td>
            <td>${entry.username || 'Unknown'}</td>
            <td><span class="status-badge ${statusClass}">${entry.status || 'N/A'}</span></td>
        `;
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
    const list = document.getElementById('history-list');
    const rows = Array.from(list.querySelectorAll('tr'));
    if (rows.length === 0 || rows[0].innerText.includes('No history found') || rows[0].innerText.includes('Loading history...')) {
        customAlert('No history data available to export.');
        return;
    }

    let csvContent = "Date / Time,Event,User (IP),Status\n";

    rows.forEach(row => {
        const cols = row.querySelectorAll('td');
        if (cols.length === 4) {
            const rowData = Array.from(cols).map(col => `"${String(col.innerText).replace(/"/g, '""')}"`);
            csvContent += rowData.join(",") + "\n";
        }
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
