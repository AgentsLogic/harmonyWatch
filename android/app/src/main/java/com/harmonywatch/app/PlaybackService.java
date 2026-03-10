package com.harmonywatch.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.annotation.RequiresApi;
import androidx.core.app.NotificationCompat;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.session.MediaSession;
import androidx.media3.session.MediaSessionService;

/**
 * MediaSessionService for background playback and lock screen controls.
 * Handles MediaSession integration with ExoPlayer for system media controls.
 * 
 * Note: This service will be fully integrated in Phase 2.
 * For now, it provides the basic structure.
 */
@UnstableApi
@RequiresApi(api = Build.VERSION_CODES.LOLLIPOP)
public class PlaybackService extends MediaSessionService {
    private static final String TAG = "PlaybackService";
    private static final String CHANNEL_ID = "harmony_playback_channel";
    private static final int NOTIFICATION_ID = 1;
    
    private MediaSession mediaSession;
    private static ExoPlayer sharedPlayer;
    private static PlaybackService instance;
    
    public static void setSharedPlayer(ExoPlayer player) {
        sharedPlayer = player;
    }
    
    @Override
    public void onCreate() {
        super.onCreate();
        Log.d(TAG, "PlaybackService onCreate");
        instance = this;
        createNotificationChannel();
    }
    
    @Override
    public void onDestroy() {
        super.onDestroy();
        Log.d(TAG, "PlaybackService onDestroy");
        instance = null;
        
        if (mediaSession != null) {
            mediaSession.release();
            mediaSession = null;
        }
    }
    
    @Nullable
    @Override
    public MediaSession onGetSession(MediaSession.ControllerInfo controllerInfo) {
        if (mediaSession == null && sharedPlayer != null) {
            // Create MediaSession with shared player
            mediaSession = new MediaSession.Builder(this, sharedPlayer).build();
            
            // Start foreground service
            startForeground(NOTIFICATION_ID, createNotification());
        }
        return mediaSession;
    }
    
    /**
     * Create notification channel for Android O+
     */
    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Harmony Playback",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Harmony video playback controls");
            channel.setShowBadge(false);
            
            NotificationManager notificationManager = getSystemService(NotificationManager.class);
            if (notificationManager != null) {
                notificationManager.createNotificationChannel(channel);
            }
        }
    }
    
    /**
     * Create notification for foreground service
     */
    private Notification createNotification() {
        Intent intent = new Intent(this, MainActivity.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this,
            0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        
        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle("Harmony")
            .setContentText("Playing video")
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC);
        
        return builder.build();
    }
}
