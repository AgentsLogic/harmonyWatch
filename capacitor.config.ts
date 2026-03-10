import type { CapacitorConfig } from '@capacitor/cli';

// Determine if we're in development mode
const isDev = process.env.NODE_ENV === 'development' || process.env.CAPACITOR_DEV === 'true';

// Get local IP address (default to configured IP, can be overridden via env var)
const localIp = process.env.CAPACITOR_LOCAL_IP || '192.168.1.186';
const localPort = process.env.CAPACITOR_LOCAL_PORT || '3000';

// Development URLs
// iOS Simulator can use localhost directly
// Physical devices and Android emulator need the actual IP
const devUrl = `http://${localIp}:${localPort}`;

// Production URL
const prodUrl = 'https://www.harmony.watch/';

const config: CapacitorConfig = {
  appId: 'com.harmonywatch.app',
  appName: 'Harmony',
  server: {
    // Use local dev URL (for iOS development)
    url: devUrl,
    cleartext: true // Allow HTTP for local development
  },
  ios: {
    scheme: 'app',
    contentInset: 'automatic',
    webContentsDebuggingEnabled: true
  },
  android: {
    // Android-specific configuration
    allowMixedContent: isDev, // Allow mixed content in development
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500, // Show our custom splash.png for 1.5 seconds
      launchAutoHide: true,
      backgroundColor: '#000000',
      showSpinner: false,
      androidSplashResourceName: 'splash', // Use our custom splash.png drawable
      androidScaleType: 'CENTER_CROP' // Scale type for splash image
    },
    StatusBar: {
      style: 'dark',
      backgroundColor: '#000000'
    },
    SignInWithApple: {
      clientId: 'com.harmonywatch.app.web',
      scopes: ['email', 'name']
    }
  }
};

export default config;

