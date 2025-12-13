# Auth Server Demo - Complete Documentation

A beginner-friendly guide to implementing authentication using the `@mspkapps/auth-client` package with **React Web** and **React Native**.

## Table of Contents
- [Overview](#overview)
- [Installation](#installation)
  - [React Web](#react-web-setup)
  - [React Native](#react-native-setup)
- [Setup](#setup)
  - [React Web](#react-web-1)
  - [React Native](#react-native-1)
- [Available Functions](#available-functions)
- [Implementation Examples](#implementation-examples)
  - [React Web Examples](#react-web-examples)
  - [React Native Examples](#react-native-examples)
- [Common Patterns](#common-patterns)
- [Troubleshooting](#troubleshooting)

---

## Overview

This demo project showcases how to integrate the `@mspkapps/auth-client` authentication package in a React application. It includes:

- ✅ Email/Password Authentication
- ✅ Google Sign-In (OAuth)
- ✅ User Registration
- ✅ Password Reset Flow
- ✅ Email Verification
- ✅ Account Management (Delete Account)
- ✅ Protected User Profile

---

## Installation

### React Web Setup

#### 1. Create a New React Project (with Vite)

```bash
npm create vite@latest my-auth-app -- --template react
cd my-auth-app
```

#### 2. Install Required Dependencies

```bash
npm install @mspkapps/auth-client @react-oauth/google
```

### React Native Setup

#### 1. Create a New React Native Project

```bash
# Using Expo (recommended for beginners)
npx create-expo-app my-auth-app
cd my-auth-app

# Or using React Native CLI
npx react-native init my-auth-app
cd my-auth-app
```

#### 2. Install Required Dependencies

```bash
# For Expo
npx expo install @mspkapps/auth-client @react-native-google-signin/google-signin react-native-async-storage

# For React Native CLI
npm install @mspkapps/auth-client @react-native-google-signin/google-signin react-native-async-storage
```

#### 3. Configure Google Sign-In (Expo)

Add to your `app.json`:

```json
{
  "expo": {
    "plugins": [
      [
        "@react-native-google-signin/google-signin",
        {
          "androidClientId": "YOUR_ANDROID_CLIENT_ID.apps.googleusercontent.com",
          "iosClientId": "YOUR_IOS_CLIENT_ID.apps.googleusercontent.com"
        }
      ]
    ]
  }
}
```

Then run:
```bash
npx expo prebuild
```

---

## Setup

### React Web

#### Step 1: Create Authentication Context

Create `src/AuthContext.jsx` to manage authentication state across your app:

```jsx
import React, { createContext, useContext, useCallback, useState, useMemo } from 'react';
import { AuthClient } from '@mspkapps/auth-client';

// Replace these with your actual API keys
const PUBLIC_KEY = 'your_public_api_key_here';
const API_SECRET = 'your_api_secret_here';

// Initialize the auth client
// Note: baseUrl is already configured in the package, no need to override it
const authClient = AuthClient.create(PUBLIC_KEY, API_SECRET, {
  keyInPath: true,        // Use API key in URL path
  storage: null,          // Keep token in memory only (more secure)
  fetch: (input, init = {}) => {
    // Add required headers to all requests
    const headers = new Headers(init.headers || {});
    if (!headers.has('X-API-Key')) headers.set('X-API-Key', PUBLIC_KEY);
    if (!headers.has('X-API-Secret')) headers.set('X-API-Secret', API_SECRET);
    
    // Convert token format from "UserToken" to "Bearer" (if needed by your server)
    if (headers.has('Authorization')) {
      const authHeader = headers.get('Authorization');
      if (authHeader.startsWith('UserToken ')) {
        headers.set('Authorization', 'Bearer ' + authHeader.substring(10));
      }
    }
    
    return window.fetch(input, { ...init, headers });
  },
});

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Email/Password Login
  const login = useCallback(async ({ email, password }) => {
    setError(null);
    setLoading(true);
    try {
      const res = await authClient.login({ email, password });
      const token = res?.data?.access_token;
      if (token) {
        authClient.setToken(token);
      }
      setUser(res?.data?.user || null);
      setToken(authClient.token);
      return res?.data?.user || null;
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Google Sign-In
  const googleLogin = useCallback(async (idToken) => {
    setError(null);
    setLoading(true);
    try {
      const res = await authClient.googleAuth({ id_token: idToken });
      const token = res?.data?.user_token || res?.data?.access_token;
      if (token) {
        authClient.setToken(token);
      }
      setUser(res?.data?.user || null);
      setToken(authClient.token || token);
      return { user: res?.data?.user, isNewUser: res?.data?.is_new_user };
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Logout
  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    authClient.token = null;
  }, []);

  // Refresh User Profile
  const refreshProfile = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await authClient.getProfile();
      setUser(res.data.user);
      return res.data.user;
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [token]);

  const value = useMemo(
    () => ({ authClient, user, token, login, googleLogin, logout, refreshProfile, loading, error }),
    [user, token, login, googleLogin, logout, refreshProfile, loading, error]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Custom hook to use auth context
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
```

### React Native

#### Step 1: Create Authentication Context

Create `src/AuthContext.js` with AsyncStorage support for React Native:

```jsx
import React, { createContext, useContext, useCallback, useState, useMemo } from 'react';
import { AuthClient } from '@mspkapps/auth-client';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Replace these with your actual API keys
const PUBLIC_KEY = 'your_public_api_key_here';
const API_SECRET = 'your_api_secret_here';

// Initialize the auth client with AsyncStorage for React Native
const authClient = AuthClient.create(PUBLIC_KEY, API_SECRET, {
  keyInPath: true,
  storage: AsyncStorage,  // Use AsyncStorage instead of localStorage
  fetch: (input, init = {}) => {
    const headers = new Headers(init.headers || {});
    if (!headers.has('X-API-Key')) headers.set('X-API-Key', PUBLIC_KEY);
    if (!headers.has('X-API-Secret')) headers.set('X-API-Secret', API_SECRET);
    
    if (headers.has('Authorization')) {
      const authHeader = headers.get('Authorization');
      if (authHeader.startsWith('UserToken ')) {
        headers.set('Authorization', 'Bearer ' + authHeader.substring(10));
      }
    }
    
    // Use global fetch available in React Native
    return fetch(input, { ...init, headers });
  },
});

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isReady, setIsReady] = useState(false);

  // Load token from storage on mount
  React.useEffect(() => {
    const bootstrapAsync = async () => {
      try {
        const savedToken = await AsyncStorage.getItem('auth_user_token');
        if (savedToken) {
          authClient.setToken(savedToken);
          setToken(savedToken);
          
          // Fetch user profile
          try {
            const res = await authClient.getProfile();
            setUser(res.data.user);
          } catch (err) {
            // Token might be invalid
            await AsyncStorage.removeItem('auth_user_token');
            authClient.setToken(null);
            setToken(null);
          }
        }
      } catch (err) {
        console.error('Failed to restore token', err);
      } finally {
        setIsReady(true);
      }
    };

    bootstrapAsync();
  }, []);

  const login = useCallback(async ({ email, password }) => {
    setError(null);
    setLoading(true);
    try {
      const res = await authClient.login({ email, password });
      const token = res?.data?.access_token;
      if (token) {
        authClient.setToken(token);
      }
      setUser(res?.data?.user || null);
      setToken(authClient.token);
      return res?.data?.user || null;
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const googleLogin = useCallback(async (idToken) => {
    setError(null);
    setLoading(true);
    try {
      const res = await authClient.googleAuth({ id_token: idToken });
      const token = res?.data?.user_token || res?.data?.access_token;
      if (token) {
        authClient.setToken(token);
      }
      setUser(res?.data?.user || null);
      setToken(authClient.token || token);
      return { user: res?.data?.user, isNewUser: res?.data?.is_new_user };
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    setUser(null);
    setToken(null);
    authClient.token = null;
    await AsyncStorage.removeItem('auth_user_token');
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await authClient.getProfile();
      setUser(res.data.user);
      return res.data.user;
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [token]);

  const value = useMemo(
    () => ({ authClient, user, token, login, googleLogin, logout, refreshProfile, loading, error, isReady }),
    [user, token, login, googleLogin, logout, refreshProfile, loading, error, isReady]
  );

  return (
    <AuthContext.Provider value={value}>
      {isReady ? children : null}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
```

#### Step 2: Setup Navigation

Create `src/Navigation.js` for handling navigation between Login and Home:

```jsx
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from './AuthContext';
import LoginScreen from './screens/LoginScreen';
import RegisterScreen from './screens/RegisterScreen';
import HomeScreen from './screens/HomeScreen';
import SplashScreen from './screens/SplashScreen';

const Stack = createNativeStackNavigator();

export function RootNavigator() {
  const { user, isReady } = useAuth();

  if (!isReady) {
    return <SplashScreen />;
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{ headerShown: false }}
      >
        {user ? (
          <Stack.Screen name="Home" component={HomeScreen} />
        ) : (
          <Stack.Group screenOptions={{ animationEnabled: false }}>
            <Stack.Screen name="Auth" component={AuthNavigator} />
          </Stack.Group>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

function AuthNavigator() {
  const [showRegister, setShowRegister] = React.useState(false);

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: true,
        animationEnabled: false,
      }}
    >
      {showRegister ? (
        <Stack.Screen
          name="Register"
          component={RegisterScreen}
          options={{
            title: 'Sign Up',
            headerLeft: () => (
              <TouchableOpacity onPress={() => setShowRegister(false)}>
                <Text>Back</Text>
              </TouchableOpacity>
            ),
          }}
        />
      ) : (
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{
            title: 'Login',
            headerRight: () => (
              <TouchableOpacity onPress={() => setShowRegister(true)}>
                <Text>Sign Up</Text>
              </TouchableOpacity>
            ),
          }}
        />
      )}
    </Stack.Navigator>
  );
}
```

#### Step 3: Setup Root App Component

Update `App.js` (or `App.jsx`):

```jsx
import React from 'react';
import { AuthProvider } from './src/AuthContext';
import { RootNavigator } from './src/Navigation';

export default function App() {
  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}
```

Update `src/main.jsx` to wrap your app with both AuthProvider and GoogleOAuthProvider:

```jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { AuthProvider } from './AuthContext.jsx';
import { GoogleOAuthProvider } from '@react-oauth/google';
import './index.css';

// Replace with your Google Client ID from Google Cloud Console
const GOOGLE_CLIENT_ID = 'your_google_client_id_here';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </GoogleOAuthProvider>
  </React.StrictMode>
);
```

### Step 3: Create Main App Component

Create `src/App.jsx` to handle routing between Login and Home:

```jsx
import React, { useState } from 'react';
import { useAuth } from './AuthContext.jsx';
import Login from './components/Login.jsx';
import Register from './components/Register.jsx';
import Home from './components/Home.jsx';
import './App.css';

export default function App() {
  const { user } = useAuth();
  const [showRegister, setShowRegister] = useState(false);

  // If user is logged in, show Home page
  if (user) {
    return <Home />;
  }

  // Otherwise, show Login or Register page
  return (
    <div className="app-container">
      <div className="auth-toggle">
        <button 
          onClick={() => setShowRegister(false)}
          className={!showRegister ? 'active' : ''}
        >
          Login
        </button>
        <button 
          onClick={() => setShowRegister(true)}
          className={showRegister ? 'active' : ''}
        >
          Sign Up
        </button>
      </div>
      {showRegister ? <Register /> : <Login />}
    </div>
  );
}
```

---

## Available Functions

### Core Authentication Methods

All functions are accessed through the `authClient` object or the `useAuth()` hook.

#### 1. **register** - Create a new user account

```javascript
await authClient.register({ 
  email: 'user@example.com', 
  username: 'johndoe',      // Optional
  password: 'securePass123', 
  name: 'John Doe'          // Optional
});
```

**Parameters:**
- `email` (required): User's email address
- `username` (optional): Unique username
- `password` (required): User's password
- `name` (optional): User's display name

**Response:** Returns user data and automatically sets authentication token.

---

#### 2. **login** - Login with email/username and password

```javascript
await authClient.login({ 
  email: 'user@example.com', 
  password: 'securePass123' 
});

// Or login with username
await authClient.login({ 
  username: 'johndoe', 
  password: 'securePass123' 
});
```

**Parameters:**
- `email` OR `username` (required): User identifier
- `password` (required): User's password

**Response:** Returns user data and authentication token.

---

#### 3. **googleAuth** - Login/Register with Google Sign-In

```javascript
await authClient.googleAuth({ 
  id_token: 'google_id_token_here' 
});

// Alternative: use access_token
await authClient.googleAuth({ 
  access_token: 'google_access_token_here' 
});
```

**Parameters:**
- `id_token` (required if no access_token): Google ID token from credential response
- `access_token` (alternative): Google access token

**Response:** Returns user data, token, and `is_new_user` flag (true if this is first login).

**Note:** Use with `@react-oauth/google` package for the Google Sign-In button.

---

#### 4. **logout** - Clear authentication token

```javascript
authClient.logout();
```

**Parameters:** None

**Response:** Clears the stored token.

---

#### 5. **getProfile** - Get current user's profile

```javascript
const response = await authClient.getProfile();
console.log(response.data.user);
```

**Parameters:** None (requires authentication token)

**Response:** Returns current user's profile data.

---

### Password Management

#### 6. **requestPasswordReset** - Send password reset email

```javascript
await authClient.requestPasswordReset({ 
  email: 'user@example.com' 
});
```

**Parameters:**
- `email` (required): Email address to send reset link

**Response:** Success message confirming email was sent.

**Use Case:** When user forgot their password on login page.

---

#### 7. **requestChangePasswordLink** - Send password change email for logged-in users

```javascript
await authClient.requestChangePasswordLink({ 
  email: 'user@example.com' 
});
```

**Parameters:**
- `email` (required): User's email address

**Response:** Success message confirming email was sent.

**Use Case:** When authenticated user wants to change their password from settings/profile page.

---

#### 8. **sendGoogleUserSetPasswordEmail** - Send password setup email for Google users

```javascript
await authClient.sendGoogleUserSetPasswordEmail({ 
  email: 'user@example.com' 
});
```

**Parameters:**
- `email` (required): Google user's email address

**Response:** Success message confirming email was sent.

**Use Case:** When a user who registered via Google Sign-In wants to set a password for traditional login.

---

### Email Verification

#### 9. **resendVerificationEmail** - Resend email verification

```javascript
await authClient.resendVerificationEmail({ 
  email: 'user@example.com',
  purpose: 'New Account'  // or 'Account Recovery'
});
```

**Parameters:**
- `email` (required): Email address to send verification
- `purpose` (optional): Purpose of verification (e.g., 'New Account')

**Response:** Success message confirming email was sent.

**Use Case:** When user's account is not verified and they need a new verification email.

---

### Account Management

#### 10. **deleteAccount** - Permanently delete user account

```javascript
await authClient.deleteAccount({ 
  email: 'user@example.com',
  password: 'userPassword123'  // Optional, depending on server requirements
});
```

**Parameters:**
- `email` (required): Email of account to delete
- `password` (optional): User's password for confirmation

**Response:** Success message. Token should be cleared after deletion.

**Warning:** This action is permanent and cannot be undone!

---

### Advanced Usage

#### 11. **authed** - Make custom authenticated API calls

```javascript
const response = await authClient.authed('custom/endpoint', {
  method: 'POST',
  body: { key: 'value' },
  headers: { 'Custom-Header': 'value' }
});
```

**Parameters:**
- `path` (required): API endpoint path (without base URL)
- `options` (optional): Request options
  - `method`: HTTP method (GET, POST, PUT, DELETE, etc.)
  - `body`: Request body object
  - `headers`: Additional headers

**Response:** Response data from custom endpoint.

**Use Case:** For custom endpoints not covered by the built-in methods.

---

## Implementation Examples

### React Web Examples

### Complete Login Component

Create `src/components/Login.jsx`:

```jsx
import React, { useState } from 'react';
import { useAuth } from '../AuthContext.jsx';
import { GoogleLogin } from '@react-oauth/google';

export default function Login() {
  const { login, googleLogin, authClient } = useAuth();
  
  // Form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  
  // Password reset state
  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetFeedback, setResetFeedback] = useState(null);
  
  // Google user set password state
  const [showGoogleSetPassword, setShowGoogleSetPassword] = useState(false);
  const [googleSetPasswordEmail, setGoogleSetPasswordEmail] = useState('');
  const [googleSetPasswordFeedback, setGoogleSetPasswordFeedback] = useState(null);
  
  // Email verification state
  const [resendFeedback, setResendFeedback] = useState(null);

  // Handle standard email/password login
  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setResendFeedback(null);
    setBusy(true);
    
    try {
      await login({ email, password });
      // Success - user will be redirected by App.jsx
    } catch (err) {
      setError(err.message || 'Login failed');
      
      // Check if account needs verification
      if (
        err.code === 'EMAIL_NOT_VERIFIED' ||
        err.message?.toLowerCase().includes('not been verified')
      ) {
        setResendFeedback('Your account has not been verified. Click below to resend verification.');
      }
    } finally {
      setBusy(false);
    }
  }

  // Handle Google Sign-In
  async function handleGoogleSuccess(credentialResponse) {
    setBusy(true);
    try {
      const result = await googleLogin(credentialResponse.credential);
      if (result.isNewUser) {
        console.log('Welcome, new user!');
      }
    } catch (err) {
      setError(err.message || 'Google login failed');
    } finally {
      setBusy(false);
    }
  }

  // Handle password reset request
  async function handlePasswordReset(e) {
    e.preventDefault();
    setBusy(true);
    setResetFeedback(null);
    
    try {
      await authClient.requestPasswordReset({ email: resetEmail });
      setResetFeedback('Password reset email sent. Check your inbox.');
      setResetEmail('');
    } catch (err) {
      setResetFeedback(err.message || 'Failed to send reset email');
    } finally {
      setBusy(false);
    }
  }

  // Handle resend verification email
  async function handleResendVerification() {
    setBusy(true);
    setResendFeedback(null);
    
    try {
      await authClient.resendVerificationEmail({ 
        email, 
        purpose: 'New Account' 
      });
      setResendFeedback('Verification email sent. Please check your inbox.');
    } catch (err) {
      setResendFeedback(err.message || 'Failed to resend verification');
    } finally {
      setBusy(false);
    }
  }

  // Handle Google user set password email
  async function handleSendGoogleSetPasswordEmail(e) {
    e.preventDefault();
    setBusy(true);
    setGoogleSetPasswordFeedback(null);
    
    try {
      await authClient.sendGoogleUserSetPasswordEmail({ 
        email: googleSetPasswordEmail 
      });
      setGoogleSetPasswordFeedback('Email sent. Check your inbox to set a password.');
      setGoogleSetPasswordEmail('');
    } catch (err) {
      setGoogleSetPasswordFeedback(err.message || 'Failed to send email');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-container">
      <h2>Login</h2>
      
      {/* Email/Password Login Form */}
      <form onSubmit={handleSubmit}>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        
        <button type="submit" disabled={busy}>
          {busy ? 'Please wait…' : 'Login'}
        </button>
      </form>
      
      {error && <p style={{ color: 'red' }}>{error}</p>}
      
      {/* Google Sign-In Button */}
      <div style={{ marginTop: 16 }}>
        <span>or</span>
        <GoogleLogin
          onSuccess={handleGoogleSuccess}
          onError={() => setError('Google login failed')}
        />
      </div>
      
      {/* Resend Verification Email */}
      {resendFeedback && (
        <div>
          <p>{resendFeedback}</p>
          {resendFeedback.includes('has not been verified') && (
            <button onClick={handleResendVerification} disabled={busy}>
              Resend Verification Email
            </button>
          )}
        </div>
      )}
      
      {/* Forgot Password */}
      <div style={{ marginTop: 16 }}>
        <button onClick={() => setShowReset(!showReset)}>
          {showReset ? 'Hide' : 'Forgot password?'}
        </button>
        
        {showReset && (
          <form onSubmit={handlePasswordReset}>
            <input
              type="email"
              placeholder="Enter your email"
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
              required
            />
            <button type="submit" disabled={busy}>
              Send Reset Link
            </button>
            {resetFeedback && <p>{resetFeedback}</p>}
          </form>
        )}
      </div>
      
      {/* Google User Set Password */}
      <div style={{ marginTop: 12 }}>
        <button onClick={() => setShowGoogleSetPassword(!showGoogleSetPassword)}>
          {showGoogleSetPassword ? 'Hide' : 'No password? Are you a Google user?'}
        </button>
        
        {showGoogleSetPassword && (
          <form onSubmit={handleSendGoogleSetPasswordEmail}>
            <input
              type="email"
              placeholder="Enter your Google account email"
              value={googleSetPasswordEmail}
              onChange={(e) => setGoogleSetPasswordEmail(e.target.value)}
              required
            />
            <button type="submit" disabled={busy}>
              Send Set-Password Email
            </button>
            {googleSetPasswordFeedback && <p>{googleSetPasswordFeedback}</p>}
          </form>
        )}
      </div>
    </div>
  );
}
```

---

### Complete Register Component

Create `src/components/Register.jsx`:

```jsx
import React, { useState } from 'react';
import { useAuth } from '../AuthContext.jsx';

export default function Register() {
  const { authClient } = useAuth();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setBusy(true);
    
    try {
      await authClient.register({ 
        email, 
        username, 
        password, 
        name 
      });
      
      setSuccess('Registered! Please verify your email, then login.');
      
      // Clear form
      setEmail('');
      setPassword('');
      setName('');
      setUsername('');
    } catch (err) {
      setError(err.message || 'Registration failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="register-container">
      <h2>Sign Up</h2>
      
      <form onSubmit={handleSubmit}>
        <label>
          Name
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        
        <label>
          Username
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>
        
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        
        <button type="submit" disabled={busy}>
          {busy ? 'Please wait…' : 'Create Account'}
        </button>
      </form>
      
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {success && <p style={{ color: 'green' }}>{success}</p>}
    </div>
  );
}
```

---

### Complete Home/Dashboard Component

Create `src/components/Home.jsx`:

```jsx
import React, { useState } from 'react';
import { useAuth } from '../AuthContext.jsx';

export default function Home() {
  const { user, token, logout, refreshProfile, loading, authClient } = useAuth();
  
  const [feedback, setFeedback] = useState(null);
  const [busy, setBusy] = useState(false);
  
  // Delete account state
  const [showDeleteForm, setShowDeleteForm] = useState(false);
  const [deleteFeedback, setDeleteFeedback] = useState(null);

  // Handle password change request (sends email)
  async function doChangePassword(e) {
    e.preventDefault();
    setBusy(true);
    setFeedback(null);
    
    try {
      await authClient.requestChangePasswordLink({ email: user?.email });
      setFeedback('Password change email sent. Check your inbox.');
    } catch (err) {
      setFeedback(err.message || 'Failed to send password change email');
    } finally {
      setBusy(false);
    }
  }

  // Handle account deletion
  async function doDeleteAccount(e) {
    e.preventDefault();
    
    if (!window.confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
      return;
    }
    
    setBusy(true);
    setDeleteFeedback(null);
    
    try {
      await authClient.deleteAccount({ email: user?.email });
      setDeleteFeedback('Account deleted successfully. Logging out...');
      
      // Auto logout after 1.5 seconds
      setTimeout(() => {
        logout();
      }, 1500);
    } catch (err) {
      setDeleteFeedback(err.message || 'Delete account failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="home-container">
      <h2>Welcome</h2>
      
      {/* User Profile Display */}
      <div className="user-box">
        <p><strong>User ID:</strong> {user?.id || 'n/a'}</p>
        <p><strong>Email:</strong> {user?.email}</p>
        <p><strong>Name:</strong> {user?.name || '—'}</p>
        <p><strong>Login Method:</strong> {user?.login_method || '—'}</p>
        <p><strong>Google Linked:</strong> {user?.google_linked ? 'Yes' : '—'}</p>
        <p><strong>Token (truncated):</strong> {token ? token.slice(0, 18) + '…' : 'none'}</p>
      </div>
      
      {/* Action Buttons */}
      <div className="actions">
        <button onClick={refreshProfile} disabled={loading}>
          Refresh Profile
        </button>
        <button onClick={logout}>Logout</button>
      </div>

      {/* Change Password (Email Link) */}
      <form onSubmit={doChangePassword} style={{ marginTop: 24 }}>
        <h3>Change Password</h3>
        <p>We will email a secure link to {user?.email} to change your password.</p>
        <button type="submit" disabled={busy}>
          {busy ? 'Sending…' : 'Send Change Password Email'}
        </button>
      </form>
      {feedback && <p>{feedback}</p>}

      {/* Delete Account */}
      <div style={{ marginTop: 24 }}>
        <button 
          onClick={() => setShowDeleteForm(!showDeleteForm)}
          style={{ background: 'red', color: 'white' }}
        >
          {showDeleteForm ? 'Cancel' : 'Delete Account'}
        </button>
        
        {showDeleteForm && (
          <form onSubmit={doDeleteAccount}>
            <p style={{ color: 'red' }}>
              Are you sure? This cannot be undone.
            </p>
            <button type="submit" disabled={busy}>
              {busy ? 'Deleting…' : 'Confirm Delete Account'}
            </button>
            {deleteFeedback && <p>{deleteFeedback}</p>}
          </form>
        )}
      </div>
    </div>
  );
}
```

---

### React Native Examples

#### Complete React Native Login Screen

Create `src/screens/LoginScreen.js`:

```jsx
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { GoogleSignin, GoogleSigninButton } from '@react-native-google-signin/google-signin';
import { useAuth } from '../AuthContext';

GoogleSignin.configure({
  webClientId: 'YOUR_WEB_CLIENT_ID.apps.googleusercontent.com',
});

export default function LoginScreen() {
  const { login, googleLogin, authClient, loading } = useAuth();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState('');

  async function handleSubmit() {
    setError(null);
    setBusy(true);
    
    try {
      await login({ email, password });
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogleSignIn() {
    try {
      await GoogleSignin.hasPlayServices();
      const userInfo = await GoogleSignin.signIn();
      
      const result = await googleLogin(userInfo.idToken);
      if (result.isNewUser) {
        Alert.alert('Welcome!', 'New account created');
      }
    } catch (err) {
      setError(err.message || 'Google sign in failed');
    }
  }

  async function handlePasswordReset() {
    setBusy(true);
    try {
      await authClient.requestPasswordReset({ email: resetEmail });
      Alert.alert('Success', 'Password reset email sent');
      setResetEmail('');
      setShowReset(false);
    } catch (err) {
      setError(err.message || 'Failed to send reset email');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={{ flex: 1, padding: 20, backgroundColor: '#fff' }}>
      <Text style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 24 }}>Login</Text>

      <TextInput
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        editable={!loading}
        style={{
          borderWidth: 1,
          borderColor: '#ddd',
          padding: 12,
          marginBottom: 12,
          borderRadius: 8,
        }}
      />

      <TextInput
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        editable={!loading}
        style={{
          borderWidth: 1,
          borderColor: '#ddd',
          padding: 12,
          marginBottom: 20,
          borderRadius: 8,
        }}
      />

      <TouchableOpacity
        onPress={handleSubmit}
        disabled={loading || busy}
        style={{
          backgroundColor: '#0066cc',
          padding: 12,
          borderRadius: 8,
          alignItems: 'center',
          marginBottom: 20,
        }}
      >
        {loading || busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={{ color: '#fff', fontWeight: 'bold' }}>Login</Text>
        )}
      </TouchableOpacity>

      {error && <Text style={{ color: 'red', marginBottom: 12 }}>{error}</Text>}

      <View style={{ alignItems: 'center', marginVertical: 16 }}>
        <Text>or</Text>
      </View>

      <GoogleSigninButton
        size={GoogleSigninButton.Size.Wide}
        color={GoogleSigninButton.Color.Dark}
        onPress={handleGoogleSignIn}
        disabled={loading}
      />

      <TouchableOpacity
        onPress={() => setShowReset(!showReset)}
        style={{ marginTop: 20 }}
      >
        <Text style={{ color: '#0066cc' }}>
          {showReset ? 'Hide' : 'Forgot password?'}
        </Text>
      </TouchableOpacity>

      {showReset && (
        <View style={{ marginTop: 12 }}>
          <TextInput
            placeholder="Enter your email"
            value={resetEmail}
            onChangeText={setResetEmail}
            keyboardType="email-address"
            style={{
              borderWidth: 1,
              borderColor: '#ddd',
              padding: 12,
              marginBottom: 12,
              borderRadius: 8,
            }}
          />
          <TouchableOpacity
            onPress={handlePasswordReset}
            disabled={busy}
            style={{
              backgroundColor: '#0066cc',
              padding: 12,
              borderRadius: 8,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: '#fff' }}>
              {busy ? 'Sending...' : 'Send Reset Link'}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}
```

#### Complete React Native Register Screen

Create `src/screens/RegisterScreen.js`:

```jsx
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useAuth } from '../AuthContext';

export default function RegisterScreen() {
  const { authClient } = useAuth();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit() {
    setError(null);
    setBusy(true);
    
    try {
      await authClient.register({
        email,
        username,
        password,
        name,
      });
      
      Alert.alert(
        'Registration Successful',
        'Please verify your email, then login.'
      );
      
      setEmail('');
      setPassword('');
      setName('');
      setUsername('');
    } catch (err) {
      setError(err.message || 'Registration failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={{ flex: 1, padding: 20, backgroundColor: '#fff' }}>
      <Text style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 24 }}>Sign Up</Text>

      <TextInput
        placeholder="Name"
        value={name}
        onChangeText={setName}
        editable={!busy}
        style={{
          borderWidth: 1,
          borderColor: '#ddd',
          padding: 12,
          marginBottom: 12,
          borderRadius: 8,
        }}
      />

      <TextInput
        placeholder="Username"
        value={username}
        onChangeText={setUsername}
        editable={!busy}
        style={{
          borderWidth: 1,
          borderColor: '#ddd',
          padding: 12,
          marginBottom: 12,
          borderRadius: 8,
        }}
      />

      <TextInput
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        editable={!busy}
        style={{
          borderWidth: 1,
          borderColor: '#ddd',
          padding: 12,
          marginBottom: 12,
          borderRadius: 8,
        }}
      />

      <TextInput
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        editable={!busy}
        style={{
          borderWidth: 1,
          borderColor: '#ddd',
          padding: 12,
          marginBottom: 20,
          borderRadius: 8,
        }}
      />

      <TouchableOpacity
        onPress={handleSubmit}
        disabled={busy}
        style={{
          backgroundColor: '#0066cc',
          padding: 12,
          borderRadius: 8,
          alignItems: 'center',
        }}
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={{ color: '#fff', fontWeight: 'bold' }}>Create Account</Text>
        )}
      </TouchableOpacity>

      {error && <Text style={{ color: 'red', marginTop: 12 }}>{error}</Text>}
    </ScrollView>
  );
}
```

#### Complete React Native Home Screen

Create `src/screens/HomeScreen.js`:

```jsx
import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useAuth } from '../AuthContext';

export default function HomeScreen() {
  const { user, token, logout, refreshProfile, loading, authClient } = useAuth();
  
  const [feedback, setFeedback] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showDeleteForm, setShowDeleteForm] = useState(false);

  async function doChangePassword() {
    setBusy(true);
    setFeedback(null);
    
    try {
      await authClient.requestChangePasswordLink({ email: user?.email });
      setFeedback('Password change email sent. Check your inbox.');
    } catch (err) {
      setFeedback(err.message || 'Failed to send password change email');
    } finally {
      setBusy(false);
    }
  }

  async function doDeleteAccount() {
    Alert.alert(
      'Delete Account',
      'Are you sure? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await authClient.deleteAccount({ email: user?.email });
              setFeedback('Account deleted. Logging out...');
              setTimeout(() => logout(), 1500);
            } catch (err) {
              setFeedback(err.message || 'Delete account failed');
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  }

  return (
    <ScrollView style={{ flex: 1, padding: 20, backgroundColor: '#fff' }}>
      <Text style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 24 }}>Welcome</Text>

      <View style={{ backgroundColor: '#f5f5f5', padding: 16, borderRadius: 8, marginBottom: 24 }}>
        <Text style={{ marginBottom: 8 }}><Text style={{ fontWeight: 'bold' }}>User ID:</Text> {user?.id || 'n/a'}</Text>
        <Text style={{ marginBottom: 8 }}><Text style={{ fontWeight: 'bold' }}>Email:</Text> {user?.email}</Text>
        <Text style={{ marginBottom: 8 }}><Text style={{ fontWeight: 'bold' }}>Name:</Text> {user?.name || '—'}</Text>
        <Text style={{ marginBottom: 8 }}><Text style={{ fontWeight: 'bold' }}>Login Method:</Text> {user?.login_method || '—'}</Text>
        <Text><Text style={{ fontWeight: 'bold' }}>Token:</Text> {token ? token.slice(0, 18) + '…' : 'none'}</Text>
      </View>

      <View style={{ flexDirection: 'row', gap: 12, marginBottom: 24 }}>
        <TouchableOpacity
          onPress={refreshProfile}
          disabled={loading}
          style={{
            flex: 1,
            backgroundColor: '#0066cc',
            padding: 12,
            borderRadius: 8,
            alignItems: 'center',
          }}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ color: '#fff', fontWeight: 'bold' }}>Refresh Profile</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={logout}
          style={{
            flex: 1,
            backgroundColor: '#999',
            padding: 12,
            borderRadius: 8,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontWeight: 'bold' }}>Logout</Text>
        </TouchableOpacity>
      </View>

      <View style={{ marginBottom: 24 }}>
        <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 12 }}>Change Password</Text>
        <Text style={{ marginBottom: 12 }}>We will email a secure link to {user?.email} to change your password.</Text>
        <TouchableOpacity
          onPress={doChangePassword}
          disabled={busy}
          style={{
            backgroundColor: '#0066cc',
            padding: 12,
            borderRadius: 8,
            alignItems: 'center',
          }}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ color: '#fff', fontWeight: 'bold' }}>Send Change Password Email</Text>
          )}
        </TouchableOpacity>
      </View>

      {feedback && (
        <Text style={{ color: feedback.includes('successfully') || feedback.includes('sent') ? 'green' : 'red', marginBottom: 12 }}>
          {feedback}
        </Text>
      )}

      <TouchableOpacity
        onPress={doDeleteAccount}
        style={{
          backgroundColor: '#d32f2f',
          padding: 12,
          borderRadius: 8,
          alignItems: 'center',
        }}
      >
        <Text style={{ color: '#fff', fontWeight: 'bold' }}>Delete Account</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
```

#### React Native Splash Screen

Create `src/screens/SplashScreen.js`:

```jsx
import React from 'react';
import { View, ActivityIndicator, Text } from 'react-native';

export default function SplashScreen() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
      <ActivityIndicator size="large" color="#0066cc" />
      <Text style={{ marginTop: 12 }}>Loading...</Text>
    </View>
  );
}
```

### 1. Check if User is Authenticated

```jsx
import { useAuth } from './AuthContext';

function MyComponent() {
  const { user, token } = useAuth();
  
  if (!user || !token) {
    return <p>Please login first</p>;
  }
  
  return <p>Welcome, {user.name}!</p>;
}
```

### 2. Handle Authentication Errors

```jsx
try {
  await authClient.login({ email, password });
} catch (err) {
  // Check error code
  if (err.code === 'EMAIL_NOT_VERIFIED') {
    // Show verification resend option
  } else if (err.status === 401) {
    // Invalid credentials
  } else {
    // Generic error
    console.error(err.message);
  }
}
```

### 3. Protect Routes/Components

```jsx
function ProtectedRoute({ children }) {
  const { user } = useAuth();
  
  if (!user) {
    return <Navigate to="/login" />;
  }
  
  return children;
}
```

### 4. Auto-refresh User Profile on Mount

```jsx
useEffect(() => {
  if (user && token) {
    refreshProfile();
  }
}, []);
```

### 5. Handle Token Expiration

```jsx
const { refreshProfile } = useAuth();

// Periodically check token validity
useEffect(() => {
  const interval = setInterval(async () => {
    try {
      await refreshProfile();
    } catch (err) {
      if (err.status === 401) {
        // Token expired, redirect to login
        logout();
      }
    }
  }, 5 * 60 * 1000); // Check every 5 minutes
  
  return () => clearInterval(interval);
}, [refreshProfile, logout]);
```

---

## React Native Specific Patterns

### 1. Handle Token Persistence (React Native)

```jsx
// AuthContext.js already includes this in the bootstrap function
React.useEffect(() => {
  const bootstrapAsync = async () => {
    try {
      const savedToken = await AsyncStorage.getItem('auth_user_token');
      if (savedToken) {
        authClient.setToken(savedToken);
        setToken(savedToken);
        // Fetch user profile
        const res = await authClient.getProfile();
        setUser(res.data.user);
      }
    } catch (err) {
      console.error('Failed to restore token', err);
    } finally {
      setIsReady(true);
    }
  };
  bootstrapAsync();
}, []);
```

### 2. Handle Deep Links (React Native)

```jsx
import * as Linking from 'expo-linking';

const linking = {
  prefixes: ['myapp://', 'https://myapp.com'],
  config: {
    screens: {
      ResetPassword: 'reset/:token',
      VerifyEmail: 'verify/:token',
    },
  },
};

export function RootNavigator() {
  const { user } = useAuth();

  return (
    <NavigationContainer linking={linking}>
      {/* Navigation config */}
    </NavigationContainer>
  );
}
```

### 3. Handle Keyboard in React Native

```jsx
import { KeyboardAvoidingView, Platform } from 'react-native';

export default function LoginScreen() {
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1 }}
    >
      {/* Form content */}
    </KeyboardAvoidingView>
  );
}
```

### 4. Handle Biometric Authentication (React Native)

```jsx
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';

async function handleBiometricLogin() {
  try {
    const compatible = await LocalAuthentication.hasHardwareAsync();
    if (!compatible) return;

    const savedEmail = await SecureStore.getItemAsync('saved_email');
    const savedPassword = await SecureStore.getItemAsync('saved_password');

    if (savedEmail && savedPassword) {
      const result = await LocalAuthentication.authenticateAsync({
        disableDeviceFallback: false,
      });

      if (result.success) {
        await login({ email: savedEmail, password: savedPassword });
      }
    }
  } catch (err) {
    console.error('Biometric login failed', err);
  }
}
```

---

## Troubleshooting

### Issue: "Failed to execute 'fetch' on 'Window': Illegal invocation"

**Solution:** Make sure you bind fetch correctly in AuthContext:

```javascript
fetch: (input, init = {}) => {
  // ...
  return window.fetch(input, { ...init, headers });
}
```

### Issue: 401 Unauthorized on authenticated requests

**Solution:** Ensure token is being set and sent correctly:

1. Check if `authClient.setToken()` is called after login
2. Verify the Authorization header format matches your server's expectations
3. Check if token is expired

### Issue: Google Sign-In not working

**Solution:** 
1. Verify Google Client ID is correct
2. Make sure `GoogleOAuthProvider` wraps your app
3. Check browser console for CORS errors
4. Ensure your domain is authorized in Google Cloud Console

### Issue: Email verification emails not arriving

**Solution:**
1. Check spam/junk folder
2. Verify email is correct
3. Wait a few minutes (email delivery can be delayed)
4. Use `resendVerificationEmail()` to request a new one

### Issue: Password reset link not working

**Solution:**
1. Check if link has expired (usually 1 hour)
2. Request a new link using `requestPasswordReset()`
3. Ensure you're using the correct email address

---

## Platform-Specific Considerations

### React Web vs React Native

| Feature | React Web | React Native |
|---------|-----------|--------------|
| **Storage** | localStorage (default) | AsyncStorage |
| **Navigation** | React Router | React Navigation |
| **Google Sign-In** | @react-oauth/google | @react-native-google-signin/google-signin |
| **Token Persistence** | Optional (storage: null) | Recommended (AsyncStorage) |
| **Network Requests** | window.fetch | Global fetch |
| **UI Components** | HTML/CSS | React Native components |
| **Deep Linking** | Browser URL | Expo Linking or Deep Linking |

### Key Differences in Implementation

#### 1. Token Storage

**React Web:**
```javascript
storage: null  // In-memory only
// or
storage: window.localStorage  // Persistent
```

**React Native:**
```javascript
import AsyncStorage from '@react-native-async-storage/async-storage';
storage: AsyncStorage  // Persistent and secure
```

#### 2. Navigation

**React Web:**
```jsx
// Uses React Router or conditional rendering
{user ? <Home /> : <Login />}
```

**React Native:**
```jsx
// Uses React Navigation
{user ? (
  <Stack.Screen name="Home" component={HomeScreen} />
) : (
  <Stack.Screen name="Login" component={LoginScreen} />
)}
```

#### 3. Loading States

**React Web:**
```jsx
<button disabled={loading}>
  {loading ? 'Please wait…' : 'Login'}
</button>
```

**React Native:**
```jsx
<TouchableOpacity disabled={loading}>
  {loading ? <ActivityIndicator /> : <Text>Login</Text>}
</TouchableOpacity>
```

#### 4. Styling

**React Web:**
```jsx
<button style={{ color: 'white', backgroundColor: 'blue' }}>
  Login
</button>
```

**React Native:**
```jsx
<TouchableOpacity style={{ backgroundColor: 'blue' }}>
  <Text style={{ color: 'white' }}>Login</Text>
</TouchableOpacity>
```

---

## Security Best Practices

### 1. **Never expose API secrets in production**

In production, move API secret to your backend server:

```javascript
// Instead of this (insecure):
const authClient = AuthClient.create(PUBLIC_KEY, API_SECRET);

// Do this (secure):
// Have your backend proxy all auth requests
// Your frontend only sends requests to YOUR server
// Your server adds the API secret and forwards to auth server
```

### 2. **Use HTTPS in production**

Always serve your app over HTTPS to prevent token interception.

### 3. **Implement token refresh**

Periodically refresh the user's profile to detect token expiration early.

### 4. **Clear sensitive data on logout**

```javascript
const logout = () => {
  setUser(null);
  setToken(null);
  authClient.token = null;
  // Clear any other sensitive state
};
```

### 5. **Validate user input**

Always validate email format, password strength, etc. before sending to server.

---

## Additional Resources

- **npm Package:** [@mspkapps/auth-client](https://www.npmjs.com/package/@mspkapps/auth-client)
- **Google OAuth Setup (Web):** [React OAuth Google Docs](https://www.npmjs.com/package/@react-oauth/google)
- **Google OAuth Setup (React Native):** [@react-native-google-signin](https://www.npmjs.com/package/@react-native-google-signin/google-signin)
- **React Documentation:** [React Official Docs](https://react.dev)
- **React Native Documentation:** [React Native Official Docs](https://reactnative.dev)
- **React Navigation:** [React Navigation Docs](https://reactnavigation.org)
- **AsyncStorage (React Native):** [AsyncStorage Documentation](https://react-native-async-storage.github.io)

---

## Support

For questions or issues:
1. Check this documentation first
2. Review the demo code in this project
3. Check package documentation on npm
4. Contact the auth server maintainers

---

**Happy Coding! 🚀**
