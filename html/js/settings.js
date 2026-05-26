document.addEventListener('DOMContentLoaded', () => {
    // --- Settings Toggles & Initializers ---
    const pdfToggle = document.getElementById('pdf-report-toggle');
    const debugToggle = document.getElementById('debug-mode-toggle');
    const protectRootToggle = document.getElementById('protect-root-toggle');
    const potatoModeToggle = document.getElementById('potato-mode-toggle');

    // --- Force Fresh Logo Fetch ---
    const logoPreview = document.getElementById('logo-preview-img');
    if (logoPreview) {
        logoPreview.src = '/api/images/logo.png?t=' + new Date().getTime();
        logoPreview.onerror = () => {
            logoPreview.style.display = 'none';
            const noLogoText = document.getElementById('no-logo-text');
            if (noLogoText) noLogoText.style.display = 'block';
        };
        logoPreview.onload = () => {
            logoPreview.style.display = 'block';
            const noLogoText = document.getElementById('no-logo-text');
            if (noLogoText) noLogoText.style.display = 'none';
        }
    }
    
    // --- Timezone Logic ---
    const tzSelect = document.getElementById('timezone-select');
    if (tzSelect) {
        tzSelect.value = localStorage.getItem('dh_timezone') || 'UTC';
        document.getElementById('btn-save-tz').addEventListener('click', (e) => {
            localStorage.setItem('dh_timezone', tzSelect.value);
            e.target.innerText = "Saved!";
            setTimeout(() => e.target.innerText = "Save Timezone", 2000);
        });
    }

    if (localStorage.getItem('disk_hunter_pdf') === 'true') pdfToggle.checked = true;
    if (localStorage.getItem('disk_hunter_debug') === 'true') debugToggle.checked = true;
    if (localStorage.getItem('potatoMode') === 'true') potatoModeToggle.checked = true;
    
    if (localStorage.getItem('disk_hunter_protect_root') === 'false') {
        protectRootToggle.checked = false;
    }

    pdfToggle.addEventListener('change', (e) => localStorage.setItem('disk_hunter_pdf', e.target.checked));
    debugToggle.addEventListener('change', (e) => localStorage.setItem('disk_hunter_debug', e.target.checked));
    protectRootToggle.addEventListener('change', (e) => localStorage.setItem('disk_hunter_protect_root', e.target.checked));

    potatoModeToggle.addEventListener('change', (e) => {
        localStorage.setItem('potatoMode', e.target.checked);
        if (e.target.checked) {
            document.body.classList.add('potato-mode');
        } else {
            document.body.classList.remove('potato-mode');
        }
    });

    // --- Config Export/Import ---
    document.getElementById('btn-export-config').addEventListener('click', () => {
        const config = {
            'disk_hunter_pdf': localStorage.getItem('disk_hunter_pdf') || 'false',
            'disk_hunter_debug': localStorage.getItem('disk_hunter_debug') || 'false',
            'disk_hunter_protect_root': localStorage.getItem('disk_hunter_protect_root') || 'true',
            'dh_timezone': localStorage.getItem('dh_timezone') || 'UTC',
            'dh_comp_name': localStorage.getItem('dh_comp_name') || '',
            'dh_comp_addr': localStorage.getItem('dh_comp_addr') || '',
            'dh_comp_phone': localStorage.getItem('dh_comp_phone') || '',
            'dh_dc_tags': localStorage.getItem('dh_dc_tags') || '["DatacenterX","DatacenterY"]'
        };
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(config, null, 2));
        const dlAnchorElem = document.createElement('a');
        dlAnchorElem.setAttribute("href",     dataStr     );
        dlAnchorElem.setAttribute("download", "disk_hunter_config.json");
        dlAnchorElem.click();
    });

    document.getElementById('btn-import-config').addEventListener('click', () => {
        document.getElementById('import-config-file').click();
    });

    document.getElementById('import-config-file').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const config = JSON.parse(event.target.result);
                for (const [key, value] of Object.entries(config)) {
                    localStorage.setItem(key, value);
                }
                const status = document.getElementById('config-status');
                status.innerHTML = `<span style="color: var(--accent-green);">Config imported successfully. Reloading...</span>`;
                setTimeout(() => location.reload(), 1500);
            } catch (err) {
                document.getElementById('config-status').innerHTML = `<span style="color: red;">Invalid JSON file.</span>`;
            }
        };
        reader.readAsText(file);
    });

    // --- Mock Pipeline Logic ---
    document.getElementById('btn-mock-pipeline').addEventListener('click', async (e) => {
        const status = document.getElementById('mock-pipeline-status');
        e.target.disabled = true;
        e.target.innerText = "Simulating Pipeline...";
        
        try {
            const currentTz = localStorage.getItem('dh_timezone') || 'UTC';
            
            const res = await fetch('/api/settings/mock-pipeline', { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ timezone: currentTz })
            });
            const data = await res.json();
            status.innerHTML = `<span style="color: ${data.status === 'success' ? 'var(--accent-green)' : 'red'};">${data.message}</span>`;
        } catch (err) {
            status.innerHTML = `<span style="color: red;">Network error. Check backend logs.</span>`;
        } finally {
            e.target.disabled = false;
            e.target.innerText = "Trigger Mock Success";
        }
    });

    // --- Branding Logic ---
    const iName = document.getElementById('comp-name');
    const iAddr = document.getElementById('comp-addr');
    const iPhone = document.getElementById('comp-phone');

    iName.value = localStorage.getItem('dh_comp_name') || '';
    iAddr.value = localStorage.getItem('dh_comp_addr') || '';
    iPhone.value = localStorage.getItem('dh_comp_phone') || '';

    document.getElementById('btn-save-branding').addEventListener('click', (e) => {
        localStorage.setItem('dh_comp_name', iName.value);
        localStorage.setItem('dh_comp_addr', iAddr.value);
        localStorage.setItem('dh_comp_phone', iPhone.value);
        e.target.innerText = "Saved!";
        setTimeout(() => e.target.innerText = "Save Text Details", 2000);
    });

    document.getElementById('logo-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fileInput = document.getElementById('logo-file').files[0];
        const statusDiv = document.getElementById('logo-status');
        if (!fileInput) return;

        const formData = new FormData();
        formData.append('file', fileInput);

        try {
            const response = await fetch('/api/settings/upload-logo', { method: 'POST', body: formData });
            const result = await response.json();
            statusDiv.innerHTML = `<span style="color: ${result.status==='success'?'var(--accent-green)':'red'};">${result.message}</span>`;
            if (result.status === 'success') {
                if (logoPreview) {
                    logoPreview.src = '/api/images/logo.png?t=' + new Date().getTime();
                    logoPreview.style.display = 'block';
                    const noLogoText = document.getElementById('no-logo-text');
                    if (noLogoText) noLogoText.style.display = 'none';
                }
            }
        } catch (error) {
            statusDiv.innerHTML = `<span style="color: red;">Upload failed.</span>`;
        }
    });

    // --- Datacenter Tags Logic ---
    let dcTags = JSON.parse(localStorage.getItem('dh_dc_tags')) || ['DatacenterX', 'DatacenterY'];
    const tagContainer = document.getElementById('tag-container');
    const tagInput = document.getElementById('new-tag-input');

    function renderTags() {
        tagContainer.innerHTML = '';
        localStorage.setItem('dh_dc_tags', JSON.stringify(dcTags));
        dcTags.forEach(tag => {
            const pill = document.createElement('span');
            pill.style.cssText = "background: #334155; padding: 6px 12px; border-radius: 20px; font-size: 13px; display: flex; align-items: center; gap: 8px;";
            pill.innerHTML = `${tag} <span style="color: var(--accent-red); cursor: pointer; font-weight: bold;" onclick="removeTag('${tag}')">×</span>`;
            tagContainer.appendChild(pill);
        });
    }

    window.removeTag = function(tag) {
        dcTags = dcTags.filter(t => t !== tag);
        renderTags();
    }

    document.getElementById('btn-add-tag').addEventListener('click', () => {
        const val = tagInput.value.trim();
        if (val && !dcTags.includes(val)) {
            dcTags.push(val);
            tagInput.value = '';
            renderTags();
        }
    });
    renderTags();

    // --- Drive Manager Modal Logic ---
    const btnOpenDriveManager = document.getElementById('btn-open-drive-manager');
    if (btnOpenDriveManager) {
        btnOpenDriveManager.addEventListener('click', openDriveManager);
    }
});

