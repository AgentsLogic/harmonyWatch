import UIKit
import Capacitor
import WebKit
import AVFoundation
import MediaPlayer

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate, UIScrollViewDelegate, WKScriptMessageHandler {

    var window: UIWindow?
    var splashViewController: SplashViewController?
    private var audioSessionConfigured = false
    var isCustomFullscreenActive = false
    /// When true, native player is visible in inline mode — allow rotation so user can tilt-to-enter fullscreen
    var isNativePlayerInlineVisible = false

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        
        // Configure audio session for background playback (moved from applicationDidBecomeActive)
        configureAudioSession()
        
        // Show animated splash screen
        showAnimatedSplash()
        
        // Disable iOS webview bouncing/overscroll
        // Use a delayed approach to ensure webview is ready
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
            self.disableWebViewBouncing()
        }
        
        // Set up JavaScript bridge for orientation control
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            self.setupOrientationBridge()
        }
        
        return true
    }
    
    // Show animated Lottie splash screen
    private func showAnimatedSplash() {
        // Wait for Capacitor to initialize the window and root view controller
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { [weak self] in
            guard let self = self,
                  let window = self.window,
                  let rootViewController = window.rootViewController else {
                print("[AppDelegate] Window or rootViewController not ready, retrying splash screen")
                // Retry after a bit more time
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                    self?.showAnimatedSplash()
                }
                return
            }
            
            // Create and show splash view controller as overlay
            let splashVC = SplashViewController()
            self.splashViewController = splashVC
            
            // Add splash as child view controller overlay
            rootViewController.addChild(splashVC)
            rootViewController.view.addSubview(splashVC.view)
            splashVC.view.frame = rootViewController.view.bounds
            splashVC.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            splashVC.didMove(toParent: rootViewController)
            
            print("[AppDelegate] Custom splash screen displayed")
        }
    }
    
    // Configure AVAudioSession to allow background audio playback
    // Called lazily when the app becomes active, not during launch
    private func configureAudioSession() {
        guard !audioSessionConfigured else { return }
        
        do {
            let audioSession = AVAudioSession.sharedInstance()
            // Use .playback category to allow background audio playback
            // .playback category automatically routes to Bluetooth speakers/headphones
            // Note: .allowBluetooth is ONLY valid with .playAndRecord, NOT with .playback
            try audioSession.setCategory(.playback, mode: .default)
            try audioSession.setActive(true)
            audioSessionConfigured = true
            print("[AppDelegate] AVAudioSession configured for background playback")
            
            // Set up interruption handler to prevent iOS from pausing audio
            NotificationCenter.default.addObserver(
                self,
                selector: #selector(handleAudioSessionInterruption),
                name: AVAudioSession.interruptionNotification,
                object: audioSession
            )
            
            // Set up remote command center for lock screen controls
            setupRemoteCommandCenter()
        } catch {
            print("[AppDelegate] Failed to configure AVAudioSession: \(error.localizedDescription)")
        }
    }
    
    /// Set up MPRemoteCommandCenter for lock screen controls
    private func setupRemoteCommandCenter() {
        let commandCenter = MPRemoteCommandCenter.shared()
        
        // Play command (fallback for web video)
        commandCenter.playCommand.addTarget { [weak self] _ in
            guard let self = self else { return .commandFailed }
            self.playWebVideo()
            return .success
        }
        
        // Pause command (fallback for web video)
        commandCenter.pauseCommand.addTarget { [weak self] _ in
            guard let self = self else { return .commandFailed }
            self.pauseWebVideo()
            return .success
        }
        
        // Toggle play/pause command (fallback for web video)
        commandCenter.togglePlayPauseCommand.addTarget { [weak self] _ in
            guard let self = self else { return .commandFailed }
            self.toggleWebVideo()
            return .success
        }
    }
    
    /// Play web video via JavaScript (fallback when native player not active)
    private func playWebVideo() {
        guard let window = self.window,
              let rootViewController = window.rootViewController,
              let webView = findWebView(in: rootViewController.view) else {
            return
        }
        
        let playJS = """
        (function() {
            var video = null;
            var muxVideo = document.querySelector('mux-video');
            if (muxVideo && muxVideo.shadowRoot) {
                video = muxVideo.shadowRoot.querySelector('video');
            }
            if (!video) {
                var mediaTheme = document.querySelector('media-theme');
                if (mediaTheme && mediaTheme.shadowRoot) {
                    var mv = mediaTheme.shadowRoot.querySelector('mux-video');
                    if (mv && mv.shadowRoot) {
                        video = mv.shadowRoot.querySelector('video');
                    }
                }
            }
            if (!video) {
                video = document.querySelector('video');
            }
            if (video && video.paused) {
                video.play().catch(function(err) {
                    console.warn('[iOS Lock Screen] Play failed:', err);
                });
            }
        })();
        """
        
        webView.evaluateJavaScript(playJS, completionHandler: nil)
    }
    
    /// Pause web video via JavaScript (fallback when native player not active)
    private func pauseWebVideo() {
        guard let window = self.window,
              let rootViewController = window.rootViewController,
              let webView = findWebView(in: rootViewController.view) else {
            return
        }
        
        let pauseJS = """
        (function() {
            var video = null;
            var muxVideo = document.querySelector('mux-video');
            if (muxVideo && muxVideo.shadowRoot) {
                video = muxVideo.shadowRoot.querySelector('video');
            }
            if (!video) {
                var mediaTheme = document.querySelector('media-theme');
                if (mediaTheme && mediaTheme.shadowRoot) {
                    var mv = mediaTheme.shadowRoot.querySelector('mux-video');
                    if (mv && mv.shadowRoot) {
                        video = mv.shadowRoot.querySelector('video');
                    }
                }
            }
            if (!video) {
                video = document.querySelector('video');
            }
            if (video && !video.paused) {
                video.pause();
            }
        })();
        """
        
        webView.evaluateJavaScript(pauseJS, completionHandler: nil)
    }
    
    /// Toggle web video play/pause via JavaScript (fallback when native player not active)
    private func toggleWebVideo() {
        guard let window = self.window,
              let rootViewController = window.rootViewController,
              let webView = findWebView(in: rootViewController.view) else {
            return
        }
        
        let toggleJS = """
        (function() {
            var video = null;
            var muxVideo = document.querySelector('mux-video');
            if (muxVideo && muxVideo.shadowRoot) {
                video = muxVideo.shadowRoot.querySelector('video');
            }
            if (!video) {
                var mediaTheme = document.querySelector('media-theme');
                if (mediaTheme && mediaTheme.shadowRoot) {
                    var mv = mediaTheme.shadowRoot.querySelector('mux-video');
                    if (mv && mv.shadowRoot) {
                        video = mv.shadowRoot.querySelector('video');
                    }
                }
            }
            if (!video) {
                video = document.querySelector('video');
            }
            if (video) {
                if (video.paused) {
                    video.play().catch(function(err) {
                        console.warn('[iOS Lock Screen] Play failed:', err);
                    });
                } else {
                    video.pause();
                }
            }
        })();
        """
        
        webView.evaluateJavaScript(toggleJS, completionHandler: nil)
    }
    
    // Handle audio session interruptions (calls, notifications, etc.)
    @objc private func handleAudioSessionInterruption(notification: Notification) {
        guard let userInfo = notification.userInfo,
              let typeValue = userInfo[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: typeValue) else {
            return
        }
        
        switch type {
        case .began:
            print("[AppDelegate] Audio session interruption began")
        case .ended:
            print("[AppDelegate] Audio session interruption ended")
            // Reactivate audio session after interruption ends
            do {
                try AVAudioSession.sharedInstance().setActive(true, options: .notifyOthersOnDeactivation)
            } catch {
                print("[AppDelegate] Failed to reactivate audio session after interruption: \(error.localizedDescription)")
            }
        @unknown default:
            break
        }
    }
    
    func applicationDidBecomeActive(_ application: UIApplication) {
        // Ensure bouncing is disabled when app becomes active
        disableWebViewBouncing()
    }
    
    // Function to disable webview bouncing and constrain scroll view
    private func disableWebViewBouncing() {
        guard let window = self.window,
              let rootViewController = window.rootViewController else {
            return
        }
        
        if let webView = self.findWebView(in: rootViewController.view) {
            let scrollView = webView.scrollView
            
            // DISABLE THE SCROLL VIEW ENTIRELY - webview container won't scroll
            // Content will scroll via HTML body instead
            scrollView.isScrollEnabled = false
            
            // Set delegate (though scrolling is disabled, this prevents any edge cases)
            scrollView.delegate = self
            
            // Disable bouncing - redundant but safe
            scrollView.bounces = false
            scrollView.alwaysBounceVertical = false
            scrollView.alwaysBounceHorizontal = false
            
            // Prevent overscroll by constraining content size
            scrollView.contentInsetAdjustmentBehavior = .never
            
            // Set content inset to 0 to prevent extra space
            scrollView.contentInset = .zero
            scrollView.scrollIndicatorInsets = .zero
            
            // Lock scroll position to prevent overscroll
            scrollView.contentOffset = CGPoint(x: 0, y: 0)
            
            // Disable zoom
            scrollView.minimumZoomScale = 1.0
            scrollView.maximumZoomScale = 1.0
            scrollView.zoomScale = 1.0
            
            // Hide scroll indicators since scrolling is disabled
            scrollView.showsVerticalScrollIndicator = false
            scrollView.showsHorizontalScrollIndicator = false
        }
    }
    
    // Helper function to find WKWebView in the view hierarchy
    func findWebView(in view: UIView) -> WKWebView? {
        if let webView = view as? WKWebView {
            return webView
        }
        for subview in view.subviews {
            if let webView = findWebView(in: subview) {
                return webView
            }
        }
        return nil
    }
    
    // UIScrollViewDelegate method - safety net since scrolling is disabled
    func scrollViewDidScroll(_ scrollView: UIScrollView) {
        // Force position to stay at 0,0 since scrolling is disabled
        if scrollView.contentOffset.x != 0 || scrollView.contentOffset.y != 0 {
            scrollView.contentOffset = CGPoint(x: 0, y: 0)
        }
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Nothing needed here
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Keep audio session active in background
        if audioSessionConfigured {
            try? AVAudioSession.sharedInstance().setActive(true)
        }
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Reactivate audio session when returning to foreground
        if audioSessionConfigured {
            try? AVAudioSession.sharedInstance().setActive(true)
        }
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }
    
    // MARK: - Orientation Control
    
    func application(_ application: UIApplication, supportedInterfaceOrientationsFor window: UIWindow?) -> UIInterfaceOrientationMask {
        if isCustomFullscreenActive {
            return .allButUpsideDown // Allow landscape and portrait for tilt-to-exit support
        }
        if isNativePlayerInlineVisible {
            return .allButUpsideDown // Allow rotation when native player inline — enables tilt-to-enter fullscreen
        }
        return .portrait // Lock to portrait by default
    }
    
    func setNativePlayerInlineVisible(_ visible: Bool) {
        isNativePlayerInlineVisible = visible
        if #available(iOS 16.0, *) {
            window?.rootViewController?.setNeedsUpdateOfSupportedInterfaceOrientations()
        }
    }
    
    func setCustomFullscreen(_ isActive: Bool, preferredLandscape: UIInterfaceOrientation? = nil, skipGeometryUpdate: Bool = false) {
        isCustomFullscreenActive = isActive
        
        // Notify view controller to update supported orientations (iOS 16+)
        if #available(iOS 16.0, *) {
            if let rootViewController = window?.rootViewController {
                rootViewController.setNeedsUpdateOfSupportedInterfaceOrientations()
            }
        }
        
        // Skip requestGeometryUpdate when rotation is already in progress (e.g. tilt-to-enter)
        if skipGeometryUpdate { return }
        
        // Force orientation update on iOS 16+
        if #available(iOS 16.0, *) {
            if let windowScene = window?.windowScene {
                let orientations: UIInterfaceOrientationMask
                if isActive {
                    // Use preferred landscape direction when rotation lock is on (device tilted but UI in portrait)
                    if preferredLandscape == .landscapeLeft {
                        orientations = .landscapeLeft
                    } else if preferredLandscape == .landscapeRight {
                        orientations = .landscapeRight
                    } else {
                        orientations = .landscape
                    }
                } else {
                    orientations = .portrait
                }
                windowScene.requestGeometryUpdate(.iOS(interfaceOrientations: orientations)) { (error: Error?) in
                    if let error = error {
                        print("[AppDelegate] Failed to request geometry update: \(error.localizedDescription)")
                    } else {
                        let dir = preferredLandscape == .landscapeLeft ? "landscapeLeft" : (preferredLandscape == .landscapeRight ? "landscapeRight" : "landscape")
                        print("[AppDelegate] Orientation updated: \(isActive ? "forced to \(dir) (tilt-to-exit enabled)" : "locked to portrait")")
                    }
                }
            }
        } else {
            // iOS 15: Flag is set, but user must physically rotate phone
            print("[AppDelegate] Orientation flag updated (iOS 15 - user must rotate manually): \(isActive ? "forced to landscape" : "locked to portrait")")
        }
    }
    
    // MARK: - JavaScript Bridge Setup
    
    private func setupOrientationBridge() {
        guard let window = self.window,
              let rootViewController = window.rootViewController else {
            // Retry after a delay if WebView not ready yet
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                self.setupOrientationBridge()
            }
            return
        }
        
        guard let webView = findWebView(in: rootViewController.view) else {
            // Retry after a delay if WebView not found yet
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                self.setupOrientationBridge()
            }
            return
        }
        
        // Bridge code to inject
        let bridgeCode = """
            (function() {
                if (window.iOSOrientation) return; // Already injected
                window.iOSOrientation = {
                    setCustomFullscreen: function(isActive) {
                        if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.orientationHandler) {
                            window.webkit.messageHandlers.orientationHandler.postMessage({ isCustomFullscreen: isActive });
                        }
                    }
                };
            })();
        """
        
        // Add WKUserScript for future page navigations
        let userScript = WKUserScript(
            source: bridgeCode,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        )
        webView.configuration.userContentController.addUserScript(userScript)
        
        // Register message handler
        webView.configuration.userContentController.add(self, name: "orientationHandler")
        
        // Also inject into current page immediately (covers first page load)
        webView.evaluateJavaScript(bridgeCode) { result, error in
            if let error = error {
                print("[AppDelegate] Failed to inject orientation bridge: \(error.localizedDescription)")
            } else {
                print("[AppDelegate] Orientation bridge injected successfully")
            }
        }
    }
    
    // MARK: - WKScriptMessageHandler
    
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        if message.name == "orientationHandler" {
            if let body = message.body as? [String: Any],
               let isActive = body["isCustomFullscreen"] as? Bool {
                setCustomFullscreen(isActive)
            }
        }
    }

}
