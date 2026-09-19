# Bachat Gat – Digital Savings Group Management System

A web application designed for Self-Help Groups (SHGs / Bachat Gat) to manage member contributions, micro-loans, interest calculations, repayments, and group finances in real-time.

Powered by **React + Vite**, **Firebase Authentication**, and **Cloud Firestore** for the same project used by the Flutter app: `bachat-gat-32ffe`.

---

## 🚀 Key Highlights & Architecture

- **Frontend**: React 18, Vite, React Router v6, Lucide Icons, Modern CSS.
- **Backend & Database**: Firebase Authentication (Email/Password), Cloud Firestore.
- **Real-Time Synchronization**: Live Firestore `onSnapshot` listeners for group settings, user profiles, notifications, and financial ledger updates.
- **Multi-Client Shared Backend**: Web application shares the Cloud Firestore database with the Flutter Android application safely without conflicts.

### Shared Firestore contract

Both clients use the same root collections and `groupId` field:

- `groups`
- `users`
- `monthlyContributions`
- `loans`
- `repayments`
- `transactions`

---

## 📁 Project Structure

```
Bachat-Gat/
├── client/                      # React Frontend (Vite)
│   ├── src/
│   │   ├── components/          # Common components, layout, modals
│   │   ├── config/              # Centralized Firebase initialization
│   │   ├── context/             # AuthContext with real-time session sync
│   │   ├── pages/               # Dashboard, Login, Register, Members, Savings, Loans, Reports, Settings
│   │   └── services/            # Direct Firestore service layer (Auth, Group, Member, Savings, Loan)
│   ├── .env                     # Firebase configuration credentials
│   └── package.json
├── scripts/
│   └── create-admin.js          # CLI script to initialize the first Admin user
├── database/
│   └── seed-firebase.js         # Optional Firestore sample data seeder
├── firestore.rules              # Firestore Security Rules
└── package.json                 # Monorepo root scripts
```

---

## 🛠️ Getting Started

### 1. Configure Environment Variables
Verify your Firebase Web App credentials in `client/.env`:
```env
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=bachat-gat-32ffe.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=bachat-gat-32ffe
VITE_FIREBASE_STORAGE_BUCKET=bachat-gat-32ffe.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=215206829034
VITE_FIREBASE_APP_ID=1:215206829034:web:63a0816174e77792427093
VITE_FIREBASE_MEASUREMENT_ID=G-NP2QYVL1XK
```

### 2. Start the Development Server
```bash
npm run dev
# or
cd client && npm run dev
```

### 3. Create the First Admin Account (Optional)
```bash
npm run admin:create
# or with custom credentials:
node scripts/create-admin.js admin@bachatgat.com Admin@123 "Shri Shivaji Patil" "9822000000"
```

### 4. Enable secure admin member management

Changing another user's password and deleting a Firebase Authentication account
are handled by the Express server, not by the browser. In Firebase Console:

1. Open **Project settings → Service accounts**.
2. Click **Generate new private key** and keep the downloaded JSON private.
3. Set `GOOGLE_APPLICATION_CREDENTIALS` to the absolute path of that JSON, or
   put the compact JSON value in `FIREBASE_SERVICE_ACCOUNT_JSON`.
4. Set `FIREBASE_PROJECT_ID=bachat-gat-32ffe` and start the server with
   `cd server && npm start`.

Never commit the service-account JSON. The repository ignores common service
account filenames and `server/.env`.

After setup, an admin can open a member profile and use **Edit Member & Login**
to change the member ID, email login, password, active status, and Admin/Member
role. **Delete Member** removes the Firebase login plus related contribution,
loan, repayment, transaction, and member records. Self-demotion and self-delete
are blocked to avoid locking out the current administrator.
# Licence configuration

The web application validates BizFlow-compatible licence keys only on the backend.

1. Configure `LICENSE_SIGNING_SECRET` in the hosting platform's encrypted environment-variable settings.
2. Use the same secret already configured in the private `flexible_key_generator`.
3. Apply the variable to Production, Preview, and Development environments as required, then redeploy.
4. For local backend development, copy `.env.example` to `server/.env` and set the secret locally. Never commit that file.

Production endpoints:

- `POST /api/license/activate`
- `POST /api/license/verify`

The signing secret must never use a `VITE_` prefix. Vite-prefixed variables are compiled into the public browser bundle.
