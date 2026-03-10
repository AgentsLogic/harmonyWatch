# HarmonyWatch V1 - Project Summary & Development History

## 🎯 Project Overview

**HarmonyWatch V1** is a Next.js-based video streaming platform similar to Netflix, built with modern web technologies and following best practices for performance, security, and maintainability.

### 🏗️ Tech Stack
- **Framework**: Next.js 15 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **Video Hosting**: Mux Video (migrated from Cloudflare Stream)
- **UI Components**: Custom components with modern design patterns
- **Native App**: Capacitor 7 with VoltBuilder cloud builds
- **Deployment**: Git Actions with automated CI/CD (web), VoltBuilder (iOS native)

## 📁 Project Structure

```
HarmonyWatchV1/
├── app/
│   ├── admin/                    # Admin dashboard
│   ├── api/                      # API routes
│   │   ├── upload/video-mux/     # Mux video upload
│   │   ├── webhooks/mux/         # Mux webhook handler
│   │   └── playback/progress/    # Audio progress tracking
│   ├── components/
│   │   ├── admin/                # Admin-specific components
│   │   │   ├── video-upload-dropzone.tsx
│   │   │   ├── audio-upload-dropzone.tsx
│   │   │   └── content-list.tsx
│   │   ├── audio-player.tsx      # Custom audio player
│   │   ├── mux-video-player.tsx  # Mux video player
│   │   ├── main-scroll-container.tsx  # Scroll container for iOS
│   │   └── hero-carousel.tsx     # Hero carousel with parallax
│   └── page.tsx                  # Homepage
├── lib/
│   ├── config.ts                 # Hardcoded config (Turbopack compatibility)
│   ├── services/mux-video.ts     # Mux API service
│   ├── hooks/useContentItems.ts  # Content management hooks
│   └── database.types.ts         # TypeScript database types
├── ios/                          # iOS native project (Capacitor)
│   └── App/App/AppDelegate.swift # iOS app delegate with WKWebView config
└── public/images/                # Static assets
```

## 🔄 Major Migration: Cloudflare Stream → Mux Video

### Why We Migrated
- **Loading Issues**: Cloudflare Stream had persistent "loading video" flash and restart problems
- **Better Integration**: Mux provides better React components and developer experience
- **Performance**: Mux's direct upload and webhook system is more reliable
- **Cost**: User already had Mux account with sufficient quota

### Migration Implementation
1. **Installed Mux Dependencies**:
   - `@mux/mux-node` - Server-side SDK
   - `@mux/mux-uploader-react` - React upload component
   - `@mux/mux-uploader` - Web component

2. **Created Mux Service** (`lib/services/mux-video.ts`):
   - Direct upload creation
   - Asset status tracking
   - Webhook integration

3. **Updated Database Schema**:
   ```sql
   ALTER TABLE content_items
   ADD COLUMN mux_asset_id TEXT,
   ADD COLUMN mux_playback_id TEXT,
   ADD COLUMN mux_upload_id TEXT,
   ADD COLUMN mux_thumbnail_url TEXT;
   ```

4. **Replaced Video Upload Component**:
   - Removed custom drag & drop implementation
   - Integrated `MuxUploader` React component
   - Added proper asset status polling

## 🎬 Video Upload Flow (Current Implementation)

### 1. Upload Process
1. User drags video to `VideoUploadDropzone`
2. Component fetches upload URL from `/api/upload/video-mux`
3. `MuxUploader` handles direct upload to Mux CDN
4. Upload completes → Shows "Processing video..." state
5. Polling checks asset status every 10 seconds
6. When ready → Calls `onUploadComplete` with asset details

### 2. Key Components
- **`VideoUploadDropzone`**: Handles Mux upload integration
- **`/api/upload/video-mux`**: Creates direct upload URLs
- **`/api/webhooks/mux`**: Receives Mux processing updates
- **Asset Status Polling**: Checks when video is ready for playback

## 🎵 Audio Player (Custom Implementation)

### Features
- **Progress Tracking**: Saves/loads playback position
- **Custom Controls**: Play, pause, seek, volume
- **Database Integration**: Stores progress in `playback_progress` table
- **API Endpoint**: `/api/playback/progress` for progress management

### Why Custom vs Mux
- Audio files are smaller and don't need Mux's video processing
- Custom player provides better control over progress tracking
- Simpler implementation for audio-only content

## 🖼️ Thumbnail Management

