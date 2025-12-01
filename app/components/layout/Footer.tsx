// app/components/layout/Footer.tsx
import React, { useState, useEffect } from "react";
import { useLocation } from "@remix-run/react";

export function Footer() {
  const location = useLocation();
  const isHomepage = location.pathname === '/';
  const [showFooter, setShowFooter] = useState(!isHomepage); // Hide on homepage initially

  useEffect(() => {
    if (!isHomepage) {
      // Always show footer on non-homepage pages
      setShowFooter(true);
      return;
    }

    // For homepage, only show footer when scrolled to the very bottom
    const handleScroll = () => {
      // Check multiple scroll containers
      const windowHeight = window.innerHeight;
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
      const documentHeight = Math.max(
        document.body.scrollHeight,
        document.body.offsetHeight,
        document.documentElement.clientHeight,
        document.documentElement.scrollHeight,
        document.documentElement.offsetHeight
      );
      
      // Calculate distance from bottom
      const scrollBottom = scrollTop + windowHeight;
      const distanceFromBottom = documentHeight - scrollBottom;
      
      // Only show footer when user is at or very close to the absolute bottom (within 5px)
      // This ensures footer ONLY appears when user scrolls ALL the way down
      const isAtBottom = distanceFromBottom <= 5 && scrollTop > 0;
      
      // On homepage, hide footer completely unless at absolute bottom
      setShowFooter(isAtBottom);
    };

    // Add scroll listener with throttling
    let ticking = false;
    const throttledHandleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          handleScroll();
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', throttledHandleScroll, { passive: true });
    
    // Check initial position - should be hidden if not at bottom
    // Wait for page to fully load
    const checkInitial = () => {
      setTimeout(() => {
        handleScroll();
      }, 200);
    };
    
    if (document.readyState === 'complete') {
      checkInitial();
    } else {
      window.addEventListener('load', checkInitial, { once: true });
    }
    
    // Also check on resize
    window.addEventListener('resize', handleScroll, { passive: true });
    
    return () => {
      window.removeEventListener('scroll', throttledHandleScroll);
      window.removeEventListener('resize', handleScroll);
      window.removeEventListener('load', checkInitial);
    };
  }, [isHomepage]);

  return (
    <footer className="fixed bottom-0 left-0 right-0 bg-bolt-elements-background-depth-2 border-t border-bolt-elements-borderColor z-10" style={{ minHeight: '48px' }}>
      <div className="container mx-auto px-2 sm:px-4 py-2 sm:py-2 flex flex-col sm:flex-row justify-between items-center gap-2 sm:gap-0 footer-content">
        <div className="grid grid-cols-3 gap-x-4 gap-y-2 sm:flex sm:flex-wrap sm:items-center sm:justify-center sm:justify-start sm:gap-1 sm:gap-2 text-xs sm:text-sm footer-links w-full sm:w-auto">
          {/* Row 1: 3 links */}
          <a
            href="https://app.termly.io/policy-viewer/policy.html?policyUUID=703879d9-2497-4dc4-9ae0-7c6049a0905b"
            target="_blank"
            rel="noopener noreferrer"
            className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary transition-colors whitespace-nowrap"
          >
            Privacy Policy
          </a>
          <a
            href="https://app.termly.io/policy-viewer/policy.html?policyUUID=9487f080-3ecd-45f6-8fb7-85d4d9420554"
            target="_blank"
            rel="noopener noreferrer"
            className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary transition-colors whitespace-nowrap"
          >
            Terms & Conditions
          </a>
          <a
            href="/page/about"
            className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary transition-colors whitespace-nowrap"
          >
            About Us
          </a>
          {/* Row 2: 3 links */}
          <a
            href="/page/technology"
            className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary transition-colors whitespace-nowrap"
          >
            Technology
          </a>
          <a
            href="/page/disclaimer"
            className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary transition-colors whitespace-nowrap"
          >
            Disclaimer
          </a>
          <a
            href="/page/video-tutorial"
            className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary transition-colors whitespace-nowrap"
          >
            Video Tutorial
          </a>
        </div>
        <div className="text-xs sm:text-sm text-bolt-elements-textTertiary copyright whitespace-nowrap text-center sm:text-left w-full sm:w-auto mt-2 sm:mt-0">
          © {new Date().getFullYear()} 10XTraders.AI
        </div>
      </div>
    </footer>
  );
}
