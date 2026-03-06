// ============================================================
//  notifications.js — AI CyberHub
//  Notification bell, dropdown, real-time listener, admin posting
// ============================================================

let _notifUnsubscribe = null;
let _cachedNotifs = [];
let _dropdownOpen = false;

// ─── Bell Icon Initialiser ───────────────────────────────────
function initNotifications() {
    // Inject bell into navbar
    const bellSlot = document.getElementById('notifBellSlot');
    if (!bellSlot) return;

    bellSlot.innerHTML = `
        <button class="notif-bell" id="notifBell" onclick="toggleNotifDropdown()" title="Notifications">
            <i class="fas fa-bell"></i>
            <span class="notif-badge" id="notifBadge" style="display:none;">0</span>
        </button>
        <div class="notif-dropdown" id="notifDropdown" style="display:none;">
            <div class="notif-dropdown-header">
                <span><i class="fas fa-satellite-dish"></i> Latest Updates</span>
                <span id="notifAdminBtn"></span>
            </div>
            <div class="notif-list" id="notifList">
                <p class="notif-empty">Loading…</p>
            </div>
        </div>
    `;

    // Start real-time listener
    startNotifListener();

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        const bell = document.getElementById('notifBell');
        const dropdown = document.getElementById('notifDropdown');
        if (dropdown && !bell?.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.style.display = 'none';
            _dropdownOpen = false;
        }
    });
}

function startNotifListener() {
    if (_notifUnsubscribe) _notifUnsubscribe(); // detach previous listener

    _notifUnsubscribe = listenCollection(
        'notifications',
        { orderBy: 'createdAt', direction: 'desc', limit: 15 },
        (docs) => {
            _cachedNotifs = docs;
            renderNotifList();
            updateNotifBadge();
        }
    );
}

function toggleNotifDropdown() {
    const dropdown = document.getElementById('notifDropdown');
    if (!dropdown) return;
    _dropdownOpen = !_dropdownOpen;
    dropdown.style.display = _dropdownOpen ? 'block' : 'none';

    if (_dropdownOpen) {
        renderNotifList();
        markAllRead();
    }
}

function updateNotifBadge() {
    const badge = document.getElementById('notifBadge');
    if (!badge) return;
    const readList = window.currentUserProfile?.readNotifications || [];
    const unread = _cachedNotifs.filter(n => !readList.includes(n.id)).length;
    badge.textContent = unread > 9 ? '9+' : unread;
    badge.style.display = unread > 0 ? 'flex' : 'none';
}

async function markAllRead() {
    if (!window.currentUser || !_cachedNotifs.length) return;
    const allIds = _cachedNotifs.map(n => n.id);
    try {
        await updateDocument('users', window.currentUser.uid, {
            readNotifications: firebase.firestore.FieldValue.arrayUnion(...allIds)
        });
        if (window.currentUserProfile) {
            window.currentUserProfile.readNotifications = allIds;
        }
        setTimeout(updateNotifBadge, 500);
    } catch (e) {
        console.warn('[Notif] markAllRead failed:', e);
    }
}

