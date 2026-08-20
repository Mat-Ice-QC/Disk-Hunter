let currentDrive = null;

document.addEventListener('DOMContentLoaded', () => {
    fetchDrives();

    const unitSelect = document.getElementById('mkpart-unit');
    const sizeInput = document.getElementById('mkpart-size');
    if (unitSelect && sizeInput) {
        unitSelect.addEventListener('change', () => {
            if (unitSelect.value === 'MAX') {
                sizeInput.value = '';
                sizeInput.disabled = true;
            } else {
                sizeInput.disabled = false;
            }
        });
    }

    // Show/hide API Debug Console based on settings
    const isDebug = localStorage.getItem('disk_hunter_debug') === 'true';
    const debugConsole = document.getElementById('debug-console');
    if (debugConsole) {
        if (isDebug) {
            debugConsole.style.display = 'flex';
            const debugOutput = document.getElementById('debug-output');
            if (debugOutput) {
                debugOutput.innerHTML = `<span style="color: #3b82f6;">[System]</span> Diagnostic terminal active. Awaiting execution...<br>`;
            }
        } else {
            debugConsole.style.display = 'none';
        }
    }
});

async function fetchDrives() {
    try {
        const protectRoot = localStorage.getItem('disk_hunter_protect_root') !== 'false';
        // Use DiskService cache (10s TTL) to avoid redundant lsblk calls;
        // filter root client-side when protectRoot is active.
        const data = await window.diskService.getDisks(true);
        const selector = document.getElementById('drive-selector');

        if (data.status === 'success' && data.disks.length > 0) {
            selector.innerHTML = '';
            const filteredDisks = data.disks.filter(disk => !(protectRoot && disk.is_root));
            filteredDisks.forEach(disk => {
                const card = document.createElement('div');
                card.className = 'drive-card';

                const rawVendor = disk.vendor ? disk.vendor.trim() + ' ' : '';
                const rawModel = disk.model ? disk.model.trim() : 'Unknown';
                const fullName = rawVendor + rawModel;
                const normalizedId = fullName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();

                const imageUrl = `/api/images/drives/${normalizedId}.jpg?name=${disk.name}&tran=${disk.tran || ''}&rota=${disk.rota !== undefined ? disk.rota : ''}&model=${disk.model || ''}`;
                const fallbackSVG = `data:image/svg+xml;charset=UTF-8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22400%22 height=%22300%22 style=%22background-color:%231e293b; border-radius: 4px;%22%3E%3Ctext fill=%22%2394a3b8%22 x=%2250%25%22 y=%2250%25%22 font-family=%22sans-serif%22 font-weight=%22bold%22 font-size=%2230%22 text-anchor=%22middle%22 dominant-baseline=%22middle%22%3EDRIVE%3C/text%3E%3C/svg%3E`;

                let totalDiskSize = disk.size || 1;
                let usedSize = 0;
                if (disk.children && disk.children.length > 0) {
                    disk.children.forEach(child => { usedSize += (child.size || 0); });
                }
                let usedPct = Math.min((usedSize / totalDiskSize) * 100, 100);

                card.innerHTML = `
                    <input type="checkbox" class="drive-checkbox" data-drive="${disk.path}" onclick="event.stopPropagation()" style="width:18px;height:18px;accent-color:var(--primary);cursor:pointer;flex-shrink:0;">
                    <img class="drive-card-img" src="${imageUrl}" onerror="this.onerror=null; this.src='${fallbackSVG}';" alt="Drive Image">
                    <div class="drive-card-body">
                        <div class="drive-card-title">${fullName || disk.name}</div>
                        <div class="drive-card-meta">
                            <span><strong>Path:</strong>${disk.path}</span>
                            <span><strong>Size:</strong>${formatBytes(disk.size)}</span>
                            <span><strong>Table:</strong>${disk.pttype ? disk.pttype.toUpperCase() : 'Unknown'}</span>
                        </div>
                        <div class="drive-card-bar">
                            <div class="drive-card-bar-label">
                                <span>Allocated</span>
                                <span>${formatBytes(usedSize)} / ${formatBytes(totalDiskSize)}</span>
                            </div>
                            <div class="drive-card-bar-track">
                                <div class="drive-card-bar-fill" style="width:${usedPct}%"></div>
                            </div>
                        </div>
                    </div>
                `;
                card.onclick = () => selectDrive(disk.path, card);
                selector.appendChild(card);
            });
        } else {
            selector.innerHTML = '<p class="empty-state">No drives found.</p>';
        }
        if (window.applyGlobalLayout) window.applyGlobalLayout();
    } catch (e) {
        console.error(e);
        document.getElementById('drive-selector').innerHTML = '<p class="empty-state" style="color:red;">Error fetching drives</p>';
    }
}

