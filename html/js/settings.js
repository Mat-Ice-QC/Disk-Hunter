document.addEventListener('DOMContentLoaded', () => {
    // --- Settings Toggles & Initializers ---
    const pdfToggle = document.getElementById('pdf-report-toggle');
    const debugToggle = document.getElementById('debug-mode-toggle');
    const protectRootToggle = document.getElementById('protect-root-toggle');

    // --- Force Fresh Logo Fetch ---
    const logoPreview = document.getElementById('current-logo-img');
    if (logoPreview) logoPreview.src = '/api/images/logo.png?t=' + new Date().getTime();
    
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
    
    // Protect root is default true, so we only uncheck if explicitly set to false
    if (localStorage.getItem('disk_hunter_protect_root') === 'false') {
        protectRootToggle.checked = false;
    }

    pdfToggle.addEventListener('change', (e) => localStorage.setItem('disk_hunter_pdf', e.target.checked));
    debugToggle.addEventListener('change', (e) => localStorage.setItem('disk_hunter_debug', e.target.checked));
    protectRootToggle.addEventListener('change', (e) => localStorage.setItem('disk_hunter_protect_root', e.target.checked));

    populateDriveModelDropdown();

    // --- Function to populate drive models in the image upload form ---
    async function populateDriveModelDropdown() {
        const selectEl = document.getElementById('drive-id-select');
        if (!selectEl) return;

        try {
            const res = await fetch('/api/disks');
            const data = await res.json();

            if (data.status !== 'success' || data.disks.length === 0) {
                selectEl.innerHTML = '<option value="">No drives found to assign images to.</option>';
                return;
            }

            const uniqueModels = new Set(data.disks.map(disk => {
                const rawVendor = disk.vendor ? disk.vendor.trim() + ' ' : '';
                const rawModel = disk.model ? disk.model.trim() : 'Unknown';
                return rawVendor + rawModel;
            }));

            selectEl.innerHTML = '<option value="">-- Select a Drive Model --</option>';
            uniqueModels.forEach(modelName => selectEl.innerHTML += `<option value="${modelName}">${modelName}</option>`);
        } catch (error) {
            console.error("Failed to fetch disks for dropdown:", error);
            selectEl.innerHTML = '<option value="">Error loading drive models.</option>';
        }
    }

    // --- Image Upload Logic ---
    document.getElementById('upload-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const driveModelSelect = document.getElementById('drive-id-select');
        const fileInput = document.getElementById('image-file').files[0];
        const statusDiv = document.getElementById('upload-status');
        const btn = e.target.querySelector('button');

        if (!fileInput) {
            statusDiv.innerHTML = '<span style="color: red;">Please select an image.</span>';
            return;
        }

        if (!driveModelSelect || !driveModelSelect.value) {
            statusDiv.innerHTML = '<span style="color: red;">Please select a drive model from the list.</span>';
            return;
        }

        const normalizedId = driveModelSelect.value.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();

        btn.innerText = "Uploading...";
        btn.disabled = true;

        const formData = new FormData();
        formData.append('drive_id', normalizedId);
        formData.append('file', fileInput);

        try {
        const response = await fetch('/api/upload-image', { method: 'POST', body: formData });
        const result = await response.json();
            
            if (result.status === 'success') {
                statusDiv.innerHTML = `<span style="color: var(--accent-green);">${result.message}. The new image will be visible on the Dashboard and Shredding pages.</span>`;
                document.getElementById('upload-form').reset();
            } else {
                statusDiv.innerHTML = `<span style="color: red;">${result.message}</span>`;
            }
        } catch (error) {
            statusDiv.innerHTML = `<span style="color: red;">Upload failed.</span>`;
        } finally {
            btn.innerText = "Upload and Apply";
            btn.disabled = false;
        }
    });
 // --- Mock Pipeline Logic ---
    document.getElementById('btn-mock-pipeline').addEventListener('click', async (e) => {
        const status = document.getElementById('mock-pipeline-status');
        e.target.disabled = true;
        e.target.innerText = "Simulating Pipeline...";
        
        try {
            // Grab the saved timezone!
            const currentTz = localStorage.getItem('dh_timezone') || 'UTC';
            
            const res = await fetch('/api/settings/mock-pipeline', { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ timezone: currentTz }) // <--- This was missing!
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
                const logoImg = document.getElementById('current-logo-img');
                if (logoImg) logoImg.src = '/api/images/logo.png?t=' + new Date().getTime();
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

    // --- Clear Logs Logic ---
    document.getElementById('btn-clear-shred-logs').addEventListener('click', async (e) => {
        if (!confirm("Are you sure you want to clear all shredding logs? This action cannot be undone.")) return;
        const statusDiv = document.getElementById('clear-logs-status');
        e.target.disabled = true;
        try {
            const res = await fetch('/api/history/clear', { method: 'DELETE' });
            const data = await res.json();
            statusDiv.innerHTML = `<span style="color: ${data.status === 'success' ? 'var(--accent-green)' : 'var(--accent-red)'};">${data.message}</span>`;
        } catch (err) {
            statusDiv.innerHTML = `<span style="color: var(--accent-red);">Network error while clearing shredding logs.</span>`;
        } finally {
            e.target.disabled = false;
        }
    });

    document.getElementById('btn-clear-smart-logs').addEventListener('click', async (e) => {
        if (!confirm("Are you sure you want to clear all S.M.A.R.T. logs? This action cannot be undone.")) return;
        const statusDiv = document.getElementById('clear-logs-status');
        e.target.disabled = true;
        try {
            const res = await fetch('/api/smart-history/clear', { method: 'DELETE' });
            const data = await res.json();
            statusDiv.innerHTML = `<span style="color: ${data.status === 'success' ? 'var(--accent-green)' : 'var(--accent-red)'};">${data.message}</span>`;
        } catch (err) {
            statusDiv.innerHTML = `<span style="color: var(--accent-red);">Network error while clearing S.M.A.R.T. logs.</span>`;
        } finally {
            e.target.disabled = false;
        }
    });
});