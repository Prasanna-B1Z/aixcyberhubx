// ============================================================
//  script.js — AI CyberHub
//  App coordinator: initialises all modules, auth listener,
//  teams, leaderboard, and Gemini AI chatbot.
//  All other feature logic lives in the module files:
//    ui.js · auth.js · notifications.js · events.js
//    profile.js · feed.js
// ============================================================

// ─── App Init ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async function () {
    // Hide loading screen after 2 s
    const loadingScreen = document.getElementById('loading-screen');
    setTimeout(() => {
        loadingScreen.style.opacity = '0';
        setTimeout(() => loadingScreen.style.display = 'none', 500);
    }, 2000);

    // UI & animation setup
    initNavbar();
    initScrollAnimations();
    initParticles();
    initNotifications();   // bell icon + real-time listener

    // Seed Firestore with starter data on first visit
    try { await seedFirestoreIfEmpty(); } catch (e) { console.warn('[Seed]', e); }

    // Load all sections in parallel
    renderEvents();
    renderTeams();
    renderLeaderboard();
    renderFeed();
    initEventsTicker();
    animateStats();

    // Auth state listener
    onAuthChange(async (firebaseUser) => {
        if (firebaseUser) {
            window.currentUser = firebaseUser;
            try {
                window.currentUserProfile = await getDocument('users', firebaseUser.uid);
            } catch (e) {
                console.warn('[Auth] Could not fetch user profile:', e);
                window.currentUserProfile = null;
            }
        } else {
            window.currentUser = null;
            window.currentUserProfile = null;
        }
        updateNavbarAuth();
        renderProfileSection();
        updateNotifBadge();  // refresh unread count after login/logout
    });
});

// ─── Teams Section ───────────────────────────────────────────
async function renderTeams(search = '') {
    const grid = document.getElementById('teamsGrid');
    if (!grid) return;
    if (!search) grid.innerHTML = '<p style="color:#aaa;">Loading teams…</p>';

    try {
        if (!window.cachedTeams.length || !search) {
            window.cachedTeams = await fetchCollection('teams');
        }
        const filtered = window.cachedTeams.filter(t =>
            t.name.toLowerCase().includes(search.toLowerCase()) ||
            t.leader.toLowerCase().includes(search.toLowerCase())
        );

        grid.innerHTML = filtered.length ? filtered.map(team => `
            <div class="team-card fade-in">
                <h3>${team.name} <span class="team-points">${team.points} pts</span></h3>
                <p><strong>Leader:</strong> ${team.leader}</p>
                <p><strong>Members:</strong> ${team.members.length}/${team.maxMembers}</p>
                <p>${team.description}</p>
                <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.75rem;">
                    <button class="btn-secondary" style="padding:.5rem 1rem;font-size:.85rem;"
                        onclick="showTeamDetail('${team.id}')">View Team</button>
                    ${team.members.length < team.maxMembers
                ? `<button class="btn-primary" style="padding:.5rem 1rem;font-size:.85rem;"
                            onclick="requestJoin('${team.id}','${team.name}')">Request to Join</button>`
                : `<span class="full-team">Team Full</span>`}
                </div>
            </div>
        `).join('') : '<p style="color:#aaa;text-align:center;padding:2rem;">No teams found.</p>';
    } catch (e) {
        console.error('[Teams] Load failed:', e);
        grid.innerHTML = '<p style="color:#ff4444;">Failed to load teams.</p>';
    }

    const searchEl = document.getElementById('teamSearch');
    if (searchEl && !searchEl.dataset.listenerAttached) {
        searchEl.addEventListener('input', (e) => renderTeams(e.target.value));
        searchEl.dataset.listenerAttached = 'true';
    }
}

function showCreateTeamModal() {
    if (!window.currentUser) {
        showToast('Please login to create a team', 'error');
        showAuthModal('login');
        return;
    }

    document.getElementById('teamContent').innerHTML = `
        <h2>Create New Team</h2>
        <form id="createTeamForm">
            <div class="cyber-input-group">
                <i class="fas fa-users-gear cyber-input-icon"></i>
                <input class="cyber-input" type="text" id="teamName" placeholder=" " required>
                <label class="cyber-input-label">Team Name</label>
            </div>
            <div class="cyber-input-group textarea-group" style="margin-top:.75rem;">
                <i class="fas fa-align-left cyber-input-icon"></i>
                <textarea class="cyber-input cyber-textarea" id="teamDesc" placeholder=" " rows="3" required></textarea>
                <label class="cyber-input-label">Team Description</label>
            </div>
            <button type="submit" class="btn-primary" id="createTeamBtn" style="width:100%;margin-top:1rem;">
                <i class="fas fa-plus"></i> Create Team
            </button>
            <p id="createTeamErr" style="color:#ff4444;margin-top:.5rem;display:none;"></p>
        </form>
    `;

    document.getElementById('createTeamForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('createTeamBtn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Creating…';
        const name = document.getElementById('teamName').value.trim();
        const desc = document.getElementById('teamDesc').value.trim();
        const leaderName = window.currentUserProfile?.name || window.currentUser.displayName || 'Unknown';

        try {
            await addDocument('teams', { name, description: desc, leader: leaderName, members: [leaderName], maxMembers: 4, points: 0 });
            window.cachedTeams = [];
            closeModal();
            await renderTeams();
            showToast(`Team "${name}" created! 🚀`, 'success');
        } catch (err) {
            document.getElementById('createTeamErr').textContent = 'Failed to create team.';
            document.getElementById('createTeamErr').style.display = 'block';
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-plus"></i> Create Team';
            console.error(err);
        }
    });

    document.getElementById('teamModal').style.display = 'flex';
}

