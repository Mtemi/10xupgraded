import React from 'react';
import { useNavigate } from '@remix-run/react';
import { useStore } from '@nanostores/react';
import { classNames } from '~/utils/classNames';
import type { StrategyCard } from '~/lib/types/strategy';
import { authStore, hasAccess } from '~/lib/stores/auth';
import { workbenchStore } from '~/lib/stores/workbench';
import { chatStore } from '~/lib/stores/chat';

interface TradingBotCardProps {
  strategy: StrategyCard;
  onStartBot?: (strategyId: string) => void;
}

export function TradingBotCard({ strategy, onStartBot }: TradingBotCardProps) {
  const { isAuthenticated } = useStore(authStore);
  const navigate = useNavigate();
  
  const handleStartBot = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Check authentication first
    if (!hasAccess(isAuthenticated)) {
      console.log('[TradingBotCard] User not authenticated, showing auth dialog');
      // Dispatch event to show auth dialog
      const authEvent = new CustomEvent('showAuthDialog', {
        detail: { 
          reason: 'bot_start',
          strategyName: strategy.name 
        }
      });
      window.dispatchEvent(authEvent);
      return;
    }
    
    if (onStartBot) {
      onStartBot(strategy.id);
    } else {
      // User is authenticated, dispatch event to send prompt directly (no navigation)
      if (strategy.prompt) {
        console.log('[TradingBotCard] User authenticated, dispatching prompt event');
        
        // Open workbench immediately
        workbenchStore.showWorkbench.set(true);
        chatStore.setKey('showChat', true);
        chatStore.setKey('started', true);
        
        // Dispatch event to send the prompt directly - no navigation needed
        setTimeout(() => {
          const event = new CustomEvent('botPromptSelected', {
            detail: { 
              prompt: strategy.prompt, 
              strategyId: strategy.id, 
              strategyName: strategy.name,
              autoSend: true
            }
          });
          window.dispatchEvent(event);
        }, 100);
      }
    }
  };

  const formatProfit = (value: number): string => {
    return `+${value.toFixed(2)}%`;
  };

  return (
    <div className="group relative flex flex-col card-standard transition-all duration-300 hover:-translate-y-1 min-h-[240px]">
      {/* Icon - Top Left */}
      <div className="flex items-center justify-between mb-4">
        <div className="w-10 h-10 rounded-lg bg-accent-500/10 flex items-center justify-center text-accent-500">
          <div className={classNames(
            strategy.icon || 'i-ph:chart-line-up',
            'text-2xl leading-none'
          )} />
        </div>
        {/* Optional: Status badge or indicator */}
      </div>

      {/* Strategy Name */}
      <h3 className="text-lg sm:text-xl font-bold text-bolt-elements-textPrimary mb-2 group-hover:text-accent-500 transition-colors">
        {strategy.name}
      </h3>

      {/* Strategy Description */}
      <p className="text-sm text-bolt-elements-textSecondary mb-6 flex-1 leading-relaxed line-clamp-3">
        {strategy.description}
      </p>

      {/* Performance Metrics - Live Data from Bot API */}
      <div className="flex items-center gap-4 mb-6 pb-4 border-b border-bolt-elements-borderColor">
        <div className="flex flex-col">
          <span className="text-xs text-bolt-elements-textTertiary mb-1">Best Pair</span>
          <span className="text-base sm:text-lg font-semibold text-cyan-500">
            {strategy.metrics.best_pair}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-xs text-bolt-elements-textTertiary mb-1">Profit</span>
          <span className="text-base sm:text-lg font-semibold text-accent-500">
            {formatProfit(strategy.metrics.profit_pct)}
          </span>
        </div>
      </div>

      {/* Start Bot Button */}
      <button
        onClick={handleStartBot}
        className="w-full btn-primary text-sm sm:text-base flex items-center justify-center gap-2 group/button"
      >
        <span>Start Bot</span>
        <div className="i-ph:arrow-right text-sm transition-transform group-hover/button:translate-x-1" />
      </button>
    </div>
  );
}

