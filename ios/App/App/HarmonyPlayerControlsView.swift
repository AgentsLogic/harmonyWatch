import SwiftUI
import AVKit

struct HarmonyPlayerControlsView: View {
    @ObservedObject var state: HarmonyPlayerState
    
    var onPlayPause: (() -> Void)?
    var onSeek: ((Double) -> Void)?
    var onClose: (() -> Void)?
    var onQualityChange: ((HarmonyPlayerState.VideoQuality) -> Void)?
    var onFullscreenToggle: (() -> Void)?
    var onPipClose: (() -> Void)?
    var onPipTap: (() -> Void)?
    var onNativePipStart: (() -> Void)?
    
    @State private var isDraggingSeek = false
    @State private var dragSeekValue: Double = 0
    
    init(
        state: HarmonyPlayerState,
        onPlayPause: (() -> Void)? = nil,
        onSeek: ((Double) -> Void)? = nil,
        onClose: (() -> Void)? = nil,
        onQualityChange: ((HarmonyPlayerState.VideoQuality) -> Void)? = nil,
        onFullscreenToggle: (() -> Void)? = nil,
        onPipClose: (() -> Void)? = nil,
        onPipTap: (() -> Void)? = nil,
        onNativePipStart: (() -> Void)? = nil
    ) {
        self.state = state
        self.onPlayPause = onPlayPause
        self.onSeek = onSeek
        self.onClose = onClose
        self.onQualityChange = onQualityChange
        self.onFullscreenToggle = onFullscreenToggle
        self.onPipClose = onPipClose
        self.onPipTap = onPipTap
        self.onNativePipStart = onNativePipStart
    }
    
