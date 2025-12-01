// app/components/layout/Footer.client.tsx
import React from "react";

export function Footer() {
  return (
    <footer className="w-full min-h-[48px] bg-bolt-elements-background-depth-2 border-t border-bolt-elements-borderColor flex items-center mt-4">
      <div className="w-full px-3 sm:px-4 py-2 flex flex-row items-center justify-between gap-2 sm:gap-4">
        {/* Links Container - Single Row, All Links Visible */}
        <div className="flex flex-row items-center gap-1.5 sm:gap-2.5 flex-1 min-w-0">
          <a
            href="https://app.termly.io/policy-viewer/policy.html?policyUUID=703879d9-2497-4dc4-9ae0-7c6049a0905b"
            target="_blank"
            rel="noopener noreferrer"
            className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary transition-colors whitespace-nowrap text-[10px] sm:text-xs flex-shrink-0"
          >
            Privacy Policy
          </a>
          <a
            href="https://app.termly.io/policy-viewer/policy.html?policyUUID=9487f080-3ecd-45f6-8fb7-85d4d9420554"
            target="_blank"
            rel="noopener noreferrer"
            className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary transition-colors whitespace-nowrap text-[10px] sm:text-xs flex-shrink-0"
          >
            Terms & Conditions
          </a>
          <a
            href="/page/about"
            className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary transition-colors whitespace-nowrap text-[10px] sm:text-xs flex-shrink-0"
          >
            About Us
          </a>
          <a
            href="/page/technology"
            className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary transition-colors whitespace-nowrap text-[10px] sm:text-xs flex-shrink-0"
          >
            Technology
          </a>
          <a
            href="/page/disclaimer"
            className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary transition-colors whitespace-nowrap text-[10px] sm:text-xs flex-shrink-0"
          >
            Disclaimer
          </a>
          <a
            href="/page/video-tutorial"
            className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary transition-colors whitespace-nowrap text-[10px] sm:text-xs flex-shrink-0"
          >
            Video Tutorial
          </a>
        </div>
        {/* Copyright */}
        <div className="text-[10px] sm:text-xs text-bolt-elements-textTertiary whitespace-nowrap flex-shrink-0 ml-2">
          © {new Date().getFullYear()} 10XTraders.AI
        </div>
      </div>
    </footer>
  );
}
