package com.cristianbuitrago.lifequest;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.os.Build;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONArray;
import org.json.JSONObject;

/** Puente JS ↔ ReminderScheduler (programar, probar y diagnosticar recordatorios). */
@CapacitorPlugin(name = "LqAlarms")
public class AlarmsPlugin extends Plugin {

    /** {items: [{id, at (ms), title, body, kind, billId}]} → sustituye todo lo programado. */
    @PluginMethod
    public void replaceAll(PluginCall call) {
        JSArray items = call.getArray("items", new JSArray());
        JSONArray clean = new JSONArray();
        for (int i = 0; i < items.length(); i++) {
            JSONObject r = items.optJSONObject(i);
            if (r != null && r.has("id") && r.has("at") && r.optInt("id") != 999) clean.put(r);
        }
        // Una prueba pendiente ("Probar en 1 minuto") sobrevive a la replanificación.
        JSONArray old = ReminderScheduler.stored(getContext());
        for (int i = 0; i < old.length(); i++) {
            JSONObject r = old.optJSONObject(i);
            if (r != null && r.optInt("id") == 999 && r.optLong("at", 0) > System.currentTimeMillis()) clean.put(r);
        }
        int n = ReminderScheduler.replaceAll(getContext(), clean);
        JSObject ret = new JSObject();
        ret.put("scheduled", n);
        call.resolve(ret);
    }

    /** Muestra una notificación ahora mismo (sin alarma): prueba el canal y los permisos. */
    @PluginMethod
    public void notifyNow(PluginCall call) {
        ReminderScheduler.post(getContext(), call.getInt("id", 998),
            call.getString("title", "LifeCoinQuest"), call.getString("body", ""), "test", "");
        call.resolve();
    }

    /** Programa una prueba dentro de `seconds` segundos con el mismo tipo de alarma que los recordatorios. */
    @PluginMethod
    public void test(PluginCall call) {
        JSONArray list = ReminderScheduler.stored(getContext());
        JSONArray next = new JSONArray();
        for (int i = 0; i < list.length(); i++) {
            JSONObject r = list.optJSONObject(i);
            if (r != null && r.optInt("id") != 999) next.put(r);
        }
        try {
            JSONObject t = new JSONObject();
            t.put("id", 999);
            t.put("at", System.currentTimeMillis() + call.getInt("seconds", 60) * 1000L);
            t.put("title", call.getString("title", "🔔 Prueba de LifeCoinQuest"));
            t.put("body", call.getString("body", "Si ves y oyes esto, tus recordatorios funcionan."));
            t.put("kind", "test");
            next.put(t);
        } catch (Exception ignored) {}
        ReminderScheduler.replaceAll(getContext(), next);
        call.resolve();
    }

    /** Estado para el diagnóstico de Ajustes. */
    @PluginMethod
    public void status(PluginCall call) {
        Context ctx = getContext();
        ReminderScheduler.ensureChannel(ctx);
        JSObject ret = new JSObject();
        ret.put("notificationsEnabled", NotificationManagerCompat.from(ctx).areNotificationsEnabled());
        ret.put("exact", ReminderScheduler.canExact(ctx));
        int importance = -1;
        boolean sound = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = ctx.getSystemService(NotificationManager.class);
            NotificationChannel ch = nm == null ? null : nm.getNotificationChannel(ReminderScheduler.CHANNEL_ID);
            if (ch != null) { importance = ch.getImportance(); sound = ch.getSound() != null; }
        }
        ret.put("channelImportance", importance);
        ret.put("channelSound", sound);
        JSONArray list = ReminderScheduler.stored(ctx);
        long now = System.currentTimeMillis(), next = 0;
        int pending = 0;
        for (int i = 0; i < list.length(); i++) {
            long at = list.optJSONObject(i) == null ? 0 : list.optJSONObject(i).optLong("at", 0);
            if (at > now) { pending++; if (next == 0 || at < next) next = at; }
        }
        ret.put("pending", pending);
        ret.put("next", next);
        ret.put("manufacturer", Build.MANUFACTURER == null ? "" : Build.MANUFACTURER.toLowerCase());
        ret.put("sdk", Build.VERSION.SDK_INT);
        call.resolve(ret);
    }

    /** Qué recordatorio abrió la app (si fue así), para llevar a la pestaña correcta. Se consume una vez. */
    @PluginMethod
    public void consumeOpen(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("kind", MainActivity.pendingKind);
        ret.put("billId", MainActivity.pendingBill);
        MainActivity.pendingKind = null;
        MainActivity.pendingBill = null;
        call.resolve(ret);
    }

    /** Abre los ajustes de notificación del canal (sonido, ventana emergente…). */
    @PluginMethod
    public void openChannelSettings(PluginCall call) {
        Context ctx = getContext();
        ReminderScheduler.ensureChannel(ctx);
        android.content.Intent i;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            i = new android.content.Intent(android.provider.Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS);
            i.putExtra(android.provider.Settings.EXTRA_APP_PACKAGE, ctx.getPackageName());
            i.putExtra(android.provider.Settings.EXTRA_CHANNEL_ID, ReminderScheduler.CHANNEL_ID);
        } else {
            i = new android.content.Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                android.net.Uri.parse("package:" + ctx.getPackageName()));
        }
        i.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
        try { ctx.startActivity(i); } catch (Exception e) { /* ajustes no disponibles */ }
        call.resolve();
    }
}
