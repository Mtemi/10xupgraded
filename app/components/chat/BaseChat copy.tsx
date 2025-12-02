// app/components/chat/BaseChat.tsx
import type { RefCallback } from 'react';
import React, { useState } from 'react';
import { useStore } from '@nanostores/react';
import { ClientOnly } from 'remix-utils/client-only';
import { useEffect, useRef } from 'react';
import { Menu } from '~/components/sidebar/Menu.client';
import { IconButton } from '~/components/ui/IconButton';
import { Workbench } from '~/components/workbench/Workbench.client';
import { classNames } from '~/utils/classNames';
import { Messages } from './Messages.client';
import { SendButton } from './SendButton.client';
import styles from './BaseChat.module.scss';
import { estimateTokens, checkTokenAvailability, trackTokenUsage } from '~/lib/token-tracking';
import { TokenCounter } from '../subscription/TokenCounter';
import { supabase } from '~/lib/superbase/client';
import { authStore } from '~/lib/stores/auth';
import { AuthDialog } from '../auth/AuthDialog';
import { chatId, urlId } from '~/lib/persistence/useChatHistory';
import { workbenchStore } from '~/lib/stores/workbench';
import { toast } from 'react-toastify';
import { fileModificationsToHTML } from '~/utils/diff';
import { SocialMediaWidgets } from '~/components/ui/SocialMediaWidgets';

interface BaseChatProps {
  textareaRef?: React.RefObject<HTMLTextAreaElement>;
  messageRef?: RefCallback<HTMLDivElement>;
  scrollRef?: RefCallback<HTMLDivElement>;
  showChat?: boolean;
  chatStarted?: boolean;
  isStreaming?: boolean;
  messages?: Array<{ role: string; content: string }>;
  input?: string;
  sendMessage?: (event: React.UIEvent, messageInput?: string) => void;
  handleInputChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  handleStop?: () => void;
  enhancingPrompt?: boolean;
  promptEnhanced?: boolean;
  enhancePrompt?: () => void;
}

const EXAMPLE_PROMPTS = [
  {
    text: 'AI Macro-Defense: Multi-Pair Volatility Hedge System',
    fullPrompt: `1️⃣ AI Macro-Defense: Multi-Pair Volatility Hedge System

Concept: Detect volatility clusters and hedge dynamically across correlated pairs.
Why advanced: Cross-pair correlation matrix, volatility regimes, dynamic sizing, capital-preservation logic.
User takeaway: Protect capital before the crash — not after.

Create a multi-pair adaptive trading strategy that detects volatility clusters and cross-pair correlations.
Use Bollinger Band Width, ATR, and correlation matrices across BTC, ETH, and SOL.
When volatility spikes, reduce long exposure or hedge with inverse pairs.
Include dynamic position sizing, volatility regime labeling, and real-time alert logic.
Output a Freqtrade-ready strategy (5m–1h) with ROI table, stoploss, and trailing logic.`
  },
  {
    text: 'RSI Momentum Trader — Short-Term Mean-Reversion Engine',
    fullPrompt: `2️⃣ RSI Momentum Trader — Short-Term Mean-Reversion Engine

Build an RSI-based short-term trading system that continuously monitors on 5-minute candles.
Enter long when RSI < 50 and short when RSI > 50, use dynamic stop-loss and profit-targets, and size positions adaptively..`
  },
  {
    text: 'Order Flow Sentinel: L2 Liquidity & Trade-Cluster Detection System',
    fullPrompt: `3️⃣ Order Flow Sentinel: L2 Liquidity & Trade-Cluster Detection System

Concept: Detects accumulation/distribution in order book depth and trade clusters to anticipate breakout direction.
Why advanced: Uses real-time L2 data (bid/ask imbalance, order-book slope) and micro-structure patterns.
User takeaway: Read the order flow like a market maker.

Design a strategy that consumes L2 order-book data and trade ticks to detect liquidity imbalance.
Compute bid/ask depth ratio, delta, and volume clusters around key price levels.
When buy-side absorption > threshold, anticipate upward breakout; when sell-side stacks, expect reversal.
Combine with volume delta and short-term momentum for confirmation.
Output a Freqtrade-compatible strategy that operates on 1m–5m data and adapts thresholds by volatility regime.`
  },
  {
    text: 'Spread Arbitrage: Cross-Exchange Funding-Rate Convergence Engine',
    fullPrompt: `4️⃣ Spread Arbitrage: Cross-Exchange Funding-Rate Convergence Engine

Concept: Arbitrages funding-rate differentials across exchanges using synthetic pair hedges.
Why advanced: Real-time funding-rate analysis, latency-aware execution, capital-neutral arbitrage logic.
User takeaway: Capture yield from funding-rate mispricing — flat market exposure.

Develop a cross-exchange arbitrage strategy that detects funding-rate differentials between perpetual markets (e.g., Binance vs Bitget).
When funding spread exceeds threshold, open long on low-rate exchange and short on high-rate one.
Include position balancing, rate normalization, and auto-hedging for equal notional exposure.
Implement auto-close when convergence < epsilon or after predefined hours.
Output modular Freqtrade-ready code with configurable funding source, risk cap, and exchange selection.`
  },
  {
    text: 'AI Micro-Scalper: High Frequency Market-Reaction & Execution Engine',
    fullPrompt: `5️⃣ AI Micro-Scalper: High Frequency Market-Reaction & Execution Engine

Concept: Ultra-fast scalping system that detects micro-price movements and executes rapid trades with tight spreads.
Why advanced: Sub-second decision making, orderbook momentum detection, micro-volatility clustering, latency-optimized execution.
User takeaway: Capture small price inefficiencies with high win-rate and tight risk control.

Build a high-frequency micro-scalping strategy that monitors 1m/5m candles and order flow for rapid entry/exit signals.
Use price action micro-patterns, bid-ask spread analysis, and volume spike detection for ultra-short-term trades.
Implement tight stop-loss (0.1-0.3%), rapid profit-taking (0.2-0.5%), and high trade frequency logic.
Include position sizing based on current volatility, trade throttling to prevent overtrading, and slippage protection.
Add micro-drawdown protection that pauses trading when consecutive losses exceed threshold.
Output a Freqtrade-ready strategy optimized for 1m-5m timeframes with configurable risk parameters and execution speed controls.`
  },
];

