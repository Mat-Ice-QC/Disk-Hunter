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
        const response = await fetch('/api/speedtest-history');
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
        if (entry.test_type) details.push('Type: ' + entry.test_type);
        if (entry.read_speed) details.push('Read: ' + entry.read_speed);
        if (entry.write_speed) details.push('Write: ' + entry.write_speed);

        const options = {
            title: 'Speed Test Logs',
            details: details,
            logUrl: entry.container_name ? () => `/api/speedtest/logs/${encodeURIComponent(entry.container_name)}` : null
        };

        const tr = document.createElement('tr');
        tr.innerHTML = HistoryCommon.renderLogHeader(entry, { details: details });
        HistoryCommon.makeRowClickable(tr, entry, options);

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

function exportToCSV() {
    if (currentHistory.length === 0) {
        customAlert('No history data available to export.');
        return;
    }

    let csvContent = "Date / Time,User (IP),Drive S/N,Base Type,Status,Read Speed 1G,Write Speed 1G,Read Speed 10G,Write Speed 10G,Read Speed 100G,Write Speed 100G\n";

    const groups = [];

    // Process entries from oldest to newest to group chronological test sequences
    currentHistory.slice().reverse().forEach(entry => {
        const statusText = String(entry.status || '').toLowerCase();
        if (statusText.includes('completed')) {
            const dateTime = HistoryCommon.formatTimestamp(entry.timestamp);
            const dateHour = dateTime.substring(0, 13);
            const driveSN = entry.serial || 'N/A';
            const typeStr = entry.test_type || 'N/A';

            let baseType = typeStr;
            let size = '1G';
            const sizeMatch = typeStr.match(/\((.*?)\)/);
            if (sizeMatch) {
                size = sizeMatch[1];
                baseType = typeStr.split(' ')[0];
            }

            // Find a group from the same hour, same drive, same base type, that doesn't already have this size
            let group = groups.find(g => g.driveSN === driveSN && g.baseType === baseType && g.dateHour === dateHour && !g.speeds[size]);

            if (!group) {
                group = {
                    dateTime: dateTime,
                    userIp: entry.username || 'N/A',
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

            group.speeds[size] = { read: entry.read_speed || 'N/A', write: entry.write_speed || 'N/A' };
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
