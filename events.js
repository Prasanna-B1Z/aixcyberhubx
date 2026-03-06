// ============================================================
//  events.js — AI CyberHub
//  Events section: render, filter, detail, OTP registration,
//  countdown timers, live deadline enforcement, timezone display
// ============================================================

let _countdownTimers = {}; // { timerId: intervalId }

// ─── Events Ticker ───────────────────────────────────────────
async function initEventsTicker() {
    const ticker = document.getElementById('eventsTicker');
    if (!ticker) return;
    try {
        const events = window.cachedEvents.length
            ? window.cachedEvents
            : await fetchCollection('events', { orderBy: 'order', direction: 'asc' });
        ticker.innerHTML = events.map(ev => `${ev.image || '🔥'} ${ev.title} — ${ev.date}`).join(' • &nbsp;');
    } catch (e) {
        ticker.innerHTML = '🌐 Web CTF — Live Now • 🤖 AI Red Team Challenge — Ongoing • ☁️ Cloud Hackathon — Just Started';
    }
}

// ─── Event Filter Buttons ────────────────────────────────────
let currentFilter = 'all';

document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelector('.filter-btn.active')?.classList.remove('active');
        btn.classList.add('active');
        renderEvents(btn.dataset.filter);
    });
});

// ─── Render Events Grid ──────────────────────────────────────
async function renderEvents(filter = currentFilter) {
    currentFilter = filter;
    const grid = document.getElementById('eventsGrid');
    if (!grid) return;
    grid.innerHTML = '<p style="color:#aaa;">Loading events…</p>';

    // Clear old timers
    Object.values(_countdownTimers).forEach(clearInterval);
    _countdownTimers = {};

    try {
        window.cachedEvents = await fetchCollection('events', { orderBy: 'order', direction: 'asc' });

        // Compute effective type based on live time
        window.cachedEvents.forEach(ev => {
            const now = Date.now();
            const open = ev.openTime ? new Date(ev.openTime).getTime() : null;
            const close = ev.closeTime ? new Date(ev.closeTime).getTime() : null;
            if (open && close) {
                if (now >= open && now <= close) ev._effectiveType = 'live';
                else if (now < open) ev._effectiveType = 'upcoming';
                else ev._effectiveType = 'past';
            } else {
                ev._effectiveType = ev.type || 'upcoming';
            }
        });

        const filtered = filter === 'all'
            ? window.cachedEvents
            : window.cachedEvents.filter(ev => ev._effectiveType === filter);

        if (!filtered.length) {
            grid.innerHTML = '<p style="color:#aaa;text-align:center;padding:2rem;">No events in this category yet.</p>';
            return;
        }

        grid.innerHTML = filtered.map(ev => eventCardHTML(ev)).join('');

        // Start countdown timers for each card
        filtered.forEach(ev => startEventCardTimers(ev));

    } catch (e) {
        console.error('[Events] Load failed:', e);
        grid.innerHTML = '<p style="color:#ff4444;">Failed to load events. Check your connection.</p>';
    }
}

function eventCardHTML(ev) {
    const alreadyRegistered = (window.currentUserProfile?.events || []).includes(ev.id);
    const regStatus = getRegStatus(ev);
    const tz = window.get_userTimezone ? window.get_userTimezone() : 'UTC';

    // Format event open/close in user's timezone
    const openLocal = ev.openTime ? formatEventTimeInTz(ev.openTime, tz) : 'TBD';
    const closeLocal = ev.closeTime ? formatEventTimeInTz(ev.closeTime, tz) : 'TBD';

    return `
        <div class="event-card fade-in" id="ev-card-${ev.id}">
            <span class="event-badge badge-${ev._effectiveType || ev.type}">${ev._effectiveType === 'live' ? '🔴 LIVE' : ev.date}</span>
            <div class="event-image-emoji">${ev.image || '🔥'}</div>
            <h3>${ev.title}</h3>
            <p>${ev.description}</p>

            <!-- Registration Status Badge -->
            <div class="reg-status-row">
                <span class="reg-status-badge reg-status-${regStatus.cls}" id="reg-badge-${ev.id}">
                    <i class="fas ${regStatus.icon}"></i> ${regStatus.label}
                </span>
                <span class="reg-countdown" id="reg-countdown-${ev.id}"></span>
            </div>

            <!-- Timezone time row -->
            <div class="ev-time-row">
                <span><i class="fas fa-door-open"></i> Opens: <strong>${openLocal}</strong></span>
                <span><i class="fas fa-flag-checkered"></i> Closes: <strong>${closeLocal}</strong></span>
            </div>

            <div class="event-footer">
                <span><i class="fas fa-users" style="color:var(--cyber-blue);margin-right:.3rem;"></i>${ev.registrations}/${ev.max}</span>
                <button class="btn-primary ${(regStatus.cls !== 'open' || alreadyRegistered) ? 'btn-disabled' : ''}"
                    onclick="showEventDetail('${ev.id}')"
                    ${(regStatus.cls !== 'open' || alreadyRegistered) ? 'disabled style="opacity:.5;cursor:not-allowed;"' : ''}>
                    ${alreadyRegistered ? '<i class="fas fa-check"></i> Registered' : 'Register'}
                </button>
            </div>
        </div>
    `;
}

