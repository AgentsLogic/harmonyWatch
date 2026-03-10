package com.harmonywatch.app;

import android.app.Activity;
import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.view.OrientationEventListener;
import android.util.AttributeSet;
import android.util.Log;
import android.view.GestureDetector;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.SurfaceView;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.SeekBar;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.hls.HlsMediaSource;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.datasource.HttpDataSource;

/**
 * Native Android video player view using ExoPlayer.
 * Controls UI matches iOS HarmonyPlayerControlsView.swift pixel-for-pixel.
 */
@UnstableApi
public class HarmonyPlayerView extends FrameLayout {
    private static final String TAG = "HarmonyPlayerView";
    
    // Icon type constants
    private static final int ICON_CHEVRON_DOWN = 0;
    private static final int ICON_PLAY = 1;
    private static final int ICON_PAUSE = 2;
    private static final int ICON_FULLSCREEN_ENTER = 3;
    private static final int ICON_FULLSCREEN_EXIT = 4;
    private static final int ICON_CLOSE_X = 5;
    
    private ExoPlayer player;
    private SurfaceView surfaceView;
    private HarmonyPlayerState state;
    private Activity activity;
    
    // Playback info
    private String playbackId;
    private String title;
    private double startTime;
    private String thumbnailUrl;
    
    // Frame management
    private float currentX = 0;
    private float currentY = 0;
    private float currentWidth = 0;
    private float currentHeight = 0;
    private boolean isFullscreen = false;
    private boolean isPipMode = false;
    
    // Event callbacks
    public interface PlayerEventListener {
        void onTimeUpdate(long currentTime, long duration);
        void onStateChange(boolean isPlaying);
        void onEnded();
        void onClosed(long currentTime);
        void onFullscreenChange(boolean isFullscreen);
        void onPipClose();
        void onPipTap();
        void onRequestPip();
        void onDragStart();
        void onDragMove(float deltaX, float deltaY);
        void onDragEnd(float deltaX, float deltaY);
    }
    
    private PlayerEventListener eventListener;
    
    // Handlers
    private Handler timeUpdateHandler;
    private Runnable timeUpdateRunnable;
    private static final long TIME_UPDATE_INTERVAL_MS = 500; // Match iOS 0.5s
    
    private Handler controlsHideHandler;
    private Runnable controlsHideRunnable;
    private static final long CONTROLS_HIDE_DELAY_MS = 3000;
    
    // Gesture detection
    private GestureDetector gestureDetector;
    private float dragStartX = 0;
    private float dragStartY = 0;
    private boolean isDragging = false;
    // Store initial frame position when drag starts (for smooth tracking)
    private float dragStartFrameX = 0;
    private float dragStartFrameY = 0;
    
    // ── Controls UI ──
    private FrameLayout controlsOverlay;
    
    // Normal mode controls
    private FrameLayout normalControlsContainer;
    private ImageView normalCloseBtn;
    private ImageView normalFullscreenBtn;
    private ImageView normalPlayPauseBtn;
    private SeekBar normalSeekBar;
    private TextView normalCurrentTimeText;
    private TextView normalDurationText;
    private boolean isDraggingSeekBar = false;
    
    // PiP mode controls
    private FrameLayout pipControlsContainer;
    private ImageView pipPlayPauseBtn;
    private ImageView pipCloseBtn;
    
    // Tilt-to-exit fullscreen (matches iOS viewWillTransition tilt-to-exit)
    private OrientationEventListener orientationListener;
    private long fullscreenEnteredAt = 0;
    private static final long TILT_EXIT_COOLDOWN_MS = 1500; // Don't exit within 1.5s of entering
    
    // ─────────────────────────────────────────────────────────────────────
    // Constructors
    // ─────────────────────────────────────────────────────────────────────
    
    public HarmonyPlayerView(@NonNull Context context) {
        super(context);
        init(context);
    }
    
    public HarmonyPlayerView(@NonNull Context context, @Nullable AttributeSet attrs) {
        super(context, attrs);
        init(context);
    }
    
    public HarmonyPlayerView(@NonNull Context context, @Nullable AttributeSet attrs, int defStyleAttr) {
        super(context, attrs, defStyleAttr);
        init(context);
    }
    
    private void init(Context context) {
        this.activity = (Activity) context;
        this.state = new HarmonyPlayerState();
        
        setBackgroundColor(0xFF000000); // Black background
        
        // Create SurfaceView for video rendering
        surfaceView = new SurfaceView(context);
        addView(surfaceView, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));
        
        // Create controls overlay (matches iOS HarmonyPlayerControlsView)
        createControlsOverlay(context);
        
        // Initialize handlers
        timeUpdateHandler = new Handler(Looper.getMainLooper());
        controlsHideHandler = new Handler(Looper.getMainLooper());
        
        // Gesture detector for tap-to-toggle controls
        gestureDetector = new GestureDetector(context, new GestureDetector.SimpleOnGestureListener() {
            @Override
            public boolean onSingleTapUp(MotionEvent e) {
                if (isPipMode) {
                    // In PiP mode, tap anywhere = expand (fallback if expandTapArea didn't catch it)
                    Log.d(TAG, "GestureDetector tap in PiP mode - firing onPipTap");
                    if (eventListener != null) {
                        eventListener.onPipTap();
                    }
                } else {
                    toggleControls();
                }
                return true;
            }
            @Override
            public boolean onDown(MotionEvent e) {
                return true;
            }
        });
        
