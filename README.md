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

### 1.6 Developer Data Routes (Backend)

The AuthClient provides APIs to fetch developer-specific data (groups, apps, users). The **developer ID is automatically extracted** from the API key & secret, so you don't need to pass it explicitly.

Example `src/routes/developerRoutes.js`:

```javascript
import express from 'express';
import authclient from '../auth/authClient.js';
import { AuthError } from '@mspkapps/auth-client';

const router = express.Router();

function handleError(res, err, fallback = 'Request failed') {
  if (err instanceof AuthError) {
    return res.status(err.status || 400).json({
      success: false,
      message: err.message || fallback,
      code: err.code || 'REQUEST_FAILED',
      data: err.response?.data ?? null,
    });
  }
  console.error('Unexpected error:', err);
  return res.status(500).json({
    success: false,
    message: fallback,
    code: 'INTERNAL_ERROR',
  });
}

// GET /api/developer/groups
// Fetch all groups belonging to the authenticated developer
router.get('/groups', async (req, res) => {
  try {
    const resp = await authclient.getDeveloperGroups();
    return res.json(resp);
  } catch (err) {
    return handleError(res, err, 'Failed to fetch groups');
  }
});

// GET /api/developer/apps?group_id=123
// Fetch developer's apps
// - No query params: returns ALL apps (with and without groups)
// - ?group_id=123: returns apps in specific group
// - ?group_id=null: returns only apps NOT in any group
router.get('/apps', async (req, res) => {
  try {
    const { group_id } = req.query;
    
    let groupId;
    if (group_id === 'null' || group_id === '') {
      groupId = null; // Apps without groups
    } else if (group_id !== undefined) {
      groupId = group_id; // Specific group
    } // else undefined = all apps
    
    const resp = await authclient.getDeveloperApps(groupId);
    return res.json(resp);
  } catch (err) {
    return handleError(res, err, 'Failed to fetch apps');
  }
});

// GET /api/developer/users?app_id=123&page=1&limit=50
// Fetch users for a specific app (with pagination)
// Returns all user data EXCEPT password, including extra fields
router.get('/users', async (req, res) => {
  try {
    const { app_id, page = 1, limit = 50 } = req.query;
    
    if (!app_id) {
      return res.status(400).json({
        success: false,
        message: 'app_id query parameter is required'
      });
    }
    
    const resp = await authclient.getAppUsers({
      appId: app_id,
      page: parseInt(page),
      limit: parseInt(limit)
    });
    return res.json(resp);
  } catch (err) {
    return handleError(res, err, 'Failed to fetch users');
  }
});

// GET /api/developer/user/:user_id
// Fetch specific user data by user ID
// Returns complete user data (no password) including extra fields
router.get('/user/:user_id', async (req, res) => {
  try {
    const { user_id } = req.params;
    const resp = await authclient.getUserData(user_id);
    return res.json(resp);
  } catch (err) {
    return handleError(res, err, 'Failed to fetch user data');
  }
});

export default router;
```

**Usage Examples:**

```javascript
// Get all groups
GET /api/developer/groups
Response: { success: true, data: [...groups] }

// Get all apps (both in groups and standalone)
GET /api/developer/apps
Response: { success: true, data: [...apps] }

// Get apps in a specific group
GET /api/developer/apps?group_id=123
Response: { success: true, data: [...apps] }

// Get only apps NOT in any group
GET /api/developer/apps?group_id=null
Response: { success: true, data: [...apps] }

// Get users for an app (paginated)
GET /api/developer/users?app_id=456&page=1&limit=50
Response: {
  success: true,
  data: [...users],
  pagination: {
    currentPage: 1,
    totalPages: 5,
    totalUsers: 234,
    limit: 50
  }
}

// Get specific user
GET /api/developer/user/789
Response: {
  success: true,
  data: {
    id: 789,
    username: "john_doe",
    email: "john@example.com",
    name: "John Doe",
    extra: { country: "USA", age: 30 },
    is_email_verified: true,
    // ... no password field
  }
}
```

### 1.7 Wire Up Routes in Backend App

In your backend `src/app.js`:

