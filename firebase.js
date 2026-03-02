// ============================================================
//  firebase.js — AI CyberHub
//  Initialises Firebase and exports Auth / Firestore helpers
// ============================================================

const firebaseConfig = {
    apiKey: "AIzaSyBCEx1AaClIcOFr_wkHZixo7NGBorv0Faw",
    authDomain: "ai-x-cyberhub.firebaseapp.com",
    projectId: "ai-x-cyberhub",
    storageBucket: "ai-x-cyberhub.firebasestorage.app",
    messagingSenderId: "348804234249",
    appId: "1:348804234249:web:f948eee1584cb9ef8d8cd8",
    measurementId: "G-8CMJ2TXFW4"
};

// Initialise the Firebase app (compat SDK loaded via CDN in index.html)
firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();

// ─── Auth Helpers ────────────────────────────────────────────

/**
 * Sign up a new user then create a Firestore profile document.
 * @param {string} email
 * @param {string} password
 * @param {string} name
 * @returns {Promise<firebase.auth.UserCredential>}
 */
async function signUp(email, password, name) {
    // Step 1: Create Firebase Auth account (always runs first)
    const cred = await auth.createUserWithEmailAndPassword(email, password);
    await cred.user.updateProfile({ displayName: name });

    // Step 2: Create Firestore profile (non-fatal — may fail if rules are restrictive)
    try {
        await db.collection('users').doc(cred.user.uid).set({
            name,
            email,
            joined: firebase.firestore.FieldValue.serverTimestamp(),
            points: 0,
            events: [],
            bio: '',
            skills: [],
            avatar: name.charAt(0).toUpperCase()
        });
    } catch (firestoreErr) {
        console.warn('[signUp] Firestore profile write failed (check security rules):', firestoreErr.code, firestoreErr.message);
        // Auth account created successfully — profile will be missing until rules are fixed
    }

    return cred;
}

/**
 * Sign in an existing user.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<firebase.auth.UserCredential>}
 */
async function signIn(email, password) {
    return auth.signInWithEmailAndPassword(email, password);
}

/**
 * Sign out the current user.
 * @returns {Promise<void>}
 */
async function signOutUser() {
    return auth.signOut();
}

/**
 * Subscribe to auth state changes.
 * @param {function} callback  — called with (user | null)
 */
function onAuthChange(callback) {
    auth.onAuthStateChanged(callback);
}

// ─── Firestore Helpers ───────────────────────────────────────

/**
 * Fetch all documents from a Firestore collection.
 * Returns an array of plain objects (with .id attached).
 * @param {string} collectionName
 * @param {Object} [options]
 * @param {string} [options.orderBy]   — field name
 * @param {string} [options.direction] — 'asc' | 'desc'
 * @returns {Promise<Array>}
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
 * @param {string} collectionName
 * @param {Object} data
 * @returns {Promise<firebase.firestore.DocumentReference>}
 */
async function addDocument(collectionName, data) {
    return db.collection(collectionName).add({
        ...data,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
}

/**
 * Update specific fields in a document.
 * @param {string} collectionName
 * @param {string} docId
 * @param {Object} data
 * @returns {Promise<void>}
 */
async function updateDocument(collectionName, docId, data) {
    return db.collection(collectionName).doc(docId).update(data);
}

/**
 * Atomically increment a numeric field in a document.
 * @param {string} collectionName
 * @param {string} docId
 * @param {string} field
 * @param {number} [amount=1]
 */
async function incrementField(collectionName, docId, field, amount = 1) {
    return db.collection(collectionName).doc(docId).update({
        [field]: firebase.firestore.FieldValue.increment(amount)
    });
}

/**
 * Fetch a single document by id.
 * @param {string} collectionName
 * @param {string} docId
 * @returns {Promise<Object|null>}
 */
async function getDocument(collectionName, docId) {
    const snap = await db.collection(collectionName).doc(docId).get();
    return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

// ─── Seed Helper ─────────────────────────────────────────────

/**
 * Seeds Firestore collections with starter data if they are empty.
 * Safe to call on every page load — it only writes when empty.
 */
async function seedFirestoreIfEmpty() {
    const seedData = {
        events: [
            {
                title: "AI-Powered CTF Championship",
                date: "Live Now",
                type: "live",
                description: "24hr Capture The Flag with AI/ML challenges",
                details: "Advanced CTF with AI-generated challenges, ML model exploitation, and real-time threat hunting. Prizes: $5000 + internships.",
                image: "🏁",
                registrations: 127,
                max: 200,
                order: 1
            },
            {
                title: "CyberSec AI Workshop",
                date: "Mar 15, 2026",
                type: "upcoming",
                description: "Build your first AI Threat Detector",
                details: "Hands-on workshop building ML models for malware detection and anomaly detection using TensorFlow.",
                image: "🤖",
                registrations: 89,
                max: 150,
                order: 2
            },
            {
                title: "Winter Hackathon 2025",
                date: "Dec 2025",
                type: "past",
                description: "Build AI Security Solutions",
                details: "Winning team created AI-powered IDS. Check recordings and projects.",
                image: "💻",
                registrations: 156,
                max: 200,
                order: 3
            }
        ],
        teams: [
            {
                name: "CyberWraiths",
                leader: "Alice Chen",
                members: ["Alice Chen", "Bob Lee", "Carol Wang"],
                maxMembers: 4,
                points: 1250,
                description: "AI/ML + Red Team specialists"
            },
            {
                name: "ZeroDay Ninjas",
                leader: "David Kim",
                members: ["David Kim"],
                maxMembers: 4,
                points: 980,
                description: "Exploit development experts"
            }
        ],
        leaderboard: [
            { name: "Alice Chen", points: 2450, events: 12, badge: "🏆", rank: 1 },
            { name: "Bob Lee", points: 1980, events: 10, badge: "🥈", rank: 2 },
            { name: "Carol Wang", points: 1670, events: 11, badge: "🥉", rank: 3 },
            { name: "David Kim", points: 1450, events: 9, badge: "", rank: 4 },
            { name: "Eva Park", points: 1320, events: 8, badge: "", rank: 5 }
        ],
        posts: [
            {
                user: "Alice Chen",
                content: "Just finished building an AI-powered malware classifier with 97% accuracy! 🔥 Check my GitHub.",
                likes: 23,
                comments: 5,
                createdAt: new Date(Date.now() - 2 * 3600 * 1000)
            },
            {
                user: "Bob Lee",
                content: "CTF tips: Focus on AI model poisoning attacks. Most teams miss this!",
                likes: 15,
                comments: 3,
                createdAt: new Date(Date.now() - 5 * 3600 * 1000)
            }
        ]
    };

    const collections = Object.keys(seedData);

    for (const col of collections) {
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

// Expose globals so script.js can use them without imports
window.firebaseAuth = auth;
window.firebaseDb = db;
window.signUp = signUp;
window.signIn = signIn;
window.signOutUser = signOutUser;
window.onAuthChange = onAuthChange;
window.fetchCollection = fetchCollection;
window.addDocument = addDocument;
window.updateDocument = updateDocument;
window.incrementField = incrementField;
window.getDocument = getDocument;
window.seedFirestoreIfEmpty = seedFirestoreIfEmpty;
