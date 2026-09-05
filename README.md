# FloodGuard WaterRise Detector

FloodGuard has a real-time dashboard backed by Firebase Realtime Database. Production alerts must be triggered by the server ingestion endpoint, not by a browser tab.

## Project map

- `app/` — Next.js shell and routes
- `public/legacy/` — categorized original UI source, served as static files
- `public/legacy/assets/styles/` — visual styles
- `public/legacy/assets/scripts/` — application behavior, split by responsibility
- `public/legacy/assets/images/` — logos and image assets

## Commands

```bash
npm run dev
npm run build
```

## Production deployment

The current dashboard can be deployed to Vercel, Firebase App Hosting, or any Node.js host. Before treating it as an emergency-warning system, complete this checklist:

1. Create a Firebase service account with Realtime Database access, then add the server-only values in `.env.example` to the host's environment settings. Never commit the service-account JSON, device key, or Semaphore API key.
2. Deploy `database.rules.json` in Firebase Realtime Database Rules. It prevents browsers and devices from writing telemetry directly; only the server's Admin SDK can write it.
3. Create a Semaphore account, register a Sender Name, add SMS credits, then supply `SEMAPHORE_API_KEY`, optional `SEMAPHORE_SENDER_NAME`, and `ALERT_RECIPIENTS`. Use Philippine mobile numbers such as `0917...` or `63917...`; separate multiple recipients with commas.
4. Configure the ESP32 to POST every reading to `https://YOUR_DOMAIN/api/telemetry` with `Content-Type: application/json` and header `x-device-key: <DEVICE_INGEST_KEY>`.
5. Wire the actual siren through a correctly rated, opto-isolated relay/contactor. The ESP32 reads the `siren.active` reply and must turn the relay off by `siren.expiresAt` even when it loses connectivity. Do not power a mains siren from an ESP32 GPIO pin.
6. Test with a supervised drill at Warning (75 cm), Evacuate (150 cm), sensor-offline, lost-network, and power-recovery conditions. Obtain MDRRMO approval for message wording, recipients, and alarm duration.

On Vercel Pro or Enterprise, configure a protected request to `/api/device-health` every five minutes with `Authorization: Bearer <CRON_SECRET>`. It marks an API-verified device offline when its `updatedAt` is more than five minutes old and retries a failed SMS delivery. The included project deliberately has no `vercel.json` cron so it deploys on Vercel Hobby; Hobby cannot run this five-minute check. The next successful ESP32 upload automatically restores the device to online.

## Operational safeguards implemented in software

- Alert thresholds, confirmation count, siren duration, and stale-device period are server-only environment values. The dashboard reads them after sign-in and cannot change them.
- A threshold transition requires `ALERT_CONFIRMATION_READINGS` consecutive readings (default: three) and uses `ALERT_HYSTERESIS_CM` (default: five cm) before clearing an active alert.
- SMS alerts are retained as retryable device records. The next protected health check retries a provider failure; during an incident, inspect any `pendingNotification.state` other than `sent`.
- PDF export and dashboard configuration require a Firebase ID token.
- `DEVICE_REQUESTS_PER_MINUTE` is an in-process guard. Configure equivalent rate limiting/WAF protection at your hosting provider because serverless instances do not share memory.
- `/status` is a public, login-free live status board. It reads only `publicStatus/FG-001` (level, alert state, online state, and timestamp); full records remain authenticated.

## Required before public emergency use

This repository cannot certify field equipment or municipal procedure. Before public reliance, document independent sensor calibration, supervised power-loss/network-loss drills, rated relay and siren inspection, a secondary communication channel, recipient consent and message approval, designated operators, Firebase backup/retention, incident-log review, and MDRRMO authorization. Do not use Vercel Hobby as the sole operational host for an emergency-warning system.

### ESP32 request/response contract

```json
POST /api/telemetry
{ "deviceId": "FG-001", "levelCm": 151.2, "batteryV": 12.4, "signal": "Good" }

// 200 response
{ "accepted": true, "status": "evacuate", "siren": { "active": true, "expiresAt": 1760000000000 } }
```

SMS is sent only when the state changes from Normal to Warning/Evacuate, preventing a message on every sensor upload. It rearms after the reading returns to Normal. The endpoint saves readings and commands in Firebase, so signed-in dashboards update in real time even when no dashboard is open.
