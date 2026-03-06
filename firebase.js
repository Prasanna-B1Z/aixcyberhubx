// ============================================================
//  firebase.js — AI CyberHub
//  Initialises Firebase and exports Auth / Firestore helpers
//  Keys are loaded from config.js (gitignored — never committed)
// ============================================================

// config.js must be loaded before this script in index.html
const firebaseConfig = window.APP_CONFIG?.firebase;

// Initialise the Firebase app (compat SDK loaded via CDN in index.html)
firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();

// ─── Auth Helpers ────────────────────────────────────────────

/**
 * Sign up a new user then create a Firestore profile document.
 */
async function signUp(email, password, name) {
    const cred = await auth.createUserWithEmailAndPassword(email, password);
    await cred.user.updateProfile({ displayName: name });

    try {
        await db.collection('users').doc(cred.user.uid).set({
            name,
            email,
            joined: firebase.firestore.FieldValue.serverTimestamp(),
            points: 0,
            events: [],
            bio: '',
            skills: [],
            avatar: name.charAt(0).toUpperCase(),
            phone: '',
            college: '',
            role: '',
            github: '',
            linkedin: '',
            readNotifications: []
        });
    } catch (firestoreErr) {
        console.warn('[signUp] Firestore profile write failed:', firestoreErr.code);
    }

    return cred;
}

/**
 * Sign in an existing user.
 */
async function signIn(email, password) {
    return auth.signInWithEmailAndPassword(email, password);
}

/**
 * Sign out the current user.
 */
async function signOutUser() {
    return auth.signOut();
}

/**
 * Subscribe to auth state changes.
 */
function onAuthChange(callback) {
    auth.onAuthStateChanged(callback);
}

// ─── Firestore Helpers ───────────────────────────────────────

/**
 * Fetch all documents from a Firestore collection.
 */