function getRegStatus(ev) {
    const now = Date.now();
    const start = ev.regStart ? new Date(ev.regStart).getTime() : null;
    const end = ev.regEnd ? new Date(ev.regEnd).getTime() : null;

    if (!start || !end) return { cls: 'open', icon: 'fa-circle-check', label: 'Open' };

    if (now < start) return { cls: 'soon', icon: 'fa-clock', label: 'Opens Soon' };
    if (now > end) return { cls: 'closed', icon: 'fa-circle-xmark', label: 'Registration Closed' };
    return { cls: 'open', icon: 'fa-circle-check', label: 'Registration Open' };
}

function startEventCardTimers(ev) {
    const countdownEl = document.getElementById(`reg-countdown-${ev.id}`);
    const badgeEl = document.getElementById(`reg-badge-${ev.id}`);
    if (!countdownEl) return;

    const tick = () => {
        const now = Date.now();
        const regStart = ev.regStart ? new Date(ev.regStart).getTime() : null;
        const regEnd = ev.regEnd ? new Date(ev.regEnd).getTime() : null;
        const closeTime = ev.closeTime ? new Date(ev.closeTime).getTime() : null;

        // Auto-close event when closeTime passes — refresh grid
        if (closeTime && now > closeTime) {
            clearInterval(_countdownTimers[ev.id]);
            // Only re-render if the card still thinks it's live
            const card = document.getElementById(`ev-card-${ev.id}`);
            if (card && card.querySelector('.badge-live')) {
                renderEvents(currentFilter);
            }
            return;
        }

        if (!regStart || !regEnd) return;

        if (now < regStart) {
            const cd = countdownLabel(ev.regStart);
            countdownEl.textContent = cd ? `Opens in ${cd}` : '';
            if (badgeEl) badgeEl.innerHTML = `<i class="fas fa-clock"></i> Opens Soon`;
        } else if (now <= regEnd) {
            const cd = countdownLabel(ev.regEnd);
            countdownEl.textContent = cd ? `Deadline: ${cd}` : 'Closing…';
            if (badgeEl) badgeEl.innerHTML = `<i class="fas fa-circle-check"></i> Registration Open`;
        } else {
            countdownEl.textContent = 'Closed';
            if (badgeEl) badgeEl.innerHTML = `<i class="fas fa-circle-xmark"></i> Registration Closed`;
            // Disable register button
            const card = document.getElementById(`ev-card-${ev.id}`);
            if (card) {
                const btn = card.querySelector('button.btn-primary');
                if (btn && !btn.disabled) {
                    btn.disabled = true;
                    btn.style.opacity = '.5';
                    btn.style.cursor = 'not-allowed';
                }
            }
            clearInterval(_countdownTimers[ev.id]);
        }
    };

    tick();
    _countdownTimers[ev.id] = setInterval(tick, 1000);
}

