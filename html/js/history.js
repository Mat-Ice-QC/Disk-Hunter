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
        const response = await fetch('/api/history');
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
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">No shredding history found.</td></tr>';
        return;
    }
    
    history.forEach(log => {
        const pdfButton = log.report_file 
            ? `<a href="/api/reports/${log.report_file}" target="_blank" class="btn-pdf" onclick="event.stopPropagation()">View PDF</a>` 
            : `<span style="color: var(--text-muted); font-size: 12px;">--</span>`;
            
        // Fallback: If it's an old log without an "event", piece it together from "drive"
        const eventText = log.event || `USER started wipe of ${log.drive || 'Unknown'}`;
            
        // Colorize the event string based on success/failure/stop
        let eventColor = "var(--text-main)";
        if(eventText.includes("started")) eventColor = "var(--primary)";
        if(eventText.includes("successfully")) eventColor = "var(--accent-green)";
        if(eventText.includes("stopped")) eventColor = "#f59e0b";
        if(eventText.includes("failed")) eventColor = "var(--accent-red)";

        // Safely handle missing methods or serials from older logs too
        const methodText = log.method ? log.method.toUpperCase() : 'UNKNOWN';
        const serialText = log.serial || 'N/A';

        const userIp = log.user_ip || 'N/A';
        const duration = log.duration ? `${log.duration}s` : 'Unknown';
        
        const tooltipHTML = `<strong>Operation Details</strong>` +
                            `Started: ${log.timestamp}<br>` +
                            `IP Address: ${userIp}<br>` +
                            `Duration: ${duration}`;
                            
        const tr = document.createElement('tr');
        tr.setAttribute('data-tooltip', tooltipHTML.replace(/"/g, '&quot;'));
        
        if (log.container_name) {
            tr.style.cursor = 'pointer';
            tr.title = 'Click to view logs';
            tr.addEventListener('click', () => showLogsModal(log.container_name));
            
            // Highlight row on hover via css if we had a specific class, or inline events:
            tr.addEventListener('mouseover', () => { tr.style.backgroundColor = 'var(--bg-lighter)'; });
            tr.addEventListener('mouseout', () => { tr.style.backgroundColor = ''; });
        }

        tr.innerHTML = `
            <td style="white-space: nowrap;">${log.timestamp}</td>
            <td style="color: ${eventColor}; font-weight: bold;">${eventText}</td>
            <td>${userIp}</td>
            <td>${serialText}</td>
            <td><span class="badge" style="background: #334155; color: white;">${methodText}</span></td>
            <td>${pdfButton}</td>
        `;
        
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

async function showLogsModal(containerName) {
    const logsOutput = document.getElementById('logs-output');
    logsOutput.textContent = 'Loading logs...';
    document.getElementById('logs-modal').classList.add('active');

    try {
        const response = await fetch(`/api/shredding/logs/${containerName}`);
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
    
    if (rows.length === 0 || rows[0].innerText.includes('No shredding history found') || rows[0].innerText.includes('Loading...')) {
        customAlert('No history data available to export.');
        return;
    }

    let csvContent = "Date & Time,Event,User (IP),Serial Number,Algorithm,Report File\n";

    rows.forEach(row => {
        const cols = row.querySelectorAll('td');
        if (cols.length === 6) {
            const dateTime = cols[0].innerText;
            const eventText = cols[1].innerText;
            const userIp = cols[2].innerText;
            const serial = cols[3].innerText;
            const method = cols[4].innerText;
            let report = "N/A";
            
            const pdfLink = cols[5].querySelector('a');
            if (pdfLink) {
                const href = pdfLink.getAttribute('href');
                if (href) {
                    report = href.split('/').pop();
                }
            }

            const rowData = [dateTime, eventText, userIp, serial, method, report].map(val => `"${String(val).replace(/"/g, '""')}"`);
            csvContent += rowData.join(",") + "\n";
        }
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
