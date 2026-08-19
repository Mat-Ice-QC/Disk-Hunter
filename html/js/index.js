/* html/js/index.js */

let previousDisksHash = "";
try {
    window.smartStatusCache = JSON.parse(sessionStorage.getItem('dh_smart_cache')) || {};
} catch (e) {
    window.smartStatusCache = {};
}

function getCachedSmartStatus(diskName) {
    const cached = window.smartStatusCache[diskName];
    if (cached && cached.timestamp && (Date.now() - cached.timestamp < 30000)) {
        return cached.data;
    }
    return null;
}

document.addEventListener('DOMContentLoaded', () => {
    // 1. Immediate HTTP scan fallback
    fetchDisks();

    // 2. WebSocket real-time synchronizers
    document.addEventListener('ws-disks', (e) => {
        renderDisks(e.detail);
    });

    document.addEventListener('dh-language-changed', (e) => {
        previousDisksHash = "";
        if (window.renderedDisksList) {
            renderDisks(window.renderedDisksList);
        }
    });

    document.addEventListener('ws-wipe_status', (e) => {
        window.currentWipeStatus = e.detail;
        updateOperationsUI();
    });

    document.addEventListener('ws-smart_status', (e) => {
        window.currentSmartStatus = e.detail;
        updateOperationsUI();
    });

    document.addEventListener('ws-speedtest_status', (e) => {
        window.currentSpeedtestStatus = e.detail;
        updateOperationsUI();
    });

    // 3. Performance Optimization: Read instantly from WebSocket cache if it exists
    const cached = sessionStorage.getItem('dh_ws_cache');
    if (cached) {
        try {
            const data = JSON.parse(cached);
            if (data.disks) renderDisks(data.disks);
            if (data.wipe_status) window.currentWipeStatus = data.wipe_status;
            if (data.smart_status) window.currentSmartStatus = data.smart_status;
            if (data.speedtest_status) window.currentSpeedtestStatus = data.speedtest_status;
            updateOperationsUI();
        } catch (e) {
            console.error("Error applying cached WS data:", e);
        }
    }
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
    if (!fstype) return 'part-unknown';
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

/* --- Vector Illustrations for Hard Drive Hardware --- */

function getNvmeSVG(ledClass = 'led-normal') {
    return `
    <svg class="drive-svg" viewBox="0 0 120 90" xmlns="http://www.w3.org/2000/svg">
        <!-- PCB Board -->
        <rect x="10" y="32" width="100" height="26" rx="3" fill="#047857" stroke="#059669" stroke-width="1"/>
        <!-- Gold Interface Pins -->
        <rect x="10" y="34" width="4" height="22" fill="#fbbf24"/>
        <line x1="10" y1="38" x2="14" y2="38" stroke="#000" stroke-width="1"/>
        <line x1="10" y1="42" x2="14" y2="42" stroke="#000" stroke-width="1"/>
        <line x1="10" y1="46" x2="14" y2="46" stroke="#000" stroke-width="1"/>
        <line x1="10" y1="50" x2="14" y2="50" stroke="#000" stroke-width="1"/>
        <line x1="10" y1="54" x2="14" y2="54" stroke="#000" stroke-width="1"/>
        <!-- Controller Chip -->
        <rect x="25" y="36" width="18" height="18" rx="2" fill="#374151" stroke="#4b5563" stroke-width="1"/>
        <rect x="29" y="40" width="10" height="10" rx="1" fill="#1f2937"/>
        <!-- NAND Flash Memory Blocks -->
        <rect x="52" y="36" width="22" height="18" rx="2" fill="#111827" stroke="#374151" stroke-width="1"/>
        <rect x="80" y="36" width="22" height="18" rx="2" fill="#111827" stroke="#374151" stroke-width="1"/>
        <!-- SMD details -->
        <rect x="47" y="38" width="2" height="4" fill="#94a3b8"/>
        <rect x="47" y="48" width="2" height="4" fill="#94a3b8"/>
        <!-- Mounting Screw Slot -->
        <circle cx="104" cy="45" r="3.5" fill="#0b1329" stroke="#94a3b8" stroke-width="1"/>
        <!-- Dynamic LED Indicator -->
        <circle cx="16" cy="45" r="2.5" class="led-glow ${ledClass}"/>
    </svg>
    `;
}

function getSataSVG(ledClass = 'led-normal') {
    return `
    <svg class="drive-svg" viewBox="0 0 120 90" xmlns="http://www.w3.org/2000/svg">
        <!-- HDD Chassis Casing -->
        <rect x="20" y="10" width="80" height="70" rx="6" fill="#1e293b" stroke="#334155" stroke-width="2"/>
        <!-- Platter Circular Line -->
        <circle cx="60" cy="42" r="28" fill="none" stroke="#475569" stroke-width="1.5" stroke-dasharray="4 2"/>
        <circle cx="60" cy="42" r="22" fill="#0f172a" stroke="#1e293b" stroke-width="1"/>
        <circle cx="60" cy="42" r="6" fill="#475569"/>
        <!-- Read/Write Actuator Head -->
        <line x1="82" y1="65" x2="63" y2="45" stroke="#94a3b8" stroke-width="2"/>
        <circle cx="82" cy="65" r="4" fill="#475569"/>
        <line x1="63" y1="45" x2="56" y2="41" stroke="#cbd5e1" stroke-width="1"/>
        <!-- Screws -->
        <circle cx="26" cy="16" r="2" fill="#475569"/>
        <circle cx="94" cy="16" r="2" fill="#475569"/>
        <circle cx="26" cy="74" r="2" fill="#475569"/>
        <circle cx="94" cy="74" r="2" fill="#475569"/>
        <!-- Metal Interface connector block -->
        <rect x="42" y="77" width="36" height="3" fill="#111827"/>
        <rect x="45" y="78" width="12" height="2" fill="#fbbf24"/>
        <!-- Dynamic LED Indicator -->
        <circle cx="28" cy="66" r="2.5" class="led-glow ${ledClass}"/>
    </svg>
    `;
}

function getUsbSVG(ledClass = 'led-normal') {
    return `
    <svg class="drive-svg" viewBox="0 0 120 90" xmlns="http://www.w3.org/2000/svg">
        <!-- Translucent USB Body -->
        <rect x="35" y="30" width="55" height="30" rx="4" fill="rgba(139, 92, 246, 0.15)" stroke="#8b5cf6" stroke-width="1.5"/>
        <!-- Internal Green PCB -->
        <rect x="42" y="34" width="42" height="22" rx="2" fill="#064e3b" stroke="#059669" stroke-width="1"/>
        <!-- Controller Chip block -->
        <rect x="54" y="39" width="13" height="12" rx="1" fill="#111827"/>
        <!-- USB Metal Connector -->
        <rect x="15" y="35" width="20" height="20" rx="1.5" fill="#475569" stroke="#94a3b8" stroke-width="1"/>
        <line x1="28" y1="41" x2="33" y2="41" stroke="#fbbf24" stroke-width="1.5"/>
        <line x1="28" y1="45" x2="33" y2="45" stroke="#fbbf24" stroke-width="1.5"/>
        <line x1="28" y1="49" x2="33" y2="49" stroke="#fbbf24" stroke-width="1.5"/>
        <line x1="28" y1="53" x2="33" y2="53" stroke="#fbbf24" stroke-width="1.5"/>
        <!-- Hanging loop -->
        <circle cx="84" cy="45" r="4.5" fill="none" stroke="#8b5cf6" stroke-width="1.5"/>
        <!-- Dynamic LED Indicator -->
        <circle cx="74" cy="45" r="2" class="led-glow ${ledClass}"/>
    </svg>
    `;
}

async function fetchDisks() {
    const container = document.getElementById('disk-list-container');
    if (!container.children.length) {
        container.innerHTML = '<p>Scanning hardware...</p>';
    }

    try {
        const data = await window.diskService.getDisks();

        if (data.status !== 'success') {
            container.innerHTML = `<p style="color: var(--accent-red);">Error: ${data.message}</p>`;
            return;
        }

        renderDisks(data.disks);
    } catch (error) {
        if (!container.children.length || container.innerText.includes('Scanning')) {
            container.innerHTML = `<p style="color: var(--accent-red);">Failed to connect to backend.</p>`;
        }
        console.error(error);
    }
}

function renderDisks(disksInput) {
    const container = document.getElementById('disk-list-container');
    if (!container) return;

    let disks = disksInput;
    if (disksInput && !Array.isArray(disksInput) && Array.isArray(disksInput.disks)) {
        disks = disksInput.disks;
    }

    if (!disks || !Array.isArray(disks)) {
        console.error("Invalid disks array passed to renderDisks", disksInput);
        return;
    }

    // Hash calculation to prevent redundant redrawing and layout flashing
    const currentHash = disks.map(d => `${d.name}:${d.path}:${d.size}:${d.children ? d.children.map(c => `${c.name}:${c.size}:${c.mountpoint || ''}:${c.label || ''}`).join(',') : ''}`).join('|');
    if (currentHash === previousDisksHash) {
        window.renderedDisksList = disks;
        updateOperationsUI();
        return;
    }
    previousDisksHash = currentHash;

    // Track active disk data in window for dynamic WS updates
    window.renderedDisksList = disks;
    container.innerHTML = '';

    disks.forEach(disk => {
        const diskSize = parseInt(disk.size);
        const rawVendor = disk.vendor ? disk.vendor.trim() + ' ' : '';
        const rawModel = disk.model ? disk.model.trim() : 'Unknown';
        const fullName = rawVendor + rawModel;
        
        const normalizedId = fullName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
        const serial = disk.serial ? disk.serial.trim() : 'N/A';
        const interfaceType = getInterfaceName(disk.tran, disk.name);
        const pttypeMap = { 'dos': 'MBR', 'gpt': 'GPT' };
        const pttypeRaw = disk.pttype ? disk.pttype.toLowerCase() : 'unknown';
        const pttype = pttypeMap[pttypeRaw] || pttypeRaw.toUpperCase();
        const isReadOnly = disk.ro === 1 || disk.ro === true;
        
        // Choose initial LED class from cached SMART health if available
        let initialLedClass = 'led-normal';
        const cachedData = getCachedSmartStatus(disk.name);
        if (cachedData) {
            const health = cachedData.health || 'Unknown';
            const healthLower = health.toLowerCase();
            if (healthLower.includes('passed') || healthLower.includes('ok') || healthLower.includes('good')) {
                initialLedClass = 'led-ok';
            } else if (healthLower.includes('fail') || healthLower.includes('alert') || healthLower.includes('bad')) {
                initialLedClass = 'led-danger';
            }
        }

        // Choose illustration & card class
        const tran = (disk.tran || '').toLowerCase();
        const name = (disk.name || '').toLowerCase();
        let driveSVG = '';
        let glowClass = '';
        
        if (tran === 'nvme' || name.includes('nvme')) {
            driveSVG = getNvmeSVG(initialLedClass);
            glowClass = 'glow-nvme';
        } else if (tran === 'usb' || name.includes('usb') || name.startsWith('sd')) {
            driveSVG = getUsbSVG(initialLedClass);
            glowClass = 'glow-usb';
        } else {
            driveSVG = getSataSVG(initialLedClass);
            glowClass = 'glow-sata';
        }

        const imageUrl = `/api/images/drives/${normalizedId}.jpg?name=${disk.name}&tran=${disk.tran || ''}&rota=${disk.rota !== undefined ? disk.rota : ''}&model=${disk.model || ''}`;
        const imgElement = `
            <div class="drive-illustration">
                <img src="${imageUrl}" style="position: absolute; top:0; left:0; width:100%; height:100%; object-fit: cover; display: none; z-index: 5;" onload="this.style.display='block';" alt="Drive Cover Image">
                ${driveSVG}
            </div>
        `;

        const labelSubtitleHtml = disk.label 
            ? `<div class="disk-label-subtitle">${window.translate('label', 'Label')}: <span>${disk.label}</span></div>` 
            : '';

        let badgeHtml = `
            <span class="badge dev-path">${disk.path}</span>
            <span class="badge interface">${interfaceType}</span>
            <span class="badge ptable">${pttype}</span>
        `;
        if (isReadOnly) {
            badgeHtml += `<span class="badge read-only">${window.translate('read_only', 'Read-Only')}</span>`;
        }

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
                if (label) tooltipHTML += `${window.translate('label', 'Label')}: <span style="color: #fbbf24;">${label}</span><br>`;
                if (partTypeName) tooltipHTML += `Part Type: ${partTypeName}<br>`;
                tooltipHTML += `FS Type: ${fstype} ${fsver ? `(v${fsver})` : ''}<br>`;
                tooltipHTML += `Size: ${formatBytes(partSize)}`;
                if (part.mountpoint) tooltipHTML += `<br>Mount: ${part.mountpoint}`;

                let barText = label || part.mountpoint || partTypeName || fstype;
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
            let unallocTooltip = `<strong>${window.translate('unallocated', 'Unallocated')}</strong> Size: ${formatBytes(unallocatedBytes)}`;
            partitionHtml += `
                <div class="partition part-free" style="width: ${unallocPercent}%;" data-tooltip="${unallocTooltip}">
                    ${unallocPercent > 5 ? window.translate('unallocated', 'Unallocated') : ''}
                </div>
            `;
        }

        const diskTooltip = `<strong>Disk: ${fullName}</strong>` +
            `Path: <span style="color: #4ade80;">${disk.path}</span><br>` +
            `Type: ${interfaceType}<br>` +
            `Table: ${pttype}<br>` +
            `S/N: ${serial}<br>` +
            `Size: ${formatBytes(diskSize)}`;

        const card = document.createElement('div');
        card.className = `drive-card ${glowClass}`;
        card.id = `drive-card-${disk.name}`;
        card.dataset.activeOp = 'false';
        let smartBadgeHtml = '';
        if (cachedData) {
            const health = cachedData.health || 'Unknown';
            const healthLower = health.toLowerCase();
            if (healthLower.includes('passed') || healthLower.includes('ok') || healthLower.includes('good')) {
                smartBadgeHtml = `<span class="badge-smart passed" id="smart-badge-${disk.name}">${window.translate('smart_passed', 'SMART: Passed')}</span>`;
            } else if (healthLower.includes('fail') || healthLower.includes('alert') || healthLower.includes('bad')) {
                smartBadgeHtml = `<span class="badge-smart failing" id="smart-badge-${disk.name}">${window.translate('smart_failing', 'SMART: Failing')}</span>`;
            } else if (health === "Not Supported") {
                smartBadgeHtml = `<span class="badge-smart unsupported" id="smart-badge-${disk.name}">${window.translate('smart_na', 'SMART: N/A')}</span>`;
            } else {
                smartBadgeHtml = `<span class="badge-smart unsupported" id="smart-badge-${disk.name}">SMART: ${health}</span>`;
            }
        } else {
            smartBadgeHtml = `<span class="badge-smart checking" id="smart-badge-${disk.name}"><span class="spinner-mini"></span> ${window.translate('checking_smart', 'Checking SMART')}</span>`;
        }

        card.innerHTML = `
            <div class="drive-header" data-tooltip="${diskTooltip.replace(/"/g, '&quot;')}">
                ${imgElement}
                <div class="drive-info">
                    <h3>
                        <span class="drive-model-text">${fullName}</span>
                        <span class="serial-number">S/N: ${serial}</span>
                    </h3>
                    ${labelSubtitleHtml}
                    <div class="badge-group">
                        ${badgeHtml}
                        ${smartBadgeHtml}
                    </div>
                    <p class="capacity-text">
                        <strong>${formatBytes(diskSize)}</strong> ${window.translate('total_capacity', 'Total Capacity')}
                        <span style="color: var(--text-muted); font-size: 12px; margin-left: 4px;">
                            (${window.translate('partitioned', 'Partitioned')}: ${formatBytes(usedBytes)} | ${window.translate('unallocated', 'Unallocated')}: ${formatBytes(Math.max(0, unallocatedBytes))})
                        </span>
                    </p>
                </div>
            </div>
            
            <div class="drive-status-container" id="status-container-${disk.name}"></div>

            <div class="partition-section">
                <h4>${window.translate('partitions_layout', 'Partitions & Layout')}</h4>
                <div class="partition-container">
                    <div class="partition-bar">
                        ${partitionHtml || '<div class="partition part-free" style="width: 100%;" data-tooltip="<strong>' + window.translate('unpartitioned', 'Unpartitioned') + '</strong><br>Size: ' + formatBytes(diskSize) + '">' + window.translate('unpartitioned', 'Unpartitioned') + '</div>'}
                    </div>
                </div>
            </div>
        `;
        container.appendChild(card);

        // Asynchronously fetch SMART details to show passed/failing state dynamically
        loadSmartStatus(disk.name);
    });

    // Restore statuses for any active operations
    updateOperationsUI();
    if (window.applyGlobalLayout) window.applyGlobalLayout();
}

function applySmartStatusToBadge(badge, diskName, data) {
    const health = data.health || 'Unknown';
    const healthLower = health.toLowerCase();
    
    badge.className = 'badge-smart'; 
    
    if (healthLower.includes('passed') || healthLower.includes('ok') || healthLower.includes('good')) {
        badge.classList.add('passed');
        badge.innerHTML = `${window.translate('smart_passed', 'SMART: Passed')}`;
        updateLedClass(diskName, 'led-ok');
    } else if (healthLower.includes('fail') || healthLower.includes('alert') || healthLower.includes('bad')) {
        badge.classList.add('failing');
        badge.innerHTML = `${window.translate('smart_failing', 'SMART: Failing')}`;
        updateLedClass(diskName, 'led-danger');
    } else if (health === "Not Supported") {
        badge.classList.add('unsupported');
        badge.innerHTML = `${window.translate('smart_na', 'SMART: N/A')}`;
        updateLedClass(diskName, 'led-normal');
    } else {
        badge.classList.add('unsupported');
        badge.innerHTML = `SMART: ${health}`;
        updateLedClass(diskName, 'led-normal');
    }
}

async function loadSmartStatus(diskName) {
    const badge = document.getElementById(`smart-badge-${diskName}`);
    if (!badge) return;

    const cachedData = getCachedSmartStatus(diskName);
    if (cachedData) {
        applySmartStatusToBadge(badge, diskName, cachedData);
        return;
    }

    try {
        const response = await fetch(`/api/disks/${diskName}/smart-attributes`);
        const result = await response.json();
        
        if (result.status === 'success' && result.data) {
            window.smartStatusCache[diskName] = {
                timestamp: Date.now(),
                data: result.data
            };
            try {
                sessionStorage.setItem('dh_smart_cache', JSON.stringify(window.smartStatusCache));
            } catch (err) {
                console.error("Failed to save S.M.A.R.T cache:", err);
            }
            applySmartStatusToBadge(badge, diskName, result.data);
        } else {
            badge.className = 'badge-smart unsupported';
            badge.innerHTML = `${window.translate('smart_na', 'SMART: N/A')}`;
        }
    } catch (e) {
        console.error(`Error loading SMART for ${diskName}:`, e);
        badge.className = 'badge-smart unsupported';
        badge.innerHTML = `${window.translate('smart_na', 'SMART: N/A')}`;
    }
}

function updateLedClass(diskName, ledClass) {
    const card = document.getElementById(`drive-card-${diskName}`);
    if (!card) return;
    
    // Stop LED class update if currently actively executing a wipe, test, or speed test
    if (card.dataset.activeOp === 'true') return;
    
    const led = card.querySelector('.led-glow');
    if (led) {
        led.className = `led-glow ${ledClass}`;
    }
}

function updateOperationsUI() {
    if (!window.renderedDisksList || !Array.isArray(window.renderedDisksList)) return;
    
    window.renderedDisksList.forEach(disk => {
        const diskName = disk.name;
        const card = document.getElementById(`drive-card-${diskName}`);
        const statusContainer = document.getElementById(`status-container-${diskName}`);
        if (!card || !statusContainer) return;
        
        let opBannerHTML = '';
        let activeOp = false;
        let ledClass = '';
        
        // 1. Wipe job check
        if (window.currentWipeStatus && window.currentWipeStatus.wiping) {
            const wipeJob = window.currentWipeStatus.wiping.find(job => job.drive === diskName);
            if (wipeJob) {
                opBannerHTML = `<div class="active-op-banner wipe"><span class="spinner-mini"></span> ${window.translate('wiping', 'Wiping')}: ${wipeJob.progress || '0%'} (${wipeJob.status || 'Running'})</div>`;
                activeOp = true;
                ledClass = 'led-danger';
            }
        }
        
        // 2. SMART Self test check
        if (!activeOp && window.currentSmartStatus && window.currentSmartStatus.running_tests) {
            const smartJob = window.currentSmartStatus.running_tests.find(test => test.drive === diskName);
            if (smartJob) {
                opBannerHTML = `<div class="active-op-banner smart"><span class="spinner-mini"></span> SMART Self-Test: ${smartJob.progress || 0}% (${smartJob.type || 'Short'})</div>`;
                activeOp = true;
                ledClass = 'led-normal';
            }
        }
        
        // 3. Speed benchmark check
        if (!activeOp && window.currentSpeedtestStatus && window.currentSpeedtestStatus.running_tests) {
            const speedJob = window.currentSpeedtestStatus.running_tests.find(test => test.drive === diskName || (disk.children && disk.children.some(c => c.name === test.drive)));
            if (speedJob) {
                opBannerHTML = `<div class="active-op-banner speedtest"><span class="spinner-mini"></span> Speed Test Running (${speedJob.test_type || 'fio'})</div>`;
                activeOp = true;
                ledClass = 'led-warning';
            }
        }
        
        statusContainer.innerHTML = opBannerHTML;
        
        if (activeOp) {
            card.dataset.activeOp = 'true';
            const led = card.querySelector('.led-glow');
            if (led) led.className = `led-glow ${ledClass}`;
        } else {
            card.dataset.activeOp = 'false';
            // Restore S.M.A.R.T health led if available
            const smartBadge = document.getElementById(`smart-badge-${diskName}`);
            if (smartBadge) {
                if (smartBadge.classList.contains('passed')) {
                    updateLedClass(diskName, 'led-ok');
                } else if (smartBadge.classList.contains('failing')) {
                    updateLedClass(diskName, 'led-danger');
                } else {
                    updateLedClass(diskName, 'led-normal');
                }
            }
        }
    });
}