document.addEventListener('DOMContentLoaded', async () => {
    try {
        const response = await fetch('/api/smart-history');
        const data = await response.json();
        const tbody = document.getElementById('history-body');
        
        if (data.status === 'success' && data.history && data.history.length > 0) {
            tbody.innerHTML = '';
            data.history.forEach(entry => {
                let statusColor = "var(--text-main)";
                if (entry.status === 'completed') statusColor = "var(--accent-green)";
                if (entry.status === 'failed') statusColor = "var(--accent-red)";
                if (entry.status === 'started') statusColor = "var(--primary)";

                let logButton = '<span style="color: var(--text-muted); font-size: 12px;">--</span>';
                if (entry.container_name) {
                     logButton = `<a href="/smart_logs.html?container=${entry.container_name}" class="btn-pdf" style="background: #334155;">View Log</a>`;
                }

                tbody.innerHTML += `
                    <tr>
                        <td style="white-space: nowrap;">${new Date(entry.timestamp).toLocaleString()}</td>
                        <td style="color: var(--text-main); font-weight: bold;">${entry.event}</td>
                        <td>${entry.serial || 'N/A'}</td>
                        <td style="color: ${statusColor}; font-weight: bold; text-transform: uppercase;">${entry.status}</td>
                        <td>${logButton}</td>
                    </tr>
                `;
            });
        } else {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">No S.M.A.R.T. test history found.</td></tr>`;
        }
    } catch (error) {
        console.error("History fetch error:", error); 
        const tbody = document.getElementById('history-body');
        if(tbody) tbody.innerHTML = `<tr><td colspan="5" style="color: red; text-align: center;">Failed to load history.</td></tr>`;
    }
});