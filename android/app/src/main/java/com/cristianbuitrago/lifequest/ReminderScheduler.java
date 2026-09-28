package com.cristianbuitrago.lifequest;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Programador de recordatorios propio.
 *
 * Usa AlarmManager.setAlarmClock(): el mismo tipo de alarma que usan las apps de
 * despertador. Android la entrega a su hora aunque el teléfono esté en reposo, y
 * las capas de los fabricantes (MyOS, MIUI, One UI…) la respetan mucho más que
 * las alarmas normales, que pueden retrasar o descartar con la app en segundo plano.
 *
 * La lista se guarda en SharedPreferences para volver a programarla al reiniciar
 * el teléfono o al actualizar la app (ReminderBootReceiver).
 */
public final class ReminderScheduler {

    static final String CHANNEL_ID = "lq-recordatorios";
    static final String EXTRA_ID = "lq_id";
    static final String EXTRA_TITLE = "lq_title";
    static final String EXTRA_BODY = "lq_body";
    static final String EXTRA_KIND = "lq_kind";
    static final String EXTRA_BILL = "lq_bill";
    private static final String PREFS = "lq_reminders";
    private static final String KEY_LIST = "list";

    private ReminderScheduler() {}

    /** Canal de importancia alta: aparece arriba y suena. */
    static void ensureChannel(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        if (nm == null || nm.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL_ID, "Recordatorios", NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription("Misiones, hábitos, pagos y alarmas de LifeCoinQuest");
        ch.enableVibration(true);
        ch.setVibrationPattern(new long[] { 0, 400, 200, 400 });
        ch.enableLights(true);
        ch.setLightColor(Color.parseColor("#D4AF37"));
        ch.setLockscreenVisibility(NotificationCompat.VISIBILITY_PUBLIC);
        ch.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
            new AudioAttributes.Builder()
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT)
                .build());
        nm.createNotificationChannel(ch);
    }

    /** Sustituye todos los recordatorios programados por `list` y la guarda. */
    static int replaceAll(Context ctx, JSONArray list) {
        cancelStored(ctx);
        prefs(ctx).edit().putString(KEY_LIST, list.toString()).apply();
        return scheduleStored(ctx);
    }

    /** Programa (otra vez) los recordatorios guardados que aún no han pasado. */
    static int scheduleStored(Context ctx) {
        ensureChannel(ctx);
        JSONArray list = stored(ctx);
        long now = System.currentTimeMillis();
        int count = 0;
        for (int i = 0; i < list.length(); i++) {
            JSONObject r = list.optJSONObject(i);
            if (r == null) continue;
            long at = r.optLong("at", 0);
            if (at <= now) continue;
            schedule(ctx, r, at);
            count++;
        }
        return count;
    }

    private static void schedule(Context ctx, JSONObject r, long at) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        PendingIntent fire = firePendingIntent(ctx, r);
        if (canExact(ctx)) {
            // "Abrir" desde el icono de alarma del sistema lleva a la app.
            PendingIntent show = PendingIntent.getActivity(ctx, 0,
                new Intent(ctx, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            am.setAlarmClock(new AlarmManager.AlarmClockInfo(at, show), fire);
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, fire);
        } else {
            am.set(AlarmManager.RTC_WAKEUP, at, fire);
        }
    }

    private static PendingIntent firePendingIntent(Context ctx, JSONObject r) {
        Intent i = new Intent(ctx, ReminderReceiver.class);
        i.setAction("com.cristianbuitrago.lifequest.REMINDER");
        int id = r.optInt("id");
        i.putExtra(EXTRA_ID, id);
        i.putExtra(EXTRA_TITLE, r.optString("title", "LifeCoinQuest"));
        i.putExtra(EXTRA_BODY, r.optString("body", ""));
        i.putExtra(EXTRA_KIND, r.optString("kind", ""));
        i.putExtra(EXTRA_BILL, r.optString("billId", ""));
        return PendingIntent.getBroadcast(ctx, id, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static void cancelStored(Context ctx) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        JSONArray list = stored(ctx);
        for (int i = 0; i < list.length(); i++) {
            JSONObject r = list.optJSONObject(i);
            if (r != null) am.cancel(firePendingIntent(ctx, r));
        }
    }

    /** Muestra la notificación de un recordatorio (al sonar la alarma o como prueba). */
    static void post(Context ctx, int id, String title, String body, String kind, String billId) {
        ensureChannel(ctx);
        Intent open = new Intent(ctx, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        open.putExtra(EXTRA_KIND, kind == null ? "" : kind);
        open.putExtra(EXTRA_BILL, billId == null ? "" : billId);
        PendingIntent content = PendingIntent.getActivity(ctx, id, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_lifequest)
            .setColor(Color.parseColor("#D4AF37"))
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setAutoCancel(true)
            .setContentIntent(content);
        try {
            NotificationManagerCompat.from(ctx).notify(id, b.build());
        } catch (SecurityException e) {
            // Sin permiso de notificaciones: no hay nada que mostrar.
        }
    }

    static boolean canExact(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true;
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        return am != null && am.canScheduleExactAlarms();
    }

    static JSONArray stored(Context ctx) {
        try {
            return new JSONArray(prefs(ctx).getString(KEY_LIST, "[]"));
        } catch (Exception e) {
            return new JSONArray();
        }
    }

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
