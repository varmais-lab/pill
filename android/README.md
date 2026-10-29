# Tablet Reminder for Android — prototype 0.1.0

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

The app has no internet permission and does not require the hosted website,
ChatGPT login, Node.js, or a server. Every phone has its own independent records.
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
