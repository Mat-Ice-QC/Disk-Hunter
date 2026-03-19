document.addEventListener('DOMContentLoaded', () => {
    fetchDisks();
});

function formatBytes(bytes, decimals = 1) {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

function getPartitionClass(fstype) {
    if (!fstype) return 'part-free';
    fstype = fstype.toLowerCase();
    if (fstype.includes('vfat') || fstype.includes('fat')) return 'part-efi';
    if (fstype.includes('ext')) return 'part-ext4';
    if (fstype.includes('ntfs')) return 'part-ntfs';
    if (fstype.includes('swap')) return 'part-swap';
    if (fstype.includes('btrfs')) return 'part-btrfs';
    return 'part-ext4'; 
}

function getInterfaceName(tran, name) {
    if (tran === 'nvme') return 'PCIe NVMe';
    if (tran === 'sata') return 'SATA';
    if (tran === 'usb') return 'USB';
    if (name.includes('nvme')) return 'PCIe NVMe'; 
    return tran ? tran.toUpperCase() : 'Unknown';
}

async function fetchDisks() {
    const container = document.getElementById('disk-list-container');
    container.innerHTML = '<p>Scanning hardware...</p>';

    try {
        const response = await fetch('/api/disks');
        const data = await response.json();

        if (data.status !== 'success') {
            container.innerHTML = `<p style="color: red;">Error: ${data.message}</p>`;
            return;
        }

        container.innerHTML = ''; 

        data.disks.forEach(disk => {
            const diskSize = parseInt(disk.size);
            
            // Construct Vendor + Model logic
            const rawVendor = disk.vendor ? disk.vendor.trim() + ' ' : '';
            const rawModel = disk.model ? disk.model.trim() : 'Unknown';
            const fullName = rawVendor + rawModel;
            
            // Image normalization logic to match what Settings uploads
            const normalizedId = fullName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
            const serial = disk.serial ? disk.serial.trim() : 'N/A';
            const interfaceType = getInterfaceName(disk.tran, disk.name);
            const pttypeMap = { 'dos': 'MBR', 'gpt': 'GPT' };
            const pttypeRaw = disk.pttype ? disk.pttype.toLowerCase() : 'unknown';
            const pttype = pttypeMap[pttypeRaw] || pttypeRaw.toUpperCase();
            
            // Image tags with fallback to placeholder
            const imageUrl = `images/drives/${normalizedId}.jpg`;
            const placeholderUrl = `https://via.placeholder.com/400x300/1e293b/94a3b8.png?text=${encodeURIComponent(interfaceType)}`;
            const imgElement = `<img src="${imageUrl}" onerror="this.onerror=null; this.src='${placeholderUrl}';" alt="Drive Image">`;

            // Build the label subtitle if the drive has a root label
            const labelSubtitleHtml = disk.label ? `<div class="disk-label-subtitle">Label: ${disk.label}</div>` : '';

            let badgeHtml = `
                <span class="badge dev-path">${disk.path}</span>
                <span class="badge interface">${interfaceType}</span>
                <span class="badge ptable">${pttype}</span>
            `;
            if (disk.parttypename) badgeHtml += `<span class="badge" style="color: #3b82f6; border-color: rgba(59, 130, 246, 0.3);">${disk.parttypename}</span>`;
            if (disk.fsver) badgeHtml += `<span class="badge" style="color: #10b981; border-color: rgba(16, 185, 129, 0.3);">v${disk.fsver}</span>`;

            let partitionHtml = '';
            let usedBytes = 0;

            if (disk.children) {
                disk.children.forEach(part => {
                    const partSize = parseInt(part.size);
                    if (partSize < 1024 * 1024 && !part.fstype) return;

                    usedBytes += partSize;
                    
                    let percent = (partSize / diskSize) * 100;
                    if (percent < 5) percent = 5; 

                    const fstype = part.fstype ? part.fstype : 'Unknown';
                    const cssClass = getPartitionClass(part.fstype);
                    const label = part.label ? part.label : '';
                    const partTypeName = part.parttypename ? part.parttypename : '';
                    const fsver = part.fsver ? part.fsver : '';
                    
                    let tooltipHTML = `<strong>Partition: ${part.name}</strong>`;
                    if (label) tooltipHTML += `Label: <span style="color: #f59e0b;">${label}</span><br>`;
                    if (partTypeName) tooltipHTML += `Part Type: ${partTypeName}<br>`;
                    tooltipHTML += `FS Type: ${fstype} ${fsver ? `(v${fsver})` : ''}<br>`;
                    tooltipHTML += `Size: ${formatBytes(partSize)}`;
                    if (part.mountpoint) tooltipHTML += `<br>Mount: ${part.mountpoint}`;

                    let barText = '';
                    if (label) barText = label;
                    else if (part.mountpoint) barText = part.mountpoint;
                    else if (partTypeName) barText = partTypeName;
                    else barText = fstype;
                    
                    if (fsver && fstype !== 'Unknown') barText += ` (${fsver})`;

                    partitionHtml += `
                        <div class="partition ${cssClass}" style="width: ${percent}%;" data-tooltip="${tooltipHTML.replace(/"/g, '&quot;')}">
                            ${percent > 8 ? barText : ''} 
                        </div>
                    `;
                });
            }

            const unallocatedBytes = diskSize - usedBytes;
            if (unallocatedBytes > (10 * 1024 * 1024)) { 
                const unallocPercent = (unallocatedBytes / diskSize) * 100;
                let unallocTooltip = `<strong>Unallocated Space</strong>Size: ${formatBytes(unallocatedBytes)}`;
                partitionHtml += `
                    <div class="partition part-free" style="width: ${unallocPercent}%;" data-tooltip="${unallocTooltip}">
                        ${unallocPercent > 5 ? 'Unallocated' : ''}
                    </div>
                `;
            }

            const card = document.createElement('div');
            card.className = 'drive-card';
            card.innerHTML = `
                <div class="drive-header">
                    <div class="drive-image">
                        ${imgElement}
                    </div>
                    <div class="drive-info">
                        <h3>${fullName} <span class="serial-number">S/N: ${serial}</span></h3>
                        ${labelSubtitleHtml}
                        <div class="badge-group">
                            ${badgeHtml}
                        </div>
                        <p style="font-size: 14px; margin-top: 5px;"><strong>Total Capacity:</strong> ${formatBytes(diskSize)}</p>
                    </div>
                </div>
                <div class="partition-container">
                    <div class="partition-bar">
                        ${partitionHtml || '<div class="partition part-free" style="width: 100%;" data-tooltip="<strong>Unpartitioned</strong><br>Size: ' + formatBytes(diskSize) + '">Unpartitioned</div>'}
                    </div>
                </div>
            `;
            container.appendChild(card);
        });

        initTooltips();

    } catch (error) {
        container.innerHTML = `<p style="color: red;">Failed to connect to backend.</p>`;
        console.error(error);
    }
}

// --- Dynamic Collision Tooltip Logic ---
function initTooltips() {
    let tooltip = document.getElementById('disk-hunter-tooltip');
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.id = 'disk-hunter-tooltip';
        tooltip.className = 'custom-tooltip';
        document.body.appendChild(tooltip);
    }

    const partitions = document.querySelectorAll('.partition');
    partitions.forEach(part => {
        part.addEventListener('mouseenter', () => {
            const content = part.getAttribute('data-tooltip');
            if (content) {
                tooltip.innerHTML = content;
                tooltip.classList.add('visible');
            }
        });

        part.addEventListener('mousemove', (e) => {
            const tooltipWidth = tooltip.offsetWidth;
            const tooltipHeight = tooltip.offsetHeight;
            const windowWidth = window.innerWidth;
            const windowHeight = window.innerHeight;

            let x = e.clientX + 15;
            let y = e.clientY + 15;

            // Collision detection
            if (x + tooltipWidth > windowWidth) {
                x = e.clientX - tooltipWidth - 15; 
            }
            if (y + tooltipHeight > windowHeight) {
                y = e.clientY - tooltipHeight - 15; 
            }

            tooltip.style.left = x + 'px';
            tooltip.style.top = y + 'px';
        });

        part.addEventListener('mouseleave', () => {
            tooltip.classList.remove('visible');
        });
    });
}