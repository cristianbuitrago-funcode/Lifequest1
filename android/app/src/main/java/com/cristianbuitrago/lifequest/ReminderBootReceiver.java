package com.cristianbuitrago.lifequest;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Android borra las alarmas al reiniciar el teléfono (y al cambiar la hora):
 * aquí se vuelven a programar desde la lista guardada, sin abrir la app.
 */
public class ReminderBootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        ReminderScheduler.scheduleStored(context);
    }
}
