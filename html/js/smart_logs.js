document.addEventListener('DOMContentLoaded', () => {
    const logContainer = document.getElementById('log-container');
    const params = new URLSearchParams(window.location.search);
    const containerName = params.get('container');

    if (!containerName) {
        logContainer.innerHTML = '<p style="color: red;">Error: No container name specified in the URL.</p>';
        return;
    }

    logContainer.innerHTML = `<p>Fetching logs for <strong>${containerName}</strong>...</p>`;

    fetchLogs(containerName);
});

async function fetchLogs(containerName) {
    const logContainer = document.getElementById('log-container');
    try {
        const response = await fetch(`/api/smart/logs/${containerName}`);
        const result = await response.json();

        if (result.status === 'success') {
            const logs = result.logs.replace(/\n/g, '<br>');
            logContainer.innerHTML = `<pre class="log-output">${logs}</pre>`;
        } else {
            logContainer.innerHTML = `<p style="color: red;">Error fetching logs: ${result.message}</p>`;
        }
    } catch (error) {
        console.error('Failed to fetch logs:', error);
        logContainer.innerHTML = `<p style="color: red;">A network error occurred while fetching the logs.</p>`;
    }
}
