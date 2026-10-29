package com.varmaislab.tabletreminder;

import java.time.ZonedDateTime;
import java.time.ZoneId;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

public class ScheduleEngineTest {
    private static long at(String value) { return ZonedDateTime.parse(value).toInstant().toEpochMilli(); }
    private static void check(boolean pass, String description) { if (!pass) throw new AssertionError(description); }

    public static void main(String[] args) {
        ZoneId zone = ZoneId.of("Asia/Kolkata");
        ScheduleEngine.Medicine m = new ScheduleEngine.Medicine("m1", "Sample", "Demo", "As prescribed", Arrays.asList("08:00", "20:00"), true);
        List<ScheduleEngine.Medicine> medicines = Collections.singletonList(m);
        Set<String> none = Collections.emptySet();
        ScheduleEngine.Occurrence next = ScheduleEngine.next(medicines, none, none, at("2026-10-29T07:59:00+05:30"), zone);
        check(next.time.equals("08:00") && next.date.equals("2026-10-29"), "next scheduled dose");
        Set<String> done = new HashSet<>();
        done.add(ScheduleEngine.key("m1", "2026-10-29", "08:00"));
        check(ScheduleEngine.next(medicines, done, none, at("2026-10-29T07:59:00+05:30"), zone).time.equals("20:00"), "taken/skipped doses suppressed");
        long minute = at("2026-10-29T08:00:30+05:30");
        check(ScheduleEngine.next(medicines, none, none, minute, zone).time.equals("08:00"), "enabling in current minute");
        check(ScheduleEngine.next(medicines, none, done, minute, zone).time.equals("20:00"), "no duplicate current-minute delivery");
        next = ScheduleEngine.next(medicines, none, none, at("2026-10-29T21:00:00+05:30"), zone);
        check(next.date.equals("2026-10-30") && next.time.equals("08:00"), "next day rollover");
        check(ScheduleEngine.due(medicines, none, none, at("2026-10-29T08:00:00+05:30"), at("2026-10-29T08:15:00+05:30"), zone).size() == 1, "delayed alarm catch-up");
        check(ScheduleEngine.due(medicines, done, none, at("2026-10-29T08:00:00+05:30"), at("2026-10-29T08:15:00+05:30"), zone).isEmpty(), "logged dose not notified after delay");
        check(ScheduleEngine.due(medicines, none, none, at("2026-10-29T08:00:00+05:30"), at("2026-10-29T19:00:00+05:30"), zone).isEmpty(), "stale reminders suppressed");
        ScheduleEngine.Medicine inactive = new ScheduleEngine.Medicine("off", "Sample", "Demo", "Sample", Arrays.asList("08:00"), false);
        check(ScheduleEngine.next(Collections.singletonList(inactive), none, none, minute, zone) == null, "inactive medicine ignored");
        ScheduleEngine.Medicine other = new ScheduleEngine.Medicine("m2", "Sample", "Demo 2", "Sample", Arrays.asList("08:00"), true);
        check(ScheduleEngine.due(Arrays.asList(m, other), none, none, at("2026-10-29T08:00:00+05:30"), minute, zone).size() == 2, "simultaneous doses grouped by one alarm");
        ScheduleEngine.Medicine dst = new ScheduleEngine.Medicine("dst", "Sample", "Demo", "Sample", Arrays.asList("02:30"), true);
        next = ScheduleEngine.next(Collections.singletonList(dst), none, none, at("2026-03-08T01:00:00-05:00[America/New_York]"), ZoneId.of("America/New_York"));
        check(next.at == at("2026-03-08T03:30:00-04:00[America/New_York]"), "daylight-saving gap resolved without crash");
        System.out.println("PASS: 11 schedule checks, including suppression, catch-up, rollover, and daylight-saving time.");
    }
}
