// ESM module
import { AuthError } from './errors.js';

export class AuthClient {
  // Convenience: allow users to create with only key/secret
  static create(apiKey, apiSecret, opts = {}) {
    return new AuthClient({ apiKey, apiSecret, ...opts });
  }

  constructor({
    apiKey,
    apiSecret,
    baseUrl = 'https://cpanel.backend.mspkapps.in/api/v1',
    storage,
    fetch: fetchFn,
    keyInPath = true, // default: use headers, not key in URL
  } = {}) {
    if (!apiKey) throw new Error('apiKey is required');
    if (!apiSecret) throw new Error('apiSecret is required'); // do not expose in browsers for prod
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.keyInPath = !!keyInPath;

    const f = fetchFn || (typeof window !== 'undefined' ? window.fetch : (typeof fetch !== 'undefined' ? fetch : null));
    if (!f) throw new Error('No fetch available. Pass { fetch } or run on Node 18+/browsers.');
    // Bind to avoid “Illegal invocation”
    this.fetch = (...args) => f(...args);

    this.storage = storage ?? (typeof window !== 'undefined' ? window.localStorage : null);
    this.tokenKey = 'auth_user_token';
    this.token = this._load(this.tokenKey);
  }

  // ---------- storage helpers ----------
  _load(key) { if (!this.storage) return null; try { return this.storage.getItem(key); } catch { return null; } }
  _save(key, val) { if (!this.storage) return; try { this.storage.setItem(key, val); } catch {} }
  _clear(key) { if (!this.storage) return; try { this.storage.removeItem(key); } catch {} }

  // ---------- internal builders ----------
  _buildUrl(path) {
    const p = path.startsWith('/') ? path.slice(1) : path;
    return this.keyInPath
      ? `${this.baseUrl}/${encodeURIComponent(this.apiKey)}/${p}`
      : `${this.baseUrl}/${p}`;
  }

  _headers(extra = {}) {
    return {
      'Content-Type': 'application/json',
      'X-API-Key': this.apiKey,
      'X-API-Secret': this.apiSecret,
      ...(this.token ? { Authorization: `UserToken ${this.token}` } : {}),
      ...extra
    };
  }

  setToken(token) {
    this.token = token || null;
    if (token) this._save(this.tokenKey, token);
    else this._clear(this.tokenKey);
  }

  getAuthHeader() { return this.token ? { Authorization: `UserToken ${this.token}` } : {}; }
  logout() { this.setToken(null); }

  // ---------- public API methods ----------
  async register({ email, username, password, name }) {
    const resp = await this.fetch(this._buildUrl('auth/register'), {
      method: 'POST',
      headers: this._headers(),
      body: JSON.stringify({ email, username, password, name })
    });
    const json = await safeJson(resp);
    if (!resp.ok || json?.success === false) throw toError(resp, json, 'Register failed');
    const token = json?.data?.user_token;
    if (token) this.setToken(token);
    return json;
  }

  async login({ email, username, password }) {
    const payload = email ? { email, password } : { username, password };
    const resp = await this.fetch(this._buildUrl('auth/login'), {
      method: 'POST',
      headers: this._headers(),
      body: JSON.stringify(payload)
    });
    const json = await safeJson(resp);
    if (!resp.ok || json?.success === false) throw toError(resp, json, 'Login failed');
    const token = json?.data?.user_token;
    if (token) this.setToken(token);
    return json;
  }

  async getProfile() {
    const resp = await this.fetch(this._buildUrl('auth/user/profile'), {
      method: 'GET',
      headers: this._headers()
    });
    const json = await safeJson(resp);
    if (!resp.ok || json?.success === false) throw toError(resp, json, 'Profile failed');
    return json;
  }

  // Generic authorized call for extra endpoints
  async authed(path, { method = 'GET', body, headers } = {}) {
    const resp = await this.fetch(this._buildUrl(path), {
      method,
      headers: this._headers(headers),
      body: body ? JSON.stringify(body) : undefined
    });
    const json = await safeJson(resp);
    if (!resp.ok || json?.success === false) throw toError(resp, json, 'Request failed');
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