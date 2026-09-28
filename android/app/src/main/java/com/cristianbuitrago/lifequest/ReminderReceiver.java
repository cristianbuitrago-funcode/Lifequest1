package com.cristianbuitrago.lifequest;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Recibe la alarma de un recordatorio y muestra su notificación. */
public class ReminderReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        ReminderScheduler.post(context,
            intent.getIntExtra(ReminderScheduler.EXTRA_ID, 1),
            intent.getStringExtra(ReminderScheduler.EXTRA_TITLE),
            intent.getStringExtra(ReminderScheduler.EXTRA_BODY),
            intent.getStringExtra(ReminderScheduler.EXTRA_KIND),
            intent.getStringExtra(ReminderScheduler.EXTRA_BILL));
    }
}