async function requestJoin(teamId, teamName) {
    if (!window.currentUser) {
        showToast('Please login to join teams', 'error');
        showAuthModal('login');
        return;
    }
    try {
        await addDocument('joinRequests', {
            teamId, teamName,
            userId: window.currentUser.uid,
            userName: window.currentUserProfile?.name || window.currentUser.displayName || window.currentUser.email
        });
        showToast(`Join request sent to ${teamName}! 👥`, 'success');
    } catch (e) {
        showToast('Failed to send join request.', 'error');
        console.error(e);
    }
}

async function showTeamDetail(teamId) {
    const team = window.cachedTeams.find(t => t.id === teamId);
    if (!team) return;
    const leaderName = window.currentUserProfile?.name || window.currentUser?.displayName || '';
    const isLeader = window.currentUser && team.leader === leaderName;

    document.getElementById('teamContent').innerHTML = `
        <h2>${team.name}</h2>
        <p style="color:#aaa;margin-bottom:1.2rem;">${team.description}</p>
        <strong style="color:var(--cyber-blue);font-size:.85rem;text-transform:uppercase;letter-spacing:.08em;">
            <i class="fas fa-users" style="margin-right:.4rem;"></i>Members (${team.members.length}/${team.maxMembers})
        </strong>
        <div id="teamMembersList" style="margin-top:.75rem;display:flex;flex-direction:column;gap:.5rem;">
            ${team.members.map(m => `
                <div style="display:flex;align-items:center;justify-content:space-between;padding:.6rem .9rem;background:rgba(0,212,255,.04);border:1px solid rgba(0,212,255,.12);border-radius:10px;">
                    <span style="font-weight:600;">${m} ${m === team.leader ? '<span style="color:var(--cyber-gold);font-size:.75rem;">(Leader)</span>' : ''}</span>
                    ${isLeader && m !== team.leader
            ? `<button onclick="removeMember('${teamId}','${m}')"
                            style="background:rgba(255,71,87,.15);border:1px solid rgba(255,71,87,.4);border-radius:50px;color:#ff6b78;font-size:.8rem;padding:.3rem .8rem;cursor:pointer;font-family:'Rajdhani',sans-serif;font-weight:700;">
                            <i class="fas fa-user-minus"></i> Remove</button>`
            : ''}
                </div>`).join('')}
        </div>
        ${team.members.length < team.maxMembers
            ? `<button class="btn-primary" style="margin-top:1.2rem;width:100%;" onclick="requestJoin('${teamId}','${team.name}')">Request to Join</button>`
            : `<p style="color:#aaa;margin-top:1rem;text-align:center;">Team is full</p>`}
    `;
    document.getElementById('teamModal').style.display = 'flex';
}

async function removeMember(teamId, memberName) {
    const team = window.cachedTeams.find(t => t.id === teamId);
    if (!team) return;
    const leaderName = window.currentUserProfile?.name || window.currentUser?.displayName || '';
    if (team.leader !== leaderName) {
        showToast('Only the team leader can remove members.', 'error');
        return;
    }
    try {
        const newMembers = team.members.filter(m => m !== memberName);
        await updateDocument('teams', teamId, { members: newMembers });
        team.members = newMembers;
        showToast(`${memberName} removed from team.`, 'info');
        closeModal();
        await renderTeams();
    } catch (e) {
        showToast('Failed to remove member.', 'error');
        console.error(e);
    }
}

// ─── Leaderboard ─────────────────────────────────────────────
let currentTab = 'weekly';

