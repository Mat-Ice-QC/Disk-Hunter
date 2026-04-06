let currentDrive = null;

document.addEventListener('DOMContentLoaded', () => {
    fetchDrives();
});

async function fetchDrives() {
    try {
        const protectRoot = localStorage.getItem('disk_hunter_protect_root') !== 'false';
        const res = await fetch(`/api/disks?exclude_root=${protectRoot}`);
        const data = await res.json();
        const selector = document.getElementById('drive-selector');
        
        if (data.status === 'success' && data.disks.length > 0) {
            selector.innerHTML = '';
            data.disks.forEach(disk => {
                const li = document.createElement('li');
                const rawVendor = disk.vendor ? disk.vendor.trim() + ' ' : '';
                const rawModel = disk.model ? disk.model.trim() : 'Unknown';
                const fullName = rawVendor + rawModel;
                const normalizedId = fullName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
                
                const imageUrl = `/api/images/drives/${normalizedId}.jpg`;
                const fallbackSVG = `data:image/svg+xml;charset=UTF-8,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300" style="background:%231e293b; border-radius: 4px;"%3E%3Ctext fill="%2394a3b8" x="50%25" y="50%25" font-family="sans-serif" font-weight="bold" font-size="30" text-anchor="middle" dominant-baseline="middle"%3EDRIVE%3C/text%3E%3C/svg%3E`;

                li.innerHTML = `
                    <img src="${imageUrl}" onerror="this.onerror=null; this.src='${fallbackSVG}';" alt="Drive Image">
                    <div>
                        <div style="font-weight: bold; font-size: 14px; color: var(--text-main);">${fullName || disk.name}</div>
                        <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">${disk.path}</div>
                    </div>
                `;
                li.onclick = () => selectDrive(disk.path, li);
                selector.appendChild(li);
            });
        } else {
            selector.innerHTML = '<li>No drives found.</li>';
        }
    } catch (e) {
        console.error(e);
        document.getElementById('drive-selector').innerHTML = '<li style="color: red;">Error fetching drives</li>';
    }
}

function selectDrive(path, liElement) {
    currentDrive = path;
    
    // Update UI
    const items = document.querySelectorAll('#drive-selector li');
    items.forEach(i => i.classList.remove('selected'));
    liElement.classList.add('selected');
    
    document.getElementById('no-drive-msg').style.display = 'none';
    document.getElementById('editor-card').style.display = 'block';
    document.getElementById('current-drive-label').innerText = path;
    
    hideAllForms();
    document.getElementById('action-status').innerHTML = '';
    
    loadPartitions();
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
    
    const tbody = document.getElementById('partition-body');
    const infoDiv = document.getElementById('disk-info');
    const graphicContainer = document.getElementById('partition-graphic');
    
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">Loading...</td></tr>';
    graphicContainer.innerHTML = '<div style="padding: 20px; text-align: center; width: 100%; color: var(--text-muted);">Loading graphic...</div>';
    
    try {
        const res = await fetch(`/api/partitions?drive=${encodeURIComponent(currentDrive)}`);
        const data = await res.json();
        
        if (data.status === 'success') {
            infoDiv.innerHTML = `
                <div><strong>Model:</strong> ${data.disk.model}</div>
                <div><strong>Size:</strong> ${formatBytes(parseInt(data.disk.size.replace(/[^0-9]/g, '')))}</div>
                <div><strong>Table:</strong> ${data.disk.label || 'Unknown'}</div>
                <div><strong>Sector Size:</strong> ${data.disk.logical_sector}/${data.disk.physical_sector}</div>
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
                            
                            document.getElementById('mkpart-start').value = startPctStr;
                            document.getElementById('mkpart-end').value = endPctStr;
                            showForm('form-mkpart');
                        };
                        
                        graphicContainer.appendChild(block);
                    }
                    
                    const pct = (sizeBytes / totalDiskSize) * 100;
                    const block = document.createElement('div');
                    block.className = 'partition-block';
                    block.style.width = `${pct}%`;
                    
                    const colors = {
                        'ext4': '#3b82f6', 'ext3': '#2563eb',
                        'ntfs': '#10b981', 'fat32': '#14b8a6', 'fat16': '#0d9488',
                        'linux-swap(v1)': '#f59e0b', 'hfs+': '#8b5cf6'
                    };
                    const bgColor = colors[p.fs] || '#64748b';
                    block.style.backgroundColor = bgColor;
                    
                    block.innerText = p.name || p.fs || `P${p.number}`;
                    block.title = `Partition ${p.number}: ${p.name || p.fs || 'Unknown'} (${formatBytes(sizeBytes)})`;
                    
                    block.onclick = () => {
                        document.querySelectorAll('.partition-block').forEach(b => b.classList.remove('selected'));
                        block.classList.add('selected');

                        const num = p.number;
                        document.getElementById('format-num').value = num;
                        document.getElementById('rm-num').value = num;
                        document.getElementById('name-num').value = num;
                        document.getElementById('set-num').value = num;
                    };
                    
                    graphicContainer.appendChild(block);
                    
                    currentOffset = endBytes;

                    tbody.innerHTML += `
                        <tr>
                            <td>${p.number}</td>
                            <td>${p.start}</td>
                            <td>${p.end}</td>
                            <td>${sizeBytes ? formatBytes(sizeBytes) : p.size}</td>
                            <td>${p.fs || 'N/A'}</td>
                            <td>${p.name || 'N/A'}</td>
                            <td>${p.flags || ''}</td>
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
                        
                        document.getElementById('mkpart-start').value = startPctStr;
                        document.getElementById('mkpart-end').value = '100%';
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
                    
                    document.getElementById('mkpart-start').value = '0%';
                    document.getElementById('mkpart-end').value = '100%';
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
    document.getElementById('action-status').innerHTML = '';
}

function hideAllForms() {
    const forms = document.querySelectorAll('.action-form');
    forms.forEach(f => f.classList.remove('active'));
}

async function submitAction(action, params) {
    if (!currentDrive) return;
    
    const statusDiv = document.getElementById('action-status');
    statusDiv.innerHTML = '<span style="color: var(--primary);">Processing...</span>';
    
    if (action === 'mklabel' || action === 'rm' || action === 'format') {
        if (!confirm(`Are you sure you want to perform this action? It may destroy data.`)) {
            statusDiv.innerHTML = '';
            return;
        }
    }

    try {
        const res = await fetch('/api/partitions/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                drive: currentDrive,
                action: action,
                params: params.filter(p => p !== undefined && p !== '')
            })
        });
        
        const data = await res.json();
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
