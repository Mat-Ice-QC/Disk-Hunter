window.localesData = null;
window.currentLanguage = localStorage.getItem('dh_lang') || 'en';

function initLocalization(callback) {
    fetch('/locales.json')
        .then(res => res.json())
        .then(data => {
            window.localesData = data;
            window.applyLocalization();
            if (callback) callback();
        })
        .catch(err => {
            console.error("Failed to load locales.json", err);
            if (callback) callback();
        });
}

document.addEventListener('DOMContentLoaded', () => {
    initLocalization(() => {
        loadComponent('sidebar-container', 'components/sidebar.html', () => {
            setActiveSidebarLink();
            fetchFeatures();
            window.applyLocalization();
        });
        loadComponent('header-container', 'components/header.html', () => {
            initWebSocket();
            updateTime();
            setInterval(updateTime, 1000);
            
            initGlobalTooltips();
            initGlobalConfirm();
            initLayoutToggle();
            
            const langSelect = document.getElementById('lang-select');
            if (langSelect) {
                langSelect.value = window.currentLanguage;
                langSelect.addEventListener('change', (e) => {
                    const newLang = e.target.value;
                    window.currentLanguage = newLang;
                    localStorage.setItem('dh_lang', newLang);
                    window.applyLocalization();
                    document.dispatchEvent(new CustomEvent('dh-language-changed', { detail: newLang }));
                });
            }
            window.applyLocalization();
        });
    });

    // Potato Mode initialization
    if (localStorage.getItem('potatoMode') === 'true') {
        document.body.classList.add('potato-mode');
    }

    // Initialize custom selects globally
    initCustomSelects();
    window.selectObserver = new MutationObserver((mutations) => {
        let shouldInit = false;
        mutations.forEach(m => {
            m.addedNodes.forEach(node => {
                if (node.nodeName === 'SELECT') shouldInit = true;
                else if (node.querySelectorAll && node.querySelectorAll('select').length > 0) shouldInit = true;
            });
        });
        if (shouldInit) {
            window.selectObserver.disconnect();
            initCustomSelects();
            window.selectObserver.observe(document.body, { childList: true, subtree: true });
        }
    });
    window.selectObserver.observe(document.body, { childList: true, subtree: true });

    // Performance Optimization: Dispatch cached data instantly for snappy page loads
    // This allows the UI to populate with disk data immediately upon navigation 
    // before the WebSocket even establishes a connection.
    const cached = sessionStorage.getItem('dh_ws_cache');
    if (cached) {
        try {
            processWebSocketData(JSON.parse(cached));
        } catch (e) {
            console.error("Error loading cached WS data:", e);
        }
    }

    // Initialize footer
    const mainWrapper = document.querySelector('.main-wrapper');
    if (mainWrapper) {
        const footerContainer = document.createElement('div');
        footerContainer.id = 'footer-container';
        footerContainer.className = 'footer';
        mainWrapper.appendChild(footerContainer);
        loadComponent('footer-container', 'components/footer.html', () => {
            initFooterTools();
        });
    }

    // Initialize global debug console (works on every page)
    initDebugConsole();

    // Initialize selection toolbars on any page with drive-checkbox items
    initSelectionToolbar();
});

