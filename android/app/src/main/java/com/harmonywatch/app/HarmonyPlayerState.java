package com.harmonywatch.app;

import java.util.ArrayList;
import java.util.List;

/**
 * Observable state class for Harmony Player.
 * Tracks player state and notifies listeners of changes.
 * Mirrors HarmonyPlayerState.swift from iOS implementation.
 */
public class HarmonyPlayerState {
    private boolean isPlaying = false;
    private long currentTime = 0;
    private long duration = 0;
    private boolean isBuffering = false;
    private boolean controlsVisible = true;
    private boolean isFullscreen = false;
    private boolean isPipMode = false;
    
    // Listeners
    private final List<StateChangeListener> stateChangeListeners = new ArrayList<>();
    private final List<TimeUpdateListener> timeUpdateListeners = new ArrayList<>();
    
    public interface StateChangeListener {
        void onStateChange(boolean isPlaying);
    }
    
    public interface TimeUpdateListener {
        void onTimeUpdate(long currentTime, long duration);
    }
    
    public boolean isPlaying() {
        return isPlaying;
    }
    
    public void setPlaying(boolean playing) {
        if (this.isPlaying != playing) {
            this.isPlaying = playing;
            notifyStateChange(playing);
        }
    }
    
    public long getCurrentTime() {
        return currentTime;
    }
    
    public void setCurrentTime(long currentTime) {
        this.currentTime = currentTime;
        notifyTimeUpdate(currentTime, duration);
    }
    
    public long getDuration() {
        return duration;
    }
    
    public void setDuration(long duration) {
        this.duration = duration;
        notifyTimeUpdate(currentTime, duration);
    }
    
    public boolean isBuffering() {
        return isBuffering;
    }
    
    public void setBuffering(boolean buffering) {
        this.isBuffering = buffering;
    }
    
    public boolean isControlsVisible() {
        return controlsVisible;
    }
    
    public void setControlsVisible(boolean visible) {
        this.controlsVisible = visible;
    }
    
    public void hideControls() {
        setControlsVisible(false);
    }
    
    public void showControls() {
        setControlsVisible(true);
    }
    
    public void toggleControls() {
        setControlsVisible(!controlsVisible);
    }
    
    public boolean isFullscreen() {
        return isFullscreen;
    }
    
    public void setFullscreen(boolean fullscreen) {
        this.isFullscreen = fullscreen;
    }
    
    public boolean isPipMode() {
        return isPipMode;
    }
    
    public void setPipMode(boolean pipMode) {
        this.isPipMode = pipMode;
    }
    
    public void addStateChangeListener(StateChangeListener listener) {
        stateChangeListeners.add(listener);
    }
    
    public void removeStateChangeListener(StateChangeListener listener) {
        stateChangeListeners.remove(listener);
    }
    
    public void addTimeUpdateListener(TimeUpdateListener listener) {
        timeUpdateListeners.add(listener);
    }
    
    public void removeTimeUpdateListener(TimeUpdateListener listener) {
        timeUpdateListeners.remove(listener);
    }
    
    private void notifyStateChange(boolean isPlaying) {
        for (StateChangeListener listener : new ArrayList<>(stateChangeListeners)) {
            listener.onStateChange(isPlaying);
        }
    }
    
    private void notifyTimeUpdate(long currentTime, long duration) {
        for (TimeUpdateListener listener : new ArrayList<>(timeUpdateListeners)) {
            listener.onTimeUpdate(currentTime, duration);
        }
    }
    
    public void reset() {
        isPlaying = false;
        currentTime = 0;
        duration = 0;
        isBuffering = false;
        controlsVisible = true;
        isFullscreen = false;
        isPipMode = false;
    }
}
