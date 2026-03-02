// ============================================================
//  script.js — AI CyberHub
//  App logic — uses Firebase Auth & Firestore via firebase.js
// ============================================================

// App State
let currentUser = null;     // Firebase Auth user object
let currentUserProfile = null; // Firestore users/{uid} document
let currentFilter = 'live';
let currentTab = 'weekly';

// All events/posts/teams cached for client-side search & reference
let cachedEvents = [];
let cachedTeams = [];
let cachedPosts = [];

// DOM
const loadingScreen = document.getElementById('loading-screen');
const navbar = document.getElementById('navbar');
const navAuth = document.getElementById('navAuth');

// ─── Initialise App ──────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async function () {
    // Hide loading screen after 2s
    setTimeout(() => {
        loadingScreen.style.opacity = '0';
        setTimeout(() => loadingScreen.style.display = 'none', 500);
    }, 2000);

    initNavbar();
    initScrollAnimations();

    // Seed Firestore with starter data on first visit
    try {
        await seedFirestoreIfEmpty();
    } catch (e) {
        console.warn('[Seed] Could not seed Firestore:', e);
    }

    // Load all sections (they run in parallel)
    renderEvents();
    renderTeams();
    renderLeaderboard();
    renderFeed();
    initEventsTicker();

    // Auth state listener — fires immediately with current state
    onAuthChange(async (firebaseUser) => {
        if (firebaseUser) {
            currentUser = firebaseUser;
            try {
                currentUserProfile = await getDocument('users', firebaseUser.uid);
            } catch (e) {
                console.warn('[Auth] Could not fetch user profile:', e);
                currentUserProfile = null;
            }
        } else {
            currentUser = null;
            currentUserProfile = null;
        }
        updateNavbarAuth();
        renderProfileSection();
    });
});

// ─── Navbar & Navigation ─────────────────────────────────────
function initNavbar() {
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            scrollTo(link.getAttribute('href').substring(1));
        });
    });

    window.addEventListener('scroll', () => {
        navbar.style.background = window.scrollY > 100
            ? 'rgba(10,10,10,0.95)'
            : 'rgba(10,10,10,0.8)';
    });
}

function scrollTo(sectionId) {
    document.getElementById(sectionId).scrollIntoView({ behavior: 'smooth' });
}

// ─── Auth UI ─────────────────────────────────────────────────
function updateNavbarAuth() {
    if (currentUser) {
        const displayName = (currentUserProfile?.name || currentUser.displayName || currentUser.email).split(' ')[0];
        const initial = displayName.charAt(0).toUpperCase();
        navAuth.innerHTML = `
            <div class="nav-user-chip">
                <div class="nav-avatar">${initial}</div>
                <span class="nav-username">${displayName}</span>
            </div>
            <button class="btn-logout" onclick="logout()">
                <i class="fas fa-power-off"></i>
                <span>Sign Out</span>
            </button>
        `;
    } else {
        navAuth.innerHTML = `
            <button class="btn-login" onclick="showAuthModal('login')">
                <span class="btn-login-icon"><i class="fas fa-terminal"></i></span>
                <span>Login</span>
                <span class="btn-login-arrow"><i class="fas fa-chevron-right"></i></span>
            </button>
        `;
    }
}

async function logout() {
    try {
        await signOutUser();
    } catch (e) {
        console.error('[Auth] Logout failed:', e);
    }
    closeModal();
}