// --- Global Debug Console ---
function initDebugConsole() {
    const isDebug = localStorage.getItem('disk_hunter_debug') === 'true';

    // Remove any pre-existing inline debug-console so we have a single global instance
    const existing = document.getElementById('debug-console');
    if (existing) existing.remove();

    const panel = document.createElement('div');
    panel.id = 'debug-console';
    panel.className = 'debug-console-floating';
    panel.innerHTML = `
        <div class="debug-console-header">
            <span class="debug-header">API DEBUG TERMINAL</span>
            <div class="debug-console-controls">
                <button id="debug-clear-btn" title="Clear">Clear</button>
                <button id="debug-minimize-btn" title="Minimize">_</button>
            </div>
        </div>
        <div id="debug-output" class="debug-console-body">[System] Diagnostic terminal active. Awaiting execution...</div>
    `;
    document.body.appendChild(panel);

    const output = document.getElementById('debug-output');
    const clearBtn = document.getElementById('debug-clear-btn');
    const minBtn = document.getElementById('debug-minimize-btn');

    if (clearBtn) {
        clearBtn.addEventListener('click', () => { if (output) output.innerHTML = ''; });
    }
    if (minBtn) {
        minBtn.addEventListener('click', () => {
            panel.classList.toggle('minimized');
            minBtn.innerText = panel.classList.contains('minimized') ? '+' : '_';
        });
    }

    if (!isDebug) {
        panel.style.display = 'none';
        return;
    }

    panel.style.display = 'flex';

    // Global helper that any page JS can call
    window.debugLog = function(msg) {
        if (!output) return;
        const line = document.createElement('div');
        line.innerHTML = msg;
        output.appendChild(line);
        output.scrollTop = output.scrollHeight;
    };

    // Intercept all fetch calls to log API requests/responses
    const origFetch = window.fetch;
    window.fetch = async function(...args) {
        const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url ? args[0].url : String(args[0]));
        const method = (args[1] && args[1].method) || 'GET';
        const isApi = url.includes('/api/') || url.includes('/ws');
        if (isApi) {
            window.debugLog(`<span style="color:#3b82f6;">[Fetch]</span> ${method} ${url}`);
        }
        try {
            const res = await origFetch.apply(this, args);
            if (isApi) {
                window.debugLog(`<span style="color:var(--accent-green);">[Response]</span> ${url} → ${res.status} ${res.statusText}`);
            }
            return res;
        } catch (err) {
            if (isApi) {
                window.debugLog(`<span style="color:red;">[Error]</span> ${url} → ${err.message || err}`);
            }
            throw err;
        }
    };

    // Intercept WebSocket messages
    const origWS = window.WebSocket;
    window.WebSocket = function(...wsArgs) {
        const ws = new origWS(...wsArgs);
        const wsUrl = wsArgs[0];
        window.debugLog(`<span style="color:#a855f7;">[WebSocket]</span> Connecting to ${wsUrl}`);
        ws.addEventListener('open', () => window.debugLog(`<span style="color:var(--accent-green);">[WebSocket]</span> Connected`));
        ws.addEventListener('close', () => window.debugLog(`<span style="color:#f59e0b;">[WebSocket]</span> Disconnected`));
        ws.addEventListener('error', () => window.debugLog(`<span style="color:red;">[WebSocket]</span> Error`));
        return ws;
    };
    window.WebSocket.prototype = origWS.prototype;
    Object.setPrototypeOf(window.WebSocket, origWS);
}

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

function initFooterTools() {
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    fetch('/tools.json')
        .then(res => res.json())
        .then(data => {
            const toolsContainer = document.getElementById('footer-tools-container');
            if (toolsContainer && data[currentPage] && data[currentPage].length > 0) {
                const toolsList = data[currentPage].map(tool => `<a href="${tool.url}" target="_blank" rel="noopener noreferrer">${tool.name}</a>`).join(' / ');
                toolsContainer.innerHTML = `Thanks to: ${toolsList}`;
            } else if (toolsContainer) {
                toolsContainer.innerHTML = '';
            }
        })
        .catch(err => console.error("Failed to load tools.json", err));
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
        'partition_history.html': 'nav-partition-history',
        'speedtest.html': 'nav-speedtest',
        'speedtest_history.html': 'nav-speedtest-history',
        'iso.html': 'nav-iso',
        'iso_history.html': 'nav-iso-history',
        'data-management.html': 'nav-data-management',
        'settings.html': 'nav-settings'
    };
    
    // Default to index if not found
    const activeId = pageIdMap[currentPage] || 'nav-index';
    const activeLink = document.getElementById(activeId);
    if (activeLink) {
        activeLink.classList.add('active');
        // If it's a submenu item, also activate its parent
        if (activeLink.classList.contains('submenu-item')) {
            let parentId = null;
            if (currentPage === 'history.html') {
                parentId = 'nav-shredding';
            } else if (currentPage === 'smart_history.html') {
                parentId = 'nav-smart-history'; // wait, parent of smart_history is smartctl
                parentId = 'nav-smartctl';
            } else if (currentPage === 'partition_history.html') {
                parentId = 'nav-partition';
            } else if (currentPage === 'speedtest_history.html') {
                parentId = 'nav-speedtest';
            } else if (currentPage === 'iso_history.html') {
                parentId = 'nav-iso';
            }
            if (parentId) {
                const parentLink = document.getElementById(parentId);
                if (parentLink) {
                    parentLink.classList.add('active');
                }
            }
        }
    }
}


