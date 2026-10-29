package com.varmaislab.tabletreminder;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Set;

/** Pure Java date logic; Android alarms and storage stay outside this class. */
public final class ScheduleEngine {
    public static final class Medicine {
        public final String id, patient, name, dose;
        public final List<String> times;
        public final boolean active;
        public Medicine(String id, String patient, String name, String dose, List<String> times, boolean active) {
            this.id = id; this.patient = patient; this.name = name; this.dose = dose;
            this.times = times; this.active = active;
        }
    }

    public static final class Occurrence {
        public final Medicine medicine;
        public final String date, time, key;
        public final long at;
        Occurrence(Medicine medicine, LocalDate date, String time, ZoneId zone) {
            this.medicine = medicine; this.date = date.toString(); this.time = time;
            this.key = key(medicine.id, this.date, time);
            this.at = date.atTime(LocalTime.parse(time)).atZone(zone).toInstant().toEpochMilli();
        }
    }

    public static String key(String id, String date, String time) { return id + "|" + date + "|" + time; }

    public static Occurrence next(List<Medicine> medicines, Set<String> done, Set<String> delivered,
                                   long now, ZoneId zone) {
        LocalDate today = Instant.ofEpochMilli(now).atZone(zone).toLocalDate();
        Occurrence result = null;
        for (int day = 0; day < 2; day++) {
            LocalDate date = today.plusDays(day);
            for (Medicine medicine : medicines) {
                if (!medicine.active) continue;
                for (String time : medicine.times) {
                    Occurrence slot = new Occurrence(medicine, date, time, zone);
                    // An enabled reminder in its current minute can still be delivered once.
                    if (slot.at < now - 59_999L || done.contains(slot.key) || delivered.contains(slot.key)) continue;
                    if (result == null || slot.at < result.at) result = slot;
                }
            }
            if (result != null) return result;
        }
        return null;
    }

    public static List<Occurrence> due(List<Medicine> medicines, Set<String> done, Set<String> delivered,
                                       long from, long now, ZoneId zone) {
        List<Occurrence> results = new ArrayList<>();
        // Old reminders after a long device shutdown are not useful. Catch up at most six hours.
        long start = Math.max(from, now - 6L * 60 * 60 * 1000);
        LocalDate date = Instant.ofEpochMilli(start).atZone(zone).toLocalDate();
        LocalDate end = Instant.ofEpochMilli(now).atZone(zone).toLocalDate();
        while (!date.isAfter(end)) {
            for (Medicine medicine : medicines) {
                if (!medicine.active) continue;
                for (String time : medicine.times) {
                    Occurrence slot = new Occurrence(medicine, date, time, zone);
                    if (slot.at >= start && slot.at <= now && !done.contains(slot.key) && !delivered.contains(slot.key)) results.add(slot);
                }
            }
            date = date.plusDays(1);
        }
        results.sort(Comparator.comparingLong(slot -> slot.at));
        return results;
    }

    private ScheduleEngine() {}
}
