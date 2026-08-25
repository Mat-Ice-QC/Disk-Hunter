let thermalRefreshTimer = null;

document.addEventListener('DOMContentLoaded', () => {
    fetchThermalZones();
    document.getElementById('btn-refresh-thermal').addEventListener('click', fetchThermalZones);
    thermalRefreshTimer = setInterval(fetchThermalZones, 3000);
});

async function fetchThermalZones() {
    const grid = document.getElementById('thermal-grid');
    if (!grid) return;
    try {
        const res = await fetch('/api/system/thermal-zones');
        const data = await res.json();
        if (data.status === 'success') {
            renderThermalZones(data.zones || []);
        } else {
            grid.innerHTML = `<p style="color: var(--accent-red);">Error: ${data.message || 'failed to load'}</p>`;
        }
    } catch (e) {
        console.error('Thermal zones fetch error:', e);
        grid.innerHTML = '<p style="color: var(--accent-red);">Network error while loading sensors.</p>';
    }
}

function renderThermalZones(zones) {
    const grid = document.getElementById('thermal-grid');
    if (!grid) return;

    if (zones.length === 0) {
        grid.innerHTML = '<p style="color: var(--text-muted);">No thermal sensors detected on this machine.</p>';
        return;
    }

    grid.innerHTML = '';
    zones.forEach(zone => {
        const card = document.createElement('div');
        card.className = 'thermal-card';

        let tempClass = 'na';
        let tempText = 'N/A';
        if (zone.temp !== null && zone.temp !== undefined) {
            tempText = zone.temp + '°C';
            if (zone.temp >= 75) tempClass = 'hot';
            else if (zone.temp >= 60) tempClass = 'warn';
            else tempClass = '';
        }

        card.innerHTML = `
            <div class="zone-id">${zone.id}</div>
            <div class="zone-name">${zone.name}</div>
            <div class="zone-temp ${tempClass}">${tempText}</div>
        `;
        grid.appendChild(card);
    });
}