async function fetchCollection(collectionName, options = {}) {
    let ref = db.collection(collectionName);
    if (options.orderBy) {
        ref = ref.orderBy(options.orderBy, options.direction || 'asc');
    }
    const snap = await ref.get();
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Add a new document to a collection.
 */
async function addDocument(collectionName, data) {
    return db.collection(collectionName).add({
        ...data,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
}

/**
 * Set (overwrite) a document with a specific ID.
 */
async function setDocument(collectionName, docId, data) {
    return db.collection(collectionName).doc(docId).set(data);
}

/**
 * Update specific fields in a document.
 */
async function updateDocument(collectionName, docId, data) {
    return db.collection(collectionName).doc(docId).update(data);
}

/**
 * Atomically increment a numeric field in a document.
 */
async function incrementField(collectionName, docId, field, amount = 1) {
    return db.collection(collectionName).doc(docId).update({
        [field]: firebase.firestore.FieldValue.increment(amount)
    });
}

/**
 * Fetch a single document by id.
 */
async function getDocument(collectionName, docId) {
    const snap = await db.collection(collectionName).doc(docId).get();
    return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

/**
 * Delete a document by id.
 */
async function deleteDocument(collectionName, docId) {
    return db.collection(collectionName).doc(docId).delete();
}

/**
 * Real-time listener for a collection, ordered by a field.
 * Returns an unsubscribe function.
 */
function listenCollection(collectionName, options = {}, callback) {
    let ref = db.collection(collectionName);
    if (options.orderBy) {
        ref = ref.orderBy(options.orderBy, options.direction || 'asc');
    }
    if (options.limit) {
        ref = ref.limit(options.limit);
    }
    return ref.onSnapshot(snap => {
        const docs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        callback(docs);
    });
}

// ─── Notification Helpers ────────────────────────────────────

/**
 * Post a notification (admin only — enforcement is on Security Rules).
 */
async function postNotification(title, message, type = 'info', postedBy = '') {
    return db.collection('notifications').add({
        title,
        message,
        type,
        postedBy,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
}

/**
 * Delete a notification document.
 */
async function deleteNotificationDoc(docId) {
    return db.collection('notifications').doc(docId).delete();
}

// ─── OTP Helpers ─────────────────────────────────────────────

/**
 * Save a hashed OTP to Firestore with a 10-minute expiry.
 * @param {string} uid   — Firebase user uid
 * @param {string} otp   — plain 6-digit code
 * @param {string} phone — phone number being verified
 */
async function saveOTP(uid, otp, phone) {
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    return db.collection('otps').doc(uid).set({
        otp,          // In production, store a hash — for simulation we store plaintext
        phone,
        expiresAt,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
}

/**
 * Verify an OTP against the Firestore record.
 * Returns { success: true } or { success: false, reason: string }
 */
async function verifyOTPCode(uid, enteredOtp) {
    const snap = await db.collection('otps').doc(uid).get();
    if (!snap.exists) return { success: false, reason: 'OTP not found. Please request a new one.' };

    const data = snap.data();
    if (new Date(data.expiresAt) < new Date()) {
        return { success: false, reason: 'OTP has expired. Please request a new one.' };
    }
    if (data.otp !== enteredOtp) {
        return { success: false, reason: 'Incorrect OTP. Please try again.' };
    }

    // Cleanup used OTP
    await db.collection('otps').doc(uid).delete();
    return { success: true, phone: data.phone };
}

// ─── Seed Helper ─────────────────────────────────────────────

async function seedFirestoreIfEmpty() {
    const now = Date.now();
    const seedData = {
        events: [
            {
                title: 'Web Exploitation CTF',
                date: 'Live Now',
                type: 'live',
                description: 'Capture the flag challenges focusing on web vulnerabilities.',
                details: 'Solve increasingly difficult web exploitation challenges. Find the flags to earn points and climb the leaderboard! First bloods get bonus points.',
                image: '🌐',
                registrations: 45,
                max: 100,
                order: 1,
                openTime: new Date(now - 3600000).toISOString(),
                closeTime: new Date(now + 72000000).toISOString(),
                regStart: new Date(now - 86400000).toISOString(),
                regEnd: new Date(now + 21600000).toISOString()
            },
            {
                title: 'AI Red Teaming Challenge',
                date: 'Ongoing',
                type: 'live',
                description: 'Bypass AI guardrails and test system limits.',
                details: 'Test your prompt injection and adversarial ML skills. Try to make the AI agent reveal its secret instructions or perform unauthorized actions.',
                image: '🤖',
                registrations: 89,
                max: 150,
                order: 2,
                openTime: new Date(now - 86400000).toISOString(),
                closeTime: new Date(now + 172800000).toISOString(),
                regStart: new Date(now - 172800000).toISOString(),
                regEnd: new Date(now + 86400000).toISOString()
            },
            {
                title: 'Cloud Security Hackathon',
                date: 'Just Started',
                type: 'live',
                description: 'Secure open misconfigured AWS buckets and IAM roles.',
                details: 'Find and fix common cloud misconfigurations. Compete to secure the infrastructure the fastest before the simulated "attackers" breach it.',
                image: '☁️',
                registrations: 112,
                max: 200,
                order: 3,
                openTime: new Date(now - 1800000).toISOString(),
                closeTime: new Date(now + 36000000).toISOString(),
                regStart: new Date(now - 259200000).toISOString(),
                regEnd: new Date(now + 3600000).toISOString()
            }
        ],
        teams: [
            { name: 'CyberWraiths', leader: 'Alice Chen', members: ['Alice Chen', 'Bob Lee', 'Carol Wang'], maxMembers: 4, points: 1250, description: 'AI/ML + Red Team specialists' },
            { name: 'ZeroDay Ninjas', leader: 'David Kim', members: ['David Kim'], maxMembers: 4, points: 980, description: 'Exploit development experts' }
        ],
        leaderboard: [
            { name: 'Alice Chen', points: 2450, events: 12, badge: '🏆', rank: 1 },
            { name: 'Bob Lee', points: 1980, events: 10, badge: '🥈', rank: 2 },
            { name: 'Carol Wang', points: 1670, events: 11, badge: '🥉', rank: 3 },
            { name: 'David Kim', points: 1450, events: 9, badge: '', rank: 4 },
            { name: 'Eva Park', points: 1320, events: 8, badge: '', rank: 5 }
        ],
        posts: [
            { user: 'Alice Chen', content: 'Just finished building an AI-powered malware classifier with 97% accuracy! 🔥 Check my GitHub.', likes: 23, comments: 5, createdAt: new Date(now - 7200000) },
            { user: 'Bob Lee', content: 'CTF tips: Focus on AI model poisoning attacks. Most teams miss this!', likes: 15, comments: 3, createdAt: new Date(now - 18000000) }
        ],
        notifications: [
            { title: 'Welcome to AI CyberHub! 🎉', message: 'Registration is now open for the AI-Powered CTF Championship. Register before the deadline!', type: 'info', postedBy: 'admin@aicyberhub.com', createdAt: new Date(now - 3600000) },
            { title: 'New Workshop Added 🤖', message: 'CyberSec AI Workshop on Mar 15 — limited seats at 150. Register now!', type: 'achievement', postedBy: 'admin@aicyberhub.com', createdAt: new Date(now - 7200000) }
        ]
    };

    for (const col of Object.keys(seedData)) {
        const snap = await db.collection(col).limit(1).get();
        if (snap.empty) {
            console.log(`[Firebase] Seeding collection: ${col}`);
            const batch = db.batch();
            seedData[col].forEach(item => {
                const ref = db.collection(col).doc();
                batch.set(ref, item);
            });
            await batch.commit();
            console.log(`[Firebase] ✅ Seeded ${seedData[col].length} docs into '${col}'`);
        }
    }
}

// ─── Expose Globals ──────────────────────────────────────────
window.firebaseAuth = auth;
window.firebaseDb = db;
window.firebase = firebase;
window.signUp = signUp;
window.signIn = signIn;
window.signOutUser = signOutUser;
window.onAuthChange = onAuthChange;
window.fetchCollection = fetchCollection;
window.addDocument = addDocument;
window.setDocument = setDocument;
window.updateDocument = updateDocument;
window.incrementField = incrementField;
window.getDocument = getDocument;
window.deleteDocument = deleteDocument;
window.listenCollection = listenCollection;
window.postNotification = postNotification;
window.deleteNotificationDoc = deleteNotificationDoc;
window.saveOTP = saveOTP;
window.verifyOTPCode = verifyOTPCode;
window.seedFirestoreIfEmpty = seedFirestoreIfEmpty;
