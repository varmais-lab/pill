# Tablet Reminder — local web prototype

Mobile-first medicine-schedule demo with Node.js backend and admin management. No external packages or database install needed.

## Start on Windows

1. Install Node.js 20+ if needed (https://nodejs.org/).
2. Extract this ZIP, open its folder, click its address bar, type `cmd` and press Enter.
3. Run: `node server.js`
4. Open http://localhost:3000 in Chrome.
5. Click **Admin**. Default demo password: `demo123`.
6. Add family members and medicines. Return to **Today** to mark doses taken/skipped.

Data persists in `data.json`. Demo names and medications are fictional and NOT a prescription.

## Testing on another device on the same Wi-Fi

In Windows Command Prompt, run `set HOST=0.0.0.0` then `node server.js`. Find your Windows IPv4 address with `ipconfig` and visit `http://YOUR-LAN-IP:3000` from your phone. Allow the port in Windows Firewall only on trusted private networks. **Do not expose the demo server to the public internet.** Browser notification permission normally requires HTTPS or localhost, so mobile LAN testing may not show system notifications.

## Set custom admin password

On Windows CMD: `set ADMIN_PASSWORD=choose-a-unique-password` before `node server.js`.

## GitHub

Create a new private GitHub repository and upload `server.js`, `public/index.html`, `.gitignore`, `README.md`, `package.json`. Do NOT upload `data.json`. Clone the repo locally and run `npm start` or `node server.js`. GitHub stores code, but **GitHub Pages alone cannot run the Node.js backend**. To test online with backend, deploy to a suitable Node hosting provider and implement production-grade authentication and database first.

## Known demo limitations

- Demo only: no AI OCR prescription scanning (manual setup instead).
- Browser reminders only while page stays open; background and locked-phone notifications need a service worker/push notifications or mobile app integration.
- Patient data API and dose logs are not authenticated, and admin uses an in-memory bearer token; **not safe for genuine patient data or public deployment**.
- Filesystem JSON data storage, no concurrent writes protection and no backups.
- No clinician-verified scheduling, medical decision support, dosage validation, or production compliance review.
- App does not send SMS, WhatsApp, or family alerts yet.

## Sample API

`GET /api/health`, `GET /api/data`, `POST /api/login`, `POST /api/patients`, `POST /api/medicines`, `DELETE /api/medicines/:id`, `POST /api/logs`.
