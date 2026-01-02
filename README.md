# MSPK™ Auth Client (`@mspkapps/auth-client`)

Simple backend SDK for the MSPK™ Auth Platform.  
Use it from your server code to handle login, register, Google auth, password flows, and profile operations with a few lines.

- ✅ Email/password login & register  
- ✅ Google OAuth login  
- ✅ Password reset & change flows  
- ✅ Email verification / resend flows  
- ✅ Account delete  
- ✅ Profile read & update  
- ✅ Simple singleton API: `authclient.init(...)` then `authclient.login(...)`

---

## Installation

```bash
npm install @mspkapps/auth-client
# or
yarn add @mspkapps/auth-client
```

---

## Backend Usage (Recommended)

Most apps should only use this package on the **backend** (Node/Express, NestJS, etc.).

### 1. Initialize once at startup

```js
// authClient.js
import authclient from '@mspkapps/auth-client';

authclient.init({
  apiKey: process.env.MSPK_AUTH_API_KEY,
  apiSecret: process.env.MSPK_AUTH_API_SECRET,
  googleClientId: process.env.GOOGLE_CLIENT_ID, // optional, for Google OAuth
  // baseUrl: 'https://cpanel.backend.mspkapps.in/api/v1', // optional override
});

export default authclient;
```

### 2. Use in your routes/handlers

```js
// exampleRoute.js
import authclient from './authClient.js';

// Login (email + password)
export async function loginHandler(req, res) {
  const { email, password } = req.body;

  try {
    const result = await authclient.login({ email, password });
    // result.data.user, result.data.user_token, etc.
    res.json(result);
  } catch (err) {
    res.status(err.status || 400).json({
      success: false,
      message: err.message || 'Login failed',
      code: err.code || 'LOGIN_FAILED',
    });
  }
}
```

```js
// Register
export async function registerHandler(req, res) {
  const { email, username, password, name, ...extra } = req.body;

  try {
    const result = await authclient.register({
      email,
      username,
      password,
      name,
      ...extra, // custom fields, if configured in MSPK
    });
    res.json(result);
  } catch (err) {
    res.status(err.status || 400).json({
      success: false,
      message: err.message || 'Registration failed',
      code: err.code || 'REGISTER_FAILED',
    });
  }
}
```

---

## API Reference – What Data Each Call Needs

All methods below assume you already called:

```js
import authclient from '@mspkapps/auth-client';

authclient.init({
  apiKey: 'YOUR_API_KEY',
  apiSecret: 'YOUR_API_SECRET',
  googleClientId: 'YOUR_GOOGLE_CLIENT_ID', // optional
});
```

### Auth & Users

#### `authclient.login({ email, password })` or `authclient.login({ username, password })`

- Required:
  - `email` **or** `username` (string)
  - `password` (string)
- Returns:
  - User data and user token; token is stored internally via `setToken`.

#### `authclient.register({ email, username?, password, name?, ...extraFields })`

- Required:
  - `email` (string)
  - `password` (string)
- Optional:
  - `username` (string)
  - `name` (string)
  - Any extra profile fields you enabled in MSPK (e.g. `company`, `country`).
- Returns:
  - User data and user token; token is stored internally.

#### `authclient.googleAuth({ id_token })`  
#### `authclient.googleAuth({ access_token })`

- Required:
  - Either:
    - `id_token` (string), or
    - `access_token` (string)
- The `googleClientId` is taken from `authclient.init(...)` and sent automatically.
- Returns:
  - User data, token, and possibly a flag like `is_new_user`.

---

### Password Flows

#### `authclient.client.requestPasswordReset({ email })`

- Required:
  - `email` (string)
- Use when: user clicks “Forgot password?”

#### `authclient.client.requestChangePasswordLink({ email })`

- Required:
  - `email` (string)
- Use when: logged-in user requests a “change password” email from settings/profile.

#### `authclient.client.resendVerificationEmail({ email, purpose? })`

- Required:
  - `email` (string)
- Optional:
  - `purpose` (string). Valid values:
    - `New Account`
    - `Password change`
    - `Profile Edit`
    - `Forget Password`
    - `Delete Account`
    - `Set Password - Google User`
- If `purpose` is missing/invalid, the backend will treat it as `New Account`.

#### `authclient.client.sendGoogleUserSetPasswordEmail({ email })`

- Required:
  - `email` (string) – user who signed up via Google and wants a password.
