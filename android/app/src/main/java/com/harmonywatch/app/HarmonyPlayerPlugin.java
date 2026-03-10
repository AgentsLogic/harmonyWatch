package com.harmonywatch.app;

import android.app.Activity;
import android.util.Log;
import android.view.ViewGroup;
import android.widget.FrameLayout;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;
import org.json.JSONObject;

/**
 * Capacitor plugin for Harmony native video player.
 * Mirrors HarmonyPlayerPlugin.swift from iOS implementation.
 */
@CapacitorPlugin(name = "HarmonyPlayer")
public class HarmonyPlayerPlugin extends Plugin {
    private static final String TAG = "HarmonyPlayerPlugin";
    private HarmonyPlayerView playerView;
    
    @PluginMethod
    public void playInline(PluginCall call) {
        JSObject callData = new JSObject();
        callData.put("playbackId", call.getString("playbackId"));
        callData.put("title", call.getString("title", "Video"));
        callData.put("startTime", call.getDouble("startTime", 0.0));
        String thumbnailUrl = call.getString("thumbnailUrl");
        if (thumbnailUrl != null) {
            callData.put("thumbnailUrl", thumbnailUrl);
        }
        callData.put("frame", call.getObject("frame"));
        
        playInlineInternal(callData, call);
    }
    
    @PluginMethod
    public void play(PluginCall call) {
        // For backward compatibility - same as playInline but without frame
        // We'll use fullscreen frame
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Activity not available");
            return;
        }
        
        String playbackId = call.getString("playbackId");
        if (playbackId == null) {
            call.reject("playbackId is required");
            return;
        }
        
        String title = call.getString("title", "Video");
        Double startTime = call.getDouble("startTime", 0.0);
        String thumbnailUrl = call.getString("thumbnailUrl");
        