function updateSystemInfoUI(data) {
    const hostnameEl = document.getElementById('sys-hostname');
    const tempEl = document.getElementById('sys-temp');
    const ipEl = document.getElementById('sys-ip');

    if(hostnameEl) hostnameEl.innerText = data.hostname || 'Unknown';
    if(tempEl) tempEl.innerText = data.temperature !== 'N/A' ? data.temperature + '°C' : 'N/A';
    if(ipEl) ipEl.innerText = data.ip || 'Unknown';
}

function processWebSocketData(data) {
    // Dispatch global events for other components to listen to
    if (data.disks) document.dispatchEvent(new CustomEvent('ws-disks', { detail: data.disks }));
    if (data.smart_health) document.dispatchEvent(new CustomEvent('ws-smart_health', { detail: data.smart_health }));
    if (data.wipe_status) document.dispatchEvent(new CustomEvent('ws-wipe_status', { detail: data.wipe_status }));
    if (data.speedtest_status) document.dispatchEvent(new CustomEvent('ws-speedtest_status', { detail: data.speedtest_status }));
    if (data.smart_status) document.dispatchEvent(new CustomEvent('ws-smart_status', { detail: data.smart_status }));
    if (data.iso_download_status) document.dispatchEvent(new CustomEvent('ws-iso_download_status', { detail: data.iso_download_status }));
    if (data.iso_write_status) document.dispatchEvent(new CustomEvent('ws-iso_write_status', { detail: data.iso_write_status }));
}

let ws = null;
function initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
        console.log("WebSocket connected");
    };
    
    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            
            if (data.system_info) {
                updateSystemInfoUI(data.system_info);
            }
            
            // Save to cache for instant navigation, excluding system_info (time/temp)
            const cacheData = { ...data };
            delete cacheData.system_info;
            sessionStorage.setItem('dh_ws_cache', JSON.stringify(cacheData));

            processWebSocketData(data);
        } catch (e) {
            console.error("WebSocket message parse error", e);
        }
    };
    
    ws.onclose = () => {
        console.log("WebSocket disconnected. Reconnecting in 3s...");
        setTimeout(initWebSocket, 3000);
    };
    
    ws.onerror = (err) => {
        console.error("WebSocket error", err);
        ws.close();
    };
}


function updateTime() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('en-US', { hour12: false });
    const dateString = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const timeEl = document.getElementById('sys-time');
    
    if (timeEl) {
        timeEl.innerText = `${dateString}, ${timeString}`;
        
        const utcTime = now.toLocaleTimeString('en-US', { hour12: false, timeZone: 'UTC' });
        const estTime = now.toLocaleTimeString('en-US', { hour12: false, timeZone: 'America/New_York' });
        const currentTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        
        timeEl.parentElement.setAttribute('data-tooltip', `<strong>System Time</strong>UTC: ${utcTime}<br>EST: ${estTime}<br>Current: ${currentTz}`);
    }
}

// --- Global Tooltip Logic ---
let globalTooltip = null;

