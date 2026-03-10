"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { Purchases as PurchasesCapacitor, LOG_LEVEL, PurchasesOffering, PurchasesPackage } from '@revenuecat/purchases-capacitor';
import { Purchases as PurchasesWeb } from '@revenuecat/purchases-js';
import { publicConfig } from '@/lib/env';
import { revenueCatService } from '@/lib/services/revenuecat';
import type { 
  RevenueCatOffering, 
  RevenueCatPackage, 
  RevenueCatCustomerInfo 
} from '@/lib/services/revenuecat-web';

// Module-level shared state to prevent duplicate identify calls across all hook instances
const identifyingUsers = new Set<string>();
const identifiedUsers = new Set<string>();

// Unified types for both platforms
type UnifiedOffering = PurchasesOffering | RevenueCatOffering | null;
type UnifiedPackage = PurchasesPackage | RevenueCatPackage;
type UnifiedCustomerInfo = Awaited<ReturnType<typeof PurchasesCapacitor.getCustomerInfo>> | RevenueCatCustomerInfo;

export interface UseRevenueCatReturn {
  offerings: UnifiedOffering;
  isLoading: boolean;
  error: string | null;
  isInitialized: boolean;
  isAvailable: boolean;
  purchasePackage: (packageToPurchase: UnifiedPackage) => Promise<{ customerInfo: UnifiedCustomerInfo }>;
  restorePurchases: () => Promise<UnifiedCustomerInfo>;
  refreshOfferings: () => Promise<void>;
}