### Drag & Drop Implementation
- **Content Thumbnails**: Drag & drop for both add and edit modes
- **Series Thumbnails**: Drag & drop for series creation
- **Visual Feedback**: Border changes color on drag over
- **File Validation**: Only accepts image files

### Key Fixes Applied
- Added `pointer-events-none` to child elements
- Proper event propagation handling
- Separate handlers for different form states

## 🗄️ Database Schema

### Core Tables
- **`content_items`**: Main content storage
- **`series`**: Series/collections
- **`categories`**: Content categorization
- **`playback_progress`**: Audio progress tracking

### Content Items Fields
```typescript
interface ContentItem {
  // Basic fields
  id: string;
  title: string;
  description: string;
  content_type: 'video' | 'audio';
  
  // Legacy Cloudflare fields (backward compatibility)
  cloudflare_stream_id: string | null;
  stream_thumbnail_url: string | null;
  stream_playback_url: string | null;
  
  // New Mux fields
  mux_asset_id: string | null;
  mux_playback_id: string | null;
  mux_upload_id: string | null;
  mux_thumbnail_url: string | null;
  
  // Status tracking
  stream_status: 'pending' | 'processing' | 'ready' | 'failed';
}
```

## 🔧 Configuration & Environment

### Hardcoded Configuration (`lib/config.ts`)
Due to Turbopack environment variable loading issues, we use hardcoded config:

```typescript
export const supabaseConfig = {
  url: "https://qwcunnnhwbewjhqoddec.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  serviceRoleKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
};

export const muxConfig = {
  tokenId: "afc0f633-a8bd-4aee-81bf-a4079c32e1ca",
  tokenSecret: "Hnirn8r6kr/6TZ0QXYygiQv5McbJY2PCaFq16f+z8zj32m6VU4aGGYdWM+lGKvNdbF7HWGUGOfP"
};
```

## 📱 Native App Integration: Capacitor + VoltBuilder

### Overview
The app is wrapped as a native iOS app using Capacitor 7 and built via VoltBuilder cloud service. The app uses remote URL mode, loading content from `https://www.harmony.watch/` rather than bundling web assets.

### Capacitor Configuration

**File**: `capacitor.config.ts`
- **App ID**: `com.harmonywatch.app`
- **App Name**: `Harmony`
- **Remote URL**: `https://www.harmony.watch/` (server.url mode)
- **iOS Settings**: 
  - Scheme: `app`
  - Content inset: `automatic`
- **Plugins**: SplashScreen, StatusBar configured

### VoltBuilder Configuration

**File**: `voltbuilder.json`
- **Platform**: iOS
- **Package Type**: `app-store`
- **Signing**: Certificates configured via paths in `certificates/` directory
- **App Store Connect**: Credentials configured for automatic upload
- **Environment Variables**: Supabase URL and keys included

### Build Scripts

**Available Commands**:
- `npm run build:capacitor` - Syncs Capacitor configuration (`scripts/export-to-capacitor.mjs`)
- `npm run cap:sync` - Syncs web assets to native projects
- `npm run cap:open` - Opens project in Xcode (if available)
- `npm run package:volt:capacitor` - Creates VoltBuilder zip package (`scripts/package-volt-capacitor.mjs`)

### Packaging Process

**Script**: `scripts/package-volt-capacitor.mjs`
1. Ensures iOS project is synced
2. Auto-increments `CFBundleVersion` in Xcode project (prevents App Store Connect errors)
3. Creates zip archive with:
   - `ios/` - Complete iOS project structure
   - `capacitor.config.json` - Copied from iOS project to root
   - `package.json` - Dependencies
   - `voltbuilder.json` - Build configuration
   - `certificates/` - Signing certificates (`.p12` and `.mobileprovision` files)
   - `app/`, `lib/`, `public/` - Source files (needed for `npm install` and `npm run build`)
   - `next.config.ts`, `tsconfig.json`, `postcss.config.mjs` - Configuration files
4. Outputs to `dist/capacitor-project.zip`

### iOS Native Configuration

**File**: `ios/App/App/AppDelegate.swift`
- **WKWebView Configuration**: Scroll view disabled (`isScrollEnabled = false`) to prevent overscroll
- **Bouncing Disabled**: `bounces = false`, `alwaysBounceVertical = false`
- **Content Insets**: Set to zero to prevent extra space
- **Zoom Disabled**: Prevents pinch-to-zoom gestures
- **Scroll View Delegate**: Safety net to lock scroll position at 0,0

