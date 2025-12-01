import React from 'react';
import { useNavigate } from '@remix-run/react';
import { useStore } from '@nanostores/react';
import { classNames } from '~/utils/classNames';
import { workbenchStore } from '~/lib/stores/workbench';
import { chatStore } from '~/lib/stores/chat';
import { authStore, hasAccess } from '~/lib/stores/auth';

interface CustomBotSectionProps {
  onNavigate?: () => void;
}

export function CustomBotSection({ onNavigate }: CustomBotSectionProps) {
  const navigate = useNavigate();
  const { isAuthenticated } = useStore(authStore);

  const handleOpenLabs = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Check authentication first (same as bot cards)
    if (!hasAccess(isAuthenticated)) {
      console.log('[CustomBotSection] User not authenticated, showing auth dialog');
      if (onNavigate) {
        onNavigate();
      } else {
        // Dispatch event to show auth dialog
        const authEvent = new CustomEvent('showAuthDialog', {
          detail: { 
            reason: 'custom_bot',
            strategyName: 'Custom System' 
          }
        });
        window.dispatchEvent(authEvent);
      }
      return;
    }
    
    // User is authenticated, open workbench for custom input
    console.log('[CustomBotSection] Opening workbench for custom bot');
    workbenchStore.showWorkbench.set(true);
    chatStore.setKey('showChat', true);
    chatStore.setKey('started', true);
    
    // Don't auto-send - let user type their own prompt
    setTimeout(() => {
      const event = new CustomEvent('botPromptSelected', {
        detail: { 
          prompt: '',
          strategyId: 'custom',
          strategyName: 'Custom System',
          autoSend: false
        }
      });
      window.dispatchEvent(event);
      
      // Focus the textarea after a short delay
      setTimeout(() => {
        const textarea = document.querySelector('textarea');
        if (textarea) {
          textarea.focus();
        }
      }, 100);
    }, 100);
  };

  return (
    <div className="group relative flex flex-col items-start justify-between gap-4 card-standard transition-all duration-300 hover:-translate-y-1">
      {/* Content */}
      <div className="flex flex-col gap-3 flex-1 w-full">
        <h3 className="text-lg sm:text-xl font-bold text-bolt-elements-textPrimary group-hover:text-accent-500 transition-colors text-center">
          Custom System
        </h3>
        <p className="text-sm text-bolt-elements-textSecondary leading-relaxed">
          Build your own multi-pair trading strategy from scratch. Define custom indicators (RSI, MACD, Bollinger Bands), 
          set precise entry and exit rules, configure risk management parameters, and deploy across multiple trading pairs. 
          Perfect for experienced traders who want complete control over their trading logic.
        </p>
      </div>

      {/* Open 10X Labs Button */}
      <button
        onClick={handleOpenLabs}
        className="w-full btn-outline-accent text-sm sm:text-base flex items-center justify-center gap-2 group/button"
      >
        <span>Open 10X Labs</span>
        <div className="i-ph:arrow-right text-sm transition-transform group-hover/button:translate-x-1" />
      </button>
    </div>
  );
}