const EXCHANGES = ['Binance', 'Kraken', 'Coinbase', 'Bitget', 'OKX', 'Bybit'];

// Fixed textarea heights to prevent flipping
const TEXTAREA_HEIGHT_MOBILE = 200; // Fixed height for mobile
const TEXTAREA_HEIGHT_DESKTOP = 130; // Fixed height for desktop
const TEXTAREA_HEIGHT_CHAT_MOBILE = 80; // Fixed height for mobile when chat started
const TEXTAREA_HEIGHT_CHAT_DESKTOP = 100; // Fixed height for desktop when chat started

// Simple client-side token estimation (4 chars per token)
const estimateTokensLocal = (text: string): number => {
  return Math.ceil(text.length / 4);
};

// Token validation state management
interface TokenValidationState {
  isValidating: boolean;
  pendingAbort?: () => void;
}

export const BaseChat = React.forwardRef<HTMLDivElement, BaseChatProps>(
  (
    {
      textareaRef,
      messageRef,
      scrollRef,
      showChat = true,
      chatStarted = false,
      isStreaming = false,
      messages = [],
      input = '',
      sendMessage,
      handleInputChange,
      handleStop,
      enhancingPrompt = false,
      promptEnhanced = false,
      enhancePrompt,
    },
    ref
  ) => {
    const showSend = input.trim().length > 0 || isStreaming;
    const { isAuthenticated } = useStore(authStore);
    const showWorkbench = useStore(workbenchStore.showWorkbench);

    // Ref for prompt bar
    const promptRef = useRef<HTMLDivElement>(null);

    // Add state for auth dialog
    const [showAuthDialog, setShowAuthDialog] = useState(false);
    const [pendingMessage, setPendingMessage] = useState<string>('');
    const [tokenValidation, setTokenValidation] = useState<TokenValidationState>({ isValidating: false });
    const [userData, setUserData] = useState<any>(null);
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    // Ensure chatId/urlId are restored from URL on refresh
    useEffect(() => {
      if (typeof window !== 'undefined') {
        const parts = window.location.pathname.split('/').filter(Boolean);
        const last = parts[parts.length - 1] || '';
        // Accept ids like chat_xxx... or chat_me...
        if (last && (last.startsWith('chat_') || last.startsWith('chat'))) {
          try {
            urlId.set(last);
            chatId.set(last);
            console.log('[BaseChat] Restored chatId/urlId from URL:', last);
          } catch (e) {
            console.warn('[BaseChat] Failed to restore chatId/urlId from URL:', e);
          }
        }
      }
    }, []);

    // Fetch user data when authenticated
    useEffect(() => {
      const fetchUserData = async () => {
        if (!isAuthenticated) {
          setUserData(null);
          return;
        }

        try {
          const { data: { user }, error } = await supabase.auth.getUser();
          if (error || !user) {
            setUserData(null);
            return;
          }

          setUserData({
            ...user,
            user_metadata: {
              ...user.user_metadata,
              avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture || "/profile.png",
            }
          });
        } catch (error) {
          console.error('Error fetching user data:', error);
          setUserData(null);
        }
      };

      fetchUserData();
    }, [isAuthenticated]);

    // Track menu open state by monitoring mouse position
    useEffect(() => {
      const handleMouseMove = (event: MouseEvent) => {
        const enterThreshold = 40;
        const exitThreshold = 340;

        if (event.pageX < enterThreshold) {
          setIsMenuOpen(true);
        } else if (event.pageX > exitThreshold && !document.querySelector('.side-menu:hover')) {
          setIsMenuOpen(false);
        }
      };

      window.addEventListener('mousemove', handleMouseMove);
      return () => window.removeEventListener('mousemove', handleMouseMove);
    }, []);

    useEffect(() => {
      if (showAuthDialog && isAuthenticated && pendingMessage) {
        // Close dialog and flush the pending message
        setShowAuthDialog(false);
        const syntheticEvent = { preventDefault: () => {} } as React.UIEvent;
        sendMessage?.(syntheticEvent, pendingMessage);
        setPendingMessage('');
      }
    }, [showAuthDialog, isAuthenticated, pendingMessage, sendMessage]);

    // Get fixed textarea height based on screen size and chat state
    const getTextareaHeight = () => {
      if (typeof window === 'undefined') {
        return chatStarted ? TEXTAREA_HEIGHT_CHAT_DESKTOP : TEXTAREA_HEIGHT_DESKTOP;
      }

      const isMobile = window.innerWidth < 640;
      if (chatStarted) {
        return isMobile ? TEXTAREA_HEIGHT_CHAT_MOBILE : TEXTAREA_HEIGHT_CHAT_DESKTOP;
      }
      return isMobile ? TEXTAREA_HEIGHT_MOBILE : TEXTAREA_HEIGHT_DESKTOP;
    };

    const handleSendWithTokens = async (e: React.UIEvent, messageInput?: string, isExamplePrompt: boolean = false) => {
      const messageText = (messageInput ?? input).trim();
      if (!messageText) return;

      // ✅ Require auth before sending
      if (!isAuthenticated) {
        setPendingMessage(messageText);
        setShowAuthDialog(true);
        return;
      }

      // Start token validation in background
      setTokenValidation({ isValidating: true });

      // Create abort controller for potential cancellation
      const abortController = new AbortController();
      setTokenValidation(prev => ({ ...prev, pendingAbort: () => abortController.abort() }));

      // Send message immediately without waiting for token validation
      let messageProcessingStarted = false;

      try {
        // 1. Send message immediately for instant UI response
        await workbenchStore.saveAllFiles();
        const fileModifications = workbenchStore.getFileModifcations();

        // Prepare final message content
        const finalMessageContent = fileModifications !== undefined
          ? `${fileModificationsToHTML(fileModifications)}\n\n${messageText}`
          : messageText;

        // Start message processing immediately
        messageProcessingStarted = true;
        sendMessage?.(e, messageInput);

        // Clear input immediately for better UX
        if (!messageInput) {
          // Only clear if this wasn't from an example prompt
          // The sendMessage function will handle clearing for regular input
        }

        // 2. Validate tokens in parallel (async)
        const estimatedInputTokens = estimateTokensLocal(messageText);
        console.log('[BaseChat] Starting async token validation for', estimatedInputTokens, 'tokens');

        // Perform token validation asynchronously
        const tokenValidationPromise = (async () => {
          try {
            // Check if request was aborted
            if (abortController.signal.aborted) {
              console.log('[BaseChat] Token validation aborted');
              return { valid: false, aborted: true };
            }

            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
              throw new Error('User not authenticated');
            }

            // Check token availability
            const hasTokens = await checkTokenAvailability(user.id, estimatedInputTokens);

            if (!hasTokens) {
              console.log('[BaseChat] Insufficient tokens detected');
              return { valid: false, aborted: false };
            }

            // Track token usage
            await trackTokenUsage(user.id, estimatedInputTokens, 'script_generation');
            console.log('[BaseChat] Token validation successful');
            return { valid: true, aborted: false };

          } catch (error) {
            console.error('[BaseChat] Token validation error:', error);
            return { valid: false, aborted: false, error };
          }
        })();

        // 3. Handle token validation result when it completes
        tokenValidationPromise.then(({ valid, aborted, error }) => {
          setTokenValidation({ isValidating: false });

          if (aborted) {
            console.log('[BaseChat] Token validation was aborted');
            return;
          }

          if (!valid) {
            // Stop the AI processing if tokens are insufficient
            console.log('[BaseChat] Stopping AI processing due to insufficient tokens');
            handleStop?.();

            if (error) {
              toast.error('Token validation failed. Please try again.');
            }
            // Note: checkTokenAvailability already shows appropriate error messages
            return;
          }

          console.log('[BaseChat] Token validation completed successfully');
        }).catch(error => {
          console.error('[BaseChat] Unexpected error in token validation:', error);
          setTokenValidation({ isValidating: false });
          toast.error('An error occurred while validating tokens');
        });

      } catch (error) {
        console.error('[BaseChat] Error in handleSendWithTokens:', error);
        setTokenValidation({ isValidating: false });

        if (!messageProcessingStarted) {
          // If message processing hasn't started, start it now
          sendMessage?.(e, messageInput);
        }

        toast.error('An error occurred while processing your message');
      }
    };

    // === Video: PiP support ===
    const videoRef = useRef<HTMLVideoElement>(null);
    useEffect(() => {
      // Attempt to enter PiP automatically on homepage load (best effort; browser may require user gesture)
      if (!chatStarted && typeof document !== 'undefined' && videoRef.current) {
        const v = videoRef.current;
        const tryPiP = async () => {
          try {
            // Some browsers allow this with autoPictureInPicture; ignore errors if blocked
            // Ensure metadata is loaded and we can play
            await v.play().catch(() => {});
            if ('requestPictureInPicture' in v && !document.pictureInPictureElement) {
              // @ts-expect-error - requestPictureInPicture not in TS lib dom for all targets
              await v.requestPictureInPicture();
            }
          } catch (err) {
            console.warn('PiP request was blocked or failed:', err);
          }
        };
        const onCanPlay = () => { tryPiP(); };
        v.addEventListener('canplay', onCanPlay, { once: true });
        return () => {
          v.removeEventListener('canplay', onCanPlay);
        };
      }
    }, [chatStarted]);

    return (
      <>
        <div
          ref={ref}
          className={classNames(
            styles.BaseChat,
            'relative flex h-full w-full overflow-hidden bg-bolt-elements-background-depth-1'
          )}
          data-chat-visible={showChat}
        >
          {/* Menu - Embedded sidebar that pushes content */}
          <ClientOnly>{() => <Menu />}</ClientOnly>

          {/* Chat Container */}
          <div
            className="flex flex-col overflow-hidden transition-all duration-300 flex-shrink-0 chat-container"
            style={{
              marginLeft: typeof window !== 'undefined' && window.innerWidth < 640 ? '0' : (isMenuOpen ? '225px' : '64px'),
              width: typeof window !== 'undefined' && window.innerWidth < 640
                ? '100vw'
                : (chatStarted && showWorkbench
                  ? 'min(480px, 40vw)'
                  : `calc(100vw - ${isMenuOpen ? '225px' : '64px'})`),
              height: 'calc(100vh - var(--header-height) - var(--footer-height))',
              maxHeight: 'calc(100vh - var(--header-height) - var(--footer-height))'
            }}
          >
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto overflow-x-hidden"
              style={{
                overflowAnchor: 'none',
                scrollBehavior: 'smooth'
              }}
              data-chat-scroll-container
            >
            <div className={classNames(
              "flex flex-col",
              chatStarted ? "min-h-0 max-w-full" : "min-h-0 pb-8"
            )} style={{ width: '100%', maxWidth: '100%' }}>
              {!chatStarted && (
                <div id="intro" className="mt-[8vh] sm:mt-[15vh] lg:mt-[20vh] max-w-chat mx-auto text-center px-3 sm:px-6 w-full flex flex-col items-center">
                  <p className="text-xs sm:text-xs lg:text-sm text-gray-300 mb-3 sm:mb-4 lg:mb-6 text-center max-w-full">
                    <span className="text-gray-300 whitespace-nowrap text-[10px] sm:text-xs lg:text-sm">Design. Deploy. Trade — Instantly.</span>
                    <span className="text-accent-500 font-medium whitespace-nowrap text-[10px] sm:text-xs lg:text-sm"> </span>
                  </p>
                  <div className="mb-3 sm:mb-6 lg:mb-8 leading-tight px-1 sm:px-2 w-full flex justify-center">
                    <img
                      src="https://10xtraders.ai/101x.png"
                      alt="10xTraders AI Logo"
                     className="w-full max-w-[300px] sm:max-w-[432px] h-auto"
                    />
                  </div>
                  <p className="text-xs sm:text-base lg:text-lg text-white mb-4 sm:mb-8 lg:mb-12 px-2">
                    AI Strategy Engine • Multi-Pair Market Scanner • Instant Deployment • Secure Order Execution
                  </p>
                </div>
              )}

              {/* Messages Container - for chat started state */}
              {chatStarted && (
                <div className="relative px-4 pb-2">
                  <ClientOnly>
                    {() => (
                      <Messages
                        ref={messageRef}
                        className="flex flex-col w-full z-1 overflow-hidden"
                        style={{ maxWidth: '100%', wordWrap: 'break-word' }}
                        messages={messages}
                        isStreaming={isStreaming}
                      />
                    )}
                  </ClientOnly>

                  {/* Prompt Bar - Inside scroll container, after messages */}
                  <div
                    id="prompt-bar"
                    ref={promptRef}
                    className="sticky bottom-0 left-0 right-0 z-prompt bg-bolt-elements-background-depth-1 border-t border-bolt-elements-borderColor mt-4 -mx-4 px-4"
                  >
                    <div className="w-full pt-2 pb-2">
                      {isAuthenticated && (
                        <div className="mb-[-1px] w-full">
                          <TokenCounter />
                        </div>
                      )}

                      <div className="shadow-sm border-[0.5px] rounded-lg overflow-visible bg-bolt-elements-prompt-background backdrop-filter backdrop-blur-[8px] border-green">
                        <textarea
                          ref={textareaRef}
                          className="w-full resize-none pl-3 sm:pl-4 lg:pl-6 pt-2 pr-10 sm:pr-12 lg:pr-16 pb-2 text-sm sm:text-base text-bolt-elements-textPrimary placeholder-bolt-elements-textTertiary bg-transparent focus:outline-none leading-relaxed cursor-text overflow-y-auto"
                          style={{
                            height: `${getTextareaHeight()}px`,
                            minHeight: `${getTextareaHeight()}px`,
                            maxHeight: `${getTextareaHeight()}px`
                          }}
                          placeholder="Fine tune your strategy or ask for improvements..."
                          value={input}
                          onChange={handleInputChange}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              isStreaming ? handleStop?.() : handleSendWithTokens(e);
                            }
                          }}
                          disabled={isStreaming}
                          readOnly={!handleInputChange}
                        />

                        <ClientOnly>
                          {() => (
                            <SendButton
                              show={showSend}
                              isStreaming={isStreaming}
                              isValidatingTokens={tokenValidation.isValidating}
                              onClick={(e) => {
                                if (isStreaming) {
                                  handleStop?.();
                                } else if (tokenValidation.isValidating && tokenValidation.pendingAbort) {
                                  tokenValidation.pendingAbort();
                                  setTokenValidation({ isValidating: false });
                                } else {
                                  handleSendWithTokens(e);
                                }
                              }}
                            />
                          )}
                        </ClientOnly>

                        <div className="flex justify-between text-sm p-4 pt-2">
                          <div className="flex gap-1 items-center">
                            <IconButton
                              title="Enhance prompt"
                              disabled={!input.length || enhancingPrompt}
                              className={classNames({
                                'opacity-100!': enhancingPrompt,
                                'text-bolt-elements-item-contentAccent! pr-1.5 enabled:hover:bg-bolt-elements-item-backgroundAccent!':
                                  promptEnhanced,
                              })}
                              onClick={() => enhancePrompt?.()}
                            >
                              {enhancingPrompt ? (
                                <>
                                  <div className="i-svg-spinners:90-ring-with-bg text-bolt-elements-loader-progress text-xl" />
                                  <span className="ml-1.5 hidden sm:inline">Enhancing…</span>
                                </>
                              ) : tokenValidation.isValidating ? (
                                <>
                                  <div className="i-svg-spinners:90-ring-with-bg text-yellow-500 text-xl" />
                                  <span className="ml-1.5 hidden sm:inline">Validating…</span>
                                </>
                              ) : (
                                <>
                                  <div className="i-bolt:stars text-xl" />
                                  {promptEnhanced && <span className="ml-1.5 hidden sm:inline">Enhanced</span>}
                                </>
                              )}
                            </IconButton>
                          </div>

                          {input.length > 3 && (
                            <div className="text-xs text-bolt-elements-textTertiary hidden md:block">
                              Use <kbd className="kbd">Shift</kbd> + <kbd className="kbd">Enter</kbd> for a new line
                            </div>
                          )}

                          {tokenValidation.isValidating && (
                            <div className="text-xs text-yellow-500 hidden md:block">
                              Validating tokens...
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

            {!chatStarted && (
              <>
                <div className="relative px-4 sm:px-6">
                  {/* Prompt & Controls for Homepage */}
                  <div
                    id="prompt-bar"
                    ref={promptRef}
                    className="relative z-prompt w-full max-w-chat mx-auto"
                  >
                    <>
                      {/* Actions Container - appears above textarea */}
                      <div id="actions-container" className="mb-3"></div>

                      {/* Token Counter - flush against textarea top border */}
                      {isAuthenticated && (
                        <div className="mb-[-1px] w-full">
                          <TokenCounter />
                        </div>
                      )}

                      <div
                        className={classNames(
                          'shadow-sm border-[0.5px] rounded-lg overflow-hidden bg-bolt-elements-prompt-background backdrop-filter backdrop-blur-[8px] border-green max-w-full',
                          chatStarted && 'mb-4'
                        )}
                        style={{ maxWidth: '100%' }}
                      >
                        <textarea
                          ref={textareaRef}
                          className="w-full resize-none pl-3 sm:pl-4 lg:pl-6 pt-3 pr-10 sm:pr-12 lg:pr-16 pb-3 text-sm sm:text-base text-bolt-elements-textPrimary placeholder-bolt-elements-textTertiary bg-transparent focus:outline-none leading-relaxed cursor-text overflow-hidden"
                          style={{
                            height: `${getTextareaHeight()}px`,
                            minHeight: `${getTextareaHeight()}px`,
                            maxHeight: `${getTextareaHeight()}px`,
                            maxWidth: '100%',
                            boxSizing: 'border-box'
                          }}
                          placeholder={chatStarted
                            ? "Fine tune your strategy or ask for improvements..."
                            : `1️⃣ Type a new strategy concept — include indicators, entry/exit ideas, and trade setup conditions, or
2️⃣ Paste/import an existing strategy file or code snippet, or
3️⃣ Select a template below to start quickly.
Note: You'll configure trading pairs, timeframe, and risk controls later.`
                          }
                          value={input}
                          onChange={handleInputChange}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              isStreaming ? handleStop?.() : handleSendWithTokens(e);
                            }
                          }}
                          disabled={isStreaming}
                          readOnly={!handleInputChange}
                          autoFocus={!chatStarted}
                        />

                        <ClientOnly>
                          {() => (
                            <SendButton
                              show={showSend}
                              isStreaming={isStreaming}
                              isValidatingTokens={tokenValidation.isValidating}
                              onClick={(e) => {
                                if (isStreaming) {
                                  handleStop?.();
                                } else if (tokenValidation.isValidating && tokenValidation.pendingAbort) {
                                  tokenValidation.pendingAbort();
                                  setTokenValidation({ isValidating: false });
                                } else {
                                  handleSendWithTokens(e);
                                }
                              }}
                            />
                          )}
                        </ClientOnly>

                        <div className="flex justify-between text-sm p-4 pt-2">
                          <div className="flex gap-1 items-center">
                            <IconButton
                              title="Enhance prompt"
                              disabled={!input.length || enhancingPrompt}
                              className={classNames({
                                'opacity-100!': enhancingPrompt,
                                'text-bolt-elements-item-contentAccent! pr-1.5 enabled:hover:bg-bolt-elements-item-backgroundAccent!':
                                  promptEnhanced,
                              })}
                              onClick={() => enhancePrompt?.()}
                            >
                              {enhancingPrompt ? (
                                <>
                                  <div className="i-svg-spinners:90-ring-with-bg text-bolt-elements-loader-progress text-xl" />
                                  <span className="ml-1.5 hidden sm:inline">Enhancing…</span>
                                </>
                              ) : tokenValidation.isValidating ? (
                                <>
                                  <div className="i-svg-spinners:90-ring-with-bg text-yellow-500 text-xl" />
                                  <span className="ml-1.5 hidden sm:inline">Validating…</span>
                                </>
                              ) : (
                                <>
                                  <div className="i-bolt:stars text-xl" />
                                  {promptEnhanced && <span className="ml-1.5 hidden sm:inline">Enhanced</span>}
                                </>
                              )}
                            </IconButton>
                          </div>

                          {input.length > 3 && !chatStarted && (
                            <div className="text-xs text-bolt-elements-textTertiary hidden md:block">
                              Use <kbd className="kbd">Shift</kbd> + <kbd className="kbd">Enter</kbd> for a new line
                            </div>
                          )}

                          {tokenValidation.isValidating && (
                            <div className="text-xs text-yellow-500 hidden md:block">
                              Validating tokens...
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  </div>
                </div>

                {/* Examples */}
                <div id="examples" className="relative w-full max-w-chat mx-auto text-center px-3 sm:px-6">
                  <div className="flex flex-col space-y-1 sm:space-y-2 [mask-image:linear-gradient(to_bottom,black_0%,transparent_180%)] hover:[mask-image:none]">
                    {EXAMPLE_PROMPTS.map((p, i) => (
                      <button
                        key={i}
                        onClick={(e) => {
                          e.preventDefault();
                          if (!isAuthenticated) {
                            setPendingMessage(p.fullPrompt);
                            setShowAuthDialog(true);
                            return;
                          }
                          handleSendWithTokens(e, p.fullPrompt, true);
                        }}
                        className="group flex items-center w-full gap-1 sm:gap-2 justify-center bg-transparent text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary transition-theme text-[0.7rem] sm:text-sm lg:text-base py-1 px-1 sm:px-2"
                      >
                        <span className="text-center leading-tight">{p.text}</span>
                        <div className="i-ph:arrow-bend-down-left flex-shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Works on + Logos */}
                <div className="relative w-full max-w-chat mx-auto text-center px-3 sm:px-6 exchange-logos-container">
                  <p className="text-[0.65rem] sm:text-sm text-gray-300 mb-1.5 sm:mb-3 lg:mb-4 mt-3 sm:mt-6 lg:mt-8">
                    Non-Custodial Integration with Leading Crypto Exchanges
                  </p>
                  <div className="flex flex-wrap justify-center gap-1.5 sm:gap-3 lg:gap-6 px-1 sm:px-2 exchange-logos">
                    {EXCHANGES.map((name, i) => (
                      <a
                        key={i}
                        href={`https://www.${name.toLowerCase()}.com`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group"
                        title={name}
                      >
                        <img
                          src={`/assets/logos/${name.toLowerCase()}.svg`}
                          alt={name}
                          className="h-2.5 sm:h-3 lg:h-4 transition-transform group-hover:scale-110"
                        />
                      </a>
                    ))}
                  </div>
                </div>
              </>
            )}
            </div>
            </div>
          </div>

          {/* Workbench - Side by side with chat */}
          {chatStarted && showWorkbench && (
            <div
              className="flex-1 relative flex-shrink-0"
              style={{
                height: '100vh',
                maxHeight: '100vh',
                overflow: 'hidden'
              }}
            >
              <ClientOnly>{() => <Workbench chatStarted={chatStarted} isStreaming={isStreaming} />}</ClientOnly>
            </div>
          )}
        </div>


        {/* Auth Dialog */}
        <AuthDialog
          isOpen={showAuthDialog}
          onClose={() => {
            setShowAuthDialog(false);
            setPendingMessage('');
          }}
          mode="signin"
          closeOnOverlayClick={false}
        />

        {/* Social Media Widgets */}
        <SocialMediaWidgets />
      </>
    );
  }
);
