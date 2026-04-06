document.addEventListener('DOMContentLoaded', async () => {
    try {
        const response = await fetch('/api/history');
        const data = await response.json();
        const tbody = document.getElementById('history-body');
        
        if (data.status === 'success' && data.history.length > 0) {
            tbody.innerHTML = '';
            data.history.forEach(log => {
                const pdfButton = log.report_file 
                    ? `<a href="/api/reports/${log.report_file}" target="_blank" class="btn-pdf">📄 View PDF</a>` 
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

                tbody.innerHTML += `
                    <tr>
                        <td style="white-space: nowrap;">${log.timestamp}</td>
                        <td style="color: ${eventColor}; font-weight: bold;">${eventText}</td>
                        <td>${serialText}</td>
                        <td><span class="badge" style="background: #334155; color: white;">${methodText}</span></td>
                        <td>${pdfButton}</td>
                    </tr>
                `;
            });
        } else {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">No shredding history found.</td></tr>`;
        }
    } catch (error) {
        console.error("History fetch error:", error); 
        const tbody = document.getElementById('history-body');
        if(tbody) tbody.innerHTML = `<tr><td colspan="5" style="color: red; text-align: center;">Failed to load history.</td></tr>`;
    }
});