// ============================================================
//  admin.js — AI CyberHub
//  Enhanced admin panel: notifications CRUD, post moderation,
//  event editing, participant detail modal, user email directory
// ============================================================

let adminCurrentUser = null;
let _allUsers = [];   // cached for participant detail
let _allEvents = [];   // cached for detail view

// ─── Admin Auth ──────────────────────────────────────────────
async function adminInit() {
    const loginSection = document.getElementById('adminLogin');
    const dashSection = document.getElementById('adminDash');

    onAuthChange(async (user) => {
        if (!user) {
            loginSection.style.display = 'flex';
            dashSection.style.display = 'none';
            return;
        }

        const adminEmails = window.APP_CONFIG?.adminEmails || [];
        if (!adminEmails.includes(user.email)) {
            document.getElementById('adminAuthErr').textContent =
                '⛔ Access denied. Your email is not in the admin whitelist.';
            document.getElementById('adminAuthErr').style.display = 'block';
            await signOutUser();
            return;
        }

        adminCurrentUser = user;
        loginSection.style.display = 'none';
        dashSection.style.display = 'block';
        document.getElementById('adminUserEmail').textContent = user.email;

        // Load overview stats, then each tab
        await loadAdminOverview();
        loadAdminNotifications();
        loadAdminPosts();
        loadAdminEvents();
        loadAdminRegistrations();
        loadAdminUsers();
    });

    document.getElementById('adminLoginForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('adminLoginBtn');
        const errEl = document.getElementById('adminAuthErr');
        const email = document.getElementById('adminEmail').value.trim();
        const pass = document.getElementById('adminPass').value;

        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Verifying…';
        errEl.style.display = 'none';

        try {
            await signIn(email, pass);
        } catch (err) {
            errEl.textContent = err.message || 'Login failed.';
            errEl.style.display = 'block';
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-shield-halved"></i> Admin Login';
        }
    });
}

// ─── Tab Switcher ────────────────────────────────────────────
function switchAdminTab(tab) {
    document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.admin-tab-panel').forEach(p => p.style.display = 'none');
    document.getElementById(`admin-tab-${tab}`).style.display = 'block';
    document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
}

// ─── Overview Stats ───────────────────────────────────────────
async function loadAdminOverview() {
    try {
        const [users, events, posts, notifs] = await Promise.all([
            fetchCollection('users'),
            fetchCollection('events'),
            fetchCollection('posts'),
            fetchCollection('notifications')
        ]);

        _allUsers = users;
        _allEvents = events;

        const totalReg = users.reduce((acc, u) => acc + (u.events?.length || 0), 0);

        const setNum = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
        setNum('stat-total-users', users.length);
        setNum('stat-total-events', events.length);
        setNum('stat-total-regs', totalReg);
        setNum('stat-total-posts', posts.length);
        setNum('stat-total-notifs', notifs.length);

        // Per-event registration breakdown bar
        const breakdownEl = document.getElementById('regBreakdown');
        if (breakdownEl && events.length) {
            breakdownEl.innerHTML = events.map(ev => {
                const count = users.filter(u => (u.events || []).includes(ev.id)).length;
                const pct = ev.max ? Math.round((count / ev.max) * 100) : 0;
                return `
                    <div class="reg-bar-row">
                        <span class="reg-bar-label" title="${ev.title}">${ev.image || '🔥'} ${ev.title.substr(0, 22)}${ev.title.length > 22 ? '…' : ''}</span>
                        <div class="reg-bar-track">
                            <div class="reg-bar-fill" style="width:${pct}%;background:${pct > 80 ? 'var(--cyber-red)' : pct > 50 ? '#ffb800' : 'var(--cyber-green)'};"></div>
                        </div>
                        <span class="reg-bar-count">${count}/${ev.max}</span>
                    </div>`;
            }).join('');
        }
    } catch (e) {
        console.error('[Admin Overview]', e);
    }
}

