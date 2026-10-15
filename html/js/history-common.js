// html/js/history-common.js
// Shared helpers for every history view: standardised table cells
// (Timestamp | User IP | Drive / Target | Status | Event / Details),
// status badges and one shared log detail modal (command + output/logs).

window.HistoryCommon = (function () {

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatTimestamp(timestamp) {
        if (!timestamp) return 'N/A';
        const date = new Date(timestamp);
        if (isNaN(date.getTime())) return String(timestamp);
        return date.toLocaleString();
    }

    function statusClass(status) {
        const normalized = String(status == null ? '' : status).trim().toLowerCase();
        if (['completed', 'success', 'succeeded', 'finished', 'passed'].includes(normalized)) return 'badge-success';
        if (['failed', 'error', 'aborted'].includes(normalized)) return 'badge-danger';
        if (['started', 'running', 'in progress', 'pending', 'queued'].includes(normalized)) return 'badge-info';
        if (['stopped', 'cancelled', 'canceled', 'warning', 'partial'].includes(normalized)) return 'badge-warning';
        return 'badge-muted';
    }

    function statusBadge(status) {
        const text = String(status == null || status === '' ? 'N/A' : status).trim();
        return '<span class="badge ' + statusClass(status) + '">' + escapeHtml(text.toUpperCase()) + '</span>';
    }

    function getUserIp(entry) {
        return entry.username || entry.user_ip || '-';
    }

    // Old entries may lack the drive field; fall back to parsing the
    // device path out of the event text, then to '-'.
    function getDrive(entry) {
        if (entry.drive) return entry.drive;
        const match = String(entry.event || '').match(/\/dev\/[a-z0-9]+(?:p[0-9]+)?/i);
        return match ? match[0] : '-';
    }

    function eventColor(eventText) {
        let color = 'var(--text-main)';
        if (eventText.includes('started')) color = 'var(--primary)';
        if (eventText.includes('successfully')) color = 'var(--accent-green)';
        if (eventText.includes('stopped')) color = 'var(--accent-amber)';
        if (eventText.includes('failed')) color = 'var(--accent-red)';
        return color;
    }

    // Identical cell layout for every module. Module specifics are passed
    // via options.details (plain strings, escaped here) and options.extraHtml
    // (trusted module-built HTML such as the wipe report link).
    function renderLogHeader(entry, options) {
        options = options || {};
        const eventText = options.event || entry.event || '-';
        const details = Array.isArray(options.details) ? options.details.filter(Boolean) : [];
        const extraHtml = options.extraHtml || '';

        const driveHtml = '<div class="drive-path">' + escapeHtml(getDrive(entry)) + '</div>' +
            (entry.serial ? '<div class="drive-serial">S/N: ' + escapeHtml(entry.serial) + '</div>' : '');

        const detailsHtml = details.length
            ? '<div class="log-secondary">' +
                details.map(d => '<span>' + escapeHtml(d) + '</span>').join('') +
              '</div>'
            : '';

        return '' +
            '<td class="col-timestamp">' + escapeHtml(formatTimestamp(entry.timestamp)) + '</td>' +
            '<td class="col-user">' + escapeHtml(getUserIp(entry)) + '</td>' +
            '<td class="col-drive">' + driveHtml + '</td>' +
            '<td class="col-status">' + statusBadge(entry.status) + '</td>' +
            '<td class="col-event" style="color: ' + eventColor(eventText) + '; font-weight: bold;">' +
                escapeHtml(eventText) + detailsHtml + extraHtml +
            '</td>';
    }

    // --- Shared detail modal ---

    let modal = null;
    let commandText = '';
    let logRequestToken = 0;

    function ensureModal() {
        if (modal) return modal;

        modal = document.createElement('div');
        modal.id = 'history-detail-modal';
        modal.className = 'modal-overlay history-detail-modal';
        modal.innerHTML = '' +
            '<div class="modal-box history-detail-box">' +
            '    <div class="modal-header" id="history-detail-title">Log Details</div>' +
            '    <div class="modal-content history-detail-content">' +
            '        <div class="detail-summary" id="history-detail-summary"></div>' +
            '        <div class="detail-section">' +
            '            <div class="detail-section-label"><span>Command executed</span>' +
            '                <button type="button" class="btn-action btn-copy-command" id="history-detail-copy">Copy</button>' +
            '            </div>' +
            '            <pre class="detail-command" id="history-detail-command"></pre>' +
            '        </div>' +
            '        <div class="detail-section" id="history-detail-output-section">' +
            '            <div class="detail-section-label">Output / Logs</div>' +
            '            <pre class="detail-output" id="history-detail-output"></pre>' +
            '        </div>' +
            '    </div>' +
            '    <div class="modal-actions">' +
            '        <button type="button" class="btn-modal-cancel" id="history-detail-close">Close</button>' +
            '    </div>' +
            '</div>';
        document.body.appendChild(modal);

        modal.querySelector('#history-detail-close').addEventListener('click', closeLogDetail);
        modal.querySelector('#history-detail-copy').addEventListener('click', copyCommand);

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeLogDetail();
        });

        return modal;
    }

    function closeLogDetail() {
        if (modal && modal.classList.contains('active')) {
            modal.classList.remove('active');
        }
    }

    function copyCommand() {
        if (!commandText) return;
        const btn = modal.querySelector('#history-detail-copy');

        const done = () => {
            btn.textContent = 'Copied';
            setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
        };

        const fallback = () => {
            const textarea = document.createElement('textarea');
            textarea.value = commandText;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            try {
                document.execCommand('copy');
                done();
            } catch (error) {
                console.error('Copy to clipboard failed:', error);
            }
            document.body.removeChild(textarea);
        };

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(commandText).then(done, fallback);
        } else {
            fallback();
        }
    }

    function resolveLogUrl(entry, options) {
        if (!options.logUrl) return null;
        const url = typeof options.logUrl === 'function' ? options.logUrl(entry) : options.logUrl;
        return url || null;
    }

    function showLogDetail(entry, options) {
        options = options || {};
        const m = ensureModal();

        m.querySelector('#history-detail-title').textContent = options.title || 'Log Details';

        // Standard header fields in the fixed column order
        const eventText = options.event || entry.event || '-';
        const details = Array.isArray(options.details) ? options.details.filter(Boolean) : [];

        const summary = m.querySelector('#history-detail-summary');
        summary.innerHTML = '' +
            '<div class="detail-row"><span class="detail-label">Timestamp</span><span class="detail-value">' + escapeHtml(formatTimestamp(entry.timestamp)) + '</span></div>' +
            '<div class="detail-row"><span class="detail-label">User IP</span><span class="detail-value">' + escapeHtml(getUserIp(entry)) + '</span></div>' +
            '<div class="detail-row"><span class="detail-label">Drive / Target</span><span class="detail-value">' + escapeHtml(getDrive(entry)) +
                (entry.serial ? ' <span class="detail-serial">S/N: ' + escapeHtml(entry.serial) + '</span>' : '') +
            '</span></div>' +
            '<div class="detail-row"><span class="detail-label">Status</span><span class="detail-value">' + statusBadge(entry.status) + '</span></div>' +
            '<div class="detail-row"><span class="detail-label">Event</span><span class="detail-value">' + escapeHtml(eventText) + '</span></div>' +
            (details.length
                ? '<div class="detail-row"><span class="detail-label">Details</span><span class="detail-value">' +
                    details.map(d => escapeHtml(d)).join('<br>') + '</span></div>'
                : '');

        // Command executed block
        const commandEl = m.querySelector('#history-detail-command');
        const copyBtn = m.querySelector('#history-detail-copy');
        if (entry.command) {
            commandText = String(entry.command);
            commandEl.textContent = commandText;
            copyBtn.style.display = '';
        } else {
            commandText = '';
            commandEl.textContent = 'Command not recorded (entry created before this feature)';
            copyBtn.style.display = 'none';
        }

        // Output / Logs block: container log endpoint, inline output, or nothing
        const outputSection = m.querySelector('#history-detail-output-section');
        const outputEl = m.querySelector('#history-detail-output');
        const logUrl = resolveLogUrl(entry, options);

        if (logUrl) {
            outputSection.style.display = '';
            outputEl.textContent = 'Loading logs...';
            const openToken = ++logRequestToken;
            fetch(logUrl)
                .then(response => response.json())
                .then(data => {
                    if (openToken !== logRequestToken) return;
                    if (data.status === 'success') {
                        outputEl.textContent = data.logs || 'No logs available.';
                    } else {
                        outputEl.textContent = 'Error: ' + (data.message || 'Unknown error');
                    }
                })
                .catch(error => {
                    console.error('Failed to fetch logs:', error);
                    outputEl.textContent = 'Failed to load logs due to a network error.';
                });
        } else if (entry.output) {
            outputSection.style.display = '';
            outputEl.textContent = String(entry.output);
        } else {
            outputSection.style.display = 'none';
            outputEl.textContent = '';
        }

        m.classList.add('active');
    }

    function makeRowClickable(tr, entry, options) {
        tr.classList.add('log-row');
        tr.title = 'Click to view details';
        tr.setAttribute('tabindex', '0');
        tr.addEventListener('click', () => showLogDetail(entry, options));
        tr.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                showLogDetail(entry, options);
            }
        });
    }

    return {
        escapeHtml: escapeHtml,
        formatTimestamp: formatTimestamp,
        statusBadge: statusBadge,
        getDrive: getDrive,
        renderLogHeader: renderLogHeader,
        makeRowClickable: makeRowClickable,
        showLogDetail: showLogDetail,
        closeLogDetail: closeLogDetail
    };
})();
