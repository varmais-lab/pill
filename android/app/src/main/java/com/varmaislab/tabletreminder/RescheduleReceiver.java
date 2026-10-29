package com.varmaislab.tabletreminder;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public final class RescheduleReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) { ReminderScheduler.schedule(context); }
}
