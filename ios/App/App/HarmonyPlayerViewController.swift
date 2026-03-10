import UIKit
import AVFoundation
import AVKit
import MediaPlayer
import SwiftUI
import Combine

import MuxPlayerSwift

class HarmonyPlayerViewController: UIViewController {
    private var player: AVPlayer?
    private var playerLayer: AVPlayerLayer?
    private var playerState: HarmonyPlayerState
    private var hostingController: UIHostingController<HarmonyPlayerControlsView>?
    private var pipController: AVPictureInPictureController?
    
    private var playbackId: String
    private var videoTitle: String
    private var startTime: Double
    private var thumbnailUrl: String?
    
    private var inlineFrame: CGRect?
    private var isInlineMode: Bool = false
    private var fullscreenConstraints: [NSLayoutConstraint] = []
    private var isExitingFullscreenProgrammatically: Bool = false
    
    var onTimeUpdate: ((Double, Double) -> Void)?
    var onStateChange: ((Bool) -> Void)?
    var onEnded: (() -> Void)?
    var onClosed: ((Double) -> Void)?
    var onFullscreenChange: ((Bool) -> Void)?
    var onPipClose: (() -> Void)?
    var onPipTap: (() -> Void)?
    var onRequestPip: (() -> Void)?
    var onAirPlayChange: ((Bool) -> Void)?
    var onNativePipChange: ((Bool) -> Void)?
    var onNativePipRestore: (() -> Void)?
    var onDragStart: (() -> Void)?
    var onDragMove: ((Double, Double) -> Void)?  // deltaX, deltaY
    var onDragEnd: ((Double, Double) -> Void)?   // deltaX, deltaY (final)
    
    private var controlsHideTimer: Timer?
    private var timeObserver: Any?
    private var dragStartPoint: CGPoint = .zero
    private var isDragToDismissActive: Bool = false
    private var dragStartFrame: CGRect?
    
    // Convenience init for modal presentation (backward compatibility)
    convenience init(playbackId: String, title: String, startTime: Double, thumbnailUrl: String?) {
        self.init(playbackId: playbackId, title: title, startTime: startTime, thumbnailUrl: thumbnailUrl, frame: nil)
    }
    
