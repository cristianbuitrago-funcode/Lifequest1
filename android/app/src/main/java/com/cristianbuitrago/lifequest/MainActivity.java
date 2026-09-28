package com.cristianbuitrago.lifequest;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SystemPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
