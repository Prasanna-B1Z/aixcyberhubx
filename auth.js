// ============================================================
//  auth.js — AI CyberHub
//  Auth modal, login/signup flow, OTP event-registration flow
// ============================================================

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
                showToast(`Welcome ${name.split(' ')[0]}! 🎉`, 'success');
            }
            closeModal();
        } catch (err) {
            console.error('[Auth] Error:', err.code, err.message);
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
        'auth/operation-not-allowed': '❌ Email/Password sign-in not enabled in Firebase Console.',
        'auth/network-request-failed': 'Network error. Check your internet connection.',
        'auth/too-many-requests': 'Too many attempts. Please wait and try again.',
        'auth/internal-error': 'Firebase internal error. Check the browser console.',
        'auth/configuration-not-found': '❌ Firebase Auth not configured.',
        'auth/admin-restricted-operation': '❌ Sign-up is restricted. Enable Email/Password in Firebase Console.',
    };
    return map[code] || `Error (${code || 'unknown'}): ${message || 'Please try again.'}`;
}

function switchAuth(type) {
    showAuthModal(type);
}

async function logout() {
    try {
        await signOutUser();
    } catch (e) {
        console.error('[Auth] Logout failed:', e);
    }
    closeModal();
}

// ─── OTP Event Registration Flow ─────────────────────────────
// Stores pending event id while user completes OTP verification
let _pendingEventId = null;

/**
 * Step 1: Show phone number input modal.
 */
