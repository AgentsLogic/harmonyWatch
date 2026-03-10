import UIKit

class SplashViewController: UIViewController {
    
    private var splashImageView: UIImageView?
    private var isTransitioning = false // Guard against double transition
    
    override func viewDidLoad() {
        super.viewDidLoad()
        
        setupSplashImage()
    }
    
    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        
        // Show splash image and transition after a brief delay
        showSplash()
    }
    
    private func setupSplashImage() {
        // Set background color to match your app theme
        view.backgroundColor = .black
        
        // Load splash image from Assets
        guard let splashImage = UIImage(named: "Splash") else {
            print("[SplashViewController] Failed to load splash image. Transitioning to main app.")
            transitionToMainApp()
            return
        }
        
        // Create image view
        let imageView = UIImageView(image: splashImage)
        imageView.contentMode = .scaleAspectFit
        imageView.translatesAutoresizingMaskIntoConstraints = false
        
        view.addSubview(imageView)
        splashImageView = imageView
        
        // Center the image
        NSLayoutConstraint.activate([
            imageView.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            imageView.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            imageView.widthAnchor.constraint(equalTo: view.widthAnchor),
            imageView.heightAnchor.constraint(equalTo: view.heightAnchor)
        ])
    }
    
    private func showSplash() {
        // Show splash for a minimum duration (1.5 seconds) then transition
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
            self?.transitionToMainApp()
        }
    }
    
    private func transitionToMainApp() {
        // Guard against being called multiple times (animation complete + safety timeout)
        guard !isTransitioning else { return }
        isTransitioning = true
        
        // Give CAPBridgeViewController time to create the WebView
        // maxAttempts: 50 x 0.1s = 5 seconds max wait
        waitForWebViewReady(attempts: 0, maxAttempts: 50) { [weak self] webViewReady in
            guard let self = self else { return }
            
            if webViewReady {
                print("[SplashViewController] WebView ready, removing splash")
            } else {
                print("[SplashViewController] WebView not found after max attempts, removing splash anyway")
            }
            
            // Fade out animation, then remove splash overlay
            UIView.animate(withDuration: 0.3, animations: {
                self.view.alpha = 0.0
            }) { [weak self] _ in
                guard let self = self else { return }
                
                // Remove splash view controller
                self.willMove(toParent: nil)
                self.view.removeFromSuperview()
                self.removeFromParent()
                
                // Clear reference in app delegate
                if let appDelegate = UIApplication.shared.delegate as? AppDelegate {
                    appDelegate.splashViewController = nil
                    print("[SplashViewController] Splash removed, app should be visible")
                }
            }
        }
    }
    
    // Poll for WebView to be ready with retry logic
    private func waitForWebViewReady(attempts: Int, maxAttempts: Int, completion: @escaping (Bool) -> Void) {
        guard let appDelegate = UIApplication.shared.delegate as? AppDelegate,
              let window = appDelegate.window,
              let rootViewController = window.rootViewController else {
            // Root VC not ready yet, retry
            if attempts < maxAttempts {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [weak self] in
                    self?.waitForWebViewReady(attempts: attempts + 1, maxAttempts: maxAttempts, completion: completion)
                }
            } else {
                completion(false)
            }
            return
        }
        
        // Check if WebView exists in the view hierarchy
        if appDelegate.findWebView(in: rootViewController.view) != nil {
            print("[SplashViewController] WebView found after \(attempts) attempts")
            completion(true)
        } else {
            // Retry after a short delay
            if attempts < maxAttempts {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [weak self] in
                    self?.waitForWebViewReady(attempts: attempts + 1, maxAttempts: maxAttempts, completion: completion)
                }
            } else {
                print("[SplashViewController] WebView not found after \(maxAttempts) attempts")
                completion(false)
            }
        }
    }
}
