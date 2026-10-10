# Shared licence deployment (free Vercel backend)

Android and Web use these authenticated HTTPS endpoints:

- `POST /api/license/activate`
- `POST /api/license/verify`

Both endpoints read and update the same Firestore document:

`organisations/{organisationId}/licence/current`

For the existing installation, `organisationId` is
`shivshahi_group_001`. The existing BizFlow generator format is unchanged.

## Secure Vercel configuration

Configure these as encrypted Vercel environment variables for Production,
Preview and Development:

- `LICENSE_SIGNING_SECRET`: the existing private BizFlow signing secret.
- `FIREBASE_SERVICE_ACCOUNT_JSON`: the complete Firebase Admin service-account
  JSON for project `bachat-gat-32ffe`, stored as one environment value.

Never add either value to Git, Vite variables, Flutter build arguments, browser
storage or the APK.

```powershell
npx vercel env add LICENSE_SIGNING_SECRET production
npx vercel env add FIREBASE_SERVICE_ACCOUNT_JSON production
```

Repeat for `preview` and `development` only when those environments need live
licence testing.

## Deploy

From the `WEB` directory:

```powershell
npm install
npm run test:vercel-license
npm run test:license
npx vercel --prod
```

The API verifies the Firebase ID token, checks that the user belongs to the
requested organisation, validates the HMAC key and writes the shared licence
with Firebase Admin. Firestore Rules continue to deny all direct client writes.

The first Web session that still contains a valid legacy machine licence will
migrate it once when no shared licence exists. Mobile then receives the same
licence through the Firestore realtime listener.
