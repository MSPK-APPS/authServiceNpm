# AuthClient NPM Package Documentation (Backend-Only Usage)

> All usage of `@mspkapps/auth-client` and all API keys/secrets **must live in your backend only**.
> Frontend apps (React / React Native) should **never** import this package or see the keys.
> They only call your backend, and your backend calls the AuthClient.

---

## 1. Backend Setup (Node / Express)

### 1.1 Install in Backend Only

In your backend project (e.g. `Backend/`):

```bash
npm install @mspkapps/auth-client
# or
yarn add @mspkapps/auth-client
```

Do **not** install this package in your frontend projects.

### 1.2 Environment Variables (Backend)

Create `.env` in your backend root:

```env
MSPK_AUTH_API_KEY=your_api_key_here
MSPK_AUTH_API_SECRET=your_api_secret_here
GOOGLE_CLIENT_ID=your_google_client_id_here
```

### 1.3 Initialize AuthClient Singleton

Create `src/auth/authClient.js` in your backend:

```javascript
import authclient from '@mspkapps/auth-client';

// Initialize once at backend startup
authclient.init({
  apiKey: process.env.MSPK_AUTH_API_KEY,
  apiSecret: process.env.MSPK_AUTH_API_SECRET,
  googleClientId: process.env.GOOGLE_CLIENT_ID
  // storage: omit on backend (no localStorage)
  // fetch: use global fetch (Node 18+) or pass custom
});

export default authclient;
```

### 1.4 Express Routes That Proxy to AuthClient

Example `src/routes/authRoutes.js`:

```javascript
import express from 'express';
import authclient from '../auth/authClient.js';
import { AuthError } from '@mspkapps/auth-client';

const router = express.Router();

// Helper to normalize errors for the frontend
function handleError(res, err, fallback = 'Request failed') {
  if (err instanceof AuthError) {
    return res.status(err.status || 400).json({
      success: false,
      message: err.message || fallback,
      code: err.code || 'REQUEST_FAILED',
      data: err.response?.data ?? null,
    });
  }

  console.error('Unexpected auth error:', err);
  return res.status(500).json({
    success: false,
    message: fallback,
    code: 'INTERNAL_ERROR',
  });
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { email, username, password, name, extra } = req.body;
    const resp = await authclient.register({ email, username, password, name, extra });
    return res.json(resp);
  } catch (err) {
    return handleError(res, err, 'Registration failed');
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, username, password } = req.body;
    const resp = await authclient.login({ email, username, password });
    return res.json(resp);
  } catch (err) {
    return handleError(res, err, 'Login failed');
  }
});

// POST /api/auth/google
router.post('/google', async (req, res) => {
  try {
    const { id_token } = req.body; // Frontend sends Google ID token
    const resp = await authclient.googleAuth({ id_token });
    return res.json(resp);
  } catch (err) {
    return handleError(res, err, 'Google auth failed');
  }
});

// POST /api/auth/request-password-reset
router.post('/request-password-reset', async (req, res) => {
  try {
    const { email } = req.body;
    const resp = await authclient.client.requestPasswordReset({ email });
    return res.json(resp);
  } catch (err) {
    return handleError(res, err, 'Password reset request failed');
  }
});

// POST /api/auth/request-change-password-link
router.post('/request-change-password-link', async (req, res) => {
  try {
    const { email } = req.body;
    const resp = await authclient.client.requestChangePasswordLink({ email });
    return res.json(resp);
  } catch (err) {
    return handleError(res, err, 'Change password link request failed');
  }
});

// POST /api/auth/resend-verification
router.post('/resend-verification', async (req, res) => {
  try {
    const { email, purpose } = req.body;
    const resp = await authclient.client.resendVerificationEmail({ email, purpose });
    return res.json(resp);
  } catch (err) {
    return handleError(res, err, 'Resend verification failed');
  }
});

// POST /api/auth/delete-account
router.post('/delete-account', async (req, res) => {
  try {
    const { email, password } = req.body;
    const resp = await authclient.client.deleteAccount({ email, password });
    return res.json(resp);
  } catch (err) {
    return handleError(res, err, 'Delete account failed');
  }
});

// POST /api/auth/verify-token
router.post('/verify-token', async (req, res) => {
  try {
    const { accessToken } = req.body;
    const data = await authclient.verifyToken(accessToken);
    return res.json({ success: true, data });
  } catch (err) {
    return handleError(res, err, 'Token verification failed');
  }
});

export default router;
```

### 1.5 Protected User Routes (Backend)

You typically store the `user_token` provided by AuthClient in your own session/JWT.
Example `src/middleware/requireAuth.js` that verifies your own access token using `authclient.verifyToken`:

```javascript
import authclient from '../auth/authClient.js';

export async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');

    if (!token) {
      return res.status(401).json({ success: false, message: 'Missing access token' });
    }

    const data = await authclient.verifyToken(token);
    req.user = data; // attach decoded user data to request
    return next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
}
```

Example profile routes in `src/routes/userRoutes.js`:

