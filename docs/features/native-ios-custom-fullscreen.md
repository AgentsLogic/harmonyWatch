# Native iOS Player — Custom Fullscreen with Orientation Rotation

**Date:** February 18, 2026  
**Status:** Planning

---

## Purpose

Add landscape orientation rotation to the native iOS player's fullscreen mode, matching the behavior users already experience in the WKWebView-based player.

### Background

The app has two iOS video player paths:

| | WKWebView Player | Native iOS Player |
|---|---|---|
| **Engine** | MediaThemeNotflix in WKWebView | AVPlayer + SwiftUI controls |
| **Fullscreen** | CSS rotation + AppDelegate orientation lock | Frame expansion only (no rotation) |
| **Where** | `mux-video-player.tsx` | `HarmonyPlayerViewController.swift` |

The WKWebView player's custom fullscreen calls `window.iOSOrientation.setCustomFullscreen(true)` through a JavaScript bridge, which sets `AppDelegate.isCustomFullscreenActive = true` and triggers `requestGeometryUpdate(.landscape)` on iOS 16+. The device physically rotates and the WKWebView fills the landscape viewport.

The native player's `enterFullscreen()` currently just animates `view.frame = window.bounds` — the device stays in portrait. This creates an inconsistent, cramped experience for landscape video content.

### Goal

When a user taps the fullscreen button in the native player, the device rotates to landscape and the video fills the screen — identical to the WKWebView player's behavior.

---

## End State

### User-Facing Behavior

**Enter fullscreen:** User taps expand button → device rotates to landscape → video fills screen → status bar hidden → controls overlay on tap.

**Exit fullscreen:** User taps shrink button OR tilts phone back to portrait → device rotates to portrait → video returns to inline position → status bar restored.

**Tilt-based auto-exit:** If the user physically rotates the phone back to portrait while in fullscreen, fullscreen exits automatically (matching WKWebView behavior). See Appendix F for why this requires changing the AppDelegate orientation mask from `.landscape` to `.allButUpsideDown` during fullscreen.

**System gestures in fullscreen:** Users can still access Control Center and Notification Center via the standard iOS system gestures even when in fullscreen. iOS handles these at a higher level than app touch events — no special implementation needed.

### Technical End State

The changes are entirely in Swift. No JavaScript/TypeScript changes required since `useNativePlayer` already exposes `enterFullscreen()` / `exitFullscreen()` and the Capacitor plugin already calls the native methods.

**`HarmonyPlayerViewController.swift` changes:**

1. `enterFullscreen()` — After storing the inline frame, calls `AppDelegate.setCustomFullscreen(true)`. The device rotates. In `viewWillTransition(to:with:)`, the view frame updates to the new landscape bounds.

2. `exitFullscreen()` — Calls `AppDelegate.setCustomFullscreen(false)`. The device rotates back to portrait. In `viewWillTransition(to:with:)`, the view frame restores to the saved inline frame.

3. `viewWillTransition(to:with:coordinator:)` — New override. When rotation occurs during fullscreen, animates the view frame to the new parent bounds alongside the rotation coordinator's animation. When rotation exits fullscreen (tilt-to-exit — portrait size detected while `playerState.isFullscreen == true`), calls `exitFullscreen()` to restore inline frame and clear the AppDelegate flag. Note: `viewDidLayoutSubviews` already syncs `playerLayer.frame = view.bounds` automatically after frame changes — no need to manually set the player layer frame in the transition.

4. `prefersStatusBarHidden` — Changed from unconditional `true` to conditional on `playerState.isFullscreen`. Currently it always hides the status bar, even in inline mode — this is a bug that gets fixed as part of this work.

5. `videoGravity` — Switches from `.resizeAspectFill` to `.resizeAspect` when entering fullscreen (prevents cropping in landscape), switches back to `.resizeAspectFill` when exiting (maintains edge-to-edge in inline).

6. `supportedInterfaceOrientations` — Removed or left as `.all`. This override has no effect because `HarmonyPlayerViewController` is a **child** view controller (added via `addChild` / `addSubview` in `HarmonyPlayerPlugin`). iOS queries orientation support from the **root presented view controller** (`CustomBridgeViewController`) and the **AppDelegate**, not from child view controllers.

