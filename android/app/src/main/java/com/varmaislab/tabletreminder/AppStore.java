package com.varmaislab.tabletreminder;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONObject;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

final class AppStore {
    private final SharedPreferences prefs;
    AppStore(Context context) { prefs = context.getSharedPreferences("tablet_state", Context.MODE_PRIVATE); }
    String raw() { return prefs.getString("data", ""); }
    boolean enabled() { return prefs.getBoolean("reminders_enabled", false); }
    void enable(boolean value) { prefs.edit().putBoolean("reminders_enabled", value).commit(); }

    synchronized boolean save(String raw) {
        try {
            if (raw == null || raw.length() > 2_000_000) return false;
            JSONObject data = new JSONObject(raw);
            if (data.optJSONArray("patients") == null || data.optJSONArray("medicines") == null || data.optJSONArray("logs") == null) return false;
            if (data.getJSONArray("medicines").length() > 500 || data.getJSONArray("patients").length() > 100) return false;
            return prefs.edit().putString("data", data.toString()).commit();
        } catch (Exception ignored) { return false; }
    }

    List<ScheduleEngine.Medicine> medicines() {
        List<ScheduleEngine.Medicine> results = new ArrayList<>();
        try {
            JSONObject data = new JSONObject(raw());
            JSONArray medicines = data.getJSONArray("medicines"), patients = data.getJSONArray("patients");
            for (int i = 0; i < medicines.length(); i++) {
                JSONObject m = medicines.getJSONObject(i);
                JSONArray slots = m.optJSONArray("times");
                List<String> times = new ArrayList<>();
                if (slots != null) for (int j = 0; j < slots.length(); j++) {
                    String value = slots.optString(j);
                    if (value.matches("([01]\\d|2[0-3]):[0-5]\\d") && !times.contains(value)) times.add(value);
                }
                String patient = "Family";
                for (int j = 0; j < patients.length(); j++) {
                    JSONObject p = patients.getJSONObject(j);
                    if (p.optString("id").equals(m.optString("patientId"))) patient = p.optString("name", "Family");
                }
                results.add(new ScheduleEngine.Medicine(m.getString("id"), patient, m.optString("name"),
                    m.optString("dose", "As prescribed"), times, m.optBoolean("active", true)));
            }
        } catch (Exception ignored) { /* A fresh app has no saved schedule yet. */ }
        return results;
    }

    Set<String> completed() {
        Set<String> keys = new HashSet<>();
        try {
            JSONArray logs = new JSONObject(raw()).getJSONArray("logs");
            for (int i = 0; i < logs.length(); i++) {
                JSONObject log = logs.getJSONObject(i);
                if ("taken".equals(log.optString("status")) || "skipped".equals(log.optString("status")))
                    keys.add(ScheduleEngine.key(log.optString("medicineId"), log.optString("date"), log.optString("time")));
            }
        } catch (Exception ignored) {}
        return keys;
    }

    Set<String> delivered() { return new HashSet<>(prefs.getStringSet("delivered", new HashSet<>())); }
    void delivered(Set<String> keys) {
        String oldest = LocalDate.now().minusDays(2).toString();
        keys.removeIf(key -> { String[] parts = key.split("\\|"); return parts.length != 3 || parts[1].compareTo(oldest) < 0; });
        prefs.edit().putStringSet("delivered", new HashSet<>(keys)).commit();
    }
    void resetDeliveryHistory() { prefs.edit().remove("delivered").commit(); }
    void nextAt(long value) { prefs.edit().putLong("next_at", value).commit(); }
    long nextAt() { return prefs.getLong("next_at", 0); }
}