        // Touch listener for drag-to-dismiss and tap-to-toggle controls
        // Always let gesture detector see events, but consume when actively dragging
        setOnTouchListener((v, event) -> {
            // Check for drag-to-dismiss (only in inline mode, not fullscreen/PiP)
            if (!isPipMode && !isFullscreen) {
                switch (event.getAction()) {
                    case MotionEvent.ACTION_DOWN:
                        dragStartX = event.getRawX();
                        dragStartY = event.getRawY();
                        isDragging = false;
                        // Store initial frame position for smooth tracking
                        dragStartFrameX = currentX;
                        dragStartFrameY = currentY;
                        // Let gesture detector see ACTION_DOWN (needed for tap detection)
                        // Return true so we can track both drag and tap
                        gestureDetector.onTouchEvent(event);
                        return true;
                        
                    case MotionEvent.ACTION_MOVE:
                        boolean handledByDrag = false;
                        if (dragStartX > 0) {
                            float deltaX = event.getRawX() - dragStartX;
                            float deltaY = event.getRawY() - dragStartY;
                            
                            // Match iOS behavior: only activate for downward swipes
                            // Require vertical movement > horizontal and moving downward
                            if (!isDragging) {
                                if (deltaY > 10 && Math.abs(deltaY) > Math.abs(deltaX) * 1.1f) {
                                    isDragging = true;
                                    // Hide controls during drag (match iOS)
                                    state.hideControls();
                                    animateControlsVisibility(false);
                                    if (eventListener != null) eventListener.onDragStart();
                                }
                            }
                            
                            if (isDragging) {
                                // Move view directly to track finger smoothly (match iOS smooth tracking)
                                // Only allow downward movement (no upward, no horizontal)
                                float newY = dragStartFrameY + Math.max(0, deltaY); // Constrain to downward only
                                float newX = dragStartFrameX; // No horizontal movement
                                
                                // Update view position directly for smooth tracking
                                ViewGroup parent = (ViewGroup) getParent();
                                if (parent != null) {
                                    FrameLayout.LayoutParams params = (FrameLayout.LayoutParams) getLayoutParams();
                                    if (params != null) {
                                        params.leftMargin = (int) newX;
                                        params.topMargin = (int) newY;
                                        setLayoutParams(params);
                                        // Update stored position
                                        currentX = newX;
                                        currentY = newY;
                                    }
                                }
                                
                                // Notify JavaScript of drag movement
                                if (eventListener != null) {
                                    eventListener.onDragMove(deltaX, deltaY);
                                }
                                handledByDrag = true; // Consume drag events - prevent tap
                            }
                        }
                        // Always let gesture detector see MOVE (it needs it for tap detection)
                        gestureDetector.onTouchEvent(event);
                        return handledByDrag; // Only consume if dragging
                        
                    case MotionEvent.ACTION_UP:
                    case MotionEvent.ACTION_CANCEL:
                        if (isDragging && eventListener != null) {
                            eventListener.onDragEnd(
                                event.getRawX() - dragStartX,
                                event.getRawY() - dragStartY
                            );
                            dragStartX = 0;
                            dragStartY = 0;
                            isDragging = false;
                            // Consume drag end - prevent tap from firing
                            return true;
                        }
                        dragStartX = 0;
                        dragStartY = 0;
                        isDragging = false;
                        // If not dragging, let gesture detector handle tap
                        return gestureDetector.onTouchEvent(event);
                }
            }
            
            // If not in inline mode, let gesture detector handle tap
            return gestureDetector.onTouchEvent(event);
        });
        