    init(playbackId: String, title: String, startTime: Double, thumbnailUrl: String?, frame: CGRect?) {
        self.playbackId = playbackId
        self.videoTitle = title
        self.startTime = startTime
        self.thumbnailUrl = thumbnailUrl
        self.inlineFrame = frame
        self.isInlineMode = (frame != nil)
        self.playerState = HarmonyPlayerState()
        
        super.init(nibName: nil, bundle: nil)
        
        // Configure audio session for background playback
        configureAudioSession()
    }
    
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }
    
    override func viewDidLoad() {
        super.viewDidLoad()
        
        view.backgroundColor = .black
        
        // Set up frame if inline mode
        if let frame = inlineFrame {
            view.frame = frame
            // Keep translatesAutoresizingMaskIntoConstraints = true (default)
            // We use frame-based layout via updateFrame(), not Auto Layout constraints
            view.clipsToBounds = true
        }
        
        // Create player
        setupPlayer()
        
        // Set up controls overlay
        setupControls()
        
        // Set up lock screen controls
        setupLockScreenControls()
        
        // Set up native PiP if supported
        setupNativePiP()
        
        // Observe player state changes
        observePlayerState()
    }
    
    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        playerLayer?.frame = view.bounds
    }
    
    override func viewWillTransition(to size: CGSize, with coordinator: UIViewControllerTransitionCoordinator) {
        super.viewWillTransition(to: size, with: coordinator)
        
        let isPortrait = size.width < size.height
        let isLandscape = size.width > size.height
        
        // Check for tilt-to-enter: user rotated to landscape while in inline mode (rotation lock off)
        if !playerState.isFullscreen && isLandscape && isInlineMode {
            playerState.isFullscreen = true
            if let appDelegate = UIApplication.shared.delegate as? AppDelegate {
                appDelegate.setCustomFullscreen(true, skipGeometryUpdate: true) // Rotation already in progress
            }
            playerLayer?.videoGravity = .resizeAspect
            onFullscreenChange?(true)
        }
        
        // Check for tilt-to-exit: user rotated to portrait while in fullscreen
        if playerState.isFullscreen && isPortrait && !isExitingFullscreenProgrammatically {
            // User tilted phone to portrait - exit fullscreen automatically
            isExitingFullscreenProgrammatically = true
            playerState.isFullscreen = false
            if let appDelegate = UIApplication.shared.delegate as? AppDelegate {
                appDelegate.setCustomFullscreen(false)
            }
            playerLayer?.videoGravity = .resizeAspectFill
        }
        
        coordinator.animate(alongsideTransition: { [weak self] _ in
            guard let self = self else { return }
            
            if self.playerState.isFullscreen && isLandscape {
                // In fullscreen (landscape): update frame to parent bounds
                if let parentView = self.parent?.view {
                    self.view.frame = parentView.bounds
                } else if let window = self.view.window {
                    self.view.frame = window.bounds
                }
                self.view.layer.cornerRadius = 0
            } else if let inlineFrame = self.inlineFrame {
                // Exiting fullscreen or in inline mode: restore inline frame
                self.view.frame = inlineFrame
                self.view.layer.cornerRadius = 0
            }
        }, completion: { [weak self] _ in
            guard let self = self else { return }
            
            // Notify JS of state change if it was a tilt-to-exit
            if isPortrait && !self.playerState.isFullscreen && self.isExitingFullscreenProgrammatically {
                // Tilt-to-exit completed - notify JS
                self.onFullscreenChange?(false)
            }
            
            // Reset programmatic exit flag
            self.isExitingFullscreenProgrammatically = false
        })
    }
    
    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        
        // Hide system UI
        navigationController?.setNavigationBarHidden(true, animated: false)
    }
    
    override var prefersStatusBarHidden: Bool {
        return playerState.isFullscreen
    }
    
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask {
        return .all
    }
    
    // MARK: - Player Setup
    
    private func setupPlayer() {
        // Create HLS URL from Mux playback ID using MuxPlayerSwift
        // MuxPlayerSwift provides proper URL construction and Mux Data analytics
        let hlsURL = URL(string: "https://stream.mux.com/\(playbackId).m3u8")!
        
        let playerItem = AVPlayerItem(url: hlsURL)
        let player = AVPlayer(playerItem: playerItem)
        self.player = player
        
        // Configure for background playback (iOS 15+)
        if #available(iOS 15.0, *) {
            player.audiovisualBackgroundPlaybackPolicy = .continuesIfPossible
        }
        
        // Enable AirPlay
        player.allowsExternalPlayback = true
        player.usesExternalPlaybackWhileExternalScreenIsActive = true
        
        // Create player layer
        let playerLayer = AVPlayerLayer(player: player)
        playerLayer.videoGravity = .resizeAspectFill
        playerLayer.frame = view.bounds
        view.layer.addSublayer(playerLayer)
        self.playerLayer = playerLayer
        
        // Attach to state
        playerState.attachPlayer(player)
        
        // Observe AirPlay state
        player.publisher(for: \.isExternalPlaybackActive)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] isActive in
                self?.playerState.isAirPlayActive = isActive
                self?.onAirPlayChange?(isActive)
            }
            .store(in: &cancellables)
        
        // Seek to start time before playing - must wait for seek to complete to avoid
        // overlapping audio (play from 0 + play from saved position)
        if startTime > 0 {
            let time = CMTime(seconds: startTime, preferredTimescale: 600)
            player.seek(to: time) { [weak self] completed in
                if completed {
                    self?.updateLockScreenInfo()
                }
                self?.player?.play()
            }
        } else {
            player.play()
        }
        
        // Observe playback end
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(playerDidFinishPlaying),
            name: .AVPlayerItemDidPlayToEndTime,
            object: playerItem
        )
    }
    
    private func configureAudioSession() {
        do {
            let audioSession = AVAudioSession.sharedInstance()
            try audioSession.setCategory(.playback, mode: .default)
            try audioSession.setActive(true)
        } catch {
            print("[HarmonyPlayer] Failed to configure audio session: \(error)")
        }
    }
    
    // MARK: - Controls Setup
    
    private func setupControls() {
        // Create controls view with callbacks
        let controlsView = HarmonyPlayerControlsView(
            state: playerState,
            onPlayPause: { [weak self] in
                self?.togglePlayPause()
            },
            onSeek: { [weak self] time in
                self?.seek(to: time)
            },
            onClose: { [weak self] in
                guard let self = self else { return }
                print("[HarmonyPlayer] onClose tapped - isInlineMode=\(self.isInlineMode), isFullscreen=\(self.playerState.isFullscreen), isPipMode=\(self.playerState.isPipMode), onRequestPip=\(self.onRequestPip != nil)")
                // In inline mode, chevron down = enter custom PiP (not full close)
                if self.isInlineMode && !self.playerState.isFullscreen && !self.playerState.isPipMode {
                    print("[HarmonyPlayer] Firing onRequestPip")
                    self.onRequestPip?()
                } else {
                    print("[HarmonyPlayer] Firing close()")
                    self.close()
                }
            },
            onQualityChange: { [weak self] quality in
                self?.changeQuality(to: quality)
            },
            onFullscreenToggle: { [weak self] in
                if self?.playerState.isFullscreen == true {
                    self?.exitFullscreen()
                } else {
                    self?.enterFullscreen()
                }
            },
            onPipClose: { [weak self] in
                print("[HarmonyPlayer] Controls onPipClose fired - notifying JS and closing player")
                self?.onPipClose?()
                self?.close()
            },
            onPipTap: { [weak self] in
                self?.onPipTap?()
            },
            onNativePipStart: { [weak self] in
                self?.startNativePip()
            }
        )
        
        // Host in UIHostingController
        let hostingController = UIHostingController(rootView: controlsView)
        hostingController.view.backgroundColor = .clear
        hostingController.view.isOpaque = false
        
        // Disable safe area regions to prevent black bar in PiP mode
        if #available(iOS 16.4, *) {
            hostingController.safeAreaRegions = []
        }
        
        addChild(hostingController)
        view.addSubview(hostingController.view)
        hostingController.view.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            hostingController.view.topAnchor.constraint(equalTo: view.topAnchor),
            hostingController.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            hostingController.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            hostingController.view.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
        hostingController.didMove(toParent: self)
        self.hostingController = hostingController
        
        // Ensure all hosting controller subviews are transparent
        hostingController.view.subviews.forEach { $0.backgroundColor = .clear }
        
        // Auto-hide controls after 3 seconds
        resetControlsHideTimer()
        
        // Show controls on tap
        let tapGesture = UITapGestureRecognizer(target: self, action: #selector(handleTap))
        tapGesture.delegate = self
        view.addGestureRecognizer(tapGesture)
        
        // Drag-to-dismiss gesture (only in inline mode, not fullscreen)
        if isInlineMode {
            let panGesture = UIPanGestureRecognizer(target: self, action: #selector(handlePanGesture(_:)))
            panGesture.delegate = self
            view.addGestureRecognizer(panGesture)
            
            // Allow tap and pan to work simultaneously
            tapGesture.require(toFail: panGesture)
        }
    }
    
    @objc private func handleTap() {
        print("[HarmonyPlayer] handleTap fired, isPipMode=\(playerState.isPipMode)")
        if playerState.isPipMode {
            // In PiP mode, tap to expand (forward to JS handler)
            print("[HarmonyPlayer] handleTap -> onPipTap (expand)")
            onPipTap?()
        } else {
            playerState.toggleControls()
            resetControlsHideTimer()
        }
    }
    
    @objc private func handlePanGesture(_ gesture: UIPanGestureRecognizer) {
        guard isInlineMode && !playerState.isFullscreen else { return }
        
        if playerState.isPipMode {
            // PiP mode: drag to reposition the PiP window directly
            handlePipDrag(gesture)
        } else {
            // Inline mode: drag-to-dismiss
            handleInlineDrag(gesture)
        }
    }
    
    private func handlePipDrag(_ gesture: UIPanGestureRecognizer) {
        let translation = gesture.translation(in: view.superview)
        
        switch gesture.state {
        case .changed:
            // Move view directly by translation delta
            view.center = CGPoint(
                x: view.center.x + translation.x,
                y: view.center.y + translation.y
            )
            // Sync player layer frame
            playerLayer?.frame = view.bounds
            // Reset translation so next delta is relative
            gesture.setTranslation(.zero, in: view.superview)
            
        case .ended, .cancelled:
            // Snap to nearest edge with padding
            snapPipToNearestEdge()
            
        default:
            break
        }
    }
    
    private func handleInlineDrag(_ gesture: UIPanGestureRecognizer) {
        let translation = gesture.translation(in: view.superview)
        
        switch gesture.state {
        case .began:
            dragStartPoint = gesture.location(in: view.superview)
            isDragToDismissActive = false
            dragStartFrame = view.frame
            
        case .changed:
            let deltaX = translation.x
            let deltaY = translation.y
            
            // Only activate drag-to-dismiss for downward swipes
            // Require vertical movement > horizontal and moving downward
            if !isDragToDismissActive {
                if abs(deltaY) > 10 && deltaY > 0 && abs(deltaY) > abs(deltaX) * 1.1 {
                    isDragToDismissActive = true
                    onDragStart?()
                    playerState.hideControls()
                }
            }
            
            if isDragToDismissActive {
                // Scale and move toward PiP end state (same layout as JS triggerPipMode)
                guard let startFrame = dragStartFrame, let superview = view.superview else {
                    onDragMove?(deltaX, deltaY)
                    return
                }
                let bounds = superview.bounds
                // PiP rect: bottom-right, above bottom nav (64pt nav + safe area + gap = 120pt), match JS
                let pipBottomInset: CGFloat = 120
                let pipWidth = min(650, bounds.width * 0.55)
                let pipHeight = pipWidth * (9.0 / 16.0)
                let pipX = bounds.width - pipWidth - 16
                let pipY = bounds.height - pipHeight - pipBottomInset
                // Progress 0→1 for scale/X (same distance as PiP trigger, 20% of viewport height)
                let clampedY = max(0, deltaY)
                let threshold = bounds.height * 0.20
                let progress = min(1.0, clampedY / threshold)
                // Y: stick to finger (1:1 with drag), clamped between start and PiP
                let y = max(startFrame.origin.y, min(startFrame.origin.y + deltaY, pipY))
                // X, size: interpolate toward PiP so it scales and drifts right as you drag down
                let x = startFrame.origin.x + (pipX - startFrame.origin.x) * CGFloat(progress)
                let width = startFrame.width + (pipWidth - startFrame.width) * CGFloat(progress)
                let height = startFrame.height + (pipHeight - startFrame.height) * CGFloat(progress)
                let newFrame = CGRect(x: x, y: y, width: width, height: height)
                view.frame = newFrame
                playerLayer?.frame = view.bounds
                onDragMove?(deltaX, deltaY)
            }
            
        case .ended, .cancelled:
            if isDragToDismissActive {
                let deltaX = translation.x
                let deltaY = translation.y
                onDragEnd?(deltaX, deltaY)
            }
            isDragToDismissActive = false
            dragStartFrame = nil
            
        default:
            break
        }
    }
    
    private func snapPipToNearestEdge() {
        guard let superview = view.superview else { return }
        let bounds = superview.bounds
        let padding: CGFloat = 16
        let viewFrame = view.frame
        
        // Calculate target position - snap to nearest horizontal edge, keep vertical constrained
        let centerX = viewFrame.midX
        let targetX: CGFloat
        if centerX < bounds.midX {
            // Snap to left edge
            targetX = padding
        } else {
            // Snap to right edge
            targetX = bounds.width - viewFrame.width - padding
        }
        
        // Keep vertical position within bounds
        let targetY = max(padding, min(viewFrame.origin.y, bounds.height - viewFrame.height - padding))
        
        let targetFrame = CGRect(x: targetX, y: targetY, width: viewFrame.width, height: viewFrame.height)
        
        UIView.animate(withDuration: 0.25, delay: 0, options: [.curveEaseOut]) {
            self.view.frame = targetFrame
            self.playerLayer?.frame = self.view.bounds
        }
    }
    
    private func resetControlsHideTimer() {
        controlsHideTimer?.invalidate()
        controlsHideTimer = Timer.scheduledTimer(withTimeInterval: 3.0, repeats: false) { [weak self] _ in
            self?.playerState.hideControls()
        }
    }
    
    // MARK: - Lock Screen Controls
    
    private func setupLockScreenControls() {
        let commandCenter = MPRemoteCommandCenter.shared()
        
        commandCenter.playCommand.addTarget { [weak self] _ in
            self?.resume()
            return .success
        }
        
        commandCenter.pauseCommand.addTarget { [weak self] _ in
            self?.pause()
            return .success
        }
        
        commandCenter.togglePlayPauseCommand.addTarget { [weak self] _ in
            self?.togglePlayPause()
            return .success
        }
        
        commandCenter.changePlaybackPositionCommand.addTarget { [weak self] event in
            if let event = event as? MPChangePlaybackPositionCommandEvent {
                self?.seek(to: event.positionTime)
                return .success
            }
            return .commandFailed
        }
        
        updateLockScreenInfo()
    }
    
    private func updateLockScreenInfo() {
        guard let player = player else { return }
        
        var nowPlayingInfo: [String: Any] = [
            MPMediaItemPropertyTitle: videoTitle,
            MPMediaItemPropertyArtist: "HarmonyWatch",
            MPNowPlayingInfoPropertyElapsedPlaybackTime: playerState.currentTime,
            MPNowPlayingInfoPropertyPlaybackRate: playerState.isPlaying ? 1.0 : 0.0
        ]
        
        if playerState.duration > 0 {
            nowPlayingInfo[MPMediaItemPropertyPlaybackDuration] = playerState.duration
        }
        
        // Load thumbnail if available
        if let thumbnailUrl = thumbnailUrl, let url = URL(string: thumbnailUrl) {
            URLSession.shared.dataTask(with: url) { [weak self] data, _, _ in
                guard let data = data, let image = UIImage(data: data) else {
                    DispatchQueue.main.async {
                        MPNowPlayingInfoCenter.default().nowPlayingInfo = nowPlayingInfo
                    }
                    return
                }
                
                let artwork = MPMediaItemArtwork(boundsSize: image.size) { _ in image }
                nowPlayingInfo[MPMediaItemPropertyArtwork] = artwork
                
                DispatchQueue.main.async {
                    MPNowPlayingInfoCenter.default().nowPlayingInfo = nowPlayingInfo
                }
            }.resume()
        } else {
            MPNowPlayingInfoCenter.default().nowPlayingInfo = nowPlayingInfo
        }
    }
    
    // MARK: - Player State Observation
    
    private func observePlayerState() {
        // Observe time updates
        let interval = CMTime(seconds: 1.0, preferredTimescale: 600)
        timeObserver = player?.addPeriodicTimeObserver(forInterval: interval, queue: .main) { [weak self] time in
            guard let self = self else { return }
            self.onTimeUpdate?(time.seconds, self.playerState.duration)
            self.updateLockScreenInfo()
        }
        
        // Observe playback state
        playerState.$isPlaying
            .sink { [weak self] isPlaying in
                self?.onStateChange?(isPlaying)
                self?.updateLockScreenInfo()
            }
            .store(in: &cancellables)
    }
    
    private var cancellables = Set<AnyCancellable>()
    
    @objc private func playerDidFinishPlaying() {
        onEnded?()
    }
    
    // MARK: - Public Methods
    
    func pause() {
        player?.pause()
    }
    
    func resume() {
        player?.play()
    }
    
    func togglePlayPause() {
        if playerState.isPlaying {
            pause()
        } else {
            resume()
        }
    }
    
    func seek(to time: Double) {
        let cmTime = CMTime(seconds: time, preferredTimescale: 600)
        player?.seek(to: cmTime)
    }
    
    func changeQuality(to quality: HarmonyPlayerState.VideoQuality) {
        playerState.changeQuality(to: quality)
    }
    
    func updateFrame(_ frame: CGRect, animated: Bool, cornerRadius: Double) {
        guard isInlineMode else { return }
        
        // When in PiP mode, ignore frame updates from the web - native owns position during PiP drag.
        // The web doesn't know about native drag position, so applying updates would snap the window
        // back to the original position (especially during playback when effects re-run).
        if playerState.isPipMode {
            return
        }
        
        // Update stored inline frame (unless in fullscreen - keep original inline position)
        if !playerState.isFullscreen {
            inlineFrame = frame
        }
        
        let updateBlock = {
            self.view.frame = frame
            // Explicitly sync player layer frame to avoid layout timing issues
            self.playerLayer?.frame = self.view.bounds
            self.view.layer.cornerRadius = CGFloat(cornerRadius)
            self.view.layer.masksToBounds = cornerRadius > 0
        }
        
        if animated {
            UIView.animate(withDuration: 0.3, animations: updateBlock)
        } else {
            updateBlock()
        }
    }
    
    func enterFullscreen() {
        guard isInlineMode else { return }
        
        // Store current frame if not already stored
        if inlineFrame == nil {
            inlineFrame = view.frame
        }
        
        // Set fullscreen state immediately
        playerState.isFullscreen = true
        
        // Set AppDelegate flag to enable orientation rotation
        // When rotation lock is on, use device's physical orientation so fullscreen matches tilt direction
        let deviceOrientation = UIDevice.current.orientation
        let preferredLandscape: UIInterfaceOrientation?
        if deviceOrientation == .landscapeLeft {
            preferredLandscape = .landscapeLeft
        } else if deviceOrientation == .landscapeRight {
            preferredLandscape = .landscapeRight
        } else {
            preferredLandscape = nil // Let iOS pick
        }
        if let appDelegate = UIApplication.shared.delegate as? AppDelegate {
            appDelegate.setCustomFullscreen(true, preferredLandscape: preferredLandscape)
        }
        
        // Switch video gravity to .resizeAspect for fullscreen (no cropping)
        playerLayer?.videoGravity = .resizeAspect
        
        // Notify JS immediately
        onFullscreenChange?(true)
        
        // Fallback: If device is already in landscape or rotation lock is enabled,
        // viewWillTransition might not fire. Update frame immediately in that case.
        DispatchQueue.main.async { [weak self] in
            guard let self = self, self.playerState.isFullscreen else { return }
            // Check if we're already in landscape (or rotation lock prevents rotation)
            let currentSize = self.view.bounds.size
            let isCurrentlyLandscape = currentSize.width > currentSize.height
            if isCurrentlyLandscape {
                // Already landscape - update frame immediately
                if let parentView = self.parent?.view {
                    self.view.frame = parentView.bounds
                } else if let window = self.view.window {
                    self.view.frame = window.bounds
                }
                self.view.layer.cornerRadius = 0
            }
        }
        
        // Note: Frame will be updated in viewWillTransition when rotation occurs
        // The AppDelegate.setCustomFullscreen(true) triggers the rotation
    }
    
    func exitFullscreen() {
        guard isInlineMode, playerState.isFullscreen, let frame = inlineFrame else { return }
        
        // Mark as programmatic exit to distinguish from user tilt
        isExitingFullscreenProgrammatically = true
        
        // Set fullscreen state immediately
        playerState.isFullscreen = false
        
        // Set AppDelegate flag to disable orientation rotation
        if let appDelegate = UIApplication.shared.delegate as? AppDelegate {
            appDelegate.setCustomFullscreen(false)
        }
        
        // Switch video gravity back to .resizeAspectFill for inline (edge-to-edge)
        playerLayer?.videoGravity = .resizeAspectFill
        
        // Notify JS immediately
        onFullscreenChange?(false)
        
        // Fallback: If device is already in portrait or rotation lock is enabled,
        // viewWillTransition might not fire. Update frame immediately in that case.
        DispatchQueue.main.async { [weak self] in
            guard let self = self, !self.playerState.isFullscreen, let inlineFrame = self.inlineFrame else { return }
            // Check if we're already in portrait (or rotation lock prevents rotation)
            let currentSize = self.view.bounds.size
            let isCurrentlyPortrait = currentSize.width < currentSize.height
            if isCurrentlyPortrait {
                // Already portrait - restore inline frame immediately
                self.view.frame = inlineFrame
                self.view.layer.cornerRadius = 0
            }
        }
        
        // Note: Frame will be updated in viewWillTransition when rotation occurs
        // The AppDelegate.setCustomFullscreen(false) triggers the rotation
    }
    
    func setPipMode(_ enabled: Bool) {
        playerState.isPipMode = enabled
    }
    
    func switchContent(playbackId: String, title: String, startTime: Double, thumbnailUrl: String?) {
        self.playbackId = playbackId
        self.videoTitle = title
        self.thumbnailUrl = thumbnailUrl
        
        // Create new player item
        let hlsURL = URL(string: "https://stream.mux.com/\(playbackId).m3u8")!
        let playerItem = AVPlayerItem(url: hlsURL)
        
        // Replace current item
        player?.replaceCurrentItem(with: playerItem)
        
        // Seek to start time
        if startTime > 0 {
            let time = CMTime(seconds: startTime, preferredTimescale: 600)
            player?.seek(to: time)
        }
        
        // Update lock screen info
        updateLockScreenInfo()
    }
    
    private func setupNativePiP() {
        guard AVPictureInPictureController.isPictureInPictureSupported(),
              let playerLayer = playerLayer else { return }
        
        pipController = AVPictureInPictureController(playerLayer: playerLayer)
        pipController?.delegate = self
        
        // Allow auto-PiP when app goes to background
        if #available(iOS 14.2, *) {
            pipController?.canStartPictureInPictureAutomaticallyFromInline = true
        }
    }
    
    func startNativePip() {
        guard !playerState.isPipMode else { return } // Don't start native PiP if custom PiP is active
        pipController?.startPictureInPicture()
    }
    
    func close() {
        // Safety guard: reset orientation if in fullscreen
        if playerState.isFullscreen {
            if let appDelegate = UIApplication.shared.delegate as? AppDelegate {
                appDelegate.setCustomFullscreen(false)
            }
            playerState.isFullscreen = false
        }
        
        let currentTime = playerState.currentTime
        player?.pause()
        playerState.detachPlayer()
        
        if let observer = timeObserver {
            player?.removeTimeObserver(observer)
            timeObserver = nil
        }
        
        if isInlineMode {
            // Remove from parent
            view.removeFromSuperview()
            removeFromParent()
            onClosed?(currentTime)
        } else {
            // Modal presentation - dismiss
            dismiss(animated: true) { [weak self] in
                self?.onClosed?(currentTime)
            }
        }
    }
    
    deinit {
        player?.pause()
        player?.replaceCurrentItem(with: nil)
        if let observer = timeObserver {
            player?.removeTimeObserver(observer)
        }
        NotificationCenter.default.removeObserver(self)
        controlsHideTimer?.invalidate()
        pipController?.delegate = nil
    }
}

