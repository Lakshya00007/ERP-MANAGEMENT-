# Vidhya License Manager

Private Next.js admin panel for Vidhya Tech to manage Vidhya School ERP licenses.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Neon PostgreSQL
- `@neondatabase/serverless`
- Custom admin authentication with bcrypt password hashes and HTTP-only session cookies
- Server-side API routes
- Vercel-ready deployment

## Setup

1. Create a Neon PostgreSQL project.
2. Copy the Neon `DATABASE_URL`.
3. Create `.env.local`:

```bash
cp .env.example .env.local
```

Set:

```bash
DATABASE_URL="postgres://..."
AUTH_SECRET="use-a-random-32-plus-character-secret"
LICENSE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
```

4. Install dependencies:

```bash
npm install
```

5. Run database migrations:

```bash
npm run db:migrate
```

6. Create the first admin:

```bash
npm run admin:create -- --email "teamvidhyatech@gmail.com" --name "Lakshya Gupta" --role "Owner"
```

The script prompts for the password and stores only a bcrypt hash.

7. Start the app:

```bash
npm run dev
```

8. Open `http://localhost:3000` and log in with the created admin account.
9. Deploy to Vercel.
10. Add `DATABASE_URL`, `AUTH_SECRET`, and `LICENSE_PRIVATE_KEY` in Vercel Project Settings.

## License Signing

Generate a private/public RSA key pair:

```bash
openssl genrsa -out license_private.pem 2048
openssl pkcs8 -topk8 -inform PEM -outform PEM -nocrypt -in license_private.pem -out license_private_pkcs8.pem
openssl rsa -in license_private.pem -pubout -out license_public.pem
```

Set `LICENSE_PRIVATE_KEY` to the PKCS8 private key. Keep it only in server environment variables. The ERP desktop app can use `license_public.pem` to verify signatures.

## Scripts

- `npm run dev` starts Next.js with webpack.
- `npm run db:migrate` applies SQL migrations once, tracked in `schema_migrations`.
- `npm run admin:create` creates or updates an admin user.
- `npm run db:verify` runs rollback-only database checks using test-prefixed records.
- `npm run typecheck`, `npm run lint`, and `npm run build` validate the app.

## Required Environment Variables

- `DATABASE_URL`
- `AUTH_SECRET`
- `LICENSE_PRIVATE_KEY`

Optional:

- `NEXT_PUBLIC_APP_NAME`

## License APIs

### Generate

`POST /api/licenses/generate`

Admin session required.

```json
{
  "schoolId": "uuid",
  "deviceId": "DEVICE-001",
  "plan": "Annual",
  "expiresAt": "2027-03-31",
  "maintenanceUntil": "2027-03-31",
  "maxUsers": 50,
  "features": {
    "attendance": true,
    "accounts": true
  }
}
```

Returns:

```json
{
  "licenseId": "VID-20260716-ABC123",
  "licenseKey": "v1..."
}
```

### Check

`POST /api/licenses/check`

Called by the ERP desktop app. No admin session required.

```json
{
  "licenseId": "VID-20260716-ABC123",
  "deviceId": "DEVICE-001",
  "appVersion": "1.0.0",
  "os": "Windows"
}
```

Returns active, suspended, revoked, expired, mismatch, or not-found status. Every call writes `license_checkins` and updates device `last_seen_at`.

## Security Notes

- The private signing key is never imported by client components.
- `DATABASE_URL`, `AUTH_SECRET`, and `LICENSE_PRIVATE_KEY` are server-only.
- Admin passwords are stored as bcrypt hashes.
- Admin sessions are signed with `jose` and stored in HTTP-only cookies.
- Authorization is enforced in server-side application code.
- License generation, suspension, reactivation, revocation, renewal, maintenance changes, payment updates, school updates, and device status changes are audit logged.
