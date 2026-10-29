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

    const fileBrowserBody = document.getElementById('file-browser-body');

    // One delegated listener for the whole table instead of inline onclick
    // attributes and per-row listeners on every listing.
    if (fileBrowserBody) {
        fileBrowserBody.addEventListener('click', (e) => {
            const actionBtn = e.target.closest('[data-fb-action]');
            if (!actionBtn) return;
            const action = actionBtn.dataset.fbAction;
            if (action === 'open-dir') {
                e.preventDefault();
                currentPath = currentPath ? `${currentPath}/${actionBtn.dataset.name}` : actionBtn.dataset.name;
                loadFileBrowser();
            } else if (action === 'download') {
                downloadFile(actionBtn.dataset.path);
            } else if (action === 'delete') {
                deleteItem(actionBtn.dataset.path, actionBtn.dataset.isDir === '1');
            }
        });
    }

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

            // Build the listing immediately: the table paints without waiting
            // for recursive directory sizes, which are fetched per directory
            // on demand and patched into the size cells as they arrive.
            const dirRows = [];
            data.files.forEach(file => {
                const tr = document.createElement('tr');
                tr.dataset.path = file.path;
                
                const nameHtml = file.is_dir 
                    ? `<a href="#" class="dir-link" data-fb-action="open-dir" data-name="${file.name}">${file.name}</a>`
                    : `<span>${file.name}</span>`;

                const sizeCellHtml = file.is_dir ? '\u2026' : formatBytes(file.size);

                tr.innerHTML = `
                    <td>${nameHtml}</td>
                    <td>${file.is_dir ? 'Directory' : 'File'}</td>
                    <td class="fb-size-cell">${sizeCellHtml}</td>
                    <td class="actions-cell">
                        ${!file.is_dir ? `<button class="btn-action btn-primary-inline btn-sm" data-fb-action="download" data-path="${file.path}">Download</button>` : ''}
                        <button class="btn-action btn-accent-red btn-sm" data-fb-action="delete" data-path="${file.path}" data-is-dir="${file.is_dir ? '1' : '0'}">Delete</button>
                    </td>
                `;
                if (file.is_dir) dirRows.push({ path: file.path, tr: tr });
                tbody.appendChild(tr);
            });

            // Fetch directory totals in the background and patch the cells in
            const loadDirSize = async (row) => {
                const cell = row.tr.querySelector('.fb-size-cell');
                if (!cell) return;
                try {
                    const sizeRes = await fetch('/api/data-management/dir-size?path=' + encodeURIComponent(row.path));
                    const sizeData = await sizeRes.json();
                    if (sizeData.status === 'success' && row.tr.isConnected) {
                        cell.textContent = formatBytes(sizeData.total_size || 0);
                    }
                } catch (e) { /* size stays as the placeholder */ }
            };
            dirRows.forEach(loadDirSize);

        } catch (err) {
            statusDiv.innerHTML = `<span style="color: var(--accent-red);">Network error.</span>`;
            tbody.innerHTML = '<tr><td colspan="4">Failed to load.</td></tr>';
        }
    }

    function downloadFile(filePath) {
        window.location.href = `/api/data-management/download?path=${encodeURIComponent(filePath)}`;
    }

    function deleteItem(filePath, isDir) {
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

    // --- Root Disk Usage Indicator ---
    async function loadRootUsage() {
        const fill = document.getElementById('root-usage-fill');
        const label = document.getElementById('root-usage-label');
        const headerLabel = document.getElementById('sys-root-usage');
        try {
            const res = await fetch('/api/system/root-usage');
            const data = await res.json();
            if (data.status !== 'success') {
                if (label) label.innerText = 'Usage unavailable';
                return;
            }
            const pct = data.percent_used;
            if (fill) {
                fill.style.width = pct + '%';
                fill.classList.remove('warn', 'danger');
                if (pct >= 90) fill.classList.add('danger');
                else if (pct >= 75) fill.classList.add('warn');
            }
            const text = `${formatBytes(data.used_bytes, 1)} of ${formatBytes(data.total_bytes, 1)} used (${pct}%)`;
            if (label) label.innerText = text;
            if (headerLabel) headerLabel.innerText = `Disk ${pct}%`;
        } catch (err) {
            if (label) label.innerText = 'Usage unavailable';
        }
    }
    loadRootUsage();

    // Initial load
    loadFileBrowser();
});