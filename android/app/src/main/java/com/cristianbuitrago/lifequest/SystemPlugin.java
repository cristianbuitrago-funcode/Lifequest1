package com.cristianbuitrago.lifequest;

import android.annotation.SuppressLint;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Ajustes del sistema que deciden si los recordatorios suenan con la app cerrada.
 *
 * Android "optimiza" la batería de las apps y, en muchos teléfonos, eso retrasa
 * o descarta sus alarmas cuando la app no está abierta. Este plugin dice si
 * LifeCoinQuest está exenta y abre el diálogo del sistema para eximirla.
 */
@CapacitorPlugin(name = "LqSystem")
public class SystemPlugin extends Plugin {

    @PluginMethod
    public void batteryStatus(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("unrestricted", isIgnoringBatteryOptimizations());
        ret.put("manufacturer", Build.MANUFACTURER == null ? "" : Build.MANUFACTURER.toLowerCase());
        call.resolve(ret);
    }

    /** Muestra el diálogo "¿Permitir que la app se ejecute en segundo plano?". */
    @SuppressLint("BatteryLife")
    @PluginMethod
    public void requestUnrestrictedBattery(PluginCall call) {
        Context ctx = getContext();
        if (isIgnoringBatteryOptimizations()) {
            batteryStatus(call);
            return;
        }
        try {
            Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            intent.setData(Uri.parse("package:" + ctx.getPackageName()));
            getActivity().startActivity(intent);
        } catch (Exception e) {
            // Algunos fabricantes no tienen ese diálogo: se abre la ficha de la app.
            openAppDetails();
        }
        call.resolve();
    }

    /** Ficha de la app en Ajustes de Android (batería, notificaciones, inicio automático…). */
    @PluginMethod
    public void openAppSettings(PluginCall call) {
        openAppDetails();
        call.resolve();
    }

    private void openAppDetails() {
        Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
        intent.setData(Uri.parse("package:" + getContext().getPackageName()));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
    }

    private boolean isIgnoringBatteryOptimizations() {
        PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        return pm != null && pm.isIgnoringBatteryOptimizations(getContext().getPackageName());
    }
}
