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
        <h2>${isLogin ? 'Welcome Back' : 'Join AI CyberHub'}</h2>
        <form id="${type}Form">
            ${!isLogin ? `<input type="text" id="userName" placeholder="Full Name" required>` : ''}
            <input type="email" id="userEmail" placeholder="Email" required>
            <input type="password" id="userPassword" placeholder="Password" required>
            <button type="submit" class="btn-primary" style="width:100%;" id="authSubmitBtn">
                ${isLogin ? 'Login' : 'Sign Up'}
            </button>
            <p id="authError" style="color:#ff4444; text-align:center; margin-top:0.5rem; display:none;"></p>
            <p style="text-align:center; margin-top:1rem; color:#aaa;">
                ${isLogin ? 'New? ' : 'Already a member? '}
                <a href="#" onclick="switchAuth('${isLogin ? 'signup' : 'login'}')">${isLogin ? 'Sign Up' : 'Login'}</a>
            </p>
        </form>
    `;

    document.getElementById(type + 'Form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('authSubmitBtn');
        const errEl = document.getElementById('authError');
        btn.disabled = true;
        btn.textContent = isLogin ? 'Logging in…' : 'Signing up…';
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
            btn.textContent = isLogin ? 'Login' : 'Sign Up';
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
            return `
            <div class="post-card fade-in" id="post-${post.id}">
                <div style="display:flex; align-items:center; margin-bottom:1rem;">
                    <div style="width:50px;height:50px;border-radius:50%;background:var(--cyber-blue);display:flex;align-items:center;justify-content:center;margin-right:1rem;font-weight:bold;">
                        ${post.user ? post.user.charAt(0).toUpperCase() : '?'}
                    </div>
                    <div>
                        <strong>${post.user}</strong>
                        <span style="color:#aaa; margin-left:1rem;">${timeStr}</span>
                    </div>
                </div>
                <p>${post.content}</p>
                <div style="display:flex; align-items:center; gap:2rem; margin-top:1.5rem;">
                    <button class="like-btn ${hasLiked ? 'liked' : ''}" id="like-btn-${post.id}" onclick="likePost('${post.id}')" title="${hasLiked ? 'Already liked' : 'Like this post'}">
                        <i class="${hasLiked ? 'fas' : 'far'} fa-heart"></i>
                        <span id="like-count-${post.id}">${post.likes || 0}</span>
                    </button>
                    <button>
                        <i class="fas fa-comment"></i> ${post.comments || 0}
                    </button>
                </div>
            </div>
        `}).join('') : '<p style="color:#aaa; text-align:center; padding:2rem;">No posts yet. Be the first to post!</p>';
    } catch (e) {
        console.error('[Feed] Load failed:', e);
        container.innerHTML = '<p style="color:#ff4444;">Failed to load feed.</p>';
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
    const bio = profile?.bio || 'No bio yet.';
    const skills = profile?.skills?.length ? profile.skills.join(', ') : 'None listed';
    const eventsCount = profile?.events?.length || 0;

    profileCard.innerHTML = `
        <div style="display:flex; align-items:center; gap:1.5rem; margin-bottom:1.5rem;">
            <div style="width:80px;height:80px;border-radius:50%;background:var(--cyber-blue);display:flex;align-items:center;justify-content:center;font-size:2rem;font-weight:bold;">${avatar}</div>
            <div>
                <h2 style="margin:0;">${name}</h2>
                <p style="color:#aaa; margin:0.25rem 0;">${currentUser.email}</p>
                <span style="background:var(--cyber-green);color:#000;padding:0.2rem 0.6rem;border-radius:4px;font-size:0.8rem;font-weight:700;">${points} pts</span>
            </div>
        </div>
        <div style="margin-bottom:1rem;">
            <strong>Bio:</strong>
            <p style="color:#ccc;">${bio}</p>
        </div>
        <div style="margin-bottom:1rem;">
            <strong>Skills:</strong>
            <p style="color:#ccc;">${skills}</p>
        </div>
        <div>
            <strong>Events Attended:</strong>
            <p style="color:#ccc;">${eventsCount}</p>
        </div>
        <button class="btn-logout" onclick="logout()" style="margin-top:1.5rem;">
            <i class="fas fa-sign-out-alt"></i> Logout
        </button>
    `;
}

// ─── AI Chatbot ────────────────────────────────────────────
function toggleAIChat() {
    const chat = document.getElementById('aiChat');
    chat.style.display = chat.style.display === 'flex' ? 'none' : 'flex';
}

function sendAIMessage() {
    const input = document.getElementById('aiInput');
    const messages = document.getElementById('aiMessages');
    const message = input.value.trim();
    if (!message) return;

    messages.innerHTML += `<div class="ai-message user-message">${message}</div>`;

    setTimeout(() => {
        const responses = {
            'threat': '🔍 Threat Analysis: Medium risk detected. Recommend isolating affected systems and running full AV scan.',
            'ctf': '🎯 CTF Tip: Focus on AI model extraction attacks. Most flags are in model weights!',
            'team': '👥 Team Suggestion: Look for complementary skills — ML + Reverse Engineering is unbeatable.',
            'event': '📅 Check the Events section for the latest CTFs, workshops, and hackathons!',
            'default': '🤖 CyberGuard AI here! Ask me about threats, CTFs, teams, or events.'
        };

        const key = message.toLowerCase().includes('threat') ? 'threat'
            : message.toLowerCase().includes('ctf') ? 'ctf'
                : message.toLowerCase().includes('team') ? 'team'
                    : message.toLowerCase().includes('event') ? 'event'
                        : 'default';

        messages.innerHTML += `<div class="ai-message">${responses[key]}</div>`;
        messages.scrollTop = messages.scrollHeight;
    }, 800);

    input.value = '';
}

function analyzeThreat() {
    const threats = [
        '🚨 CRITICAL: Zero-day RCE in AI framework detected',
        '⚠️ HIGH: Phishing campaign targeting ML engineers',
        '🔍 MEDIUM: Unusual API calls to model endpoints',
        '✅ LOW: Routine port scan detected'
    ];
    const threat = threats[Math.floor(Math.random() * threats.length)];
    document.getElementById('aiMessages').innerHTML += `
        <div class="ai-message">
            <strong>Threat Analysis:</strong><br>${threat}<br>
            <small>Generated by CyberGuard AI</small>
        </div>
    `;
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
