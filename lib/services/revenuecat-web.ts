import { publicConfig } from '@/lib/env';
import { Purchases } from '@revenuecat/purchases-js';

// Type definitions matching RevenueCat JS SDK
export interface RevenueCatOffering {
  identifier: string;
  serverDescription: string;
  availablePackages: RevenueCatPackage[];
}

export interface RevenueCatPackage {
  identifier: string;
  packageType: string;
  product: RevenueCatProduct;
  offeringIdentifier: string;
}

export interface RevenueCatProduct {
  identifier: string;
  description: string;
  title: string;
  price: number;
  priceString: string;
  currencyCode: string;
  introPrice?: RevenueCatIntroPrice | null;
  subscriptionPeriod?: string | null;
  subscriptionGroupIdentifier?: string | null;
}

export interface RevenueCatIntroPrice {
  price: number;
  priceString: string;
  period: string;
  cycles: number;
  periodNumberOfUnits: number;
  periodUnit: string;
}

export interface RevenueCatCustomerInfo {
  entitlements: {
    active: Record<string, RevenueCatEntitlementInfo>;
    all: Record<string, RevenueCatEntitlementInfo>;
  };
  activeSubscriptions: string[];
  allPurchasedProductIdentifiers: string[];
  latestExpirationDate: string | null;
  firstSeen: string;
  originalAppUserId: string;
  managementURL: string | null;
  originalApplicationVersion: string | null;
  originalPurchaseDate: string | null;
  requestDate: string;
}

export interface RevenueCatEntitlementInfo {
  identifier: string;
  isActive: boolean;
  willRenew: boolean;
  periodType: string;
  latestPurchaseDate: string;
  originalPurchaseDate: string;
  expirationDate: string | null;
  store: string;
  productIdentifier: string;
  isSandbox: boolean;
  unsubscribeDetectedAt: string | null;
  billingIssueDetectedAt: string | null;
  gracePeriodExpiresDate: string | null;
}

class RevenueCatWebService {
  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;
  private purchasesInstance: Purchases | null = null;

  /**
   * Initialize RevenueCat for web platform
   */
  async initialize(appUserID?: string): Promise<void> {
    if (this.isInitialized) {
      console.log('[RevenueCat Web] Already initialized');
      return;
    }

    // If initialization is in progress, wait for it
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this._initialize(appUserID);
    return this.initializationPromise;
  }

  private async _initialize(appUserID?: string): Promise<void> {
    try {
      // Use Web Billing API key (platform-specific)
      // @ts-ignore - Next.js replaces this at build time
      const webApiKey = (process.env.NEXT_PUBLIC_REVENUECAT_WEB_API_KEY as string | undefined) ?? null;
      const legacyApiKey = publicConfig.NEXT_PUBLIC_REVENUECAT_API_KEY;
      const apiKey = webApiKey || legacyApiKey;
      
      if (!apiKey) {
        throw new Error('RevenueCat Web API key is required. Set NEXT_PUBLIC_REVENUECAT_WEB_API_KEY environment variable.');
      }

      // Configure RevenueCat for web - returns a Purchases instance
      // appUserId is required, so use a generated ID if not provided
      const userId = appUserID || Purchases.generateRevenueCatAnonymousAppUserId();
      this.purchasesInstance = Purchases.configure({
        apiKey,
        appUserId: userId,
      });

      this.isInitialized = true;
      console.log('[RevenueCat Web] Initialized successfully', { appUserID: appUserID || 'anonymous' });
    } catch (error) {
      console.error('[RevenueCat Web] Initialization failed:', error);
      this.initializationPromise = null;
      throw error;
    }
  }

  /**
   * Get the Purchases instance (singleton)
   */
  private getInstance(): Purchases {
    if (!this.purchasesInstance) {
      this.purchasesInstance = Purchases.getSharedInstance();
    }
    return this.purchasesInstance;
  }

