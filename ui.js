// ============================================================
//  ui.js — AI CyberHub
//  Shared UI helpers: toast, modal, particles, animations, navbar
// ============================================================

// ─── App State (shared) ──────────────────────────────────────
window.currentUser = null;
window.currentUserProfile = null;
window.cachedEvents = [];
window.cachedTeams = [];
window.cachedPosts = [];

// ─── Toast Notification ──────────────────────────────────────
function showToast(message, type = 'info', duration = 3500) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('toast-out');
        setTimeout(() => toast.remove(), 350);
    }, duration);
}

// ─── Modal Helpers ───────────────────────────────────────────
function closeModal() {
    document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
}

window.onclick = function (event) {
    document.querySelectorAll('.modal').forEach(modal => {
        if (event.target === modal) closeModal();
    });
};

function scrollTo(sectionId) {
    const el = document.getElementById(sectionId);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
}

// ─── Navbar ──────────────────────────────────────────────────
function initNavbar() {
    const navbar = document.getElementById('navbar');
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            scrollTo(link.getAttribute('href').substring(1));
            const navMenu = document.getElementById('navMenu');
            const hamburger = document.getElementById('hamburger');
            if (navMenu) navMenu.classList.remove('open');
            if (hamburger) hamburger.classList.remove('open');
        });
    });

    window.addEventListener('scroll', () => {
        if (navbar) navbar.style.background = window.scrollY > 100
            ? 'rgba(10,10,10,0.97)'
            : 'rgba(10,10,10,0.8)';
    });
}

function toggleMobileNav() {
    const navMenu = document.getElementById('navMenu');
    const hamburger = document.getElementById('hamburger');
    if (navMenu) navMenu.classList.toggle('open');
    if (hamburger) hamburger.classList.toggle('open');
}

// ─── Auth Navbar Chip ────────────────────────────────────────
function updateNavbarAuth() {
    const navAuth = document.getElementById('navAuth');
    if (!navAuth) return;

    const u = window.currentUser;
    const p = window.currentUserProfile;
    const isAdmin = u && (window.APP_CONFIG?.adminEmails || []).includes(u.email);

    if (u) {
        const displayName = (p?.name || u.displayName || u.email).split(' ')[0];
        const initial = displayName.charAt(0).toUpperCase();
        navAuth.innerHTML = `
            ${isAdmin ? `<a href="admin.html" class="btn-admin-link" title="Admin Panel"><i class="fas fa-shield-halved"></i> Admin</a>` : ''}
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

// ─── Particle Canvas ─────────────────────────────────────────
function initParticles() {
    const canvas = document.getElementById('particleCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    function resize() {
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    const NUM = 80;
    const particles = Array.from({ length: NUM }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        r: Math.random() * 2 + 0.5,
        color: Math.random() > 0.5 ? '#00d4ff' : '#00ff88'
    }));

    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (let i = 0; i < particles.length; i++) {
            for (let j = i + 1; j < particles.length; j++) {
                const dx = particles[i].x - particles[j].x;
                const dy = particles[i].y - particles[j].y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 120) {
                    ctx.beginPath();
                    ctx.moveTo(particles[i].x, particles[i].y);
                    ctx.lineTo(particles[j].x, particles[j].y);
                    ctx.strokeStyle = `rgba(0,212,255,${0.15 * (1 - dist / 120)})`;
                    ctx.lineWidth = 0.5;
                    ctx.stroke();
                }
            }
        }
        particles.forEach(p => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.shadowBlur = 6;
            ctx.shadowColor = p.color;
            ctx.fill();
            ctx.shadowBlur = 0;
            p.x += p.vx;
            p.y += p.vy;
            if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
            if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
        });
        requestAnimationFrame(draw);
    }
    draw();
}

// ─── Animated Hero Stats ─────────────────────────────────────
function animateStats() {
    const statEls = document.querySelectorAll('.stat-number');
    if (!statEls.length) return;

    const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            const el = entry.target;
            const target = parseInt(el.dataset.target, 10);
            const suffix = el.dataset.suffix || '';
            let start = 0;
            const duration = 1800;
            const step = timestamp => {
                if (!start) start = timestamp;
                const progress = Math.min((timestamp - start) / duration, 1);
                const eased = 1 - Math.pow(1 - progress, 3);
                el.textContent = Math.floor(eased * target) + suffix;
                if (progress < 1) requestAnimationFrame(step);
            };
            requestAnimationFrame(step);
            observer.unobserve(el);
        });
    }, { threshold: 0.5 });

    statEls.forEach(el => observer.observe(el));
}

// ─── Scroll Fade Animations ───────────────────────────────────
function initScrollAnimations() {
    const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (entry.isIntersecting) entry.target.classList.add('visible');
        });
    });
    document.querySelectorAll('.fade-in').forEach(el => observer.observe(el));
}

// ─── Post Time Formatter ─────────────────────────────────────
function formatPostTime(createdAt) {
    if (!createdAt) return 'Just now';
    const date = createdAt.toDate ? createdAt.toDate() : new Date(createdAt);
    const diffMs = Date.now() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHrs = Math.floor(diffMin / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    return `${Math.floor(diffHrs / 24)}d ago`;
}

// ─── Countdown Timer Utility ─────────────────────────────────
/**
 * Returns a human-readable countdown string or status label.
 * @param {string} isoString — ISO date string
 * @param {'from'|'to'} direction — 'to' = time until that moment; 'from' = elapsed
 */
function countdownLabel(isoString) {
    if (!isoString) return '';
    const target = new Date(isoString).getTime();
    const now = Date.now();
    const diff = target - now;
    if (diff <= 0) return null; // already passed

    const totalSec = Math.floor(diff / 1000);
    const d = Math.floor(totalSec / 86400);
    const h = Math.floor((totalSec % 86400) / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;

    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m ${s.toString().padStart(2, '0')}s`;
    return `${m}m ${s.toString().padStart(2, '0')}s`;
}

// ─── Expose ──────────────────────────────────────────────────
window.showToast = showToast;
window.closeModal = closeModal;
window.scrollTo = scrollTo;
window.initNavbar = initNavbar;
window.toggleMobileNav = toggleMobileNav;
window.updateNavbarAuth = updateNavbarAuth;
window.initParticles = initParticles;
window.animateStats = animateStats;
window.initScrollAnimations = initScrollAnimations;
window.formatPostTime = formatPostTime;
window.countdownLabel = countdownLabel;