        // Use fullscreen frame - get dimensions from activity
        activity.runOnUiThread(() -> {
            try {
                ViewGroup rootView = (ViewGroup) activity.findViewById(android.R.id.content);
                if (rootView == null) {
                    call.reject("Root view not available");
                    return;
                }
                
                // Convert device pixels to CSS pixels for playInlineInternal
                // (playInlineInternal will convert back to device pixels with density)
                float density = activity.getResources().getDisplayMetrics().density;
                double width = rootView.getWidth() / density;
                double height = rootView.getHeight() / density;
                
                // Create frame object (in CSS pixels)
                JSONObject frameObj = new JSONObject();
                frameObj.put("x", 0);
                frameObj.put("y", 0);
                frameObj.put("width", width);
                frameObj.put("height", height);
                
                // Create new call data
                JSObject callData = new JSObject();
                callData.put("playbackId", playbackId);
                callData.put("title", title);
                callData.put("startTime", startTime);
                if (thumbnailUrl != null) {
                    callData.put("thumbnailUrl", thumbnailUrl);
                }
                callData.put("frame", frameObj);
                
                // Manually call playInline logic
                playInlineInternal(callData, call);
            } catch (JSONException e) {
                Log.e(TAG, "Error creating frame for play", e);
                call.reject("Failed to create frame: " + e.getMessage());
            }
        });
    }
    
    private void playInlineInternal(JSObject callData, PluginCall originalCall) {
        try {
            String playbackId = callData.getString("playbackId");
            if (playbackId == null) {
                if (originalCall != null) {
                    originalCall.reject("playbackId is required");
                }
                return;
            }
            
            String title = callData.getString("title", "Video");
            double startTime = callData.optDouble("startTime", 0.0);
            String thumbnailUrl = callData.getString("thumbnailUrl");
            
            JSONObject frameObj = callData.getJSObject("frame");
            if (frameObj == null) {
                if (originalCall != null) {
                    originalCall.reject("frame is required with x, y, width, height");
                }
                return;
            }
            
            double cssX = frameObj.getDouble("x");
            double cssY = frameObj.getDouble("y");
            double cssWidth = frameObj.getDouble("width");
            double cssHeight = frameObj.getDouble("height");
            
            Activity activity = getActivity();
            if (activity == null) {
                if (originalCall != null) {
                    originalCall.reject("Activity not available");
                }
                return;
            }
            
            activity.runOnUiThread(() -> {
                try {
                    // Convert CSS pixels to Android device pixels
                    // getBoundingClientRect() returns CSS pixels, Android uses device pixels
                    float density = activity.getResources().getDisplayMetrics().density;
                    float x = (float) (cssX * density);
                    float y = (float) (cssY * density);
                    float width = (float) (cssWidth * density);
                    float height = (float) (cssHeight * density);
                    
                    Log.d(TAG, "Frame CSS: (" + cssX + ", " + cssY + ") " + cssWidth + "x" + cssHeight + 
                              " → Device: (" + x + ", " + y + ") " + width + "x" + height + " (density=" + density + ")");
                    
                    // Remove existing player if any
                    if (playerView != null) {
                        // IMPORTANT: Remove event listener BEFORE closing to prevent
                        // the "closed" event from firing to JavaScript during replacement.
                        // The "closed" event should only fire from user-initiated close.
                        playerView.setEventListener(null);
                        ViewGroup parent = (ViewGroup) playerView.getParent();
                        if (parent != null) {
                            parent.removeView(playerView);
                        }
                        playerView.close();
                        playerView = null;
                    }
                    
                    // Create new player view
                    playerView = new HarmonyPlayerView(activity);
                    
                    // Add to root view FIRST (before initialization)
                    // This ensures the view has a parent when initialize() is called
                    ViewGroup rootView = (ViewGroup) activity.findViewById(android.R.id.content);
                    if (rootView != null) {
                        // Add view with initial layout params matching the frame
                        FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(
                            (int) width,
                            (int) height
                        );
                        params.leftMargin = (int) x;
                        params.topMargin = (int) y;
                        rootView.addView(playerView, params);
                        Log.d(TAG, "Player view added to root view at (" + x + ", " + y + ") size " + width + "x" + height);
                    } else {
                        throw new RuntimeException("Root view not found");
                    }
                    
                    // Set up event listeners (same as playInline)
                    setupEventListeners();
                    
                    // Initialize player (now that view is attached to parent)
                    Log.d(TAG, "About to initialize player view");
                    playerView.initialize(
                        playbackId,
                        title,
                        startTime,
                        thumbnailUrl,
                        (float) x,
                        (float) y,
                        (float) width,
                        (float) height
                    );
                    Log.d(TAG, "Player view initialized successfully");
                    
                    if (originalCall != null) {
                        originalCall.resolve(new JSObject());
                    }
                } catch (Exception e) {
                    Log.e(TAG, "Error creating player view", e);
                    // Clean up on error
                    if (playerView != null) {
                        ViewGroup parent = (ViewGroup) playerView.getParent();
                        if (parent != null) {
                            parent.removeView(playerView);
                        }
                        playerView = null;
                    }
                    if (originalCall != null) {
                        originalCall.reject("Failed to create player: " + e.getMessage());
                    }
                }
            });
        } catch (JSONException e) {
            Log.e(TAG, "Error parsing playInline options", e);
            if (originalCall != null) {
                originalCall.reject("Invalid options: " + e.getMessage());
            }
        }
    }
    
    private void setupEventListeners() {
        if (playerView == null) return;
        
        playerView.setEventListener(new HarmonyPlayerView.PlayerEventListener() {
            @Override
            public void onTimeUpdate(long currentTime, long duration) {
                JSObject data = new JSObject();
                data.put("currentTime", currentTime / 1000.0);
                data.put("duration", duration / 1000.0);
                notifyListeners("timeUpdate", data);
            }
            
            @Override
            public void onStateChange(boolean isPlaying) {
                JSObject data = new JSObject();
                data.put("isPlaying", isPlaying);
                notifyListeners("stateChange", data);
            }
            
            @Override
            public void onEnded() {
                notifyListeners("ended", new JSObject());
            }
            
            @Override
            public void onClosed(long currentTime) {
                JSObject data = new JSObject();
                data.put("currentTime", currentTime / 1000.0);
                notifyListeners("closed", data);
                
                // Get parent before removing (in case playerView becomes null)
                if (playerView != null) {
                    ViewGroup parent = (ViewGroup) playerView.getParent();
                    if (parent != null) {
                        parent.removeView(playerView);
                    }
                }
                playerView = null;
            }
            
            @Override
            public void onFullscreenChange(boolean isFullscreen) {
                JSObject data = new JSObject();
                data.put("isFullscreen", isFullscreen);
                notifyListeners("fullscreenChange", data);
            }
            
            @Override
            public void onPipClose() {
                Log.d(TAG, "onPipClose - notifying pipClose to listeners");
                notifyListeners("pipClose", new JSObject());
            }
            
            @Override
            public void onPipTap() {
                notifyListeners("pipTap", new JSObject());
            }
            
            @Override
            public void onRequestPip() {
                notifyListeners("requestPip", new JSObject());
            }
            
            @Override
            public void onDragStart() {
                notifyListeners("dragStart", new JSObject());
            }
            
            @Override
            public void onDragMove(float deltaX, float deltaY) {
                JSObject data = new JSObject();
                data.put("deltaX", deltaX);
                data.put("deltaY", deltaY);
                notifyListeners("dragMove", data);
            }
            
            @Override
            public void onDragEnd(float deltaX, float deltaY) {
                JSObject data = new JSObject();
                data.put("deltaX", deltaX);
                data.put("deltaY", deltaY);
                notifyListeners("dragEnd", data);
            }
        });
    }
    
    @PluginMethod
    public void pause(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Activity not available");
            return;
        }
        
        // Must run on UI thread - ExoPlayer operations can trigger view updates
        activity.runOnUiThread(() -> {
            if (playerView != null) {
                playerView.pause();
            }
            call.resolve(new JSObject());
        });
    }
    
    @PluginMethod
    public void resume(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Activity not available");
            return;
        }
        
        // Must run on UI thread - ExoPlayer operations can trigger view updates
        activity.runOnUiThread(() -> {
            if (playerView != null) {
                playerView.play();
            }
            call.resolve(new JSObject());
        });
    }
    
    @PluginMethod
    public void stop(PluginCall call) {
        Activity activity = getActivity();
        if (activity != null) {
            activity.runOnUiThread(() -> {
                if (playerView != null) {
                    // Get parent before closing (in case close() affects parent)
                    ViewGroup parent = (ViewGroup) playerView.getParent();
                    if (parent != null) {
                        parent.removeView(playerView);
                    }
                    playerView.close();
                    playerView = null;
                }
            });
        }
        call.resolve(new JSObject());
    }
    
    @PluginMethod
    public void seek(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Activity not available");
            return;
        }
        
        Double time = call.getDouble("time");
        if (time == null) {
            call.reject("time is required");
            return;
        }
        
        // Must run on UI thread - ExoPlayer operations can trigger view updates
        activity.runOnUiThread(() -> {
            if (playerView != null) {
                playerView.seekTo((long) (time * 1000)); // Convert to milliseconds
            }
            call.resolve(new JSObject());
        });
    }
    
    @PluginMethod
    public void enterFullscreen(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Activity not available");
            return;
        }
        
        // Must run on UI thread - views can only be modified from main thread
        activity.runOnUiThread(() -> {
            if (playerView != null) {
                playerView.enterFullscreen();
            }
            call.resolve(new JSObject());
        });
    }
    
    @PluginMethod
    public void exitFullscreen(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Activity not available");
            return;
        }
        
        // Must run on UI thread - views can only be modified from main thread
        activity.runOnUiThread(() -> {
            if (playerView != null) {
                playerView.exitFullscreen();
            }
            call.resolve(new JSObject());
        });
    }
    
    @PluginMethod
    public void updateFrame(PluginCall call) {
        try {
            JSONObject frameObj = call.getObject("frame");
            if (frameObj == null) {
                call.reject("frame is required");
                return;
            }
            
            double cssX = frameObj.getDouble("x");
            double cssY = frameObj.getDouble("y");
            double cssWidth = frameObj.getDouble("width");
            double cssHeight = frameObj.getDouble("height");
            boolean animated = call.getBoolean("animated", true);
            Double cornerRadiusObj = call.getDouble("cornerRadius");
            double cssCornerRadius = cornerRadiusObj != null ? cornerRadiusObj : 0.0;
            
            Activity activity = getActivity();
            if (activity == null) {
                call.reject("Activity not available");
                return;
            }
            
            // Must run on UI thread - views can only be modified from main thread
            activity.runOnUiThread(() -> {
                // Convert CSS pixels to Android device pixels
                float density = activity.getResources().getDisplayMetrics().density;
                float x = (float) (cssX * density);
                float y = (float) (cssY * density);
                float width = (float) (cssWidth * density);
                float height = (float) (cssHeight * density);
                float cornerRadius = (float) (cssCornerRadius * density);
                
                if (playerView != null) {
                    playerView.updateFrame(
                        x,
                        y,
                        width,
                        height,
                        animated,
                        cornerRadius
                    );
                }
                call.resolve(new JSObject());
            });
        } catch (JSONException e) {
            Log.e(TAG, "Error parsing updateFrame options", e);
            call.reject("Invalid options: " + e.getMessage());
        }
    }
    
    @PluginMethod
    public void setPipMode(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Activity not available");
            return;
        }
        
        Boolean enabled = call.getBoolean("enabled");
        if (enabled == null) {
            call.reject("enabled is required");
            return;
        }
        
        // Must run on UI thread - views can only be modified from main thread
        activity.runOnUiThread(() -> {
            if (playerView != null) {
                playerView.setPipMode(enabled);
            }
            call.resolve(new JSObject());
        });
    }
    
    @PluginMethod
    public void switchContent(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Activity not available");
            return;
        }
        
        String playbackId = call.getString("playbackId");
        if (playbackId == null) {
            call.reject("playbackId is required");
            return;
        }
        
        String title = call.getString("title", "Video");
        Double startTime = call.getDouble("startTime", 0.0);
        String thumbnailUrl = call.getString("thumbnailUrl");
        
        // Must run on UI thread - ExoPlayer operations can trigger view updates
        activity.runOnUiThread(() -> {
            if (playerView != null) {
                playerView.switchContent(playbackId, title, startTime != null ? startTime : 0.0, thumbnailUrl);
            }
            call.resolve(new JSObject());
        });
    }
    
    @PluginMethod
    public void startNativePip(PluginCall call) {
        // No-op for now - existing Android PiP via onUserLeaveHint continues to work
        call.resolve(new JSObject());
    }
}
