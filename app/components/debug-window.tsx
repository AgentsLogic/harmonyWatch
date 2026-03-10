"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { Capacitor } from "@capacitor/core";
import { useUser } from "@/app/contexts/user-context";
import { useRevenueCat } from "@/lib/hooks/useRevenueCat";
import { publicConfig } from "@/lib/env";

// Version info type
type VersionInfo = {
  commitHash: string;
  commitMessage: string;
  commitDate: string;
  branch: string;
  buildDate: string;
};

// Default version info for dev mode
const defaultVersionInfo: VersionInfo = {
  commitHash: 'dev',
  commitMessage: 'Development mode',
  commitDate: new Date().toISOString(),
  branch: 'dev',
  buildDate: new Date().toISOString(),
};

// Version info will be loaded at runtime from public/version.json

interface DebugWindowProps {
  verificationStatus?: "verifying" | "verified" | "failed";
  sessionId?: string | null;
  subscriptionId?: string | null;
  plan?: string | null;
}

export function DebugWindow({ 
  verificationStatus, 
  sessionId, 
  subscriptionId, 
  plan 
}: DebugWindowProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [logs, setLogs] = useState<Array<{ type: string; message: string; timestamp: string; isRevenueCat?: boolean; isDebug?: boolean }>>([]);
  const [logFilter, setLogFilter] = useState<'all' | 'revenuecat' | 'error'>('all');
  const [versionInfo, setVersionInfo] = useState<VersionInfo>(defaultVersionInfo);
  const logsEndRef = useRef<HTMLDivElement | null>(null);
  const { user } = useUser();
  const { 
    offerings, 
    isLoading: isRevenueCatLoading, 
    error: revenueCatError,
    isInitialized,
    isAvailable 
  } = useRevenueCat(user?.id);

  // Load version info from public/version.json (generated at build time)
  useEffect(() => {
    fetch('/version.json')
      .then(res => {
        if (res.ok) {
          return res.json();
        }
        return null;
      })
      .then(data => {
        if (data) {
          setVersionInfo(data as VersionInfo);
        }
      })
      .catch(() => {
        // Version file doesn't exist (dev mode), keep default
      });
  }, []);

  // Show on all platforms for debugging (can be restricted to iOS if needed)
  const isIOS = Capacitor.getPlatform() === 'ios';
  
  // Uncomment to restrict to iOS only:
  // if (!isIOS) {
  //   return null;
  // }

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  // Capture console logs with enhanced RevenueCat detection
  useEffect(() => {
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;

    const addLog = (type: string, ...args: any[]) => {
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ');
      
      const isRevenueCat = message.toLowerCase().includes('revenuecat') || 
                          message.toLowerCase().includes('revenue') ||
                          message.toLowerCase().includes('purchase') ||
                          message.toLowerCase().includes('subscription');
      
      const isDebug = message.includes('[DEBUG]');
      
      setLogs(prev => [...prev.slice(-199), {
        type,
        message,
        timestamp: new Date().toISOString(),
        isRevenueCat,
        isDebug
      }]);
    };

    console.log = (...args: any[]) => {
      originalLog(...args);
      addLog('LOG', ...args);
    };

    console.error = (...args: any[]) => {
      originalError(...args);
      addLog('ERROR', ...args);
    };

    console.warn = (...args: any[]) => {
      originalWarn(...args);
      addLog('WARN', ...args);
    };

    return () => {
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
    };
  }, []);

  const debugInfo = {
    platform: Capacitor.getPlatform(),
    isNative: Capacitor.isNativePlatform(),
    appUrl: typeof window !== 'undefined' ? window.location.origin : 'N/A',
    version: versionInfo,
    user: user ? {
      id: user.id,
      email: user.email,
      user_type: user.user_type,
      created_at: user.created_at,
    } : null,
    revenueCat: {
      isAvailable,
      isInitialized,
      isLoading: isRevenueCatLoading,
      error: revenueCatError,
      hasOfferings: !!offerings,
      // Best Practice: Access NEXT_PUBLIC_* directly via process.env (Next.js replaces at build time)
      // @ts-ignore - Next.js replaces this at build time
      apiKeyConfigured: !!(process.env.NEXT_PUBLIC_REVENUECAT_WEB_API_KEY as string | undefined) || 
                        !!(process.env.NEXT_PUBLIC_REVENUECAT_IOS_API_KEY as string | undefined) ||
                        !!(process.env.NEXT_PUBLIC_REVENUECAT_API_KEY as string | undefined),
      apiKeyPreview: (() => {
        // Check for platform-specific keys first, then legacy
        const webKey = process.env.NEXT_PUBLIC_REVENUECAT_WEB_API_KEY as string | undefined;
        const iosKey = process.env.NEXT_PUBLIC_REVENUECAT_IOS_API_KEY as string | undefined;
        const legacyKey = process.env.NEXT_PUBLIC_REVENUECAT_API_KEY as string | undefined;
        const key = webKey || iosKey || legacyKey;
        return key ? `${key.substring(0, 10)}...` : 'NOT SET';
      })(),
      apiKeySource: (() => {
        if (process.env.NEXT_PUBLIC_REVENUECAT_WEB_API_KEY) return 'WEB';
        if (process.env.NEXT_PUBLIC_REVENUECAT_IOS_API_KEY) return 'IOS';
        if (process.env.NEXT_PUBLIC_REVENUECAT_API_KEY) return 'LEGACY';
        return 'NONE';
      })(),
      debug: {
        processEnvDirect: (() => {
          const webKey = process.env.NEXT_PUBLIC_REVENUECAT_WEB_API_KEY as string | undefined;
          const iosKey = process.env.NEXT_PUBLIC_REVENUECAT_IOS_API_KEY as string | undefined;
          const legacyKey = process.env.NEXT_PUBLIC_REVENUECAT_API_KEY as string | undefined;
          return webKey || iosKey || legacyKey ? 'SET' : 'NOT SET';
        })(),
        publicConfigValue: (() => {
          const webKey = publicConfig.NEXT_PUBLIC_REVENUECAT_WEB_API_KEY;
          const iosKey = publicConfig.NEXT_PUBLIC_REVENUECAT_IOS_API_KEY;
          const legacyKey = publicConfig.NEXT_PUBLIC_REVENUECAT_API_KEY;
          return webKey || iosKey || legacyKey ? 'SET' : 'NOT SET';
        })(),
        preview: (() => {
          const webKey = process.env.NEXT_PUBLIC_REVENUECAT_WEB_API_KEY as string | undefined;
          const iosKey = process.env.NEXT_PUBLIC_REVENUECAT_IOS_API_KEY as string | undefined;
          const legacyKey = process.env.NEXT_PUBLIC_REVENUECAT_API_KEY as string | undefined;
          const key = webKey || iosKey || legacyKey;
          return key ? `${key.substring(0, 10)}...` : null;
        })(),
        note: "NEXT_PUBLIC_* variables are embedded at build time. Redeploy after adding to Vercel."
      },
      packages: (() => {
        if (!offerings) return [];
        try {
          return (offerings as any).availablePackages?.map((pkg: any) => ({
            identifier: pkg?.identifier || 'unknown',
            product: pkg?.product?.identifier || 'unknown',
            price: pkg?.product?.priceString || 'N/A',
          })) || [];
        } catch (e) {
          return [];
        }
      })(),
    },
    payment: {
      verificationStatus,
      sessionId,
      subscriptionId,
      plan,
    },
    timestamp: new Date().toISOString(),
  };

  const revenueCatDebug = useMemo(() => {
    return {
      isAvailable,
      isInitialized,
      isLoading: isRevenueCatLoading,
      error: revenueCatError,
      hasOfferings: !!offerings,
      apiKeyConfigured: !!(process.env.NEXT_PUBLIC_REVENUECAT_WEB_API_KEY as string | undefined) || 
                        !!(process.env.NEXT_PUBLIC_REVENUECAT_IOS_API_KEY as string | undefined) ||
                        !!(process.env.NEXT_PUBLIC_REVENUECAT_API_KEY as string | undefined),
      apiKeyPreview: (() => {
        // Check for platform-specific keys first, then legacy
        const webKey = process.env.NEXT_PUBLIC_REVENUECAT_WEB_API_KEY as string | undefined;
        const iosKey = process.env.NEXT_PUBLIC_REVENUECAT_IOS_API_KEY as string | undefined;
        const legacyKey = process.env.NEXT_PUBLIC_REVENUECAT_API_KEY as string | undefined;
        const key = webKey || iosKey || legacyKey;
        return key ? `${key.substring(0, 10)}...` : 'NOT SET';
      })(),
      // Debug: Show what's available to help diagnose
      debug: {
        processEnvDirect: (() => {
          const webKey = process.env.NEXT_PUBLIC_REVENUECAT_WEB_API_KEY as string | undefined;
          const iosKey = process.env.NEXT_PUBLIC_REVENUECAT_IOS_API_KEY as string | undefined;
          const legacyKey = process.env.NEXT_PUBLIC_REVENUECAT_API_KEY as string | undefined;
          return webKey || iosKey || legacyKey ? 'SET' : 'NOT SET';
        })(),
        publicConfigValue: (() => {
          const webKey = publicConfig.NEXT_PUBLIC_REVENUECAT_WEB_API_KEY;
          const iosKey = publicConfig.NEXT_PUBLIC_REVENUECAT_IOS_API_KEY;
          const legacyKey = publicConfig.NEXT_PUBLIC_REVENUECAT_API_KEY;
          return webKey || iosKey || legacyKey ? 'SET' : 'NOT SET';
        })(),
        preview: (() => {
          const webKey = process.env.NEXT_PUBLIC_REVENUECAT_WEB_API_KEY as string | undefined;
          const iosKey = process.env.NEXT_PUBLIC_REVENUECAT_IOS_API_KEY as string | undefined;
          const legacyKey = process.env.NEXT_PUBLIC_REVENUECAT_API_KEY as string | undefined;
          const key = webKey || iosKey || legacyKey;
          return key ? `${key.substring(0, 10)}...` : null;
        })(),
        note: 'NEXT_PUBLIC_* variables are embedded at build time. Redeploy after adding to Vercel.',
      },
      packages: (() => {
        if (!offerings) return [];
        try {
          return (offerings as any).availablePackages?.map((pkg: any) => ({
            identifier: pkg?.identifier || 'unknown',
            product: pkg?.product?.identifier || 'unknown',
            price: pkg?.product?.priceString || 'N/A',
          })) || [];
        } catch (e) {
          return [];
        }
      })(),
    };
  }, [offerings, isAvailable, isInitialized, isRevenueCatLoading, revenueCatError]);

  return (
    <>
      {/* Toggle Button - Fixed position in bottom right */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-4 right-4 z-[9999] bg-yellow-600 hover:bg-yellow-700 text-black px-4 py-2 rounded-lg text-xs font-mono font-bold shadow-lg transition-colors border-2 border-yellow-400"
        style={{ 
          fontSize: '11px',
          padding: '10px 14px',
          minWidth: '80px',
        }}
      >
        {isOpen ? '▼ DEBUG' : '▲ DEBUG'}
      </button>

      {/* Debug Window */}
      {isOpen && (
        <div className="fixed inset-0 z-40 bg-black bg-opacity-90 overflow-hidden">
          <div className="h-full flex flex-col">
            {/* Header */}
            <div className="bg-gray-900 border-b border-gray-700 px-4 py-3 flex items-center justify-between">
              <h2 className="text-white text-sm font-mono font-bold">DEBUG WINDOW</h2>
              <button
                onClick={() => setIsOpen(false)}
                className="text-white hover:text-red-400 text-lg font-bold"
              >
                ×
              </button>
            </div>

            {/* Content - Scrollable */}
            <div className="flex-1 overflow-y-auto p-4">
              {/* Platform Info */}
              <div className="mb-4">
                <h3 className="text-white text-xs font-mono font-bold mb-2">PLATFORM</h3>
                <pre className="bg-gray-900 text-green-400 text-xs p-3 rounded overflow-x-auto font-mono">
                  {JSON.stringify({
                    platform: debugInfo.platform,
                    isNative: debugInfo.isNative,
                    appUrl: debugInfo.appUrl,
                  }, null, 2)}
                </pre>
              </div>

              {/* Version Info */}
              <div className="mb-4">
                <h3 className="text-white text-xs font-mono font-bold mb-2">BUILD VERSION</h3>
                <pre className="bg-gray-900 text-cyan-400 text-xs p-3 rounded overflow-x-auto font-mono">
                  {JSON.stringify(debugInfo.version, null, 2)}
                </pre>
              </div>

              {/* User Info */}
              <div className="mb-4">
                <h3 className="text-white text-xs font-mono font-bold mb-2">USER</h3>
                <pre className="bg-gray-900 text-blue-400 text-xs p-3 rounded overflow-x-auto font-mono">
                  {JSON.stringify(debugInfo.user, null, 2)}
                </pre>
              </div>

              {/* RevenueCat Info - Enhanced with error highlighting */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-white text-xs font-mono font-bold">REVENUECAT</h3>
                  {revenueCatError && (
                    <span className="text-red-400 text-xs font-mono bg-red-900/30 px-2 py-1 rounded">
                      ERROR DETECTED
                    </span>
                  )}
                </div>
                <pre className={`text-xs p-3 rounded overflow-x-auto font-mono ${
                  revenueCatError 
                    ? 'bg-red-900/20 text-red-300 border border-red-500' 
                    : 'bg-gray-900 text-yellow-400'
                }`}>
                  {JSON.stringify(debugInfo.revenueCat, null, 2)}
                </pre>
                {revenueCatError && (
                  <div className="mt-2 p-2 bg-red-900/30 border border-red-500 rounded">
                    <div className="text-red-400 text-xs font-mono font-bold mb-1">ERROR DETAILS:</div>
                    <div className="text-red-300 text-xs font-mono whitespace-pre-wrap break-words">
                      {typeof revenueCatError === 'string' 
                        ? revenueCatError 
                        : JSON.stringify(revenueCatError, null, 2)}
                    </div>
                  </div>
                )}
              </div>

              {/* Payment Info */}
              <div className="mb-4">
                <h3 className="text-white text-xs font-mono font-bold mb-2">PAYMENT</h3>
                <pre className="bg-gray-900 text-purple-400 text-xs p-3 rounded overflow-x-auto font-mono">
                  {JSON.stringify(debugInfo.payment, null, 2)}
                </pre>
              </div>

              {/* Console Logs - Enhanced for RevenueCat debugging */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-white text-xs font-mono font-bold">CONSOLE LOGS</h3>
                  <div className="flex items-center gap-2">
                    {/* Filter buttons */}
                    <div className="flex gap-1">
                      <button
                        onClick={() => setLogFilter('all')}
                        className={`px-2 py-1 text-xs font-mono rounded ${
                          logFilter === 'all' 
                            ? 'bg-blue-600 text-white' 
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                      >
                        All
                      </button>
                      <button
                        onClick={() => setLogFilter('revenuecat')}
                        className={`px-2 py-1 text-xs font-mono rounded ${
                          logFilter === 'revenuecat' 
                            ? 'bg-yellow-600 text-white' 
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                      >
                        RC
                      </button>
                      <button
                        onClick={() => setLogFilter('error')}
                        className={`px-2 py-1 text-xs font-mono rounded ${
                          logFilter === 'error' 
                            ? 'bg-red-600 text-white' 
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                      >
                        Errors
                      </button>
                    </div>
                    <button
                      onClick={() => setLogs([])}
                      className="text-red-400 hover:text-red-300 text-xs font-mono px-2 py-1"
                    >
                      Clear
                    </button>
                  </div>
                </div>
                <div className="bg-gray-900 text-gray-300 text-xs p-3 rounded overflow-x-auto font-mono max-h-64 overflow-y-auto">
                  {logs.length === 0 ? (
                    <div className="text-gray-500 italic">No logs yet...</div>
                  ) : (
                    <>
                      {logs
                        .filter(log => {
                          if (logFilter === 'all') return true;
                          if (logFilter === 'revenuecat') return log.isRevenueCat;
                          if (logFilter === 'error') return log.type === 'ERROR';
                          return true;
                        })
                        .map((log, index) => {
                          const isError = log.type === 'ERROR';
                          const isRevenueCat = log.isRevenueCat;
                          const isWarning = log.type === 'WARN';
                          const isDebug = log.isDebug;
                          
                          return (
                            <div 
                              key={index} 
                              className={`mb-2 p-2 rounded ${
                                isError 
                                  ? 'bg-red-900/30 border-l-2 border-red-500' 
                                  : isWarning
                                  ? 'bg-yellow-900/20 border-l-2 border-yellow-500'
                                  : isDebug
                                  ? 'bg-blue-900/30 border-l-2 border-blue-400'
                                  : isRevenueCat
                                  ? 'bg-yellow-900/10 border-l-2 border-yellow-400'
                                  : 'bg-gray-800/50'
                              }`}
                            >
                              <div className="flex items-start gap-2">
                                <span className={`text-xs font-mono font-bold shrink-0 ${
                                  isError 
                                    ? 'text-red-400' 
                                    : isWarning
                                    ? 'text-yellow-400'
                                    : isDebug
                                    ? 'text-blue-300'
                                    : isRevenueCat
                                    ? 'text-yellow-300'
                                    : 'text-gray-400'
                                }`}>
                                  [{log.type}]
                                </span>
                                {isDebug && (
                                  <span className="text-xs font-mono text-blue-300 bg-blue-900/30 px-1 rounded shrink-0">
                                    DEBUG
                                  </span>
                                )}
                                {isRevenueCat && (
                                  <span className="text-xs font-mono text-yellow-400 bg-yellow-900/30 px-1 rounded shrink-0">
                                    RC
                                  </span>
                                )}
                                <span className="text-xs text-gray-400 font-mono shrink-0">
                                  {new Date(log.timestamp).toLocaleTimeString()}
                                </span>
                              </div>
                              <div className="mt-1 whitespace-pre-wrap break-words text-gray-200">
                                {log.message}
                              </div>
                            </div>
                          );
                        })}
                      <div ref={logsEndRef} />
                    </>
                  )}
                </div>
              </div>

              {/* Timestamp */}
              <div className="mb-4">
                <h3 className="text-white text-xs font-mono font-bold mb-2">TIMESTAMP</h3>
                <div className="bg-gray-900 text-gray-400 text-xs p-3 rounded font-mono">
                  {debugInfo.timestamp}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