    var body: some View {
        ZStack {
            // Hide controls if native PiP is active (OS has its own)
            if !state.isNativePipActive {
                if state.isPipMode {
                    // PiP layout: simplified controls
                    pipLayout
                } else {
                    // Normal layout: full controls
                    normalLayout
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .ignoresSafeArea(.all)
    }
    
    private var normalLayout: some View {
        ZStack {
            // Background gradient overlay
            LinearGradient(
                gradient: Gradient(colors: [
                    Color.black.opacity(0.0),
                    Color.black.opacity(0.3),
                    Color.black.opacity(0.6)
                ]),
                startPoint: .top,
                endPoint: .bottom
            )
            .opacity(state.controlsVisible ? 1 : 0)
            .animation(.easeInOut(duration: 0.3), value: state.controlsVisible)
            
            if state.controlsVisible {
                VStack(spacing: 0) {
                    // Top bar
                    HStack {
                        // Hide chevron-down button in fullscreen (fullscreen controls have their own exit button)
                        if !state.isFullscreen {
                            Button(action: { onClose?() }) {
                                Image(systemName: "chevron.down")
                                    .font(.system(size: 20, weight: .medium))
                                    .foregroundColor(.white)
                                    .frame(width: 44, height: 44)
                                    .background(Color.black.opacity(0.5))
                                    .clipShape(Circle())
                            }
                            .padding(.leading, 16)
                            .padding(.top, 16)
                        } else {
                            // Spacer to maintain layout when button is hidden
                            Spacer()
                                .frame(width: 44, height: 44)
                                .padding(.leading, 16)
                                .padding(.top, 16)
                        }
                        
                        Spacer()
                        
                        HStack(spacing: 12) {
                            ZStack {
                                Color.black.opacity(0.5)
                                AirPlayButton()
                                    .frame(width: 44, height: 44)
                                    .opacity(state.isAirPlayActive ? 1.0 : 0.8)
                            }
                            .frame(width: 44, height: 44)
                            .clipShape(Circle())
                            
                            if !state.availableQualities.isEmpty {
                                Menu {
                                    ForEach(state.availableQualities) { quality in
                                        Button(action: { onQualityChange?(quality) }) {
                                            HStack {
                                                Text(quality.label)
                                                if state.selectedQuality?.id == quality.id {
                                                    Image(systemName: "checkmark")
                                                }
                                            }
                                        }
                                    }
                                } label: {
                                    Image(systemName: "gearshape.fill")
                                        .font(.system(size: 20, weight: .medium))
                                        .foregroundColor(.white)
                                        .frame(width: 44, height: 44)
                                        .background(Color.black.opacity(0.5))
                                        .clipShape(Circle())
                                }
                            }
                            
                            Button(action: { onFullscreenToggle?() }) {
                                Image(systemName: state.isFullscreen ? "arrow.down.right.and.arrow.up.left" : "arrow.up.left.and.arrow.down.right")
                                    .font(.system(size: 20, weight: .medium))
                                    .foregroundColor(.white)
                                    .frame(width: 44, height: 44)
                                    .background(Color.black.opacity(0.5))
                                    .clipShape(Circle())
                            }
                        }
                        .padding(.trailing, 16)
                        .padding(.top, 16)
                    }
                    
                    Spacer()
                    
                    // Center play/pause
                    Button(action: { onPlayPause?() }) {
                        Image(systemName: state.isPlaying ? "pause.fill" : "play.fill")
                            .font(.system(size: 50, weight: .medium))
                            .foregroundColor(.white)
                            .frame(width: 80, height: 80)
                            .background(Color.black.opacity(0.5))
                            .clipShape(Circle())
                    }
                    .opacity(state.isBuffering ? 0.5 : 1.0)
                    
                    Spacer()
                    
                    // Time labels
                    HStack {
                        Text(formatTime(isDraggingSeek ? dragSeekValue : state.currentTime))
                            .font(.system(size: 16, weight: .medium))
                            .foregroundColor(.white)
                        Spacer()
                        Text(formatTime(state.duration))
                            .font(.system(size: 16, weight: .medium))
                            .foregroundColor(.white.opacity(0.7))
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, 0)
                    .offset(y: 20)
                    
                    // Seek bar: flush at very bottom, full width, no padding
                    GeometryReader { geometry in
                        ZStack(alignment: .bottomLeading) {
                            // Touch target (full height, invisible)
                            Color.clear
                            
                            // Track + thumb pinned to bottom
                            ZStack(alignment: .leading) {
                                Rectangle()
                                    .fill(Color.white.opacity(0.3))
                                    .frame(height: 4)
                                Rectangle()
                                    .fill(Color.white)
                                    .frame(width: geometry.size.width * progressFraction, height: 4)
                                Circle()
                                    .fill(Color.white)
                                    .frame(width: 12, height: 12)
                                    .offset(x: geometry.size.width * progressFraction - 6, y: 0)
                            }
                            .frame(height: 12)
                        }
                        .contentShape(Rectangle())
                        .gesture(
                            DragGesture(minimumDistance: 0)
                                .onChanged { value in
                                    isDraggingSeek = true
                                    let fraction = max(0, min(1, value.location.x / geometry.size.width))
                                    dragSeekValue = fraction * (state.duration > 0 ? state.duration : 100)
                                }
                                .onEnded { value in
                                    let fraction = max(0, min(1, value.location.x / geometry.size.width))
                                    let seekTime = fraction * (state.duration > 0 ? state.duration : 100)
                                    onSeek?(seekTime)
                                    isDraggingSeek = false
                                }
                        )
                    }
                    .frame(height: 30)
                    .offset(y: 4)
                }
            }
        }
    }
    
    private var pipLayout: some View {
        ZStack {
            // Full-screen tap-to-expand area (behind buttons)
            // Covers entire PiP view including space between buttons
            Color.clear
                .contentShape(Rectangle())
                .onTapGesture {
                    print("[HarmonyPlayer] PiP tap-to-expand fired (background)")
                    onPipTap?()
                }
            
            // PiP: Top bar with play (left) and close (right), overlaid on tap area
            VStack {
                HStack {
                    Button(action: {
                        onPlayPause?()
                    }) {
                        Image(systemName: state.isPlaying ? "pause.fill" : "play.fill")
                            .font(.system(size: 16, weight: .medium))
                            .foregroundColor(.white)
                            .frame(width: 32, height: 32)
                            .background(Color.black.opacity(0.5))
                            .clipShape(Circle())
                    }
                    .padding(.leading, 8)
                    .padding(.top, 8)
                    
                    Spacer()
                    
                    Button(action: {
                        print("[HarmonyPlayer] PiP X button tapped - calling onPipClose")
                        onPipClose?()
                    }) {
                        Image(systemName: "xmark")
                            .font(.system(size: 16, weight: .medium))
                            .foregroundColor(.white)
                            .frame(width: 32, height: 32)
                            .background(Color.black.opacity(0.5))
                            .clipShape(Circle())
                    }
                    .padding(.trailing, 8)
                    .padding(.top, 8)
                }
                
                Spacer()
            }
        }
    }
    
    private var progressFraction: Double {
        guard state.duration > 0 else { return 0 }
        let current = isDraggingSeek ? dragSeekValue : state.currentTime
        return max(0, min(1, current / state.duration))
    }
    
    private func formatTime(_ seconds: Double) -> String {
        guard seconds.isFinite && !seconds.isNaN else { return "0:00" }
        let totalSeconds = Int(seconds)
        let hours = totalSeconds / 3600
        let minutes = (totalSeconds % 3600) / 60
        let secs = totalSeconds % 60
        
        if hours > 0 {
            return String(format: "%d:%02d:%02d", hours, minutes, secs)
        } else {
            return String(format: "%d:%02d", minutes, secs)
        }
    }
}

// MARK: - AirPlay Button

struct AirPlayButton: UIViewRepresentable {
    func makeUIView(context: Context) -> AVRoutePickerView {
        let picker = AVRoutePickerView()
        picker.tintColor = .white
        picker.activeTintColor = .systemBlue
        picker.prioritizesVideoDevices = true
        return picker
    }
    
    func updateUIView(_ uiView: AVRoutePickerView, context: Context) {}
}
