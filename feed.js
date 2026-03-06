// ============================================================
//  feed.js — AI CyberHub
//  Community feed: posts, likes, comments
// ============================================================

// ─── Render Feed ─────────────────────────────────────────────
async function renderFeed() {
    const container = document.getElementById('feedPosts');
    if (!container) return;
    container.innerHTML = '<p style="color:#aaa;">Loading feed…</p>';

    try {
        window.cachedPosts = await fetchCollection('posts', { orderBy: 'createdAt', direction: 'desc' });
        if (!window.cachedPosts.length) {
            container.innerHTML = '<p style="color:#aaa;text-align:center;padding:2rem;">No posts yet. Be the first to post!</p>';
            return;
        }

        container.innerHTML = window.cachedPosts.map(post => {
            const timeStr = formatPostTime(post.createdAt);
            const uid = window.currentUser?.uid || null;
            const likedBy = Array.isArray(post.likedBy) ? post.likedBy : [];
            const hasLiked = uid && likedBy.includes(uid);
            const commentCount = post.comments || 0;
            const authorInit = post.user ? post.user.charAt(0).toUpperCase() : '?';

            return `
            <div class="post-card fade-in" id="post-${post.id}">
                <div class="post-header">
                    <div class="post-avatar">${authorInit}</div>
                    <div>
                        <strong class="post-author">${post.user}</strong>
                        <span class="post-time">${timeStr}</span>
                    </div>
                </div>
                <p class="post-content">${post.content}</p>
                <div class="post-actions">
                    <button class="like-btn ${hasLiked ? 'liked' : ''}" id="like-btn-${post.id}"
                        onclick="likePost('${post.id}')"
                        title="${hasLiked ? 'Already liked' : 'Like'}">
                        <i class="${hasLiked ? 'fas' : 'far'} fa-heart"></i>
                        <span id="like-count-${post.id}">${post.likes || 0}</span>
                    </button>
                    <button class="comment-toggle-btn" id="comment-btn-${post.id}"
                        onclick="toggleComments('${post.id}')">
                        <i class="fas fa-comment-dots"></i>
                        <span id="comment-count-${post.id}">${commentCount}</span>
                    </button>
                </div>
                <div class="comment-panel" id="comment-panel-${post.id}" style="display:none;">
                    <div class="comment-list" id="comment-list-${post.id}">
                        <div class="comment-loading"><i class="fas fa-circle-notch fa-spin"></i> Loading…</div>
                    </div>
                    <div class="comment-input-row">
                        <div class="comment-avatar">${uid ? (window.currentUser?.displayName || window.currentUser?.email || '?').charAt(0).toUpperCase() : '?'}</div>
                        <div class="cyber-input-group" style="flex:1;margin:0;">
                            <input class="cyber-input comment-input" type="text"
                                id="comment-input-${post.id}" placeholder=" "
                                onkeydown="if(event.key==='Enter') submitComment('${post.id}')">
                            <label class="cyber-input-label">Add a comment…</label>
                        </div>
                        <button class="comment-send-btn" onclick="submitComment('${post.id}')">
                            <i class="fas fa-paper-plane"></i>
                        </button>
                    </div>
                </div>
            </div>`;
        }).join('');

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

// ─── Toggle / Load Comments ──────────────────────────────────
async function toggleComments(postId) {
    const panel = document.getElementById(`comment-panel-${postId}`);
    const btn = document.getElementById(`comment-btn-${postId}`);
    const isOpen = panel.style.display !== 'none';

    if (isOpen) {
        panel.style.display = 'none';
        btn?.classList.remove('active');
        return;
    }
    panel.style.display = 'block';
    btn?.classList.add('active');
    await loadComments(postId);
}

async function loadComments(postId) {
    const list = document.getElementById(`comment-list-${postId}`);
    if (!list) return;
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
    if (!window.currentUser) {
        showToast('Please login to comment.', 'error');
        showAuthModal('login');
        return;
    }

    const input = document.getElementById(`comment-input-${postId}`);
    const text = input?.value.trim() || '';
    if (!text) return;

    const sendBtn = input?.closest('.comment-input-row')?.querySelector('.comment-send-btn');
    input.value = '';
    if (sendBtn) sendBtn.disabled = true;

    const userName = window.currentUserProfile?.name || window.currentUser.displayName || window.currentUser.email;

    try {
        await window.firebaseDb.collection('posts').doc(postId)
            .collection('comments').add({
                user: userName,
                text,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

        await window.firebaseDb.collection('posts').doc(postId).update({
            comments: firebase.firestore.FieldValue.increment(1)
        });

        const countEl = document.getElementById(`comment-count-${postId}`);
        if (countEl) countEl.textContent = parseInt(countEl.textContent || '0') + 1;

        const cached = window.cachedPosts.find(p => p.id === postId);
        if (cached) cached.comments = (cached.comments || 0) + 1;

        await loadComments(postId);
    } catch (err) {
        console.error('[Comments] Submit failed:', err);
        showToast('Failed to post comment.', 'error');
    } finally {
        if (sendBtn) sendBtn.disabled = false;
    }
}

// ─── Like Post ───────────────────────────────────────────────
async function likePost(postId) {
    if (!window.currentUser) {
        showToast('Please login to like posts.', 'error');
        showAuthModal('login');
        return;
    }

    const uid = window.currentUser.uid;
    const btn = document.getElementById(`like-btn-${postId}`);
    const countEl = document.getElementById(`like-count-${postId}`);
    const cachedPost = window.cachedPosts.find(p => p.id === postId);
    const likedBy = Array.isArray(cachedPost?.likedBy) ? cachedPost.likedBy : [];

    if (likedBy.includes(uid)) {
        btn?.classList.add('like-btn-pulse');
        setTimeout(() => btn?.classList.remove('like-btn-pulse'), 600);
        return;
    }

    // Optimistic update
    if (btn) { btn.classList.add('liked'); btn.querySelector('i').className = 'fas fa-heart'; }
    if (countEl) countEl.textContent = parseInt(countEl.textContent) + 1;
    if (cachedPost) cachedPost.likedBy = [...likedBy, uid];

    try {
        await window.firebaseDb.collection('posts').doc(postId).update({
            likes: firebase.firestore.FieldValue.increment(1),
            likedBy: firebase.firestore.FieldValue.arrayUnion(uid)
        });
    } catch (e) {
        console.error('[Feed] Like failed:', e);
        if (btn) { btn.classList.remove('liked'); btn.querySelector('i').className = 'far fa-heart'; }
        if (countEl) countEl.textContent = parseInt(countEl.textContent) - 1;
        if (cachedPost) cachedPost.likedBy = likedBy;
    }
}

// ─── New Post Modal ──────────────────────────────────────────
function showNewPostModal() {
    if (!window.currentUser) {
        showToast('Please login to post', 'error');
        showAuthModal('login');
        return;
    }

    document.getElementById('teamContent').innerHTML = `
        <h2>New Post</h2>
        <form id="newPostForm">
            <div class="cyber-input-group textarea-group">
                <i class="fas fa-pencil cyber-input-icon"></i>
                <textarea class="cyber-input cyber-textarea" id="postContent" placeholder=" " rows="5" required></textarea>
                <label class="cyber-input-label">Share something with the community…</label>
            </div>
            <button type="submit" class="btn-primary" id="newPostBtn" style="margin-top:1rem;width:100%;">
                <i class="fas fa-paper-plane"></i> Post
            </button>
            <p id="postErr" style="color:#ff4444;margin-top:.5rem;display:none;"></p>
        </form>
    `;

    document.getElementById('newPostForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('newPostBtn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Posting…';
        const content = document.getElementById('postContent').value.trim();
        const userName = window.currentUserProfile?.name || window.currentUser.displayName || window.currentUser.email;

        try {
            await addDocument('posts', { user: userName, content, likes: 0, comments: 0 });
            closeModal();
            await renderFeed();
        } catch (err) {
            document.getElementById('postErr').textContent = 'Failed to post. Try again.';
            document.getElementById('postErr').style.display = 'block';
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-paper-plane"></i> Post';
            console.error(err);
        }
    });

    document.getElementById('teamModal').style.display = 'flex';
}

// ─── Expose ──────────────────────────────────────────────────
window.renderFeed = renderFeed;
window.toggleComments = toggleComments;
window.submitComment = submitComment;
window.likePost = likePost;
window.showNewPostModal = showNewPostModal;
