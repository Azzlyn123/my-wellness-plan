// ============================================================
//  MY WELLNESS PLAN — Firebase Auth & Sync
//  Drop this file into your repo, then follow SETUP.md
// ============================================================

// ── 1. PASTE YOUR FIREBASE CONFIG HERE (from Firebase Console) ──
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyDT0XteDdcyYSVwm2NgtwIecrQ3dF-S0Sk",
  authDomain:        "my-wellness-plan.firebaseapp.com",
  projectId:         "my-wellness-plan",
  storageBucket:     "my-wellness-plan.firebasestorage.app",
  messagingSenderId: "534056172481",
  appId:             "1:534056172481:web:6594b6b9f94f3a55e54d40"
};

// ── 2. KEYS to sync between localStorage ↔ Firestore ──
const SYNC_KEYS = [
  // Onboarding / profile
  "wl_profile",          // { name, age, gender, height, weight, goalWeight, activityLevel }
  "wl_preferences",      // { goal, equipment, dietary, injuries }
  "wl_onboarded",        // "true" once setup is done

  // Progress
  "wl_xp",
  "wl_level",
  "wl_streak",
  "wl_lastActive",
  "wl_weightLogs",       // JSON array of { date, value }

  // Quests
  "wl_quests",           // JSON object { questId: true/false }
  "wl_questDate",        // date string of last quest reset

  // Plan
  "wl_workoutPlan",
  "wl_mealPlan",
  "wl_macros",

  // Achievements
  "wl_achievements",

  // Reminders
  "wl_reminderTimes"
];

// ────────────────────────────────────────────────────────────
//  Bootstrap — runs before anything else on the page
// ────────────────────────────────────────────────────────────
(async () => {
  // Inject Firebase SDK
  await loadScript("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
  await loadScript("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js");
  await loadScript("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js");

  firebase.initializeApp(FIREBASE_CONFIG);
  const auth = firebase.auth();
  const db   = firebase.firestore();

  // Show login wall while we check auth state
  const overlay = createLoginOverlay();
  document.body.appendChild(overlay);

  auth.onAuthStateChanged(async (user) => {
    if (user) {
      // ✅ Signed in — load their cloud data then show the app
      await loadUserData(db, user.uid);
      patchLocalStorage(db, user.uid);
      updateUserBadge(user);
      overlay.remove();
      setupSignOutButton(auth);
    } else {
      // ❌ Not signed in — keep overlay visible
      overlay.style.display = "flex";
    }
  });

  // Google sign-in button handler
  document.getElementById("wl-google-btn").addEventListener("click", async () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    try {
      await auth.signInWithPopup(provider);
      // onAuthStateChanged fires automatically after this
    } catch (err) {
      console.error("Sign-in error:", err);
      alert("Sign-in failed. Please try again.");
    }
  });
})();

// ────────────────────────────────────────────────────────────
//  Load user's Firestore data → localStorage
// ────────────────────────────────────────────────────────────
async function loadUserData(db, uid) {
  try {
    const doc = await db.collection("users").doc(uid).get();

    if (doc.exists) {
      // ✅ Returning user — restore their cloud data into localStorage
      const data = doc.data();
      for (const key of SYNC_KEYS) {
        if (data[key] !== undefined) {
          const val = typeof data[key] === "object"
            ? JSON.stringify(data[key])
            : String(data[key]);
          // Use native setItem to avoid triggering sync loop
          Object.getPrototypeOf(localStorage).setItem.call(localStorage, key, val);
        }
      }
    } else {
      // 🆕 First sign-in — upload whatever is already in localStorage to Firestore
      const existingData = {};
      for (const key of SYNC_KEYS) {
        const val = localStorage.getItem(key);
        if (val !== null) {
          let parsed = val;
          try { parsed = JSON.parse(val); } catch (_) {}
          existingData[key] = parsed;
        }
      }
      if (Object.keys(existingData).length > 0) {
        await db.collection("users").doc(uid).set(existingData);
      }
    }
  } catch (err) {
    console.warn("Could not load cloud data:", err);
  }
}

// ────────────────────────────────────────────────────────────
//  Patch localStorage so every setItem also writes to Firestore
// ────────────────────────────────────────────────────────────
function patchLocalStorage(db, uid) {
  const _orig = localStorage.setItem.bind(localStorage);

  localStorage.setItem = (key, value) => {
    _orig(key, value);                         // still write locally
    if (SYNC_KEYS.includes(key)) {
      // Debounce cloud writes (200 ms) so rapid updates don't spam
      clearTimeout(localStorage._syncTimer?.[key]);
      if (!localStorage._syncTimer) localStorage._syncTimer = {};
      localStorage._syncTimer[key] = setTimeout(() => {
        let parsed = value;
        try { parsed = JSON.parse(value); } catch (_) {}
        db.collection("users").doc(uid).set(
          { [key]: parsed },
          { merge: true }
        ).catch(console.warn);
      }, 200);
    }
  };
}

