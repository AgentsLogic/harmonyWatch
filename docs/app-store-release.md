# App Store Release Checklist for HarmonyWatch (VoltBuilder Builds)

## Accounts & Certificates
- [ ] Apple Developer account renewed and active.
- [ ] Distribution certificate (`.p12`) exported and password recorded in secret manager.
- [ ] iOS distribution provisioning profile contains correct App ID, devices (for ad-hoc), and entitlements (`audio` background mode).
- [ ] App Store Connect user with `App Manager` role available for upload.

## Build Preparation
- [ ] Update `cordova/config.xml` version and build number (`widget@version` & `ios-CFBundleVersion` if added).
- [ ] Run `npm run build:cordova` to populate `cordova/www`.
- [ ] Run `npm run package:volt` to create `dist/cordova-project.zip`.
- [ ] Upload archive to VoltBuilder (dashboard or API) and trigger release build.
- [ ] Download signed `.ipa` and confirm bundle identifier, version, and entitlements using `ios-deploy --justlaunch`.

## App Store Metadata
- [ ] Update release notes in App Store Connect (`What’s New`).
- [ ] Refresh screenshots (6.7", 6.5", iPad, etc.) if UI changed.
- [ ] Verify privacy nutrition labels (Supabase analytics, Mux playback) still accurate.
- [ ] Provide contact info and support URL (`config.xml` author matches).
- [ ] Confirm App Store keywords and description are up to date.

## Upload & Review
- [ ] Use Transporter or Xcode Organizer to upload `.ipa`.
- [ ] Resolve any App Store validation issues (entitlements, icons, signing).
- [ ] Create release in App Store Connect: choose phased release or manual release.
- [ ] Attach compliance documentation if using encryption (USA export compliance).
- [ ] Submit for review and monitor Resolution Center for feedback.

## Post-Approval
- [ ] Schedule release (manual or automatic).
- [ ] Tag repository with release version (e.g., `ios/v1.0.0`).
- [ ] Update internal changelog and notify stakeholders.
- [ ] Monitor analytics/crash logs (App Store, Supabase, Mux) for first 48 hours.

