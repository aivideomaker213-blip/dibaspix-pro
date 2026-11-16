/**
 * DibasPixAI Security Engine
 * Handles Salted SHA-256 Password Hashing, Session Tokens, XSS Sanitization & Rate Limiting
 */
const StudioSecurity = (() => {
  const USERS_KEY = 'dibaspix_ai_secure_users_v1';
  const SESSION_KEY = 'dibaspix_ai_active_session_v1';
  const ATTEMPT_KEY = 'dibaspix_ai_login_attempts_v1';

  // Sanitize user input against XSS injection
  function sanitize(str) {
    const div = document.createElement('div');
    div.textContent = String(str || '').trim();
    return div.innerHTML;
  }

  // Generate cryptographically secure random hex string (Salt / Token)
  function generateRandomHex(bytes = 16) {
    const arr = new Uint8Array(bytes);
    crypto.getRandomValues(arr);
    return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
  }

  // Hash password with salt using browser native SHA-256
  async function hashPassword(password, salt) {
    const encoder = new TextEncoder();
    const data = encoder.encode(`${salt}:${password}:DIBASPIX_AI_PEPPER_2026`);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer), b => b.toString(16).padStart(2, '0')).join('');
  }

  function getUsers() {
    try {
      return JSON.parse(localStorage.getItem(USERS_KEY)) || {};
    } catch {
      return {};
    }
  }

  function saveUsers(users) {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  }

  // Rate limiter against brute-force password guessing
  function checkRateLimit() {
    const raw = sessionStorage.getItem(ATTEMPT_KEY);
    if (!raw) return { allowed: true };
    const data = JSON.parse(raw);
    if (data.lockUntil && Date.now() < data.lockUntil) {
      const waitSec = Math.ceil((data.lockUntil - Date.now()) / 1000);
      return { allowed: false, message: `Too many attempts. Try again in ${waitSec}s.` };
    }
    return { allowed: true };
  }

  function recordFailedAttempt() {
    const raw = sessionStorage.getItem(ATTEMPT_KEY);
    const data = raw ? JSON.parse(raw) : { count: 0, lockUntil: 0 };
    data.count += 1;
    if (data.count >= 5) {
      data.lockUntil = Date.now() + 30000; // 30s cooldown
      data.count = 0;
    }
    sessionStorage.setItem(ATTEMPT_KEY, JSON.stringify(data));
  }

  function clearAttempts() {
    sessionStorage.removeItem(ATTEMPT_KEY);
  }

  // Register a new user securely
  async function registerUser({ username, email, password }) {
    const cleanUser = sanitize(username).toLowerCase();
    const cleanEmail = sanitize(email).toLowerCase();

    if (cleanUser.length < 3) {
      return { ok: false, message: 'Username must be at least 3 characters.' };
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return { ok: false, message: 'Please enter a valid email address.' };
    }
    if (password.length < 6) {
      return { ok: false, message: 'Password must be at least 6 characters.' };
    }

    const users = getUsers();
    if (users[cleanUser]) {
      return { ok: false, message: 'Username already exists. Please choose another.' };
    }

    const salt = generateRandomHex(16);
    const passwordHash = await hashPassword(password, salt);

    users[cleanUser] = {
      username: sanitize(username),
      email: cleanEmail,
      salt,
      passwordHash,
      credits: 25,
      createdAt: new Date().toISOString()
    };

    saveUsers(users);
    return createSession(users[cleanUser]);
  }

  // Authenticate existing user
  async function loginUser({ username, password }) {
    const limit = checkRateLimit();
    if (!limit.allowed) return { ok: false, message: limit.message };

    const cleanUser = sanitize(username).toLowerCase();
    const users = getUsers();
    const record = users[cleanUser];

    if (!record) {
      recordFailedAttempt();
      return { ok: false, message: 'Invalid username or password.' };
    }

    const computedHash = await hashPassword(password, record.salt);
    if (computedHash !== record.passwordHash) {
      recordFailedAttempt();
      return { ok: false, message: 'Invalid username or password.' };
    }

    clearAttempts();
    return createSession(record);
  }

  // Issue authenticated session token
  function createSession(userRecord) {
    const session = {
      token: generateRandomHex(24),
      username: userRecord.username,
      email: userRecord.email,
      credits: userRecord.credits,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return { ok: true, session };
  }

  // Verify active session before unlocking Dashboard
  function getActiveSession() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const session = JSON.parse(raw);
      if (!session.token || Date.now() > session.expiresAt) {
        logout();
        return null;
      }
      return session;
    } catch {
      return null;
    }
  }

  function logout() {
    sessionStorage.removeItem(SESSION_KEY);
  }

  return {
    registerUser,
    loginUser,
    getActiveSession,
    logout,
    sanitize
  };
})();