// ─── Notifications Management ─────────────────────────────────
async function loadAdminNotifications() {
    const list = document.getElementById('adminNotifList');
    if (!list) return;
    list.innerHTML = '<p style="color:#aaa;">Loading…</p>';

    try {
        const notifs = await fetchCollection('notifications', { orderBy: 'createdAt', direction: 'desc' });
        if (!notifs.length) { list.innerHTML = '<p style="color:#aaa;">No notifications yet.</p>'; return; }

        list.innerHTML = notifs.map(n => `
            <div class="admin-item-row" id="notif-row-${n.id}">
                <div class="admin-item-body" id="notif-body-${n.id}">
                    <strong class="admin-item-title">${n.title}</strong>
                    <p class="admin-item-msg">${n.message}</p>
                    <div class="admin-item-meta">
                        <span class="notif-type-pill notif-type-${n.type}">${n.type}</span>
                        <span style="color:#aaa;font-size:.8rem;">by ${n.postedBy || 'admin'}</span>
                    </div>
                </div>
                <div style="display:flex;flex-direction:column;gap:.4rem;">
                    <button class="bio-edit-btn" onclick="editNotifInline('${n.id}','${escAttr(n.title)}','${escAttr(n.message)}','${n.type}')">
                        <i class="fas fa-pen"></i>
                    </button>
                    <button class="admin-delete-btn" onclick="adminDeleteNotif('${n.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');
    } catch (e) {
        list.innerHTML = `<p style="color:#ff4444;">Failed to load: ${e.message}</p>`;
        console.error(e);
    }
}

function editNotifInline(id, title, message, type) {
    const body = document.getElementById(`notif-body-${id}`);
    if (!body) return;
    body.innerHTML = `
        <div class="cyber-input-group" style="margin-bottom:.4rem;">
            <i class="fas fa-heading cyber-input-icon"></i>
            <input class="cyber-input has-value" type="text" id="edit-notif-title-${id}" value="${title}" placeholder=" ">
            <label class="cyber-input-label">Title</label>
        </div>
        <div class="cyber-input-group textarea-group" style="margin-bottom:.4rem;">
            <i class="fas fa-align-left cyber-input-icon"></i>
            <textarea class="cyber-input cyber-textarea has-value" id="edit-notif-msg-${id}" rows="2" placeholder=" ">${message}</textarea>
            <label class="cyber-input-label">Message</label>
        </div>
        <select id="edit-notif-type-${id}" style="padding:.4rem .7rem;background:rgba(0,212,255,.05);border:1px solid rgba(0,212,255,.2);border-radius:6px;color:#fff;font-family:'Rajdhani',sans-serif;font-size:.85rem;margin-bottom:.4rem;">
            ${['info', 'achievement', 'warning'].map(t => `<option value="${t}" ${t === type ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
        <button class="btn-primary" style="padding:.4rem 1rem;font-size:.82rem;" onclick="saveNotifEdit('${id}')">
            <i class="fas fa-save"></i> Save
        </button>
        <button class="btn-secondary" style="padding:.4rem 1rem;font-size:.82rem;margin-left:.4rem;" onclick="loadAdminNotifications()">
            Cancel
        </button>
    `;
}

async function saveNotifEdit(id) {
    const title = document.getElementById(`edit-notif-title-${id}`)?.value.trim();
    const message = document.getElementById(`edit-notif-msg-${id}`)?.value.trim();
    const type = document.getElementById(`edit-notif-type-${id}`)?.value || 'info';
    if (!title || !message) { showAdminToast('Title and message required.', 'error'); return; }
    try {
        await updateDocument('notifications', id, { title, message, type });
        showAdminToast('Notification updated!', 'success');
        loadAdminNotifications();
    } catch (e) {
        showAdminToast('Update failed.', 'error');
        console.error(e);
    }
}

async function adminPostNotification(e) {
    e.preventDefault();
    const title = document.getElementById('adminNotifTitle')?.value.trim();
    const msg = document.getElementById('adminNotifMsg')?.value.trim();
    const type = document.getElementById('adminNotifType')?.value || 'info';
    const errEl = document.getElementById('adminNotifErr');
    const btn = document.getElementById('adminNotifBtn');

    if (!title || !msg) {
        if (errEl) { errEl.textContent = 'Title and message required.'; errEl.style.display = 'block'; }
        return;
    }
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Publishing…';

    try {
        await postNotification(title, msg, type, adminCurrentUser?.email || '');
        document.getElementById('adminNotifTitle').value = '';
        document.getElementById('adminNotifMsg').value = '';
        if (errEl) errEl.style.display = 'none';
        showAdminToast('📢 Notification published!', 'success');
        loadAdminNotifications();
        loadAdminOverview();
    } catch (err) {
        if (errEl) { errEl.textContent = `Failed to publish: ${err.message}`; errEl.style.display = 'block'; }
        console.error(err);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-broadcast-tower"></i> Publish';
    }
}

async function adminDeleteNotif(id) {
    if (!confirm('Delete this notification?')) return;
    try {
        await deleteNotificationDoc(id);
        showAdminToast('Deleted.', 'info');
        loadAdminNotifications();
        loadAdminOverview();
    } catch (e) {
        showAdminToast('Failed to delete.', 'error');
        console.error(e);
    }
}

// ─── Posts Management ─────────────────────────────────────────
async function loadAdminPosts(search = '') {
    const list = document.getElementById('adminPostList');
    if (!list) return;
    list.innerHTML = '<p style="color:#aaa;">Loading…</p>';

    try {
        const posts = await fetchCollection('posts', { orderBy: 'createdAt', direction: 'desc' });
        const filtered = search
            ? posts.filter(p => p.content?.toLowerCase().includes(search) || p.user?.toLowerCase().includes(search))
            : posts;

        if (!filtered.length) { list.innerHTML = '<p style="color:#aaa;">No posts found.</p>'; return; }

        list.innerHTML = filtered.map(p => {
            const preview = (p.content || '').substr(0, 120) + ((p.content || '').length > 120 ? '…' : '');
            const time = p.createdAt ? formatPostTime(p.createdAt) : '';
            const initial = p.user ? p.user.charAt(0).toUpperCase() : '?';
            return `
                <div class="admin-item-row" id="post-row-${p.id}">
                    <div class="post-mini-avatar">${initial}</div>
                    <div class="admin-item-body" id="post-body-${p.id}">
                        <div style="display:flex;align-items:center;gap:.6rem;margin-bottom:.25rem;flex-wrap:wrap;">
                            <strong style="font-size:.9rem;">${p.user || 'Unknown'}</strong>
                            <span style="color:#555;font-size:.75rem;">${time}</span>
                            <span style="color:#aaa;font-size:.75rem;"><i class="fas fa-heart"></i> ${p.likes || 0}  <i class="fas fa-comment-dots"></i> ${p.comments || 0}</span>
                        </div>
                        <p class="admin-item-msg" style="white-space:pre-wrap;">${preview}</p>
                    </div>
                    <div style="display:flex;flex-direction:column;gap:.4rem;">
                        <button class="bio-edit-btn" onclick="editPostInline('${p.id}','${escAttr(p.content)}')">
                            <i class="fas fa-pen"></i>
                        </button>
                        <button class="admin-delete-btn" onclick="adminDeletePost('${p.id}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>`;
        }).join('');
    } catch (e) {
        list.innerHTML = '<p style="color:#ff4444;">Failed to load.</p>';
        console.error(e);
    }

    // Post search
    const searchEl = document.getElementById('adminPostSearch');
    if (searchEl && !searchEl.dataset.attached) {
        searchEl.addEventListener('input', (e) => loadAdminPosts(e.target.value.toLowerCase()));
        searchEl.dataset.attached = 'true';
    }
}

function editPostInline(id, content) {
    const body = document.getElementById(`post-body-${id}`);
    if (!body) return;
    body.innerHTML = `
        <div class="cyber-input-group textarea-group" style="margin-bottom:.5rem;">
            <i class="fas fa-pencil cyber-input-icon"></i>
            <textarea class="cyber-input cyber-textarea has-value" id="edit-post-${id}" rows="4" placeholder=" ">${content}</textarea>
            <label class="cyber-input-label">Post Content</label>
        </div>
        <button class="btn-primary" style="padding:.4rem 1rem;font-size:.82rem;" onclick="savePostEdit('${id}')">
            <i class="fas fa-save"></i> Save
        </button>
        <button class="btn-secondary" style="padding:.4rem 1rem;font-size:.82rem;margin-left:.4rem;" onclick="loadAdminPosts()">
            Cancel
        </button>
    `;
}

async function savePostEdit(id) {
    const content = document.getElementById(`edit-post-${id}`)?.value.trim();
    if (!content) { showAdminToast('Post cannot be empty.', 'error'); return; }
    try {
        await updateDocument('posts', id, { content });
        showAdminToast('Post updated!', 'success');
        loadAdminPosts();
    } catch (e) {
        showAdminToast('Update failed.', 'error');
        console.error(e);
    }
}

async function adminDeletePost(id) {
    if (!confirm('Delete this community post? This cannot be undone.')) return;
    try {
        await deleteDocument('posts', id);
        showAdminToast('Post deleted.', 'info');
        loadAdminPosts();
        loadAdminOverview();
    } catch (e) {
        showAdminToast('Failed to delete.', 'error');
        console.error(e);
    }
}

// ─── Events Management ────────────────────────────────────────
async function loadAdminEvents() {
    const list = document.getElementById('adminEventList');
    if (!list) return;
    list.innerHTML = '<p style="color:#aaa;">Loading…</p>';

    try {
        _allEvents = await fetchCollection('events', { orderBy: 'order', direction: 'asc' });
        if (!_allEvents.length) { list.innerHTML = '<p style="color:#aaa;">No events found.</p>'; return; }

        list.innerHTML = _allEvents.map(ev => `
            <div class="admin-item-row" id="admin-ev-${ev.id}">
                <div class="admin-item-body" style="flex:1;">
                    <strong class="admin-item-title">${ev.image || ''} ${ev.title}</strong>
                    <div class="admin-item-meta">
                        <span class="event-badge badge-${ev.type}" style="font-size:.7rem;">${ev.type}</span>
                        <span style="color:#aaa;font-size:.8rem;">${ev.registrations}/${ev.max} registered</span>
                    </div>
                    <div class="admin-event-edit" id="ev-edit-${ev.id}" style="display:none;margin-top:.75rem;">
                        <div class="admin-edit-grid">
                            ${adminEventField('Title', `ev-title-${ev.id}`, ev.title)}
                            ${adminEventField('Description', `ev-desc-${ev.id}`, ev.description)}
                            ${adminEventField('Max Registrations', `ev-max-${ev.id}`, ev.max, 'number')}
                            ${adminEventField('Date Label', `ev-date-${ev.id}`, ev.date)}
                            ${adminEventField('Event Opens (ISO)', `ev-open-${ev.id}`, ev.openTime)}
                            ${adminEventField('Event Closes (ISO)', `ev-close-${ev.id}`, ev.closeTime)}
                            ${adminEventField('Reg. Opens (ISO)', `ev-regstart-${ev.id}`, ev.regStart)}
                            ${adminEventField('Reg. Closes (ISO)', `ev-regend-${ev.id}`, ev.regEnd)}
                        </div>
                        <div style="display:flex;gap:.5rem;margin-top:.75rem;flex-wrap:wrap;">
                            <button class="btn-primary" style="flex:1;padding:.5rem;" onclick="saveAdminEvent('${ev.id}')">
                                <i class="fas fa-save"></i> Save Changes
                            </button>
                            <button class="btn-secondary" style="flex:1;padding:.5rem;" onclick="toggleAdminEventEdit('${ev.id}')">
                                Cancel
                            </button>
                        </div>
                        <p id="ev-edit-err-${ev.id}" style="color:#ff4444;margin-top:.4rem;display:none;"></p>
                    </div>
                </div>
                <button class="bio-edit-btn" onclick="toggleAdminEventEdit('${ev.id}')">
                    <i class="fas fa-pen"></i> Edit
                </button>
            </div>
        `).join('');
    } catch (e) {
        list.innerHTML = '<p style="color:#ff4444;">Failed to load.</p>';
        console.error(e);
    }
}

function adminEventField(label, id, value, type = 'text') {
    return `
        <div style="display:flex;flex-direction:column;gap:.25rem;">
            <label style="color:#aaa;font-size:.75rem;text-transform:uppercase;">${label}</label>
            <input id="${id}" type="${type}" value="${value || ''}"
                style="padding:.5rem .75rem;background:rgba(0,212,255,.05);border:1px solid rgba(0,212,255,.2);border-radius:6px;color:#fff;font-family:'Rajdhani',sans-serif;font-size:.85rem;width:100%;">
        </div>`;
}

function toggleAdminEventEdit(evId) {
    const el = document.getElementById(`ev-edit-${evId}`);
    const isOpen = el.style.display !== 'none';
    el.style.display = isOpen ? 'none' : 'block';
}

async function saveAdminEvent(evId) {
    const title = document.getElementById(`ev-title-${evId}`)?.value.trim();
    const desc = document.getElementById(`ev-desc-${evId}`)?.value.trim();
    const max = parseInt(document.getElementById(`ev-max-${evId}`)?.value || '0', 10);
    const date = document.getElementById(`ev-date-${evId}`)?.value.trim();
    const openTime = document.getElementById(`ev-open-${evId}`)?.value.trim();
    const closeTime = document.getElementById(`ev-close-${evId}`)?.value.trim();
    const regStart = document.getElementById(`ev-regstart-${evId}`)?.value.trim();
    const regEnd = document.getElementById(`ev-regend-${evId}`)?.value.trim();
    const errEl = document.getElementById(`ev-edit-err-${evId}`);

    if (!title) {
        if (errEl) { errEl.textContent = 'Title is required.'; errEl.style.display = 'block'; }
        return;
    }
    try {
        await updateDocument('events', evId, { title, description: desc, max, date, openTime, closeTime, regStart, regEnd });
        showAdminToast('Event updated!', 'success');
        toggleAdminEventEdit(evId);
        loadAdminEvents();
    } catch (err) {
        if (errEl) { errEl.textContent = 'Save failed.'; errEl.style.display = 'block'; }
        console.error(err);
    }
}

// ─── Registrations with Participant Detail ─────────────────────
async function loadAdminRegistrations() {
    const list = document.getElementById('adminRegList');
    if (!list) return;
    list.innerHTML = '<p style="color:#aaa;">Loading…</p>';

    try {
        const [events, users] = await Promise.all([
            fetchCollection('events', { orderBy: 'order', direction: 'asc' }),
            fetchCollection('users')
        ]);

        _allUsers = users;
        _allEvents = events;

        if (!events.length) { list.innerHTML = '<p style="color:#aaa;">No events found.</p>'; return; }

        const totalReg = users.reduce((acc, u) => acc + (u.events?.length || 0), 0);
        const summaryEl = document.getElementById('regSummaryLine');
        if (summaryEl) summaryEl.textContent = `${users.length} total users · ${totalReg} total registrations across ${events.length} events`;

        list.innerHTML = events.map(ev => {
            const registered = users.filter(u => (u.events || []).includes(ev.id));
            return `
                <div class="admin-item-row reg-event-block">
                    <div style="width:100%;">
                        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.5rem;margin-bottom:.6rem;">
                            <strong class="admin-item-title" style="margin:0;">
                                ${ev.image || ''} ${ev.title}
                            </strong>
                            <span class="notif-type-pill notif-type-info">
                                <i class="fas fa-users"></i> ${registered.length} / ${ev.max}
                            </span>
                        </div>
                        <div class="reg-mini-bar-track">
                            <div class="reg-mini-bar-fill" style="width:${ev.max ? Math.round(registered.length / ev.max * 100) : 0}%;"></div>
                        </div>
                        <div class="participant-list">
                            ${registered.length
                    ? registered.map(u => `
                                    <div style="display:inline-flex;align-items:center;background:rgba(0,212,255,.06);border:1px solid rgba(0,212,255,.18);border-radius:50px;margin:.2rem;">
                                        <button class="participant-chip" style="border:none;background:none;padding:.3rem .8rem .3rem .4rem;" onclick="showParticipantDetail('${u.id}')">
                                            <span class="participant-chip-avatar">${(u.name || u.email || '?').charAt(0).toUpperCase()}</span>
                                            <span class="participant-chip-name">${u.name || u.email}</span>
                                        </button>
                                        <button class="btn-primary" style="padding:.2rem .5rem;font-size:.7rem;border-radius:50px;margin-right:.2rem;" onclick="awardParticipantPoints('${u.id}', '${escAttr(u.name || u.email)}', '${escAttr(ev.title)}')">
                                            <i class="fas fa-award"></i> PTS
                                        </button>
                                    </div>`).join('')
                    : '<span style="color:#555;font-size:.82rem;font-style:italic;">No registrations yet</span>'}
                        </div>
                    </div>
                </div>`;
        }).join('');
    } catch (e) {
        list.innerHTML = '<p style="color:#ff4444;">Failed to load.</p>';
        console.error(e);
    }
}

// ─── Participant Detail Side Panel ────────────────────────────
function showParticipantDetail(userId) {
    const u = _allUsers.find(x => x.id === userId);
    if (!u) return;

    const panel = document.getElementById('participantPanel');
    const overlay = document.getElementById('participantOverlay');
    if (!panel || !overlay) return;

    const initial = (u.name || u.email || '?').charAt(0).toUpperCase();
    const evRegistered = _allEvents.filter(ev => (u.events || []).includes(ev.id));
    const skills = Array.isArray(u.skills) ? u.skills : [];
    const points = u.points || 0;

    panel.innerHTML = `
        <div class="pdetail-header">
            <div class="pdetail-avatar">${initial}</div>
            <div class="pdetail-info">
                <h3 class="pdetail-name">${u.name || 'Unknown'}</h3>
                <a href="mailto:${u.email}" class="pdetail-email">
                    <i class="fas fa-envelope"></i> ${u.email || '—'}
                </a>
                ${u.phone ? `<div class="pdetail-phone"><i class="fas fa-phone"></i> ${u.phone}</div>` : ''}
                ${u.college ? `<div class="pdetail-phone"><i class="fas fa-building"></i> ${u.college}</div>` : ''}
                ${u.role ? `<div class="pdetail-phone"><i class="fas fa-graduation-cap"></i> ${u.role}</div>` : ''}
            </div>
            <button class="pdetail-close" onclick="closeParticipantPanel()">
                <i class="fas fa-times"></i>
            </button>
        </div>

        <div class="pdetail-stats-row">
            <div class="pdetail-stat"><span class="pdetail-sv">${evRegistered.length}</span><span class="pdetail-sl">Events</span></div>
            <div class="pdetail-stat"><span class="pdetail-sv">${skills.length}</span><span class="pdetail-sl">Skills</span></div>
            <div class="pdetail-stat"><span class="pdetail-sv">${points}</span><span class="pdetail-sl">Points</span></div>
        </div>

        ${u.bio ? `<div class="pdetail-section"><p class="pdetail-bio">"${u.bio}"</p></div>` : ''}

        <div class="pdetail-section">
            <div class="pdetail-section-title"><i class="fas fa-flag"></i> Registered Events (${evRegistered.length})</div>
            ${evRegistered.length
            ? evRegistered.map(ev => `
                    <div class="pdetail-event-chip">
                        <span>${ev.image || '🔥'} ${ev.title}</span>
                        <span class="event-badge badge-${ev.type}" style="font-size:.68rem;padding:.2rem .6rem;">${ev.type}</span>
                    </div>`).join('')
            : '<p style="color:#555;font-size:.85rem;">No events registered.</p>'}
        </div>

        ${skills.length ? `
        <div class="pdetail-section">
            <div class="pdetail-section-title"><i class="fas fa-code"></i> Skills</div>
            <div>${skills.map(s => `<span class="skill-tag">${s}</span>`).join('')}</div>
        </div>` : ''}

        ${(u.github || u.linkedin) ? `
        <div class="pdetail-section">
            <div class="pdetail-section-title"><i class="fas fa-link"></i> Links</div>
            ${u.github ? `<a href="${u.github}"   target="_blank" class="pdetail-link"><i class="fab fa-github"></i> GitHub</a>` : ''}
            ${u.linkedin ? `<a href="${u.linkedin}" target="_blank" class="pdetail-link"><i class="fab fa-linkedin"></i> LinkedIn</a>` : ''}
        </div>` : ''}
    `;

    overlay.style.display = 'block';
    panel.style.transform = 'translateX(0)';
}

function closeParticipantPanel() {
    const panel = document.getElementById('participantPanel');
    const overlay = document.getElementById('participantOverlay');
    if (panel) panel.style.transform = 'translateX(100%)';
    if (overlay) overlay.style.display = 'none';
}

// ─── Users / Gmail Directory ──────────────────────────────────
async function loadAdminUsers(search = '') {
    const list = document.getElementById('adminUserList');
    if (!list) return;
    list.innerHTML = '<p style="color:#aaa;">Loading…</p>';

    try {
        if (!_allUsers.length) _allUsers = await fetchCollection('users');
        const filtered = search
            ? _allUsers.filter(u =>
                (u.email || '').toLowerCase().includes(search) ||
                (u.name || '').toLowerCase().includes(search))
            : _allUsers;

        const total = filtered.length;
        const totalEvReg = filtered.reduce((acc, u) => acc + (u.events?.length || 0), 0);

        const statsEl = document.getElementById('adminUserStats');
        if (statsEl) {
            statsEl.textContent = `${total} users · ${totalEvReg} total event registrations`;
        }

        if (!filtered.length) { list.innerHTML = '<p style="color:#aaa;">No users found.</p>'; return; }

        list.innerHTML = filtered.map(u => {
            const initial = (u.name || u.email || '?').charAt(0).toUpperCase();
            const evCount = (u.events || []).length;
            const joinDate = u.createdAt ? formatPostTime(u.createdAt) : 'Unknown';
            return `
                <div class="admin-item-row user-dir-row" onclick="showParticipantDetail('${u.id}')" style="cursor:pointer;">
                    <div class="user-dir-avatar">${initial}</div>
                    <div class="admin-item-body">
                        <strong class="admin-item-title" style="margin:0;">${u.name || 'No name'}</strong>
                        <div style="display:flex;align-items:center;gap:.5rem;margin-top:.2rem;flex-wrap:wrap;">
                            <a href="mailto:${u.email}" class="user-dir-email" onclick="event.stopPropagation()">
                                <i class="fas fa-envelope"></i> ${u.email || '—'}
                            </a>
                        </div>
                        <div class="admin-item-meta" style="margin-top:.3rem;">
                            <span class="notif-type-pill notif-type-info" style="font-size:.68rem;">
                                <i class="fas fa-flag"></i> ${evCount} events
                            </span>
                            ${u.phone ? `<span style="color:#666;font-size:.75rem;"><i class="fas fa-phone"></i> ${u.phone}</span>` : ''}
                            ${u.college ? `<span style="color:#666;font-size:.75rem;"><i class="fas fa-building"></i> ${u.college}</span>` : ''}
                            <span style="color:#444;font-size:.72rem;">Joined: ${joinDate}</span>
                        </div>
                    </div>
                    <div class="user-dir-points">
                        <span style="font-family:'Orbitron',monospace;font-size:1rem;color:var(--cyber-blue);">${u.points || 0}</span>
                        <span style="color:#555;font-size:.7rem;">pts</span>
                    </div>
                </div>`;
        }).join('');

    } catch (e) {
        list.innerHTML = '<p style="color:#ff4444;">Failed to load.</p>';
        console.error(e);
    }

    // Search listener
    const searchEl = document.getElementById('adminUserSearch');
    if (searchEl && !searchEl.dataset.attached) {
        searchEl.addEventListener('input', (e) => loadAdminUsers(e.target.value.toLowerCase()));
        searchEl.dataset.attached = 'true';
    }
}

// Copy all emails to clipboard
async function copyAllEmails() {
    const emails = _allUsers.map(u => u.email).filter(Boolean).join(', ');
    try {
        await navigator.clipboard.writeText(emails);
        showAdminToast(`✅ ${_allUsers.length} emails copied!`, 'success');
    } catch (e) {
        showAdminToast('Copy failed. Try manually.', 'error');
    }
}

// ─── Scoring System / Award Points ─────────────────────────────
async function awardParticipantPoints(userId, userName, eventName) {
    const ptsInput = prompt(`How many points to award ${userName} for event "${eventName}"?`, '50');
    if (ptsInput === null) return; // User cancelled

    const points = parseInt(ptsInput, 10);
    if (isNaN(points) || points <= 0) {
        showAdminToast('Please enter a valid positive number.', 'error');
        return;
    }

    if (!confirm(`Award ${points} pts to ${userName}?`)) return;

    try {
        // Increment the user's score in the db
        await incrementField('users', userId, 'points', points);

        // Post a notification about the achievement
        const msg = `🎉 **${userName}** earned **${points} pts** in the **${eventName}** event! Check the leaderboard to see their new rank.`;
        await postNotification(`Achievement Unlocked! 🏆`, msg, 'achievement', adminCurrentUser?.email || 'admin');

        showAdminToast(`Successfully awarded ${points} pts to ${userName}!`, 'success');

        // Refresh the registrations panel
        loadAdminRegistrations();
        loadAdminOverview();

    } catch (e) {
        showAdminToast('Failed to award points. Check console.', 'error');
        console.error('[Admin Points]', e);
    }
}

// ─── Utility ─────────────────────────────────────────────────
function escAttr(str) {
    return (str || '').replace(/'/g, '&#39;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─── Admin Toast ─────────────────────────────────────────────
function showAdminToast(msg, type = 'info') {
    const c = document.getElementById('adminToastContainer');
    if (!c) return;
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(() => { t.classList.add('toast-out'); setTimeout(() => t.remove(), 350); }, 3000);
}

async function adminLogout() {
    await signOutUser();
}

// ─── Expose ──────────────────────────────────────────────────
window.adminInit = adminInit;
window.switchAdminTab = switchAdminTab;
window.adminPostNotification = adminPostNotification;
window.adminDeleteNotif = adminDeleteNotif;
window.editNotifInline = editNotifInline;
window.saveNotifEdit = saveNotifEdit;
window.loadAdminPosts = loadAdminPosts;
window.editPostInline = editPostInline;
window.savePostEdit = savePostEdit;
window.adminDeletePost = adminDeletePost;
window.loadAdminEvents = loadAdminEvents;
window.toggleAdminEventEdit = toggleAdminEventEdit;
window.saveAdminEvent = saveAdminEvent;
window.loadAdminRegistrations = loadAdminRegistrations;
window.showParticipantDetail = showParticipantDetail;
window.closeParticipantPanel = closeParticipantPanel;
window.loadAdminUsers = loadAdminUsers;
window.copyAllEmails = copyAllEmails;
window.awardParticipantPoints = awardParticipantPoints;
window.adminLogout = adminLogout;
window.showAdminToast = showAdminToast;