        // Ensure the main view can receive touches even when controls are visible
        setClickable(true);
        setFocusable(false);
    }
    
    // ─────────────────────────────────────────────────────────────────────
    // Player lifecycle
    // ─────────────────────────────────────────────────────────────────────
    
    public void initialize(String playbackId, String title, double startTime, String thumbnailUrl,
                           float x, float y, float width, float height) {
        Log.d(TAG, "Initializing player: playbackId=" + playbackId + ", title=" + title);
        this.playbackId = playbackId;
        this.title = title;
        this.startTime = startTime;
        this.thumbnailUrl = thumbnailUrl;
        
        updateFrame(x, y, width, height, false, 0);
        
        try {
            createPlayer();
            Log.d(TAG, "Player created successfully");
        } catch (Exception e) {
            Log.e(TAG, "Error creating player", e);
            throw e;
        }
        
        if (thumbnailUrl != null && !thumbnailUrl.isEmpty()) {
            loadThumbnail(thumbnailUrl);
        }
        
        // Show controls initially, then auto-hide after delay
        showControlsTemporarily();
    }
    
    private void createPlayer() {
        if (player != null) {
            releasePlayer();
        }
        
        player = new ExoPlayer.Builder(getContext()).build();
        
        player.addListener(new Player.Listener() {
            @Override
            public void onPlaybackStateChanged(int playbackState) {
                boolean wasPlaying = state.isPlaying();
                if (playbackState == Player.STATE_READY) {
                    state.setBuffering(false);
                    if (player.getPlayWhenReady()) {
                        state.setPlaying(true);
                    }
                } else if (playbackState == Player.STATE_BUFFERING) {
                    state.setBuffering(true);
                } else if (playbackState == Player.STATE_ENDED) {
                    state.setPlaying(false);
                    if (eventListener != null) eventListener.onEnded();
                }
                if (wasPlaying != state.isPlaying() && eventListener != null) {
                    eventListener.onStateChange(state.isPlaying());
                }
            }
            
            @Override
            public void onIsPlayingChanged(boolean isPlaying) {
                boolean wasPlaying = state.isPlaying();
                state.setPlaying(isPlaying);
                updatePlayPauseIcons();
                // Adjust buffering opacity on center play button
                if (normalPlayPauseBtn != null) {
                    normalPlayPauseBtn.setAlpha(state.isBuffering() ? 0.5f : 1.0f);
                }
                if (wasPlaying != isPlaying && eventListener != null) {
                    eventListener.onStateChange(isPlaying);
                }
            }
            
            @Override
            public void onPlayerError(PlaybackException error) {
                Log.e(TAG, "Player error: " + error.getMessage());
                state.setPlaying(false);
                if (eventListener != null) eventListener.onStateChange(false);
            }
        });
        
        player.setVideoSurfaceView(surfaceView);
        
        String hlsUrl = "https://stream.mux.com/" + playbackId + ".m3u8";
        HttpDataSource.Factory dataSourceFactory = new DefaultHttpDataSource.Factory();
        HlsMediaSource mediaSource = new HlsMediaSource.Factory(dataSourceFactory)
            .createMediaSource(MediaItem.fromUri(Uri.parse(hlsUrl)));
        
        player.setMediaSource(mediaSource);
        player.prepare();
        
        if (startTime > 0) {
            player.seekTo((long) (startTime * 1000));
        }
        
        player.setPlayWhenReady(true);
        startTimeUpdates();
    }
    
    private void startTimeUpdates() {
        if (timeUpdateRunnable != null) {
            timeUpdateHandler.removeCallbacks(timeUpdateRunnable);
        }
        timeUpdateRunnable = new Runnable() {
            @Override
            public void run() {
                if (player != null) {
                    long currentTime = player.getCurrentPosition();
                    long duration = player.getDuration();
                    if (duration > 0) {
                        state.setCurrentTime(currentTime);
                        state.setDuration(duration);
                        
                        // Update seek bar (only when user is NOT dragging)
                        if (!isDraggingSeekBar && normalSeekBar != null) {
                            int progress = (int) ((currentTime * 1000) / duration);
                            normalSeekBar.setProgress(progress);
                        }
                        
                        // Update time labels (only when not dragging seek bar)
                        if (!isDraggingSeekBar) {
                            if (normalCurrentTimeText != null) {
                                normalCurrentTimeText.setText(formatTime(currentTime));
                            }
                        }
                        if (normalDurationText != null) {
                            normalDurationText.setText(formatTime(duration));
                        }
                        
                        if (player.isPlaying() && eventListener != null) {
                            eventListener.onTimeUpdate(currentTime, duration);
                        }
                    }
                }
                timeUpdateHandler.postDelayed(this, TIME_UPDATE_INTERVAL_MS);
            }
        };
        timeUpdateHandler.post(timeUpdateRunnable);
    }
    
    private void stopTimeUpdates() {
        if (timeUpdateRunnable != null) {
            timeUpdateHandler.removeCallbacks(timeUpdateRunnable);
            timeUpdateRunnable = null;
        }
    }
    
    private void loadThumbnail(String url) {
        Log.d(TAG, "Loading thumbnail: " + url);
    }
    
    // ─────────────────────────────────────────────────────────────────────
    // Public playback controls
    // ─────────────────────────────────────────────────────────────────────
    
    public void play() {
        if (player != null) player.setPlayWhenReady(true);
    }
    
    public void pause() {
        if (player != null) player.setPlayWhenReady(false);
    }
    
    public void seekTo(long timeMs) {
        if (player != null) player.seekTo(timeMs);
    }
    
    public void switchContent(String playbackId, String title, double startTime, String thumbnailUrl) {
        this.playbackId = playbackId;
        this.title = title;
        this.startTime = startTime;
        this.thumbnailUrl = thumbnailUrl;
        
        String hlsUrl = "https://stream.mux.com/" + playbackId + ".m3u8";
        HttpDataSource.Factory dataSourceFactory = new DefaultHttpDataSource.Factory();
        HlsMediaSource mediaSource = new HlsMediaSource.Factory(dataSourceFactory)
            .createMediaSource(MediaItem.fromUri(Uri.parse(hlsUrl)));
        
        player.setMediaSource(mediaSource);
        player.prepare();
        if (startTime > 0) player.seekTo((long) (startTime * 1000));
        if (state.isPlaying()) player.setPlayWhenReady(true);
    }
    
    // ─────────────────────────────────────────────────────────────────────
    // Frame management
    // ─────────────────────────────────────────────────────────────────────
    
    public void updateFrame(float x, float y, float width, float height, boolean animated, float cornerRadius) {
        this.currentX = x;
        this.currentY = y;
        this.currentWidth = width;
        this.currentHeight = height;
        
        ViewGroup.LayoutParams params = getLayoutParams();
        if (params == null) {
            params = new FrameLayout.LayoutParams((int) width, (int) height);
        }
        if (params instanceof FrameLayout.LayoutParams) {
            FrameLayout.LayoutParams fp = (FrameLayout.LayoutParams) params;
            fp.width = (int) width;
            fp.height = (int) height;
            fp.leftMargin = (int) x;
            fp.topMargin = (int) y;
            setLayoutParams(fp);
        } else {
            params.width = (int) width;
            params.height = (int) height;
            setLayoutParams(params);
            setX(x);
            setY(y);
        }
    }
    
    // ─────────────────────────────────────────────────────────────────────
    // Fullscreen
    // ─────────────────────────────────────────────────────────────────────
    
    public void enterFullscreen() {
        if (isFullscreen) return;
        isFullscreen = true;
        fullscreenEnteredAt = System.currentTimeMillis();
        state.setFullscreen(true);
        
        if (activity instanceof MainActivity) {
            ((MainActivity) activity).setCustomFullscreen(true);
        }
        
        ViewGroup parent = (ViewGroup) getParent();
        if (parent != null) {
            FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            );
            params.leftMargin = 0;
            params.topMargin = 0;
            setLayoutParams(params);
        }
        
        // iOS hides chevron in fullscreen, shows collapse icon on fullscreen btn
        updateCloseButtonVisibility();
        updateFullscreenIcon();
        
        // Start tilt-to-exit monitoring (matches iOS viewWillTransition tilt-to-exit)
        startOrientationListener();
        
        if (eventListener != null) eventListener.onFullscreenChange(true);
    }
    
    public void exitFullscreen() {
        if (!isFullscreen) return;
        isFullscreen = false;
        state.setFullscreen(false);
        
        // Stop tilt-to-exit monitoring
        stopOrientationListener();
        
        if (activity instanceof MainActivity) {
            ((MainActivity) activity).setCustomFullscreen(false);
        }
        
        updateFrame(currentX, currentY, currentWidth, currentHeight, true, 0);
        
        updateCloseButtonVisibility();
        updateFullscreenIcon();
        
        if (eventListener != null) eventListener.onFullscreenChange(false);
    }
    
    /**
     * Tilt-to-exit fullscreen: Monitors device orientation using accelerometer.
     * When user tilts phone to portrait while in fullscreen, automatically exit.
     * Matches iOS viewWillTransition(to:with:) tilt-to-exit behavior.
     */
    private void startOrientationListener() {
        if (orientationListener != null) return;
        
        orientationListener = new OrientationEventListener(getContext()) {
            @Override
            public void onOrientationChanged(int orientation) {
                if (!isFullscreen || orientation == ORIENTATION_UNKNOWN) return;
                
                // Cooldown: don't exit within 1.5s of entering fullscreen
                // (prevents exiting when user enters fullscreen while holding phone in portrait)
                if (System.currentTimeMillis() - fullscreenEnteredAt < TILT_EXIT_COOLDOWN_MS) return;
                
                // Portrait orientation: ~0° (upright) or ~180° (upside down)
                // Using ±30° tolerance (same sensitivity as iOS)
                boolean isPortrait = (orientation >= 330 || orientation <= 30) ||
                                     (orientation >= 150 && orientation <= 210);
                
                if (isPortrait) {
                    Log.d(TAG, "Tilt-to-exit: portrait orientation detected (" + orientation + "°), exiting fullscreen");
                    // Post to handler to avoid re-entrancy issues
                    new Handler(Looper.getMainLooper()).post(() -> exitFullscreen());
                }
            }
        };
        
        if (orientationListener.canDetectOrientation()) {
            orientationListener.enable();
            Log.d(TAG, "Tilt-to-exit orientation listener enabled");
        } else {
            Log.w(TAG, "Cannot detect orientation - tilt-to-exit disabled");
            orientationListener = null;
        }
    }
    
    private void stopOrientationListener() {
        if (orientationListener != null) {
            orientationListener.disable();
            orientationListener = null;
            Log.d(TAG, "Tilt-to-exit orientation listener disabled");
        }
    }
    
    // ─────────────────────────────────────────────────────────────────────
    // PiP mode
    // ─────────────────────────────────────────────────────────────────────
    
    public void setPipMode(boolean enabled) {
        isPipMode = enabled;
        state.setPipMode(enabled);
        
        // Switch between normal and PiP control layouts
        if (normalControlsContainer != null && pipControlsContainer != null) {
            normalControlsContainer.setVisibility(enabled ? View.GONE : View.VISIBLE);
            pipControlsContainer.setVisibility(enabled ? View.VISIBLE : View.GONE);
        }
        
        if (enabled) {
            // PiP controls must ALWAYS be visible - ensure controlsOverlay is shown
            // controlsOverlay is the parent of pipControlsContainer; if it's GONE,
            // the pip controls are invisible and untouchable even if individually VISIBLE
            if (controlsOverlay != null) {
                controlsOverlay.setVisibility(View.VISIBLE);
                controlsOverlay.setAlpha(1.0f);
                controlsOverlay.animate().cancel(); // Cancel any pending fade-out animation
            }
            // Cancel auto-hide timer - PiP controls should never auto-hide
            cancelControlsHideTimer();
        }
        
        // Update PiP play/pause icon
        updatePlayPauseIcons();
    }
    
    // ─────────────────────────────────────────────────────────────────────
    // Controls visibility & toggle
    // ─────────────────────────────────────────────────────────────────────
    
    public void toggleControls() {
        if (state.isControlsVisible()) {
            // Hide immediately
            cancelControlsHideTimer();
            state.hideControls();
            animateControlsVisibility(false);
        } else {
            // Show and start auto-hide timer
            showControlsTemporarily();
        }
    }
    
    private void showControlsTemporarily() {
        cancelControlsHideTimer();
        state.showControls();
        animateControlsVisibility(true);
        
        // Don't auto-hide while user is dragging the seek bar
        if (!isDraggingSeekBar) {
            startControlsHideTimer();
        }
    }
    
    private void startControlsHideTimer() {
        // Never auto-hide in PiP mode - controls must always be visible
        if (isPipMode) return;
        
        controlsHideRunnable = () -> {
            if (!isDraggingSeekBar) {
                state.hideControls();
                animateControlsVisibility(false);
            }
        };
        controlsHideHandler.postDelayed(controlsHideRunnable, CONTROLS_HIDE_DELAY_MS);
    }
    
    private void cancelControlsHideTimer() {
        if (controlsHideRunnable != null) {
            controlsHideHandler.removeCallbacks(controlsHideRunnable);
            controlsHideRunnable = null;
        }
    }
    
    /**
     * Animate controls overlay opacity (matches iOS .animation(.easeInOut(duration: 0.3)))
     */
    private void animateControlsVisibility(boolean show) {
        if (controlsOverlay == null) return;
        
        // In PiP mode, controls overlay must ALWAYS stay visible
        // (PiP play/close/expand buttons should never fade out)
        if (isPipMode && !show) {
            return; // Don't hide controls in PiP mode
        }
        
        if (show) {
            controlsOverlay.setVisibility(View.VISIBLE);
            controlsOverlay.setAlpha(0f);
            controlsOverlay.animate()
                .alpha(1.0f)
                .setDuration(300)
                .setListener(null);
        } else {
            controlsOverlay.animate()
                .alpha(0.0f)
                .setDuration(300)
                .withEndAction(() -> controlsOverlay.setVisibility(View.GONE));
        }
        
        // Always sync play/pause icons when visibility changes
        updatePlayPauseIcons();
    }
    
    // ─────────────────────────────────────────────────────────────────────
    // Controls overlay creation (mirrors iOS HarmonyPlayerControlsView)
    // ─────────────────────────────────────────────────────────────────────
    
    private void createControlsOverlay(Context context) {
        // Root overlay that covers entire player area
        controlsOverlay = new FrameLayout(context);
        addView(controlsOverlay, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));
        controlsOverlay.setVisibility(View.GONE);
        // CRITICAL: Allow touches to pass through to parent for drag-to-dismiss
        controlsOverlay.setClickable(false);
        controlsOverlay.setFocusable(false);
        controlsOverlay.setFocusableInTouchMode(false);
        
        // ── NORMAL MODE CONTROLS ──
        normalControlsContainer = new FrameLayout(context);
        controlsOverlay.addView(normalControlsContainer, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));
        createNormalControls(context);
        
        // ── PIP MODE CONTROLS ──
        pipControlsContainer = new FrameLayout(context);
        pipControlsContainer.setVisibility(View.GONE);
        controlsOverlay.addView(pipControlsContainer, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));
        createPipControls(context);
    }
    
    /**
     * Creates normal mode controls matching iOS normalLayout exactly:
     * - Gradient background (transparent → 0.3 → 0.6 black)
     * - Top bar: chevron-down (left), fullscreen (right)
     * - Center: 80×80 play/pause
     * - Bottom: time labels + seek bar (flush at bottom)
     */
    private void createNormalControls(Context context) {
        // 1. Gradient background (matches iOS LinearGradient)
        // iOS: Color.black.opacity(0.0) → 0.3 → 0.6
        View gradientBg = new View(context);
        GradientDrawable gradient = new GradientDrawable(
            GradientDrawable.Orientation.TOP_BOTTOM,
            new int[]{0x00000000, 0x4D000000, 0x99000000}
        );
        gradientBg.setBackground(gradient);
        normalControlsContainer.addView(gradientBg, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));
        
        // 2. Close button (top-left) — iOS: chevron.down, 44×44, hidden in fullscreen
        normalCloseBtn = createCircleIconButton(context, ICON_CHEVRON_DOWN, 44);
        normalCloseBtn.setOnClickListener(v -> {
            if (eventListener != null) {
                if (isPipMode) {
                    eventListener.onPipClose();
                } else {
                    eventListener.onRequestPip();
                }
            }
        });
        FrameLayout.LayoutParams closeParams = new FrameLayout.LayoutParams(dpToPx(44), dpToPx(44));
        closeParams.gravity = Gravity.TOP | Gravity.START;
        closeParams.leftMargin = dpToPx(16);
        closeParams.topMargin = dpToPx(16);
        normalControlsContainer.addView(normalCloseBtn, closeParams);
        
        // 3. Fullscreen button (top-right) — iOS: expand arrows, 44×44
        normalFullscreenBtn = createCircleIconButton(context, ICON_FULLSCREEN_ENTER, 44);
        normalFullscreenBtn.setOnClickListener(v -> {
            if (isFullscreen) {
                exitFullscreen();
            } else {
                enterFullscreen();
            }
        });
        FrameLayout.LayoutParams fsParams = new FrameLayout.LayoutParams(dpToPx(44), dpToPx(44));
        fsParams.gravity = Gravity.TOP | Gravity.END;
        fsParams.rightMargin = dpToPx(16);
        fsParams.topMargin = dpToPx(16);
        normalControlsContainer.addView(normalFullscreenBtn, fsParams);
        
        // 4. Center play/pause button — iOS: 80×80, 0.5 opacity when buffering
        normalPlayPauseBtn = createCircleIconButton(context, ICON_PLAY, 80);
        normalPlayPauseBtn.setOnClickListener(v -> togglePlayPause());
        FrameLayout.LayoutParams ppParams = new FrameLayout.LayoutParams(dpToPx(80), dpToPx(80));
        ppParams.gravity = Gravity.CENTER;
        normalControlsContainer.addView(normalPlayPauseBtn, ppParams);
        
        // 5. Bottom section: time labels + seek bar
        // Container for bottom elements
        FrameLayout bottomContainer = new FrameLayout(context);
        FrameLayout.LayoutParams bottomParams = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        bottomParams.gravity = Gravity.BOTTOM;
        normalControlsContainer.addView(bottomContainer, bottomParams);
        
        // Time labels row — iOS: 16sp medium, white / white 70%, h-padding 16, offset y 20
        FrameLayout timeRow = new FrameLayout(context);
        FrameLayout.LayoutParams timeRowParams = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        // Position time labels just above the seek bar area
        // iOS offset(y: 20) pushes labels down toward seek bar
        timeRowParams.bottomMargin = dpToPx(14);
        bottomContainer.addView(timeRow, timeRowParams);
        
        normalCurrentTimeText = new TextView(context);
        normalCurrentTimeText.setText("0:00");
        normalCurrentTimeText.setTextColor(0xFFFFFFFF); // iOS: white
        normalCurrentTimeText.setTextSize(14); // ~16sp iOS
        normalCurrentTimeText.setTypeface(null, android.graphics.Typeface.BOLD);
        FrameLayout.LayoutParams ctParams = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        ctParams.gravity = Gravity.START | Gravity.CENTER_VERTICAL;
        ctParams.leftMargin = dpToPx(16);
        timeRow.addView(normalCurrentTimeText, ctParams);
        
        normalDurationText = new TextView(context);
        normalDurationText.setText("0:00");
        normalDurationText.setTextColor(0xB3FFFFFF); // iOS: white.opacity(0.7) → 0xB3 = 179 = 0.7*255
        normalDurationText.setTextSize(14);
        normalDurationText.setTypeface(null, android.graphics.Typeface.BOLD);
        FrameLayout.LayoutParams dtParams = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        );
        dtParams.gravity = Gravity.END | Gravity.CENTER_VERTICAL;
        dtParams.rightMargin = dpToPx(16);
        timeRow.addView(normalDurationText, dtParams);
        
        // Seek bar — iOS: 4px track, 12px white thumb, full width, flush at bottom
        normalSeekBar = new SeekBar(context);
        normalSeekBar.setMax(1000);
        normalSeekBar.setProgress(0);
        normalSeekBar.setMinimumHeight(dpToPx(30)); // iOS: .frame(height: 30) touch target
        
        // Style the seek bar to match iOS
        styleSeekBar(normalSeekBar);
        
        FrameLayout.LayoutParams seekParams = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            dpToPx(30)
        );
        seekParams.gravity = Gravity.BOTTOM;
        // Remove side margins — iOS seek bar is flush full-width
        seekParams.leftMargin = 0;
        seekParams.rightMargin = 0;
        bottomContainer.addView(normalSeekBar, seekParams);
        
        // Seek bar interaction (matches iOS DragGesture behavior)
        normalSeekBar.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override
            public void onStartTrackingTouch(SeekBar seekBar) {
                isDraggingSeekBar = true;
                cancelControlsHideTimer();
            }
            
            @Override
            public void onProgressChanged(SeekBar seekBar, int progress, boolean fromUser) {
                if (fromUser && player != null) {
                    long duration = player.getDuration();
                    if (duration > 0) {
                        long seekTime = (long) ((progress / 1000.0) * duration);
                        // Update time label to show drag position (iOS: isDraggingSeek ? dragSeekValue : ...)
                        if (normalCurrentTimeText != null) {
                            normalCurrentTimeText.setText(formatTime(seekTime));
                        }
                    }
                }
            }
            
            @Override
            public void onStopTrackingTouch(SeekBar seekBar) {
                isDraggingSeekBar = false;
                if (player != null) {
                    long duration = player.getDuration();
                    if (duration > 0) {
                        long seekTime = (long) ((seekBar.getProgress() / 1000.0) * duration);
                        player.seekTo(seekTime);
                    }
                }
                startControlsHideTimer();
            }
        });
    }
    
    /**
     * Creates PiP mode controls matching iOS pipLayout exactly:
     * - Play/pause (top-left, 32×32)
     * - Close X (top-right, 32×32)
     * - Tap spacer area to expand (including space between buttons)
     */
    private void createPipControls(Context context) {
        // Tap-to-expand area (full screen, added first so buttons can overlay it)
        // This allows tapping between buttons while buttons still intercept their own areas
        View expandTapArea = new View(context);
        expandTapArea.setOnClickListener(v -> {
            Log.d(TAG, "PiP tap-to-expand fired");
            if (eventListener != null) {
                eventListener.onPipTap();
            }
        });
        FrameLayout.LayoutParams expandParams = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        );
        // No topMargin - covers entire view, including space between buttons
        pipControlsContainer.addView(expandTapArea, expandParams);
        
        // Play/pause button (top-left) — iOS: 32×32, leading 8, top 8
        // Added after tap area so it intercepts touches in its area
        pipPlayPauseBtn = createCircleIconButton(context, ICON_PLAY, 32);
        pipPlayPauseBtn.setOnClickListener(v -> togglePlayPause());
        FrameLayout.LayoutParams ppParams = new FrameLayout.LayoutParams(dpToPx(32), dpToPx(32));
        ppParams.gravity = Gravity.TOP | Gravity.START;
        ppParams.leftMargin = dpToPx(8);
        ppParams.topMargin = dpToPx(8);
        pipControlsContainer.addView(pipPlayPauseBtn, ppParams);
        
        // Close X button (top-right) — iOS: 32×32, trailing 8, top 8
        // Added after tap area so it intercepts touches in its area
        pipCloseBtn = createCircleIconButton(context, ICON_CLOSE_X, 32);
        pipCloseBtn.setOnClickListener(v -> {
            Log.d(TAG, "PiP X button tapped - calling onPipClose");
            if (eventListener != null) {
                eventListener.onPipClose();
            }
        });
        FrameLayout.LayoutParams closeParams = new FrameLayout.LayoutParams(dpToPx(32), dpToPx(32));
        closeParams.gravity = Gravity.TOP | Gravity.END;
        closeParams.rightMargin = dpToPx(8);
        closeParams.topMargin = dpToPx(8);
        pipControlsContainer.addView(pipCloseBtn, closeParams);
    }
    
    /**
     * Style SeekBar to match iOS seek bar:
     * - Track: 4px height, white 30% (background) / white (progress)
     * - Thumb: 12dp white circle
     * - No split track gap
     */
    private void styleSeekBar(SeekBar seekBar) {
        // Track colors
        seekBar.setProgressTintList(ColorStateList.valueOf(Color.WHITE));
        seekBar.setProgressBackgroundTintList(ColorStateList.valueOf(0x4DFFFFFF)); // white 30% = 0x4D
        
        // Custom thumb: 12dp white circle (matches iOS Circle().fill(.white).frame(width:12,height:12))
        GradientDrawable thumbDrawable = new GradientDrawable();
        thumbDrawable.setShape(GradientDrawable.OVAL);
        thumbDrawable.setColor(Color.WHITE);
        thumbDrawable.setSize(dpToPx(12), dpToPx(12));
        seekBar.setThumb(thumbDrawable);
        
        // No gap in track under thumb
        seekBar.setSplitTrack(false);
        
        // Minimal padding so thumb can reach near edges
        int thumbHalf = dpToPx(6);
        seekBar.setPadding(thumbHalf, 0, thumbHalf, 0);
    }
    
    // ─────────────────────────────────────────────────────────────────────
    // Icon button creation (matches iOS Button + Circle background)
    // ─────────────────────────────────────────────────────────────────────
    
    /**
     * Creates a circular icon button matching iOS pattern:
     * Image(systemName:...).frame(w,h).background(Color.black.opacity(0.5)).clipShape(Circle())
     */
    private ImageView createCircleIconButton(Context context, int iconType, int sizeDp) {
        int sizePx = dpToPx(sizeDp);
        
        ImageView btn = new ImageView(context);
        btn.setScaleType(ImageView.ScaleType.CENTER);
        
        // Circular background: black 50% opacity (matches iOS Color.black.opacity(0.5))
        GradientDrawable bg = new GradientDrawable();
        bg.setShape(GradientDrawable.OVAL);
        bg.setColor(0x80000000); // 50% black
        btn.setBackground(bg);
        
        // Draw icon bitmap
        btn.setImageBitmap(drawIcon(iconType, sizePx));
        
        return btn;
    }
    
    /**
     * Draws a vector icon as a Bitmap, matching iOS SF Symbol visual weight.
     * Each icon is drawn with white Paint using Canvas/Path.
     */
    private Bitmap drawIcon(int iconType, int sizePx) {
        Bitmap bitmap = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setColor(Color.WHITE);
        
        float cx = sizePx / 2f;
        float cy = sizePx / 2f;
        
        switch (iconType) {
            case ICON_CHEVRON_DOWN: {
                // iOS: "chevron.down" — V shape pointing down
                // Icon occupies ~45% of button (20pt in 44pt)
                float iconR = sizePx * 0.22f;
                paint.setStyle(Paint.Style.STROKE);
                paint.setStrokeWidth(sizePx * 0.055f);
                paint.setStrokeCap(Paint.Cap.ROUND);
                paint.setStrokeJoin(Paint.Join.ROUND);
                
                Path path = new Path();
                path.moveTo(cx - iconR, cy - iconR * 0.45f);
                path.lineTo(cx, cy + iconR * 0.45f);
                path.lineTo(cx + iconR, cy - iconR * 0.45f);
                canvas.drawPath(path, paint);
                break;
            }
            
            case ICON_PLAY: {
                // iOS: "play.fill" — Filled triangle pointing right
                // Icon occupies ~50% of button (50pt in 80pt for large, 16pt in 32pt for PiP)
                float iconR = sizePx * 0.25f;
                paint.setStyle(Paint.Style.FILL);
                
                Path path = new Path();
                // Triangle: left edge to right point
                path.moveTo(cx - iconR * 0.55f, cy - iconR);
                path.lineTo(cx + iconR * 0.75f, cy);
                path.lineTo(cx - iconR * 0.55f, cy + iconR);
                path.close();
                canvas.drawPath(path, paint);
                break;
            }
            
            case ICON_PAUSE: {
                // iOS: "pause.fill" — Two vertical bars
                float iconR = sizePx * 0.22f;
                paint.setStyle(Paint.Style.FILL);
                
                float barW = iconR * 0.5f;
                float barH = iconR * 1.6f;
                float gap = iconR * 0.35f;
                float r = barW * 0.2f; // corner radius
                
                // Left bar
                canvas.drawRoundRect(
                    cx - gap - barW, cy - barH / 2,
                    cx - gap, cy + barH / 2,
                    r, r, paint
                );
                // Right bar
                canvas.drawRoundRect(
                    cx + gap, cy - barH / 2,
                    cx + gap + barW, cy + barH / 2,
                    r, r, paint
                );
                break;
            }
            
            case ICON_FULLSCREEN_ENTER: {
                // iOS: "arrow.up.left.and.arrow.down.right" — Four corners expanding
                float iconR = sizePx * 0.20f;
                float armLen = iconR * 0.8f;
                paint.setStyle(Paint.Style.STROKE);
                paint.setStrokeWidth(sizePx * 0.05f);
                paint.setStrokeCap(Paint.Cap.ROUND);
                paint.setStrokeJoin(Paint.Join.ROUND);
                
                // Top-left corner arrow
                drawCornerArrow(canvas, paint, cx - iconR, cy - iconR, armLen, true, true);
                // Top-right corner arrow
                drawCornerArrow(canvas, paint, cx + iconR, cy - iconR, armLen, false, true);
                // Bottom-left corner arrow
                drawCornerArrow(canvas, paint, cx - iconR, cy + iconR, armLen, true, false);
                // Bottom-right corner arrow
                drawCornerArrow(canvas, paint, cx + iconR, cy + iconR, armLen, false, false);
                break;
            }
            
            case ICON_FULLSCREEN_EXIT: {
                // iOS: "arrow.down.right.and.arrow.up.left" — Four corners contracting
                float iconR = sizePx * 0.20f;
                float armLen = iconR * 0.8f;
                paint.setStyle(Paint.Style.STROKE);
                paint.setStrokeWidth(sizePx * 0.05f);
                paint.setStrokeCap(Paint.Cap.ROUND);
                paint.setStrokeJoin(Paint.Join.ROUND);
                
                float inset = iconR * 0.3f;
                // Top-left inward arrow
                drawCornerArrow(canvas, paint, cx - inset, cy - inset, armLen, false, false);
                // Top-right inward arrow
                drawCornerArrow(canvas, paint, cx + inset, cy - inset, armLen, true, false);
                // Bottom-left inward arrow
                drawCornerArrow(canvas, paint, cx - inset, cy + inset, armLen, false, true);
                // Bottom-right inward arrow
                drawCornerArrow(canvas, paint, cx + inset, cy + inset, armLen, true, true);
                break;
            }
            
            case ICON_CLOSE_X: {
                // iOS: "xmark" — Two diagonal lines
                float iconR = sizePx * 0.18f;
                paint.setStyle(Paint.Style.STROKE);
                paint.setStrokeWidth(sizePx * 0.06f);
                paint.setStrokeCap(Paint.Cap.ROUND);
                
                // Top-left to bottom-right
                canvas.drawLine(cx - iconR, cy - iconR, cx + iconR, cy + iconR, paint);
                // Top-right to bottom-left
                canvas.drawLine(cx + iconR, cy - iconR, cx - iconR, cy + iconR, paint);
                break;
            }
        }
        
        return bitmap;
    }
    
    /**
     * Helper to draw an L-shaped corner arrow for fullscreen icons
     */
    private void drawCornerArrow(Canvas canvas, Paint paint, float tipX, float tipY,
                                  float armLen, boolean pointsLeft, boolean pointsUp) {
        float hDir = pointsLeft ? 1 : -1;  // horizontal arm direction from tip
        float vDir = pointsUp ? 1 : -1;    // vertical arm direction from tip
        
        Path path = new Path();
        // Horizontal arm from tip
        path.moveTo(tipX + hDir * armLen, tipY);
        path.lineTo(tipX, tipY);
        // Vertical arm from tip
        path.lineTo(tipX, tipY + vDir * armLen);
        canvas.drawPath(path, paint);
    }
    
    // ─────────────────────────────────────────────────────────────────────
    // Icon state updates
    // ─────────────────────────────────────────────────────────────────────
    
    /** Update all play/pause button icons to match current playback state */
    private void updatePlayPauseIcons() {
        boolean isPlaying = (player != null && player.isPlaying());
        int iconType = isPlaying ? ICON_PAUSE : ICON_PLAY;
        
        if (normalPlayPauseBtn != null) {
            normalPlayPauseBtn.setImageBitmap(drawIcon(iconType, dpToPx(80)));
            // iOS: .opacity(state.isBuffering ? 0.5 : 1.0)
            normalPlayPauseBtn.setAlpha(state.isBuffering() ? 0.5f : 1.0f);
        }
        if (pipPlayPauseBtn != null) {
            pipPlayPauseBtn.setImageBitmap(drawIcon(iconType, dpToPx(32)));
        }
    }
    
    /** Update fullscreen button icon based on current fullscreen state */
    private void updateFullscreenIcon() {
        if (normalFullscreenBtn != null) {
            int iconType = isFullscreen ? ICON_FULLSCREEN_EXIT : ICON_FULLSCREEN_ENTER;
            normalFullscreenBtn.setImageBitmap(drawIcon(iconType, dpToPx(44)));
        }
    }
    
    /** iOS hides chevron-down in fullscreen mode */
    private void updateCloseButtonVisibility() {
        if (normalCloseBtn != null) {
            // iOS: if !state.isFullscreen { Button(chevron.down) } else { Spacer() }
            normalCloseBtn.setVisibility(isFullscreen ? View.INVISIBLE : View.VISIBLE);
        }
    }
    
    // ─────────────────────────────────────────────────────────────────────
    // Utility
    // ─────────────────────────────────────────────────────────────────────
    
    private void togglePlayPause() {
        if (player != null) {
            if (player.isPlaying()) {
                player.pause();
            } else {
                player.play();
            }
        }
    }
    
    private int dpToPx(int dp) {
        return (int) (dp * activity.getResources().getDisplayMetrics().density);
    }
    
    private String formatTime(long timeMs) {
        long totalSeconds = timeMs / 1000;
        long hours = totalSeconds / 3600;
        long minutes = (totalSeconds % 3600) / 60;
        long seconds = totalSeconds % 60;
        if (hours > 0) {
            return String.format("%d:%02d:%02d", hours, minutes, seconds);
        }
        return String.format("%d:%02d", minutes, seconds);
    }
    
    // ─────────────────────────────────────────────────────────────────────
    // Public accessors
    // ─────────────────────────────────────────────────────────────────────
    
    public void setEventListener(PlayerEventListener listener) {
        this.eventListener = listener;
    }
    
    public HarmonyPlayerState getState() { return state; }
    public String getTitle() { return title; }
    public String getThumbnailUrl() { return thumbnailUrl; }
    public ExoPlayer getPlayer() { return player; }
    
    // ─────────────────────────────────────────────────────────────────────
    // Cleanup
    // ─────────────────────────────────────────────────────────────────────
    
    public void close() {
        Log.d(TAG, "close() called");
        long currentTime = player != null ? player.getCurrentPosition() : 0;
        releasePlayer();
        if (eventListener != null) eventListener.onClosed(currentTime);
    }
    
    private void releasePlayer() {
        stopTimeUpdates();
        cancelControlsHideTimer();
        stopOrientationListener();
        if (player != null) {
            player.release();
            player = null;
        }
    }
    
    @Override
    protected void onDetachedFromWindow() {
        Log.d(TAG, "onDetachedFromWindow()");
        super.onDetachedFromWindow();
        releasePlayer();
    }
    
    @Override
    protected void onAttachedToWindow() {
        Log.d(TAG, "onAttachedToWindow()");
        super.onAttachedToWindow();
    }
}