// ─── Auth Modal ──────────────────────────────────────────────
function showAuthModal(type) {
    const modalContent = document.getElementById('authContent');
    const isLogin = type === 'login';

    modalContent.innerHTML = `
        <div class="auth-modal-header">
            <h2>${isLogin ? 'Welcome Back' : 'Join AI CyberHub'}</h2>
            <p>${isLogin ? 'Sign in to your cyber account' : 'Create your hacker profile'}</p>
        </div>
        <form id="${type}Form" autocomplete="off">

            ${!isLogin ? `
            <div class="cyber-input-group">
                <i class="fas fa-user cyber-input-icon"></i>
                <input class="cyber-input" type="text" id="userName" placeholder=" " required>
                <label class="cyber-input-label">Full Name</label>
            </div>` : ''}

            <div class="cyber-input-group">
                <i class="fas fa-envelope cyber-input-icon"></i>
                <input class="cyber-input" type="email" id="userEmail" placeholder=" " required>
                <label class="cyber-input-label">Email Address</label>
            </div>

            <div class="cyber-input-group">
                <i class="fas fa-lock cyber-input-icon"></i>
                <input class="cyber-input" type="password" id="userPassword" placeholder=" " required>
                <label class="cyber-input-label">Password</label>
            </div>

            <button type="submit" class="btn-primary" style="width:100%; margin-top:0.5rem;" id="authSubmitBtn">
                <i class="fas fa-${isLogin ? 'terminal' : 'user-plus'}"></i>
                ${isLogin ? 'Login' : 'Sign Up'}
            </button>

            <p id="authError" class="auth-error"></p>

            <div class="auth-switch">
                ${isLogin ? 'New around here?' : 'Already a member?'}
                <a href="#" onclick="switchAuth('${isLogin ? 'signup' : 'login'}')">&nbsp;${isLogin ? 'Sign Up' : 'Login'}</a>
            </div>
        </form>
    `;

    document.getElementById(type + 'Form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('authSubmitBtn');
        const errEl = document.getElementById('authError');
        btn.disabled = true;
        btn.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i>&nbsp;${isLogin ? 'Logging in…' : 'Signing up…'}`;
        errEl.style.display = 'none';

        const email = document.getElementById('userEmail').value.trim();
        const password = document.getElementById('userPassword').value;

        try {
            if (isLogin) {
                await signIn(email, password);
            } else {
                const name = document.getElementById('userName').value.trim();
                await signUp(email, password, name);
                const displayName = name.split(' ')[0];
                alert(`Welcome ${displayName}! 🎉`);
            }
            closeModal();
        } catch (err) {
            console.error('[Auth] Error:', err.code, err.message, err);
            errEl.textContent = friendlyAuthError(err.code, err.message);
            errEl.style.display = 'block';
            btn.disabled = false;
            btn.innerHTML = `<i class="fas fa-${isLogin ? 'terminal' : 'user-plus'}"></i>&nbsp;${isLogin ? 'Login' : 'Sign Up'}`;
        }
    });

    document.getElementById('authModal').style.display = 'flex';
}

function friendlyAuthError(code, message) {
    const map = {
        'auth/email-already-in-use': 'Email already registered. Try logging in.',
        'auth/invalid-email': 'Invalid email address.',
        'auth/wrong-password': 'Incorrect password.',
        'auth/user-not-found': 'No account found with that email.',
        'auth/weak-password': 'Password must be at least 6 characters.',
        'auth/invalid-credential': 'Invalid email or password.',
        'auth/operation-not-allowed': '❌ Email/Password sign-in is not enabled. Go to Firebase Console → Authentication → Sign-in method → Enable Email/Password.',
        'auth/network-request-failed': 'Network error. Check your internet connection.',
        'auth/too-many-requests': 'Too many attempts. Please wait a moment and try again.',
        'auth/internal-error': 'Firebase internal error. Check the browser console for details.',
        'auth/configuration-not-found': '❌ Firebase Auth not configured. Ensure your project is set up correctly.',
        'auth/admin-restricted-operation': '❌ Sign-up is restricted. Enable Email/Password in Firebase Console → Authentication.',
    };
    return map[code] || `Error (${code || 'unknown'}): ${message || 'Please try again.'}`;
}

function switchAuth(type) {
    showAuthModal(type);
}

function closeModal() {
    document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
}

window.onclick = function (event) {
    document.querySelectorAll('.modal').forEach(modal => {
        if (event.target === modal) closeModal();
    });
};

// ─── Events Ticker ───────────────────────────────────────────
async function initEventsTicker() {
    const ticker = document.getElementById('eventsTicker');
    try {
        const events = cachedEvents.length ? cachedEvents : await fetchCollection('events', { orderBy: 'order', direction: 'asc' });
        ticker.innerHTML = events.map(ev => `${ev.image} ${ev.title} - ${ev.date}`).join(' • ');
    } catch (e) {
        ticker.innerHTML = '🏁 AI CTF Championship - Live Now • 🤖 CyberSec Workshop - Mar 15';
    }
}

// ─── Events Section ──────────────────────────────────────────
async function renderEvents(filter = currentFilter) {
    currentFilter = filter;
    const grid = document.getElementById('eventsGrid');
    grid.innerHTML = '<p style="color:#aaa;">Loading events…</p>';

    try {
        cachedEvents = await fetchCollection('events', { orderBy: 'order', direction: 'asc' });
        const filtered = filter === 'all'
            ? cachedEvents
            : cachedEvents.filter(ev => ev.type === filter);

        grid.innerHTML = filtered.length ? filtered.map(ev => `
            <div class="event-card fade-in" onclick="showEventDetail('${ev.id}')">
                <span class="event-badge badge-${ev.type}">${ev.date}</span>
                <h3>${ev.title}</h3>
                <p>${ev.description}</p>
                <div class="event-footer">
                    <span>${ev.registrations}/${ev.max} registered</span>
                    <button class="btn-primary">Register</button>
                </div>
            </div>
        `).join('') : '<p style="color:#aaa; text-align:center; padding:2rem;">No events in this category yet.</p>';
    } catch (e) {
        console.error('[Events] Load failed:', e);
        grid.innerHTML = '<p style="color:#ff4444;">Failed to load events. Check your connection.</p>';
    }
}

document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelector('.filter-btn.active').classList.remove('active');
        btn.classList.add('active');
        renderEvents(btn.dataset.filter);
    });
});

function showEventDetail(id) {
    const event = cachedEvents.find(e => e.id === id);
    if (!event) return;
    document.getElementById('eventDetail').innerHTML = `
        <h2>${event.title}</h2>
        <div class="event-badge badge-${event.type}">${event.date}</div>
        <p>${event.details}</p>
        <div class="event-actions">
            <button class="btn-primary" onclick="registerForEvent('${event.id}')">Register Now</button>
            <button class="btn-secondary">Add to Calendar</button>
        </div>
    `;
    document.getElementById('eventModal').style.display = 'flex';
}

async function registerForEvent(eventId) {
    if (!currentUser) {
        alert('Please login to register for events.');
        showAuthModal('login');
        return;
    }
    try {
        await updateDocument('users', currentUser.uid, {
            events: firebase.firestore.FieldValue.arrayUnion(eventId)
        });
        alert('🎉 Registered successfully!');
        closeModal();
    } catch (e) {
        alert('Registration failed. Please try again.');
        console.error(e);
    }
}

// ─── Teams Section ───────────────────────────────────────────
async function renderTeams(search = '') {
    const grid = document.getElementById('teamsGrid');
    if (!search) grid.innerHTML = '<p style="color:#aaa;">Loading teams…</p>';

    try {
        if (!cachedTeams.length || !search) {
            cachedTeams = await fetchCollection('teams');
        }
        const filtered = cachedTeams.filter(t =>
            t.name.toLowerCase().includes(search.toLowerCase()) ||
            t.leader.toLowerCase().includes(search.toLowerCase())
        );

        grid.innerHTML = filtered.length ? filtered.map(team => `
            <div class="team-card fade-in">
                <h3>${team.name} <span class="team-points">${team.points} pts</span></h3>
                <p><strong>Leader:</strong> ${team.leader}</p>
                <p><strong>Members:</strong> ${team.members.length}/${team.maxMembers}</p>
                <p>${team.description}</p>
                ${team.members.length < team.maxMembers
                ? `<button class="btn-primary" onclick="requestJoin('${team.id}', '${team.name}')">Request to Join</button>`
                : `<span class="full-team">Team Full</span>`}
            </div>
        `).join('') : '<p style="color:#aaa; text-align:center; padding:2rem;">No teams found.</p>';
    } catch (e) {
        console.error('[Teams] Load failed:', e);
        grid.innerHTML = '<p style="color:#ff4444;">Failed to load teams.</p>';
    }

    // Attach search listener once
    const searchEl = document.getElementById('teamSearch');
    if (searchEl && !searchEl.dataset.listenerAttached) {
        searchEl.addEventListener('input', (e) => renderTeams(e.target.value));
        searchEl.dataset.listenerAttached = 'true';
    }
}

function showCreateTeamModal() {
    if (!currentUser) {
        alert('Please login to create a team');
        showAuthModal('login');
        return;
    }

    document.getElementById('teamContent').innerHTML = `
        <h2>Create New Team</h2>
        <form id="createTeamForm">
            <input type="text" id="teamName" placeholder="Team Name" required>
            <textarea id="teamDesc" placeholder="Team Description" required></textarea>
            <button type="submit" class="btn-primary" id="createTeamBtn">Create Team</button>
            <p id="createTeamErr" style="color:#ff4444; margin-top:0.5rem; display:none;"></p>
        </form>
    `;

    document.getElementById('createTeamForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('createTeamBtn');
        btn.disabled = true;
        btn.textContent = 'Creating…';
        const name = document.getElementById('teamName').value.trim();
        const desc = document.getElementById('teamDesc').value.trim();
        const leaderName = currentUserProfile?.name || currentUser.displayName || 'Unknown';

        try {
            await addDocument('teams', {
                name,
                description: desc,
                leader: leaderName,
                members: [leaderName],
                maxMembers: 4,
                points: 0
            });
            cachedTeams = []; // Invalidate cache
            closeModal();
            await renderTeams();
            alert(`Team "${name}" created! 🎉`);
        } catch (err) {
            document.getElementById('createTeamErr').textContent = 'Failed to create team. Try again.';
            document.getElementById('createTeamErr').style.display = 'block';
            btn.disabled = false;
            btn.textContent = 'Create Team';
            console.error(err);
        }
    });

    document.getElementById('teamModal').style.display = 'flex';
}

async function requestJoin(teamId, teamName) {
    if (!currentUser) {
        alert('Please login to join teams');
        showAuthModal('login');
        return;
    }
    try {
        await addDocument('joinRequests', {
            teamId,
            teamName,
            userId: currentUser.uid,
            userName: currentUserProfile?.name || currentUser.displayName || currentUser.email
        });
        alert(`Join request sent to ${teamName}! 👥`);
    } catch (e) {
        alert('Failed to send join request.');
        console.error(e);
    }
}

// ─── Leaderboard ─────────────────────────────────────────────
async function renderLeaderboard(tab = currentTab) {
    currentTab = tab;
    const grid = document.getElementById('leaderboardGrid');
    grid.innerHTML = '<p style="color:#aaa;">Loading leaderboard…</p>';

    try {
        const data = await fetchCollection('leaderboard', { orderBy: 'points', direction: 'desc' });
        grid.innerHTML = data.length ? data.map((player, index) => `
            <div class="leader-item fade-in ${index < 3 ? 'leader-top' : ''}">
                <div class="rank">#${index + 1}</div>
                <div style="flex:1; margin-left:1rem;">
                    <div style="font-weight:600;">${player.name} ${player.badge || ''}</div>
                    <div style="color:#aaa; font-size:0.9rem;">${player.events} events</div>
                </div>
                <div style="text-align:right;">
                    <div style="font-size:1.5rem; font-weight:700;">${player.points}</div>
                    <div style="color:#aaa; font-size:0.9rem;">pts</div>
                </div>
            </div>
        `).join('') : '<p style="color:#aaa; text-align:center;">No leaderboard data yet.</p>';
    } catch (e) {
        console.error('[Leaderboard] Load failed:', e);
        grid.innerHTML = '<p style="color:#ff4444;">Failed to load leaderboard.</p>';
    }
}

document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelector('.tab-btn.active').classList.remove('active');
        btn.classList.add('active');
        renderLeaderboard(btn.dataset.tab);
    });
});

// ─── Community Feed ──────────────────────────────────────────
async function renderFeed() {
    const container = document.getElementById('feedPosts');
    container.innerHTML = '<p style="color:#aaa;">Loading feed…</p>';

    try {
        cachedPosts = await fetchCollection('posts', { orderBy: 'createdAt', direction: 'desc' });
        container.innerHTML = cachedPosts.length ? cachedPosts.map(post => {
            const timeStr = formatPostTime(post.createdAt);
            const uid = currentUser?.uid || null;
            const likedBy = Array.isArray(post.likedBy) ? post.likedBy : [];
            const hasLiked = uid && likedBy.includes(uid);
            const commentCount = post.comments || 0;
            const authorInitial = post.user ? post.user.charAt(0).toUpperCase() : '?';

            return `
            <div class="post-card fade-in" id="post-${post.id}">

                <!-- Post Header -->
                <div class="post-header">
                    <div class="post-avatar">${authorInitial}</div>
                    <div>
                        <strong class="post-author">${post.user}</strong>
                        <span class="post-time">${timeStr}</span>
                    </div>
                </div>

                <!-- Content -->
                <p class="post-content">${post.content}</p>

                <!-- Actions -->
                <div class="post-actions">
                    <button class="like-btn ${hasLiked ? 'liked' : ''}" id="like-btn-${post.id}"
                        onclick="likePost('${post.id}')"
                        title="${hasLiked ? 'Already liked' : 'Like this post'}">
                        <i class="${hasLiked ? 'fas' : 'far'} fa-heart"></i>
                        <span id="like-count-${post.id}">${post.likes || 0}</span>
                    </button>
                    <button class="comment-toggle-btn" id="comment-btn-${post.id}"
                        onclick="toggleComments('${post.id}')">
                        <i class="fas fa-comment-dots"></i>
                        <span id="comment-count-${post.id}">${commentCount}</span>
                    </button>
                </div>

                <!-- Comment Panel (hidden by default) -->
                <div class="comment-panel" id="comment-panel-${post.id}" style="display:none;">
                    <div class="comment-list" id="comment-list-${post.id}">
                        <div class="comment-loading"><i class="fas fa-circle-notch fa-spin"></i> Loading comments…</div>
                    </div>
                    <div class="comment-input-row">
                        <div class="comment-avatar">${uid ? (currentUser?.displayName || currentUser?.email || '?').charAt(0).toUpperCase() : '?'}</div>
                        <div class="cyber-input-group" style="flex:1; margin:0;">
                            <input class="cyber-input comment-input" type="text"
                                id="comment-input-${post.id}"
                                placeholder=" "
                                onkeydown="if(event.key==='Enter') submitComment('${post.id}')">
                            <label class="cyber-input-label">Add a comment…</label>
                        </div>
                        <button class="comment-send-btn" onclick="submitComment('${post.id}')">
                            <i class="fas fa-paper-plane"></i>
                        </button>
                    </div>
                </div>

            </div>`;
        }).join('') : '<p style="color:#aaa; text-align:center; padding:2rem;">No posts yet. Be the first to post!</p>';
    } catch (e) {
        console.error('[Feed] Load failed:', e);
        container.innerHTML = '<p style="color:#ff4444;">Failed to load feed. Check your connection.</p>';
    }

    // Search listener
    const searchEl = document.getElementById('postSearch');
    if (searchEl && !searchEl.dataset.listenerAttached) {
        searchEl.addEventListener('input', (e) => {
            const q = e.target.value.toLowerCase();
            document.querySelectorAll('.post-card').forEach(card => {
                card.style.display = card.textContent.toLowerCase().includes(q) ? '' : 'none';
            });
        });
        searchEl.dataset.listenerAttached = 'true';
    }
}

// Toggle inline comment panel for a post
async function toggleComments(postId) {
    const panel = document.getElementById(`comment-panel-${postId}`);
    const btn = document.getElementById(`comment-btn-${postId}`);
    const isOpen = panel.style.display !== 'none';

    if (isOpen) {
        panel.style.display = 'none';
        btn.classList.remove('active');
        return;
    }

    panel.style.display = 'block';
    btn.classList.add('active');

    // Load comments from Firestore sub-collection
    await loadComments(postId);
}

async function loadComments(postId) {
    const list = document.getElementById(`comment-list-${postId}`);
    list.innerHTML = '<div class="comment-loading"><i class="fas fa-circle-notch fa-spin"></i> Loading…</div>';

    try {
        const snap = await window.firebaseDb
            .collection('posts').doc(postId)
            .collection('comments')
            .orderBy('createdAt', 'asc')
            .get();

        if (snap.empty) {
            list.innerHTML = '<p class="no-comments">No comments yet. Start the conversation!</p>';
            return;
        }

        list.innerHTML = snap.docs.map(doc => {
            const c = doc.data();
            const initial = c.user ? c.user.charAt(0).toUpperCase() : '?';
            const time = c.createdAt ? formatPostTime(c.createdAt) : 'Just now';
            return `
                <div class="comment-item">
                    <div class="comment-item-avatar">${initial}</div>
                    <div class="comment-item-body">
                        <span class="comment-item-author">${c.user}</span>
                        <span class="comment-item-time">${time}</span>
                        <p class="comment-item-text">${c.text}</p>
                    </div>
                </div>`;
        }).join('');

    } catch (e) {
        console.error('[Comments] Load failed:', e);
        list.innerHTML = '<p class="comment-error">Failed to load comments.</p>';
    }
}

async function submitComment(postId) {
    if (!currentUser) {
        alert('Please login to comment.');
        showAuthModal('login');
        return;
    }

    const input = document.getElementById(`comment-input-${postId}`);
    const text = input ? input.value.trim() : '';
    if (!text) return;

    const sendBtn = input.nextElementSibling && input.closest('.comment-input-row')
        ? input.closest('.comment-input-row').querySelector('.comment-send-btn') : null;

    input.value = '';
    input.classList.remove('has-value');
    if (sendBtn) { sendBtn.disabled = true; }

    const userName = currentUserProfile?.name || currentUser.displayName || currentUser.email;

    try {
        // Add comment to sub-collection
        await window.firebaseDb
            .collection('posts').doc(postId)
            .collection('comments')
            .add({
                user: userName,
                text,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

        // Atomically increment comment count on parent post
        await window.firebaseDb.collection('posts').doc(postId).update({
            comments: firebase.firestore.FieldValue.increment(1)
        });

        // Update counter in UI
        const countEl = document.getElementById(`comment-count-${postId}`);
        if (countEl) countEl.textContent = parseInt(countEl.textContent || '0') + 1;

        // Update cached post
        const cached = cachedPosts.find(p => p.id === postId);
        if (cached) cached.comments = (cached.comments || 0) + 1;

        // Reload comment list
        await loadComments(postId);

    } catch (err) {
        console.error('[Comments] Submit failed:', err);
        alert('Failed to post comment. Please try again.');
    } finally {
        if (sendBtn) { sendBtn.disabled = false; }
    }
}


function formatPostTime(createdAt) {
    if (!createdAt) return 'Just now';
    const date = createdAt.toDate ? createdAt.toDate() : new Date(createdAt);
    const diffMs = Date.now() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHrs = Math.floor(diffMins / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    return `${Math.floor(diffHrs / 24)}d ago`;
}

async function likePost(postId) {
    if (!currentUser) {
        alert('Please login to like posts.');
        showAuthModal('login');
        return;
    }

    const uid = currentUser.uid;
    const btn = document.getElementById(`like-btn-${postId}`);
    const countEl = document.getElementById(`like-count-${postId}`);

    // Check if already liked (client-side cached check first)
    const cachedPost = cachedPosts.find(p => p.id === postId);
    const likedBy = Array.isArray(cachedPost?.likedBy) ? cachedPost.likedBy : [];

    if (likedBy.includes(uid)) {
        // Visual pulse to indicate already liked
        btn?.classList.add('like-btn-pulse');
        setTimeout(() => btn?.classList.remove('like-btn-pulse'), 600);
        return;
    }

    // Optimistic UI update
    if (btn) {
        btn.classList.add('liked');
        btn.querySelector('i').className = 'fas fa-heart';
    }
    if (countEl) countEl.textContent = parseInt(countEl.textContent) + 1;
    // Update cache so same-session double-click is blocked
    if (cachedPost) cachedPost.likedBy = [...likedBy, uid];

    try {
        // Atomic: increment likes count + add uid to likedBy array
        await window.firebaseDb.collection('posts').doc(postId).update({
            likes: firebase.firestore.FieldValue.increment(1),
            likedBy: firebase.firestore.FieldValue.arrayUnion(uid)
        });
    } catch (e) {
        console.error('[Feed] Like failed:', e);
        // Rollback optimistic update
        if (btn) {
            btn.classList.remove('liked');
            btn.querySelector('i').className = 'far fa-heart';
        }
        if (countEl) countEl.textContent = parseInt(countEl.textContent) - 1;
        if (cachedPost) cachedPost.likedBy = likedBy;
    }
}

function showNewPostModal() {
    if (!currentUser) {
        alert('Please login to post');
        showAuthModal('login');
        return;
    }

    document.getElementById('teamContent').innerHTML = `
        <h2>New Post</h2>
        <form id="newPostForm">
            <textarea id="postContent" placeholder="Share something with the community…" rows="5" required style="width:100%;padding:0.75rem;background:#111;border:1px solid var(--cyber-blue);color:white;border-radius:6px;resize:vertical;"></textarea>
            <button type="submit" class="btn-primary" id="newPostBtn" style="margin-top:1rem;">Post</button>
            <p id="postErr" style="color:#ff4444; margin-top:0.5rem; display:none;"></p>
        </form>
    `;

    document.getElementById('newPostForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('newPostBtn');
        btn.disabled = true;
        btn.textContent = 'Posting…';
        const content = document.getElementById('postContent').value.trim();
        const userName = currentUserProfile?.name || currentUser.displayName || currentUser.email;

        try {
            await addDocument('posts', {
                user: userName,
                content,
                likes: 0,
                comments: 0
            });
            closeModal();
            await renderFeed();
        } catch (err) {
            document.getElementById('postErr').textContent = 'Failed to post. Try again.';
            document.getElementById('postErr').style.display = 'block';
            btn.disabled = false;
            btn.textContent = 'Post';
            console.error(err);
        }
    });

    document.getElementById('teamModal').style.display = 'flex';
}

// ─── Profile Section ─────────────────────────────────────────
function renderProfileSection() {
    const profileCard = document.getElementById('profileCard');
    if (!profileCard) return;

    if (!currentUser) {
        profileCard.innerHTML = `
            <div class="profile-placeholder">
                <i class="fas fa-user-circle"></i>
                <h3>Complete Your Profile</h3>
                <p>Login to showcase your skills, events, and achievements</p>
                <button class="btn-primary" onclick="showAuthModal('login')">Get Started</button>
            </div>
        `;
        return;
    }

    const profile = currentUserProfile;
    const name = profile?.name || currentUser.displayName || currentUser.email;
    const avatar = name.charAt(0).toUpperCase();
    const points = profile?.points || 0;
    const bio = profile?.bio || '';
    const skills = profile?.skills?.length ? profile.skills.join(', ') : 'None listed';
    const eventsCount = profile?.events?.length || 0;

    profileCard.innerHTML = `
        <div style="display:flex; align-items:center; gap:1.5rem; margin-bottom:1.5rem;">
            <div style="width:80px;height:80px;border-radius:50%;background:linear-gradient(135deg,var(--cyber-blue),var(--cyber-purple));display:flex;align-items:center;justify-content:center;font-size:2rem;font-weight:bold;font-family:'Orbitron',monospace;box-shadow:0 0 20px rgba(0,212,255,0.4);">${avatar}</div>
            <div>
                <h2 style="margin:0;font-family:'Orbitron',monospace;font-size:1.3rem;">${name}</h2>
                <p style="color:#aaa; margin:0.25rem 0; font-size:0.9rem;">${currentUser.email}</p>
                <span style="background:linear-gradient(135deg,var(--cyber-green),#00c4a7);color:#000;padding:0.2rem 0.7rem;border-radius:50px;font-size:0.8rem;font-weight:700;box-shadow:0 0 10px rgba(0,255,136,0.3);">${points} pts</span>
            </div>
        </div>

        <!-- Bio section -->
        <div style="margin-bottom:1.2rem; padding:1rem; background:rgba(0,212,255,0.04); border:1px solid rgba(0,212,255,0.15); border-radius:12px;">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.5rem;">
                <strong style="color:var(--cyber-blue); font-size:0.85rem; letter-spacing:0.08em; text-transform:uppercase;"><i class="fas fa-terminal" style="margin-right:0.4rem;"></i>Bio</strong>
                <button class="bio-edit-btn" id="bioEditBtn" onclick="toggleBioEditor()">
                    <i class="fas fa-pen"></i> Edit
                </button>
            </div>
            <p id="bioDisplay" style="color:#ccc; margin:0; font-size:0.95rem; line-height:1.6;">${bio || '<span style="color:rgba(255,255,255,0.3); font-style:italic;">No bio yet — tell the community about yourself!</span>'}</p>

            <!-- Hidden editor -->
            <div class="bio-editor" id="bioEditor" style="display:none;">
                <div class="cyber-input-group textarea-group">
                    <i class="fas fa-pen-nib cyber-input-icon"></i>
                    <textarea class="cyber-input cyber-textarea" id="bioTextarea" placeholder=" " rows="4">${bio}</textarea>
                    <label class="cyber-input-label">Write your bio…</label>
                </div>
                <button class="bio-save-btn" onclick="saveBio()">
                    <i class="fas fa-save"></i> Save Bio
                </button>
                <p class="bio-status" id="bioStatus"><i class="fas fa-check-circle"></i> Bio saved!</p>
            </div>
        </div>

        <div style="margin-bottom:1rem; padding:1rem; background:rgba(123,44,191,0.05); border:1px solid rgba(123,44,191,0.15); border-radius:12px;">
            <strong style="color:var(--cyber-purple); font-size:0.85rem; letter-spacing:0.08em; text-transform:uppercase;"><i class="fas fa-code" style="margin-right:0.4rem;"></i>Skills</strong>
            <p style="color:#ccc; margin:0.4rem 0 0;">${skills}</p>
        </div>

        <div style="margin-bottom:1.5rem; padding:1rem; background:rgba(0,255,136,0.04); border:1px solid rgba(0,255,136,0.12); border-radius:12px;">
            <strong style="color:var(--cyber-green); font-size:0.85rem; letter-spacing:0.08em; text-transform:uppercase;"><i class="fas fa-flag" style="margin-right:0.4rem;"></i>Events Attended</strong>
            <p style="color:#ccc; margin:0.4rem 0 0; font-size:1.4rem; font-weight:700; font-family:'Orbitron',monospace;">${eventsCount}</p>
        </div>

        <button class="btn-logout" onclick="logout()">
            <i class="fas fa-power-off"></i>
            <span>Sign Out</span>
        </button>
    `;

    // Mark textarea as has-value if bio is non-empty (so floating label stays up)
    const ta = document.getElementById('bioTextarea');
    if (ta && ta.value) ta.classList.add('has-value');
}

function toggleBioEditor() {
    const editor = document.getElementById('bioEditor');
    const btn = document.getElementById('bioEditBtn');
    const isOpen = editor.style.display !== 'none';
    editor.style.display = isOpen ? 'none' : 'block';
    btn.innerHTML = isOpen ? '<i class="fas fa-pen"></i> Edit' : '<i class="fas fa-times"></i> Cancel';
    if (!isOpen) {
        const ta = document.getElementById('bioTextarea');
        if (ta) { ta.focus(); if (ta.value) ta.classList.add('has-value'); }
    }
}

async function saveBio() {
    if (!currentUser) return;
    const ta = document.getElementById('bioTextarea');
    const statusEl = document.getElementById('bioStatus');
    const saveBtn = document.querySelector('.bio-save-btn');
    const bioDisplay = document.getElementById('bioDisplay');
    const newBio = ta ? ta.value.trim() : '';

    if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Saving…'; }

    try {
        await updateDocument('users', currentUser.uid, { bio: newBio });
        // Update in-memory cache so UI reflects instantly
        if (currentUserProfile) currentUserProfile.bio = newBio;
        // Update displayed bio without full re-render
        if (bioDisplay) {
            bioDisplay.innerHTML = newBio || '<span style="color:rgba(255,255,255,0.3); font-style:italic;">No bio yet — tell the community about yourself!</span>';
        }
        if (statusEl) { statusEl.style.display = 'block'; setTimeout(() => { statusEl.style.display = 'none'; }, 3000); }
        // Close editor
        toggleBioEditor();
    } catch (err) {
        console.error('[Profile] Bio save failed:', err);
        alert('Failed to save bio. Please try again.');
    } finally {
        if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fas fa-save"></i> Save Bio'; }
    }
}

// ─── Gemini AI Chatbot ──────────────────────────────────────
const GEMINI_API_KEY = 'AIzaSyCkYQQb5mIr3V44oqZxVGTDqGEZGnVt_AQ';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

// Conversation history for multi-turn context
const chatHistory = [];

// System prompt — gives Gemini its CyberGuard AI persona
const SYSTEM_PROMPT = `You are CyberGuard AI, the intelligent assistant embedded inside AI CyberHub — a community platform where AI and cybersecurity enthusiasts compete in CTFs, attend workshops, form teams, and climb the leaderboard.

Your personality: expert, concise, a little edgy/hacker-cool. Use relevant emojis sparingly. Format responses in short paragraphs or bullet points — never walls of text.

Your expertise covers: CTF challenges, penetration testing, AI security, prompt injection, adversarial ML, threat intelligence, OSINT, reverse engineering, malware analysis, and the AI CyberHub platform itself (events, teams, leaderboard, feed).

When users ask about cybersecurity threats or vulnerabilities, give real, specific, practical advice. When they ask about CTF tips, give real techniques. Keep responses under 150 words unless asked to elaborate.`;

function toggleAIChat() {
    const chat = document.getElementById('aiChat');
    const isOpen = chat.style.display === 'flex';
    chat.style.display = isOpen ? 'none' : 'flex';
    // Show welcome message on first open
    if (!isOpen && document.getElementById('aiMessages').innerHTML === '') {
        appendAIMessage('🤖 **CyberGuard AI online.** Ask me anything about cybersecurity, CTFs, AI security, or this platform. I\'m powered by Gemini.');
    }
}

function appendUserMessage(text) {
    const messages = document.getElementById('aiMessages');
    const div = document.createElement('div');
    div.className = 'ai-message user-message';
    div.textContent = text;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
}

function appendAIMessage(text) {
    const messages = document.getElementById('aiMessages');
    const div = document.createElement('div');
    div.className = 'ai-message';
    // Render basic markdown: **bold**, *italic*, bullet lines
    div.innerHTML = text
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/^[-•]\s+/gm, '• ')
        .replace(/\n/g, '<br>');
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
    return div;
}

function showTypingIndicator() {
    const messages = document.getElementById('aiMessages');
    const div = document.createElement('div');
    div.className = 'ai-message ai-typing';
    div.id = 'typingIndicator';
    div.innerHTML = '<span></span><span></span><span></span>';
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
}

function removeTypingIndicator() {
    const el = document.getElementById('typingIndicator');
    if (el) el.remove();
}

async function sendAIMessage() {
    const input = document.getElementById('aiInput');
    const message = input.value.trim();
    if (!message) return;
    input.value = '';

    appendUserMessage(message);

    // Add to history
    chatHistory.push({ role: 'user', parts: [{ text: message }] });

    showTypingIndicator();

    try {
        const body = {
            system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
            contents: chatHistory,
            generationConfig: {
                temperature: 0.8,
                maxOutputTokens: 300
            }
        };

        const res = await fetch(GEMINI_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err?.error?.message || `HTTP ${res.status}`);
        }

        const data = await res.json();
        const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || '⚠️ No response received.';

        removeTypingIndicator();
        appendAIMessage(reply);

        // Add assistant reply to history
        chatHistory.push({ role: 'model', parts: [{ text: reply }] });

        // Keep history manageable (last 20 turns)
        if (chatHistory.length > 20) chatHistory.splice(0, 2);

    } catch (err) {
        removeTypingIndicator();
        appendAIMessage(`⚠️ Error: ${err.message}`);
        console.error('[CyberGuard AI] API error:', err);
        // Remove the failed user message from history so it doesn't corrupt context
        chatHistory.pop();
    }
}

async function analyzeThreat() {
    const messages = document.getElementById('aiMessages');
    const prompt = 'Give me a brief, real cybersecurity threat intelligence summary right now. Mention one specific active threat or CVE that AI/ML engineers or CTF players should know about. Under 100 words.';

    appendUserMessage('🔍 Analyze current threat landscape');
    chatHistory.push({ role: 'user', parts: [{ text: prompt }] });
    showTypingIndicator();

    try {
        const body = {
            system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
            contents: chatHistory,
            generationConfig: { temperature: 0.7, maxOutputTokens: 200 }
        };

        const res = await fetch(GEMINI_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        const data = await res.json();
        const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || '⚠️ Could not fetch threat data.';

        removeTypingIndicator();
        appendAIMessage(reply);
        chatHistory.push({ role: 'model', parts: [{ text: reply }] });

    } catch (err) {
        removeTypingIndicator();
        appendAIMessage(`⚠️ Threat scan failed: ${err.message}`);
        chatHistory.pop();
    }
}

document.getElementById('aiInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendAIMessage();
});

// ─── Scroll Animations ───────────────────────────────────────
function initScrollAnimations() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) entry.target.classList.add('fade-in');
        });
    });
    document.querySelectorAll('.fade-in').forEach(el => observer.observe(el));
}
