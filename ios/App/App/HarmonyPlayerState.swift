import Foundation
import Combine
import AVFoundation

class HarmonyPlayerState: NSObject, ObservableObject {
    @Published var isPlaying: Bool = false
    @Published var currentTime: Double = 0.0
    @Published var duration: Double = 0.0
    @Published var isBuffering: Bool = false
    @Published var availableQualities: [VideoQuality] = []
    @Published var selectedQuality: VideoQuality?
    @Published var controlsVisible: Bool = true
    @Published var isFullscreen: Bool = false
    @Published var isPipMode: Bool = false
    @Published var isAirPlayActive: Bool = false
    @Published var isNativePipActive: Bool = false
    
    private var timeObserver: Any?
    private var player: AVPlayer?
    
    struct VideoQuality: Identifiable, Equatable {
        let id: String
        let label: String
        let height: Int
        let peakBitRate: Double
        
        static let auto = VideoQuality(id: "auto", label: "Auto", height: 0, peakBitRate: 0)
        
        init(id: String, label: String, height: Int, peakBitRate: Double = 0) {
            self.id = id
            self.label = label
            self.height = height
            self.peakBitRate = peakBitRate
        }
    }
    
    func attachPlayer(_ player: AVPlayer) {
        self.player = player
        
        // Observe time updates
        let interval = CMTime(seconds: 0.5, preferredTimescale: 600)
        timeObserver = player.addPeriodicTimeObserver(forInterval: interval, queue: .main) { [weak self] time in
            guard let self = self else { return }
            self.currentTime = time.seconds
            
            // Update duration if available
            if let duration = player.currentItem?.duration, duration.isValid {
                self.duration = duration.seconds
            }
        }
        
        // Observe playback status using Combine
        player.publisher(for: \.rate)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] rate in
                self?.isPlaying = rate > 0
            }
            .store(in: &cancellables)
        
        player.publisher(for: \.timeControlStatus)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] status in
                self?.isBuffering = (status == .waitingToPlayAtSpecifiedRate)
            }
            .store(in: &cancellables)
        
        // Observe available renditions for quality selection
        observeAvailableQualities()
    }
    
    func detachPlayer() {
        if let observer = timeObserver {
            player?.removeTimeObserver(observer)
            timeObserver = nil
        }
        
        cancellables.removeAll()
        
        player = nil
    }
    
    private func observeAvailableQualities() {
        guard let player = player,
              let item = player.currentItem else { return }
        
        // Observe item status using Combine
        item.publisher(for: \.status)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] status in
                if status == .readyToPlay, let item = self?.player?.currentItem {
                    self?.extractQualities(from: item)
                }
            }
            .store(in: &cancellables)
        
        // When item is ready, extract available qualities
        if item.status == .readyToPlay {
            extractQualities(from: item)
        }
    }
    
    private func extractQualities(from item: AVPlayerItem) {
        guard let asset = item.asset as? AVURLAsset else {
            // Fallback to hardcoded if not AVURLAsset
            setDefaultQualities()
            return
        }
        
        // Use AVAssetVariant for iOS 15+ to parse actual HLS variants
        if #available(iOS 15.0, *) {
            Task {
                do {
                    let variants = try await asset.variants
                    var qualities: [VideoQuality] = [.auto]
                    var seenHeights = Set<Int>()
                    
                    for variant in variants {
                        if let videoAttrs = variant.videoAttributes {
                            let height = videoAttrs.presentationSize.height
                            let h = Int(height)
                            if !seenHeights.contains(h) && h > 0 {
                                seenHeights.insert(h)
                                let peakBitRate = variant.peakBitRate ?? 0.0
                                qualities.append(VideoQuality(
                                    id: "\(h)p",
                                    label: "\(h)p",
                                    height: h,
                                    peakBitRate: peakBitRate
                                ))
                            }
                        }
                    }
                    
                    // Sort descending by height
                    qualities = [.auto] + qualities.filter { $0.height > 0 }
                        .sorted { $0.height > $1.height }
                    
                    await MainActor.run {
                        self.availableQualities = qualities
                        if self.selectedQuality == nil {
                            self.selectedQuality = .auto
                        }
                    }
                } catch {
                    // Fallback to default if parsing fails
                    print("[HarmonyPlayer] Failed to parse HLS variants: \(error)")
                    await MainActor.run {
                        self.setDefaultQualities()
                    }
                }
            }
        } else {
            // iOS < 15: fallback to default
            setDefaultQualities()
        }
    }
    
    private func setDefaultQualities() {
        let qualities: [VideoQuality] = [
            .auto,
            VideoQuality(id: "1080p", label: "1080p", height: 1080, peakBitRate: 0),
            VideoQuality(id: "720p", label: "720p", height: 720, peakBitRate: 0),
            VideoQuality(id: "480p", label: "480p", height: 480, peakBitRate: 0),
            VideoQuality(id: "360p", label: "360p", height: 360, peakBitRate: 0)
        ]
        
        DispatchQueue.main.async {
            self.availableQualities = qualities
            if self.selectedQuality == nil {
                self.selectedQuality = .auto
            }
        }
    }
    
    private var cancellables = Set<AnyCancellable>()
    
    func hideControls() {
        controlsVisible = false
    }
    
    func showControls() {
        controlsVisible = true
    }
    
    func toggleControls() {
        controlsVisible.toggle()
    }
    
    func changeQuality(to quality: VideoQuality) {
        selectedQuality = quality
        guard let item = player?.currentItem else { return }
        
        if quality.id == "auto" {
            item.preferredPeakBitRate = 0  // No limit = auto
        } else {
            item.preferredPeakBitRate = quality.peakBitRate
        }
    }
}