// ─── Event Detail Modal ──────────────────────────────────────
function showEventDetail(id) {
    const event = window.cachedEvents.find(e => e.id === id);
    if (!event) return;
    const tz = window.get_userTimezone ? window.get_userTimezone() : 'UTC';

    const timeline = event.timeline || [
        { time: '09:00', label: 'Registration Opens' },
        { time: '10:00', label: 'Kickoff & Briefing' },
        { time: '12:00', label: 'Midpoint Check-in' },
        { time: '18:00', label: 'Submission Deadline' },
        { time: '19:00', label: 'Results & Awards' }
    ];

    // Adjust timeline times to user's timezone if event has an openTime anchor
    const anchorDate = event.openTime ? new Date(event.openTime) : new Date();
    const timelineHTML = `
        <div class="event-timeline">
            <strong class="timeline-heading"><i class="fas fa-stream"></i> Event Timeline <span style="font-size:.7rem;color:#aaa;font-weight:400;">(${getTzLabel(tz)})</span></strong>
            <div class="timeline-track">
                ${timeline.map((t, i) => {
        // Build a date for this timeline entry using the anchor date's local day in user tz
        const [h, mStr] = t.time.split(':').map(Number);
        const anchorDay = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(anchorDate);
        const entryUtc = new Date(`${anchorDay}T${String(h).padStart(2, '0')}:${String(mStr || 0).padStart(2, '0')}:00`);
        // Convert to display in user's timezone
        const localTime = formatInTz(entryUtc, tz, { hour: '2-digit', minute: '2-digit', hour12: false });
        const isPast = entryUtc.getTime() < Date.now();
        return `
                    <div class="timeline-item ${isPast ? 'tl-past' : ''}">
                        <span class="timeline-time">${localTime}</span>
                        <span class="timeline-dot ${i === 0 || isPast ? 'dot-active' : ''}"></span>
                        <span class="timeline-label">${t.label}</span>
                        ${isPast ? '<span class="tl-done-badge">Done</span>' : ''}
                    </div>`}).join('')}
            </div>
        </div>`;

    const eventOpen = formatEventTimeInTz(event.openTime, tz);
    const eventClose = formatEventTimeInTz(event.closeTime, tz);
    const regStart = formatEventTimeInTz(event.regStart, tz);
    const regEnd = formatEventTimeInTz(event.regEnd, tz);

    const regStatus = getRegStatus(event);
    const alreadyReg = (window.currentUserProfile?.events || []).includes(event.id);
    const regBtnLabel = alreadyReg ? '<i class="fas fa-check"></i> Already Registered'
        : regStatus.cls !== 'open' ? '<i class="fas fa-lock"></i> Registration Closed'
            : '<i class="fas fa-rocket"></i> Register Now (SMS Verify)';

    document.getElementById('eventDetail').innerHTML = `
        <h2>${event.title}</h2>
        <div class="event-badge badge-${event._effectiveType || event.type}" style="margin-bottom:.75rem;">${event._effectiveType === 'live' ? '🔴 LIVE NOW' : event.date}</div>
        <p style="color:#ccc;margin:1rem 0;">${event.details}</p>

        ${timelineHTML}

        <!-- Timing Info in user's timezone -->
        <div class="event-timing-grid">
            <div class="timing-block">
                <span class="timing-label"><i class="fas fa-door-open"></i> Event Opens</span>
                <span class="timing-value">${eventOpen}</span>
            </div>
            <div class="timing-block">
                <span class="timing-label"><i class="fas fa-door-closed"></i> Event Closes</span>
                <span class="timing-value">${eventClose}</span>
            </div>
            <div class="timing-block">
                <span class="timing-label"><i class="fas fa-calendar-plus"></i> Reg. Opens</span>
                <span class="timing-value">${regStart}</span>
            </div>
            <div class="timing-block">
                <span class="timing-label"><i class="fas fa-calendar-xmark"></i> Reg. Closes</span>
                <span class="timing-value">${regEnd}</span>
            </div>
        </div>

        <div style="color:#aaa;font-size:.9rem;margin:1rem 0;">
            <i class="fas fa-users" style="color:var(--cyber-blue);margin-right:.4rem;"></i>
            ${event.registrations}/${event.max} registered
        </div>

        <div class="reg-status-row" style="margin-bottom:1rem;">
            <span class="reg-status-badge reg-status-${regStatus.cls}" id="detail-reg-badge">
                <i class="fas ${regStatus.icon}"></i> ${regStatus.label}
            </span>
            <span id="detail-countdown" style="color:var(--cyber-green);font-size:.85rem;font-family:'Orbitron',monospace;"></span>
        </div>

        <div class="event-actions">
            <button class="btn-primary ${alreadyReg || regStatus.cls !== 'open' ? 'btn-disabled' : ''}"
                onclick="registerForEvent('${event.id}')"
                ${alreadyReg || regStatus.cls !== 'open' ? 'disabled style="opacity:.5;cursor:not-allowed;"' : ''}>
                ${regBtnLabel}
            </button>
            <button class="btn-secondary" onclick="addToCalendar('${event.id}')">
                <i class="fas fa-calendar-plus"></i> Add to Calendar
            </button>
        </div>
    `;

    // Live countdown inside detail modal
    const cdEl = document.getElementById('detail-countdown');
    const badgeEl = document.getElementById('detail-reg-badge');
    if (cdEl && event.regEnd) {
        const detailTimer = setInterval(() => {
            const now = Date.now();
            const regEndMs = new Date(event.regEnd).getTime();
            const label = countdownLabel(event.regEnd);
            if (now > regEndMs) {
                cdEl.textContent = '';
                if (badgeEl) badgeEl.innerHTML = `<i class="fas fa-circle-xmark"></i> Registration Closed`;
                clearInterval(detailTimer);
            } else {
                cdEl.textContent = label ? `Deadline: ${label}` : 'Closing…';
            }
        }, 1000);
    }

    document.getElementById('eventModal').style.display = 'flex';
}

async function registerForEvent(eventId) {
    if (!window.currentUser) {
        showToast('Please login to register for events.', 'error');
        showAuthModal('login');
        return;
    }
    closeModal();
    showPhoneOTPModal(eventId);
}

function addToCalendar(eventId) {
    const ev = window.cachedEvents.find(e => e.id === eventId);
    if (!ev) return;
    const start = ev.openTime ? new Date(ev.openTime) : new Date();
    const end = ev.closeTime ? new Date(ev.closeTime) : new Date(start.getTime() + 3600000 * 8);
    const fmt = d => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(ev.title)}&dates=${fmt(start)}/${fmt(end)}&details=${encodeURIComponent(ev.details || ev.description)}`;
    window.open(url, '_blank');
}

// ─── Expose ──────────────────────────────────────────────────
window.initEventsTicker = initEventsTicker;
window.renderEvents = renderEvents;
window.showEventDetail = showEventDetail;
window.registerForEvent = registerForEvent;
window.addToCalendar = addToCalendar;
