# Vidhya License Manager

Private Next.js admin panel for Vidhya Tech to manage Vidhya School ERP licenses.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Supabase PostgreSQL
- Supabase Auth
- Server-side API routes
- Vercel-ready deployment

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create a Supabase project and run:

```sql
supabase/migrations/001_initial_schema.sql
```

3. Create an auth user in Supabase Auth, then seed the first admin:

```sql
insert into public.admin_users (user_id, email, full_name, role, status)
values ('AUTH_USER_UUID', 'admin@vidhyatech.example', 'Vidhya Admin', 'Owner', 'Active');
```

4. Generate a private/public RSA key pair:

```bash
openssl genrsa -out license_private.pem 2048
openssl pkcs8 -topk8 -inform PEM -outform PEM -nocrypt -in license_private.pem -out license_private_pkcs8.pem
openssl rsa -in license_private.pem -pubout -out license_public.pem
```

Set `LICENSE_PRIVATE_KEY` to the PKCS8 private key. Keep it only in server environment variables. The ERP desktop app can use `license_public.pem` to verify signatures.

5. Copy `.env.example` to `.env.local` and fill values:

```bash
cp .env.example .env.local
```

Use `\n` escapes for `LICENSE_PRIVATE_KEY` if storing it as a single line.

6. Run locally:

```bash
npm run dev
```

Open `http://localhost:3000` and sign in with the seeded admin user.

## Required Environment Variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `LICENSE_PRIVATE_KEY`

Only the two `NEXT_PUBLIC_` values are available to the browser. `SUPABASE_SERVICE_ROLE_KEY` and `LICENSE_PRIVATE_KEY` are only read by server modules/API routes.

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
- Admin pages require Supabase Auth plus an active row in `admin_users`.
- Server mutations use the Supabase service role after admin authorization.
- RLS policies are enabled for direct Supabase access.
- License generation, suspension, reactivation, revocation, renewal, maintenance changes, payment updates, school updates, and device status changes are audit logged.

## Vercel Deployment

Create the same environment variables in Vercel Project Settings, then deploy normally:

```bash
npm run build
```

The app uses standard Next.js server routes and does not require exposing API secrets to the frontend.
