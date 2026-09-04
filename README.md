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

1. Create a Firebase service account with Realtime Database access, then add the server-only values in `.env.example` to the host's environment settings. Never commit the service-account JSON, device key, or Twilio token.
2. Deploy `database.rules.json` in Firebase Realtime Database Rules. It prevents browsers and devices from writing telemetry directly; only the server's Admin SDK can write it.
3. Configure a Twilio number and verified recipient numbers, then supply the Twilio and `ALERT_RECIPIENTS` values. Philippine destination numbers must be E.164 format, for example `+639...`.
4. Configure the ESP32 to POST every reading to `https://YOUR_DOMAIN/api/telemetry` with `Content-Type: application/json` and header `x-device-key: <DEVICE_INGEST_KEY>`.
5. Wire the actual siren through a correctly rated, opto-isolated relay/contactor. The ESP32 reads the `siren.active` reply and must turn the relay off by `siren.expiresAt` even when it loses connectivity. Do not power a mains siren from an ESP32 GPIO pin.
6. Test with a supervised drill at Warning (75 cm), Evacuate (150 cm), sensor-offline, lost-network, and power-recovery conditions. Obtain MDRRMO approval for message wording, recipients, and alarm duration.

`vercel.json` runs a protected device-health check every five minutes. Add a long random `CRON_SECRET` to Vercel so the scheduled check can mark an API-verified device offline when its `updatedAt` is more than five minutes old. The next successful ESP32 upload automatically restores it to online.

### ESP32 request/response contract

```json
POST /api/telemetry
{ "deviceId": "FG-001", "levelCm": 151.2, "batteryV": 12.4, "signal": "Good" }

// 200 response
{ "accepted": true, "status": "evacuate", "siren": { "active": true, "expiresAt": 1760000000000 } }
```

SMS is sent only when the state changes from Normal to Warning/Evacuate, preventing a message on every sensor upload. It rearms after the reading returns to Normal. The endpoint saves readings and commands in Firebase, so signed-in dashboards update in real time even when no dashboard is open.
