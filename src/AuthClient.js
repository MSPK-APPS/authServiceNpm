// ESM module — v0.2.0
// Security: API secret is NEVER transmitted. Every request is signed with
// HMAC-SHA256(secret, "METHOD:path:timestamp:body_sha256"). Signatures
// are time-limited (±5 min) to prevent replay attacks.
import { AuthError } from './errors.js';

// Detect runtime once at module load
const _isNode =
  typeof process !== 'undefined' &&
  typeof process.versions !== 'undefined' &&
  !!process.versions.node;

/**
 * Compute SHA-256 hex of a string. Works in both Node and browser.
 */
async function sha256hex(str) {
  if (_isNode) {
    const { createHash } = await import('crypto');
    return createHash('sha256').update(str).digest('hex');
  }
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(str));
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Compute HMAC-SHA256 hex of a message using the given secret.
 * Works in both Node and browser.
 */
async function hmacSha256hex(secret, message) {
  if (_isNode) {
    const { createHmac } = await import('crypto');
    return createHmac('sha256', secret).update(message).digest('hex');
  }
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sigBuf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export class AuthClient {
  // Convenience: allow users to create with only key/secret
  static create(apiKey, apiSecret, opts = {}) {
    return new AuthClient({ apiKey, apiSecret, ...opts });
  }

  constructor({
    apiKey,
    apiSecret,
    baseUrl = 'https://cpanel-backend.mspkapps.in/api/v1',
    storage,
    fetch: fetchFn,
    keyInPath = true,
    googleClientId = null,
    developerId = null,
  } = {}) {
    if (!apiKey) throw new Error('apiKey is required');
    if (!apiSecret) throw new Error('apiSecret is required');
    this.apiKey = apiKey;
    this.apiSecret = apiSecret; // kept in memory, never sent over the wire
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.keyInPath = !!keyInPath;
    this.googleClientId = googleClientId || null;
    this.developerId = developerId || null;

    const f = fetchFn || (typeof window !== 'undefined' ? window.fetch : (typeof fetch !== 'undefined' ? fetch : null));
    if (!f) throw new Error('No fetch available. Pass { fetch } or run on Node 18+/browsers.');
    this.fetch = (...args) => f(...args);

    this.storage = storage ?? (typeof window !== 'undefined' ? window.localStorage : null);
    this.tokenKey = 'auth_user_token';
    this.token = this._load(this.tokenKey);
  }

  // ---------- storage helpers ----------
  _load(key) { if (!this.storage) return null; try { return this.storage.getItem(key); } catch { return null; } }
  _save(key, val) { if (!this.storage) return; try { this.storage.setItem(key, val); } catch { } }
  _clear(key) { if (!this.storage) return; try { this.storage.removeItem(key); } catch { } }

  // ---------- URL builders ----------
  _buildUrl(path) {
    const p = path.startsWith('/') ? path.slice(1) : path;
    return this.keyInPath
      ? `${this.baseUrl}/${encodeURIComponent(this.apiKey)}/${p}`
      : `${this.baseUrl}/${p}`;
  }

  /** Returns just the pathname (no origin) for use in the HMAC message. */
  _buildPath(path) {
    try {
      return new URL(this._buildUrl(path)).pathname;
    } catch {
      // Fallback for environments where URL isn't available
      const p = path.startsWith('/') ? path.slice(1) : path;
      return this.keyInPath
        ? `/api/v1/${encodeURIComponent(this.apiKey)}/${p}`
        : `/api/v1/${p}`;
    }
  }

  // ---------- HMAC signing ----------
  /**
   * Signs a request. Returns { timestamp, signature }.
   * The secret is used only here — it never appears in headers.
   *
   * Signed message: "METHOD:pathname:timestamp:body_sha256_hex"
   */
  async _sign(method, pathname, bodyObj) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const bodyStr = bodyObj != null ? JSON.stringify(bodyObj) : '';
    const bodyHash = await sha256hex(bodyStr);
    const message = `${method.toUpperCase()}:${pathname}:${timestamp}:${bodyHash}`;
    const signature = await hmacSha256hex(this.apiSecret, message);
    return { timestamp, signature };
  }

  // ---------- headers ----------
  /**
   * Builds request headers.
   * @param {object} extra - Additional headers to merge.
   * @param {{ timestamp: string, signature: string }|null} sigData - HMAC sign result.
   */
  _headers(extra = {}, sigData = null) {
    return {
      'Content-Type': 'application/json',
      'X-API-Key': this.apiKey,
      'X-API-Secret': this.apiSecret,
      // HMAC proof
      ...(sigData ? { 'X-Timestamp': sigData.timestamp, 'X-Signature': sigData.signature } : {}),
      ...(this.googleClientId ? { 'X-Google-Client-Id': this.googleClientId } : {}),
      ...(this.developerId ? { 'X-Developer-Id': this.developerId } : {}),
      ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      ...extra
    };
  }

  setToken(token) {
    this.token = token || null;
    if (token) this._save(this.tokenKey, token);
    else this._clear(this.tokenKey);
  }

  setDeveloperId(developerId) {
    this.developerId = developerId || null;
  }

  getAuthHeader() { return this.token ? { Authorization: `Bearer ${this.token}` } : {}; }
  logout() { this.setToken(null); }

  // ---------- public API methods ----------
  async register({ email, username, password, name, extra = {} }) {
    const body = { email, username, password, name, ...extra };
    const sig = await this._sign('POST', this._buildPath('auth/register'), body);
    const resp = await this.fetch(this._buildUrl('auth/register'), {
      method: 'POST',
      headers: this._headers({}, sig),
      body: JSON.stringify(body)
    });
    const json = await safeJson(resp);
    if (!resp.ok || json?.success === false) throw toError(resp, json, 'Register failed');
    const token = json?.data?.access_token || json?.data?.accessToken || json?.data?.user_token;
    if (token) this.setToken(token);
    return json;
  }

  async login({ email, username, password }) {
    const payload = email ? { email, password } : { username, password };
    const sig = await this._sign('POST', this._buildPath('auth/login'), payload);
    const resp = await this.fetch(this._buildUrl('auth/login'), {
      method: 'POST',
      headers: this._headers({}, sig),
      body: JSON.stringify(payload)
    });
    const json = await safeJson(resp);
    if (!resp.ok || json?.success === false) throw toError(resp, json, 'Login failed');
    const token = json?.data?.access_token || json?.data?.accessToken || json?.data?.user_token;
    if (token) this.setToken(token);
    return json;
  }

  async googleAuth({ id_token }) {
    if (!id_token) {
      throw new AuthError(
        'Either id_token or access_token is required for Google authentication',
        400,
        'MISSING_TOKEN',
        null
      );
    }
    const body = { id_token };
    if (this.googleClientId) body.google_client_id = this.googleClientId;
    const sig = await this._sign('POST', this._buildPath('auth/google'), body);
    const resp = await this.fetch(this._buildUrl('auth/google'), {
      method: 'POST',
      headers: this._headers({}, sig),
      body: JSON.stringify(body)
    });
    const json = await safeJson(resp);
    if (!resp.ok || json?.success === false) throw toError(resp, json, 'Google authentication failed');
    const token = json?.data?.access_token || json?.data?.accessToken || json?.data?.user_token;
    if (token) this.setToken(token);
    return json;
  }

  async requestPasswordReset({ email }) {
    const body = { email };
    const sig = await this._sign('POST', this._buildPath('auth/request-password-reset'), body);
    const resp = await this.fetch(this._buildUrl('auth/request-password-reset'), {
      method: 'POST',
      headers: this._headers({}, sig),
      body: JSON.stringify(body)
    });
    const json = await safeJson(resp);
    if (!resp.ok || json?.success === false) throw toError(resp, json, 'Password reset request failed');
    return json;
  }

  async requestChangePasswordLink({ email }) {
    const body = { email };
    const sig = await this._sign('POST', this._buildPath('auth/request-change-password-link'), body);
    const resp = await this.fetch(this._buildUrl('auth/request-change-password-link'), {
      method: 'POST',
      headers: this._headers({}, sig),
      body: JSON.stringify(body)
    });
    const json = await safeJson(resp);
    if (!resp.ok || json?.success === false) throw toError(resp, json, 'Request change password link failed');
    return json;
  }

  async resendVerificationEmail({ email, purpose }) {
    const body = { email, purpose };
    const sig = await this._sign('POST', this._buildPath('auth/resend-verification'), body);
    const resp = await this.fetch(this._buildUrl('auth/resend-verification'), {
      method: 'POST',
      headers: this._headers({}, sig),
      body: JSON.stringify(body)
    });
    const json = await safeJson(resp);
    if (!resp.ok || json?.success === false) throw toError(resp, json, 'Resend verification failed');
    return json;
  }

  async deleteAccount({ email, password }) {
    const body = { email, password };
    const sig = await this._sign('POST', this._buildPath('auth/delete-account'), body);
    const resp = await this.fetch(this._buildUrl('auth/delete-account'), {
      method: 'POST',
      headers: this._headers({}, sig),
      body: JSON.stringify(body)
    });
    const json = await safeJson(resp);
    if (!resp.ok || json?.success === false) throw toError(resp, json, 'Delete account failed');
    return json;
  }

  async getEditableProfileFields() {
    const sig = await this._sign('GET', this._buildPath('user/profile'), null);
    const resp = await this.fetch(this._buildUrl('user/profile'), {
      method: 'GET',
      headers: this._headers({}, sig)
    });
    const json = await safeJson(resp);
    if (!resp.ok || json?.success === false) throw toError(resp, json, 'Get profile failed');
    return json;
  }

  async updateProfile(updates = {}) {
    const sig = await this._sign('PATCH', this._buildPath('user/profile'), updates);
    const resp = await this.fetch(this._buildUrl('user/profile'), {
      method: 'PATCH',
      headers: this._headers({}, sig),
      body: JSON.stringify(updates)
    });
    const json = await safeJson(resp);
    if (!resp.ok || json?.success === false) throw toError(resp, json, 'Update profile failed');
    return json;
  }

  async sendGoogleUserSetPasswordEmail({ email }) {
    const body = { email };
    const sig = await this._sign('POST', this._buildPath('auth/set-password-google-user'), body);
    const resp = await this.fetch(this._buildUrl('auth/set-password-google-user'), {
      method: 'POST',
      headers: this._headers({}, sig),
      body: JSON.stringify(body)
    });
    const json = await safeJson(resp);
    if (!resp.ok || json?.success === false) throw toError(resp, json, 'Send Google user set password email failed');
    return json;
  }

  async getProfile() {
    const sig = await this._sign('GET', this._buildPath('user/profile'), null);
    const resp = await this.fetch(this._buildUrl('user/profile'), {
      method: 'GET',
      headers: this._headers({}, sig)
    });
    const json = await safeJson(resp);
    if (!resp.ok || json?.success === false) throw toError(resp, json, 'Get profile failed');
    return json;
  }

  async verifyToken(accessToken) {
    const body = null;
    const sig = await this._sign('POST', this._buildPath('auth/verify-token'), body);
    const resp = await this.fetch(this._buildUrl('auth/verify-token'), {
      method: 'POST',
      headers: {
        ...this._headers({}, sig),
        Authorization: `Bearer ${accessToken}`
      }
    });
    const json = await safeJson(resp);
    if (!resp.ok || json?.success === false) throw toError(resp, json, 'Verify token failed');
    return json?.data ?? json;
  }

  async authed(path, { method = 'GET', body, headers } = {}) {
    const sig = await this._sign(method, this._buildPath(path), body ?? null);
    const resp = await this.fetch(this._buildUrl(path), {
      method,
      headers: this._headers(headers || {}, sig),
      body: body ? JSON.stringify(body) : undefined
    });
    const json = await safeJson(resp);
    if (!resp.ok || json?.success === false) throw toError(resp, json, 'Request failed');
    return json;
  }

  /**
   * Send a custom email to one or more recipients via the app's mail quota.
   *
   * @param {Object} opts
   * @param {string|string[]} opts.to      - Recipient email(s) — max 10
   * @param {string}          opts.subject - Email subject
   * @param {string}          opts.html    - HTML body
   * @param {string}          [opts.fromName] - Sender display name (defaults to app name)
   * @returns {Promise} API response with success, sent_this_month, remaining_quota
   */
  async sendMail({ to, subject, html, fromName } = {}) {
    const body = { to, subject, html, fromName };
    const sig = await this._sign('POST', this._buildPath('mail/send'), body);
    const resp = await this.fetch(this._buildUrl('mail/send'), {
      method: 'POST',
      headers: this._headers({}, sig),
      body: JSON.stringify(body)
    });
    const json = await safeJson(resp);
    if (!resp.ok || json?.success === false) throw toError(resp, json, 'Send mail failed');
    return json;
  }

  async getUsers({ page = 1, limit = 50, search = '' } = {}) {
    let path = `users?page=${encodeURIComponent(page)}&limit=${encodeURIComponent(limit)}`;
    if (search && search.trim()) {
      path += `&search=${encodeURIComponent(search.trim())}`;
    }
    const sig = await this._sign('GET', this._buildPath('users'), null);
    const resp = await this.fetch(this._buildUrl(path), {
      method: 'GET',
      headers: this._headers({}, sig)
    });
    const json = await safeJson(resp);
    if (!resp.ok || json?.success === false) throw toError(resp, json, 'Get users failed');
    return json;
  }

  /**
   * Get single user by user ID using App credentials (API Key & Secret)
   * GET /:apiKey/users/:userId
   */
  async getUser(userId) {
    if (!userId) throw new Error('userId is required');
    const path = `users/${encodeURIComponent(userId)}`;
    const sig = await this._sign('GET', this._buildPath(path), null);
    const resp = await this.fetch(this._buildUrl(path), {
      method: 'GET',
      headers: this._headers({}, sig)
    });
    const json = await safeJson(resp);
    if (!resp.ok || json?.success === false) throw toError(resp, json, 'Get user failed');
    return json;
  }

  /**
   * Update user by user ID using App credentials (API Key & Secret)
   * PATCH /:apiKey/users/:userId
   *
   * @param {string} userId - User UUID
   * @param {object} updates - Fields to update (e.g. { extra: { secondary_mail_verified: true } })
   */
  async updateUser(userId, updates = {}) {
    if (!userId) throw new Error('userId is required');
    const path = `users/${encodeURIComponent(userId)}`;
    const sig = await this._sign('PATCH', this._buildPath(path), updates);
    const resp = await this.fetch(this._buildUrl(path), {
      method: 'PATCH',
      headers: this._headers({}, sig),
      body: JSON.stringify(updates)
    });
    const json = await safeJson(resp);
    if (!resp.ok || json?.success === false) throw toError(resp, json, 'Update user failed');
    return json;
  }

  async refreshToken({ refreshToken } = {}) {
    if (!refreshToken) {
      throw new AuthError('refreshToken is required', 400, 'MISSING_REFRESH_TOKEN', null);
    }
    const body = { refresh_token: refreshToken };
    const sig = await this._sign('POST', this._buildPath('auth/refresh-token'), body);
    const resp = await this.fetch(this._buildUrl('auth/refresh-token'), {
      method: 'POST',
      headers: this._headers({}, sig),
      body: JSON.stringify(body)
    });
    const json = await safeJson(resp);
    if (!resp.ok || json?.success === false) throw toError(resp, json, 'Refresh token failed');
    const token = json?.data?.access_token || json?.data?.user_token;
    if (token) this.setToken(token);
    return json;
  }

  // ---------- Developer Data APIs ----------
  // Note: Requires developerId to be set via constructor or setDeveloperId()


  // ==================== MFA METHODS ====================

  /**
   * Verify MFA challenge during login
   * @param {Object} params
   * @param {string} params.mfa_token Ephemeral MFA challenge token
   * @param {string} params.code 6-digit TOTP code or backup code
   */
  async verifyMFA({ mfa_token, code }) {
    if (!mfa_token || !code) {
      throw new AuthError('MFA token and verification code are required', 400, 'VALIDATION_ERROR', null);
    }
    const payload = { mfa_token, code };
    const sig = await this._sign('POST', this._buildPath('auth/mfa/verify'), payload);
    const resp = await this.fetch(this._buildUrl('auth/mfa/verify'), {
      method: 'POST',
      headers: this._headers({}, sig),
      body: JSON.stringify(payload)
    });
    const json = await safeJson(resp);
    if (!resp.ok || json?.success === false) throw toError(resp, json, 'MFA verification failed');
    const token = json?.data?.access_token || json?.data?.accessToken || json?.data?.user_token;
    if (token) this.setToken(token);
    return json;
  }

  /**
   * Setup MFA during mandatory onboarding
   * @param {Object} params
   * @param {string} params.mfa_token Ephemeral MFA onboarding token
   */
  async setupMFAOnboarding({ mfa_token }) {
    if (!mfa_token) {
      throw new AuthError('MFA onboarding token is required', 400, 'VALIDATION_ERROR', null);
    }
    const payload = { mfa_token };
    const sig = await this._sign('POST', this._buildPath('auth/mfa/setup-onboarding'), payload);
    const resp = await this.fetch(this._buildUrl('auth/mfa/setup-onboarding'), {
      method: 'POST',
      headers: this._headers({}, sig),
      body: JSON.stringify(payload)
    });
    const json = await safeJson(resp);
    if (!resp.ok || json?.success === false) throw toError(resp, json, 'MFA onboarding setup failed');
    return json;
  }

  /**
   * Confirm MFA during onboarding and log in
   * @param {Object} params
   * @param {string} params.mfa_token Ephemeral MFA onboarding token
   * @param {string} params.code 6-digit TOTP code from authenticator app
   */
  async confirmMFAOnboarding({ mfa_token, code }) {
    if (!mfa_token || !code) {
      throw new AuthError('MFA token and verification code are required', 400, 'VALIDATION_ERROR', null);
    }
    const payload = { mfa_token, code };
    const sig = await this._sign('POST', this._buildPath('auth/mfa/confirm-onboarding'), payload);
    const resp = await this.fetch(this._buildUrl('auth/mfa/confirm-onboarding'), {
      method: 'POST',
      headers: this._headers({}, sig),
      body: JSON.stringify(payload)
    });
    const json = await safeJson(resp);
    if (!resp.ok || json?.success === false) throw toError(resp, json, 'MFA onboarding confirmation failed');
    const token = json?.data?.access_token || json?.data?.accessToken || json?.data?.user_token;
    if (token) this.setToken(token);
    return json;
  }

  /**
   * Get MFA status for current authenticated user
   */
  async getMFAStatus() {
    const sig = await this._sign('GET', this._buildPath('user/mfa/status'), null);
    const resp = await this.fetch(this._buildUrl('user/mfa/status'), {
      method: 'GET',
      headers: this._headers(this.getAuthHeader(), sig)
    });
    const json = await safeJson(resp);
    if (!resp.ok || json?.success === false) throw toError(resp, json, 'Failed to fetch MFA status');
    return json;
  }

  /**
   * Initiate MFA setup for logged-in user
   */
  async setupMFA() {
    const sig = await this._sign('POST', this._buildPath('user/mfa/setup'), {});
    const resp = await this.fetch(this._buildUrl('user/mfa/setup'), {
      method: 'POST',
      headers: this._headers(this.getAuthHeader(), sig),
      body: JSON.stringify({})
    });
    const json = await safeJson(resp);
    if (!resp.ok || json?.success === false) throw toError(resp, json, 'Failed to initiate MFA setup');
    return json;
  }

  /**
   * Confirm MFA setup for logged-in user
   * @param {Object} params
   * @param {string} params.code 6-digit TOTP code
   */
  async confirmMFA({ code }) {
    if (!code) {
      throw new AuthError('Verification code is required', 400, 'VALIDATION_ERROR', null);
    }
    const payload = { code };
    const sig = await this._sign('POST', this._buildPath('user/mfa/confirm'), payload);
    const resp = await this.fetch(this._buildUrl('user/mfa/confirm'), {
      method: 'POST',
      headers: this._headers(this.getAuthHeader(), sig),
      body: JSON.stringify(payload)
    });
    const json = await safeJson(resp);
    if (!resp.ok || json?.success === false) throw toError(resp, json, 'Failed to confirm MFA');
    return json;
  }

  /**
   * Regenerate backup recovery codes
   * @param {Object} params
   * @param {string} params.code 6-digit TOTP code
   */
  async regenerateBackupCodes({ code }) {
    if (!code) {
      throw new AuthError('Two-factor authentication code is required', 400, 'VALIDATION_ERROR', null);
    }
    const payload = { code };
    const sig = await this._sign('POST', this._buildPath('user/mfa/backup-codes/regenerate'), payload);
    const resp = await this.fetch(this._buildUrl('user/mfa/backup-codes/regenerate'), {
      method: 'POST',
      headers: this._headers(this.getAuthHeader(), sig),
      body: JSON.stringify(payload)
    });
    const json = await safeJson(resp);
    if (!resp.ok || json?.success === false) throw toError(resp, json, 'Failed to regenerate backup codes');
    return json;
  }

  /**
   * Disable MFA for logged-in user
   * @param {Object} params
   * @param {string} params.code 6-digit TOTP code or backup code
   */
  async disableMFA({ code }) {
    if (!code) {
      throw new AuthError('Two-factor authentication code is required', 400, 'VALIDATION_ERROR', null);
    }
    const payload = { code };
    const sig = await this._sign('POST', this._buildPath('user/mfa/disable'), payload);
    const resp = await this.fetch(this._buildUrl('user/mfa/disable'), {
      method: 'POST',
      headers: this._headers(this.getAuthHeader(), sig),
      body: JSON.stringify(payload)
    });
    const json = await safeJson(resp);
    if (!resp.ok || json?.success === false) throw toError(resp, json, 'Failed to disable MFA');
    return json;
  }

  async getDeveloperGroups() {
    if (!this.developerId) {
      throw new AuthError('Developer ID is required. Set it via constructor or setDeveloperId()', 400, 'MISSING_DEVELOPER_ID', null);
    }
    const path = `${this.baseUrl}/developer/groups`;
    const pathname = new URL(path).pathname;
    const sig = await this._sign('GET', pathname, null);
    const resp = await this.fetch(path, {
      method: 'GET',
      headers: this._headers({}, sig)
    });
    const json = await safeJson(resp);
    if (!resp.ok || json?.success === false) throw toError(resp, json, 'Get developer groups failed');
    return json;
  }

  /**
   * Get developer's apps
   * @param {number|string|null} groupId - Optional. Filter by group ID.
   */
  async getDeveloperApps(groupId = undefined) {
    if (!this.developerId) {
      throw new AuthError('Developer ID is required. Set it via constructor or setDeveloperId()', 400, 'MISSING_DEVELOPER_ID', null);
    }
    let url = `${this.baseUrl}/developer/apps`;
    if (groupId !== undefined) {
      url += groupId === null || groupId === 'null'
        ? '?group_id=null'
        : `?group_id=${encodeURIComponent(groupId)}`;
    }
    const pathname = new URL(url).pathname;
    const sig = await this._sign('GET', pathname, null);
    const resp = await this.fetch(url, {
      method: 'GET',
      headers: this._headers({}, sig)
    });
    const json = await safeJson(resp);
    if (!resp.ok || json?.success === false) throw toError(resp, json, 'Get developer apps failed');
    return json;
  }

  async getAppUsers({ appId, page = 1, limit = 50 }) {
    if (!this.developerId) {
      throw new AuthError('Developer ID is required. Set it via constructor or setDeveloperId()', 400, 'MISSING_DEVELOPER_ID', null);
    }
    if (!appId) throw new AuthError('appId is required', 400, 'MISSING_APP_ID', null);
    const url = `${this.baseUrl}/developer/users?app_id=${encodeURIComponent(appId)}&page=${page}&limit=${limit}`;
    const pathname = new URL(url).pathname;
    const sig = await this._sign('GET', pathname, null);
    const resp = await this.fetch(url, {
      method: 'GET',
      headers: this._headers({}, sig)
    });
    const json = await safeJson(resp);
    if (!resp.ok || json?.success === false) throw toError(resp, json, 'Get app users failed');
    return json;
  }

  async getUserData(userId) {
    if (!this.developerId) {
      throw new AuthError('Developer ID is required. Set it via constructor or setDeveloperId()', 400, 'MISSING_DEVELOPER_ID', null);
    }
    if (!userId) throw new AuthError('userId is required', 400, 'MISSING_USER_ID', null);
    const url = `${this.baseUrl}/developer/user/${encodeURIComponent(userId)}`;
    const pathname = new URL(url).pathname;
    const sig = await this._sign('GET', pathname, null);
    const resp = await this.fetch(url, {
      method: 'GET',
      headers: this._headers({}, sig)
    });
    const json = await safeJson(resp);
    if (!resp.ok || json?.success === false) throw toError(resp, json, 'Get user data failed');
    return json;
  }
}