function initGlobalTooltips() {
    globalTooltip = document.getElementById('disk-hunter-tooltip');
    if (!globalTooltip) {
        globalTooltip = document.createElement('div');
        globalTooltip.id = 'disk-hunter-tooltip';
        globalTooltip.className = 'custom-tooltip';
        document.body.appendChild(globalTooltip);
    }

    document.body.addEventListener('mouseover', (e) => {
        const target = e.target.closest('[data-tooltip]');
        if (target) {
            const content = target.getAttribute('data-tooltip');
            if (content) {
                globalTooltip.innerHTML = content;
                globalTooltip.classList.add('visible');
            }
        }
    });

    document.body.addEventListener('mousemove', (e) => {
        if (!globalTooltip.classList.contains('visible')) return;
        
        const tooltipWidth = globalTooltip.offsetWidth;
        const tooltipHeight = globalTooltip.offsetHeight;
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;

        let x = e.clientX + 15; // Offset from cursor by 15px
        let y = e.clientY + 15;

        // Collision detection logic to prevent the tooltip from rendering outside the viewport window
        if (x + tooltipWidth > windowWidth) {
            x = e.clientX - tooltipWidth - 15; // Flip to left of cursor
        }
        if (y + tooltipHeight > windowHeight) {
            y = e.clientY - tooltipHeight - 15; // Flip to above cursor
        }

        globalTooltip.style.left = x + 'px';
        globalTooltip.style.top = y + 'px';
    });

    document.body.addEventListener('mouseout', (e) => {
        const target = e.target.closest('[data-tooltip]');
        if (target) {
            // Check if relatedTarget is still within the target to avoid flickering
            if (!target.contains(e.relatedTarget)) {
                globalTooltip.classList.remove('visible');
            }
        }
    });
}

// --- Global Confirm Modal ---
function initGlobalConfirm() {
    let confirmModal = document.getElementById('custom-confirm-modal');
    if (!confirmModal) {
        confirmModal = document.createElement('div');
        confirmModal.id = 'custom-confirm-modal';
        confirmModal.className = 'modal-overlay';
        confirmModal.innerHTML = `
            <div class="modal-box" style="max-width: 400px; margin: auto;">
                <div class="modal-header" id="custom-confirm-title" style="border-bottom:none; justify-content:center; padding-bottom: 10px; color: var(--accent-red);">Confirm Action</div>
                <div class="modal-content" id="custom-confirm-msg" style="text-align: center; color: var(--text-muted); font-size: 14px; padding-top: 0;">Are you sure?</div>
                <div class="modal-actions" style="border-top:none; justify-content:center; gap: 15px;">
                    <button class="btn-modal-cancel" id="btn-custom-confirm-no" style="display:none;">Cancel</button>
                    <button class="btn-action red" id="btn-custom-confirm-yes">Confirm</button>
                </div>
            </div>
        `;
        document.body.appendChild(confirmModal);
    }
}

window.customConfirm = function(msg, onConfirm, title = "Confirm Action") {
    const modal = document.getElementById('custom-confirm-modal');
    if (!modal) {
        if (confirm(msg)) onConfirm();
        return;
    }
    
    document.getElementById('custom-confirm-title').innerText = title;
    document.getElementById('custom-confirm-msg').innerText = msg;
    
    const btnYes = document.getElementById('btn-custom-confirm-yes');
    const btnNo = document.getElementById('btn-custom-confirm-no');
    
    btnNo.style.display = 'block';
    
    const newBtnYes = btnYes.cloneNode(true);
    const newBtnNo = btnNo.cloneNode(true);
    btnYes.parentNode.replaceChild(newBtnYes, btnYes);
    btnNo.parentNode.replaceChild(newBtnNo, btnNo);
    
    newBtnNo.addEventListener('click', () => modal.classList.remove('active'));
    newBtnYes.addEventListener('click', () => {
        modal.classList.remove('active');
        if(onConfirm) onConfirm();
    });
    
    modal.classList.add('active');
};

window.customAlert = function(msg, title = "Alert") {
    const modal = document.getElementById('custom-confirm-modal');
    if (!modal) {
        alert(msg);
        return;
    }
    
    document.getElementById('custom-confirm-title').innerText = title;
    document.getElementById('custom-confirm-msg').innerText = msg;
    
    const btnYes = document.getElementById('btn-custom-confirm-yes');
    const btnNo = document.getElementById('btn-custom-confirm-no');
    
    btnNo.style.display = 'none';
    
    const newBtnYes = btnYes.cloneNode(true);
    btnYes.parentNode.replaceChild(newBtnYes, btnYes);
    
    newBtnYes.addEventListener('click', () => modal.classList.remove('active'));
    
    modal.classList.add('active');
};

