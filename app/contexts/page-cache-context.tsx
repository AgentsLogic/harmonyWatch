"use client";

import { createContext, useContext, useRef, useCallback, ReactNode } from "react";

interface CachedPage {
  html: string;
  timestamp: number;
}

interface PageCacheContextType {
  cachePage: (pathname: string, html: string) => void;
  getCachedPage: (pathname: string) => CachedPage | null;
  clearCache: (pathname?: string) => void;
}

const PageCacheContext = createContext<PageCacheContextType | undefined>(undefined);

export function PageCacheProvider({ children }: { children: ReactNode }) {
  const cacheRef = useRef<Map<string, CachedPage>>(new Map());
  const MAX_CACHE_SIZE = 10; // Keep last 10 pages
  const CACHE_EXPIRY = 5 * 60 * 1000; // 5 minutes

  const cachePage = useCallback((pathname: string, html: string) => {
    const cache = cacheRef.current;
    
    // Clear expired entries
    const now = Date.now();
    for (const [key, value] of cache.entries()) {
      if (now - value.timestamp > CACHE_EXPIRY) {
        cache.delete(key);
      }
    }

    // Remove oldest if at max size
    if (cache.size >= MAX_CACHE_SIZE) {
      const oldestKey = Array.from(cache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp)[0][0];
      cache.delete(oldestKey);
    }

    // Store current page
    cache.set(pathname, {
      html,
      timestamp: now,
    });
  }, []);

  const getCachedPage = useCallback((pathname: string): CachedPage | null => {
    const cached = cacheRef.current.get(pathname);
    if (!cached) return null;

    // Check if expired
    const now = Date.now();
    if (now - cached.timestamp > CACHE_EXPIRY) {
      cacheRef.current.delete(pathname);
      return null;
    }

    return cached;
  }, []);

  const clearCache = useCallback((pathname?: string) => {
    if (pathname) {
      cacheRef.current.delete(pathname);
    } else {
      cacheRef.current.clear();
    }
  }, []);

  return (
    <PageCacheContext.Provider value={{ cachePage, getCachedPage, clearCache }}>
      {children}
    </PageCacheContext.Provider>
  );
}

export function usePageCache() {
  const context = useContext(PageCacheContext);
  if (!context) {
    throw new Error("usePageCache must be used within PageCacheProvider");
  }
  return context;
}

