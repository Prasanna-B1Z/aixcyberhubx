// ============================================================
//  timezone.js — AI CyberHub
//  Real-time international timezone selector, live clock,
//  and event time conversion utilities.
// ============================================================

// ─── Timezone List ───────────────────────────────────────────
const TIMEZONES = [
    { label: '🇮🇳 India (IST)', tz: 'Asia/Kolkata' },
    { label: '🇺🇸 New York (ET)', tz: 'America/New_York' },
    { label: '🇺🇸 Los Angeles (PT)', tz: 'America/Los_Angeles' },
    { label: '🇬🇧 London (GMT/BST)', tz: 'Europe/London' },
    { label: '🇩🇪 Berlin (CET)', tz: 'Europe/Berlin' },
    { label: '🇸🇬 Singapore (SGT)', tz: 'Asia/Singapore' },
    { label: '🇯🇵 Tokyo (JST)', tz: 'Asia/Tokyo' },
    { label: '🇦🇺 Sydney (AEST)', tz: 'Australia/Sydney' },
    { label: '🇧🇷 São Paulo (BRT)', tz: 'America/Sao_Paulo' },
    { label: '🇦🇪 Dubai (GST)', tz: 'Asia/Dubai' },
    { label: '🇰🇷 Seoul (KST)', tz: 'Asia/Seoul' },
    { label: '🇨🇦 Toronto (ET)', tz: 'America/Toronto' },
    { label: '🇿🇦 Johannesburg (SAST)', tz: 'Africa/Johannesburg' },
    { label: '🇳🇿 Auckland (NZST)', tz: 'Pacific/Auckland' },
    { label: '🇲🇽 Mexico City (CST)', tz: 'America/Mexico_City' },
    { label: '🇨🇳 Beijing (CST)', tz: 'Asia/Shanghai' },
    { label: '🌐 UTC', tz: 'UTC' },
];

// ─── State ───────────────────────────────────────────────────
let _userTimezone = null;  // The IANA timezone string chosen or auto-detected
let _clockInterval = null;

// ─── Auto-detect or restore saved ────────────────────────────
function initTimezone() {
    const saved = localStorage.getItem('cyberhub_tz');
    if (saved && TIMEZONES.find(t => t.tz === saved)) {
        _userTimezone = saved;
    } else {
        // Auto-detect from browser
        try {
            _userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        } catch (e) {
            _userTimezone = 'UTC';
        }
    }

    renderTzWidget();
    startLiveClock();
    console.log('[Timezone] Active timezone:', _userTimezone);
}

// ─── Render the timezone widget in the navbar ─────────────────
function renderTzWidget() {
    const slot = document.getElementById('tzWidgetSlot');
    if (!slot) return;

    const label = getTzLabel(_userTimezone);
    const nowStr = formatInTz(new Date(), _userTimezone, { hour: '2-digit', minute: '2-digit', hour12: false });

    slot.innerHTML = `
        <div class="tz-widget" onclick="toggleTzDropdown(event)">
            <i class="fas fa-globe"></i>
            <span class="tz-time" id="tzLiveClock">${nowStr}</span>
            <span class="tz-label-short">${label}</span>
            <i class="fas fa-chevron-down tz-chevron"></i>
        </div>
        <div class="tz-dropdown" id="tzDropdown">
            <div class="tz-dropdown-header">
                <i class="fas fa-map-marker-alt"></i> Select Your Timezone
            </div>
            <input class="tz-search" id="tzSearch" type="text" placeholder="Search timezone..." oninput="filterTzList(this.value)">
            <ul class="tz-list" id="tzList">
                ${renderTzOptions()}
            </ul>
        </div>
    `;
}

function renderTzOptions(filter = '') {
    return TIMEZONES
        .filter(t => !filter || t.label.toLowerCase().includes(filter.toLowerCase()))
        .map(t => `
            <li class="tz-option ${t.tz === _userTimezone ? 'active' : ''}" onclick="selectTimezone('${t.tz}')">
                <span>${t.label}</span>
                <span class="tz-option-time">${formatInTz(new Date(), t.tz, { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
            </li>
        `).join('');
}