// --- Custom JS Dropdown Component ---
// This class replaces native browser <select> elements with a custom-styled DOM structure
// to achieve a cohesive, glassmorphism aesthetic across the entire application.
class CustomSelect {
    constructor(originalSelect) {
        this.originalSelect = originalSelect;
        this.wrapper = document.createElement('div');
        this.wrapper.className = 'custom-select-wrapper';
        
        this.trigger = document.createElement('div');
        this.trigger.className = 'custom-select-trigger';
        
        this.optionsContainer = document.createElement('div');
        this.optionsContainer.className = 'custom-select-options';
        
        // Insert wrapper before original select, then move original select inside
        this.originalSelect.parentNode.insertBefore(this.wrapper, this.originalSelect);
        this.wrapper.appendChild(this.originalSelect);
        this.wrapper.appendChild(this.trigger);
        this.wrapper.appendChild(this.optionsContainer);
        
        this.renderOptions();
        
        this.trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggle();
        });
        
        // Close on outside click
        document.addEventListener('click', (e) => {
            if (!this.wrapper.contains(e.target)) {
                this.close();
            }
        });

        // Watch for changes to the original select's options
        this.observer = new MutationObserver(() => this.renderOptions());
        this.observer.observe(this.originalSelect, { childList: true, subtree: true, attributes: true, attributeFilter: ['selected'] });

        this.originalSelect.addEventListener('change', () => this.updateTriggerText());
    }

    renderOptions() {
        this.optionsContainer.innerHTML = '';
        const options = Array.from(this.originalSelect.options);
        
        if (options.length === 0) {
            this.trigger.innerHTML = `<span>No options</span><div class="custom-select-arrow"></div>`;
            return;
        }

        options.forEach(option => {
            const optDiv = document.createElement('div');
            optDiv.className = 'custom-select-option';
            if (option.selected) optDiv.classList.add('selected');
            optDiv.innerText = option.innerText;
            
            optDiv.addEventListener('click', (e) => {
                e.stopPropagation();
                this.originalSelect.value = option.value;
                this.originalSelect.dispatchEvent(new Event('change'));
                this.close();
            });
            this.optionsContainer.appendChild(optDiv);
        });

        this.updateTriggerText();
    }

    updateTriggerText() {
        const selectedOption = this.originalSelect.options[this.originalSelect.selectedIndex];
        const text = selectedOption ? selectedOption.innerText : 'Select...';
        this.trigger.innerHTML = `<span>${text}</span><div class="custom-select-arrow"></div>`;
        
        // Update selected class in custom options
        const customOptions = this.optionsContainer.querySelectorAll('.custom-select-option');
        customOptions.forEach((opt, index) => {
            if (index === this.originalSelect.selectedIndex) {
                opt.classList.add('selected');
            } else {
                opt.classList.remove('selected');
            }
        });
    }

    toggle() {
        // Close all other open custom selects
        document.querySelectorAll('.custom-select-wrapper.open').forEach(wrapper => {
            if (wrapper !== this.wrapper) wrapper.classList.remove('open');
        });
        this.wrapper.classList.toggle('open');
    }

    close() {
        this.wrapper.classList.remove('open');
    }
}

function initCustomSelects() {
    document.querySelectorAll('select').forEach(select => {
        // Prevent double initialization
        if (!select.parentElement || !select.parentElement.classList.contains('custom-select-wrapper')) {
            new CustomSelect(select);
        }
    });
}

// --- Centralized API Services ---
class DiskService {
    constructor() {
        this.cache = null;
        this.lastFetch = 0;
        this.fetchPromise = null;
    }

    async getDisks(force = false) {
        const now = Date.now();
        if (!force && this.cache && (now - this.lastFetch < 10000)) {
            return this.cache;
        }

        if (this.fetchPromise) {
            return this.fetchPromise;
        }

        this.fetchPromise = fetch('/api/disks')
            .then(res => res.json())
            .then(data => {
                this.cache = data;
                this.lastFetch = Date.now();
                this.fetchPromise = null;
                return data;
            })
            .catch(err => {
                this.fetchPromise = null;
                throw err;
            });

        return this.fetchPromise;
    }
}