  /**
   * Set app user ID (for identifying users)
   */
  async setAppUserID(appUserID: string): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize(appUserID);
      return;
    }

    try {
      const instance = this.getInstance();
      await instance.identifyUser(appUserID);
      console.log('[RevenueCat Web] Set app user ID:', appUserID);
    } catch (error) {
      console.error('[RevenueCat Web] Failed to set app user ID:', error);
      throw error;
    }
  }

  /**
   * Get available offerings
   */
  async getOfferings(): Promise<RevenueCatOffering | null> {
    if (!this.isInitialized) {
      throw new Error('RevenueCat is not initialized. Call initialize() first.');
    }

    try {
      const instance = this.getInstance();
      const offerings = await instance.getOfferings();
      
      // Return current offering if available
      if (offerings.current) {
        return offerings.current as unknown as RevenueCatOffering;
      }

      // Fallback to first available offering
      if (offerings.all && Object.keys(offerings.all).length > 0) {
        const firstOfferingKey = Object.keys(offerings.all)[0];
        return offerings.all[firstOfferingKey] as unknown as RevenueCatOffering;
      }

      return null;
    } catch (error) {
      console.error('[RevenueCat Web] Failed to get offerings:', error);
      throw error;
    }
  }

  /**
   * Purchase a package
   */
  async purchasePackage(packageToPurchase: RevenueCatPackage): Promise<{ customerInfo: RevenueCatCustomerInfo }> {
    if (!this.isInitialized) {
      throw new Error('RevenueCat is not initialized. Call initialize() first.');
    }

    try {
      const instance = this.getInstance();
      const result = await instance.purchase(packageToPurchase as any);
      const { customerInfo } = result;

      console.log('[RevenueCat Web] Purchase successful');
      return { customerInfo: customerInfo as unknown as RevenueCatCustomerInfo };
    } catch (error: any) {
      console.error('[RevenueCat Web] Purchase failed:', error);
      
      // Handle user cancellation gracefully
      if (error?.code === 'PURCHASE_CANCELLED' || error?.userCancelled) {
        throw new Error('Purchase was cancelled');
      }
      
      throw new Error(error?.message || 'Purchase failed');
    }
  }

  /**
   * Get customer info
   */
  async getCustomerInfo(): Promise<RevenueCatCustomerInfo> {
    if (!this.isInitialized) {
      throw new Error('RevenueCat is not initialized. Call initialize() first.');
    }

    try {
      const instance = this.getInstance();
      const customerInfo = await instance.getCustomerInfo();
      return customerInfo as unknown as RevenueCatCustomerInfo;
    } catch (error) {
      console.error('[RevenueCat Web] Failed to get customer info:', error);
      throw error;
    }
  }

  /**
   * Restore purchases (sync customer info)
   * Note: RevenueCat JS SDK doesn't have a restorePurchases method
   * Instead, we sync by getting customer info which refreshes from server
   */
  async restorePurchases(): Promise<RevenueCatCustomerInfo> {
    if (!this.isInitialized) {
      throw new Error('RevenueCat is not initialized. Call initialize() first.');
    }

    try {
      const instance = this.getInstance();
      // Get customer info to sync with server (this acts as restore)
      const customerInfo = await instance.getCustomerInfo();
      console.log('[RevenueCat Web] Purchases synced');
      return customerInfo as unknown as RevenueCatCustomerInfo;
    } catch (error) {
      console.error('[RevenueCat Web] Failed to sync purchases:', error);
      throw error;
    }
  }

  /**
   * Check if user has active entitlement
   */
  async hasActiveEntitlement(entitlementIdentifier: string): Promise<boolean> {
    try {
      const customerInfo = await this.getCustomerInfo();
      return customerInfo.entitlements.active[entitlementIdentifier]?.isActive === true;
    } catch (error) {
      console.error('[RevenueCat Web] Failed to check entitlement:', error);
      return false;
    }
  }
}

export const revenueCatWebService = new RevenueCatWebService();

