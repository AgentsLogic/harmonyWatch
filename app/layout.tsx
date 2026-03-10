import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import Script from "next/script";
import "./globals.css";
import TopBanner from "./components/top-banner";
import AudioPlayer from "./components/audio-player";
import { AudioPlayerProvider } from "./components/audio-player-provider";
import { UserProvider } from "./contexts/user-context";
import BodyPadding from "./components/body-padding";
import { PWAMetaTags } from "./components/pwa-meta-tags";
import MobileNav from "./components/mobile-nav";
import { ModalProvider } from "./contexts/modal-context";
import { ContentWrapper } from "./components/content-wrapper";
import { ModalRenderer } from "./components/modal-renderer";
import { SettingsModalRenderer } from "./components/settings-modal-renderer";
import { VideoModalRenderer } from "./components/video-modal-renderer";
import { SignupModalRenderer } from "./components/signup-modal-renderer";
import { LoginModalRenderer } from "./components/login-modal-renderer";
import { FooterContentModalRenderer } from "./components/footer-content-modal-renderer";
import { BugModalRenderer } from "./components/bug-modal-renderer";
import { SearchModalRenderer } from "./components/search-modal-renderer";
import { LoadingProvider } from "./contexts/loading-context";
import { VideoLoadingOverlay } from "./components/video-loading-overlay";
import { PipProvider } from "./contexts/pip-context";
import { CustomPipPlayer } from "./components/custom-pip-player";
import { BuildInfo } from "./components/build-info";
import { SwipeNavigation } from "./components/swipe-navigation";
import { PageCacheProvider } from "./contexts/page-cache-context";
import { PageCapture } from "./components/page-capture";
import { MainScrollContainer } from "./components/main-scroll-container";
import { PreventContextMenu } from "./components/prevent-context-menu";
import { DevAutoRefresh } from "./components/dev-auto-refresh";
import { QueryProvider } from "./providers/query-provider";
import { NiceneCreedComment } from "./components/nicene-creed-comment";
import { HideAndroidScrollbars } from "./components/hide-android-scrollbars";

// Jano Sans Pro local family
const janoSans = localFont({
  src: [
    { path: "../public/fonts/Jano Sans Pro Thin.otf", weight: "100", style: "normal" },
    { path: "../public/fonts/Jano Sans Pro ExtraLight.otf", weight: "200", style: "normal" },
    { path: "../public/fonts/Jano Sans Pro Light.otf", weight: "300", style: "normal" },
    { path: "../public/fonts/Jano Sans Pro Regular.otf", weight: "400", style: "normal" },
    { path: "../public/fonts/Jano Sans Pro Medium.otf", weight: "500", style: "normal" },
    { path: "../public/fonts/Jano Sans Pro SemiBold.otf", weight: "600", style: "normal" },
    { path: "../public/fonts/Jano Sans Pro Bold.otf", weight: "700", style: "normal" },
    { path: "../public/fonts/Jano Sans Pro Extrabold.otf", weight: "800", style: "normal" },
    { path: "../public/fonts/Jano Sans Pro Black.otf", weight: "900", style: "normal" },
    { path: "../public/fonts/Jano Sans Pro Thin Italic.otf", weight: "100", style: "italic" },
    { path: "../public/fonts/Jano Sans Pro ExtraLight Italic.otf", weight: "200", style: "italic" },
    { path: "../public/fonts/Jano Sans Pro Light Italic.otf", weight: "300", style: "italic" },
    { path: "../public/fonts/Jano Sans Pro Regular Italic.otf", weight: "400", style: "italic" },
    { path: "../public/fonts/Jano Sans Pro Medium Italic.otf", weight: "500", style: "italic" },
    { path: "../public/fonts/Jano Sans Pro SemiBold Italic.otf", weight: "600", style: "italic" },
    { path: "../public/fonts/Jano Sans Pro Bold Italic.otf", weight: "700", style: "italic" },
    { path: "../public/fonts/Jano Sans Pro Extrabold Italic.otf", weight: "800", style: "italic" },
    { path: "../public/fonts/Jano Sans Pro Black Italic.otf", weight: "900", style: "italic" },
  ],
  display: "swap",
  variable: "--font-jano-sans",
});

// Legitima font family
const legitima = localFont({
  src: [
    { path: "../public/fonts/Legitima-Regular.ttf", weight: "400", style: "normal" },
    { path: "../public/fonts/Legitima-Italic.ttf", weight: "400", style: "italic" },
  ],
  display: "swap",
  variable: "--font-legitima",
});

