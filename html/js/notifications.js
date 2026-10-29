// Notifications page: renders the shared notification list and live-updates
// via the 'dh-notification' events emitted by common.js.
function severities() {
    return {
        success: { icon: '✔' },
        warning: { icon: '⚠' },
        error: { icon: '✖' },
        info: { icon: 'ℹ' }
    };
}

function renderNotifications() {
    if (typeof getNotifications !== 'function') return;
    const list = getNotifications();
    const container = document.getElementById('notifications-list');
    if (!container) return;

    if (list.length === 0) {
        container.innerHTML = `
            <div class="notifications-empty" id="notifications-empty">
                No notifications yet. Events such as wipe completions, SMART test
                finishes, speed tests, ISO operations and drive warnings will
                appear here.
            </div>`;
        return;
    }

    const icons = severities();
    const lastRead = parseInt(localStorage.getItem('dh_notifications_read_ts') || '0', 10);
    const html = list.map(item => {
        const sev = icons[item.severity] ? item.severity : 'info';
        const timeStr = new Date(item.ts).toLocaleString();
        const unread = item.ts > lastRead ? ' unread' : '';
        return `
        <div class="notif-item severity-${sev}${unread}" data-id="${item.id}">
            <span class="notif-severity-icon">${icons[sev].icon}</span>
            <div class="notif-body">
                <div class="notif-meta">
                    <span class="notif-type">${item.type.replace('_status', '').replace('_test', ' test')}</span>
                    <span class="notif-time">${timeStr}</span>
                </div>
                <div class="notif-message"></div>
            </div>
        </div>`;
    }).join('');
    container.innerHTML = html;

    // Use textContent to avoid injecting markup from messages
    const items = container.querySelectorAll('.notif-item');
    items.forEach((el) => {
        const found = list.find(n => n.id === el.dataset.id);
        if (found) el.querySelector('.notif-message').textContent = found.message;
    });
}

function reconcileReadState() {
    if (typeof markAllNotificationsRead !== 'function') return;
    // Viewing the page marks everything currently visible as read.
    const items = document.querySelectorAll('.notif-item.unread');
    if (items.length > 0) {
        items.forEach(el => el.classList.add('consumed'));
        markAllNotificationsRead();
    }
}

document.addEventListener('dh-notification', () => {
    renderNotifications();
    // Give the freshly-landed entry a moment as unread, then mark the
    // visible page as read.
    setTimeout(reconcileReadState, 2500);
});

document.addEventListener('DOMContentLoaded', () => {
    // Wait for locales/sidebar callbacks the same way other pages do; the
    // notification data lives in localStorage so no extra fetch is needed.
    renderNotifications();
    reconcileReadState();

    const markBtn = document.getElementById('btn-notifications-mark-read');
    if (markBtn) {
        markBtn.addEventListener('click', () => {
            if (typeof markAllNotificationsRead === 'function') markAllNotificationsRead();
            document.querySelectorAll('.notif-item.unread').forEach(el => el.classList.remove('unread'));
        });
    }
});