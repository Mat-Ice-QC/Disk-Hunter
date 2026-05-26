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
    const list = document.getElementById('history-list');
    list.innerHTML = '<tr><td colspan="7">Loading...</td></tr>';
    
    try {
        const response = await fetch('/api/speedtest-history');
        const data = await response.json();
        
        if (data.status === 'success') {
            renderHistory(data.history);
        } else {
            list.innerHTML = `<tr><td colspan="7" style="color: var(--accent-red);">Error: ${data.message}</td></tr>`;
        }
    } catch (error) {
        console.error("Failed to fetch history:", error);
        list.innerHTML = '<tr><td colspan="7" style="color: var(--accent-red);">Failed to load history due to a network error.</td></tr>';
    }
}

function renderHistory(history) {
    const list = document.getElementById('history-list');
    list.innerHTML = '';
    
    if (!history || history.length === 0) {
        list.innerHTML = '<tr><td colspan="7">No history found.</td></tr>';
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
        if (entry.container_name) {
            tr.style.cursor = 'pointer';
            tr.title = 'Click to view logs';
            tr.addEventListener('click', () => showLogsModal(entry.container_name));
        }

        tr.innerHTML = `
            <td>${entry.timestamp || 'N/A'}</td>
            <td>${entry.event || 'N/A'}</td>
            <td>${entry.username || 'Unknown'}</td>
            <td>${entry.serial || 'N/A'}</td>
            <td>${entry.test_type || 'N/A'}</td>
            <td><span class="status-badge ${statusClass}">${entry.status || 'N/A'}</span></td>
            <td>${entry.read_speed || 'N/A'}</td>
            <td>${entry.write_speed || 'N/A'}</td>
        `;
        list.appendChild(tr);
    });
}

function clearHistory() {
    customConfirm("Are you sure you want to clear all speed test history? This cannot be undone.", async () => {
        try {
            const response = await fetch('/api/speedtest-history/clear', { method: 'DELETE' });
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
        const response = await fetch(`/api/speedtest/logs/${containerName}`);
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
    const list = document.getElementById('history-list');
    const rows = Array.from(list.querySelectorAll('tr'));
    if (rows.length === 0 || rows[0].innerText.includes('No history found') || rows[0].innerText.includes('Loading history...')) {
        customAlert('No history data available to export.');
        return;
    }

    let csvContent = "Date / Time,User (IP),Drive S/N,Base Type,Status,Read Speed 1G,Write Speed 1G,Read Speed 10G,Write Speed 10G,Read Speed 100G,Write Speed 100G\n";

    const groups = [];
    
    // Process rows from oldest to newest (bottom to top) to group chronologically
    rows.reverse().forEach(row => {
        const cols = row.querySelectorAll('td');
        if (cols.length === 8) {
            const statusText = cols[5].innerText.toLowerCase();
            if (statusText.includes('completed')) {
                const dateTime = cols[0].innerText;
                const userIp = cols[2].innerText;
                const driveSN = cols[3].innerText;
                const typeStr = cols[4].innerText;
                const readSpeed = cols[6].innerText;
                const writeSpeed = cols[7].innerText;

                let baseType = typeStr;
                let size = '1G'; 
                const sizeMatch = typeStr.match(/\((.*?)\)/);
                if (sizeMatch) {
                    size = sizeMatch[1];
                    baseType = typeStr.split(' ')[0];
                }

                const dateHour = dateTime.substring(0, 13);
                
                // Find a group from the same hour, same drive, same base type, that doesn't already have this size
                let group = groups.find(g => g.driveSN === driveSN && g.baseType === baseType && g.dateHour === dateHour && !g.speeds[size]);
                
                if (!group) {
                    group = {
                        dateTime: dateTime,
                        userIp: userIp,
                        driveSN: driveSN,
                        baseType: baseType,
                        dateHour: dateHour,
                        status: 'Completed',
                        speeds: {}
                    };
                    groups.push(group);
                } else {
                    // Update dateTime to the latest test in the sequence
                    group.dateTime = dateTime;
                }

                group.speeds[size] = { read: readSpeed, write: writeSpeed };
            }
        }
    });

    // Reverse back to newest first
    groups.reverse().forEach(g => {
        const r1 = g.speeds['1G'] ? g.speeds['1G'].read : 'N/A';
        const w1 = g.speeds['1G'] ? g.speeds['1G'].write : 'N/A';
        const r10 = g.speeds['10G'] ? g.speeds['10G'].read : 'N/A';
        const w10 = g.speeds['10G'] ? g.speeds['10G'].write : 'N/A';
        const r100 = g.speeds['100G'] ? g.speeds['100G'].read : 'N/A';
        const w100 = g.speeds['100G'] ? g.speeds['100G'].write : 'N/A';
        
        const rowData = [
            g.dateTime,
            g.userIp,
            g.driveSN,
            g.baseType,
            g.status,
            r1, w1, r10, w10, r100, w100
        ].map(val => `"${String(val).replace(/"/g, '""')}"`);
        
        csvContent += rowData.join(",") + "\n";
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "speedtest_history.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}