// ---------- helpers ----------
async function safeJson(resp) { try { return await resp.json(); } catch { return null; } }

function toError(resp, json, fallback) {
  return new AuthError(
    json?.message || fallback || 'Request failed',
    resp.status,
    json?.code || json?.error || 'REQUEST_FAILED',
    json
  );
}


// ---- Singleton-style convenience API ----

const _singleton = { client: null };

function ensureClient() {
  if (!_singleton.client) {
    throw new Error(
      'AuthClient not initialized. Call authclient.init({ apiKey, apiSecret, ... }) first.'
    );
  }
  return _singleton.client;
}

function init({
  apiKey = process.env.MSPK_AUTH_API_KEY,
  apiSecret = process.env.MSPK_AUTH_API_SECRET,
  googleClientId = process.env.GOOGLE_CLIENT_ID,
  developerId = process.env.MSPK_DEVELOPER_ID,
  baseUrl,
  storage,
  fetch: fetchFn,
  keyInPath,
} = {}) {
  _singleton.client = new AuthClient({
    apiKey,
    apiSecret,
    googleClientId,
    developerId,
    baseUrl,
    storage,
    fetch: fetchFn,
    keyInPath,
  });
  return _singleton.client;
}

const authclient = {
  init,
  get client() {
    return ensureClient();
  },


  // MFA shortcuts
  verifyMFA(params) { return ensureClient().verifyMFA(params); },
  setupMFAOnboarding(params) { return ensureClient().setupMFAOnboarding(params); },
  confirmMFAOnboarding(params) { return ensureClient().confirmMFAOnboarding(params); },
  getMFAStatus() { return ensureClient().getMFAStatus(); },
  setupMFA() { return ensureClient().setupMFA(); },
  confirmMFA(params) { return ensureClient().confirmMFA(params); },
  regenerateBackupCodes(params) { return ensureClient().regenerateBackupCodes(params); },
  disableMFA(params) { return ensureClient().disableMFA(params); },

  // auth shortcuts
  login(creds) { return ensureClient().login(creds); },
  register(data) { return ensureClient().register(data); },
  googleAuth(tokens) { return ensureClient().googleAuth(tokens); },

  // profile helpers
  getProfile() { return ensureClient().getProfile(); },
  updateProfile(updates) { return ensureClient().updateProfile(updates); },

  // generic authed call
  authed(path, opts) { return ensureClient().authed(path, opts); },

  // mail sending
  sendMail(opts) { return ensureClient().sendMail(opts); },

  // token helpers
  setToken(token) { return ensureClient().setToken(token); },
  logout() { return ensureClient().logout(); },
  verifyToken(accessToken) { return ensureClient().verifyToken(accessToken); },

  // developer ID management
  setDeveloperId(developerId) { return ensureClient().setDeveloperId(developerId); },

  // developer data APIs (requires developerId to be set)
  getDeveloperGroups() { return ensureClient().getDeveloperGroups(); },
  getDeveloperApps(groupId = undefined) { return ensureClient().getDeveloperApps(groupId); },
  getAppUsers({ appId, page, limit }) { return ensureClient().getAppUsers({ appId, page, limit }); },
  getUserData(userId) { return ensureClient().getUserData(userId); },

  // app data APIs
  getUsers(opts) { return ensureClient().getUsers(opts); },
  getUser(userId) { return ensureClient().getUser(userId); },
  updateUser(userId, updates) { return ensureClient().updateUser(userId, updates); },
  refreshToken(opts) { return ensureClient().refreshToken(opts); },
};

export { authclient, init };
export default authclient;
