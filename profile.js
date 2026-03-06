// ============================================================
//  profile.js — AI CyberHub
//  Profile rendering and full biodata editing for logged-in users
// ============================================================

function renderProfileSection() {
    const profileCard = document.getElementById('profileCard');
    if (!profileCard) return;

    if (!window.currentUser) {
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

    const p = window.currentUserProfile;
    const name = p?.name || window.currentUser.displayName || window.currentUser.email;
    const avatar = name.charAt(0).toUpperCase();
    const points = p?.points || 0;
    const bio = p?.bio || '';
    const phone = p?.phone || '';
    const college = p?.college || '';
    const role = p?.role || '';
    const github = p?.github || '';
    const linkedin = p?.linkedin || '';
    const skills = Array.isArray(p?.skills) ? p.skills : [];
    const eventsCount = p?.events?.length || 0;

    const skillsDisplay = skills.length
        ? skills.map(s => `<span class="skill-tag">${s}</span>`).join('')
        : '<span style="color:rgba(255,255,255,.3);font-style:italic;">No skills listed</span>';

    profileCard.innerHTML = `
        <!-- Profile Header -->
        <div class="profile-header-row">
            <div class="profile-avatar-big">${avatar}</div>
            <div class="profile-header-info">
                <h2 class="profile-name">${name}</h2>
                <p class="profile-email">${window.currentUser.email}</p>
                <span class="profile-points-badge">${points} pts</span>
            </div>
        </div>

        <!-- Quick Stats -->
        <div class="profile-stats-row">
            <div class="profile-stat">
                <span class="pstat-val">${eventsCount}</span>
                <span class="pstat-lbl"><i class="fas fa-flag"></i> Events</span>
            </div>
            <div class="profile-stat">
                <span class="pstat-val">${skills.length}</span>
                <span class="pstat-lbl"><i class="fas fa-code"></i> Skills</span>
            </div>
            <div class="profile-stat">
                <span class="pstat-val">${points}</span>
                <span class="pstat-lbl"><i class="fas fa-star"></i> Points</span>
            </div>
        </div>

        <!-- Biodata Section -->
        <div class="profile-section-card">
            <div class="section-card-header">
                <strong class="section-card-title" style="color:var(--cyber-blue);">
                    <i class="fas fa-id-card"></i> Biodata
                </strong>
                <button class="bio-edit-btn" id="biodataEditBtn" onclick="toggleBiodataEditor()">
                    <i class="fas fa-pen"></i> Edit
                </button>
            </div>

            <!-- Display View -->
            <div id="biodataDisplay" class="biodata-display-grid">
                ${biodataDisplayRow('fas fa-user', 'Name', name)}
                ${biodataDisplayRow('fas fa-phone', 'Phone', phone || 'Not set')}
                ${biodataDisplayRow('fas fa-building', 'College / Org', college || 'Not set')}
                ${biodataDisplayRow('fas fa-graduation-cap', 'Year / Role', role || 'Not set')}
            </div>

            <!-- Edit Form (hidden) -->
            <div id="biodataEditor" style="display:none;margin-top:.75rem;">
                ${biodataField('fas fa-user', 'bioNameInput', 'Full Name', name)}
                ${biodataField('fas fa-phone', 'bioPhoneInput', 'Mobile Number (+91)', phone.replace('+91', ''))}
                ${biodataField('fas fa-building', 'bioCollegeInput', 'College / Organisation', college)}
                ${biodataField('fas fa-graduation-cap', 'bioRoleInput', 'Year / Role (e.g. 3rd Year, Security Analyst)', role)}
                <button class="bio-save-btn" onclick="saveBiodata()">
                    <i class="fas fa-save"></i> Save Biodata
                </button>
                <p class="bio-status" id="biodataStatus" style="display:none;">
                    <i class="fas fa-check-circle"></i> Saved!
                </p>
            </div>
        </div>

        <!-- Bio Section -->
        <div class="profile-section-card">
            <div class="section-card-header">
                <strong class="section-card-title" style="color:var(--cyber-blue);">
                    <i class="fas fa-terminal"></i> Bio
                </strong>
                <button class="bio-edit-btn" id="bioEditBtn" onclick="toggleBioEditor()">
                    <i class="fas fa-pen"></i> Edit
                </button>
            </div>
            <p id="bioDisplay" style="color:#ccc;margin:0;font-size:.95rem;line-height:1.6;">
                ${bio || '<span style="color:rgba(255,255,255,.3);font-style:italic;">No bio yet — tell the community about yourself!</span>'}
            </p>
            <div class="bio-editor" id="bioEditor" style="display:none;">
                <div class="cyber-input-group textarea-group">
                    <i class="fas fa-pen-nib cyber-input-icon"></i>
                    <textarea class="cyber-input cyber-textarea" id="bioTextarea" placeholder=" " rows="4">${bio}</textarea>
                    <label class="cyber-input-label">Write your bio…</label>
                </div>
                <button class="bio-save-btn" onclick="saveBio()">
                    <i class="fas fa-save"></i> Save Bio
                </button>
                <p class="bio-status" id="bioStatus" style="display:none;">
                    <i class="fas fa-check-circle"></i> Bio saved!
                </p>
            </div>
        </div>

        <!-- Skills Section -->
        <div class="profile-section-card">
            <div class="section-card-header">
                <strong class="section-card-title" style="color:var(--cyber-purple);">
                    <i class="fas fa-code"></i> Skills
                </strong>
                <button class="bio-edit-btn" onclick="toggleSkillsEditor()" id="skillsEditBtn">
                    <i class="fas fa-pen"></i> Edit
                </button>
            </div>
            <div id="skillsDisplay">${skillsDisplay}</div>
            <div id="skillsEditor" style="display:none;margin-top:.75rem;">
                <input id="skillsInput" type="text" value="${skills.join(', ')}"
                    placeholder="python, ctf, malware analysis…"
                    style="width:100%;padding:.7rem .9rem;background:rgba(123,44,191,.08);border:1px solid rgba(123,44,191,.3);border-radius:8px;color:#fff;font-family:'Rajdhani',sans-serif;font-size:.9rem;">
                <p style="color:rgba(255,255,255,.3);font-size:.75rem;margin:.3rem 0;">Comma-separated</p>
                <button class="bio-save-btn" onclick="saveSkills()" style="margin-top:.4rem;">
                    <i class="fas fa-save"></i> Save Skills
                </button>
            </div>
        </div>

        <!-- Social Links -->
        <div class="profile-section-card">
            <div class="section-card-header">
                <strong class="section-card-title" style="color:var(--cyber-blue);">
                    <i class="fas fa-link"></i> Social Links
                </strong>
                <button class="bio-edit-btn" onclick="toggleSocialEditor()" id="socialEditBtn">
                    <i class="fas fa-pen"></i> Edit
                </button>
            </div>
            <div id="socialDisplay">
                ${github ? `<a href="${github}"   target="_blank" rel="noopener" class="social-link-chip"><i class="fab fa-github"></i> GitHub</a>` : ''}
                ${linkedin ? `<a href="${linkedin}" target="_blank" rel="noopener" class="social-link-chip linkedin"><i class="fab fa-linkedin"></i> LinkedIn</a>` : ''}
                ${!github && !linkedin ? '<span style="color:rgba(255,255,255,.3);font-style:italic;font-size:.9rem;">No links added</span>' : ''}
            </div>
            <div id="socialEditor" style="display:none;margin-top:.75rem;">
                <div style="display:flex;flex-direction:column;gap:.5rem;">
                    <input id="githubInput" type="url" value="${github}" placeholder="https://github.com/username"
                        style="padding:.6rem .9rem;background:rgba(0,212,255,.06);border:1px solid rgba(0,212,255,.25);border-radius:8px;color:#fff;font-family:'Rajdhani',sans-serif;font-size:.9rem;">
                    <input id="linkedinInput" type="url" value="${linkedin}" placeholder="https://linkedin.com/in/username"
                        style="padding:.6rem .9rem;background:rgba(0,212,255,.06);border:1px solid rgba(0,212,255,.25);border-radius:8px;color:#fff;font-family:'Rajdhani',sans-serif;font-size:.9rem;">
                    <button class="bio-save-btn" onclick="saveSocialLinks()">
                        <i class="fas fa-save"></i> Save Links
                    </button>
                </div>
            </div>
        </div>

        <button class="btn-logout" onclick="logout()" style="margin-top:1rem;width:100%;">
            <i class="fas fa-power-off"></i>
            <span>Sign Out</span>
        </button>
    `;

    // Mark textarea filled if already has content
    const ta = document.getElementById('bioTextarea');
    if (ta && ta.value) ta.classList.add('has-value');
}

// ─── Biodata Helper Templates ────────────────────────────────
function biodataDisplayRow(icon, label, value) {
    return `
        <div class="biodata-row">
            <span class="biodata-label"><i class="${icon}"></i> ${label}</span>
            <span class="biodata-value">${value}</span>
        </div>`;
}

function biodataField(icon, id, label, value) {
    return `
        <div class="cyber-input-group" style="margin-bottom:.6rem;">
            <i class="${icon} cyber-input-icon"></i>
            <input class="cyber-input ${value ? 'has-value' : ''}" type="text" id="${id}"
                value="${value}" placeholder=" ">
            <label class="cyber-input-label">${label}</label>
        </div>`;
}

// ─── Toggle Editors ──────────────────────────────────────────
function toggleBiodataEditor() {
    const editor = document.getElementById('biodataEditor');
    const btn = document.getElementById('biodataEditBtn');
    const isOpen = editor.style.display !== 'none';
    editor.style.display = isOpen ? 'none' : 'block';
    btn.innerHTML = isOpen ? '<i class="fas fa-pen"></i> Edit' : '<i class="fas fa-times"></i> Cancel';
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

function toggleSocialEditor() {
    const editor = document.getElementById('socialEditor');
    const btn = document.getElementById('socialEditBtn');
    if (!editor) return;
    const isOpen = editor.style.display !== 'none';
    editor.style.display = isOpen ? 'none' : 'block';
    if (btn) btn.innerHTML = isOpen ? '<i class="fas fa-pen"></i> Edit' : '<i class="fas fa-times"></i> Cancel';
}

function toggleSkillsEditor() {
    const editor = document.getElementById('skillsEditor');
    const btn = document.getElementById('skillsEditBtn');
    if (!editor) return;
    const isOpen = editor.style.display !== 'none';
    editor.style.display = isOpen ? 'none' : 'block';
    if (btn) btn.innerHTML = isOpen ? '<i class="fas fa-pen"></i> Edit' : '<i class="fas fa-times"></i> Cancel';
}

// ─── Save Handlers ───────────────────────────────────────────
async function saveBiodata() {
    if (!window.currentUser) return;
    const newName = document.getElementById('bioNameInput')?.value.trim() || '';
    const rawPhone = document.getElementById('bioPhoneInput')?.value.trim() || '';
    const newCollege = document.getElementById('bioCollegeInput')?.value.trim() || '';
    const newRole = document.getElementById('bioRoleInput')?.value.trim() || '';
    const phone = rawPhone ? '+91' + rawPhone.replace(/^\+91/, '') : '';

    try {
        await updateDocument('users', window.currentUser.uid, {
            name: newName, phone, college: newCollege, role: newRole
        });
        if (window.currentUserProfile) {
            Object.assign(window.currentUserProfile, { name: newName, phone, college: newCollege, role: newRole });
        }
        showToast('Biodata saved! ✓', 'success');
        renderProfileSection();
    } catch (err) {
        showToast('Failed to save biodata.', 'error');
        console.error(err);
    }
}

async function saveBio() {
    if (!window.currentUser) return;
    const ta = document.getElementById('bioTextarea');
    const newBio = ta?.value.trim() || '';
    const saveBtn = document.querySelector('#bioEditor .bio-save-btn');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Saving…'; }

    try {
        await updateDocument('users', window.currentUser.uid, { bio: newBio });
        if (window.currentUserProfile) window.currentUserProfile.bio = newBio;
        const bioDisplay = document.getElementById('bioDisplay');
        if (bioDisplay) {
            bioDisplay.innerHTML = newBio
                || '<span style="color:rgba(255,255,255,0.3);font-style:italic;">No bio yet — tell the community about yourself!</span>';
        }
        showToast('Bio saved! ✓', 'success');
        toggleBioEditor();
    } catch (err) {
        showToast('Failed to save bio.', 'error');
        console.error(err);
    } finally {
        if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fas fa-save"></i> Save Bio'; }
    }
}

async function saveSocialLinks() {
    if (!window.currentUser) return;
    const github = document.getElementById('githubInput')?.value.trim() || '';
    const linkedin = document.getElementById('linkedinInput')?.value.trim() || '';
    try {
        await updateDocument('users', window.currentUser.uid, { github, linkedin });
        if (window.currentUserProfile) { window.currentUserProfile.github = github; window.currentUserProfile.linkedin = linkedin; }
        showToast('Social links saved! ✓', 'success');
        renderProfileSection();
    } catch (err) {
        showToast('Failed to save links.', 'error');
        console.error(err);
    }
}

async function saveSkills() {
    if (!window.currentUser) return;
    const raw = document.getElementById('skillsInput')?.value || '';
    const skills = raw.split(',').map(s => s.trim()).filter(Boolean);
    try {
        await updateDocument('users', window.currentUser.uid, { skills });
        if (window.currentUserProfile) window.currentUserProfile.skills = skills;
        showToast('Skills updated! ✓', 'success');
        renderProfileSection();
    } catch (err) {
        showToast('Failed to save skills.', 'error');
        console.error(err);
    }
}

// ─── Expose ──────────────────────────────────────────────────
window.renderProfileSection = renderProfileSection;
window.toggleBiodataEditor = toggleBiodataEditor;
window.toggleBioEditor = toggleBioEditor;
window.toggleSocialEditor = toggleSocialEditor;
window.toggleSkillsEditor = toggleSkillsEditor;
window.saveBiodata = saveBiodata;
window.saveBio = saveBio;
window.saveSocialLinks = saveSocialLinks;
window.saveSkills = saveSkills;