async function renderLeaderboard(tab = currentTab) {
    currentTab = tab;
    const grid = document.getElementById('leaderboardGrid');
    if (!grid) return;
    grid.innerHTML = '<p style="color:#aaa;">Loading leaderboard…</p>';

    try {
        const data = await fetchCollection('leaderboard', { orderBy: 'points', direction: 'desc' });
        grid.innerHTML = data.length ? data.map((player, index) => `
            <div class="leader-item fade-in ${index < 3 ? 'leader-top' : ''}">
                <div class="rank">#${index + 1}</div>
                <div style="flex:1;margin-left:1rem;">
                    <div style="font-weight:600;">${player.name} ${player.badge || ''}</div>
                    <div style="color:#aaa;font-size:.9rem;">${player.events} events</div>
                </div>
                <div style="text-align:right;">
                    <div style="font-size:1.5rem;font-weight:700;">${player.points}</div>
                    <div style="color:#aaa;font-size:.9rem;">pts</div>
                </div>
            </div>
        `).join('') : '<p style="color:#aaa;text-align:center;">No leaderboard data yet.</p>';
    } catch (e) {
        console.error('[Leaderboard] Load failed:', e);
        grid.innerHTML = '<p style="color:#ff4444;">Failed to load leaderboard.</p>';
    }
}

document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelector('.tab-btn.active')?.classList.remove('active');
        btn.classList.add('active');
        renderLeaderboard(btn.dataset.tab);
    });
});

// ─── Gemini AI Chatbot ──────────────────────────────────────
const GEMINI_API_KEY = window.APP_CONFIG?.geminiApiKey || '';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;
const chatHistory = [];

const SYSTEM_PROMPT = `You are CyberGuard AI, the intelligent assistant inside AI CyberHub — a community platform where AI and cybersecurity enthusiasts compete in CTFs, attend workshops, form teams, and climb the leaderboard.

Your personality: expert, concise, a little edgy/hacker-cool. Use relevant emojis sparingly. Format responses in short paragraphs or bullet points — never walls of text.

Your expertise covers: CTF challenges, penetration testing, AI security, prompt injection, adversarial ML, threat intelligence, OSINT, reverse engineering, malware analysis, and the AI CyberHub platform itself (events, teams, leaderboard, feed).

Keep responses under 150 words unless asked to elaborate.`;

function toggleAIChat() {
    const chat = document.getElementById('aiChat');
    const isOpen = chat.style.display === 'flex';
    chat.style.display = isOpen ? 'none' : 'flex';
    if (!isOpen && document.getElementById('aiMessages').innerHTML === '') {
        appendAIMessage('🤖 **CyberGuard AI online.** Ask me anything about cybersecurity, CTFs, AI security, or this platform.');
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
    document.getElementById('typingIndicator')?.remove();
}

async function sendAIMessage() {
    const input = document.getElementById('aiInput');
    const message = input.value.trim();
    if (!message) return;
    input.value = '';

    appendUserMessage(message);
    chatHistory.push({ role: 'user', parts: [{ text: message }] });
    showTypingIndicator();

    try {
        const body = {
            system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
            contents: chatHistory,
            generationConfig: { temperature: 0.8, maxOutputTokens: 300 }
        };

        const res = await fetch(GEMINI_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!res.ok) { const err = await res.json(); throw new Error(err?.error?.message || `HTTP ${res.status}`); }

        const data = await res.json();
        const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || '⚠️ No response received.';

        removeTypingIndicator();
        appendAIMessage(reply);
        chatHistory.push({ role: 'model', parts: [{ text: reply }] });
        if (chatHistory.length > 20) chatHistory.splice(0, 2);

    } catch (err) {
        removeTypingIndicator();
        appendAIMessage(`⚠️ Error: ${err.message}`);
        console.error('[CyberGuard AI]', err);
        chatHistory.pop();
    }
}

async function analyzeThreat() {
    const prompt = 'Give me a brief, real cybersecurity threat intelligence summary right now. Mention one specific active threat or CVE. Under 100 words.';
    appendUserMessage('🔍 Analyze current threat landscape');
    chatHistory.push({ role: 'user', parts: [{ text: prompt }] });
    showTypingIndicator();

    try {
        const body = {
            system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
            contents: chatHistory,
            generationConfig: { temperature: 0.7, maxOutputTokens: 200 }
        };
        const res = await fetch(GEMINI_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
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

document.getElementById('aiInput')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendAIMessage();
});

// ─── Background Music ────────────────────────────────────────
window.toggleMusic = function () {
    const audio = document.getElementById('bgMusic');
    const btn = document.getElementById('musicToggleBtn');
    if (!audio || !btn) return;

    // Playback at 30% volume
    audio.volume = 0.3;

    if (audio.paused) {
        audio.play().then(() => {
            btn.innerHTML = '<i class="fas fa-volume-up"></i>';
            btn.classList.add('playing');
        }).catch(err => {
            console.log('Audio playback blocked:', err);
            showToast('Click anywhere or toggle to enable music', 'info');
        });
    } else {
        audio.pause();
        btn.innerHTML = '<i class="fas fa-volume-mute"></i>';
        btn.classList.remove('playing');
    }
};