export const metadata: Metadata = {
  title: "Harmony - Development",
  description: "Harmony streaming platform development version",
  appleWebApp: {
    statusBarStyle: "black-translucent", // iOS only supports "default" (opaque white) or "black-translucent" (dark translucent)
    capable: true,
  },
  icons: {
    icon: [
      { url: "/favicon-196.png", sizes: "196x196", type: "image/png" },
    ],
    apple: [
      { url: "/apple-icon-180.png", sizes: "180x180", type: "image/png" },
    ],
  },
  manifest: "/site.webmanifest",
  other: {
    // Ensure apple-mobile-web-app-capable is set first (required for status bar style to work)
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
    viewport: "width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#000000" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`overscroll-contain ${legitima.variable} ${janoSans.variable}`} style={{ WebkitOverflowScrolling: 'auto' } as React.CSSProperties}>
      <head>
        <style
          dangerouslySetInnerHTML={{
            __html: `
              /* Hide scrollbars on Android immediately - no flash */
              @media screen {
                html.android *,
                html.android *::before,
                html.android *::after {
                  scrollbar-width: none !important;
                  -ms-overflow-style: none !important;
                }
                html.android *::-webkit-scrollbar,
                html.android *::-webkit-scrollbar-track,
                html.android *::-webkit-scrollbar-thumb {
                  display: none !important;
                  width: 0 !important;
                  height: 0 !important;
                  background: transparent !important;
                }
                html.android,
                html.android body,
                html.android #main-scroll-container {
                  scrollbar-width: none !important;
                  -ms-overflow-style: none !important;
                }
                html.android::-webkit-scrollbar,
                html.android body::-webkit-scrollbar,
                html.android #main-scroll-container::-webkit-scrollbar {
                  display: none !important;
                  width: 0 !important;
                  height: 0 !important;
                }
              }
            `,
          }}
        />
      </head>
      <body className={`${janoSans.className} antialiased overscroll-contain`} style={{ WebkitOverflowScrolling: 'auto', overflow: 'hidden' } as React.CSSProperties}>
        <Script
          id="hide-android-scrollbars-inline"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var ua = navigator.userAgent || '';
                  var isAndroid = /Android/i.test(ua) && !/Chrome\\/[.0-9]* Mobile Safari/i.test(ua) || /wv\\)/.test(ua) || /Android.*Version\\/[.0-9]+ Chrome/i.test(ua);
                  if (isAndroid) {
                    // Add class immediately before any rendering
                    document.documentElement.classList.add('android');
                  }
                } catch(e) {}
              })();
            `,
          }}
        />
        <HideAndroidScrollbars />
        <NiceneCreedComment />
        <PreventContextMenu />
        <BuildInfo />
        <PWAMetaTags />
        <DevAutoRefresh />
        <QueryProvider>
          <PageCacheProvider>
            <PageCapture />
            <LoadingProvider>
              <PipProvider>
                <ModalProvider>
                  <UserProvider>
                    <AudioPlayerProvider>
                      <BodyPadding />
                      <TopBanner />
                      {/* Main scroll container - like modals have */}
                      <MainScrollContainer>
                        <SwipeNavigation>
                          <ContentWrapper>
                            {children}
                          </ContentWrapper>
                        </SwipeNavigation>
                      </MainScrollContainer>
                      {/* Audio Player - above mobile nav */}
                      <AudioPlayer />
                      {/* Mobile bottom navigation */}
                      <MobileNav />
                      {/* Spacer so content isn't hidden behind nav on mobile */}
                      <div className="block sm:hidden h-16" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }} />
                      {/* Modal rendered outside ContentWrapper to avoid scaling */}
                      <ModalRenderer />
                      {/* Settings modal rendered outside ContentWrapper to avoid scaling */}
                      <SettingsModalRenderer />
                      {/* Video modal rendered outside ContentWrapper to avoid scaling */}
                      <VideoModalRenderer />
                      {/* Signup modal rendered outside ContentWrapper to avoid scaling */}
                      <SignupModalRenderer />
                      {/* Login modal rendered outside ContentWrapper to avoid scaling */}
                      <LoginModalRenderer />
                      {/* Footer content modal rendered outside ContentWrapper to avoid scaling */}
                      <FooterContentModalRenderer />
                      {/* Bug modal rendered outside ContentWrapper to avoid scaling */}
                      <BugModalRenderer />
                      {/* Search modal rendered outside ContentWrapper to avoid scaling */}
                      <SearchModalRenderer />
                      {/* Video loading overlay */}
                      <VideoLoadingOverlay />
                      {/* Custom Picture-in-Picture player */}
                      <CustomPipPlayer />
                    </AudioPlayerProvider>
                  </UserProvider>
                </ModalProvider>
              </PipProvider>
            </LoadingProvider>
          </PageCacheProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
