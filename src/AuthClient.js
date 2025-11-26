import { AuthError } from './errors.js';

export class AuthClient {
  constructor(opts = {}) {
    this.baseUrl = opts.baseUrl?.replace(/\/+$/,'') || 'http://localhost:5001/api/v1';
    this.apiKey = opts.apiKey || null;        // Public key (optional)
    this.apiSecret = opts.apiSecret || null;  // NEVER use secret in browser
    this.token = null;
    this.fetchFn = opts.fetch || fetch;
  }

  setToken(token) {
    this.token = token;
  }

  clearToken() {
    this.token = null;
  }

  async register({ email, password, name, username }) {
    return this._request('POST', '/register', { email, password, name, username });
  }

  async login({ email, password }) {
    const res = await this._request('POST', '/login', { email, password });
    if (res?.data?.access_token) this.token = res.data.access_token;
    return res;
  }

  async getProfile() {
    return this._request('GET', '/user/profile');
  }

  async verifyEmail(token) {
    return this._request('GET', `/verify-email?token=${encodeURIComponent(token)}`);
  }

  // Generic authed request to your protected API (public layer)
  async authed(path, options = {}) {
    return this._request(options.method || 'GET', path, options.body, options);
  }

  async _request(method, path, body, extra = {}) {
    const headers = { 'Content-Type': 'application/json' };

    // Optional API key/secret (only server-side for secret)
    if (this.apiKey) headers['X-API-Key'] = this.apiKey;
    if (this.apiSecret) headers['X-API-Secret'] = this.apiSecret;

    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;

    const url = path.startsWith('http') ? path : this.baseUrl + path;

    const resp = await this.fetchFn(url, {
      method,
      headers,
      body: body && method !== 'GET' ? JSON.stringify(body) : undefined
    });

    const json = await resp.json().catch(() => ({}));

    if (!resp.ok || json.success === false) {
      throw new AuthError(
        json.message || 'Request failed',
        resp.status,
        json.error || 'REQUEST_FAILED',
        json
      );
    }

    return json;
  }
}