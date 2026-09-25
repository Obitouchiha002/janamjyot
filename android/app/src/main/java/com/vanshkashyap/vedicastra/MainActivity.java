package com.vanshkashyap.vedicastra;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // The app's own plugin: downloads and installs an update without
        // sending the person out to a browser (see ApkUpdaterPlugin).
        registerPlugin(ApkUpdaterPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
