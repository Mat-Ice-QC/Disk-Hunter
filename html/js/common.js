// html/js/common.js

async function loadComponents() {
    try {
        const sidebarRes = await fetch('components/sidebar.html');
        document.getElementById('sidebar-container').innerHTML = await sidebarRes.text();

        const headerRes = await fetch('components/header.html');
        document.getElementById('header-container').innerHTML = await headerRes.text();

        const currentPath = window.location.pathname.split('/').pop() || 'index.html';
        const menuItems = document.querySelectorAll('.menu-item');
        menuItems.forEach(item => {
            if (item.getAttribute('href') === currentPath) {
                item.classList.add('active');
            }
        });

        // Start local clock
        updateMontrealTime();
        setInterval(updateMontrealTime, 1000);

        // Fetch real server hardware info right away, then every 5 seconds
        fetchSystemInfo();
        setInterval(fetchSystemInfo, 5000);

    } catch (error) {
        console.error("Error loading components:", error);
    }
}

function updateMontrealTime() {
    const timeElement = document.getElementById('mtl-time');
    if (!timeElement) return;

    const options = { 
        timeZone: 'America/Montreal', 
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false
    };
    timeElement.innerText = new Intl.DateTimeFormat('en-CA', options).format(new Date());
}

// Fetch real server IP, Temperature, and Hostname
async function fetchSystemInfo() {
    try {
        const response = await fetch('/api/system-info');
        const data = await response.json();
        
        const hostEl = document.getElementById('sys-host');
        const tempEl = document.getElementById('sys-temp');
        const ipEl = document.getElementById('sys-ip');

        if (hostEl) hostEl.innerText = data.hostname || "Unknown";
        if (tempEl) tempEl.innerText = data.temperature !== "N/A" ? `${data.temperature}°C` : "N/A";
        if (ipEl) ipEl.innerText = data.ip;

    } catch (error) {
        console.error("Failed to fetch system info from backend", error);
    }
}

document.addEventListener('DOMContentLoaded', loadComponents);