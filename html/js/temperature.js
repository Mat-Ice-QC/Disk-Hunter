let thermalRefreshTimer = null;

document.addEventListener('DOMContentLoaded', () => {
    fetchThermalZones();
    document.getElementById('btn-refresh-thermal').addEventListener('click', fetchThermalZones);
    thermalRefreshTimer = setInterval(fetchThermalZones, 5000);
    // Skip polling while hidden; refresh once when the tab becomes visible
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) fetchThermalZones();
    });
});

async function fetchThermalZones() {
    const grid = document.getElementById('thermal-grid');
    if (!grid || document.hidden) return;
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

function zoneTempState(temp) {
    if (temp === null || temp === undefined) return { cls: 'na', text: 'N/A' };
    if (temp >= 75) return { cls: 'hot', text: temp + '\u00B0C' };
    if (temp >= 60) return { cls: 'warn', text: temp + '\u00B0C' };
    return { cls: '', text: temp + '\u00B0C' };
}

function renderThermalZones(zones) {
    const grid = document.getElementById('thermal-grid');
    if (!grid) return;

    if (zones.length === 0) {
        grid.innerHTML = '<p style="color: var(--text-muted);">No thermal sensors detected on this machine.</p>';
        return;
    }

    // Drop any message left by a previous empty/error render
    const message = grid.querySelector('p');
    if (message) message.remove();

    // Existing cards keyed by zone id: update in place, only add/remove on change
    const cardById = new Map();
    grid.querySelectorAll('.thermal-card').forEach(card => cardById.set(card.dataset.zoneId, card));

    zones.forEach(zone => {
        const key = String(zone.id);
        let card = cardById.get(key);
        if (!card) {
            card = document.createElement('div');
            card.className = 'thermal-card';
            card.dataset.zoneId = key;
            card.innerHTML = `
                <div class="zone-id"></div>
                <div class="zone-name"></div>
                <div class="zone-temp"></div>
            `;
            grid.appendChild(card);
        }
        updateThermalCard(card, zone);
    });

    // Remove cards for zones that no longer exist
    const zoneIds = new Set(zones.map(zone => String(zone.id)));
    cardById.forEach((card, key) => {
        if (!zoneIds.has(key)) card.remove();
    });
}

function updateThermalCard(card, zone) {
    const idEl = card.querySelector('.zone-id');
    const nameEl = card.querySelector('.zone-name');
    const tempEl = card.querySelector('.zone-temp');

    if (idEl && idEl.textContent !== String(zone.id)) idEl.textContent = zone.id;
    if (nameEl && nameEl.textContent !== String(zone.name)) nameEl.textContent = zone.name;

    if (!tempEl) return;
    const state = zoneTempState(zone.temp);
    const cls = 'zone-temp' + (state.cls ? ' ' + state.cls : '');
    if (tempEl.className !== cls) tempEl.className = cls;
    if (tempEl.textContent !== state.text) tempEl.textContent = state.text;
}
