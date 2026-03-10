import { Purchases, LOG_LEVEL, PurchasesOffering, PurchasesPackage } from '@revenuecat/purchases-capacitor';
import { Capacitor } from '@capacitor/core';
import { publicConfig } from '@/lib/env';

// Type for customer info - inferred from Purchases methods
type CustomerInfo = Awaited<ReturnType<typeof Purchases.getCustomerInfo>>;

// Type for purchase result - inferred from Purchases.purchasePackage
type PurchaseResult = Awaited<ReturnType<typeof Purchases.purchasePackage>>;

export interface RevenueCatConfig {
  apiKey: string;
  appUserID?: string;
}

class RevenueCatService {
  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;

  /**
   * Check if RevenueCat is available (iOS only)
   */
  isAvailable(): boolean {
    return Capacitor.getPlatform() === 'ios';
  }

  /**
   * Initialize RevenueCat SDK
   */
  async initialize(config?: RevenueCatConfig): Promise<void> {
    if (!this.isAvailable()) {
      console.log('[RevenueCat] Not available on this platform');
      return;
    }

    if (this.isInitialized) {
      console.log('[RevenueCat] Already initialized');
      return;
    }

    // If initialization is in progress, wait for it
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this._initialize(config);
    return this.initializationPromise;
  }

  private async _initialize(config?: RevenueCatConfig): Promise<void> {
    try {
      // Set log level for debugging in development
      if (process.env.NODE_ENV === 'development') {
        await Purchases.setLogLevel({ level: LOG_LEVEL.DEBUG });
        console.log('[RevenueCat] Debug logging enabled');
      }

      const apiKey = config?.apiKey || publicConfig.NEXT_PUBLIC_REVENUECAT_API_KEY;
      if (!apiKey) {
        throw new Error('RevenueCat API key is required. Set REVENUECAT_API_KEY or NEXT_PUBLIC_REVENUECAT_API_KEY environment variable.');
      }

      const appUserID = config?.appUserID;

      await Purchases.configure({
        apiKey,
        appUserID,
      });

      this.isInitialized = true;
      console.log('[RevenueCat] Initialized successfully', { appUserID: appUserID || 'anonymous' });
    } catch (error) {
      console.error('[RevenueCat] Initialization failed:', error);
      this.initializationPromise = null;
      throw error;
    }
  }

  /**
   * Get available offerings
   */
  async getOfferings(): Promise<PurchasesOffering | null> {
    if (!this.isAvailable()) {
      throw new Error('RevenueCat is only available on iOS');
    }

    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const offerings = await Purchases.getOfferings();
      return offerings.current;
    } catch (error) {
      console.error('[RevenueCat] Failed to get offerings:', error);
      throw error;
    }
  }

  /**
   * Purchase a package
   */
  async purchasePackage(packageToPurchase: PurchasesPackage): Promise<PurchaseResult> {
    if (!this.isAvailable()) {
      throw new Error('RevenueCat is only available on iOS');
    }

    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const result = await Purchases.purchasePackage({ aPackage: packageToPurchase });
      console.log('[RevenueCat] Purchase successful', { productIdentifier: result.productIdentifier });
      return result;
    } catch (error) {
      const purchasesError = error as any;
      console.error('[RevenueCat] Purchase failed:', purchasesError);
      
      // Handle user cancellation gracefully
      if (purchasesError?.code === 'PURCHASE_CANCELLED') {
        throw new Error('Purchase was cancelled');
      }
      
      throw new Error(purchasesError?.message || 'Purchase failed');
    }
  }

  /**
   * Restore purchases
   */
  async restorePurchases(): Promise<CustomerInfo> {
    if (!this.isAvailable()) {
      throw new Error('RevenueCat is only available on iOS');
    }

    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const customerInfo = await Purchases.restorePurchases();
      console.log('[RevenueCat] Purchases restored');
      return customerInfo;
    } catch (error) {
      console.error('[RevenueCat] Failed to restore purchases:', error);
      throw error;
    }
  }

  /**
   * Get customer info
   */
  async getCustomerInfo(): Promise<CustomerInfo> {
    if (!this.isAvailable()) {
      throw new Error('RevenueCat is only available on iOS');
    }

    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const customerInfo = await Purchases.getCustomerInfo();
      return customerInfo;
    } catch (error) {
      console.error('[RevenueCat] Failed to get customer info:', error);
      throw error;
    }
  }

  /**
   * Check if user has active entitlement
   */
  async hasActiveEntitlement(entitlementIdentifier: string): Promise<boolean> {
    try {
      const customerInfo = await this.getCustomerInfo();
      // Type assertion to ensure TypeScript recognizes the structure
      const info = customerInfo as any;
      return info?.entitlements?.active?.[entitlementIdentifier] !== undefined;
    } catch (error) {
      console.error('[RevenueCat] Failed to check entitlement:', error);
      return false;
    }
  }
}

export const revenueCatService = new RevenueCatService();


