# Google Sheets backend for Tablet Reminder 0.2

Use the private database spreadsheet created for this app. Its exact address
and its bound script project are in the owner's private setup note. Keep those
addresses out of public repositories. Open **Extensions > Apps Script** from
the spreadsheet to find its linked project.

For a prepared project with the source already installed, continue with the
owner's authorization, first administrator account, and Web app deployment.
The copy steps below are for installing this source in another spreadsheet.

The Sheet stays private. Only administrators should have Google Drive access to
it. Users sign in to the Android app with email and password and never receive
the spreadsheet's Google credentials or direct access.

## One-time activation by the spreadsheet owner

1. Open the database, choose **Extensions > Apps Script**.
2. Replace `Code.gs` with this folder's `Code.gs`. Add an HTML file named
   **Setup** and copy `Setup.html` into it.
3. In Project Settings, show `appsscript.json` and use the supplied manifest.
4. Save, select **setupTabletReminder**, and click **Run**. Complete Google's
   authorization under the spreadsheet owner's account. This grants this script
   access to Sheets, the bound setup dialog, and the signed-in owner's email.
5. Return to the spreadsheet. In the setup dialog, enter your administrator
   name, email, and a password of at least 10 characters. This creates the first
   account. The owner must enter the password personally.
6. In Apps Script choose **Deploy > New deployment > Web app**. Set **Execute
   as: Me** and **Who has access: Anyone**, then deploy. The endpoint accepts
   anonymous HTTP connections but all record access is controlled by app login
   and server-side ownership checks. The spreadsheet itself stays private.
7. Copy the deployment URL ending in **/exec**. In the Android app open
   **Connection settings**, paste it, save, and sign in with the new admin account.
8. Use **Users** to create accounts. Users enter the same connection URL and their
   own login. A second administrator can be created from the app if needed.

There is no automatically deployed backend yet. The connected Drive tools can
create the database but do not expose Apps Script creation or deployment. The
owner's Google authorization and administrator password are required to finish
activation.

## App behavior

- Users can add family profiles and add, edit, or pause their own medicines.
- Admins can list users, create accounts, change role/status, reset passwords,
  and select another user to manage their medicine schedule.
- The server derives ownership from the authenticated account. A user cannot
  gain access to someone else's records by sending another user ID.
- Pausing preserves medicine/history rows. Dose status updates replace the same
  medicine/date/time record rather than creating duplicates.
- Phone reminders use only the signed-in account's cached schedule. Admin edits
  for other accounts do not schedule those users' reminders on the admin's phone.
- Each phone must refresh to receive administrator changes. There is no push
  synchronization or remote cancellation of already cached offline reminders.
- Sign-in and medicine changes need internet. Native reminders use cached data.

## Passwords and sessions

The client derives a 256-bit password key with PBKDF2-HMAC-SHA256, a random
128-bit salt, and 600,000 iterations. The backend stores an HMAC of that key with
a script-private pepper. Password verifiers and salts live in Script Properties,
not spreadsheet cells. They are not included in the source repository.

Session tokens are random and hashed before cache lookup. Sessions last at most
six hours; Google cache eviction can end them sooner. Password reset revokes
existing sessions. Disabled users cannot read or update records. At least one
credentialed active administrator must remain. On Android, the session is stored
using an Android Keystore AES-GCM key; the raw token is not exposed to the web UI.

This custom account service is an internal prototype, with Apps Script and
spreadsheet quotas. It is not a substitute for a managed identity provider or a
production medical-record system. Test with sample records before using live
health information. Keep both the Sheet and its Script project restricted to
trusted administrators. Do not put passwords, tokens, or signing keys in cells.

## Developer tests

```sh
node sheets-backend/tests/backend.test.cjs
```

This exercises mocked Apps Script services for account isolation, role checks,
medicine edits, dose upserts, password resets, disabling accounts, logout, rate
limits, and formula-injection escaping. Live Google deployment testing remains
necessary after activation. Sample database rows prefixed `sample_` are disabled
examples and have no credentials.