function renderNotifList() {
    const listEl = document.getElementById('notifList');
    const adminBtn = document.getElementById('notifAdminBtn');
    if (!listEl) return;

    // Admin "Post Update" button
    const isAdmin = window.currentUser &&
        (window.APP_CONFIG?.adminEmails || []).includes(window.currentUser.email);

    if (adminBtn) {
        adminBtn.innerHTML = isAdmin
            ? `<button class="notif-post-btn" onclick="showPostNotifForm()">
                   <i class="fas fa-plus"></i> Post Update
               </button>`
            : '';
    }

    if (!_cachedNotifs.length) {
        listEl.innerHTML = '<p class="notif-empty">No updates yet.</p>';
        return;
    }

    const readList = window.currentUserProfile?.readNotifications || [];
    listEl.innerHTML = _cachedNotifs.map(n => {
        const isRead = readList.includes(n.id);
        const icon = { info: 'fa-info-circle', achievement: 'fa-trophy', warning: 'fa-triangle-exclamation' }[n.type] || 'fa-bell';
        const time = n.createdAt ? formatPostTime(n.createdAt) : '';
        return `
            <div class="notif-item ${isRead ? 'notif-read' : 'notif-unread'}">
                <div class="notif-icon notif-icon-${n.type || 'info'}">
                    <i class="fas ${icon}"></i>
                </div>
                <div class="notif-body">
                    <div class="notif-title">${n.title}</div>
                    <div class="notif-msg">${n.message}</div>
                    <div class="notif-time">${time}</div>
                </div>
                ${isAdmin ? `<button class="notif-delete-btn" onclick="deleteNotif('${n.id}')" title="Delete">
                    <i class="fas fa-trash"></i></button>` : ''}
            </div>
        `;
    }).join('');
}

async function deleteNotif(docId) {
    try {
        await deleteNotificationDoc(docId);
        showToast('Notification deleted.', 'info');
    } catch (e) {
        showToast('Failed to delete notification.', 'error');
        console.error(e);
    }
}

// ─── Admin Post Notification Form ────────────────────────────
function showPostNotifForm() {
    const listEl = document.getElementById('notifList');
    if (!listEl) return;
    listEl.innerHTML = `
        <div class="notif-post-form">
            <div class="cyber-input-group" style="margin-bottom:.75rem;">
                <i class="fas fa-heading cyber-input-icon"></i>
                <input class="cyber-input" type="text" id="notifTitle" placeholder=" " required>
                <label class="cyber-input-label">Title</label>
            </div>
            <div class="cyber-input-group textarea-group" style="margin-bottom:.75rem;">
                <i class="fas fa-align-left cyber-input-icon"></i>
                <textarea class="cyber-input cyber-textarea" id="notifMsg" placeholder=" " rows="3" required></textarea>
                <label class="cyber-input-label">Message</label>
            </div>
            <div style="display:flex;gap:.5rem;margin-bottom:.75rem;">
                ${['info', 'achievement', 'warning'].map(t => `
                    <label class="notif-type-label">
                        <input type="radio" name="notifType" value="${t}" ${t === 'info' ? 'checked' : ''}> ${t}
                    </label>
                `).join('')}
            </div>
            <div style="display:flex;gap:.5rem;flex-wrap:wrap;">
                <button class="btn-primary" style="flex:1;padding:.55rem;" onclick="submitNotification()">
                    <i class="fas fa-broadcast-tower"></i> Publish
                </button>
                <button class="btn-secondary" style="flex:1;padding:.55rem;" onclick="renderNotifList()">
                    Cancel
                </button>
            </div>
            <p id="notifPostErr" class="auth-error"></p>
        </div>
    `;
}

async function submitNotification() {
    const title = document.getElementById('notifTitle')?.value.trim();
    const msg = document.getElementById('notifMsg')?.value.trim();
    const type = document.querySelector('input[name="notifType"]:checked')?.value || 'info';
    const errEl = document.getElementById('notifPostErr');

    if (!title || !msg) {
        if (errEl) { errEl.textContent = 'Title and message are required.'; errEl.style.display = 'block'; }
        return;
    }

    try {
        await postNotification(title, msg, type, window.currentUser?.email || '');
        showToast('📢 Update posted!', 'success');
        renderNotifList();
    } catch (e) {
        if (errEl) { errEl.textContent = 'Failed to post. Please try again.'; errEl.style.display = 'block'; }
        console.error('[Notif] Post failed:', e);
    }
}

// ─── Expose ──────────────────────────────────────────────────
window.initNotifications = initNotifications;
window.toggleNotifDropdown = toggleNotifDropdown;
window.showPostNotifForm = showPostNotifForm;
window.submitNotification = submitNotification;
window.deleteNotif = deleteNotif;
window.updateNotifBadge = updateNotifBadge;
