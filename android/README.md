# Tablet Reminder for Android — accounts prototype 0.2.0

This version adds email/password sign-in, personal medicine editing, administrator
user management, and a Google Sheets backend. See
[`../sheets-backend/README.md`](../sheets-backend/README.md) for the required one-time
Google authorization and backend activation. Until that step is completed, shared
login is not connected. The app's **Use offline prototype** option preserves the
previous local mode.

Install `TabletReminder-Accounts.apk` over the existing app without uninstalling.
It uses the same application ID and prototype signing certificate, with version
code 2. Previous unlinked on-phone records are retained in a private legacy
backup and can be accessed by switching to the offline prototype. They are not
automatically uploaded or attached to a new user's account.

After the administrator activates the backend, enter its `/exec` address under
**Connection settings** and sign in. Users can add/edit/pause their own medicines.
Admins also get **Users** controls for creating accounts, changing access,
resetting passwords, and managing a selected user's medicines. The old `demo123`
password applies only to the offline prototype, never to shared accounts.

Shared changes require internet. Reminder alarms use the current account's
cached schedule; refresh the app to fetch changes made by an administrator.
Signing out clears that account's local schedule and cancels its phone alarms.
Session tokens are encrypted with an Android Keystore key. The network client
accepts only HTTPS Apps Script deployment URLs and Google content redirects.

## Original offline mode

Offline Android app based on the Tablet Reminder web prototype. Android 8.0+
(API 26+). It packages the existing mobile UI inside a restricted WebView and
adds native local data storage, Android notifications, scheduled alarms, and
rescheduling after reboot, time-zone changes, or app updates.

## Try the APK

1. Copy `TabletReminder.apk` to an Android phone and open it.
2. If Android asks, allow installation from the app you used to open the file.
3. Open **Tablet Reminder**. The first launch includes fictional sample data.
4. Admin demo password: `demo123`. This is a demo screen lock, not production authentication.
5. Tap **Enable phone reminders** and allow notifications. On Android 12+, allow
   **Alarms & reminders** when prompted for closer timing. Declining uses flexible
   alarm timing, which Android may delay.
6. Tap **Test notification**. For a scheduled test, add a sample medicine a few
   minutes ahead, lock the phone, and verify that the notification arrives.

Offline mode does not require the hosted website, ChatGPT login, Node.js, or a
server. Shared-account mode uses the internet permission for its configured
Google Apps Script service. Offline records remain independent on each phone.
Data is saved in the app's private storage, and automatic backups/transfers are
disabled. There is no export/restore feature yet. Uninstalling clears local data.

## What works

- Family profiles; medicine names, doses, instructions, and daily times.
- Taken/skipped dose logs and daily progress.
- Notifications with the app closed, subject to permissions and Android/OEM restrictions.
- One scheduled alarm for the next due time, avoiding large numbers of active alarms.
- Reboot/time-zone rescheduling; duplicate notification suppression and limited catch-up.
- Reminder settings, permissions status, test notification, and an off switch.
- Medication details hidden in the default public lock-screen notification content.

## Prototype limits and device verification

This is an internal test build, not a Play Store release or a validated medical
device. Use sample data in team testing. Scheduling does not validate clinical
dosages or detect unsafe combinations. No WhatsApp, SMS, prescription scanning,
cloud sync, or clinician review is included. Some Android battery controls,
force-stopping the app, disabled notifications, or revoked alarm access can stop
or delay reminders. Reopen the app after force-stop. No absolute delivery
guarantee is possible. A real Android device test is required before reliance.

## Build in Android Studio

Open this `android` directory in Android Studio. Use JDK 17+, SDK Platform 36,
Build-Tools 35.0.0, Android Gradle Plugin 8.13.2, and Gradle 8.13. Run
`gradlew.bat assembleDebug` on Windows or `./gradlew assembleDebug` on macOS/Linux.
The Studio debug APK is in `app/build/outputs/apk/debug/`.

The standalone builder uses the same source without Gradle:

```sh
python3 tools/build_apk.py --sdk /path/to/android-sdk --keystore /private/tablet-prototype.jks
```

It uses the `tabletprototype` alias and the conventional **test-only** password
`android`. Keep this generated signing key private and retain it for compatible
updates to the distributed prototype. Do not commit signing keys. A production
release needs a separate managed release key, privacy work, and device QA.

## Schedule tests

`tests/ScheduleEngineTest.java` runs without Android APIs. Compile it together
with `app/src/main/java/com/varmaislab/tabletreminder/ScheduleEngine.java`, then
run `com.varmaislab.tabletreminder.ScheduleEngineTest` using Java 17+.

## Platform references

- [Android alarm permissions and timing](https://developer.android.com/develop/background-work/services/alarms)
- [Notification permission](https://developer.android.com/develop/ui/views/notifications/notification-permission)
- [Local WebView content](https://developer.android.com/develop/ui/views/layout/webapps/load-local-content)
- [Build compatibility](https://developer.android.com/build/releases/agp-8-13-0-release-notes)
