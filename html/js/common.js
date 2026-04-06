document.addEventListener('DOMContentLoaded', () => {
    loadComponent('sidebar-container', 'components/sidebar.html', setActiveSidebarLink);
    loadComponent('header-container', 'components/header.html', () => {
        // After header is loaded, initialize its dynamic parts
        fetchSystemInfo();
        setInterval(fetchSystemInfo, 10000);
        updateTime();
        setInterval(updateTime, 1000);
    });
});

function loadComponent(elementId, url, callback) {
    const container = document.getElementById(elementId);
    if (!container) {
        return;
    }
    fetch(url)
        .then(response => response.text())
        .then(data => {
            container.innerHTML = data;
            if (callback) {
                callback();
            }
        })
        .catch(error => console.error(`Failed to load component ${url}:`, error));
}

function setActiveSidebarLink() {
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    const pageIdMap = {
        'index.html': 'nav-index',
        'shredding.html': 'nav-shredding',
        'history.html': 'nav-history',
        'smartctl.html': 'nav-smartctl',
        'smart_history.html': 'nav-smart-history',
        'network-share.html': 'nav-network-share',
        'partition.html': 'nav-partition',
        'speedtest.html': 'nav-speedtest',
        'iso.html': 'nav-iso',
        'settings.html': 'nav-settings'
    };
    
    // Default to index if not found
    const activeId = pageIdMap[currentPage] || 'nav-index';
    const activeLink = document.getElementById(activeId);
    if (activeLink) {
        activeLink.classList.add('active');
        // If it's a submenu item, also activate its parent
        if (activeLink.classList.contains('submenu-item')) {
            const parentId = pageIdMap['shredding.html']; // Assuming shredding is the parent
            const parentLink = document.getElementById(parentId);
            if (parentLink) {
                parentLink.classList.add('active');
            }
        }
    }
}


async function fetchSystemInfo() {
    try {
        const res = await fetch('/api/system-info');
        if (!res.ok) {
            throw new Error(`API responded with ${res.status}`);
        }
        const data = await res.json();
        const hostnameEl = document.getElementById('sys-hostname');
        const tempEl = document.getElementById('sys-temp');
        const ipEl = document.getElementById('sys-ip');

        if(hostnameEl) hostnameEl.innerText = data.hostname || 'Unknown';
        if(tempEl) tempEl.innerText = data.temperature !== 'N/A' ? data.temperature + '°C' : 'N/A';
        if(ipEl) ipEl.innerText = data.ip || 'Unknown';

    } catch (e) {
        console.error("Failed to fetch sys info", e);
        const hostnameEl = document.getElementById('sys-hostname');
        if(hostnameEl) hostnameEl.innerText = 'Error';
    }
}

function updateTime() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('en-US', { hour12: false });
    const dateString = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const timeEl = document.getElementById('sys-time');
    if (timeEl) timeEl.innerText = `${dateString}, ${timeString}`;
}