// Global card toggle
window.toggleCard = function(headerElem) {
    const icon = headerElem.querySelector('.minimize-icon');
    const content = headerElem.nextElementSibling;
    if (content.classList.contains('minimized')) {
        content.classList.remove('minimized');
        icon.classList.remove('minimized');
    } else {
        content.classList.add('minimized');
        icon.classList.add('minimized');
    }
};

let selectedPoolImage = null;

window.openDriveManager = function() {
    document.getElementById('drive-manager-modal').classList.add('active');
    loadDriveModels();
    loadPoolImages();
};

window.closeDriveManager = function() {
    document.getElementById('drive-manager-modal').classList.remove('active');
};

async function loadDriveModels() {
    const listDiv = document.getElementById('drive-models-list');
    listDiv.innerHTML = 'Loading...';
    try {
        const data = await window.diskService.getDisks();

        if (data.status !== 'success' || !data.disks || data.disks.length === 0) {
            listDiv.innerHTML = '<p style="color:var(--text-muted); font-size:13px;">No drives found on system.</p>';
            return;
        }

        const uniqueModels = Array.from(new Set(data.disks.map(disk => {
            const rawVendor = disk.vendor ? disk.vendor.trim() + ' ' : '';
            const rawModel = disk.model ? disk.model.trim() : 'Unknown';
            return rawVendor + rawModel;
        })));

        listDiv.innerHTML = '';
        uniqueModels.forEach(modelName => {
            const normalizedId = modelName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
            const item = document.createElement('div');
            item.className = 'drive-item';
            
            item.innerHTML = `
                <div class="drive-item-info">
                    <img src="/api/images/drives/${normalizedId}.jpg" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' viewBox=\\'0 0 100 100\\'%3E%3Crect width=\\'100\\' height=\\'100\\' fill=\\'%23334155\\'/%3E%3C/svg%3E';">
                    <span class="drive-item-name">${modelName}</span>
                </div>
                <button class="btn-assign" onclick="assignSelectedImage('${normalizedId}', this)">Assign Selected</button>
            `;
            listDiv.appendChild(item);
        });
    } catch (error) {
        listDiv.innerHTML = '<span style="color:red;">Error loading drive models.</span>';
    }
}

