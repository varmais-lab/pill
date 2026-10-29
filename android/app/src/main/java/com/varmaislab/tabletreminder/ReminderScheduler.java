package com.varmaislab.tabletreminder;

import android.Manifest;
import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import org.json.JSONObject;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Set;

final class ReminderScheduler {
    static final String CHANNEL = "medicine_reminders_v1";

    static void channel(Context context) {
        NotificationChannel channel = new NotificationChannel(CHANNEL, "Medicine reminders", NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("Reminders for the medicine times you enter on this phone");
        channel.enableVibration(true);
        channel.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);
        context.getSystemService(NotificationManager.class).createNotificationChannel(channel);
    }

    static boolean notificationsAllowed(Context context) {
        if (Build.VERSION.SDK_INT >= 33 && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return false;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        NotificationChannel channel = manager.getNotificationChannel(CHANNEL);
        return manager.areNotificationsEnabled() && (channel == null || channel.getImportance() != NotificationManager.IMPORTANCE_NONE);
    }

    static boolean exactAllowed(Context context) {
        return Build.VERSION.SDK_INT < 31 || context.getSystemService(AlarmManager.class).canScheduleExactAlarms();
    }

    static synchronized void schedule(Context context) {
        AppStore store = new AppStore(context);
        AlarmManager alarms = context.getSystemService(AlarmManager.class);
        Intent intent = new Intent(context, ReminderReceiver.class);
        PendingIntent previous = PendingIntent.getBroadcast(context, 100, intent, PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE);
        if (previous != null) alarms.cancel(previous);
        store.nextAt(0);
        if (!store.enabled() || !notificationsAllowed(context)) return;
        long now = System.currentTimeMillis();
        ScheduleEngine.Occurrence next = ScheduleEngine.next(store.medicines(), store.completed(), store.delivered(), now, ZoneId.systemDefault());
        if (next == null) return;
        intent.putExtra("scheduled_for", next.at);
        PendingIntent operation = PendingIntent.getBroadcast(context, 100, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        long trigger = Math.max(now + 1_000L, next.at);
        try {
            if (exactAllowed(context)) alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, trigger, operation);
            else alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, trigger, operation);
        } catch (SecurityException denied) {
            // Permission can be revoked between the check and the call.
            alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, trigger, operation);
        }
        store.nextAt(next.at);
    }

    static synchronized void deliver(Context context, long scheduledFor) {
        AppStore store = new AppStore(context);
        if (!store.enabled() || !notificationsAllowed(context)) { schedule(context); return; }
        long now = System.currentTimeMillis();
        if (scheduledFor <= 0 || scheduledFor > now) { schedule(context); return; }
        Set<String> delivered = store.delivered();
        List<ScheduleEngine.Occurrence> due = ScheduleEngine.due(store.medicines(), store.completed(), delivered, scheduledFor, now, ZoneId.systemDefault());
        for (ScheduleEngine.Occurrence slot : due) {
            String detail = slot.medicine.patient + " · " + slot.medicine.name + " — " + slot.medicine.dose + " · " + slot.time;
            show(context, slot.key, "Medicine reminder", detail);
            delivered.add(slot.key);
        }
        store.delivered(delivered);
        schedule(context);
    }

    static void test(Context context) {
        if (notificationsAllowed(context)) show(context, "test", "Tablet Reminder test", "Notifications are working on this phone. This is a test reminder.");
    }

    private static void show(Context context, String tag, String title, String text) {
        channel(context);
        Intent open = new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent tap = PendingIntent.getActivity(context, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification publicVersion = new Notification.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_notification).setContentTitle("Tablet Reminder").setContentText("Scheduled reminder").build();
        Notification notification = new Notification.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_notification).setColor(0xff176b50)
            .setContentTitle(title).setContentText(text).setStyle(new Notification.BigTextStyle().bigText(text))
            .setVisibility(Notification.VISIBILITY_PRIVATE).setPublicVersion(publicVersion)
            .setContentIntent(tap).setAutoCancel(true).setCategory(Notification.CATEGORY_REMINDER).build();
        try { context.getSystemService(NotificationManager.class).notify(tag, 0, notification); }
        catch (SecurityException ignored) { /* Notification permission may be revoked at any time. */ }
    }

    static String status(Context context) {
        AppStore store = new AppStore(context);
        JSONObject status = new JSONObject();
        try {
            status.put("enabled", store.enabled());
            status.put("notificationsAllowed", notificationsAllowed(context));
            status.put("exactAllowed", exactAllowed(context));
            long next = store.nextAt();
            status.put("next", next > 0 ? java.time.Instant.ofEpochMilli(next).atZone(ZoneId.systemDefault()).format(DateTimeFormatter.ofPattern("EEE, d MMM · HH:mm")) : "");
        } catch (Exception ignored) {}
        return status.toString();
    }
}
