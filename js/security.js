/**
 * DibasPixAI Security & Session Manager
 * SHA-256 + Salt password hashing, clean session recovery, and credit management
 */
const StudioSecurity = (() => {
  const USERS_KEY = 'dibaspix_users_v1';
  const SESSION_KEY = 'dibaspix_session_v1';
  const RATE_KEY = 'dibaspix_rate_v1';

  function getUsers() {
    try {
      const raw = localStorage.getItem(USERS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function saveUsers(users) {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  }

  function randomSalt(len = 16) {
    const arr = new Uint8Array(len);
    crypto.getRandomValues(arr);
    return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
  }

  async function hashPassword(password, salt) {
    const enc = new TextEncoder();
    const data = enc.encode(`${salt}:${password}`);
    const hashBuf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuf), (b) => b.toString(16).padStart(2, '0')).join('');
  }

  function checkRateLimit() {
    try {
      const info = JSON.parse(localStorage.getItem(RATE_KEY) || '{"count":0,"until":0}');
      const now = Date.now();
      if (info.until && now < info.until) {
        const sec = Math.ceil((info.until - now) / 1000);
        return { blocked: true, message: `Too many attempts. Try again in ${sec}s.` };
      }
      return { blocked: false };
    } catch {
      return { blocked: false };
    }
  }

  function recordFailedAttempt() {
    try {
      const now = Date.now();
      const info = JSON.parse(localStorage.getItem(RATE_KEY) || '{"count":0,"until":0}');
      const count = (info.count || 0) + 1;
      const until = count >= 5 ? now + 30000 : 0;
      localStorage.setItem(RATE_KEY, JSON.stringify({ count, until }));
    } catch {}
  }

  function clearRateLimit() {
    localStorage.removeItem(RATE_KEY);
  }

  async function registerUser({ username, email, password }) {
    const cleanUser = (username || '').trim();
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanPass = password || '';

    if (cleanUser.length < 3) {
      return { ok: false, message: 'Username must be at least 3 characters.' };
    }
    if (!cleanEmail || !cleanEmail.includes('@')) {
      return { ok: false, message: 'Please enter a valid email.' };
    }
    if (cleanPass.length < 6) {
      return { ok: false, message: 'Password must be at least 6 characters.' };
    }

    const users = getUsers();
    const exists = users.some(
      (u) => u.username.toLowerCase() === cleanUser.toLowerCase() || u.email === cleanEmail
    );
    if (exists) {
      return { ok: false, message: 'Account already exists. Please sign in.' };
    }

    const salt = randomSalt();
    const passwordHash = await hashPassword(cleanPass, salt);

    const newUser = {
      id: `usr_${Date.now()}`,
      username: cleanUser,
      email: cleanEmail,
      salt,
      passwordHash,
      credits: 25,
      createdAt: new Date().toISOString()
    };

    users.push(newUser);
    saveUsers(users);

    const session = {
      userId: newUser.id,
      username: newUser.username,
      email: newUser.email,
      credits: newUser.credits
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return { ok: true, session };
  }

  async function loginUser({ username, password }) {
    const rate = checkRateLimit();
    if (rate.blocked) return { ok: false, message: rate.message };

    const identifier = (username || '').trim().toLowerCase();
    const cleanPass = password || '';

    if (!identifier || !cleanPass) {
      return { ok: false, message: 'Enter username/email and password.' };
    }

    const users = getUsers();
    // Allow login with either Username OR Email
    const user = users.find(
      (u) => u.username.toLowerCase() === identifier || u.email.toLowerCase() === identifier
    );

    if (!user) {
      recordFailedAttempt();
      return { ok: false, message: 'Invalid username or password.' };
    }

    const attemptHash = await hashPassword(cleanPass, user.salt);
    if (attemptHash !== user.passwordHash) {
      recordFailedAttempt();
      return { ok: false, message: 'Invalid username or password.' };
    }

    clearRateLimit();
    const session = {
      userId: user.id,
      username: user.username,
      email: user.email,
      credits: typeof user.credits === 'number' ? user.credits : 25
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return { ok: true, session };
  }

  function getActiveSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const session = JSON.parse(raw);
      if (!session || !session.username) return null;
      return session;
    } catch {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
  }

  function logout() {
    localStorage.removeItem(SESSION_KEY);
  }

  function updateCredits(newCredits) {
    const session = getActiveSession();
    if (!session) return null;
    session.credits = Math.max(0, Number(newCredits));
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));

    const users = getUsers();
    const idx = users.findIndex((u) => u.id === session.userId);
    if (idx !== -1) {
      users[idx].credits = session.credits;
      saveUsers(users);
    }
    return session;
  }

  return {
    registerUser,
    loginUser,
    getActiveSession,
    logout,
    updateCredits
  };
})();