7. **PiP button visibility** — The chevron-down button (top-left) that enters custom PiP mode must be hidden when in fullscreen, and shown again when exiting fullscreen. The button's `onClose` handler already checks `!playerState.isFullscreen` before calling `onRequestPip()`, but the button itself should be visually hidden during fullscreen to prevent user confusion.

8. **Swipe-to-PiP gesture** — The drag-to-dismiss gesture (swipe down) that enters custom PiP is already disabled during fullscreen via the guard in `handlePanGesture` (`guard isInlineMode && !playerState.isFullscreen`). No change needed, but verify this guard remains in place.

9. **`close()` safety guard** — The `close()` method must reset `AppDelegate.setCustomFullscreen(false)` before tearing down the player. Currently, if `close()` is called while in fullscreen (e.g., via the `onClose` handler's else branch, or programmatically), the player is destroyed but the AppDelegate flag stays `true`, leaving the app stuck in landscape. Add a guard at the top of `close()`:
   ```swift
   if playerState.isFullscreen {
       AppDelegate.setCustomFullscreen(false)
       playerState.isFullscreen = false
   }
   ```

10. **System gesture access** — iOS automatically allows Control Center and Notification Center gestures in fullscreen. No override needed. Do NOT override `preferredScreenEdgesDeferringSystemGestures` — that property specifies edges where the *app's* gestures take priority over system gestures (requiring a second swipe). Leaving it at the default (empty) ensures system gestures work on first swipe.

**`AppDelegate.swift` change:**

11. **Orientation mask for tilt-to-exit** — `setCustomFullscreen(true)` must change the orientation mask from `.landscape` to `.allButUpsideDown` (not `.landscape`). If the mask is `.landscape` only, iOS will never allow portrait rotation while the flag is active — making tilt-to-exit impossible. With `.allButUpsideDown`, iOS allows both landscape and portrait. The initial `requestGeometryUpdate(.landscape)` still forces the device into landscape on entry. But once there, the user can physically rotate back to portrait, which triggers `viewWillTransition` and allows tilt-to-exit detection. On `setCustomFullscreen(false)`, the mask returns to `.portrait` as before.

**Files changed:**
- `ios/App/App/HarmonyPlayerViewController.swift` — Core changes (items 1-5, 9)
- `ios/App/App/HarmonyPlayerControlsView.swift` — Hide/show chevron-down button based on `state.isFullscreen` (item 7)
- `ios/App/App/AppDelegate.swift` — Change `.landscape` to `.allButUpsideDown` in `setCustomFullscreen(true)` (item 11)
- No changes to `HarmonyPlayerPlugin.swift` — existing `enterFullscreen` / `exitFullscreen` plugin methods already call the VC
- No changes to `useNativePlayer.ts` or `video-modal.tsx`

---

## Constraints

### View Controller Hierarchy (Most Important)

`HarmonyPlayerViewController` is a **child** of the Capacitor bridge view controller:

```
AppDelegate (controls orientation mask)
  └── CustomBridgeViewController (root VC, its supportedInterfaceOrientations is queried)
        └── WKWebView (Capacitor web content)
        └── HarmonyPlayerViewController (added as child via addChild/addSubview)
              └── AVPlayerLayer
              └── SwiftUI HarmonyPlayerControlsView (hosted via UIHostingController)
```

**Consequence:** `HarmonyPlayerViewController.supportedInterfaceOrientations` is ignored by UIKit. Orientation is controlled entirely by `AppDelegate.application(_:supportedInterfaceOrientationsFor:)` → `CustomBridgeViewController.supportedInterfaceOrientations`. Both of these already check `AppDelegate.isCustomFullscreenActive`. We just need to set that flag.

**Consequence:** When the device rotates, the bridge VC's view resizes. But the player's view has a **manually-set frame** (`translatesAutoresizingMaskIntoConstraints = true`, frame assigned in `viewDidLoad`). The parent does **not** auto-resize the child view. We must handle frame updates ourselves in `viewWillTransition(to:with:)`.

### Frame Management During Rotation

This is the core technical challenge. The sequencing must be:

1. **Enter fullscreen:** Set AppDelegate flag → iOS begins rotation → in `viewWillTransition`, animate player view to new landscape bounds using the transition coordinator → `viewDidLayoutSubviews` automatically resizes `playerLayer` (existing code, no change needed)

2. **Exit fullscreen:** Set AppDelegate flag → iOS begins rotation → in `viewWillTransition`, animate player view back to saved inline frame using the transition coordinator → `viewDidLayoutSubviews` automatically resizes `playerLayer`

If we set the frame BEFORE rotation starts, the dimensions are wrong (portrait bounds, not landscape). If we wait until AFTER rotation completes, there's a visible jump. The transition coordinator lets us animate in sync with the rotation.

**Note:** `viewDidLayoutSubviews` (line 99-102) already does `playerLayer?.frame = view.bounds`. This fires automatically whenever the view frame changes. We do NOT need to manually set `playerLayer.frame` inside the coordinator animation — iOS handles it.

### Orientation Mask for Tilt-to-Exit

**Critical constraint:** The current `AppDelegate.setCustomFullscreen(true)` returns `.landscape` from `supportedInterfaceOrientationsFor`. This means iOS locks the device to landscape only — the user physically **cannot** rotate back to portrait. Tilt-to-exit is impossible with `.landscape`.

The fix is to return `.allButUpsideDown` instead. This allows both landscape and portrait while fullscreen is active. `requestGeometryUpdate(.landscape)` still forces the initial rotation to landscape. But once in landscape, the user can rotate back to portrait — triggering `viewWillTransition` where we detect it and exit fullscreen.

**Impact on WKWebView player:** The WKWebView player also uses `setCustomFullscreen(true)`, but it does NOT rely on the AppDelegate to lock orientation. It uses CSS rotation (the device stays in portrait mode; the video is visually rotated). Changing the mask to `.allButUpsideDown` should not affect the WKWebView player. However, this needs verification during testing — if the WKWebView starts receiving unwanted rotation events, we may need to differentiate which player triggered the fullscreen flag.

### Platform Version

- iOS 16+: `requestGeometryUpdate` forces automatic rotation. This is what we target.
- iOS 15: The flag is set but the device doesn't auto-rotate. User must manually rotate. This is acceptable — iOS 15 is <2% of iPhones as of early 2026, and the WKWebView player has the same limitation.

### Existing Behavior Preservation

- **PiP mode:** `handlePanGesture` already guards fullscreen (`guard isInlineMode && !playerState.isFullscreen`). Drag-to-dismiss (swipe down to enter PiP) is disabled during fullscreen. No change needed to the gesture handler.
- **PiP button (chevron down):** Hidden during fullscreen (item 7). The fullscreen controls have their own exit button (shrink arrows), so the chevron-down is not needed.
- **`close()` orientation safety:** `close()` must reset the AppDelegate flag before destroying the player (item 9). Without this, closing the player during fullscreen leaves the app stuck in landscape.
- **System gestures (Control Center / Notification Center):** iOS handles these at the system level. No app-level handling needed — do not override `preferredScreenEdgesDeferringSystemGestures` (that would make them harder to access, not easier).
- **Quality selection, AirPlay, lock screen controls:** Unaffected by orientation changes.
- **Stale inline frame:** If JS updates the video modal layout while in fullscreen (e.g., comments section changes), the saved `inlineFrame` may be stale. The existing `updateFrame()` method ignores updates during fullscreen (`if !playerState.isFullscreen { inlineFrame = frame }`). This is a pre-existing limitation, not a regression from this feature — but the implementer should be aware.

---

## Tradeoffs

### 1. Frame Update Strategy: `viewWillTransition` vs. Auto Layout Toggle

**Option A: `viewWillTransition` with coordinator animation (Chosen)**
- Use frame-based layout throughout, manually set frame in `viewWillTransition(to:with:coordinator:)`
- Animate alongside the rotation coordinator for smooth transition
- **Pro:** Minimal change to existing code — inline mode keeps using frame-based layout as-is
- **Pro:** `updateFrame()` (called from JS for position updates) continues to work unchanged
- **Con:** Must correctly handle the case where rotation is triggered by tilt (auto-exit), not just button tap

**Option B: Switch to Auto Layout constraints for fullscreen**
- Pin player view to parent edges when entering fullscreen, remove constraints when exiting
- **Pro:** iOS handles frame updates automatically during rotation
- **Con:** Mixing frame-based and constraint-based layout is fragile and error-prone
- **Con:** `updateFrame()` method would need to be aware of layout mode and switch between them

**Decision:** Option A. The player already uses frame-based layout everywhere. Adding a `viewWillTransition` override is cleaner than toggling between layout systems.

### 2. Tilt-Based Auto-Exit: Orientation Mask Approach

**Option A: `.allButUpsideDown` mask with tilt detection (Chosen)**
- Change AppDelegate mask from `.landscape` to `.allButUpsideDown` during fullscreen
- Detect tilt-to-portrait in `viewWillTransition` and call `exitFullscreen()`
- **Pro:** Users can physically rotate back to portrait — natural, expected behavior
- **Pro:** Uses standard iOS rotation system, no sensor APIs needed
- **Con:** Changes a shared AppDelegate mask — must verify WKWebView player is unaffected
- **Con:** Need to distinguish user-tilt from programmatic exit in `viewWillTransition`

**Option B: `.landscape` mask with device motion sensors**
- Keep `.landscape` lock, use `CMMotionManager` to detect portrait tilt, then programmatically exit
- **Pro:** No change to shared AppDelegate mask
- **Con:** Adds sensor dependency, battery usage, permission complexity
- **Con:** Reimplements what iOS already does natively

**Option C: Button-only exit (defer tilt-to-exit)**
- Keep `.landscape` mask, only allow fullscreen exit via button
- **Pro:** Simplest implementation — no orientation detection, no mask change
- **Con:** Inconsistent with WKWebView player where tilt-to-exit works
- **Con:** Users trapped in landscape until they find the button

**Decision:** Option A. Tilt-to-exit is an expected behavior that iOS supports natively via `.allButUpsideDown`. Using device motion sensors (Option B) reimplements what iOS already provides. Button-only exit (Option C) is a poor user experience. The WKWebView compatibility risk is mitigable with testing.

### 3. Video Gravity: Switch on Fullscreen or Keep Constant

**Option A: Switch `.resizeAspectFill` → `.resizeAspect` in fullscreen (Chosen)**
- Inline: `.resizeAspectFill` (edge-to-edge, slight crop acceptable in small view)
- Fullscreen: `.resizeAspect` (letterboxed, no crop — user expects to see full frame)
- **Pro:** Matches standard video player behavior (YouTube, Netflix, etc.)
- **Con:** Brief visual change during transition

**Option B: Keep `.resizeAspectFill` always**
- **Pro:** No visual change during transition
- **Con:** Crops video in landscape fullscreen, especially for non-16:9 content

**Decision:** Option A. Users entering fullscreen expect to see the complete video frame.

---

## Risk Tolerance

### Low Risk

| Area | Why |
|---|---|
| Plugin layer | No changes to `HarmonyPlayerPlugin.swift` — existing methods call into the VC |
| JavaScript layer | No changes — `useNativePlayer` already has `enterFullscreen` / `exitFullscreen` |
| Lock screen / AirPlay | Unaffected by orientation changes |

### Medium Risk

| Area | Why | Mitigation |
|---|---|---|
| Frame animation timing | `viewWillTransition` coordinator animation must sync with iOS rotation | Test on physical devices; log frame values during transition |
| Tilt-based auto-exit | Must distinguish user-tilt from programmatic rotation in `viewWillTransition` | Use a flag (`isExitingFullscreenProgrammatically`) set before calling `setCustomFullscreen(false)` |
| Status bar conditional logic | Changing `prefersStatusBarHidden` from unconditional to conditional; child VC may be ignored | Fallback: use `StatusBar` Capacitor plugin from JS (already used by WKWebView player) |
| AppDelegate mask change | Changing `.landscape` to `.allButUpsideDown` affects both players | Test WKWebView fullscreen still works; the WKWebView uses CSS rotation (device stays portrait) so the mask change should be irrelevant to it |

### Accepted Risks

| Risk | Acceptance Rationale |
|---|---|
| iOS 15 users must manually rotate | <2% of users; WKWebView player has same limitation; no reasonable fix |
| Rotation lock overrides our request | System-level user preference; we still expand the frame so video is usable |
| Stale inline frame on exit | Pre-existing issue — `updateFrame()` ignores JS frame updates during fullscreen; not a regression |
| Brief `playerLayer` resize flash | `viewDidLayoutSubviews` fires after frame change; sub-frame timing is unavoidable but imperceptible in practice |

---

## Escalation Conditions

Since this is a small team, these are self-assessment checkpoints:

| Condition | Action |
|---|---|
| `viewWillTransition` not being called on the child VC | This is the critical risk. If UIKit doesn't forward this to child VCs, the entire approach fails. Fallback: observe `UIDevice.orientationDidChangeNotification` instead. Stop and reassess approach after 2 hours. |
| Frame is wrong after rotation (video doesn't fill screen or is offset) | Log `view.bounds`, `parent.view.bounds`, `window.bounds` at each lifecycle point. Usually a timing issue — ensure frame is set inside the coordinator's `animate(alongsideTransition:)` block. Don't manually set `playerLayer.frame` — let `viewDidLayoutSubviews` handle it. |
| Status bar won't hide/show correctly | `prefersStatusBarHidden` is queried on the **parent** VC, not the child. May need `childForStatusBarHidden` override in `CustomBridgeViewController`. Or fall back to `StatusBar` Capacitor plugin from JS. Stop and reassess after 1 hour. |
| Orientation doesn't change at all | Verify `AppDelegate.isCustomFullscreenActive` is being set. Verify `supportedInterfaceOrientationsFor` returns `.allButUpsideDown`. Check that `setNeedsUpdateOfSupportedInterfaceOrientations()` and `requestGeometryUpdate` are called. |
| PiP or drag-to-dismiss breaks after changes | Likely a state conflict — `isFullscreen` flag not being reset correctly. Revert and isolate the issue. |
| WKWebView player fullscreen breaks after mask change | The WKWebView player uses CSS rotation (device stays portrait), so `.allButUpsideDown` vs `.landscape` should be irrelevant. If it IS affected, add a `source` parameter to `setCustomFullscreen()` to differentiate which player triggered it, and only use `.allButUpsideDown` for the native player. |
| App stuck in landscape after close/crash | `close()` safety guard (item 9) should prevent this. If it still happens, also add orientation reset in `deinit`. |

---

## Verification Steps

### Build Verification (Xcode)

Before testing on device, verify:
- [ ] Project compiles with no errors
- [ ] No new warnings in `HarmonyPlayerViewController.swift`

### Core Flow Testing (Physical Device Required)

**Test 1 — Basic enter/exit fullscreen:**
1. Open a video → native player appears inline
2. Tap fullscreen button
3. **Verify:** Device rotates to landscape, video fills screen, status bar hidden
4. Tap fullscreen button again
5. **Verify:** Device rotates to portrait, video returns to inline, status bar restored

**Test 2 — Tilt-based auto-exit:**
1. Enter fullscreen via button (device in landscape)
2. Physically rotate phone to portrait (don't tap button)
3. **Verify:** Fullscreen exits automatically, inline position restored, orientation locked back to portrait

**Test 3 — Playback continuity:**
1. Play video, note current time
2. Enter fullscreen
3. **Verify:** Playback continues without interruption, no audio glitch
4. Exit fullscreen
5. **Verify:** Playback continues, time didn't jump

**Test 4 — Video gravity:**
1. Enter fullscreen with a non-16:9 video (if available) or any video
2. **Verify:** Full video frame visible (letterboxed if needed), no cropping
3. Exit fullscreen
4. **Verify:** Video fills inline view edge-to-edge again

**Test 5 — Status bar (inline mode):**
1. Open a video in inline mode (NOT fullscreen)
2. **Verify:** Status bar is VISIBLE (fixes current bug where it's always hidden)
3. Enter fullscreen
4. **Verify:** Status bar hidden
5. Exit fullscreen
6. **Verify:** Status bar visible again

**Test 5b — PiP button visibility:**
1. Open a video in inline mode
2. **Verify:** Chevron-down button (top-left) is VISIBLE
3. Enter fullscreen
4. **Verify:** Chevron-down button is HIDDEN (not shown in controls overlay)
5. Exit fullscreen
6. **Verify:** Chevron-down button is VISIBLE again

**Test 5c — Swipe-to-PiP disabled in fullscreen:**
1. Enter fullscreen
2. Attempt to swipe down (drag-to-dismiss gesture)
3. **Verify:** Gesture does NOT trigger PiP mode (gesture is ignored)
4. Exit fullscreen
5. Swipe down from inline mode
6. **Verify:** Gesture works correctly and enters PiP mode

**Test 5d — System gestures in fullscreen:**
1. Enter fullscreen
2. Access Control Center using the standard iOS system gesture
3. **Verify:** Control Center opens
4. Dismiss Control Center
5. Access Notification Center using the standard iOS system gesture
6. **Verify:** Notification Center opens

### Edge Case Testing

**Test 6 — PiP → Fullscreen interaction:**
1. Enter PiP mode (chevron down)
2. Tap PiP to expand back to inline
3. Enter fullscreen
4. **Verify:** Works correctly, no state corruption

**Test 7 — Orientation cleanup on close:**
1. Enter fullscreen (device in landscape)
2. Programmatically call `close()` (or trigger it from JS)
3. **Verify:** App returns to portrait (not stuck in landscape)
4. **Verify:** Player is fully torn down, no zombie state

**Test 8 — Rotation lock:**
1. Enable rotation lock on device (Control Center)
2. Tap fullscreen button
3. **Verify:** Frame expands but device may not rotate (this is acceptable)
4. Disable rotation lock
5. **Verify:** Tap fullscreen again — now rotates correctly

**Test 9 — Rapid toggle:**
1. Rapidly tap fullscreen button 5+ times
2. **Verify:** No crash, no stuck state, settles correctly

**Test 10 — Background during fullscreen:**
1. Enter fullscreen, video playing
2. Press Home button (app backgrounds)
3. Return to app
4. **Verify:** Fullscreen state preserved, orientation correct, playback resumes

**Test 11 — WKWebView player unaffected by mask change:**
1. Switch to WKWebView player path (non-native, e.g., test on web or disable native player)
2. Enter WKWebView custom fullscreen
3. **Verify:** CSS rotation still works correctly, no unwanted device rotation
4. Exit WKWebView fullscreen
5. **Verify:** Returns to normal correctly

### Regression Checks

- [ ] Inline playback (no fullscreen) still works correctly
- [ ] Custom PiP mode still works (enter/exit/drag/snap)
- [ ] Native PiP (system PiP) still works
- [ ] Drag-to-dismiss still works from inline mode
- [ ] Quality selection menu still works
- [ ] AirPlay still works
- [ ] Lock screen controls still work
- [ ] Close button still works from inline mode
- [ ] Content switching still works
- [ ] WKWebView fullscreen still works (CSS rotation, not affected by mask change)

---

## Activation / Revalidation

### Activation

1. **TestFlight build** — Ship the change in a TestFlight beta. Native changes require a rebuild — there's no way to gradually roll this out to a percentage of users without a server-side feature flag (not worth building for this).
2. **Verify on TestFlight** — Run through all verification steps on a physical device.
3. **Release** — Submit to App Store.

### Revalidation Triggers

| Trigger | Action |
|---|---|
| New iOS version (e.g., iOS 19) | Re-run core flow tests. Orientation APIs have historically changed between versions. |
| Capacitor version upgrade | Verify `CustomBridgeViewController` still exists and still checks `AppDelegate.isCustomFullscreenActive`. |
| Changes to `AppDelegate.swift` orientation logic | Re-run all verification steps including WKWebView compatibility (Test 11). |
| Changes to `HarmonyPlayerViewController` frame/layout logic | Re-run core flow + edge case tests. |
| User reports of stuck orientation or wrong layout after fullscreen | Reproduce, check logs for frame values, fix and re-verify. |

---

## Appendix

### A. Files Involved

| File | Change Scope |
|---|---|
| `ios/App/App/HarmonyPlayerViewController.swift` | **Modified** — `enterFullscreen()`, `exitFullscreen()`, new `viewWillTransition`, conditional `prefersStatusBarHidden`, `videoGravity` switch, `close()` safety guard |
| `ios/App/App/HarmonyPlayerControlsView.swift` | **Modified** — Hide chevron-down button when `state.isFullscreen == true` |
| `ios/App/App/AppDelegate.swift` | **Modified** — Change `.landscape` to `.allButUpsideDown` in `supportedInterfaceOrientationsFor` when `isCustomFullscreenActive == true` |
| `ios/App/App/CustomBridgeViewController.swift` | **No change** — already checks `isCustomFullscreenActive` for orientation |
| `ios/App/App/HarmonyPlayerPlugin.swift` | **No change** — `enterFullscreen`/`exitFullscreen` already call the VC methods |
| `lib/hooks/useNativePlayer.ts` | **No change** — already exposes `enterFullscreen`/`exitFullscreen` |
| `app/components/video-modal.tsx` | **No change** — already listens for `fullscreenChange` events |

### B. Orientation Control Chain

```
User taps fullscreen
  → HarmonyPlayerControlsView.onFullscreenToggle()
    → HarmonyPlayerViewController.enterFullscreen()
      → stores inlineFrame
      → AppDelegate.setCustomFullscreen(true)
        → isCustomFullscreenActive = true
        → supportedInterfaceOrientationsFor → .allButUpsideDown
        → CustomBridgeViewController.setNeedsUpdateOfSupportedInterfaceOrientations()
        → windowScene.requestGeometryUpdate(.landscape)   [iOS 16+]
          → iOS rotates the window scene to landscape
            → CustomBridgeViewController.viewWillTransition(to: landscapeSize)
              → HarmonyPlayerViewController.viewWillTransition(to: landscapeSize)
                → coordinator.animate {
                    view.frame = parent.view.bounds (landscape)
                  }
                → viewDidLayoutSubviews() auto-syncs playerLayer.frame
                → playerLayer.videoGravity = .resizeAspect
                → playerState.isFullscreen = true
                → onFullscreenChange?(true)
                  → HarmonyPlayerPlugin notifies JS "fullscreenChange"
                    → video-modal.tsx updates isPlayerFullscreen state
```

**Tilt-to-exit flow:**
```
User physically rotates phone to portrait (while fullscreen)
  → iOS detects portrait orientation (allowed because mask is .allButUpsideDown)
    → CustomBridgeViewController.viewWillTransition(to: portraitSize)
      → HarmonyPlayerViewController.viewWillTransition(to: portraitSize)
        → detects: portraitSize AND playerState.isFullscreen == true
        → calls exitFullscreen()
          → AppDelegate.setCustomFullscreen(false)
            → supportedInterfaceOrientationsFor → .portrait
          → coordinator.animate {
              view.frame = inlineFrame
            }
          → viewDidLayoutSubviews() auto-syncs playerLayer.frame
          → playerLayer.videoGravity = .resizeAspectFill
          → playerState.isFullscreen = false
          → onFullscreenChange?(false)
```

### C. Key Gotcha: Child VC Orientation

```swift
// This override on HarmonyPlayerViewController has NO EFFECT:
override var supportedInterfaceOrientations: UIInterfaceOrientationMask {
    return .all  // ← UIKit never queries this on child VCs
}

// Orientation is actually controlled by:
// 1. AppDelegate.application(_:supportedInterfaceOrientationsFor:)
// 2. CustomBridgeViewController.supportedInterfaceOrientations (queries AppDelegate flag)
```

### D. `viewWillTransition` Forwarding

UIKit automatically forwards `viewWillTransition(to:with:)` to child view controllers. This is documented Apple behavior:

> "UIKit sends this message to the root view controller, and then it flows down through the view controller hierarchy." — Apple Documentation

Verified: child VCs added via `addChild` / `addSubview` / `didMove(toParent:)` do receive `viewWillTransition`. If this ever stops working, fallback is `NotificationCenter.default.addObserver` for `UIDevice.orientationDidChangeNotification`.

### E. Status Bar Forwarding

`prefersStatusBarHidden` is queried on the **topmost** view controller that controls status bar appearance. For child VCs, the parent must opt in:

```swift
// In CustomBridgeViewController (or its parent):
override var childForStatusBarHidden: UIViewController? {
    return children.last // Forward to the topmost child (our player)
}
```

If `CustomBridgeViewController` doesn't override `childForStatusBarHidden`, our `prefersStatusBarHidden` override will be ignored. In that case, we'd need to add this one-line override to `CustomBridgeViewController.swift`.

**Alternatively**, we can use the `StatusBar` Capacitor plugin from JavaScript (already used by `mux-video-player.tsx` lines 326-328) to hide/show the status bar via `StatusBar.hide()` / `StatusBar.show()`. This would mean the JS side handles status bar based on the `fullscreenChange` event. This avoids any native status bar forwarding complexity.

### F. Why `.allButUpsideDown` Instead of `.landscape`

The current AppDelegate code:
```swift
func application(_ application: UIApplication,
                supportedInterfaceOrientationsFor window: UIWindow?) -> UIInterfaceOrientationMask {
    if isCustomFullscreenActive {
        return .landscape  // ← PROBLEM: iOS won't allow portrait rotation
    }
    return .portrait
}
```

With `.landscape`, iOS locks the device to landscape only. The user **cannot** rotate back to portrait — `viewWillTransition` will never fire with a portrait size. Tilt-to-exit is impossible.

The fix:
```swift
if isCustomFullscreenActive {
    return .allButUpsideDown  // Allow landscape AND portrait while fullscreen
}
```

This works because:
- `requestGeometryUpdate(.landscape)` still forces the initial rotation to landscape
- Once in landscape, the user can physically rotate to portrait
- `viewWillTransition` fires with portrait size → we detect it and exit fullscreen
- On exit, `setCustomFullscreen(false)` locks back to `.portrait`

**WKWebView impact:** The WKWebView player calls `setCustomFullscreen(true)` but uses CSS rotation — the device stays in portrait and the video is visually rotated via CSS transforms. The AppDelegate mask doesn't matter for the WKWebView player because it never triggers actual iOS orientation changes. Changing to `.allButUpsideDown` should be harmless, but Test 11 verifies this.

### G. `preferredScreenEdgesDeferringSystemGestures` — Clarification

Do NOT override this property. It does the **opposite** of what you might expect:

```swift
// WRONG — this makes system gestures HARDER to access:
override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge {
    return .all  // ← App gestures take priority, system needs second swipe
}

// CORRECT — leave at default (empty), system gestures work on first swipe
// (don't override at all)
```

The default behavior (no override) already allows Control Center and Notification Center on first swipe.

### H. Estimated Scope

| Item | Est. Lines Changed |
|---|---|
| `enterFullscreen()` — add AppDelegate call, store state | ~10 lines |
| `exitFullscreen()` — add AppDelegate call, restore state | ~10 lines |
| `viewWillTransition(to:with:)` — new override | ~25 lines |
| `close()` — safety guard to reset orientation | ~5 lines |
| `prefersStatusBarHidden` — make conditional | ~3 lines |
| `videoGravity` toggling | ~5 lines |
| Tilt-to-exit detection in `viewWillTransition` | ~5 lines |
| `HarmonyPlayerControlsView` — hide chevron button when fullscreen | ~3 lines |
| `AppDelegate` — `.landscape` → `.allButUpsideDown` | ~1 line |
| **Total** | **~70 lines of Swift** |

No JavaScript changes. No plugin changes. No Capacitor sync needed. Requires an iOS app rebuild and TestFlight submission.