- Use when: a Google-only user wants to set a traditional password.

---

### Account Management

#### `authclient.client.deleteAccount({ email, password })`

- Required:
  - `email` (string)
  - `password` (string) – current password (depending on your server rules).
- Use when: user confirms account deletion.

---

### Profile

#### `authclient.getProfile()`

- No parameters.
- Uses the internally stored user token.
- Returns current user profile.

#### `authclient.client.getEditableProfileFields()`

- No parameters.
- Returns metadata about which fields this user is allowed to edit based on your MSPK configuration.

#### `authclient.updateProfile(updates)`

```js
const res = await authclient.updateProfile({
  name: 'New Name',            // optional
  username: 'new_username',    // optional
  email: 'new@example.com',    // optional; may trigger verification
  extra: {                     // optional; your custom fields
    company: 'New Co',
    country: 'US',
  },
});
```

- All keys are **optional**; send only what you want to change.
- Allowed fields depend on:
  - Core field permissions (name/username/email).
  - Extra fields you defined for the app.

---

### Generic Authenticated Calls

#### `authclient.authed(path, { method = 'GET', body, headers } = {})`

```js
const res = await authclient.authed('user/profile', {
  method: 'PATCH',
  body: { name: 'Another Name' },
  headers: {
    'X-Custom-Header': '123',
  },
});
```

- Required:
  - `path` (string) – relative path (e.g. `'user/profile'`), not full URL.
- Optional:
  - `method` (string, default `'GET'`)
  - `body` (object) – will be `JSON.stringify`’d
  - `headers` (object) – extra headers merged into auth headers.
- Uses the same API key/secret/Google client and user token as other methods.

---

### Token Helpers

#### `authclient.setToken(token)`

- Required:
  - `token` (string or `null`).
- Usually not needed, because:
  - `login`, `register`, and `googleAuth` will set the token automatically.

#### `authclient.logout()`

- No parameters.
- Clears the stored token in memory (and storage, if configured).

---

## Example Express Setup

```js
// authClient.js
import authclient from '@mspkapps/auth-client';

authclient.init({
  apiKey: process.env.MSPK_AUTH_API_KEY,
  apiSecret: process.env.MSPK_AUTH_API_SECRET,
  googleClientId: process.env.GOOGLE_CLIENT_ID,
});

export default authclient;
```

```js
// routes/auth.js
import express from 'express';
import authclient from '../authClient.js';

const router = express.Router();

router.post('/login', async (req, res) => {
  const { email, password, username } = req.body;

  try {
    const result = await authclient.login(
      email ? { email, password } : { username, password }
    );
    res.json(result);
  } catch (err) {
    res.status(err.status || 400).json({
      success: false,
      message: err.message || 'Login failed',
      code: err.code || 'LOGIN_FAILED',
    });
  }
});

router.post('/register', async (req, res) => {
  const { email, username, password, name, ...extra } = req.body;

  try {
    const result = await authclient.register({
      email,
      username,
      password,
      name,
      ...extra,
    });
    res.json(result);
  } catch (err) {
    res.status(err.status || 400).json({
      success: false,
      message: err.message || 'Registration failed',
      code: err.code || 'REGISTER_FAILED',
    });
  }
});

export default router;
```

---

## Error Handling

All methods throw an `AuthError` when the request fails.

Shape (simplified):

```ts
class AuthError extends Error {
  status: number; // HTTP status code
  code: string;   // machine-readable code, e.g. 'EMAIL_NOT_VERIFIED'
  data: any;      // full JSON response (optional)
}
```

Example pattern:

```js
try {
  const res = await authclient.login({ email, password });
} catch (err) {
  if (err.code === 'EMAIL_NOT_VERIFIED') {
    // Ask user to verify email or call resendVerificationEmail
  } else if (err.status === 401) {
    // Invalid credentials
  } else {
    console.error(err);
  }
}
```

---

## Security Notes

- **Backend-only**: Do not expose `apiSecret` in browser or mobile frontend code.
- Frontend apps should call **your backend**, and your backend uses `@mspkapps/auth-client` to talk to the MSPK Auth Platform.
- Always keep `apiKey`, `apiSecret`, and `googleClientId` in environment variables in production.

---

## Links & Support

- npm: `@mspkapps/auth-client`  
- MSPK™ Auth Platform dashboard: (URL you provide in your docs)  

For issues or feature requests, open an issue in your repository or contact MSPK™ Auth Platform support.
