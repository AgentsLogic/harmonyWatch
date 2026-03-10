# Cordova Wrapper for HarmonyWatch

This directory contains the Cordova project that VoltBuilder packages into a native iOS binary. The web assets are generated from the Next.js app in the repository root.

## Workflow Overview

1. **Build web assets**
   ```bash
   CORDOVA_REMOTE_URL="https://www.harmony.watch/" npm run build:cordova
   ```
   This runs the standard Next.js production build and generates a bootstrap `www/index.html` that redirects the embedded WebView to the hosted HarmonyWatch app. By default the script targets `https://www.harmony.watch/`; override `CORDOVA_REMOTE_URL` if you need staging or preview builds.

2. **Configure signing**
   - Update `voltbuilder.json` with the correct Apple developer credentials.
   - Upload certificates and provisioning profiles to VoltBuilder or reference secure environment variables during CI.

3. **Add/Update plugins**
   - Edit `config.xml` to add the required Cordova plugins.
   - Run `npm install` inside `cordova/` if you need local CLI access.

4. **Package for VoltBuilder**
   ```bash
   npm run package:volt
   ```
   Creates `dist/cordova-project.zip`, which can be uploaded to VoltBuilder manually or through CI.

5. **Submit to VoltBuilder**
   - Use the VoltBuilder dashboard or REST API.
   - Download the resulting `.ipa` for device testing and App Store submission.

## Structure

```
cordova/
├── certificates/       # Signing assets (.p12 + .mobileprovision)
├── config.xml          # Cordova project metadata & platform preferences
├── package.json        # Cordova CLI dependencies (optional local use)
├── voltbuilder.json    # VoltBuilder build configuration template
├── www/                # Populated via `npm run build:cordova`
└── README.md           # This file
```

> **Note:** `cordova/www` is ignored from version control. Generate it each time before packaging.

