# iOS QA Checklist (VoltBuilder Package)

Use this checklist when validating HarmonyWatch builds produced by VoltBuilder.

## Pre-flight
- [ ] Install `.ipa` on at least one iPhone running the current iOS release and one version back.
- [ ] Confirm background audio entitlement is present (`Settings → General → Background App Refresh` lists the app).
- [ ] Ensure Supabase endpoints respond over mobile data and Wi‑Fi.

## First Launch
- [ ] Splash screen displays while WebView loads.
- [ ] Home screen renders with hero carousel and shelves.
- [ ] Authentication flows (login, signup, reset password) succeed.

## Audio Playback
- [ ] Start an audio episode; verify play/pause, seek, and progress restore.
- [ ] Lock device while audio plays; track continues and lock screen shows controls.
- [ ] Pause from lock screen and resume via lock screen and Control Center.
- [ ] Disconnect and reconnect headphones; playback resumes without app crash.
- [ ] Connect to AirPlay / Bluetooth speaker and confirm output switches correctly.

## Video Playback
- [ ] Launch video from modal; Harmony loading overlay persists until playback begins.
- [ ] Enter/exit full screen, scrub timeline, and test PiP if enabled.
- [ ] Resume playback after backgrounding for 5+ minutes.

## Network & Persistence
- [ ] Toggle airplane mode while in playback; confirm offline messaging and graceful recovery.
- [ ] Verify progress sync after relaunch (play, exit, relaunch, resume).
- [ ] Confirm Supabase auth session persists across relaunches.

## Device Integrations
- [ ] Test deep links (if configured) via `app://` or universal link to resume playback.
- [ ] Verify push notification registration (if enabled) does not error.
- [ ] Confirm background fetch does not break UI when app returns to foreground.

## Regression Sweep
- [ ] Admin dashboard accessible and responsive.
- [ ] Video/audio uploads still work when device connects over USB (for devs).
- [ ] No console errors in Safari remote debugger.

## Sign-off
- [ ] Capture screenshots for App Store if UI changed.
- [ ] Archive device logs for the release ticket.

