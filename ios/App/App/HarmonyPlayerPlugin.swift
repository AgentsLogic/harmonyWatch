import Foundation
import Capacitor
import AVFoundation
import MediaPlayer

@objc(HarmonyPlayerPlugin)
public class HarmonyPlayerPlugin: CAPPlugin {
    private var playerViewController: HarmonyPlayerViewController?
    
    @objc public func playInline(_ call: CAPPluginCall) {
        guard let playbackId = call.getString("playbackId") else {
            call.reject("playbackId is required")
            return
        }
        
        let title = call.getString("title") ?? "Video"
        let startTime = call.getDouble("startTime") ?? 0.0
        let thumbnailUrl = call.getString("thumbnailUrl")
        
        // Get frame from options
        guard let frameDict = call.getObject("frame"),
              let x = frameDict["x"] as? Double,
              let y = frameDict["y"] as? Double,
              let width = frameDict["width"] as? Double,
              let height = frameDict["height"] as? Double else {
            call.reject("frame is required with x, y, width, height")
            return
        }
        
        let frame = CGRect(x: x, y: y, width: width, height: height)
        
        DispatchQueue.main.async { [weak self] in
            guard let self = self, let bridgeVC = self.bridge?.viewController else {
                call.reject("Plugin instance or bridge view controller not available")
                return
            }
            
            // Stop and remove any existing player (without firing onClosed callback)
            if let existingVC = self.playerViewController {
                (UIApplication.shared.delegate as? AppDelegate)?.setNativePlayerInlineVisible(false)
                existingVC.onClosed = nil // Prevent "closed" event firing when just replacing
                existingVC.close()
                self.playerViewController = nil
            }
            
            // Create new player view controller with inline frame
            let vc = HarmonyPlayerViewController(
                playbackId: playbackId,
                title: title,
                startTime: startTime,
                thumbnailUrl: thumbnailUrl,
                frame: frame
            )
            
            // Set up event listeners
            vc.onTimeUpdate = { [weak self] currentTime, duration in
                self?.notifyListeners("timeUpdate", data: [
                    "currentTime": currentTime,
                    "duration": duration
                ])
            }
            
            vc.onStateChange = { [weak self] isPlaying in
                self?.notifyListeners("stateChange", data: [
                    "isPlaying": isPlaying
                ])
            }
            
            vc.onEnded = { [weak self] in
                self?.notifyListeners("ended", data: [:])
            }
            
            vc.onClosed = { [weak self] currentTime in
                (UIApplication.shared.delegate as? AppDelegate)?.setNativePlayerInlineVisible(false)
                self?.notifyListeners("closed", data: [
                    "currentTime": currentTime
                ])
                self?.playerViewController = nil
            }
            
            vc.onFullscreenChange = { [weak self] isFullscreen in
                self?.notifyListeners("fullscreenChange", data: [
                    "isFullscreen": isFullscreen
                ])
            }
            
            vc.onPipClose = { [weak self] in
                print("[HarmonyPlayerPlugin] onPipClose - notifying pipClose to listeners")
                self?.notifyListeners("pipClose", data: [:])
            }
            
            vc.onPipTap = { [weak self] in
                self?.notifyListeners("pipTap", data: [:])
            }
            
            vc.onRequestPip = { [weak self] in
                self?.notifyListeners("requestPip", data: [:])
            }
            
            vc.onAirPlayChange = { [weak self] isActive in
                self?.notifyListeners("airPlayChange", data: [
                    "isActive": isActive
                ])
            }
            
            vc.onNativePipChange = { [weak self] isActive in
                self?.notifyListeners("nativePipChange", data: [
                    "isActive": isActive
                ])
            }
            
            vc.onNativePipRestore = { [weak self] in
                self?.notifyListeners("nativePipRestore", data: [:])
            }
            
            vc.onDragStart = { [weak self] in
                self?.notifyListeners("dragStart", data: [:])
            }
            
            vc.onDragMove = { [weak self] deltaX, deltaY in
                self?.notifyListeners("dragMove", data: [
                    "deltaX": deltaX,
                    "deltaY": deltaY
                ])
            }
            
            vc.onDragEnd = { [weak self] deltaX, deltaY in
                self?.notifyListeners("dragEnd", data: [
                    "deltaX": deltaX,
                    "deltaY": deltaY
                ])
            }
            
            self.playerViewController = vc
            
            // Add as child view controller
            bridgeVC.addChild(vc)
            bridgeVC.view.addSubview(vc.view)
            vc.didMove(toParent: bridgeVC)
            
            (UIApplication.shared.delegate as? AppDelegate)?.setNativePlayerInlineVisible(true)
            
            call.resolve([:])
        }
    }
    
