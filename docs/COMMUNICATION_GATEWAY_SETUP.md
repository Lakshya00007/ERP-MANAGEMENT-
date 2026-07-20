# Communication Gateway Setup

## Architecture

ERP-Management hosts the server-side Communication Gateway for WhatsApp and SMS. The desktop ERP stores only an encrypted device communication token and calls this gateway over HTTPS. Provider credentials stay encrypted in PostgreSQL and are never stored in the desktop app.

Local ERP Message Center remains separate. WhatsApp and SMS jobs are external delivery records only.

## Required Environment Variables

Set these on Vercel or the server runtime:

- `DATABASE_URL`
- `AUTH_SECRET`
- `LICENSE_PRIVATE_KEY`
- `COMMUNICATION_ENCRYPTION_KEY`
- `META_GRAPH_API_VERSION`
- `META_APP_SECRET`
- `META_WEBHOOK_VERIFY_TOKEN`
- `COMMUNICATION_CRON_SECRET`
- `COMMUNICATION_GATEWAY_BASE_URL`
- `COMMUNICATION_PROVIDER_MODE=mock|live`

Do not create `NEXT_PUBLIC_` provider secrets. Per-school Meta and MSG91 credentials are entered in the school Communication Gateway section and stored encrypted in `communication_integrations`.

## Database

Run:

```bash
npm run db:migrate
```

Migration `002_communication_gateway.sql` creates:

- `communication_device_tokens`
- `communication_integrations`
- `communication_templates`
- `communication_jobs`
- `communication_batches`
- `communication_webhook_events`
- `communication_contact_preferences`

## Device Token Flow

1. Open a school profile in ERP-Management.
2. Register the desktop device and generate/attach an active license.
3. In Communication Gateway, select the device and license.
4. Generate a device token.
5. Copy it immediately. The raw token is shown only once.
6. Paste it in desktop ERP: General Settings -> Communication Integrations.

Only the token hash is stored server-side. Revoked, expired, suspended-device or suspended-license tokens are rejected.

## WhatsApp Cloud API

Use Meta WhatsApp Cloud API only. Do not use WhatsApp Web automation, QR bots or personal accounts.

Setup checklist:

1. Create/configure a Meta app and WhatsApp Business Account.
2. Add a permanent/system-user access token.
3. Note the WhatsApp Phone Number ID and WABA ID.
4. Configure webhook URL:
   `COMMUNICATION_GATEWAY_BASE_URL/api/webhooks/whatsapp`
5. Use `META_WEBHOOK_VERIFY_TOKEN` for callback verification.
6. Set `META_APP_SECRET` so POST webhooks can verify `x-hub-signature-256`.
7. Create approved utility templates in Meta.
8. Map template names/IDs in ERP-Management Templates.

Outbound ERP messages use approved templates only.

References:

- Meta message endpoint: https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/message-api
- Meta webhooks: https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/overview

## MSG91 SMS Flow API

Setup checklist:

1. Complete MSG91 account setup.
2. Complete Indian DLT prerequisites.
3. Register Sender ID/Header and Principal Entity ID.
4. Create approved Flow/template content in MSG91.
5. Map Flow ID, DLT Template ID and Sender ID in ERP-Management Templates.

The desktop UI labels this as SMS Gateway and shows: external provider charges and DLT registration may apply.

Reference:

- MSG91 SMS API docs: https://docs.msg91.com/sms

## Mock Mode

Set:

```bash
COMMUNICATION_PROVIDER_MODE=mock
```

Mock mode never sends external messages. It creates deterministic mock provider IDs and simulated delivery statuses. Use mock mode for automated tests and demos.

## Live Mode

Set:

```bash
COMMUNICATION_PROVIDER_MODE=live
```

Live mode requires complete provider configuration and approved templates. Do not claim live delivery is tested until real Meta/MSG91 credentials and approved templates are used.

## Queue Processing

Desktop send requests create database jobs. The gateway processes a small number synchronously and also exposes:

```http
POST /api/cron/process-communications
Authorization: Bearer COMMUNICATION_CRON_SECRET
```

Configure a cron job or run manually during development.

## Security Notes

- Provider credentials are AES-256-GCM encrypted with `COMMUNICATION_ENCRYPTION_KEY`.
- API responses never include encrypted or decrypted provider secrets.
- Desktop never sends the full VSE license key for communication authorization.
- Recipient phones are normalized only for sending and stored masked/encrypted in gateway jobs.
- Audit logs use metadata only, not raw tokens, provider secrets, full phones or private message bodies.

## Troubleshooting

- `Communication device token is not active`: generate or re-enable a token.
- `ERP license is not active`: renew/reactivate the school license.
- `integration is not active`: save and test provider configuration.
- `Approved communication template not found`: map the provider template and mark it approved only after provider approval.
- `Recipient phone must be valid`: correct the local student/guardian/employee mobile number.