// ────────────────────────────────────────────────────────────
//  UI — Login overlay
// ────────────────────────────────────────────────────────────
function createLoginOverlay() {
  const div = document.createElement("div");
  div.id = "wl-login-overlay";
  div.innerHTML = `
    <div class="wl-login-card">
      <div class="wl-login-logo">🌿</div>
      <h1 class="wl-login-title">My Wellness Journey</h1>
      <p class="wl-login-sub">Sign in to save your progress across all your devices</p>
      <button id="wl-google-btn" class="wl-google-btn">
        <svg width="20" height="20" viewBox="0 0 48 48">
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          <path fill="none" d="M0 0h48v48H0z"/>
        </svg>
        Continue with Google
      </button>
      <p class="wl-login-note">Your plan, streaks, and progress are saved to your account 🔒</p>
    </div>
  `;

  // Inject styles
  const style = document.createElement("style");
  style.textContent = `
    #wl-login-overlay {
      position: fixed; inset: 0; z-index: 99999;
      background: linear-gradient(135deg, #0f2027, #203a43, #2c5364);
      display: flex; align-items: center; justify-content: center;
      font-family: inherit;
    }
    .wl-login-card {
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.12);
      backdrop-filter: blur(20px);
      border-radius: 24px;
      padding: 48px 40px;
      max-width: 400px; width: 90%;
      text-align: center;
      box-shadow: 0 32px 64px rgba(0,0,0,0.4);
    }
    .wl-login-logo { font-size: 56px; margin-bottom: 16px; }
    .wl-login-title {
      color: #fff; font-size: 28px; font-weight: 700;
      margin: 0 0 8px; letter-spacing: -0.5px;
    }
    .wl-login-sub {
      color: rgba(255,255,255,0.6); font-size: 15px;
      margin: 0 0 32px; line-height: 1.5;
    }
    .wl-google-btn {
      display: flex; align-items: center; justify-content: center;
      gap: 12px; width: 100%; padding: 14px 24px;
      background: #fff; color: #333;
      border: none; border-radius: 12px;
      font-size: 16px; font-weight: 600; cursor: pointer;
      transition: transform 0.15s, box-shadow 0.15s;
      box-shadow: 0 4px 16px rgba(0,0,0,0.2);
    }
    .wl-google-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 24px rgba(0,0,0,0.3);
    }
    .wl-login-note {
      color: rgba(255,255,255,0.4); font-size: 13px;
      margin: 20px 0 0;
    }
    #wl-user-badge {
      position: fixed; top: 12px; right: 12px; z-index: 9999;
      display: flex; align-items: center; gap: 8px;
      background: rgba(0,0,0,0.6); backdrop-filter: blur(10px);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 40px; padding: 6px 14px 6px 6px;
      color: #fff; font-size: 13px; font-weight: 500;
    }
    #wl-user-badge img {
      width: 28px; height: 28px; border-radius: 50%;
      object-fit: cover;
    }
    #wl-signout-btn {
      background: rgba(255,255,255,0.1); border: none;
      color: rgba(255,255,255,0.7); font-size: 12px;
      padding: 3px 8px; border-radius: 20px; cursor: pointer;
      margin-left: 4px; transition: background 0.15s;
    }
    #wl-signout-btn:hover { background: rgba(255,80,80,0.3); color: #fff; }
  `;
  document.head.appendChild(style);
  return div;
}

// ────────────────────────────────────────────────────────────
//  UI — User badge (top-right corner after sign-in)
// ────────────────────────────────────────────────────────────
function updateUserBadge(user) {
  const badge = document.createElement("div");
  badge.id = "wl-user-badge";
  badge.innerHTML = `
    <img src="${user.photoURL || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(user.displayName || 'U')}" alt="avatar" />
    <span>${user.displayName?.split(" ")[0] || "You"}</span>
    <button id="wl-signout-btn">Sign out</button>
  `;
  document.body.appendChild(badge);
}

function setupSignOutButton(auth) {
  document.addEventListener("click", async (e) => {
    if (e.target.id === "wl-signout-btn") {
      await auth.signOut();
      localStorage.clear();
      location.reload();
    }
  });
}

// ────────────────────────────────────────────────────────────
//  Helper — load a script tag dynamically
// ────────────────────────────────────────────────────────────
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src; s.async = true;
    s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}
