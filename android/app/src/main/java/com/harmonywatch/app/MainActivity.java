package com.harmonywatch.app;

import android.app.PendingIntent;
import android.app.PictureInPictureParams;
import android.app.RemoteAction;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.graphics.drawable.Icon;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.util.Rational;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import androidx.annotation.RequiresApi;
import com.getcapacitor.BridgeActivity;

import java.util.ArrayList;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register local plugins BEFORE super.onCreate()
        // super.onCreate() builds the bridge and loads plugins from capacitor.plugins.json
        // Local plugins (not in node_modules) must be registered via registerPlugin() before that
        registerPlugin(HarmonyPlayerPlugin.class);
        
        super.onCreate(savedInstanceState);
        
        // Hide scrollbars in WebView (Android only)
        WebView webView = getBridge().getWebView();
        if (webView != null) {
            webView.setVerticalScrollBarEnabled(false);
            webView.setHorizontalScrollBarEnabled(false);
            webView.setScrollBarStyle(WebView.SCROLLBARS_OUTSIDE_OVERLAY);
            
            // Expose immersive mode and orientation methods to JavaScript
            webView.addJavascriptInterface(new Object() {
                @JavascriptInterface
                public void enterImmersiveMode() {
                    MainActivity.this.enterImmersiveMode();
                }
                
                @JavascriptInterface
                public void exitImmersiveMode() {
                    MainActivity.this.exitImmersiveMode();
                }
                
                @JavascriptInterface
                public void lockPortrait() {
                    MainActivity.this.lockPortrait();
                }
                
                @JavascriptInterface
                public void unlockOrientation() {
                    MainActivity.this.unlockOrientation();
                }
                
                @JavascriptInterface
                public boolean isAutoRotateEnabled() {
                    return MainActivity.this.isAutoRotateEnabled();
                }
                
                @JavascriptInterface
                public void setVideoPlaying(boolean playing) {
                    MainActivity.this.setVideoPlaying(playing);
                }
                
                @JavascriptInterface
                public void enterPictureInPicture() {
                    MainActivity.this.enterPictureInPicture();
                }
                
                @JavascriptInterface
                public void exitPictureInPicture() {
                    MainActivity.this.exitPictureInPicture();
                }
                
                @JavascriptInterface
                public boolean isPictureInPictureSupported() {
                    return MainActivity.this.isPictureInPictureSupported();
                }
                
                @JavascriptInterface
                public String getOrientationData() {
                    return MainActivity.this.getOrientationData();
                }
                
                @JavascriptInterface
                public void setCustomFullscreen(boolean isActive) {
                    MainActivity.this.setCustomFullscreen(isActive);
                }
            }, "AndroidFullScreen");
        }
        
        // Initialize sensor listener for orientation data
        initOrientationSensor();
    }

    private boolean isVideoPlaying = false;
    private boolean isInPictureInPicture = false;
    private boolean isActivityResumed = false;
    private boolean isCustomFullscreenActive = false; // Track custom fullscreen state (mirrors iOS AppDelegate)
    private static final String TAG = "MainActivity";
    
    // PiP action constants
    private static final String ACTION_PIP_PLAY = "com.harmonywatch.app.ACTION_PIP_PLAY";
    private static final String ACTION_PIP_PAUSE = "com.harmonywatch.app.ACTION_PIP_PAUSE";
    private static final String ACTION_PIP_CLOSE = "com.harmonywatch.app.ACTION_PIP_CLOSE";
    private static final int REQUEST_PLAY = 1;
    private static final int REQUEST_PAUSE = 2;
    private static final int REQUEST_CLOSE = 3;
    
    // Track if video is currently playing for PiP controls
    private boolean isPipVideoPlaying = true; // Default to playing when entering PiP
    
    // BroadcastReceiver for PiP actions
    private BroadcastReceiver pipActionReceiver;
    
    // Orientation sensor data
    private SensorManager sensorManager;
    private Sensor accelerometer;
    private SensorEventListener sensorEventListener;
    private float[] lastAccelerometerData = new float[3];
    private boolean hasAccelerometerData = false;
    
    @Override
    public void onStart() {
        super.onStart();
        android.util.Log.d(TAG, "onStart called");
        isActivityResumed = false; // onStart doesn't mean resumed yet
        // Hide scrollbars for the WebView (Android only)
        if (this.bridge.getWebView() != null) {
            this.bridge.getWebView().setVerticalScrollBarEnabled(false);
            this.bridge.getWebView().setHorizontalScrollBarEnabled(false);
        }
    }
    
    @Override
    public void onUserLeaveHint() {
        android.util.Log.d(TAG, "=== onUserLeaveHint called ===");
        android.util.Log.d(TAG, "isVideoPlaying (flag): " + isVideoPlaying);
        android.util.Log.d(TAG, "isPiPSupported: " + isPictureInPictureSupported());
        android.util.Log.d(TAG, "isInPiP: " + isInPictureInPicture);
        android.util.Log.d(TAG, "isActivityResumed: " + isActivityResumed);
        
        // Trust the flag - if it's true, video is playing
        // The WebView query is unreliable (may return false even when video is playing)
        // Only use WebView query as a fallback if flag is false
        boolean shouldEnterPiP = false;
        if (isVideoPlaying) {
            // Flag says video is playing - trust it
            shouldEnterPiP = isPictureInPictureSupported() && !isInPictureInPicture;
            android.util.Log.d(TAG, "Using isVideoPlaying flag (true) - will enter PiP: " + shouldEnterPiP);
        } else {
            // Flag is false - check WebView as fallback (but this is unreliable)
            boolean actuallyPlaying = checkVideoPlayingState();
            android.util.Log.d(TAG, "Flag is false, checking WebView - Video actually playing (from WebView): " + actuallyPlaying);
            shouldEnterPiP = actuallyPlaying && isPictureInPictureSupported() && !isInPictureInPicture;
            if (actuallyPlaying) {
                // Update flag to match actual state
                android.util.Log.d(TAG, "Updating isVideoPlaying flag to true (WebView confirmed playing)");
                isVideoPlaying = true;
            }
        }
        
        // If we're about to enter native PiP, exit custom fullscreen and custom PiP mode first
        if (shouldEnterPiP) {
            // Exit custom fullscreen if active (must exit before entering PiP)
            if (isCustomFullscreenActive) {
                android.util.Log.d(TAG, "About to enter native PiP - exiting custom fullscreen first");
                setCustomFullscreen(false);
            }
            
            WebView webView = getBridge().getWebView();
            if (webView != null) {
                android.util.Log.d(TAG, "About to enter native PiP - exiting custom PiP if active");
                
                // Dispatch event to exit custom PiP mode (web app will handle gracefully if not in custom PiP)
                String exitCustomPipScript = "if (window.dispatchEvent) {" +
                    "  var event = new CustomEvent('exit-custom-pip-for-native', { detail: {} });" +
                    "  window.dispatchEvent(event);" +
                    "  console.log('[Android] Dispatched exit-custom-pip-for-native event');" +
                    "}";
                
                webView.evaluateJavascript(exitCustomPipScript, null);
            }
        }
        
        // This is called when user presses home button or switches apps
        // Best place to enter PiP mode - MUST be called BEFORE super.onUserLeaveHint()
        // and directly (not via runOnUiThread) since we're already on UI thread
        if (shouldEnterPiP) {
            android.util.Log.d(TAG, "✓ Conditions met - Attempting to enter PiP from onUserLeaveHint (direct call)");
            enterPictureInPictureDirect();
        } else {
            android.util.Log.d(TAG, "✗ Conditions NOT met for PiP:");
            if (!isVideoPlaying) android.util.Log.d(TAG, "  - isVideoPlaying flag is false");
            if (!isPictureInPictureSupported()) android.util.Log.d(TAG, "  - PiP not supported");
            if (isInPictureInPicture) android.util.Log.d(TAG, "  - Already in PiP");
        }
        
        super.onUserLeaveHint();
    }
    
    // Check if video is actually playing by querying the WebView
    private boolean checkVideoPlayingState() {
        WebView webView = this.bridge.getWebView();
        if (webView == null) {
            android.util.Log.d(TAG, "WebView is null, cannot check video state");
            return false;
        }
        
        // Use a synchronous approach with a final array to capture result
        final boolean[] result = {false};
        final Object lock = new Object();
        
        // JavaScript to check if any video element is playing
        String script = "(function() {" +
            "  try {" +
            "    // Check for video elements in the page" +
            "    var videos = document.querySelectorAll('video');" +
            "    for (var i = 0; i < videos.length; i++) {" +
            "      if (!videos[i].paused && !videos[i].ended && videos[i].readyState > 2) {" +
            "        return true;" +
            "      }" +
            "    }" +
            "    // Also check for Mux video player" +
            "    var muxPlayer = document.querySelector('mux-video');" +
            "    if (muxPlayer && muxPlayer.video && !muxPlayer.video.paused && !muxPlayer.video.ended) {" +
            "      return true;" +
            "    }" +
            "    return false;" +
            "  } catch(e) {" +
            "    return false;" +
            "  }" +
            "})();";
        
        try {
            // evaluateJavascript is async, but we need synchronous result
            // For now, we'll use a timeout approach
            webView.evaluateJavascript(script, value -> {
                synchronized (lock) {
                    // value comes as a JSON string ("true" or "false")
                    result[0] = "true".equals(value);
                    lock.notify();
                }
            });
            
            // Wait up to 100ms for result (should be instant)
            synchronized (lock) {
                try {
                    lock.wait(100);
                } catch (InterruptedException e) {
                    android.util.Log.w(TAG, "Interrupted while waiting for video state check");
                }
            }
        } catch (Exception e) {
            android.util.Log.e(TAG, "Error checking video playing state: " + e.getMessage());
            return false;
        }
        
        return result[0];
    }
    
    @Override
    public void onPause() {
        isActivityResumed = false;
        android.util.Log.d(TAG, "onPause called - isVideoPlaying: " + isVideoPlaying + 
            ", isPiPSupported: " + isPictureInPictureSupported() + 
            ", isInPiP: " + isInPictureInPicture);
        
        // Note: We don't try to enter PiP here because the activity is already paused
        // PiP must be entered while the activity is resumed (which happens in onUserLeaveHint)
        // If we're already in PiP, the activity will stay alive
        
        // Unregister sensor listener to save battery (called from super.onPause)
        if (sensorManager != null && sensorEventListener != null) {
            sensorManager.unregisterListener(sensorEventListener);
            android.util.Log.d(TAG, "Orientation sensor listener unregistered (onPause)");
        }
        
        super.onPause();
    }
    
    @Override
    public void onResume() {
        super.onResume();
        isActivityResumed = true;
        android.util.Log.d(TAG, "onResume called - isInPiP: " + isInPictureInPicture);
        
        // Re-register sensor listener (called from super.onResume)
        if (sensorManager != null && accelerometer != null && sensorEventListener != null) {
            sensorManager.registerListener(sensorEventListener, accelerometer, SensorManager.SENSOR_DELAY_UI);
            android.util.Log.d(TAG, "Orientation sensor listener re-registered (onResume)");
        }
    }
    
    @Override
    public void onPictureInPictureModeChanged(boolean isInPictureInPictureMode) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode);
        android.util.Log.d(TAG, "onPictureInPictureModeChanged: " + isInPictureInPictureMode);
        this.isInPictureInPicture = isInPictureInPictureMode;
        
        // Unregister PiP action receiver when exiting PiP
        if (!isInPictureInPictureMode) {
            unregisterPipActionReceiver();
        }
        
        // Notify JavaScript about PiP state change
        if (this.bridge.getWebView() != null) {
            runOnUiThread(() -> {
                String script = String.format(
                    "if (window.dispatchEvent) { window.dispatchEvent(new CustomEvent('androidpipchange', { detail: { isInPictureInPicture: %s } })); }",
                    isInPictureInPictureMode
                );
                this.bridge.getWebView().evaluateJavascript(script, null);
            });
        }
    }
    
    public void setVideoPlaying(boolean playing) {
        android.util.Log.d(TAG, "setVideoPlaying called: " + playing + " (was: " + this.isVideoPlaying + ")");
        this.isVideoPlaying = playing;
        this.isPipVideoPlaying = playing;
        
        // Update PiP controls if in PiP mode
        if (isInPictureInPicture && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            updatePipActions();
        }
    }
    
    // Build PiP params with RemoteActions for play/pause/close controls
    @RequiresApi(api = Build.VERSION_CODES.O)
    private PictureInPictureParams buildPipParams() {
        ArrayList<RemoteAction> actions = new ArrayList<>();
        
        // IMPORTANT: Set package name on Intent so PendingIntent can find the receiver
        String packageName = getPackageName();
        android.util.Log.d(TAG, "Building PiP params with package: " + packageName);
        
        // Play/Pause action
        if (isPipVideoPlaying) {
            // Show pause button
            Intent pauseIntent = new Intent(ACTION_PIP_PAUSE);
            pauseIntent.setPackage(packageName); // Set package name
            PendingIntent pausePendingIntent = PendingIntent.getBroadcast(
                this, REQUEST_PAUSE, pauseIntent, 
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
            RemoteAction pauseAction = new RemoteAction(
                Icon.createWithResource(this, android.R.drawable.ic_media_pause),
                "Pause",
                "Pause video",
                pausePendingIntent
            );
            actions.add(pauseAction);
            android.util.Log.d(TAG, "Added PAUSE action to PiP params");
        } else {
            // Show play button
            Intent playIntent = new Intent(ACTION_PIP_PLAY);
            playIntent.setPackage(packageName); // Set package name
            PendingIntent playPendingIntent = PendingIntent.getBroadcast(
                this, REQUEST_PLAY, playIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
            RemoteAction playAction = new RemoteAction(
                Icon.createWithResource(this, android.R.drawable.ic_media_play),
                "Play",
                "Play video",
                playPendingIntent
            );
            actions.add(playAction);
            android.util.Log.d(TAG, "Added PLAY action to PiP params");
        }
        
        // Close action
        Intent closeIntent = new Intent(ACTION_PIP_CLOSE);
        closeIntent.setPackage(packageName); // Set package name
        PendingIntent closePendingIntent = PendingIntent.getBroadcast(
            this, REQUEST_CLOSE, closeIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        RemoteAction closeAction = new RemoteAction(
            Icon.createWithResource(this, android.R.drawable.ic_menu_close_clear_cancel),
            "Close",
            "Close video",
            closePendingIntent
        );
        actions.add(closeAction);
        android.util.Log.d(TAG, "Added CLOSE action to PiP params, total actions: " + actions.size());
        
        Rational aspectRatio = new Rational(16, 9);
        return new PictureInPictureParams.Builder()
            .setAspectRatio(aspectRatio)
            .setActions(actions)
            .build();
    }
    
    // Update PiP actions (e.g., toggle play/pause button)
    @RequiresApi(api = Build.VERSION_CODES.O)
    private void updatePipActions() {
        if (!isInPictureInPicture) return;
        
        try {
            PictureInPictureParams params = buildPipParams();
            setPictureInPictureParams(params);
            android.util.Log.d(TAG, "Updated PiP actions, isPipVideoPlaying: " + isPipVideoPlaying);
        } catch (Exception e) {
            android.util.Log.e(TAG, "Failed to update PiP actions: " + e.getMessage());
        }
    }
    
    // Register PiP action receiver
    private void registerPipActionReceiver() {
        if (pipActionReceiver != null) {
            android.util.Log.d(TAG, "PiP action receiver already registered, skipping");
            return;
        }
        
        android.util.Log.e(TAG, "========================================");
        android.util.Log.e(TAG, "REGISTERING PiP ACTION RECEIVER");
        android.util.Log.e(TAG, "========================================");
        
        pipActionReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                android.util.Log.e(TAG, "========================================");
                android.util.Log.e(TAG, "BROADCAST RECEIVER ONRECEIVE CALLED!");
                android.util.Log.e(TAG, "========================================");
                
                String action = intent.getAction();
                android.util.Log.e(TAG, "PiP action received: " + action);
                android.util.Log.e(TAG, "Intent: " + intent.toString());
                
                WebView webView = getBridge().getWebView();
                if (webView == null) {
                    android.util.Log.e(TAG, "ERROR: WebView is null in PiP action receiver!");
                    return;
                }
                android.util.Log.d(TAG, "WebView is available");
                
                if (ACTION_PIP_PLAY.equals(action)) {
                    android.util.Log.e(TAG, ">>> Processing PLAY action <<<");
                    // Dispatch custom event to web app
                    dispatchVideoCommandEvent(webView, "play");
                    // Also try direct command as fallback
                    sendVideoCommand("play");
                    isPipVideoPlaying = true;
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        updatePipActions();
                    }
                } else if (ACTION_PIP_PAUSE.equals(action)) {
                    android.util.Log.e(TAG, ">>> Processing PAUSE action <<<");
                    // Dispatch custom event to web app
                    dispatchVideoCommandEvent(webView, "pause");
                    // Also try direct command as fallback
                    sendVideoCommand("pause");
                    isPipVideoPlaying = false;
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        updatePipActions();
                    }
                } else if (ACTION_PIP_CLOSE.equals(action)) {
                    android.util.Log.e(TAG, ">>> Processing CLOSE action <<<");
                    // Dispatch custom event to web app
                    dispatchVideoCommandEvent(webView, "pause");
                    // Also try direct command as fallback
                    sendVideoCommand("pause");
                    // Exit PiP by finishing or moving task to back
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                        // This will exit PiP mode
                        moveTaskToBack(true);
                    }
                } else {
                    android.util.Log.w(TAG, "Unknown action: " + action);
                }
                
                android.util.Log.e(TAG, "========================================");
            }
        };
        
        IntentFilter filter = new IntentFilter();
        filter.addAction(ACTION_PIP_PLAY);
        filter.addAction(ACTION_PIP_PAUSE);
        filter.addAction(ACTION_PIP_CLOSE);
        
        android.util.Log.d(TAG, "IntentFilter created with actions: " + ACTION_PIP_PLAY + ", " + ACTION_PIP_PAUSE + ", " + ACTION_PIP_CLOSE);
        
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                registerReceiver(pipActionReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
                android.util.Log.e(TAG, "PiP action receiver registered (API 33+)");
            } else {
                registerReceiver(pipActionReceiver, filter);
                android.util.Log.e(TAG, "PiP action receiver registered (API < 33)");
            }
            android.util.Log.e(TAG, "========================================");
        } catch (Exception e) {
            android.util.Log.e(TAG, "ERROR registering PiP action receiver: " + e.getMessage(), e);
        }
    }
    
    // Unregister PiP action receiver
    private void unregisterPipActionReceiver() {
        if (pipActionReceiver != null) {
            try {
                unregisterReceiver(pipActionReceiver);
            } catch (Exception e) {
                android.util.Log.w(TAG, "Failed to unregister PiP receiver: " + e.getMessage());
            }
            pipActionReceiver = null;
            android.util.Log.d(TAG, "PiP action receiver unregistered");
        }
    }
    
    // Dispatch custom event to web app for video control
    private void dispatchVideoCommandEvent(WebView webView, String command) {
        String script = String.format(
            "if (window.dispatchEvent) {" +
            "  var event = new CustomEvent('androidpipvideocommand', { detail: { command: '%s' } });" +
            "  window.dispatchEvent(event);" +
            "  console.log('[Android PiP] Dispatched video command event: %s');" +
            "} else {" +
            "  console.error('[Android PiP] window.dispatchEvent not available');" +
            "}",
            command, command
        );
        
        runOnUiThread(() -> {
            webView.evaluateJavascript(script, result -> {
                android.util.Log.d(TAG, "Dispatched video command event: " + command + ", result: " + result);
            });
        });
    }
    
    // Send video command to WebView via JavaScript (fallback method)
    private void sendVideoCommand(String command) {
        WebView webView = getBridge().getWebView();
        if (webView == null) {
            android.util.Log.w(TAG, "WebView is null, cannot send video command: " + command);
            return;
        }
        
        // Enhanced script to find and control Mux video player
        // Mux video is wrapped in shadow DOM, so we need to access it properly
        String script = "(function() {" +
            "  try {" +
            "    console.log('[Android PiP] Attempting to " + command + " video');" +
            "    var videoElement = null;" +
            "    " +
            "    // First, try to find mux-video element" +
            "    var muxVideo = document.querySelector('mux-video');" +
            "    if (muxVideo) {" +
            "      console.log('[Android PiP] Found mux-video element');" +
            "      // Try to get video from shadow root" +
            "      if (muxVideo.shadowRoot) {" +
            "        videoElement = muxVideo.shadowRoot.querySelector('video');" +
            "        console.log('[Android PiP] Found video in shadowRoot:', !!videoElement);" +
            "      }" +
            "      // Fallback: try direct querySelector on mux-video" +
            "      if (!videoElement) {" +
            "        videoElement = muxVideo.querySelector('video');" +
            "        console.log('[Android PiP] Found video via querySelector:', !!videoElement);" +
            "      }" +
            "      // Another fallback: check if mux-video has a video property" +
            "      if (!videoElement && muxVideo.video) {" +
            "        videoElement = muxVideo.video;" +
            "        console.log('[Android PiP] Found video via muxVideo.video property');" +
            "      }" +
            "    }" +
            "    " +
            "    // Fallback: try to find any video element" +
            "    if (!videoElement) {" +
            "      var videos = document.querySelectorAll('video');" +
            "      if (videos.length > 0) {" +
            "        videoElement = videos[0];" +
            "        console.log('[Android PiP] Using fallback video element');" +
            "      }" +
            "    }" +
            "    " +
            "    if (videoElement) {" +
            "      console.log('[Android PiP] Video element found, calling " + command + "()');" +
            "      videoElement." + command + "();" +
            "      console.log('[Android PiP] " + command + "() called successfully');" +
            "      return true;" +
            "    } else {" +
            "      console.error('[Android PiP] No video element found');" +
            "      return false;" +
            "    }" +
            "  } catch(e) {" +
            "    console.error('[Android PiP] Error executing " + command + " command:', e);" +
            "    return false;" +
            "  }" +
            "})();";
        
        runOnUiThread(() -> {
            webView.evaluateJavascript(script, result -> {
                if (result != null && !result.equals("null")) {
                    android.util.Log.d(TAG, "Video command '" + command + "' result: " + result);
                } else {
                    android.util.Log.w(TAG, "Video command '" + command + "' returned null or no result");
                }
            });
            android.util.Log.d(TAG, "Sent video command: " + command);
        });
    }
    
    // Direct call to enter PiP (for use when already on UI thread, e.g., onUserLeaveHint)
    @RequiresApi(api = Build.VERSION_CODES.N)
    private void enterPictureInPictureDirect() {
        android.util.Log.d(TAG, "enterPictureInPictureDirect called");
        
        if (!isPictureInPictureSupported()) {
            android.util.Log.w(TAG, "PiP not supported on this device");
            return;
        }
        
        if (isInPictureInPicture) {
            android.util.Log.d(TAG, "Already in PiP mode, skipping");
            return;
        }
        
        // Register PiP action receiver before entering PiP
        registerPipActionReceiver();
        isPipVideoPlaying = true; // Assume video is playing when entering PiP
        
        try {
            android.util.Log.d(TAG, "About to call enterPictureInPictureMode (direct), SDK: " + Build.VERSION.SDK_INT);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                // Android 8.0+ - use PictureInPictureParams with actions
                PictureInPictureParams params = buildPipParams();
                boolean result = enterPictureInPictureMode(params);
                android.util.Log.d(TAG, "enterPictureInPictureMode returned: " + result);
            } else {
                // Android 7.0-7.1 - use deprecated method (no actions support)
                enterPictureInPictureMode();
                android.util.Log.d(TAG, "enterPictureInPictureMode (legacy) called");
            }
            isInPictureInPicture = true;
        } catch (IllegalStateException e) {
            // PiP not supported or not allowed in current state
            android.util.Log.e(TAG, "Failed to enter PiP mode: " + e.getMessage(), e);
        } catch (Exception e) {
            android.util.Log.e(TAG, "Unexpected error entering PiP mode: " + e.getMessage(), e);
        }
    }
    
    // Thread-safe version for calls from JavaScript (uses runOnUiThread)
    // Note: This may fail if called after activity has paused. Use onUserLeaveHint for reliable PiP entry.
    @RequiresApi(api = Build.VERSION_CODES.N)
    public void enterPictureInPicture() {
        android.util.Log.d(TAG, "enterPictureInPicture called (will use runOnUiThread)");
        
        if (!isPictureInPictureSupported()) {
            android.util.Log.w(TAG, "PiP not supported on this device");
            return;
        }
        
        if (isInPictureInPicture) {
            android.util.Log.d(TAG, "Already in PiP mode, skipping");
            return;
        }
        
        // Check if activity is still resumed (required for PiP entry)
        // If not, log warning and don't attempt (will fail anyway)
        if (!isActivityResumedState()) {
            android.util.Log.w(TAG, "Cannot enter PiP: Activity is not resumed. PiP should be triggered from onUserLeaveHint instead.");
            return;
        }
        
        // Register PiP action receiver before entering PiP
        registerPipActionReceiver();
        isPipVideoPlaying = true; // Assume video is playing when entering PiP
        
        runOnUiThread(() -> {
            // Double-check activity state before attempting (might have changed during runOnUiThread delay)
            if (!isActivityResumedState()) {
                android.util.Log.w(TAG, "Activity is no longer resumed, cannot enter PiP");
                return;
            }
            
            try {
                android.util.Log.d(TAG, "About to call enterPictureInPictureMode (from JS), SDK: " + Build.VERSION.SDK_INT);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    // Android 8.0+ - use PictureInPictureParams with actions
                    PictureInPictureParams params = buildPipParams();
                    boolean result = enterPictureInPictureMode(params);
                    android.util.Log.d(TAG, "enterPictureInPictureMode returned: " + result);
                } else {
                    // Android 7.0-7.1 - use deprecated method (no actions support)
                    enterPictureInPictureMode();
                    android.util.Log.d(TAG, "enterPictureInPictureMode (legacy) called");
                }
                isInPictureInPicture = true;
            } catch (IllegalStateException e) {
                // PiP not supported or not allowed in current state
                android.util.Log.e(TAG, "Failed to enter PiP mode: " + e.getMessage(), e);
            } catch (Exception e) {
                android.util.Log.e(TAG, "Unexpected error entering PiP mode: " + e.getMessage(), e);
            }
        });
    }
    
    // Helper method to check if activity is resumed
    private boolean isActivityResumedState() {
        // Use our tracked state
        return isActivityResumed;
    }
    
    public void exitPictureInPicture() {
        android.util.Log.d(TAG, "exitPictureInPicture called");
        // Note: There's no direct API to exit PiP, user must do it manually
        // But we can track the state
        isInPictureInPicture = false;
    }
    
    public boolean isPictureInPictureSupported() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) {
            android.util.Log.d(TAG, "PiP not supported: SDK version " + Build.VERSION.SDK_INT + " < 24");
            return false; // PiP requires Android 7.0+
        }
        
        PackageManager pm = getPackageManager();
        boolean supported = pm.hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE);
        android.util.Log.d(TAG, "isPictureInPictureSupported: " + supported + " (SDK: " + Build.VERSION.SDK_INT + ")");
        return supported;
    }
    
    // Method to enter immersive mode (hide status and navigation bars)
    public void enterImmersiveMode() {
        runOnUiThread(() -> {
            View decorView = getWindow().getDecorView();
            int uiOptions = View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN;
            decorView.setSystemUiVisibility(uiOptions);
        });
    }
    
    // Method to exit immersive mode (show status and navigation bars)
    public void exitImmersiveMode() {
        runOnUiThread(() -> {
            View decorView = getWindow().getDecorView();
            int uiOptions = View.SYSTEM_UI_FLAG_VISIBLE;
            decorView.setSystemUiVisibility(uiOptions);
        });
    }
    
    // Method to lock orientation to portrait
    public void lockPortrait() {
        runOnUiThread(() -> {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
        });
    }
    
    // Method to unlock orientation (allow all orientations for fullscreen video)
    public void unlockOrientation() {
        runOnUiThread(() -> {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR);
        });
    }
    
    // Method to check if system auto-rotate is enabled
    public boolean isAutoRotateEnabled() {
        try {
            int autoRotate = Settings.System.getInt(
                getContentResolver(),
                Settings.System.ACCELEROMETER_ROTATION
            );
            return autoRotate == 1; // 1 = enabled, 0 = disabled
        } catch (Settings.SettingNotFoundException e) {
            // If setting doesn't exist, assume it's enabled
            return true;
        }
    }
    
    // Method to set custom fullscreen mode (mirrors iOS AppDelegate.setCustomFullscreen)
    // Encapsulates rotation + immersive mode in a single call
    public void setCustomFullscreen(boolean isActive) {
        android.util.Log.d(TAG, "setCustomFullscreen called: " + isActive + " (was: " + isCustomFullscreenActive + ")");
        isCustomFullscreenActive = isActive;
        
        runOnUiThread(() -> {
            if (isActive) {
                // Entering fullscreen: unlock orientation to landscape + enter immersive mode
                setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
                enterImmersiveMode();
                android.util.Log.d(TAG, "Custom fullscreen enabled: orientation unlocked to SENSOR_LANDSCAPE, immersive mode on");
            } else {
                // Exiting fullscreen: lock to portrait + exit immersive mode
                setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
                exitImmersiveMode();
                android.util.Log.d(TAG, "Custom fullscreen disabled: orientation locked to PORTRAIT, immersive mode off");
            }
        });
    }
    
    // Initialize orientation sensor listener
    private void initOrientationSensor() {
        sensorManager = (SensorManager) getSystemService(Context.SENSOR_SERVICE);
        if (sensorManager != null) {
            accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
            if (accelerometer != null) {
                sensorEventListener = new SensorEventListener() {
                    @Override
                    public void onSensorChanged(SensorEvent event) {
                        if (event.sensor.getType() == Sensor.TYPE_ACCELEROMETER) {
                            // Store accelerometer data
                            System.arraycopy(event.values, 0, lastAccelerometerData, 0, event.values.length);
                            hasAccelerometerData = true;
                        }
                    }
                    
                    @Override
                    public void onAccuracyChanged(Sensor sensor, int accuracy) {
                        // Not needed for our use case
                    }
                };
                // Register listener with normal delay (UI updates)
                sensorManager.registerListener(sensorEventListener, accelerometer, SensorManager.SENSOR_DELAY_UI);
                android.util.Log.d(TAG, "Orientation sensor listener registered");
            } else {
                android.util.Log.w(TAG, "Accelerometer sensor not available");
            }
        }
    }
    
    // Get orientation data as JSON string (gamma and beta values)
    // Gamma: left-right tilt (-90 to 90 degrees)
    // Beta: front-back tilt (-180 to 180 degrees)
    @JavascriptInterface
    public String getOrientationData() {
        if (!hasAccelerometerData) {
            return "{\"gamma\":null,\"beta\":null}";
        }
        
        // Convert accelerometer data to gamma/beta
        // Accelerometer values: [x, y, z]
        // x: left-right (positive = right, negative = left)
        // y: front-back (positive = back, negative = front)
        // z: up-down (positive = up, negative = down)
        
        float x = lastAccelerometerData[0];
        float y = lastAccelerometerData[1];
        float z = lastAccelerometerData[2];
        
        // Calculate gamma (left-right tilt) in degrees
        // When device is upright in portrait: x ≈ 0, y ≈ 0, z ≈ 9.8
        // When tilted right: x > 0
        // When tilted left: x < 0
        // Gamma is the angle from vertical in the x-z plane
        double gamma = Math.toDegrees(Math.atan2(x, Math.sqrt(y * y + z * z)));
        
        // Calculate beta (front-back tilt) in degrees
        // Beta is the angle from vertical in the y-z plane
        // When device is upright: beta ≈ 0
        // When tilted back: beta > 0
        // When tilted forward: beta < 0
        double beta = Math.toDegrees(Math.atan2(y, Math.sqrt(x * x + z * z)));
        
        // Return as JSON string
        return String.format("{\"gamma\":%.2f,\"beta\":%.2f}", gamma, beta);
    }
    
    @Override
    public void onDestroy() {
        super.onDestroy();
        // Clean up PiP action receiver
        unregisterPipActionReceiver();
        
        // Clean up sensor listener
        if (sensorManager != null && sensorEventListener != null) {
            sensorManager.unregisterListener(sensorEventListener);
            android.util.Log.d(TAG, "Orientation sensor listener unregistered (onDestroy)");
        }
    }
}