function showPhoneOTPModal(eventId) {
    _pendingEventId = eventId;
    const contentEl = document.getElementById('otpContent');
    if (!contentEl) return;

    contentEl.innerHTML = `
        <div class="auth-modal-header">
            <h2><i class="fas fa-mobile-screen-button"></i> Verify Your Number</h2>
            <p>A 6-digit OTP will be sent to your mobile number to confirm event registration.</p>
        </div>
        <form id="phoneForm" autocomplete="off">
            <div class="cyber-input-group">
                <i class="fas fa-phone cyber-input-icon"></i>
                <input class="cyber-input" type="tel" id="phoneInput"
                    placeholder=" " maxlength="10" pattern="[6-9][0-9]{9}" required>
                <label class="cyber-input-label">Mobile Number (10 digits)</label>
            </div>
            <p style="color:rgba(255,255,255,.35);font-size:.78rem;margin:-0.5rem 0 .75rem;">India (+91) only — 10 digits, no country code.</p>
            <button type="submit" class="btn-primary" style="width:100%;" id="sendOtpBtn">
                <i class="fas fa-paper-plane"></i> Send OTP
            </button>
            <p id="phoneErr" class="auth-error"></p>
        </form>
    `;

    document.getElementById('phoneForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('sendOtpBtn');
        const errEl = document.getElementById('phoneErr');
        const rawPhone = document.getElementById('phoneInput').value.trim();

        if (!/^[6-9]\d{9}$/.test(rawPhone)) {
            errEl.textContent = 'Enter a valid 10-digit Indian mobile number.';
            errEl.style.display = 'block';
            return;
        }

        btn.disabled = true;
        btn.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i> Sending…`;

        const otp = String(Math.floor(100000 + Math.random() * 900000));
        const phone = '+91' + rawPhone;

        try {
            await saveOTP(window.currentUser.uid, otp, phone);
            // Simulate SMS — in production, call a Cloud Function / Twilio here
            console.log(`[OTP] SMS → ${phone} : ${otp}`);
            showToast(`📱 OTP sent to ${phone} — <strong>${otp}</strong><br><small>(Simulated — no real SMS)</small>`, 'info', 8000);
            showOTPEntryStep(phone);
        } catch (err) {
            errEl.textContent = 'Failed to send OTP. Please try again.';
            errEl.style.display = 'block';
            btn.disabled = false;
            btn.innerHTML = `<i class="fas fa-paper-plane"></i> Send OTP`;
            console.error('[OTP] Error:', err);
        }
    });

    document.getElementById('otpModal').style.display = 'flex';
}

/**
 * Step 2: Show OTP entry form.
 */
function showOTPEntryStep(phone) {
    const contentEl = document.getElementById('otpContent');
    contentEl.innerHTML = `
        <div class="auth-modal-header">
            <h2><i class="fas fa-key"></i> Enter OTP</h2>
            <p>Enter the 6-digit code sent to <strong>${phone}</strong>.<br>
               <span style="color:rgba(255,255,255,.4);font-size:.8rem;">Valid for 10 minutes.</span>
            </p>
        </div>
        <form id="otpForm" autocomplete="off">
            <div class="otp-input-row">
                ${[0, 1, 2, 3, 4, 5].map(i => `
                    <input class="otp-digit" type="text" maxlength="1" id="otp${i}"
                        pattern="[0-9]" inputmode="numeric"
                        oninput="otpFocus(this, ${i})"
                        onkeydown="otpBack(event, ${i})">
                `).join('')}
            </div>
            <button type="submit" class="btn-primary" style="width:100%;margin-top:1rem;" id="verifyOtpBtn">
                <i class="fas fa-check-circle"></i> Verify & Register
            </button>
            <p id="otpErr" class="auth-error"></p>
            <div style="text-align:center;margin-top:.75rem;">
                <a href="#" onclick="showPhoneOTPModal('${_pendingEventId}')" style="color:var(--cyber-blue);font-size:.85rem;">
                    <i class="fas fa-redo"></i> Resend OTP
                </a>
            </div>
        </form>
    `;

    // Auto-focus first box
    setTimeout(() => document.getElementById('otp0')?.focus(), 100);

    document.getElementById('otpForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('verifyOtpBtn');
        const errEl = document.getElementById('otpErr');
        const entered = [0, 1, 2, 3, 4, 5].map(i => document.getElementById(`otp${i}`)?.value || '').join('');

        if (entered.length < 6) {
            errEl.textContent = 'Please enter all 6 digits.';
            errEl.style.display = 'block';
            return;
        }

        btn.disabled = true;
        btn.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i> Verifying…`;

        try {
            const result = await verifyOTPCode(window.currentUser.uid, entered);
            if (!result.success) {
                errEl.textContent = result.reason;
                errEl.style.display = 'block';
                btn.disabled = false;
                btn.innerHTML = `<i class="fas fa-check-circle"></i> Verify & Register`;
                return;
            }

            // Save phone to user profile
            await updateDocument('users', window.currentUser.uid, {
                phone: result.phone,
                events: firebase.firestore.FieldValue.arrayUnion(_pendingEventId)
            });
            // Increment registration count on the event
            await updateDocument('events', _pendingEventId, {
                registrations: firebase.firestore.FieldValue.increment(1)
            });

            // Update cache
            if (window.currentUserProfile) {
                window.currentUserProfile.phone = result.phone;
                window.currentUserProfile.events = [...(window.currentUserProfile.events || []), _pendingEventId];
            }
            const evCache = window.cachedEvents?.find(ev => ev.id === _pendingEventId);
            if (evCache) evCache.registrations = (evCache.registrations || 0) + 1;

            closeModal();
            showToast('🎉 Registered successfully! SMS verified.', 'success');
            _pendingEventId = null;
        } catch (err) {
            errEl.textContent = 'Verification failed. Please try again.';
            errEl.style.display = 'block';
            btn.disabled = false;
            btn.innerHTML = `<i class="fas fa-check-circle"></i> Verify & Register`;
            console.error('[OTP] Verify error:', err);
        }
    });
}

// OTP digit auto-focus helpers
function otpFocus(input, idx) {
    input.value = input.value.replace(/\D/g, '');
    if (input.value && idx < 5) {
        document.getElementById(`otp${idx + 1}`)?.focus();
    }
}
function otpBack(e, idx) {
    if (e.key === 'Backspace' && !e.target.value && idx > 0) {
        document.getElementById(`otp${idx - 1}`)?.focus();
    }
}

// ─── Expose ──────────────────────────────────────────────────
window.showAuthModal = showAuthModal;
window.switchAuth = switchAuth;
window.logout = logout;
window.showPhoneOTPModal = showPhoneOTPModal;
window.otpFocus = otpFocus;
window.otpBack = otpBack;
