package com.madnessarena.game;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativeGoogleSignInPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