class SpeedtestService {
    async start(drives, testType, size, timezone) {
        const isDebug = localStorage.getItem('disk_hunter_debug') === 'true';
        const debugConsole = document.getElementById('debug-console');
        const debugOutput = document.getElementById('debug-output');
        if (isDebug && debugConsole && debugOutput) {
            debugConsole.style.display = 'flex';
            debugOutput.innerHTML = `<span style="color: #3b82f6;">[System]</span> Initiate clicked. Sending request...<br>`;
        }

        const payload = { 
            drives: drives, 
            test_type: testType, 
            size: size,
            timezone: timezone
        };
        if (isDebug && debugOutput) {
            debugOutput.innerHTML += `<span style="color: #3b82f6;">[Payload]</span> ${JSON.stringify(payload)}<br>`;
        }

        try {
            const res = await fetch('/api/speedtest/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await res.json();

            if (isDebug && debugOutput && result.debug) {
                debugOutput.innerHTML += `<span style="color: #a855f7;">[Backend Logs]</span><br>${result.debug.join('<br>')}<br>------------------------<br>`;
            }

            if (!res.ok) {
                if (isDebug && debugOutput) debugOutput.innerHTML += `<span style="color: red;">[Error]</span> ${result.message || 'Failed to start speedtest'}<br>`;
                throw new Error('Failed to start speedtest');
            }

            if (result.status !== 'success') {
                if (isDebug && debugOutput) debugOutput.innerHTML += `<span style="color: red;">[Error]</span> ${result.message}<br>`;
            } else {
                if (isDebug && debugOutput) debugOutput.innerHTML += `<span style="color: var(--accent-green);">[Success]</span> ${result.message}<br>`;
            }

            return result;
        } catch (err) {
            if (isDebug && debugOutput) debugOutput.innerHTML += `<span style="color: red;">[Critical Error]</span> ${err.message || err}<br>`;
            throw err;
        }
    }
}

class PartitionService {
    async action(drive, actionName, params) {
        const isDebug = localStorage.getItem('disk_hunter_debug') === 'true';
        const debugConsole = document.getElementById('debug-console');
        const debugOutput = document.getElementById('debug-output');
        if (isDebug && debugConsole && debugOutput) {
            debugConsole.style.display = 'flex';
            debugOutput.innerHTML = `<span style="color: #3b82f6;">[System]</span> Partition action clicked: ${actionName}. Sending request...<br>`;
        }

        const payload = { drive: drive, action: actionName, params: params };
        if (isDebug && debugOutput) {
            debugOutput.innerHTML += `<span style="color: #3b82f6;">[Payload]</span> ${JSON.stringify(payload)}<br>`;
        }

        try {
            const res = await fetch('/api/partitions/action', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(payload)
            });
            const result = await res.json();

            if (isDebug && debugOutput && result.debug) {
                debugOutput.innerHTML += `<span style="color: #a855f7;">[Backend Logs]</span><br>${result.debug.join('<br>')}<br>------------------------<br>`;
            }

            if (!res.ok) {
                if (isDebug && debugOutput) debugOutput.innerHTML += `<span style="color: red;">[Error]</span> ${result.message || 'Failed to execute partition action'}<br>`;
                throw new Error('Failed to execute partition action');
            }

            if (result.status !== 'success') {
                if (isDebug && debugOutput) debugOutput.innerHTML += `<span style="color: red;">[Error]</span> ${result.message}<br>`;
            } else {
                if (isDebug && debugOutput) debugOutput.innerHTML += `<span style="color: var(--accent-green);">[Success]</span> ${result.message}<br>`;
            }

            return result;
        } catch (err) {
            if (isDebug && debugOutput) debugOutput.innerHTML += `<span style="color: red;">[Critical Error]</span> ${err.message || err}<br>`;
            throw err;
        }
    }
}

window.diskService = new DiskService();
window.speedtestService = new SpeedtestService();
window.partitionService = new PartitionService();

