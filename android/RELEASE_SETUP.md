# Android Release Build Setup

This guide explains how to set up signing for Android release builds to upload to Google Play Store.

## Prerequisites

- Android Studio installed
- Java JDK 17 or higher installed
- Google Play Console account ($25 one-time registration fee)

## Step 1: Create Signing Keystore

You need to create a keystore file to sign your release builds. This is a **one-time setup** that you'll use for all future updates.

### Option A: Using keytool (Command Line)

Run this command in your terminal (from project root or android directory):

```bash
keytool -genkey -v -keystore android/harmony-release-key.jks -keyalg RSA -keysize 2048 -validity 10000 -alias harmony-key
```

You'll be prompted for:
- **Keystore password**: Choose a strong password (save this securely!)
- **Key password**: Can be same as keystore password (save this securely!)
- **Name, Organization, City, State, Country**: Enter your information

### Option B: Using Android Studio

1. Open Android Studio
2. Build → Generate Signed Bundle / APK
3. Choose "Android App Bundle"
4. Click "Create new..." to create a new keystore
5. Fill in the keystore information
6. Save the keystore file as `android/harmony-release-key.jks`

### Alternative Location

You can also store the keystore in the `certificates/` directory (matching iOS pattern):
- `certificates/android-release-key.jks`

If you do this, update the `storeFile` path in `keystore.properties` accordingly.

## Step 2: Configure Signing Properties

1. Copy the example file:
   ```bash
   cp android/keystore.properties.example android/keystore.properties
   ```

2. Edit `android/keystore.properties` and fill in your actual values:
   ```properties
   storeFile=harmony-release-key.jks
   storePassword=your_actual_keystore_password
   keyAlias=harmony-key
   keyPassword=your_actual_key_password
   ```

   **Important**: 
   - If keystore is in `certificates/`, use: `storeFile=../../certificates/android-release-key.jks`
   - Never commit `keystore.properties` to git (it's already in `.gitignore`)

## Step 3: Verify Configuration

The `android/app/build.gradle` file is already configured to:
- Load `keystore.properties` if it exists
- Fall back to environment variables if properties file is missing
- Use default paths if neither is available

## Step 4: Build Release AAB

### Automated Build (Recommended)

Run the build script which handles everything automatically:

```bash
npm run package:android
```

This script will:
1. Check production mode configuration
2. Sync Capacitor
3. Increment version numbers (syncs with iOS)
4. Build release AAB
5. Save to `dist/android/{version}/app-release.aab`

### Manual Build

If you prefer to build manually:

1. Open Android Studio:
   ```bash
   npm run cap:open:android
   ```

2. In Android Studio:
   - Build → Generate Signed Bundle / APK
   - Choose "Android App Bundle"
   - Select your keystore file
   - Enter passwords
   - Build variant: `release`
   - Click "Create"

3. Find the AAB at: `android/app/build/outputs/bundle/release/app-release.aab`

## Step 5: Upload to Google Play Console

1. Go to [Google Play Console](https://play.google.com/console)
2. Navigate to: **Testing → Internal testing → Create new release**
3. Upload the AAB file from `dist/android/{version}/app-release.aab`
4. Add release notes
5. Review and start rollout to internal testing

## Security Best Practices

1. **Backup your keystore**: Store it securely (password manager, encrypted backup)
2. **Never commit keystore to git**: It's already in `.gitignore`
3. **Never share keystore passwords**: Keep them secure
4. **Use the same keystore for all updates**: Required by Google Play

## Troubleshooting

### "Keystore file not found"
- Verify the path in `keystore.properties` is correct
- Check if keystore file exists at the specified location
- Use absolute path if relative path doesn't work

### "Password incorrect"
- Double-check passwords in `keystore.properties`
- Ensure no extra spaces or special characters

### "Version code already used"
- The build script automatically increments version codes
- If building manually, increment `versionCode` in `android/app/build.gradle`

## Version Management

The build script automatically:
- Reads current version from both iOS and Android
- Uses the highest version as base
- Increments and syncs both platforms
- Ensures consistent versioning across platforms

Current version: Check `versionCode` in `android/app/build.gradle`

## Next Steps

After successful upload:
1. Add testers to internal testing track
2. Share opt-in link with testers
3. Test the app thoroughly
4. Move to closed testing (up to 1,000 testers) when ready
5. Promote to production after thorough testing

## Reference Links

- [Google Play Console](https://play.google.com/console)
- [Android App Bundle Guide](https://developer.android.com/guide/app-bundle)
- [Sign Your App](https://developer.android.com/studio/publish/app-signing)