function selectDrive(path, cardElement) {
    currentDrive = path;

    // Update UI
    const items = document.querySelectorAll('#drive-selector .drive-card');
    items.forEach(i => i.classList.remove('selected'));
    cardElement.classList.add('selected');

    document.getElementById('partition-modal').classList.add('active');
    document.getElementById('current-drive-label').innerText = path;

    hideAllForms();
    document.getElementById('action-status').innerHTML = '';

    loadPartitions();
}

function closeModal() {
    document.getElementById('partition-modal').classList.remove('active');
    currentDrive = null;
}

function selectPartitionBlock(num) {
    document.querySelectorAll('.partition-block').forEach(b => b.classList.remove('selected'));
    document.querySelectorAll('.partition-table tbody tr').forEach(r => r.classList.remove('selected'));
    const block = document.querySelector(`.partition-block[data-num="${num}"]`);
    if (block) block.classList.add('selected');
    const row = document.querySelector(`.partition-table tbody tr[data-num="${num}"]`);
    if (row) row.classList.add('selected');
}

function formatBytes(bytes) {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = 1;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

async function loadPartitions() {
    if (!currentDrive) return;

    const loadingDrive = currentDrive;

    const tbody = document.getElementById('partition-body');
    const infoDiv = document.getElementById('disk-info');
    const graphicContainer = document.getElementById('partition-graphic');

    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">Loading...</td></tr>';
    graphicContainer.innerHTML = '<div style="padding: 20px; text-align: center; width: 100%; color: var(--text-muted);">Loading graphic...</div>';

    try {
        const res = await fetch(`/api/partitions?drive=${encodeURIComponent(loadingDrive)}`);
        const data = await res.json();

        if (loadingDrive !== currentDrive) return; // Prevent race conditions

        if (data.status === 'success') {
            infoDiv.innerHTML = `
                <div class="info-tile"><strong>Model</strong><span>${data.disk.model}</span></div>
                <div class="info-tile"><strong>Size</strong><span>${formatBytes(parseInt(data.disk.size.replace(/[^0-9]/g, '')))}</span></div>
                <div class="info-tile"><strong>Table</strong><span>${(data.disk.label || 'unknown').toUpperCase()}</span></div>
                <div class="info-tile"><strong>Sector</strong><span>${data.disk.logical_sector}/${data.disk.physical_sector}</span></div>
            `;

            const diskSizeStr = data.disk.size.replace(/[^0-9]/g, '');
            const totalDiskSize = parseInt(diskSizeStr) || 1;

            graphicContainer.innerHTML = '';
            tbody.innerHTML = '';

            let currentOffset = 0;

            if (data.partitions && data.partitions.length > 0) {
                data.partitions.forEach(p => {
                    const startBytes = parseInt(p.start.replace(/[^0-9]/g, ''));
                    const endBytes = parseInt(p.end.replace(/[^0-9]/g, ''));
                    const sizeBytes = parseInt(p.size.replace(/[^0-9]/g, ''));

                    // Add free space block if there is a gap > 1MB
                    if (startBytes - currentOffset > 1048576) {
                        const freeSize = startBytes - currentOffset;
                        const freePct = (freeSize / totalDiskSize) * 100;
                        const block = document.createElement('div');
                        block.className = 'partition-block free-space';
                        block.style.width = `${freePct}%`;
                        block.title = `Free Space: ${formatBytes(freeSize)}`;

                        const startPctStr = ((currentOffset / totalDiskSize) * 100).toFixed(2) + '%';
                        const endPctStr = ((startBytes / totalDiskSize) * 100).toFixed(2) + '%';

                        block.onclick = () => {
                            document.querySelectorAll('.partition-block').forEach(b => b.classList.remove('selected'));
                            block.classList.add('selected');

                            document.getElementById('mkpart-start-bytes').value = currentOffset;
                            document.getElementById('mkpart-max-bytes').value = startBytes;
                            document.getElementById('mkpart-is-end').value = 'false';
                            document.getElementById('mkpart-unit').value = 'MAX';
                            document.getElementById('mkpart-size').value = '';
                            document.getElementById('mkpart-size').disabled = true;

                            document.getElementById('btn-mkpart').disabled = false;
                            document.getElementById('btn-format').disabled = true;
                            document.getElementById('btn-rm').disabled = true;
                            document.getElementById('btn-name').disabled = true;
                            document.getElementById('btn-set').disabled = true;
                            showForm('form-mkpart');
                        };

                        graphicContainer.appendChild(block);
                    }

                    const pct = (sizeBytes / totalDiskSize) * 100;
                    const block = document.createElement('div');
                    block.className = 'partition-block';
                    block.dataset.num = p.number;
                    block.style.width = `${pct}%`;

                    const colors = {
                        'ext4': '#3b82f6', 'ext3': '#2563eb',
                        'ntfs': '#10b981', 'fat32': '#14b8a6', 'fat16': '#0d9488',
                        'linux-swap(v1)': '#f59e0b', 'hfs+': '#8b5cf6'
                    };
                    const bgColor = colors[p.fs] || '#64748b';
                    block.style.backgroundColor = bgColor;

                    const flagStr = p.flags ? ` [${p.flags}]` : '';
                    if (pct < 8) {
                        block.innerText = `${p.number}`;
                    } else {
                        block.innerText = `${p.name || p.fs || `P${p.number}`} ${formatBytes(sizeBytes)}`;
                    }
                    block.title = `Partition ${p.number}: ${p.name || p.fs || 'Unknown'} (${formatBytes(sizeBytes)})${flagStr}`;

                    block.onclick = () => {
                        document.querySelectorAll('.partition-block').forEach(b => b.classList.remove('selected'));
                        document.querySelectorAll('.partition-table tbody tr').forEach(r => r.classList.remove('selected'));
                        block.classList.add('selected');
                        const row = document.querySelector(`.partition-table tbody tr[data-num="${p.number}"]`);
                        if (row) row.classList.add('selected');

                        const num = p.number;
                        document.getElementById('format-num').value = num;
                        document.getElementById('rm-num').value = num;
                        document.getElementById('name-num').value = num;
                        document.getElementById('set-num').value = num;

                        document.getElementById('btn-mkpart').disabled = true;
                        document.getElementById('btn-format').disabled = false;
                        document.getElementById('btn-rm').disabled = false;
                        document.getElementById('btn-name').disabled = false;
                        document.getElementById('btn-set').disabled = false;
                    };

                    graphicContainer.appendChild(block);

                    currentOffset = endBytes;

                    tbody.innerHTML += `
                        <tr data-num="${p.number}" onclick="selectPartitionBlock(${p.number})" style="cursor:pointer;">
                            <td><strong>${p.number}</strong></td>
                            <td>${p.fs ? `<span style="color:${bgColor};font-weight:600;">${p.fs}</span>` : '<span style="color:var(--text-muted);">—</span>'}</td>
                            <td>${p.name || '<span style="color:var(--text-muted);">—</span>'}</td>
                            <td style="font-size:12px;color:var(--text-muted);">${p.start}</td>
                            <td style="font-size:12px;color:var(--text-muted);">${p.end}</td>
                            <td><strong>${formatBytes(sizeBytes)}</strong></td>
                            <td style="font-size:12px;">${p.flags || '<span style="color:var(--text-muted);">—</span>'}</td>
                        </tr>
                    `;
                });

                // Add trailing free space
                if (totalDiskSize - currentOffset > 1048576) {
                    const freeSize = totalDiskSize - currentOffset;
                    const freePct = (freeSize / totalDiskSize) * 100;
                    const block = document.createElement('div');
                    block.className = 'partition-block free-space';
                    block.style.width = `${freePct}%`;
                    block.title = `Free Space: ${formatBytes(freeSize)}`;

                    const startPctStr = ((currentOffset / totalDiskSize) * 100).toFixed(2) + '%';

                    block.onclick = () => {
                        document.querySelectorAll('.partition-block').forEach(b => b.classList.remove('selected'));
                        block.classList.add('selected');

                        document.getElementById('mkpart-start-bytes').value = currentOffset;
                        document.getElementById('mkpart-max-bytes').value = totalDiskSize;
                        document.getElementById('mkpart-is-end').value = 'true';
                        document.getElementById('mkpart-unit').value = 'MAX';
                        document.getElementById('mkpart-size').value = '';
                        document.getElementById('mkpart-size').disabled = true;

                        document.getElementById('btn-mkpart').disabled = false;
                        document.getElementById('btn-format').disabled = true;
                        document.getElementById('btn-rm').disabled = true;
                        document.getElementById('btn-name').disabled = true;
                        document.getElementById('btn-set').disabled = true;
                        showForm('form-mkpart');
                    };

                    graphicContainer.appendChild(block);
                }

            } else {
                tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">No partitions found on this drive.</td></tr>';
                const block = document.createElement('div');
                block.className = 'partition-block free-space';
                block.style.width = `100%`;
                block.innerText = 'Unallocated';

                block.onclick = () => {
                    document.querySelectorAll('.partition-block').forEach(b => b.classList.remove('selected'));
                    block.classList.add('selected');

                    document.getElementById('mkpart-start-bytes').value = 0;
                    document.getElementById('mkpart-max-bytes').value = totalDiskSize;
                    document.getElementById('mkpart-is-end').value = 'true';
                    document.getElementById('mkpart-unit').value = 'MAX';
                    document.getElementById('mkpart-size').value = '';
                    document.getElementById('mkpart-size').disabled = true;

                    document.getElementById('btn-mkpart').disabled = false;
                    document.getElementById('btn-format').disabled = true;
                    document.getElementById('btn-rm').disabled = true;
                    document.getElementById('btn-name').disabled = true;
                    document.getElementById('btn-set').disabled = true;
                    hideAllForms();
                    showForm('form-mkpart');
                };

                graphicContainer.appendChild(block);
            }
        } else {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: red;">Error: ${data.message}</td></tr>`;
            infoDiv.innerHTML = '';
            graphicContainer.innerHTML = '';
        }
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: red;">Network Error</td></tr>`;
        graphicContainer.innerHTML = '';
    }
}

function showForm(formId) {
    hideAllForms();
    document.getElementById(formId).classList.add('active');

    const btnId = 'btn-' + formId.replace('form-', '');
    const btn = document.getElementById(btnId);
    if (btn) {
        btn.classList.add('active');
    }

    document.getElementById('action-status').innerHTML = '';
}

function hideAllForms() {
    const forms = document.querySelectorAll('.action-form');
    forms.forEach(f => f.classList.remove('active'));

    const btns = document.querySelectorAll('.action-bar .btn-action');
    btns.forEach(b => b.classList.remove('active'));
}

async function submitAction(action) {
    if (!currentDrive) return;

    let params = [];
    if (action === 'mklabel') {
        params = [document.getElementById('mklabel-type').value];
    } else if (action === 'mkpart') {
        const startBytes = parseInt(document.getElementById('mkpart-start-bytes').value) || 0;
        const maxBytes = parseInt(document.getElementById('mkpart-max-bytes').value) || 0;

        let endBytes = maxBytes;
        const unit = document.getElementById('mkpart-unit').value;
        const sizeVal = parseFloat(document.getElementById('mkpart-size').value);

        if (unit !== 'MAX' && !isNaN(sizeVal) && sizeVal > 0) {
            let mult = 1;
            if (unit === 'MB') mult = 1000 * 1000;
            else if (unit === 'GB') mult = 1000 * 1000 * 1000;
            else if (unit === 'TB') mult = 1000 * 1000 * 1000 * 1000;

            endBytes = startBytes + Math.floor(sizeVal * mult);
            if (endBytes > maxBytes) {
                endBytes = maxBytes;
            }
        }

        let startStr = startBytes + 'B';
        if (startBytes < 1048576) startStr = '0%';
        let endStr = endBytes + 'B';

        const isEnd = document.getElementById('mkpart-is-end').value === 'true';
        if (isEnd && endBytes >= maxBytes) {
            endStr = '100%';
        }

        params = [
            document.getElementById('mkpart-type').value,
            startStr,
            endStr
        ];
    } else if (action === 'format') {
        params = [
            document.getElementById('format-num').value,
            document.getElementById('format-fs').value
        ];
    } else if (action === 'rm') {
        params = [document.getElementById('rm-num').value];
    } else if (action === 'name') {
        params = [
            document.getElementById('name-num').value,
            document.getElementById('name-val').value
        ];
    } else if (action === 'set') {
        params = [
            document.getElementById('set-num').value,
            document.getElementById('set-flag').value,
            document.getElementById('set-state').value
        ];
    }

    const statusDiv = document.getElementById('action-status');
    statusDiv.innerHTML = '<span style="color: var(--primary);">Processing...</span>';

    if (action === 'mklabel' || action === 'rm' || action === 'format') {
        customConfirm(`Are you sure you want to perform this action? It may destroy data.`, async () => {
            await executePartitionAction(action, params, statusDiv);
        }, "DANGER: Data Loss");
    } else {
        await executePartitionAction(action, params, statusDiv);
    }
}

async function executePartitionAction(action, params, statusDiv) {
    try {
        const data = await window.partitionService.action(currentDrive, action, params.filter(p => p !== undefined && p !== ''));

        if (data.status === 'success') {
            statusDiv.innerHTML = `<span style="color: var(--accent-green);">${data.message}</span>`;
            setTimeout(() => {
                statusDiv.innerHTML = '';
                hideAllForms();
            }, 3000);
            loadPartitions(); // Refresh the table
        } else {
            statusDiv.innerHTML = `<span style="color: var(--accent-red);">Error: ${data.message}</span>`;
        }
    } catch (e) {
        statusDiv.innerHTML = `<span style="color: var(--accent-red);">Network Error: ${e.message}</span>`;
    }
}

async function batchWipeSelected() {
    const checked = document.querySelectorAll('#drive-selector .drive-checkbox:checked');
    if (checked.length === 0) {
        customAlert('Please select at least one drive first.');
        return;
    }

    const drives = Array.from(checked).map(cb => cb.dataset.drive);
    const labelType = document.getElementById('batch-label-type').value;
    const resultsDiv = document.getElementById('batch-results');

    customConfirm(
        `⚠ DANGER: This will destroy ALL data on ${drives.length} drive(s) by creating a new ${labelType.toUpperCase()} partition table on each.\n\nDrives:\n${drives.join('\n')}\n\nThis cannot be undone. Continue?`,
        async () => {
            resultsDiv.innerHTML = `<div class="batch-progress">Processing ${drives.length} drive(s)...</div>`;
            const btn = document.getElementById('btn-batch-wipe');
            btn.disabled = true;

            try {
                const res = await fetch('/api/partitions/batch', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ drives, action: 'mklabel', params: [labelType] })
                });
                const data = await res.json();

                let html = '';
                if (data.results) {
                    data.results.forEach(r => {
                        const icon = r.status === 'success' ? '✅' : '❌';
                        const color = r.status === 'success' ? 'var(--accent-green)' : 'var(--accent-red)';
                        html += `<div class="batch-result-row" style="color:${color};">${icon} <strong>${r.drive}</strong> — ${r.message}</div>`;
                    });
                }
                const summaryColor = data.failed === 0 ? 'var(--accent-green)' : (data.succeeded > 0 ? 'var(--primary)' : 'var(--accent-red)');
                html = `<div class="batch-summary" style="color:${summaryColor};">Complete: ${data.succeeded}/${data.total} succeeded, ${data.failed} failed</div>` + html;
                resultsDiv.innerHTML = html;

                if (data.succeeded > 0) fetchDrives();
            } catch (e) {
                resultsDiv.innerHTML = `<div class="batch-result-row" style="color:var(--accent-red);">Network error: ${e.message}</div>`;
            } finally {
                btn.disabled = false;
            }
        },
        "DANGER: Mass Data Destruction"
    );
}
