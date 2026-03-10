import type { NextConfig } from "next";
import { execSync } from "child_process";

// Get git commit hash at build time
function getGitCommitHash(): string {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();
  } catch {
    return "unknown";
  }
}

// Get build time
const buildTime = new Date().toISOString();

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_HASH: getGitCommitHash(),
    NEXT_PUBLIC_BUILD_TIME: buildTime,
  },
  // Allow cross-origin requests from local network IPs in development
  // This is needed for testing on physical devices (iOS/Android apps)
  allowedDevOrigins: ['192.168.1.186', 'localhost', '127.0.0.1'],
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: 'https', hostname: 'image.mux.com' }
    ]
  },
  async headers() {
    // Only apply security headers in production
    if (process.env.NODE_ENV !== 'production') {
      return [];
    }

    return [
      {
        // Specific headers for video files
        source: '/images/homepage-video.webm',
        headers: [
          {
            key: 'Content-Type',
            value: 'video/webm',
          },
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
          {
            key: 'Accept-Ranges',
            value: 'bytes',
          },
          {
            key: 'Access-Control-Allow-Origin',
            value: '*',
          },
        ],
      },
      {
        // Apply video headers to all .webm files in /images
        source: '/images/:path*.webm',
        headers: [
          {
            key: 'Content-Type',
            value: 'video/webm',
          },
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
          {
            key: 'Accept-Ranges',
            value: 'bytes',
          },
          {
            key: 'Access-Control-Allow-Origin',
            value: '*',
          },
        ],
      },
      {
        // Don't cache placeholder images - they may need to be updated
        // This must come BEFORE the general image cache rule
        source: '/images/content-1.png',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
        ],
      },
      {
        // Apply cache headers to all image files in /images
        source: '/images/:path*.(png|jpg|jpeg|webp|svg|gif)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        // Apply security headers to all routes in production
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://js.stripe.com https://*.stripe.com",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https: blob:",
              "font-src 'self' data:",
              "connect-src 'self' https://*.supabase.co https://*.mux.com https://inferred.litix.io https://api.stripe.com https://*.stripe.com https://api.revenuecat.com https://*.revenuecat.com https://e.revenuecat.com https://*.revenue.cat https://e.revenue.cat http://localhost:* http://127.0.0.1:*",
              "media-src 'self' https://*.mux.com blob:",
              "frame-src 'self' https://*.mux.com https://js.stripe.com https://hooks.stripe.com capacitor:// ionic:",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'none'",
              "upgrade-insecure-requests"
            ].join('; '),
          },
        ],
      },
    ];
  },
  // Only apply webpack config in production builds
  // Turbopack handles dev mode, so webpack config causes conflicts and slowdowns
  ...(process.env.NODE_ENV === 'production' ? {
    webpack: (config, { isServer, webpack }) => {
      // Handle Stencil's dynamic imports for Ionic
      if (!isServer) {
        config.plugins.push(
          new webpack.ContextReplacementPlugin(
            /@stencil\/core/,
            (data: { context: string }) => {
              // Allow dynamic imports in Stencil
              return data;
            }
          )
        );

        // Ignore warnings about dynamic imports in Stencil
        config.ignoreWarnings = [
          ...(config.ignoreWarnings || []),
          {
            module: /@stencil\/core/,
          },
          {
            message: /Can't resolve '\.\/' <dynamic> '\.entry\.js' <dynamic>/,
          },
        ];
      }

      return config;
    },
    transpilePackages: ['@ionic/react', '@ionic/core', '@stencil/core'],
  } : {}),
};

export default nextConfig;
