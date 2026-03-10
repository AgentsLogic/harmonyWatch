"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { usePageCache } from "../contexts/page-cache-context";

export function PageCapture() {
  const pathname = usePathname();
  const previousPathnameRef = useRef<string | null>(null);
  const { cachePage } = usePageCache();

  useEffect(() => {
    // When pathname changes, cache the previous page
    if (previousPathnameRef.current && previousPathnameRef.current !== pathname) {
      // Use requestAnimationFrame to ensure DOM is ready
      requestAnimationFrame(() => {
        // Get the main content area HTML (excluding header, nav, etc.)
        const mainContent = document.querySelector('[data-page-content]') || document.body;
        if (mainContent) {
          // Clone the element to avoid mutating the original
          const clone = mainContent.cloneNode(true) as HTMLElement;
          
          // Remove inline styles that contain calculated values (like paddingLeft from RowShelf)
          // This ensures the cached HTML doesn't interfere with fresh layout calculations
          const removeCalculatedStyles = (el: HTMLElement) => {
            // Remove style attribute from elements that have dynamic paddingLeft
            const elementsWithStyle = el.querySelectorAll('[style*="padding-left"], [style*="paddingLeft"]');
            elementsWithStyle.forEach((elem) => {
              const htmlElem = elem as HTMLElement;
              const style = htmlElem.getAttribute('style');
              if (style) {
                // Remove padding-left from inline styles
                const newStyle = style.replace(/padding-left[^;]*;?/gi, '').replace(/paddingLeft[^;]*;?/gi, '');
                if (newStyle.trim()) {
                  htmlElem.setAttribute('style', newStyle.trim());
                } else {
                  htmlElem.removeAttribute('style');
                }
              }
            });
          };
          
          removeCalculatedStyles(clone);
          
          const html = clone.innerHTML;
          cachePage(previousPathnameRef.current!, html);
        }
      });
    }

    previousPathnameRef.current = pathname;
  }, [pathname, cachePage]);

  return null;
}