```javascript
import express from 'express';
import authclient from '../auth/authClient.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = express.Router();

// GET /api/user/profile
router.get('/profile', requireAuth, async (req, res) => {
  try {
    const resp = await authclient.getProfile();
    return res.json(resp);
  } catch (err) {
    console.error('Get profile failed:', err);
    return res.status(500).json({ success: false, message: 'Get profile failed' });
  }
});

// PATCH /api/user/profile
router.patch('/profile', requireAuth, async (req, res) => {
  try {
    const updates = req.body;
    const resp = await authclient.updateProfile(updates);
    return res.json(resp);
  } catch (err) {
    console.error('Update profile failed:', err);
    return res.status(500).json({ success: false, message: 'Update profile failed' });
  }
});

export default router;
```

### 1.6 Wire Up Routes in Backend App

In your backend `src/app.js`:

```javascript
import express from 'express';
import cors from 'cors';
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';

const app = express();

app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:3000'], credentials: true }));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);

export default app;
```

---

## 2. React (Vite) Frontend – Call Your Backend

Your React app **does not** import `@mspkapps/auth-client` and knows nothing about API keys.
It only calls your backend routes like `/api/auth/login`, `/api/auth/register`, etc.

### 2.1 API Service

Create `src/services/authApi.js` in your React app:

```javascript
const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';

export async function apiLogin({ email, password, username }) {
  const resp = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, username }),
  });

  const json = await resp.json();
  if (!resp.ok || json?.success === false) {
    throw new Error(json?.message || 'Login failed');
  }
  return json;
}

export async function apiRegister(payload) {
  const resp = await fetch(`${API_BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = await resp.json();
  if (!resp.ok || json?.success === false) {
    throw new Error(json?.message || 'Registration failed');
  }
  return json;
}