### VoltBuilder Workflow

1. **Local**: Run `npm run package:volt:capacitor` to create zip
2. **VoltBuilder UI**: Upload `dist/capacitor-project.zip` to dashboard
3. **VoltBuilder UI**: Configure signing certificates and App Store Connect (if not in zip)
4. **VoltBuilder**: Automatically builds and uploads to App Store Connect

### Important Notes

- **Remote URL Mode**: App loads from `https://www.harmony.watch/` - no local web assets needed
- **Source Files Required**: Even with remote URL, VoltBuilder needs source files for `npm install` and `npm run build`
- **Bundle Version**: Auto-incremented on each package to prevent App Store Connect errors
- **Certificates**: Stored in `certificates/` directory (excluded from git via `.gitignore`)

### Android Support (Future)

Adding Android is straightforward:
1. Run `npx cap add android`
2. Update `voltbuilder.json` with Android signing config
3. Update packaging script to include `android/` directory
4. Upload to VoltBuilder with Android platform selected

### Key Files

- `capacitor.config.ts` - Capacitor configuration (remote URL mode)
- `voltbuilder.json` - VoltBuilder build configuration
- `scripts/export-to-capacitor.mjs` - Sync script
- `scripts/package-volt-capacitor.mjs` - Packaging script with auto-increment
- `ios/App/App/AppDelegate.swift` - iOS app configuration
- `certificates/` - Signing certificates (not in git)

