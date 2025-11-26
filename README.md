# Auth Client SDK

Lightweight JavaScript client for Your Auth Service.

## Install
```bash
npm install @your-scope/auth-client
```

## Quick Start (Browser / React)
```javascript
import { AuthClient } from '@mspk-apps/auth-client';
const auth = new AuthClient({ baseUrl: 'https://api.mspkapps.in/api/v1', apiKey: 'PUBLIC_KEY' });

async function doLogin() {
  try {
    const res = await auth.login({ email: 'user@example.com', password: 'Pass123!' });
    console.log('Logged in user:', res.data.user);
  } catch (e) {
    console.error(e);
  }
}
```

Store `auth.token` (access token) in memory or secure cookie. Avoid localStorage for high-security apps.

## Node (Server-side proxy)
```javascript
import { AuthClient } from '@mspk-apps/auth-client';
const auth = new AuthClient({
  baseUrl: process.env.AUTH_BASE_URL,
  apiKey: process.env.AUTH_API_KEY,
  apiSecret: process.env.AUTH_API_SECRET // keep secret server-side only
});
```

## Methods
- `register({ email, password, name?, username? })`
- `login({ email, password })`
- `getProfile()`
- `verifyEmail(token)`
- `authed('/custom-endpoint', { method:'POST', body:{...} })`

## Error Handling
Errors throw `AuthError`:
```javascript
try {
  await auth.login({ email, password });
} catch (err) {
  if (err.status === 401) { /* invalid credentials */ }
  console.log(err.code, err.message);
}
```

## React Native
Use same API. For token persistence use `expo-secure-store`:
```javascript
import * as SecureStore from 'expo-secure-store';
const auth = new AuthClient({ baseUrl: 'https://api.mspkapps.in/api/v1', apiKey: 'PUBLIC_KEY' });
await auth.login({ email, password });
await SecureStore.setItemAsync('auth_token', auth.token);
```

## Security
- Never bundle apiSecret in client apps.
- Use HTTPS.
- Rotate keys via dashboard.
- Implement refresh token endpoint (future) for long sessions.

## Publish
1. Set fields in package.json (name, version, author).
2. Login to npm: `npm login`
3. Publish: `npm publish --access public`

## Local Development Test
From `SDK` folder:
```bash
npm link
```
In app project:
```bash
npm link @mspk-apps/auth-client
```

## Future Expansion
- Add `refreshToken()` when backend supports it.
- Add TypeScript definitions.
- Add revoke & password reset helpers.
