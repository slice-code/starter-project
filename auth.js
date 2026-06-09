const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// JWT Secret - MUST be set in production
let JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'CRITICAL: JWT_SECRET environment variable is REQUIRED in production! ' +
      'Generate a strong secret: openssl rand -base64 64'
    );
  }
  // Only allow fallback in development
  console.warn('⚠️  WARNING: Using default JWT_SECRET. Set JWT_SECRET in .env for production!');
  JWT_SECRET = 'crm-dev-secret-change-in-production';
}

const COOKIE_NAME = 'crm_token';
const TOKEN_MAX_AGE_SEC = 60 * 60 * 24; // 1 hari

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const cookies = {};
  header.split(';').forEach((part) => {
    const trimmed = part.trim();
    if (!trimmed) return;
    const eq = trimmed.indexOf('=');
    if (eq === -1) return;
    const key = trimmed.slice(0, eq);
    const val = trimmed.slice(eq + 1);
    cookies[key] = decodeURIComponent(val);
  });
  return cookies;
}

function buildSetCookieHeader(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  if (options.path) parts.push(`Path=${options.path}`);
  if (options.httpOnly) parts.push('HttpOnly');
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  return parts.join('; ');
}

function setAuthCookie(res, token) {
  res.setHeader('Set-Cookie', buildSetCookieHeader(COOKIE_NAME, token, {
    maxAge: TOKEN_MAX_AGE_SEC,
    path: '/',
    httpOnly: true,
    sameSite: 'Lax'
  }));
}

function clearAuthCookie(res) {
  res.setHeader('Set-Cookie', buildSetCookieHeader(COOKIE_NAME, '', {
    maxAge: 0,
    path: '/',
    httpOnly: true,
    sameSite: 'Lax'
  }));
}

function signToken(user) {
  return jwt.sign(
    { 
      sub: user.id, 
      email: user.email, 
      role: user.role, 
      name: user.name,
      kode_cabang: user.kode_cabang || null  // Include cabang in token
    },
    JWT_SECRET,
    { expiresIn: TOKEN_MAX_AGE_SEC }
  );
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

function getUserFromRequest(req) {
  const cookies = parseCookies(req);
  const token = cookies[COOKIE_NAME];
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload || !payload.sub) return null;
  return payload;
}

async function verifyPassword(plain, stored) {
  if (!stored) return false;
  
  // Only accept bcrypt hashed passwords
  if (stored.startsWith('$2a$') || stored.startsWith('$2b$')) {
    return bcrypt.compare(plain, stored);
  }
  
  // Reject plaintext passwords for security
  // Legacy passwords must be upgraded via login flow in server.js
  return false;
}

function hashPassword(plain) {
  return bcrypt.hashSync(plain, 10);
}

function toPublicUser(row) {
  if (!row) return null;
  const rolePermissions = require('./role-permissions');
  const role = rolePermissions.normalizeRole
    ? rolePermissions.normalizeRole(row.role)
    : String(row.role || '').toLowerCase();
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role,
    kode_cabang: row.kode_cabang || null,
    phone: row.phone || '',
    status: row.status,
    avatar: row.avatar || null
  };
}

// Input sanitization utilities
function sanitizeInput(str, maxLength = 255) {
  if (typeof str !== 'string') return '';
  return str
    .trim()
    .slice(0, maxLength)  // Limit length to prevent DoS
    .replace(/[<>"'&]/g, '');  // Remove potentially dangerous characters
}

function validateEmail(email) {
  // RFC 5322 compliant email validation
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  return emailRegex.test(email) && email.length <= 255;
}

function validatePassword(password) {
  const errors = [];
  
  if (!password || typeof password !== 'string') {
    return { isValid: false, errors: ['Password wajib diisi'] };
  }
  
  if (password.length < 6) {
    errors.push('Password minimal 6 karakter');
  }
  
  if (password.length > 128) {
    errors.push('Password maksimal 128 karakter');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

// Strong password validation (for password creation/reset)
function validateStrongPassword(password) {
  const errors = [];
  
  if (!password || typeof password !== 'string') {
    return { isValid: false, errors: ['Password wajib diisi'] };
  }
  
  if (password.length < 8) {
    errors.push('Password minimal 8 karakter');
  }
  
  if (!/[A-Z]/.test(password)) {
    errors.push('Password harus mengandung minimal 1 huruf besar');
  }
  
  if (!/[a-z]/.test(password)) {
    errors.push('Password harus mengandung minimal 1 huruf kecil');
  }
  
  if (!/[0-9]/.test(password)) {
    errors.push('Password harus mengandung minimal 1 angka');
  }
  
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Password harus mengandung minimal 1 karakter spesial (!@#$%^&* dll)');
  }
  
  // Check for common weak passwords
  const weakPasswords = ['password', '12345678', 'qwerty', 'abc123', 'password123', 'admin123'];
  if (weakPasswords.includes(password.toLowerCase())) {
    errors.push('Password terlalu mudah ditebak. Gunakan password yang lebih unik');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

module.exports = {
  COOKIE_NAME,
  TOKEN_MAX_AGE_SEC,
  parseCookies,
  setAuthCookie,
  clearAuthCookie,
  signToken,
  verifyToken,
  getUserFromRequest,
  verifyPassword,
  hashPassword,
  toPublicUser,
  sanitizeInput,
  validateEmail,
  validatePassword,
  validateStrongPassword
};
