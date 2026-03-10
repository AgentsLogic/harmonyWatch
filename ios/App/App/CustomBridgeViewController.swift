import UIKit
import Capacitor
import WebKit

class CustomBridgeViewController: CAPBridgeViewController {
    
    override func viewDidLoad() {
        super.viewDidLoad()
        // Ensure parent class initializes properly
    }
    
    // Override WKWebView configuration to enable Picture-in-Picture media playback.
    // This allows iOS to keep the video's audio pipeline alive when the app enters
    // the background, potentially eliminating the pause gap during background transition.
    override open func webViewConfiguration(for instanceConfiguration: InstanceConfiguration) -> WKWebViewConfiguration {
        let config = super.webViewConfiguration(for: instanceConfiguration)
        config.allowsPictureInPictureMediaPlayback = true
        return config
    }
    
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask {
        if let appDelegate = UIApplication.shared.delegate as? AppDelegate {
            if appDelegate.isCustomFullscreenActive {
                return .allButUpsideDown // Allow landscape and portrait for tilt-to-exit support
            }
            if appDelegate.isNativePlayerInlineVisible {
                return .allButUpsideDown // Allow rotation when native player inline — enables tilt-to-enter fullscreen
            }
        }
        return .portrait // Lock to portrait by default
    }
    
    override var shouldAutorotate: Bool {
        // Always allow autorotation - supportedInterfaceOrientations controls which orientations are allowed
        return true
    }
}