function filterTzList(val) {
    const list = document.getElementById('tzList');
    if (list) list.innerHTML = renderTzOptions(val);
}

function toggleTzDropdown(e) {
    e.stopPropagation();
    const dd = document.getElementById('tzDropdown');
    if (!dd) return;
    const isOpen = dd.classList.contains('open');
    // Close all other dropdowns
    document.querySelectorAll('.tz-dropdown.open').forEach(el => el.classList.remove('open'));
    if (!isOpen) {
        dd.classList.add('open');
        setTimeout(() => document.getElementById('tzSearch')?.focus(), 50);
    }
}

// Close dropdown when clicking outside
document.addEventListener('click', () => {
    document.querySelectorAll('.tz-dropdown.open').forEach(el => el.classList.remove('open'));
});

// ─── Select Timezone ─────────────────────────────────────────
function selectTimezone(tz) {
    _userTimezone = tz;
    localStorage.setItem('cyberhub_tz', tz);

    // Close dropdown
    document.querySelectorAll('.tz-dropdown.open').forEach(el => el.classList.remove('open'));

    // Re-render widget and re-draw events
    renderTzWidget();
    startLiveClock();

    // Refresh event cards to show new timezone
    if (typeof renderEvents === 'function') renderEvents();

    const label = getTzLabel(tz);
    if (typeof showToast === 'function') showToast(`🌍 Timezone set to ${label}`, 'info');
}

// ─── Live Clock ──────────────────────────────────────────────
function startLiveClock() {
    if (_clockInterval) clearInterval(_clockInterval);
    _clockInterval = setInterval(() => {
        const el = document.getElementById('tzLiveClock');
        if (el) {
            el.textContent = formatInTz(new Date(), _userTimezone, {
                hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
            });
        }
    }, 1000);
}

// ─── Utility: Format a date in a specific timezone ────────────
function formatInTz(date, tz, opts = {}) {
    try {
        return new Intl.DateTimeFormat('en-GB', { timeZone: tz, ...opts }).format(date);
    } catch (e) {
        return new Intl.DateTimeFormat('en-GB', opts).format(date);
    }
}

// ─── Utility: Full date+time label for event display ─────────
function formatEventTimeInTz(isoString, tz) {
    if (!isoString) return 'TBD';
    const date = new Date(isoString);
    const tzObj = TIMEZONES.find(t => t.tz === tz);
    const tzShort = tzObj?.label?.match(/\(([^)]+)\)/)?.[1] || tz;
    try {
        const formatted = new Intl.DateTimeFormat('en-GB', {
            timeZone: tz,
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit', hour12: false
        }).format(date);
        return `${formatted} (${tzShort})`;
    } catch (e) {
        return date.toLocaleString();
    }
}

// ─── Utility: Get short label from tz string ─────────────────
function getTzLabel(tz) {
    const found = TIMEZONES.find(t => t.tz === tz);
    if (found) return found.label.match(/\(([^)]+)\)/)?.[1] || tz;
    // Extract short label from IANA tz for unrecognised zones
    return tz.split('/').pop().replace('_', ' ');
}

// ─── Utility: ms until a given ISO datetime ──────────────────
function msUntil(isoString) {
    return new Date(isoString).getTime() - Date.now();
}

// ─── Utility: Human countdown string ─────────────────────────
function countdownLabel(isoString) {
    const diff = msUntil(isoString);
    if (diff <= 0) return null;
    const s = Math.floor(diff / 1000) % 60;
    const m = Math.floor(diff / 60000) % 60;
    const h = Math.floor(diff / 3600000) % 24;
    const d = Math.floor(diff / 86400000);
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    return `${m}m ${s}s`;
}

// ─── Expose ──────────────────────────────────────────────────
window.initTimezone = initTimezone;
window.selectTimezone = selectTimezone;
window.toggleTzDropdown = toggleTzDropdown;
window.filterTzList = filterTzList;
window.formatEventTimeInTz = formatEventTimeInTz;
window.formatInTz = formatInTz;
window.getTzLabel = getTzLabel;
window.countdownLabel = countdownLabel;
window.get_userTimezone = () => _userTimezone;