export async function apiGoogleLogin(idToken) {
  const resp = await fetch(`${API_BASE_URL}/api/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id_token: idToken }),
  });
  const json = await resp.json();
  if (!resp.ok || json?.success === false) {
    throw new Error(json?.message || 'Google login failed');
  }
  return json;
}

export async function apiGetProfile(accessToken) {
  const resp = await fetch(`${API_BASE_URL}/api/user/profile`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const json = await resp.json();
  if (!resp.ok || json?.success === false) {
    throw new Error(json?.message || 'Get profile failed');
  }
  return json;
}
```

### 2.2 Simple Auth Context (Frontend-Only State)

Create `src/context/AuthContext.jsx`:

```jsx
import { createContext, useContext, useState, useEffect } from 'react';
import { apiLogin, apiRegister, apiGoogleLogin, apiGetProfile } from '../services/authApi';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = window.localStorage.getItem('access_token');
    if (token) {
      setAccessToken(token);
      refreshProfile(token).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const refreshProfile = async (token) => {
    try {
      const resp = await apiGetProfile(token);
      setUser(resp.data);
    } catch {
      setUser(null);
      setAccessToken(null);
      window.localStorage.removeItem('access_token');
    }
  };

  const login = async (credentials) => {
    const resp = await apiLogin(credentials);
    const token = resp?.data?.access_token || resp?.data?.user_token;
    if (token) {
      setAccessToken(token);
      window.localStorage.setItem('access_token', token);
      await refreshProfile(token);
    }
    return resp;
  };

  const register = async (payload) => {
    const resp = await apiRegister(payload);
    const token = resp?.data?.access_token || resp?.data?.user_token;
    if (token) {
      setAccessToken(token);
      window.localStorage.setItem('access_token', token);
      await refreshProfile(token);
    }
    return resp;
  };

  const googleLogin = async (idToken) => {
    const resp = await apiGoogleLogin(idToken);
    const token = resp?.data?.access_token || resp?.data?.user_token;
    if (token) {
      setAccessToken(token);
      window.localStorage.setItem('access_token', token);
      await refreshProfile(token);
    }
    return resp;
  };

  const logout = () => {
    setUser(null);
    setAccessToken(null);
    window.localStorage.removeItem('access_token');
  };

  return (
    <AuthContext.Provider
      value={{ user, accessToken, loading, login, register, googleLogin, logout, isAuthenticated: !!user }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
```

### 2.3 Example Login Page (React Vite)

```jsx
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await login({ email, password });
      // navigate to dashboard
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
      <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" />
      <button type="submit">Login</button>
      {error && <div style={{ color: 'red' }}>{error}</div>}
    </form>
  );
}

export default LoginPage;
```

### 2.4 Google Login (React Vite)

Frontend just gets the Google `credential` and posts it to your backend:

```bash
npm install @react-oauth/google
```

```jsx
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';
import { useAuth } from '../context/AuthContext';

// In your root
<GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}>
  <AuthProvider>
    <App />
  </AuthProvider>
</GoogleOAuthProvider>;

// In login page
function LoginPage() {
  const { googleLogin } = useAuth();

  return (
    <GoogleLogin
      onSuccess={async (credentialResponse) => {
        try {
          await googleLogin(credentialResponse.credential);
        } catch (err) {
          console.error('Google login failed', err);
        }
      }}
      onError={() => console.log('Google login error')}
    />
  );
}
```

The Google ID token is sent to `/api/auth/google` on your backend, which then calls `authclient.googleAuth`.

---

## 3. React Native CLI – Call Your Backend

React Native app also **never** imports `@mspkapps/auth-client`. It talks only to your backend.

### 3.1 API Service (React Native)

Create `src/services/authApi.js`:

```javascript
const API_BASE_URL = process.env.BACKEND_URL || 'http://10.0.2.2:4000'; // Android emulator example

async function request(path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const resp = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await resp.json();
  if (!resp.ok || json?.success === false) {
    throw new Error(json?.message || 'Request failed');
  }
  return json;
}

export const apiLogin = (payload) => request('/api/auth/login', { method: 'POST', body: payload });
export const apiRegister = (payload) => request('/api/auth/register', { method: 'POST', body: payload });
export const apiGoogleLogin = (idToken) =>
  request('/api/auth/google', { method: 'POST', body: { id_token: idToken } });
export const apiGetProfile = (token) => request('/api/user/profile', { method: 'GET', token });
```

### 3.2 Auth Context (React Native)

```javascript
import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiLogin, apiRegister, apiGoogleLogin, apiGetProfile } from '../services/authApi';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const token = await AsyncStorage.getItem('access_token');
      if (token) {
        setAccessToken(token);
        await refreshProfile(token);
      }
      setLoading(false);
    })();
  }, []);

  const refreshProfile = async (token) => {
    try {
      const resp = await apiGetProfile(token);
      setUser(resp.data);
    } catch {
      setUser(null);
      setAccessToken(null);
      await AsyncStorage.removeItem('access_token');
    }
  };

  const login = async (payload) => {
    const resp = await apiLogin(payload);
    const token = resp?.data?.access_token || resp?.data?.user_token;
    if (token) {
      setAccessToken(token);
      await AsyncStorage.setItem('access_token', token);
      await refreshProfile(token);
    }
    return resp;
  };

  const register = async (payload) => {
    const resp = await apiRegister(payload);
    const token = resp?.data?.access_token || resp?.data?.user_token;
    if (token) {
      setAccessToken(token);
      await AsyncStorage.setItem('access_token', token);
      await refreshProfile(token);
    }
    return resp;
  };

  const googleLogin = async (idToken) => {
    const resp = await apiGoogleLogin(idToken);
    const token = resp?.data?.access_token || resp?.data?.user_token;
    if (token) {
      setAccessToken(token);
      await AsyncStorage.setItem('access_token', token);
      await refreshProfile(token);
    }
    return resp;
  };

  const logout = async () => {
    setUser(null);
    setAccessToken(null);
    await AsyncStorage.removeItem('access_token');
  };

  return (
    <AuthContext.Provider
      value={{ user, accessToken, loading, login, register, googleLogin, logout, isAuthenticated: !!user }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
```

### 3.3 Google Sign-In (React Native)

```bash
npm install @react-native-google-signin/google-signin
```

```javascript
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { useAuth } from '../context/AuthContext';

GoogleSignin.configure({
  webClientId: 'YOUR_WEB_CLIENT_ID_FROM_GOOGLE',
});

function LoginScreen() {
  const { login, googleLogin } = useAuth();

  const handleGoogle = async () => {
    try {
      await GoogleSignin.hasPlayServices();
      const userInfo = await GoogleSignin.signIn();
      const idToken = userInfo.idToken;
      await googleLogin(idToken); // sends to backend /api/auth/google
    } catch (err) {
      console.error('Google sign-in failed', err);
    }
  };

  // ...render buttons, etc.
}
```

---

## 4. Key & Security Guidelines

- `@mspkapps/auth-client` is **backend-only**.
- API key, secret, and `googleClientId` live **only in backend env vars**.
- Frontend talks to backend over HTTPS (`/api/auth/*`, `/api/user/*`).
- Frontend stores only **user-level access token** (e.g. in `localStorage` / `AsyncStorage`).
- Never expose API key/secret in web or mobile bundles.

---

## 5. Troubleshooting

### Frontend gets 4xx/5xx from backend

- Inspect backend logs; most errors will be `AuthError` thrown by AuthClient.
- Make sure backend env vars (`MSPK_AUTH_API_KEY`, `MSPK_AUTH_API_SECRET`) are set.

### Google login succeeds on client but fails on backend

- Ensure `GOOGLE_CLIENT_ID` in backend matches the client ID used on the frontend.
- Check that the frontend sends `credential` / `id_token` to `/api/auth/google` correctly.

---

## 6. Summary

- Install and initialize `@mspkapps/auth-client` **only in your backend**.
- Implement clean REST endpoints in your backend that call `authclient` methods.
- React and React Native frontends call those endpoints with plain HTTP (fetch/axios).
- This keeps API keys safe and maintains a clean separation between frontend and backend.