async function loadPoolImages() {
    const grid = document.getElementById('image-pool-grid');
    grid.innerHTML = 'Loading...';
    selectedPoolImage = null;
    try {
        const res = await fetch('/api/images/pool');
        const data = await res.json();
        
        grid.innerHTML = '';
        if (!data.images || data.images.length === 0) {
            grid.innerHTML = '<p style="grid-column: 1/-1; color:var(--text-muted); font-size:13px; text-align:center;">Pool is empty.</p>';
            return;
        }

        data.images.forEach(filename => {
            const wrapper = document.createElement('div');
            wrapper.className = 'pool-image-wrapper';
            wrapper.onclick = () => selectPoolImage(wrapper, filename);
            
            const img = document.createElement('img');
            img.src = `/api/images/pool/${filename}`;
            img.className = 'pool-image';
            img.title = filename;
            
            wrapper.appendChild(img);
            grid.appendChild(wrapper);
        });
    } catch (err) {
        grid.innerHTML = '<span style="color:red;">Error loading pool images.</span>';
    }
}

function selectPoolImage(wrapper, filename) {
    document.querySelectorAll('.pool-image-wrapper').forEach(w => w.classList.remove('selected'));
    wrapper.classList.add('selected');
    selectedPoolImage = filename;
}

window.assignSelectedImage = async function(normalizedId, btnElement) {
    if (!selectedPoolImage) {
        customAlert("Please select an image from the pool first.");
        return;
    }
    
    const originalText = btnElement.innerText;
    btnElement.innerText = "Assigning...";
    btnElement.disabled = true;
    
    const formData = new FormData();
    formData.append('drive_id', normalizedId);
    formData.append('pool_filename', selectedPoolImage);
    
    try {
        const res = await fetch('/api/images/assign', { method: 'POST', body: formData });
        const data = await res.json();
        if (data.status === 'success') {
            btnElement.innerText = "Assigned!";
            // Force reload the image next to it
            const imgEl = btnElement.previousElementSibling.querySelector('img');
            if (imgEl) imgEl.src = `/api/images/drives/${normalizedId}.jpg?t=${new Date().getTime()}`;
            setTimeout(() => { btnElement.innerText = originalText; btnElement.disabled = false; }, 2000);
        } else {
            customAlert(data.message || "Failed to assign.");
            btnElement.innerText = originalText;
            btnElement.disabled = false;
        }
    } catch (err) {
        customAlert("Network error.");
        btnElement.innerText = originalText;
        btnElement.disabled = false;
    }
}

// Mass upload drag & drop
const dropzone = document.getElementById('dropzone');
const uploadInput = document.getElementById('mass-upload-input');
const uploadStatus = document.getElementById('mass-upload-status');

if (dropzone && uploadInput) {
    dropzone.addEventListener('click', () => uploadInput.click());
    
    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
    });
    
    dropzone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
    });
    
    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        if (e.dataTransfer.files.length) {
            handleMassUpload(e.dataTransfer.files);
        }
    });
    
    uploadInput.addEventListener('change', (e) => {
        if (e.target.files.length) {
            handleMassUpload(e.target.files);
        }
    });
}

async function handleMassUpload(files) {
    const formData = new FormData();
    let validCount = 0;
    
    for (let i = 0; i < files.length; i++) {
        if (files[i].type.startsWith('image/')) {
            formData.append('files', files[i]);
            validCount++;
        }
    }
    
    if (validCount === 0) {
        uploadStatus.innerHTML = '<span style="color:red;">No valid image files selected.</span>';
        return;
    }
    
    uploadStatus.innerHTML = '<span style="color:var(--text-muted);">Uploading...</span>';
    
    try {
        const res = await fetch('/api/images/pool/upload', { method: 'POST', body: formData });
        const data = await res.json();
        
        if (data.status === 'success') {
            uploadStatus.innerHTML = '<span style="color:var(--accent-green);">Upload successful!</span>';
            loadPoolImages();
        } else {
            uploadStatus.innerHTML = `<span style="color:red;">${data.message || 'Upload failed.'}</span>`;
        }
    } catch (err) {
        uploadStatus.innerHTML = '<span style="color:red;">Network error during upload.</span>';
    }
    
    // reset input
    uploadInput.value = '';
}