    // Keep old play method for backward compatibility (test page)
    @objc public func play(_ call: CAPPluginCall) {
        guard let playbackId = call.getString("playbackId") else {
            call.reject("playbackId is required")
            return
        }
        
        let title = call.getString("title") ?? "Video"
        let startTime = call.getDouble("startTime") ?? 0.0
        let thumbnailUrl = call.getString("thumbnailUrl")
        
        DispatchQueue.main.async { [weak self] in
            guard let self = self else {
                call.reject("Plugin instance not available")
                return
            }
            
            // Dismiss any existing player
            if let existingVC = self.playerViewController {
                existingVC.dismiss(animated: false) {
                    self.playerViewController = nil
                }
            }
            
            // Create new player view controller (modal presentation)
            let vc = HarmonyPlayerViewController(
                playbackId: playbackId,
                title: title,
                startTime: startTime,
                thumbnailUrl: thumbnailUrl
            )
            
            // Set up event listeners
            vc.onTimeUpdate = { [weak self] currentTime, duration in
                self?.notifyListeners("timeUpdate", data: [
                    "currentTime": currentTime,
                    "duration": duration
                ])
            }
            
            vc.onStateChange = { [weak self] isPlaying in
                self?.notifyListeners("stateChange", data: [
                    "isPlaying": isPlaying
                ])
            }
            
            vc.onEnded = { [weak self] in
                self?.notifyListeners("ended", data: [:])
            }
            
            vc.onClosed = { [weak self] currentTime in
                self?.notifyListeners("closed", data: [
                    "currentTime": currentTime
                ])
                self?.playerViewController = nil
            }
            
            self.playerViewController = vc
            
            // Present modally
            if let rootVC = self.bridge?.viewController {
                rootVC.present(vc, animated: true)
            }
            
            call.resolve([:])
        }
    }
    
    @objc public func pause(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            self?.playerViewController?.pause()
            call.resolve([:])
        }
    }
    
    @objc public func resume(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            self?.playerViewController?.resume()
            call.resolve([:])
        }
    }
    
    @objc public func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            self?.playerViewController?.dismiss(animated: true) {
                self?.playerViewController = nil
            }
            call.resolve([:])
        }
    }
    
    @objc public func seek(_ call: CAPPluginCall) {
        guard let time = call.getDouble("time") else {
            call.reject("time is required")
            return
        }
        
        DispatchQueue.main.async { [weak self] in
            self?.playerViewController?.seek(to: time)
            call.resolve([:])
        }
    }
    
    @objc public func enterFullscreen(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            self?.playerViewController?.enterFullscreen()
            call.resolve([:])
        }
    }
    
    @objc public func exitFullscreen(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            self?.playerViewController?.exitFullscreen()
            call.resolve([:])
        }
    }
    
    @objc public func updateFrame(_ call: CAPPluginCall) {
        guard let frameDict = call.getObject("frame"),
              let x = frameDict["x"] as? Double,
              let y = frameDict["y"] as? Double,
              let width = frameDict["width"] as? Double,
              let height = frameDict["height"] as? Double else {
            call.reject("frame is required with x, y, width, height")
            return
        }
        
        let frame = CGRect(x: x, y: y, width: width, height: height)
        let animated = call.getBool("animated") ?? true
        let cornerRadius = call.getDouble("cornerRadius") ?? 0.0
        
        DispatchQueue.main.async { [weak self] in
            self?.playerViewController?.updateFrame(frame, animated: animated, cornerRadius: cornerRadius)
            call.resolve([:])
        }
    }
    
    @objc public func setPipMode(_ call: CAPPluginCall) {
        guard let enabled = call.getBool("enabled") else {
            call.reject("enabled is required")
            return
        }
        
        DispatchQueue.main.async { [weak self] in
            self?.playerViewController?.setPipMode(enabled)
            call.resolve([:])
        }
    }
    
    @objc public func switchContent(_ call: CAPPluginCall) {
        guard let playbackId = call.getString("playbackId") else {
            call.reject("playbackId is required")
            return
        }
        
        let title = call.getString("title") ?? "Video"
        let startTime = call.getDouble("startTime") ?? 0.0
        let thumbnailUrl = call.getString("thumbnailUrl")
        
        DispatchQueue.main.async { [weak self] in
            self?.playerViewController?.switchContent(
                playbackId: playbackId,
                title: title,
                startTime: startTime,
                thumbnailUrl: thumbnailUrl
            )
            call.resolve([:])
        }
    }
    
    @objc public func startNativePip(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            self?.playerViewController?.startNativePip()
            call.resolve([:])
        }
    }
}
