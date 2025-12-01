// app/components/layout/FooterNew.client.tsx
import React from "react";

export function FooterNew() {
  return (
    <footer style={{
      width: '100%',
      minHeight: '48px',
      backgroundColor: 'var(--bolt-elements-bg-depth-2)',
      border: '1px solid var(--bolt-elements-borderColor)',
      position: 'relative',
      zIndex: 1,
      marginTop: '2rem',
      flexShrink: 0
    }}>
      <div style={{
        width: '100%',
        padding: '1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem'
      }}>
        {/* Links Grid - 2 rows, 3 columns */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gridTemplateRows: 'repeat(2, auto)',
          gap: '0.5rem 1rem',
          width: '100%',
          justifyItems: 'center'
        }}>
          {/* Row 1, Column 1 */}
          <a
            href="https://app.termly.io/policy-viewer/policy.html?policyUUID=703879d9-2497-4dc4-9ae0-7c6049a0905b"
            target="_blank"
            rel="noopener noreferrer"
            className="footer-link"
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--bolt-elements-textPrimary)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--bolt-elements-textSecondary)'}
          >
            Privacy Policy
          </a>
          
          {/* Row 1, Column 2 */}
          <a
            href="https://app.termly.io/policy-viewer/policy.html?policyUUID=9487f080-3ecd-45f6-8fb7-85d4d9420554"
            target="_blank"
            rel="noopener noreferrer"
            className="footer-link"
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--bolt-elements-textPrimary)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--bolt-elements-textSecondary)'}
          >
            Terms & Conditions
          </a>
          
          {/* Row 1, Column 3 */}
          <a
            href="/page/about"
            className="footer-link"
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--bolt-elements-textPrimary)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--bolt-elements-textSecondary)'}
          >
            About Us
          </a>
          
          {/* Row 2, Column 1 */}
          <a
            href="/page/technology"
            className="footer-link"
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--bolt-elements-textPrimary)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--bolt-elements-textSecondary)'}
          >
            Technology
          </a>
          
          {/* Row 2, Column 2 */}
          <a
            href="/page/disclaimer"
            className="footer-link"
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--bolt-elements-textPrimary)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--bolt-elements-textSecondary)'}
          >
            Disclaimer
          </a>
          
          {/* Row 2, Column 3 */}
          <a
            href="/page/video-tutorial"
            className="footer-link"
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--bolt-elements-textPrimary)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--bolt-elements-textSecondary)'}
          >
            Video Tutorial
          </a>
        </div>
        
        {/* Copyright */}
        <div style={{
          color: 'var(--bolt-elements-textTertiary)',
          whiteSpace: 'nowrap',
          fontSize: '10px',
          textAlign: 'center',
          paddingTop: '0.5rem',
          borderTop: '1px solid var(--bolt-elements-borderColor)'
        }}>
          © {new Date().getFullYear()} 10XTraders.AI
        </div>
      </div>
      <style>{`
        .footer-link {
          color: var(--bolt-elements-textSecondary);
          text-decoration: none;
          white-space: nowrap;
          font-size: 10px;
          display: block;
          padding: 0.25rem 0;
          text-align: center;
        }
        @media (min-width: 640px) {
          .footer-link {
            font-size: 12px;
          }
        }
        @media (min-width: 1024px) {
          .footer-link {
            font-size: 14px;
          }
        }
      `}</style>
    </footer>
  );
}
