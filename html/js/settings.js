document.addEventListener('DOMContentLoaded', () => {
    populateDriveSelect();

    const form = document.getElementById('image-upload-form');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const driveId = document.getElementById('drive-select').value;
        const fileInput = document.getElementById('image-file');
        const status = document.getElementById('upload-status');

        if (!driveId) { status.innerHTML = '<span style="color: red;">Please select a drive.</span>'; return; }
        if (!fileInput.files[0]) { status.innerHTML = '<span style="color: red;">Please select an image.</span>'; return; }

        const file = fileInput.files[0];
        if (file.size > 100 * 1024 * 1024) {
            status.innerHTML = '<span style="color: red;">File exceeds 100MB limit.</span>';
            return;
        }

        const formData = new FormData();
        formData.append('drive_id', driveId);
        formData.append('file', file);

        status.innerHTML = '<span style="color: var(--primary);">Uploading...</span>';

        try {
            const response = await fetch('/api/upload-image', { method: 'POST', body: formData });
            const result = await response.json();
            
            if (result.status === 'success') {
                status.innerHTML = `<span style="color: var(--accent-green);">Success! Image applied.</span>`;
                form.reset();
            } else {
                status.innerHTML = `<span style="color: red;">Error: ${result.message}</span>`;
            }
        } catch (error) {
            status.innerHTML = `<span style="color: red;">Network error.</span>`;
        }
    });
});

async function populateDriveSelect() {
    const select = document.getElementById('drive-select');
    try {
        const response = await fetch('/api/disks');
        const data = await response.json();
        
        select.innerHTML = '<option value="">-- Choose a Drive --</option>';
        
        data.disks.forEach(disk => {
            const vendor = disk.vendor ? disk.vendor.trim() + ' ' : '';
            const model = disk.model ? disk.model.trim() : 'Unknown';
            const fullName = vendor + model;
            
            // This normalizes the name: "Kingston Store N Go" -> "kingston_store_n_go"
            const normalizedId = fullName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
            
            select.innerHTML += `<option value="${normalizedId}">${fullName} (${disk.path})</option>`;
        });
    } catch (error) {
        select.innerHTML = '<option value="">Failed to load drives</option>';
    }
}