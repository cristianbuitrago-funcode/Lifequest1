package com.cristianbuitrago.lifequest;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    /** Recordatorio que abrió la app (lo lee AlarmsPlugin.consumeOpen). */
    static String pendingKind;
    static String pendingBill;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SystemPlugin.class);
        registerPlugin(AlarmsPlugin.class);
        super.onCreate(savedInstanceState);
        remember(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        remember(intent);
    }

    private static void remember(Intent intent) {
        if (intent == null || !intent.hasExtra(ReminderScheduler.EXTRA_KIND)) return;
        pendingKind = intent.getStringExtra(ReminderScheduler.EXTRA_KIND);
        pendingBill = intent.getStringExtra(ReminderScheduler.EXTRA_BILL);
    }
}