export function useRevenueCat(appUserID?: string): UseRevenueCatReturn {
  const [offerings, setOfferings] = useState<UnifiedOffering>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  // Store the Purchases instance for web platform
  const purchasesInstanceRef = useRef<any>(null);
  
  // Detect platform: iOS and Android use Capacitor, Web uses JS SDK
  // Safely detect platform, default to web for all browsers
  // Memoize to ensure stable values for dependency arrays
  // Matches pattern used in signup-modal.tsx and other components: check isNativePlatform() first
  const { isIOS, isAndroid, isWeb, isAvailable } = useMemo(() => {
    // Default: assume we're on web (browser)
    let ios = false;
    let android = false;
    let web = false;
    
    if (typeof window !== 'undefined') {
      // We're in a browser environment
      try {
        // Check if native platform first (matches pattern used in signup-modal.tsx and mux-video-player.tsx)
        const isNative = Capacitor.isNativePlatform();
        const platform = Capacitor.getPlatform();
        console.log('[useRevenueCat] Platform detection:', { isNative, platform, hasWindow: true });
        
        if (isNative && platform === 'ios') {
          ios = true;
          android = false;
          web = false;
        } else if (isNative && platform === 'android') {
          ios = false;
          android = true;
          web = false;
        } else {
          // Any other platform (web, etc.) = web
          ios = false;
          android = false;
          web = true;
        }
      } catch (error) {
        // Capacitor not available or error - definitely web browser
        console.log('[useRevenueCat] Capacitor not available, defaulting to web:', error);
        ios = false;
        android = false;
        web = true;
      }
    } else {
      // Server-side rendering - not available
      console.log('[useRevenueCat] Window not available (SSR)');
      ios = false;
      android = false;
      web = false;
    }
    
    const result = {
      isIOS: ios,
      isAndroid: android,
      isWeb: web,
      isAvailable: ios || android || web
    };
    
    console.log('[useRevenueCat] Platform detection result:', result);
    return result;
  }, []); // Empty deps - platform detection only runs once

  // Initialize RevenueCat following RevenueCat's React pattern
  // CRITICAL: For Web, we should wait for appUserID if possible to avoid anonymous IDs
  // However, RevenueCat Web SDK can only be configured once, so we need to be careful
  useEffect(() => {
    if (!isAvailable) {
      console.log('[useRevenueCat] Not available on this platform');
      return;
    }

    // For Web platform: If we don't have appUserID yet, we'll initialize with anonymous ID
    // but we MUST identify the user immediately when appUserID becomes available (handled in separate effect)
    // For iOS: We can pass appUserID directly to configure()
    if (isWeb && !appUserID) {
      console.warn('[useRevenueCat] ⚠️ Initializing Web RevenueCat without appUserID - will use anonymous ID. User must be identified before purchasing!');
    }

    (async function () {
      try {
        setIsLoading(true);
        setError(null);

        // @ts-ignore - Next.js replaces this at build time, TypeScript doesn't know about it
        // Determine if we should use Sandbox mode (for testing)
        // Use Sandbox in development mode OR if explicitly enabled via REVENUECAT_USE_SANDBOX
        const useSandbox = process.env.NODE_ENV === 'development' || 
          (process.env.NEXT_PUBLIC_REVENUECAT_USE_SANDBOX === 'true');
        
        // Get platform-specific API keys (Sandbox or Production)
        const webApiKey = useSandbox
          ? ((process.env.NEXT_PUBLIC_REVENUECAT_WEB_SANDBOX_API_KEY as string | undefined) ?? null)
          : ((process.env.NEXT_PUBLIC_REVENUECAT_WEB_API_KEY as string | undefined) ?? null);
        const iosApiKey = useSandbox
          ? ((process.env.NEXT_PUBLIC_REVENUECAT_IOS_SANDBOX_API_KEY as string | undefined) ?? null)
          : ((process.env.NEXT_PUBLIC_REVENUECAT_IOS_API_KEY as string | undefined) ?? null);
        const androidApiKey = useSandbox
          ? ((process.env.NEXT_PUBLIC_REVENUECAT_ANDROID_SANDBOX_API_KEY as string | undefined) ?? null)
          : ((process.env.NEXT_PUBLIC_REVENUECAT_ANDROID_API_KEY as string | undefined) ?? null);
        const legacyApiKey = (process.env.NEXT_PUBLIC_REVENUECAT_API_KEY as string | undefined) ?? null;
        
        // Use platform-specific key, fallback to legacy key, then to other platform's key
        // If Sandbox keys are not available, fall back to production keys
        let apiKey: string | null = null;
        if (isIOS) {
          apiKey = iosApiKey || legacyApiKey || webApiKey;
          // If using Sandbox but no Sandbox key, fall back to production iOS key
          if (useSandbox && !apiKey) {
            apiKey = (process.env.NEXT_PUBLIC_REVENUECAT_IOS_API_KEY as string | undefined) ?? null;
          }
        } else if (isAndroid) {
          apiKey = androidApiKey || legacyApiKey || iosApiKey || webApiKey;
          // If using Sandbox but no Sandbox key, fall back to production Android key
          if (useSandbox && !apiKey) {
            apiKey = (process.env.NEXT_PUBLIC_REVENUECAT_ANDROID_API_KEY as string | undefined) ?? null;
          }
        } else {
          apiKey = webApiKey || legacyApiKey || iosApiKey;
          // If using Sandbox but no Sandbox key, fall back to production web key
          if (useSandbox && !apiKey) {
            apiKey = (process.env.NEXT_PUBLIC_REVENUECAT_WEB_API_KEY as string | undefined) ?? null;
          }
        }
        
        if (!apiKey) {
          const platform = isIOS ? 'iOS' : isAndroid ? 'Android' : 'Web';
          const requiredKey = useSandbox
            ? (isIOS ? 'NEXT_PUBLIC_REVENUECAT_IOS_SANDBOX_API_KEY' : isAndroid ? 'NEXT_PUBLIC_REVENUECAT_ANDROID_SANDBOX_API_KEY' : 'NEXT_PUBLIC_REVENUECAT_WEB_SANDBOX_API_KEY')
            : (isIOS ? 'NEXT_PUBLIC_REVENUECAT_IOS_API_KEY' : isAndroid ? 'NEXT_PUBLIC_REVENUECAT_ANDROID_API_KEY' : 'NEXT_PUBLIC_REVENUECAT_WEB_API_KEY');
          console.error(`[useRevenueCat] ${platform} API key not found (${useSandbox ? 'SANDBOX' : 'PRODUCTION'} mode). This means:`, {
            issue: `${requiredKey} is not set in Vercel environment variables`,
            solution: [
              '1. Go to Vercel Dashboard → Project Settings → Environment Variables',
              `2. Add ${requiredKey} with your RevenueCat ${platform} ${useSandbox ? 'Sandbox' : 'Production'} API key`,
              '3. For iOS: Get key from "Harmony: Orthodox Content" app configuration',
              '4. For Android: Get key from your Android app configuration in RevenueCat',
              '5. For Web: Get key from "Harmony (Web Billing)" app configuration',
              '6. For Sandbox keys: Get from RevenueCat Dashboard → Project Settings → API Keys → Sandbox',
              '7. Ensure it\'s set for "All Environments" or the specific environment you\'re using',
              '8. Redeploy the application (environment variables are embedded at build time)',
            ],
            currentValues: {
              mode: useSandbox ? 'SANDBOX' : 'PRODUCTION',
              web: webApiKey ? `${webApiKey.substring(0, 10)}...` : 'undefined',
              ios: iosApiKey ? `${iosApiKey.substring(0, 10)}...` : 'undefined',
              android: androidApiKey ? `${androidApiKey.substring(0, 10)}...` : 'undefined',
              legacy: legacyApiKey ? `${legacyApiKey.substring(0, 10)}...` : 'undefined',
            },
            note: 'NEXT_PUBLIC_* variables must be available during the build process',
          });
          throw new Error(`RevenueCat ${platform} API key is not configured. Set ${requiredKey} in Vercel environment variables and redeploy.`);
        }
        
        const platformName = isIOS ? 'iOS' : isAndroid ? 'Android' : 'Web';
        console.log(`[useRevenueCat] Using ${platformName} API key:`, {
          platform: platformName,
          mode: useSandbox ? 'SANDBOX (Test Mode)' : 'PRODUCTION',
          keySource: isIOS 
            ? (iosApiKey ? (useSandbox ? 'NEXT_PUBLIC_REVENUECAT_IOS_SANDBOX_API_KEY' : 'NEXT_PUBLIC_REVENUECAT_IOS_API_KEY') : legacyApiKey ? 'NEXT_PUBLIC_REVENUECAT_API_KEY (legacy)' : 'NEXT_PUBLIC_REVENUECAT_WEB_API_KEY (fallback)')
            : isAndroid
            ? (androidApiKey ? (useSandbox ? 'NEXT_PUBLIC_REVENUECAT_ANDROID_SANDBOX_API_KEY' : 'NEXT_PUBLIC_REVENUECAT_ANDROID_API_KEY') : legacyApiKey ? 'NEXT_PUBLIC_REVENUECAT_API_KEY (legacy)' : iosApiKey ? 'NEXT_PUBLIC_REVENUECAT_IOS_API_KEY (fallback)' : 'NEXT_PUBLIC_REVENUECAT_WEB_API_KEY (fallback)')
            : (webApiKey ? (useSandbox ? 'NEXT_PUBLIC_REVENUECAT_WEB_SANDBOX_API_KEY' : 'NEXT_PUBLIC_REVENUECAT_WEB_API_KEY') : legacyApiKey ? 'NEXT_PUBLIC_REVENUECAT_API_KEY (legacy)' : 'NEXT_PUBLIC_REVENUECAT_IOS_API_KEY (fallback)'),
          keyPreview: apiKey ? apiKey.substring(0, 10) + '...' : 'undefined',
          hasAppUserID: !!appUserID,
        });

        // Initialize based on platform
        if (isIOS || isAndroid) {
          // iOS and Android: Use Capacitor SDK
          if (process.env.NODE_ENV === 'development') {
            await PurchasesCapacitor.setLogLevel({ level: LOG_LEVEL.DEBUG });
          }
          
          await PurchasesCapacitor.configure({
            apiKey,
            appUserID,
          });
        } else if (isWeb) {
          // Web: Use JS SDK - configure returns an instance
          // CRITICAL: RevenueCat Web SDK can only be configured ONCE per page load
          // If we already have an instance, don't reconfigure (this would cause errors)
          if (purchasesInstanceRef.current) {
            console.log('[useRevenueCat] RevenueCat Web already initialized, skipping re-initialization');
            setIsInitialized(true);
            return;
          }

          // RevenueCat best practice: Always use the same appUserId (Supabase user_id) when available
          // This ensures webhooks and API calls use the same identifier
          // IMPORTANT: If appUserID is not available, we'll use anonymous ID, but we MUST identify
          // the user immediately when appUserID becomes available (handled in identify effect below)
          const userId = appUserID || PurchasesWeb.generateRevenueCatAnonymousAppUserId();
          const purchasesInstance = PurchasesWeb.configure({
            apiKey,
            appUserId: userId,
          });
          
          // Store the instance for later use
          purchasesInstanceRef.current = purchasesInstance;
          
          console.log('[useRevenueCat] Initialized with appUserId:', {
            appUserId: userId,
            isAnonymous: !appUserID,
            warning: !appUserID ? '⚠️ Using anonymous ID - user MUST be identified before purchasing to avoid subscription under wrong ID' : '✅ Using Supabase user_id (best practice)',
          });
        }

        setIsInitialized(true);
        console.log('[useRevenueCat] Initialized successfully', { platform: isIOS ? 'iOS' : isAndroid ? 'Android' : 'Web' });

        // Fetch offerings directly after initialization (bypass the callback's guard)
        // This follows RevenueCat best practice: initialize, then fetch offerings immediately
        try {
          setIsLoading(true);
          setError(null);
          console.log('[useRevenueCat] Fetching offerings...');
          
          // Fetch offerings based on platform
          let offeringsResponse: any;
          if (isIOS || isAndroid) {
            offeringsResponse = await PurchasesCapacitor.getOfferings();
          } else {
            // Web: Use the stored instance from configure(), or get shared instance as fallback
            const purchasesInstance = purchasesInstanceRef.current || PurchasesWeb.getSharedInstance();
            if (!purchasesInstance) {
              throw new Error('RevenueCat instance not available. Make sure configure() was called successfully.');
            }
            offeringsResponse = await purchasesInstance.getOfferings();
          }
          
          const offerings = offeringsResponse;
          
          console.log('[useRevenueCat] Offerings response:', {
            hasCurrent: !!offerings.current,
            currentIdentifier: offerings.current?.identifier,
            allOfferings: Object.keys(offerings.all || {}),
            allOfferingsCount: Object.keys(offerings.all || {}).length,
          });
          
          // Use current offering if available, otherwise fallback to first available offering
          let selectedOffering = offerings.current;
          
          if (!selectedOffering && offerings.all && Object.keys(offerings.all).length > 0) {
            const firstOfferingKey = Object.keys(offerings.all)[0];
            selectedOffering = offerings.all[firstOfferingKey];
            console.warn('[useRevenueCat] ⚠️ No current offering, using first available:', firstOfferingKey);
          }
          
          if (selectedOffering) {
            setOfferings(selectedOffering);
            console.log('[useRevenueCat] ✅ Offerings fetched successfully:', {
              identifier: selectedOffering.identifier,
              isCurrent: selectedOffering === offerings.current,
              packageCount: selectedOffering.availablePackages?.length || 0,
              packages: selectedOffering.availablePackages?.map((pkg: any) => ({
                identifier: pkg?.identifier || 'unknown',
                product: pkg?.product?.identifier || 'unknown',
                price: pkg?.product?.priceString || 'N/A',
              })) || [],
            });
          } else {
            console.warn('[useRevenueCat] ⚠️ No offerings found at all. Details:', {
              allOfferings: offerings.all,
              allOfferingsKeys: Object.keys(offerings.all || {}),
              allOfferingsCount: Object.keys(offerings.all || {}).length,
              current: offerings.current,
              note: 'Make sure an offering exists and is configured in RevenueCat dashboard',
            });
            setOfferings(null);
            setError('No subscription offerings available. Please ensure an offering is configured in RevenueCat dashboard.');
          }
        } catch (offeringsErr) {
          // Enhanced error logging to capture all RevenueCat error details
          let offeringsErrorMessage = 'Failed to fetch offerings';
          let errorDetails: any = {};
          
          if (offeringsErr instanceof Error) {
            offeringsErrorMessage = offeringsErr.message;
            errorDetails = {
              message: offeringsErr.message,
              name: offeringsErr.name,
              stack: offeringsErr.stack,
            };
          } else if (typeof offeringsErr === 'object' && offeringsErr !== null) {
            // RevenueCat errors are often objects with additional properties
            const errObj = offeringsErr as any;
            offeringsErrorMessage = errObj.message || errObj.localizedDescription || errObj.toString() || 'Unknown error';
            
            // Try to extract useful properties from the error object
            errorDetails = {
              message: errObj.message,
              name: errObj.name,
              code: errObj.code,
              errorCode: errObj.errorCode,
              localizedDescription: errObj.localizedDescription,
              toString: errObj.toString(),
            };
            
            // Try to stringify, but handle circular references
            try {
              errorDetails.jsonString = JSON.stringify(errObj, null, 2);
            } catch (e) {
              errorDetails.jsonError = 'Could not stringify error object';
            }
          } else {
            errorDetails = { rawError: String(offeringsErr) };
            offeringsErrorMessage = String(offeringsErr);
          }
          
          console.error('[useRevenueCat] Failed to fetch offerings - Full error details:', {
            error: offeringsErr,
            details: errorDetails,
            errorType: typeof offeringsErr,
            errorConstructor: offeringsErr?.constructor?.name,
            errorString: String(offeringsErr),
          });
          
          setError(offeringsErrorMessage);
          setOfferings(null);
        } finally {
          setIsLoading(false);
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to initialize RevenueCat';
        console.error('[useRevenueCat] Initialization error:', err);
        setError(errorMessage);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [isAvailable, isIOS, isWeb]); // Don't include appUserID here - handle it separately

  // RevenueCat best practice: Identify user when appUserID becomes available
  // This links anonymous purchases to the real user ID
  useEffect(() => {
    if (!isAvailable || !isInitialized || !appUserID) {
      return;
    }

    // Prevent duplicate calls using module-level shared state (works across all hook instances)
    if (identifyingUsers.has(appUserID) || identifiedUsers.has(appUserID)) {
      return;
    }

    // Set flag synchronously BEFORE starting async operation to prevent race conditions
    identifyingUsers.add(appUserID);

    (async function () {
      try {
        if (isIOS || isAndroid) {
          // iOS/Android: Use logIn to identify user (RevenueCat best practice)
          // This links anonymous purchases to the real user ID
          await PurchasesCapacitor.logIn({ appUserID });
          const platformName = isIOS ? 'iOS' : 'Android';
          console.log(`[useRevenueCat] ✅ Identified ${platformName} user (RevenueCat best practice):`, {
            appUserId: appUserID,
            note: 'This links any anonymous purchases to the user account',
          });
        } else if (isWeb) {
          // Web: Use identifyUser to link anonymous ID to real user ID
          const purchasesInstance = purchasesInstanceRef.current || PurchasesWeb.getSharedInstance();
          if (purchasesInstance) {
            await purchasesInstance.identifyUser(appUserID);
            console.log('[useRevenueCat] ✅ Identified Web user (RevenueCat best practice):', {
              appUserId: appUserID,
              note: 'This links any anonymous purchases to the user account',
            });
          }
        }
        // Mark as successfully identified
        identifiedUsers.add(appUserID);
      } catch (error) {
        console.error('[useRevenueCat] Error identifying user:', error);
        // Remove from identified set on error so we can retry
        identifiedUsers.delete(appUserID);
      } finally {
        // Always remove from identifying set
        identifyingUsers.delete(appUserID);
      }
    })();
  }, [isAvailable, isInitialized, isIOS, isWeb, appUserID]);

  const refreshOfferings = useCallback(async () => {
    if (!isAvailable || !isInitialized) {
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      console.log('[useRevenueCat] Fetching offerings...');
      
      // Fetch offerings based on platform
      let offeringsResponse: any;
      if (isIOS || isAndroid) {
        offeringsResponse = await PurchasesCapacitor.getOfferings();
      } else {
        // Web: Use the stored instance from configure(), or get shared instance as fallback
        const purchasesInstance = purchasesInstanceRef.current || PurchasesWeb.getSharedInstance();
        if (!purchasesInstance) {
          throw new Error('RevenueCat instance not available. Make sure configure() was called successfully.');
        }
        offeringsResponse = await purchasesInstance.getOfferings();
      }
      
      const offerings = offeringsResponse;
      
      console.log('[useRevenueCat] Offerings response:', {
        hasCurrent: !!offerings.current,
        currentIdentifier: offerings.current?.identifier,
        allOfferings: Object.keys(offerings.all || {}),
        allOfferingsCount: Object.keys(offerings.all || {}).length,
      });
      
      // Use current offering if available, otherwise fallback to first available offering
      let selectedOffering = offerings.current;
      
      if (!selectedOffering && offerings.all && Object.keys(offerings.all).length > 0) {
        // Fallback: use the first available offering if no current is set
        const firstOfferingKey = Object.keys(offerings.all)[0];
        selectedOffering = offerings.all[firstOfferingKey];
        console.warn('[useRevenueCat] ⚠️ No current offering, using first available:', firstOfferingKey);
      }
      
      if (selectedOffering) {
        setOfferings(selectedOffering);
        console.log('[useRevenueCat] ✅ Offerings fetched successfully:', {
          identifier: selectedOffering.identifier,
          isCurrent: selectedOffering === offerings.current,
          packageCount: selectedOffering.availablePackages?.length || 0,
          packages: selectedOffering.availablePackages?.map((pkg: any) => ({
            identifier: pkg?.identifier || 'unknown',
            product: pkg?.product?.identifier || 'unknown',
            price: pkg?.product?.priceString || 'N/A',
          })) || [],
        });
      } else {
        console.warn('[useRevenueCat] ⚠️ No offerings found at all. Details:', {
          allOfferings: offerings.all,
          allOfferingsKeys: Object.keys(offerings.all || {}),
          allOfferingsCount: Object.keys(offerings.all || {}).length,
          current: offerings.current,
          note: 'Make sure an offering exists and is configured in RevenueCat dashboard',
        });
        setOfferings(null);
        setError('No subscription offerings available. Please ensure an offering is configured in RevenueCat dashboard.');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch offerings';
      const errorDetails = err instanceof Error ? {
        message: err.message,
        name: err.name,
        stack: err.stack,
      } : String(err);
      console.error('[useRevenueCat] Failed to fetch offerings:', errorDetails);
      setError(errorMessage);
      setOfferings(null);
    } finally {
      setIsLoading(false);
    }
  }, [isAvailable, isIOS, isWeb, isInitialized]);

  const purchasePackage = useCallback(async (packageToPurchase: UnifiedPackage) => {
    if (!isAvailable || !isInitialized) {
      throw new Error('RevenueCat is not available or not initialized');
    }

    // CRITICAL: For Web platform, ensure user is identified before allowing purchases
    // This prevents subscriptions from being created under anonymous IDs
    if (isWeb && appUserID) {
      if (!identifiedUsers.has(appUserID)) {
        // User ID is available but not yet identified - wait for identification
        console.warn('[useRevenueCat] ⚠️ User not yet identified - waiting for identification before purchase');
        
        // Wait up to 5 seconds for identification to complete
        let attempts = 0;
        const maxAttempts = 50; // 5 seconds (50 * 100ms)
        while (!identifiedUsers.has(appUserID) && attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 100));
          attempts++;
        }
        
        if (!identifiedUsers.has(appUserID)) {
          throw new Error('User identification is required before purchasing. Please wait a moment and try again, or refresh the page.');
        }
        
        console.log('[useRevenueCat] ✅ User identified, proceeding with purchase');
      }
    }

    // Validate package structure before purchase
    if (!packageToPurchase) {
      throw new Error('Package to purchase is undefined or null');
    }
    
    if (!packageToPurchase.identifier) {
      const packageAny = packageToPurchase as any;
      console.error('[useRevenueCat] Invalid package structure:', {
        package: packageToPurchase,
        hasIdentifier: !!packageToPurchase.identifier,
        hasProduct: !!(packageAny?.product || packageAny?.rcBillingProduct),
        productIdentifier: packageAny?.product?.identifier || packageAny?.rcBillingProduct?.identifier,
      });
      throw new Error('Package identifier is missing. Please ensure the package is valid.');
    }
    
    // Log full package structure for debugging
    const packageAny = packageToPurchase as any;
    console.log('[useRevenueCat] Full package structure:', {
      package: packageToPurchase,
      keys: Object.keys(packageToPurchase || {}),
      hasProduct: 'product' in (packageToPurchase || {}),
      hasRcBillingProduct: 'rcBillingProduct' in (packageToPurchase || {}),
      productValue: packageAny?.product,
      rcBillingProductValue: packageAny?.rcBillingProduct,
    });
    
    // Validate product structure (RevenueCat Web SDK uses rcBillingProduct for Web Billing)
    // For web, the product is in rcBillingProduct, not product
    // For iOS, it's in product
    const product = isWeb 
      ? (packageAny?.rcBillingProduct || packageAny?.product)
      : (packageAny?.product || packageAny?.rcBillingProduct);
    
    if (!product) {
      console.error('[useRevenueCat] Package missing product:', {
        packageIdentifier: packageToPurchase.identifier,
        package: packageToPurchase,
        allKeys: Object.keys(packageToPurchase || {}),
        packageStringified: JSON.stringify(packageToPurchase, null, 2),
        isWeb,
        hasRcBillingProduct: 'rcBillingProduct' in (packageToPurchase || {}),
        hasProduct: 'product' in (packageToPurchase || {}),
      });
      throw new Error('Package product is missing. Please ensure the package has a valid product (rcBillingProduct for web, product for iOS).');
    }
    
    if (!product.identifier) {
      console.error('[useRevenueCat] Product missing identifier:', {
        packageIdentifier: packageToPurchase.identifier,
        product: product,
        productKeys: Object.keys(product || {}),
        isWeb,
      });
      throw new Error('Product identifier is missing. Please ensure the product is valid.');
    }

    try {
      setIsLoading(true);
      setError(null);
      
      let result: { customerInfo: UnifiedCustomerInfo };
      
      // Purchase based on platform
      if (isIOS || isAndroid) {
        const purchaseResult = await PurchasesCapacitor.purchasePackage({ 
          aPackage: packageToPurchase as PurchasesPackage 
        });
        result = { customerInfo: purchaseResult.customerInfo as unknown as UnifiedCustomerInfo };
      } else {
        // Web: Use the stored instance from configure(), or get shared instance as fallback
        const purchasesInstance = purchasesInstanceRef.current || PurchasesWeb.getSharedInstance();
        if (!purchasesInstance) {
          throw new Error('RevenueCat instance not available. Make sure configure() was called successfully.');
        }
        
        // Log package structure for debugging
        console.log('[useRevenueCat] Purchasing package:', {
          identifier: packageToPurchase.identifier,
          productIdentifier: product.identifier,
          productPrice: product.priceString,
          packageType: (packageToPurchase as any).packageType,
          fullPackage: packageToPurchase,
          productStructure: {
            identifier: product.identifier,
            priceString: product.priceString,
            price: product.price,
            currencyCode: product.currencyCode,
            allKeys: Object.keys(product || {}),
          },
        });
        
        // RevenueCat Web SDK should handle rcBillingProduct internally
        // Pass the original package as-is - don't modify it as RevenueCat expects specific structure
        // The package already has rcBillingProduct which contains the web billing product
        console.log('[useRevenueCat] Passing package to RevenueCat purchase:', {
          identifier: packageToPurchase.identifier,
          packageType: packageAny.packageType,
          hasRcBillingProduct: !!packageAny.rcBillingProduct,
          rcBillingProductIdentifier: packageAny.rcBillingProduct?.identifier,
          originalPackageKeys: Object.keys(packageToPurchase),
        });
        
        try {
          // RevenueCat Web SDK purchase() expects PurchaseParams object with rcPackage property
          // Note: Success redirect URL must be configured in RevenueCat Dashboard:
          // 1. Go to RevenueCat Dashboard → Your Project
          // 2. Navigate to Apps & Providers → Web Billing config
          // 3. Set "Success Redirect URL" to: https://www.harmony.watch/signup/success
          // 4. This will automatically redirect users after payment (bypasses "Continue" button)
          const purchaseResult = await purchasesInstance.purchase({
            rcPackage: packageToPurchase as any
          });
          
          // Validate purchase result
          if (!purchaseResult) {
            throw new Error('Purchase result is undefined');
          }
          
          if (!purchaseResult.customerInfo) {
            throw new Error('Purchase result missing customerInfo');
          }
          
          result = { customerInfo: purchaseResult.customerInfo as unknown as UnifiedCustomerInfo };
        } catch (purchaseErr: any) {
          // Enhanced error logging for purchase errors
          console.error('[useRevenueCat] Purchase error details:', {
            error: purchaseErr,
            message: purchaseErr?.message,
            name: purchaseErr?.name,
            code: purchaseErr?.code,
            errorCode: purchaseErr?.errorCode,
            underlyingError: purchaseErr?.underlyingErrorMessage,
            userInfo: purchaseErr?.userInfo,
            stack: purchaseErr?.stack,
            package: packageToPurchase,
            product: product,
            currentUrl: typeof window !== 'undefined' ? window.location.href : 'N/A',
            origin: typeof window !== 'undefined' ? window.location.origin : 'N/A',
          });
          throw purchaseErr;
        }
      }
      
      // Refresh offerings after purchase
      await refreshOfferings();
      
      return result;
    } catch (err) {
      const purchasesError = err as any;
      const errorMessage = purchasesError?.message || 'Purchase failed';
      
      // Handle user cancellation gracefully
      if (purchasesError?.code === 'PURCHASE_CANCELLED' || purchasesError?.userCancelled) {
        setError('Purchase was cancelled');
        throw new Error('Purchase was cancelled');
      }
      
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [isAvailable, isIOS, isWeb, isInitialized, refreshOfferings]);

  const restorePurchases = useCallback(async () => {
    if (!isAvailable || !isInitialized) {
      throw new Error('RevenueCat is not available or not initialized');
    }

    try {
      setIsLoading(true);
      setError(null);
      
      let customerInfo: UnifiedCustomerInfo;
      
      // Restore purchases based on platform
      if (isIOS || isAndroid) {
        customerInfo = await PurchasesCapacitor.restorePurchases() as unknown as UnifiedCustomerInfo;
      } else {
        // Web: Use the stored instance from configure(), or get shared instance as fallback
        const purchasesInstance = purchasesInstanceRef.current || PurchasesWeb.getSharedInstance();
        if (!purchasesInstance) {
          throw new Error('RevenueCat instance not available. Make sure configure() was called successfully.');
        }
        customerInfo = await purchasesInstance.getCustomerInfo() as unknown as UnifiedCustomerInfo;
      }
      
      // Refresh offerings after restore
      await refreshOfferings();
      
      return customerInfo;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to restore purchases';
      console.error('[useRevenueCat] Failed to restore purchases:', err);
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [isAvailable, isIOS, isWeb, isInitialized, refreshOfferings]);

  return {
    offerings,
    isLoading,
    error,
    isInitialized,
    isAvailable,
    purchasePackage,
    restorePurchases,
    refreshOfferings,
  };
}