// MARK: - AVPictureInPictureControllerDelegate

extension HarmonyPlayerViewController: AVPictureInPictureControllerDelegate {
    func pictureInPictureControllerWillStartPictureInPicture(_ controller: AVPictureInPictureController) {
        playerState.isNativePipActive = true
        onNativePipChange?(true)
    }
    
    func pictureInPictureControllerDidStopPictureInPicture(_ controller: AVPictureInPictureController) {
        playerState.isNativePipActive = false
        onNativePipChange?(false)
    }
    
    func pictureInPictureController(_ controller: AVPictureInPictureController,
                                     restoreUserInterfaceForPictureInPictureStopWithCompletionHandler handler: @escaping (Bool) -> Void) {
        onNativePipRestore?()
        handler(true)
    }
}

// MARK: - UIGestureRecognizerDelegate

extension HarmonyPlayerViewController: UIGestureRecognizerDelegate {
    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer) -> Bool {
        // Allow pan gesture to work simultaneously with other gestures (like tap)
        return true
    }
    
    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
        // In PiP mode, reject taps in the top bar (Play/X buttons) so SwiftUI buttons receive them
        guard playerState.isPipMode,
              gestureRecognizer is UITapGestureRecognizer else { return true }
        let loc = touch.location(in: view)
        let topBarHeight: CGFloat = 56
        let allowTapGesture = loc.y > topBarHeight
        print("[HarmonyPlayer] shouldReceive touch: loc.y=\(loc.y), topBarHeight=\(topBarHeight), allowTapGesture=\(allowTapGesture) (false=give tap to SwiftUI buttons)")
        return allowTapGesture
    }
}