function fetchFeatures() {
    fetch('/api/system/features')
        .then(res => res.json())
        .then(data => {
            if (data.ENABLE_SHREDDER === false) {
                document.getElementById('nav-shredding')?.setAttribute('style', 'display: none !important');
                document.getElementById('nav-history')?.setAttribute('style', 'display: none !important');
            }
            if (data.ENABLE_SPEEDTEST === false) {
                document.getElementById('nav-speedtest')?.setAttribute('style', 'display: none !important');
                document.getElementById('nav-speedtest-history')?.setAttribute('style', 'display: none !important');
            }
            if (data.ENABLE_ISOWRITER === false) {
                document.getElementById('nav-iso')?.setAttribute('style', 'display: none !important');
                document.getElementById('nav-iso-history')?.setAttribute('style', 'display: none !important');
            }
            if (data.ENABLE_SMARTCTL === false) {
                document.getElementById('nav-smartctl')?.setAttribute('style', 'display: none !important');
                document.getElementById('nav-smart-history')?.setAttribute('style', 'display: none !important');
            }
            if (data.ENABLE_DATA_MANAGEMENT === false) {
                document.getElementById('nav-data-management')?.setAttribute('style', 'display: none !important');
            }
            if (data.ENABLE_NETWORK_SHARE === false) {
                document.getElementById('nav-network-share')?.setAttribute('style', 'display: none !important');
            }
            if (data.ENABLE_DELETE_HISTORY === false) {
                // Hide clear history buttons
                const clearHistoryBtns = document.querySelectorAll('#btn-clear-history');
                clearHistoryBtns.forEach(btn => btn.setAttribute('style', 'display: none !important'));
                
                // Hide specific clear buttons in data management
                const dataMgmtClearBtns = [
                    'btn-clear-shred-logs', 'btn-clear-smart-logs', 'btn-clear-speedtest-logs',
                    'btn-clear-iso-logs', 'btn-clear-all-data-logs', 'btn-clear-all-pdfs',
                    'btn-clear-all-isos', 'btn-clear-all-images'
                ];
                dataMgmtClearBtns.forEach(id => {
                    document.getElementById(id)?.setAttribute('style', 'display: none !important');
                });
            }
            
            // Redirect if current page is disabled
            const currentPage = window.location.pathname.split('/').pop() || 'index.html';
            const disabledPagesMap = {
                'shredding.html': data.ENABLE_SHREDDER,
                'history.html': data.ENABLE_SHREDDER,
                'speedtest.html': data.ENABLE_SPEEDTEST,
                'speedtest_history.html': data.ENABLE_SPEEDTEST,
                'iso.html': data.ENABLE_ISOWRITER,
                'iso_history.html': data.ENABLE_ISOWRITER,
                'smartctl.html': data.ENABLE_SMARTCTL,
                'smart_history.html': data.ENABLE_SMARTCTL,
                'data-management.html': data.ENABLE_DATA_MANAGEMENT,
                'network-share.html': data.ENABLE_NETWORK_SHARE
            };
            if (disabledPagesMap[currentPage] === false) {
                window.location.href = 'index.html';
            }
        })
        .catch(err => console.error("Failed to fetch features:", err));
}

window.applyLocalization = function() {
    if (!window.localesData || !window.localesData[window.currentLanguage]) return;
    const langData = window.localesData[window.currentLanguage];
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (langData[key]) {
            if (el.tagName === 'INPUT' && el.type === 'text') {
                el.placeholder = langData[key];
            } else {
                el.innerText = langData[key];
            }
        }
    });
};

window.translate = function(key, defaultVal) {
    if (window.localesData && window.localesData[window.currentLanguage] && window.localesData[window.currentLanguage][key]) {
        return window.localesData[window.currentLanguage][key];
    }
    return defaultVal;
};

function initLayoutToggle() {
    const btn = document.getElementById('btn-layout-toggle');
    if (!btn) return;

    const selectors = ['#disk-list-container', '#shred-list-container', '#drive-list-container', '#drive-selector'];
    const hasDriveList = selectors.some(sel => document.querySelector(sel));
    if (!hasDriveList) {
        btn.style.display = 'none';
        return;
    }

    window.applyGlobalLayout();

    btn.addEventListener('click', () => {
        const isIndex = window.location.pathname.endsWith('index.html') || window.location.pathname.endsWith('/');
        const defaultLayout = isIndex ? 'squares' : 'list';
        let currentLayout = localStorage.getItem('drive_view_layout') || defaultLayout;
        const nextLayout = currentLayout === 'list' ? 'squares' : 'list';
        localStorage.setItem('drive_view_layout', nextLayout);
        window.applyGlobalLayout();
        document.dispatchEvent(new CustomEvent('dh-layout-changed', { detail: nextLayout }));
    });
}

