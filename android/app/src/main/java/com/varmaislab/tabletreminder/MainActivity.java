package com.varmaislab.tabletreminder;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.WindowInsets;
import android.webkit.JavascriptInterface;
import android.webkit.JsResult;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;
import java.io.ByteArrayInputStream;
import java.util.Collections;

public final class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final int REMINDER_PERMISSION = 101, TEST_PERMISSION = 102;
    private WebView web;
    private CloudClient cloud;

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        ReminderScheduler.channel(this);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(237, 243, 239));
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            root.setOnApplyWindowInsetsListener((view, insets) -> {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                return insets;
            });
        } else root.setFitsSystemWindows(true);

        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(237, 243, 239));
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setSafeBrowsingEnabled(true);
        web.addJavascriptInterface(new PhoneBridge(), "TabletAndroid");
        cloud = new CloudClient(this, web);
        web.addJavascriptInterface(cloud, "TabletCloud");
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !local(request.getUrl());
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (!local(uri)) return empty();
                String asset = uri.getPath().substring("/assets/".length());
                if (!asset.matches("[a-zA-Z0-9._/-]+") || asset.contains("..")) return empty();
                try {
                    String mime = asset.endsWith(".html") ? "text/html" : asset.endsWith(".js") ? "application/javascript" : "text/plain";
                    WebResourceResponse response = new WebResourceResponse(mime, "UTF-8", getAssets().open(asset));
                    response.setResponseHeaders(Collections.singletonMap("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; frame-src 'none'; object-src 'none'"));
                    return response;
                } catch (Exception ignored) { return empty(); }
            }
            @Override public void onPageFinished(WebView view, String url) { updateStatus(); }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onJsConfirm(WebView view, String url, String message, JsResult result) {
                new AlertDialog.Builder(MainActivity.this).setTitle("Tablet Reminder").setMessage(message)
                    .setPositiveButton("Confirm", (dialog, which) -> result.confirm())
                    .setNegativeButton("Cancel", (dialog, which) -> result.cancel())
                    .setOnCancelListener(dialog -> result.cancel()).show();
                return true;
            }
        });
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);
        web.loadUrl("https://" + HOST + "/assets/index.html");
    }

    private static boolean local(Uri uri) { return "https".equals(uri.getScheme()) && HOST.equals(uri.getHost()) && uri.getPort() == -1 && uri.getPath() != null && uri.getPath().startsWith("/assets/"); }
    private static WebResourceResponse empty() { return new WebResourceResponse("text/plain", "UTF-8", 403, "Blocked", Collections.emptyMap(), new ByteArrayInputStream(new byte[0])); }

    @Override protected void onResume() {
        super.onResume();
        ReminderScheduler.schedule(this);
        updateStatus();
    }
    private void updateStatus() { if (web != null) web.evaluateJavascript("window.refreshAndroidStatus&&window.refreshAndroidStatus()", null); }
    private void message(String text) { Toast.makeText(this, text, Toast.LENGTH_LONG).show(); updateStatus(); }

    private void enableReminders() {
        new AppStore(this).enable(true);
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{ Manifest.permission.POST_NOTIFICATIONS }, REMINDER_PERMISSION);
        } else finishEnabling();
    }
    private void finishEnabling() {
        ReminderScheduler.schedule(this);
        if (!ReminderScheduler.notificationsAllowed(this)) {
            message("Notifications are blocked. Open Reminder settings to allow them.");
            return;
        }
        if (Build.VERSION.SDK_INT >= 31 && !ReminderScheduler.exactAllowed(this)) {
            new AlertDialog.Builder(this).setTitle("Reminder timing")
                .setMessage("Allow Alarms & reminders in Android settings for closer timing. Without this access, Android may delay reminders.")
                .setPositiveButton("Open settings", (dialog, which) -> exactSettings())
                .setNegativeButton("Use flexible timing", (dialog, which) -> message("Reminders enabled with flexible timing.")).show();
        } else message("Phone reminders enabled.");
        updateStatus();
    }
    private void exactSettings() {
        if (Build.VERSION.SDK_INT >= 31) {
            try { startActivity(new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + getPackageName()))); }
            catch (Exception ignored) { message("This phone does not expose precise alarm settings."); }
        } else message("Precise alarms are available on this phone.");
    }
    private void notificationSettings() {
        try { startActivity(new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName())); }
        catch (Exception ignored) { message("Open Android Settings, Apps, Tablet Reminder, Notifications."); }
    }
    private void testNotification() {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
            requestPermissions(new String[]{ Manifest.permission.POST_NOTIFICATIONS }, TEST_PERMISSION);
        else if (!ReminderScheduler.notificationsAllowed(this)) notificationSettings();
        else { ReminderScheduler.test(this); message("Test notification sent."); }
    }

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        boolean granted = results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED;
        if (requestCode == REMINDER_PERMISSION) {
            if (granted) finishEnabling();
            else { new AppStore(this).enable(false); ReminderScheduler.schedule(this); message("Reminders remain off. You can enable them later."); }
        } else if (requestCode == TEST_PERMISSION) {
            if (granted) { ReminderScheduler.test(this); message("Test notification sent."); }
            else message("Notification permission was not granted.");
        }
    }

    public final class PhoneBridge {
        @JavascriptInterface public String loadData() { return new AppStore(MainActivity.this).raw(); }
        @JavascriptInterface public boolean saveData(String raw) {
            if (cloud != null && cloud.isCloudMode()) return false;
            synchronized (ReminderScheduler.class) {
                boolean saved = new AppStore(MainActivity.this).save(raw);
                if (saved) ReminderScheduler.schedule(MainActivity.this);
                return saved;
            }
        }
        @JavascriptInterface public String reminderStatus() { return ReminderScheduler.status(MainActivity.this); }
        @JavascriptInterface public void enableReminders() { runOnUiThread(() -> MainActivity.this.enableReminders()); }
        @JavascriptInterface public void disableReminders() { runOnUiThread(() -> { new AppStore(MainActivity.this).enable(false); ReminderScheduler.schedule(MainActivity.this); message("Phone reminders turned off."); }); }
        @JavascriptInterface public void testNotification() { runOnUiThread(() -> MainActivity.this.testNotification()); }
        @JavascriptInterface public void resetReminders() { new AppStore(MainActivity.this).resetDeliveryHistory(); ReminderScheduler.schedule(MainActivity.this); }
        @JavascriptInterface public void settings() { runOnUiThread(() -> new AlertDialog.Builder(MainActivity.this)
            .setTitle("Reminder settings").setItems(new String[]{ "Precise alarm timing", "Notification settings", "About this prototype" }, (dialog, which) -> {
                if (which == 0) exactSettings(); else if (which == 1) notificationSettings();
                else new AlertDialog.Builder(MainActivity.this).setTitle("Tablet Reminder 0.2.0")
                    .setMessage("Shared accounts sync records to your organisation's spreadsheet. Phone reminders use your own cached schedule. Offline prototype mode keeps records on this phone. Android settings, force-stop, and battery controls can interrupt reminders. Uninstalling removes local records.")
                    .setPositiveButton("OK", null).show();
            }).show()); }
    }

    @Override protected void onDestroy() {
        if (cloud != null) cloud.close();
        if (web != null) { web.removeJavascriptInterface("TabletAndroid"); web.removeJavascriptInterface("TabletCloud"); web.destroy(); }
        super.onDestroy();
    }
}
