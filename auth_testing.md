# STRATELIQ Auth Testing Playbook

## Auth flows in the app
- Email + password (JWT): `POST /api/auth/register`, `POST /api/auth/login`
- Google OAuth via Emergent: `POST /api/auth/session` with `session_id`
- Session check: `GET /api/auth/me` (Bearer token or `session_token` cookie)
- Logout: `POST /api/auth/logout`

## Step 1: Create Test User & Session (email/password)
```bash
API_URL=$(grep REACT_APP_BACKEND_URL /app/frontend/.env | cut -d '=' -f2)
curl -s -X POST "$API_URL/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"testuser@strateliq.dev","password":"Passw0rd!","name":"Test User"}'
```

## Step 2: Google Auth simulated session (Mongo direct)
```
mongosh --eval "
use('test_database');
var userId = 'test-user-' + Date.now();
var sessionToken = 'test_session_' + Date.now();
db.users.insertOne({
  user_id: userId,
  email: 'test.google.' + Date.now() + '@example.com',
  name: 'Google Test User',
  picture: 'https://via.placeholder.com/150',
  password_hash: null,
  auth_provider: 'google',
  onboarding_completed: false,
  is_admin: false,
  created_at: new Date().toISOString()
});
db.user_sessions.insertOne({
  user_id: userId,
  session_token: sessionToken,
  expires_at: new Date(Date.now() + 7*24*60*60*1000).toISOString(),
  created_at: new Date().toISOString()
});
print('Session token: ' + sessionToken);
"
```

## Step 3: Test protected endpoint
```
curl -X GET "$API_URL/api/auth/me" -H "Authorization: Bearer <TOKEN_OR_SESSION_TOKEN>"
```

## Step 4: Browser (Playwright) - inject cookie
```
await page.context.add_cookies([{
    "name": "session_token",
    "value": "<TOKEN>",
    "domain": "<your-domain>",
    "path": "/",
    "httpOnly": True,
    "secure": True,
    "sameSite": "None"
}])
```

## Success Indicators
- `/api/auth/me` returns user data
- Dashboard loads without redirect
- CRUD operations succeed