window.applyGlobalLayout = function() {
    const isIndex = window.location.pathname.endsWith('index.html') || window.location.pathname.endsWith('/');
    const defaultLayout = isIndex ? 'squares' : 'list';
    let layout = localStorage.getItem('drive_view_layout') || defaultLayout;
    
    const toggleText = document.getElementById('layout-toggle-text');
    if (toggleText) {
        toggleText.innerText = layout === 'list' ? 'Squares' : 'List';
    }

    const selectors = ['#disk-list-container', '#shred-list-container', '#drive-list-container', '#drive-selector'];
    selectors.forEach(sel => {
        const el = document.querySelector(sel);
        if (el) {
            if (layout === 'list') {
                el.classList.remove('squares-view');
                el.classList.add('list-view');
            } else {
                el.classList.remove('list-view');
                el.classList.add('squares-view');
            }
        }
    });
};

// --- Global Selection Toolbar (Select All / Deselect All / Filter) ---
// Auto-injects a toolbar above any container that has .drive-checkbox items.
// Works on shredding, smartctl, and speedtest pages without per-page changes.
function initSelectionToolbar() {
    const containerIds = ['shred-list-container', 'drive-list-container', 'drive-selector'];
    containerIds.forEach(id => {
        const container = document.getElementById(id);
        if (!container) return;

        // Insert toolbar before the container
        const toolbar = document.createElement('div');
        toolbar.className = 'selection-toolbar';
        toolbar.id = `toolbar-${id}`;
        toolbar.innerHTML = `
            <button class="sel-btn sel-all" data-target="${id}">Select All</button>
            <button class="sel-btn sel-none" data-target="${id}">Deselect All</button>
            <div class="sel-filter-wrapper">
                <input type="text" class="sel-filter" data-target="${id}" placeholder="Filter by model/serial/path (e.g. 860)..." />
            </div>
            <span class="sel-count" id="count-${id}">0 selected</span>
        `;

        container.parentNode.insertBefore(toolbar, container);

        // Select All: check all non-disabled, non-filtered checkboxes
        toolbar.querySelector('.sel-all').addEventListener('click', () => {
            const cards = container.querySelectorAll('.drive-card');
            cards.forEach(card => {
                if (card.dataset.filteredOut === 'true') return;
                const cb = card.querySelector('.drive-checkbox');
                if (cb && !cb.disabled && !cb.checked) {
                    cb.checked = true;
                    cb.dispatchEvent(new Event('change', { bubbles: true }));
                }
            });
            updateSelectionCount(id);
        });

        // Deselect All: uncheck all checkboxes
        toolbar.querySelector('.sel-none').addEventListener('click', () => {
            const cards = container.querySelectorAll('.drive-card');
            cards.forEach(card => {
                const cb = card.querySelector('.drive-checkbox');
                if (cb && cb.checked) {
                    cb.checked = false;
                    cb.dispatchEvent(new Event('change', { bubbles: true }));
                }
            });
            updateSelectionCount(id);
        });

        // Filter: hide/show cards based on text match
        const filterInput = toolbar.querySelector('.sel-filter');
        filterInput.addEventListener('input', () => {
            const query = filterInput.value.trim().toLowerCase();
            const cards = container.querySelectorAll('.drive-card');
            cards.forEach(card => {
                const text = (card.innerText || '').toLowerCase();
                if (query === '' || text.includes(query)) {
                    card.style.display = '';
                    card.dataset.filteredOut = 'false';
                } else {
                    card.style.display = 'none';
                    card.dataset.filteredOut = 'true';
                }
            });
        });
    });

    // Update counts periodically (catches programmatic selection changes)
    document.addEventListener('change', (e) => {
        if (e.target && e.target.classList && e.target.classList.contains('drive-checkbox')) {
            const container = e.target.closest('.drive-list-grid');
            if (container) updateSelectionCount(container.id);
        }
    });
}

function updateSelectionCount(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const checked = container.querySelectorAll('.drive-checkbox:checked');
    const countEl = document.getElementById(`count-${containerId}`);
    if (countEl) countEl.innerText = `${checked.length} selected`;
}
