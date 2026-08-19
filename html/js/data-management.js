document.addEventListener('DOMContentLoaded', () => {
    // --- Clear Logs Logic ---
    const clearActions = [
        { id: 'btn-clear-shred-logs', endpoint: '/api/history/clear', msg: "Are you sure you want to clear all shredding logs? This action cannot be undone." },
        { id: 'btn-clear-smart-logs', endpoint: '/api/smart-history/clear', msg: "Are you sure you want to clear all S.M.A.R.T. logs? This action cannot be undone." },
        { id: 'btn-clear-speedtest-logs', endpoint: '/api/speedtest-history/clear', msg: "Are you sure you want to clear all Speed Test history? This action cannot be undone." },
        { id: 'btn-clear-iso-logs', endpoint: '/api/iso-history/clear', msg: "Are you sure you want to clear all ISO Action history? This action cannot be undone." },
        { id: 'btn-clear-all-data-logs', endpoint: '/api/settings/clear-all-logs', msg: "Are you sure you want to delete all raw data logs from the disk? This action cannot be undone." },
        { id: 'btn-clear-all-pdfs', endpoint: '/api/settings/clear-pdfs', msg: "Are you sure you want to delete ALL PDF reports from the disk? This action cannot be undone." },
        { id: 'btn-clear-all-isos', endpoint: '/api/settings/clear-isos', msg: "Are you sure you want to delete ALL downloaded ISO files from the disk? This action cannot be undone." },
        { id: 'btn-clear-all-images', endpoint: '/api/settings/clear-images', msg: "Are you sure you want to delete ALL uploaded drive images? This action cannot be undone." }
    ];

    clearActions.forEach(action => {
        const btn = document.getElementById(action.id);
        if (btn) {
            btn.addEventListener('click', (e) => {
                customConfirm(action.msg, async () => {
                    const statusDiv = document.getElementById('clear-logs-status');
                    e.target.disabled = true;
                    try {
                        const res = await fetch(action.endpoint, { method: 'DELETE' });
                        const data = await res.json();
                        statusDiv.innerHTML = `<span style="color: ${data.status === 'success' ? 'var(--accent-green)' : 'var(--accent-red)'};">${data.message}</span>`;
                    } catch (err) {
                        statusDiv.innerHTML = `<span style="color: var(--accent-red);">Network error during action.</span>`;
                    } finally {
                        e.target.disabled = false;
                    }
                }, "DANGER: Confirm Deletion");
            });
        }
    });

    // --- File Browser Logic ---
    let currentPath = '';

    const btnUpDir = document.getElementById('btn-up-dir');
    btnUpDir.addEventListener('click', () => {
        if (currentPath === '') return;
        const parts = currentPath.split('/');
        parts.pop();
        currentPath = parts.join('/');
        loadFileBrowser();
    });

    async function loadFileBrowser() {
        const tbody = document.getElementById('file-browser-body');
        const pathSpan = document.getElementById('current-path');
        const statusDiv = document.getElementById('file-browser-status');
        
        pathSpan.innerText = '/' + currentPath;
        tbody.innerHTML = '<tr><td colspan="4">Loading...</td></tr>';
        statusDiv.innerHTML = '';
        
        btnUpDir.style.display = currentPath === '' ? 'none' : 'inline-block';

        try {
            const url = '/api/data-management/list?path=' + encodeURIComponent(currentPath);
            const res = await fetch(url);
            const data = await res.json();

            if (data.status === 'error') {
                statusDiv.innerHTML = `<span style="color: var(--accent-red);">${data.message}</span>`;
                tbody.innerHTML = '<tr><td colspan="4">Error loading directory.</td></tr>';
                return;
            }

            tbody.innerHTML = '';
            
            if (data.files.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color: var(--text-muted);">Folder is empty.</td></tr>';
                return;
            }

            // Sort directories first
            data.files.sort((a, b) => {
                if (a.is_dir === b.is_dir) return a.name.localeCompare(b.name);
                return a.is_dir ? -1 : 1;
            });

            data.files.forEach(file => {
                const tr = document.createElement('tr');
                
                const nameHtml = file.is_dir 
                    ? `<a href="#" class="dir-link" data-name="${file.name}">${file.name}</a>`
                    : `<span>${file.name}</span>`;

                tr.innerHTML = `
                    <td>${nameHtml}</td>
                    <td>${file.is_dir ? 'Directory' : 'File'}</td>
                    <td>${file.is_dir ? '-' : formatBytes(file.size)}</td>
                    <td class="actions-cell">
                        ${!file.is_dir ? `<button class="btn-action btn-primary-inline btn-sm" onclick="downloadFile('${file.path}')">Download</button>` : ''}
                        <button class="btn-action btn-accent-red btn-sm" onclick="deleteItem('${file.path}', ${file.is_dir})">Delete</button>
                    </td>
                `;
                tbody.appendChild(tr);
            });

            // Add event listeners for directory links
            document.querySelectorAll('.dir-link').forEach(link => {
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    const dirName = e.target.getAttribute('data-name');
                    currentPath = currentPath ? `${currentPath}/${dirName}` : dirName;
                    loadFileBrowser();
                });
            });

        } catch (err) {
            statusDiv.innerHTML = `<span style="color: var(--accent-red);">Network error.</span>`;
            tbody.innerHTML = '<tr><td colspan="4">Failed to load.</td></tr>';
        }
    }

    window.downloadFile = function(filePath) {
        window.location.href = `/api/data-management/download?path=${encodeURIComponent(filePath)}`;
    };

    window.deleteItem = async function(filePath, isDir) {
        const itemType = isDir ? 'directory' : 'file';
        customConfirm(`Are you sure you want to delete this ${itemType}: ${filePath}? This action cannot be undone.`, async () => {
            const statusDiv = document.getElementById('file-browser-status');
            try {
                const res = await fetch(`/api/data-management/delete?path=${encodeURIComponent(filePath)}`, { method: 'DELETE' });
                const data = await res.json();
                
                if (data.status === 'success') {
                    statusDiv.innerHTML = `<span style="color: var(--accent-green);">${data.message}</span>`;
                    loadFileBrowser();
                } else {
                    statusDiv.innerHTML = `<span style="color: var(--accent-red);">${data.message}</span>`;
                }
            } catch (err) {
                statusDiv.innerHTML = `<span style="color: var(--accent-red);">Network error.</span>`;
            }
        }, "Confirm Deletion");
    };

    function formatBytes(bytes, decimals = 2) {
        if (!+bytes) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
    }

    // Initial load
    loadFileBrowser();
});