package com.madnessarena.game;

import android.app.Activity;
import android.content.Intent;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.auth.api.signin.GoogleSignIn;
import com.google.android.gms.auth.api.signin.GoogleSignInAccount;
import com.google.android.gms.auth.api.signin.GoogleSignInClient;
import com.google.android.gms.auth.api.signin.GoogleSignInOptions;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.tasks.Task;

@CapacitorPlugin(name = "NativeGoogleSignIn")
public class NativeGoogleSignInPlugin extends Plugin {

    @PluginMethod
    public void signIn(PluginCall call) {
        String serverClientId = call.getString("serverClientId", "");

        GoogleSignInOptions gso = new GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
            .requestIdToken(serverClientId)
            .requestEmail()
            .requestProfile()
            .build();

        GoogleSignInClient client = GoogleSignIn.getClient(getActivity(), gso);
        client.signOut().addOnCompleteListener(task -> {
            Intent signInIntent = client.getSignInIntent();
            startActivityForResult(call, signInIntent, "handleGoogleSignInResult");
        });
    }

    @ActivityCallback
    private void handleGoogleSignInResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK) {
            call.reject("Sign in cancelled");
            return;
        }
        Task<GoogleSignInAccount> task = GoogleSignIn.getSignedInAccountFromIntent(result.getData());
        try {
            GoogleSignInAccount account = task.getResult(ApiException.class);
            String idToken = account.getIdToken();
            if (idToken == null) {
                call.reject("No ID token received — ensure serverClientId is the Web Client ID");
                return;
            }
            JSObject ret = new JSObject();
            ret.put("idToken", idToken);
            ret.put("email", account.getEmail());
            ret.put("displayName", account.getDisplayName());
            String photoUrl = account.getPhotoUrl() != null ? account.getPhotoUrl().toString() : null;
            ret.put("photoUrl", photoUrl);
            call.resolve(ret);
        } catch (ApiException e) {
            call.reject("Google Sign-In failed: code=" + e.getStatusCode() + " msg=" + e.getMessage());
        }
    }
}