```javascript
import express from 'express';
import cors from 'cors';
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import developerRoutes from './routes/developerRoutes.js'; // NEW

const app = express();

app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:3000'], credentials: true }));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/developer', developerRoutes); // NEW

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

// Developer Data APIs (if building a developer dashboard)
export async function apiGetGroups() {
  const resp = await fetch(`${API_BASE_URL}/api/developer/groups`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });
  const json = await resp.json();
  if (!resp.ok || json?.success === false) {
    throw new Error(json?.message || 'Get groups failed');
  }
  return json;
}

export async function apiGetApps(groupId) {
  const url = groupId !== undefined
    ? `${API_BASE_URL}/api/developer/apps?group_id=${groupId}`
    : `${API_BASE_URL}/api/developer/apps`;
  const resp = await fetch(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });
  const json = await resp.json();
  if (!resp.ok || json?.success === false) {
    throw new Error(json?.message || 'Get apps failed');
  }
  return json;
}

export async function apiGetAppUsers(appId, page = 1, limit = 50) {
  const resp = await fetch(
    `${API_BASE_URL}/api/developer/users?app_id=${appId}&page=${page}&limit=${limit}`,
    {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    }
  );
  const json = await resp.json();
  if (!resp.ok || json?.success === false) {
    throw new Error(json?.message || 'Get users failed');
  }
  return json;
}

export async function apiGetUserData(userId) {
  const resp = await fetch(`${API_BASE_URL}/api/developer/user/${userId}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });
  const json = await resp.json();
  if (!resp.ok || json?.success === false) {
    throw new Error(json?.message || 'Get user data failed');
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

### 2.5 Example Developer Dashboard Page (React Vite)

If you're building a developer dashboard that displays groups, apps, and users:

```jsx
import { useState, useEffect } from 'react';
import { apiGetGroups, apiGetApps, apiGetAppUsers } from '../services/authApi';

function DeveloperDashboard() {
  const [groups, setGroups] = useState([]);
  const [apps, setApps] = useState([]);
  const [selectedApp, setSelectedApp] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [groupsResp, appsResp] = await Promise.all([
        apiGetGroups(),
        apiGetApps() // Get all apps
      ]);
      setGroups(groupsResp.data);
      setApps(appsResp.data);
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async (appId) => {
    try {
      const resp = await apiGetAppUsers(appId, 1, 50);
      setUsers(resp.data);
      setSelectedApp(appId);
    } catch (err) {
      console.error('Failed to load users:', err);
    }
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      <h1>Developer Dashboard</h1>
      
      <section>
        <h2>Groups ({groups.length})</h2>
        <ul>
          {groups.map(group => (
            <li key={group.id}>{group.name}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Apps ({apps.length})</h2>
        <ul>
          {apps.map(app => (
            <li key={app.id}>
              {app.app_name} {app.group_name && `(Group: ${app.group_name})`}
              <button onClick={() => loadUsers(app.id)}>View Users</button>
            </li>
          ))}
        </ul>
      </section>

      {selectedApp && (
        <section>
          <h2>Users for App {selectedApp}</h2>
          <ul>
            {users.map(user => (
              <li key={user.id}>
                {user.email} - {user.name}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export default DeveloperDashboard;
```

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

// Developer Data APIs
export const apiGetGroups = () => request('/api/developer/groups', { method: 'GET' });
export const apiGetApps = (groupId) => {
  const path = groupId !== undefined 
    ? `/api/developer/apps?group_id=${groupId}` 
    : '/api/developer/apps';
  return request(path, { method: 'GET' });
};
export const apiGetAppUsers = (appId, page = 1, limit = 50) =>
  request(`/api/developer/users?app_id=${appId}&page=${page}&limit=${limit}`, { method: 'GET' });
export const apiGetUserData = (userId) => request(`/api/developer/user/${userId}`, { method: 'GET' });
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
- Frontend talks to backend over HTTPS (`/api/auth/*`, `/api/user/*`, `/api/developer/*`).
- Frontend stores only **user-level access token** (e.g. in `localStorage` / `AsyncStorage`).
- Never expose API key/secret in web or mobile bundles.
- **Developer ID is automatically extracted** from API key/secret by the backend - no need to pass it explicitly.

---

## 5. API Reference

### 5.1 Authentication APIs

| Method | Endpoint | Description |
|--------|----------|-------------|
| `authclient.register()` | `POST /api/auth/register` | Register new user |
| `authclient.login()` | `POST /api/auth/login` | Login user |
| `authclient.googleAuth()` | `POST /api/auth/google` | Google OAuth login |
| `authclient.verifyToken()` | `POST /api/auth/verify-token` | Verify access token |

### 5.2 User Profile APIs

| Method | Endpoint | Description |
|--------|----------|-------------|
| `authclient.getProfile()` | `GET /api/user/profile` | Get user profile |
| `authclient.updateProfile()` | `PATCH /api/user/profile` | Update user profile |

### 5.3 Developer Data APIs (NEW)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `authclient.getDeveloperGroups()` | `GET /api/developer/groups` | Get all groups for the authenticated developer |
| `authclient.getDeveloperApps()` | `GET /api/developer/apps` | Get all apps (with and without groups) |
| `authclient.getDeveloperApps(123)` | `GET /api/developer/apps?group_id=123` | Get apps in specific group |
| `authclient.getDeveloperApps(null)` | `GET /api/developer/apps?group_id=null` | Get apps NOT in any group |
| `authclient.getAppUsers({ appId, page, limit })` | `GET /api/developer/users?app_id=X&page=Y&limit=Z` | Get users for specific app (paginated) |
| `authclient.getUserData(userId)` | `GET /api/developer/user/:user_id` | Get specific user data |

**Notes:**
- All user data responses **exclude the password field** for security
- User data includes all custom `extra` fields configured for the app
- `developer_id` is **automatically extracted** from API key & secret - you never pass it manually
- Pagination is supported for user lists with `page` and `limit` parameters

---

## 6. Troubleshooting

### Frontend gets 4xx/5xx from backend

- Inspect backend logs; most errors will be `AuthError` thrown by AuthClient.
- Make sure backend env vars (`MSPK_AUTH_API_KEY`, `MSPK_AUTH_API_SECRET`) are set.

### Google login succeeds on client but fails on backend

- Ensure `GOOGLE_CLIENT_ID` in backend matches the client ID used on the frontend.
- Check that the frontend sends `credential` / `id_token` to `/api/auth/google` correctly.

### Developer data APIs return 403/404

- Verify that the API key & secret in your backend env vars are correct.
- The developer ID is extracted automatically from these credentials.
- Ensure you're querying data that belongs to the authenticated developer.

### App users query returns empty results

- Verify the `app_id` belongs to the authenticated developer.
- Check that the app actually has registered users.

---

## 7. Summary

- Install and initialize `@mspkapps/auth-client` **only in your backend**.
- Implement clean REST endpoints in your backend that call `authclient` methods.
- React and React Native frontends call those endpoints with plain HTTP (fetch/axios).
- This keeps API keys safe and maintains a clean separation between frontend and backend.
- Use the new **Developer Data APIs** to build dashboards that display groups, apps, and users.
- Developer ID is **automatically extracted** from API credentials - never passed manually.