### References
- [Capacitor Documentation](https://capacitorjs.com/docs)
- [VoltBuilder Capacitor Setup](https://volt.build/docs/set_up-capacitor/)
- [VoltBuilder iOS App Store](https://volt.build/docs/apple_appstore/)

## 🎨 Scroll Architecture (iOS Optimization)

### Problem
WKWebView on iOS has native overscroll behavior that causes the webview container itself to move, even when content is fixed. This breaks fixed positioning and creates unwanted visual effects.

### Solution: Scroll Container Architecture

**Approach**: Disable WKWebView scroll view and use a custom scroll container (similar to how modals work).

#### Implementation

1. **WKWebView Scroll Disabled** (`ios/App/App/AppDelegate.swift`):
   - `scrollView.isScrollEnabled = false` - Prevents container from scrolling
   - `bounces = false` - Disables bounce (though we allow bounce in the container)
   - Content insets set to zero

2. **Main Scroll Container** (`app/components/main-scroll-container.tsx`):
   - Fixed position container with `overflow-y-auto`
   - Handles all scrolling internally
   - Syncs `window.scrollY` for backward compatibility
   - Uses `overscroll-behavior: auto` and `-webkit-overflow-scrolling: touch` for bounce

3. **CSS Configuration** (`app/globals.css`):
   - `html` and `body` locked to `height: 100vh` with `overflow: hidden`
   - Scroll container uses `overscroll-behavior: auto` for bounce
   - `-webkit-overflow-scrolling: touch` for momentum scrolling

#### Benefits

- ✅ WKWebView container never moves (prevents overscroll)
- ✅ Fixed elements (header, test box) stay truly fixed
- ✅ Bounce scrolling enabled in scroll container
- ✅ Backward compatible with `window.scrollY` usage
- ✅ Parallax effects work correctly (hero carousel matches content modal)

#### Components Using This Architecture

- **Main Content**: Wrapped in `MainScrollContainer`
- **Modals**: Use their own scroll containers (already working)
- **Hero Carousel**: Parallax tracks scroll container scrollTop
- **Top Banner**: Uses `window.scrollY` (synced from container)

### Key Files

- `app/components/main-scroll-container.tsx` - Main scroll container
- `app/layout.tsx` - Wraps content in scroll container
- `app/globals.css` - CSS for scroll architecture
- `ios/App/App/AppDelegate.swift` - WKWebView configuration

## 🐛 Major Issues Resolved

### 1. Video Upload Processing Loop
**Problem**: "Processing video..." state would loop infinitely
**Solution**: Implemented proper asset status polling with timeout handling

### 2. Thumbnail Drag & Drop
**Problem**: Drag and drop wasn't working for content thumbnails
**Solution**: Added proper event handlers and prevented child elements from blocking events

### 3. Database Schema Issues
**Problem**: Missing columns after git rollback
**Solution**: Created comprehensive migration script (`fix-missing-columns.sql`)

### 4. Environment Variable Loading
**Problem**: Turbopack not loading environment variables properly
**Solution**: Used hardcoded configuration in `lib/config.ts`

### 5. Mux Integration Issues
**Problem**: Upload ID extraction and asset status tracking
**Solution**: Proper URL parsing and polling implementation

### 6. iOS WKWebView Overscroll
**Problem**: WKWebView container scrolling causing fixed elements to move
**Solution**: Disabled WKWebView scroll view, implemented scroll container architecture

### 7. Hero Carousel Parallax
**Problem**: Parallax not working after scroll container implementation
**Solution**: Updated to track scroll container scrollTop directly (matches content modal approach)

## 🚀 Current Status

### ✅ Working Features
- **Video Upload**: Mux integration with drag & drop
- **Audio Upload**: Custom implementation with progress tracking
- **Thumbnail Management**: Drag & drop for all content types
- **Admin Dashboard**: Content and series management
- **Database Integration**: Full CRUD operations
- **Authentication**: Supabase auth integration
- **iOS Native App**: Capacitor + VoltBuilder integration
- **Scroll Architecture**: Optimized for iOS with bounce scrolling
- **Parallax Effects**: Hero carousel and content modals working

### 🔄 Recent Commits
- **Latest**: `2a5c19d` - Enable bounce scroll and fix hero carousel parallax
- **Previous**: `44a85d1` - Add main scroll container to prevent WKWebView overscroll
- **Previous**: `b47e522` - Disable WKWebView scroll view

## 📋 Pending Tasks

### High Priority
- [ ] Set up Mux webhooks for real-time processing updates
- [ ] Test complete video playback flow end-to-end
- [ ] Optimize performance for large video files

### Medium Priority
- [ ] Add getSeriesWithContent method to seriesService
- [ ] Update getSeriesContent in useContentItems hook
- [ ] Test modal opening speed for episodes

### Low Priority
- [ ] Add video analytics integration
- [ ] Implement content recommendations
- [ ] Add user profiles and watchlists
- [ ] Add Android support for native app

## 🎯 Development Guidelines

### Code Style
- Use TypeScript with strict typing
- Follow Next.js App Router patterns
- Implement proper error handling
- Use Tailwind CSS for styling
- Follow React best practices (hooks, functional components)

### Architecture Principles
- Server-side rendering where possible
- Client-side interactivity only when needed
- Proper separation of concerns
- Database-first approach with type safety
- API-first design for data operations

## 🔗 Key Files to Reference

### Core Components
- `app/components/admin/video-upload-dropzone.tsx` - Mux video upload
- `app/components/admin/content-list.tsx` - Content management
- `app/components/audio-player.tsx` - Custom audio player
- `app/components/main-scroll-container.tsx` - iOS scroll container
- `app/components/hero-carousel.tsx` - Hero carousel with parallax
- `lib/services/mux-video.ts` - Mux API integration

### Configuration
- `lib/config.ts` - Hardcoded configuration
- `lib/database.types.ts` - TypeScript types
- `fix-missing-columns.sql` - Database migration
- `capacitor.config.ts` - Capacitor configuration (remote URL mode)
- `voltbuilder.json` - VoltBuilder build configuration

### API Routes
- `app/api/upload/video-mux/route.ts` - Video upload
- `app/api/webhooks/mux/route.ts` - Webhook handler
- `app/api/playback/progress/route.ts` - Audio progress

### Native App Build Scripts
- `scripts/export-to-capacitor.mjs` - Syncs Capacitor configuration
- `scripts/package-volt-capacitor.mjs` - Creates VoltBuilder zip with auto-increment bundle version

## 📝 Notes for Future Development

1. **Mux Integration**: The app is fully migrated to Mux Video with proper upload and processing flow
2. **Database**: All necessary columns are in place for both Cloudflare (legacy) and Mux
3. **Authentication**: Supabase auth is working with hardcoded config
4. **Performance**: Drag & drop and video upload are optimized
5. **Error Handling**: Comprehensive error handling and user feedback implemented
6. **Native App**: iOS app integration complete with Capacitor and VoltBuilder, using remote URL mode
7. **Scroll Architecture**: Optimized for iOS with scroll container preventing WKWebView overscroll while maintaining bounce scrolling

This document should provide complete context for continuing development on HarmonyWatch V1.
