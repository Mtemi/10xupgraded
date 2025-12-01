import { useStore } from '@nanostores/react';
import type { Message } from 'ai';
import { useChat } from 'ai/react';
import { useAnimate } from 'framer-motion';
import { memo, useEffect, useRef, useState, useCallback } from 'react';
import { toast } from 'react-toastify';
import { useMessageParser, usePromptEnhancer, useShortcuts, useSnapScroll } from '~/lib/hooks';
import { useChatHistory } from '~/lib/persistence';
import { chatId } from '~/lib/persistence/useChatHistory';
import { chatStore } from '~/lib/stores/chat';
import { authStore, isDevelopmentMode } from '~/lib/stores/auth';
import { workbenchStore } from '~/lib/stores/workbench';
import { webcontainer } from '~/lib/webcontainer';
import { supabase } from '~/lib/superbase/client';
import { estimateTokens, trackTokenUsage } from '~/lib/token-tracking';
import { fileModificationsToHTML } from '~/utils/diff';
import { cubicEasingFn } from '~/utils/easings';
import { createScopedLogger, renderLogger } from '~/utils/logger';
import { BaseChat } from './BaseChat';
import { SocialMediaWidgets } from '~/components/ui/SocialMediaWidgets';
import { classNames } from '~/utils/classNames';

const logger = createScopedLogger('Chat');

export function Chat() {
  renderLogger.trace('Chat');

  const { ready, initialMessages, storeMessageHistory } = useChatHistory();

  // Show BaseChat immediately while loading, then switch to ChatImpl when ready
  if (!ready) {
    return (
      <div className="flex flex-col w-full">
        <BaseChat />
      </div>
    );
  }

  return <ChatImpl initialMessages={initialMessages} storeMessageHistory={storeMessageHistory} />;
}

interface ChatProps {
  initialMessages: Message[];
  storeMessageHistory: (messages: Message[]) => Promise<void>;
}

export const ChatImpl = memo(({ initialMessages, storeMessageHistory }: ChatProps) => {
  useShortcuts();

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mountedRef = useRef(true);

  // Get current chat ID from nanostores atom (reactive)
  const currentChatId = useStore(chatId);

  const [chatStarted, setChatStarted] = useState(initialMessages.length > 0);

  const { showChat, started: storeStarted } = useStore(chatStore);
  
  // Sync local chatStarted state with store (for when CustomBotSection sets it)
  useEffect(() => {
    if (storeStarted && !chatStarted) {
      setChatStarted(true);
    }
  }, [storeStarted, chatStarted]);
  const { isAuthenticated } = useStore(authStore);

  const [animationScope, animate] = useAnimate();
  const [userData, setUserData] = useState<any>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
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
      const exitThreshold = 320;
      
      if (event.pageX < enterThreshold) {
        setIsMenuOpen(true);
      } else if (event.pageX > exitThreshold && !document.querySelector('.side-menu:hover')) {
        setIsMenuOpen(false);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);


  const { messages, isLoading, input, handleInputChange, setInput, stop, append } = useChat({
    api: '/api/chat',
    onError: (error) => {
      logger.error('Request failed\n\n', error);
      if (mountedRef.current) {
        toast.error('There was an error processing your request', { toastId: 'chat-error' });
      }
    },
    onFinish: () => {
      logger.debug('Finished streaming');
      
      // Track output tokens after response is complete
      if (isAuthenticated && mountedRef.current && messages.length > 0) {
        // Use async IIFE to handle token tracking
        (async () => {
          try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
              // Get the last assistant message content for token tracking
              const lastMessage = messages[messages.length - 1];
              if (lastMessage && lastMessage.role === 'assistant' && lastMessage.content) {
                const outputTokens = await estimateTokens(lastMessage.content);
                if (mountedRef.current) {
                  await trackTokenUsage(user.id, outputTokens, 'script_generation');
                }
              }
            }
          } catch (error) {
            console.error('Error tracking output tokens:', error);
          }
        })();
      }
    },
    initialMessages,
  });

  // Real-time code extraction and rendering
  const extractAndRenderPythonCode = async (content: string) => {
    // Extract Python code blocks from streaming content
    const pythonCodeRegex = /```python\n([\s\S]*?)```/g;
    let match;
    let extractedCode = '';
    
    while ((match = pythonCodeRegex.exec(content)) !== null) {
      extractedCode = match[1];
    }
    
    // If we have Python code and it's different from last render, update workbench
    if (extractedCode.trim() && extractedCode !== lastRenderedCodeRef.current) {
      lastRenderedCodeRef.current = extractedCode;
      await renderCodeToWorkbench(extractedCode.trim());
    }
  };

  // Real-time code rendering function
  const renderCodeToWorkbench = async (code: string) => {
    try {
      // Show workbench immediately
      workbenchStore.showWorkbench.set(true);
      
      // Generate a temporary filename based on current timestamp
      const timestamp = Date.now().toString(36);
      const fileName = `trading_strategy_${timestamp}.py`;
      const filePath = `/home/project/${fileName}`;
      
      // Write file to WebContainer immediately for real-time display
      const container = await webcontainer;
      
      if (container) {
        await container.fs.writeFile(fileName, code);
        logger.info('Code rendered to workbench in real-time:', fileName);
        
        // Select the file in the editor
        workbenchStore.setSelectedFile(filePath);
      }
      
    } catch (error) {
      logger.error('Error rendering code to workbench:', error);
    }
  };

  const { enhancingPrompt, promptEnhanced, enhancePrompt, resetEnhancer } = usePromptEnhancer();
  const { parsedMessages, parseMessages } = useMessageParser();

  // Track streaming content for real-time code rendering
  const [streamingContent, setStreamingContent] = useState<string>('');
  const lastMessageRef = useRef<string>('');
  const lastRenderedCodeRef = useRef<string>('');

  const TEXTAREA_MAX_HEIGHT = chatStarted ? 400 : 200;

  useEffect(() => {
    chatStore.setKey('started', initialMessages.length > 0);
  }, [initialMessages.length]);

  // Check for fine-tune message on mount (localStorage-based)
  useEffect(() => {
    if (currentChatId) {
    const hasPendingFineTune = localStorage.getItem('hasPendingFineTune');

    if (hasPendingFineTune === 'true') {
        const storageKey = `pendingFineTuneMessage_${currentChatId}`;
        const pendingMessage = localStorage.getItem(storageKey);

        if (pendingMessage) {
          console.log('[Chat] Processing pending fine-tune message');

          setInput(pendingMessage);

          // Clear localStorage
          localStorage.removeItem('hasPendingFineTune');
          localStorage.removeItem(storageKey);

          toast.success('Trading logs loaded for AI analysis. Review and send the message.', {
            toastId: 'fine-tune-loaded'
          });

          setTimeout(() => {
            if (textareaRef.current) {
              textareaRef.current.focus();
              textareaRef.current.scrollTop = textareaRef.current.scrollHeight;
            }
          }, 200);
        }
      }
    }
  }, [currentChatId, setInput]);

  useEffect(() => {
    parseMessages(messages, isLoading);

    // Handle real-time code rendering during streaming
    if (isLoading && messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role === 'assistant') {
        extractAndRenderPythonCode(lastMessage.content);
      }
    }
    
    // Only store to IndexedDB when messages change (no Supabase sync yet)
    if (messages.length > initialMessages.length) {
      // Store to IndexedDB only - Supabase sync happens after file save in Artifact.tsx
      storeMessageHistory(messages).catch(error => {
        console.error('Error storing messages to IndexedDB:', error);
      });
    }
  }, [messages, isLoading, parseMessages]);


  const scrollTextArea = () => {
    const textarea = textareaRef.current;

    if (textarea) {
      textarea.scrollTop = textarea.scrollHeight;
    }
  };

  const abort = () => {
    stop();
    chatStore.setKey('aborted', true);
    workbenchStore.abortAllActions();
  };

  useEffect(() => {
    const textarea = textareaRef.current;

    if (textarea) {
      textarea.style.height = 'auto';

      const scrollHeight = textarea.scrollHeight;

      textarea.style.height = `${Math.min(scrollHeight, TEXTAREA_MAX_HEIGHT)}px`;
      textarea.style.overflowY = scrollHeight > TEXTAREA_MAX_HEIGHT ? 'auto' : 'hidden';
    }
  }, [input, textareaRef]);

  const runAnimation = async () => {
    if (chatStarted) {
      return;
    }

    await Promise.all([
      animate('#examples', { opacity: 0, display: 'none' }, { duration: 0.1 }),
      animate('#intro', { opacity: 0, flex: 1 }, { duration: 0.2, ease: cubicEasingFn }),
    ]);

    chatStore.setKey('started', true);

    setChatStarted(true);
  };

  const sendMessage = useCallback(async (_event: React.UIEvent, messageInput?: string) => {
    const _input = messageInput || input;

    if (_input.length === 0 || isLoading) {
      return;
    }

    // Send message immediately; BaseChat will perform token validation/spinner
    let messageProcessingStarted = false;

    try {
      // ✅ OPEN WORKBENCH IMMEDIATELY - User sees workbench while AI is processing
      workbenchStore.showWorkbench.set(true);
      chatStore.setKey('showChat', true); // Show chat panel in workbench
      setChatStarted(true);
      chatStore.setKey('started', true);

      // 1. Send message immediately for instant UI response
      messageProcessingStarted = true;

      chatStore.setKey('aborted', false);
      runAnimation();

      // Check if WebContainer is ready before attempting file operations
      let fileModifications;
      try {
        const container = await webcontainer;
        if (container && container.workdir) {
          // Only save files if WebContainer is properly initialized
          await workbenchStore.saveAllFiles();
          fileModifications = workbenchStore.getFileModifcations();
        } else {
          console.log('[Chat] WebContainer not ready, proceeding without file modifications');
          fileModifications = undefined;
        }
      } catch (webcontainerError) {
        console.warn('[Chat] WebContainer error, proceeding without file modifications:', webcontainerError);
        fileModifications = undefined;
      }

      if (fileModifications !== undefined) {
        const diff = fileModificationsToHTML(fileModifications);

        /**
         * If we have file modifications we append a new user message manually since we have to prefix
         * the user input with the file modifications and we don't want the new user input to appear
         * in the prompt. Using `append` is almost the same as `handleSubmit` except that we have to
         * manually reset the input and we'd have to manually pass in file attachments. However, those
         * aren't relevant here.
         */
        append({ role: 'user', content: `${diff}\n\n${_input}` });

        /**
         * After sending a new message we reset all modifications since the model
         * should now be aware of all the changes.
         */
        workbenchStore.resetAllFileModifications();
      } else {
        append({ role: 'user', content: _input });
      }

      setInput('');
      resetEnhancer();

      textareaRef.current?.blur();
      
    } catch (error) {
      console.error('[Chat] Error in sendMessage:', error);
      
      if (!messageProcessingStarted) {
        // If message processing hasn't started, start it now
        chatStore.setKey('aborted', false);
        runAnimation();
        
        if (fileModifications !== undefined) {
          const diff = fileModificationsToHTML(fileModifications);
          append({ role: 'user', content: `${diff}\n\n${_input}` });
          workbenchStore.resetAllFileModifications();
        } else {
          append({ role: 'user', content: _input });
        }
        
        setInput('');
        resetEnhancer();
        textareaRef.current?.blur();
      }
      
      toast.error('An error occurred while processing your message');
    }
  }, [input, isLoading, append, setInput, isAuthenticated]);

  // Listen for auth dialog requests (from TradingBotCard or other components)
  useEffect(() => {
    const handleShowAuthDialog = (event: Event) => {
      const customEvent = event as CustomEvent<{ 
        reason: string; 
        strategyName?: string;
      }>;
      console.log('[Chat] Received showAuthDialog event:', customEvent.detail);
      
      // Show auth dialog via BaseChat
      const authDialogEvent = new CustomEvent('openAuthDialog');
      window.dispatchEvent(authDialogEvent);
    };

    window.addEventListener('showAuthDialog', handleShowAuthDialog);
    
    return () => {
      window.removeEventListener('showAuthDialog', handleShowAuthDialog);
    };
  }, []);

  // Listen for bot card clicks (custom event from TradingBotCard)
  // Must be declared AFTER sendMessage to avoid reference errors
  useEffect(() => {
    const handleBotPromptSelected = (event: Event) => {
      const customEvent = event as CustomEvent<{ 
        prompt: string; 
        strategyId: string; 
        strategyName: string;
        autoSend?: boolean;
      }>;
      const { prompt, strategyName, autoSend } = customEvent.detail;
      
      console.log('[Chat] Received botPromptSelected event for:', strategyName);
      console.log('[Chat] Prompt length:', prompt.length);
      console.log('[Chat] Auto-send:', autoSend);
      console.log('[Chat] User authenticated:', isAuthenticated);
      
      // Double-check authentication (should already be checked in TradingBotCard)
      if (!isAuthenticated && !isDevelopmentMode()) {
        console.log('[Chat] User not authenticated, ignoring bot prompt');
        return;
      }
      
      if (autoSend && prompt) {
        // Auto-send the prompt immediately (for pre-configured bots)
        console.log('[Chat] Auto-sending prompt');
        
        // Set input first (for UI feedback)
        setInput(prompt);
        
        // Send the message after a brief delay to ensure state is updated
        setTimeout(() => {
          sendMessage(new Event('submit') as any, prompt);
        }, 100);
      } else {
        // Just set the input and focus (for custom bot or manual review)
        console.log('[Chat] Setting input and focusing textarea');
        if (prompt) {
          setInput(prompt);
        }
        
        // Focus the textarea so user can start typing
        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.focus();
            textareaRef.current.scrollTop = textareaRef.current.scrollHeight;
          }
        }, 200);
      }
    };

    window.addEventListener('botPromptSelected', handleBotPromptSelected);
    
    return () => {
      window.removeEventListener('botPromptSelected', handleBotPromptSelected);
    };
  }, [setInput, sendMessage, isAuthenticated]);

  const [messageRef, scrollRef] = useSnapScroll();

  return (
    <div className="flex flex-col w-full overflow-visible">
      <BaseChat
        ref={animationScope}
        textareaRef={textareaRef}
        input={input}
        showChat={showChat}
        chatStarted={chatStarted}
        isStreaming={isLoading}
        enhancingPrompt={enhancingPrompt}
        promptEnhanced={promptEnhanced}
        sendMessage={sendMessage}
        messageRef={messageRef}
        scrollRef={scrollRef}
        handleInputChange={handleInputChange}
        handleStop={() => {
          // BaseChat owns token validation & aborts; just stop the stream/actions here
          abort();
        }}
        messages={messages.map((message, i) => {
          if (message.role === 'user') {
            return message;
          }

          return {
            ...message,
            content: parsedMessages[i] || '',
          };
        })}
        enhancePrompt={() => {
          enhancePrompt(input, (input) => {
            setInput(input);
            scrollTextArea();
          });
        }}
      />

      {/* Bottom sidebar icons for chat pages */}
      <div className={classNames(
        "fixed bottom-16 left-4 z-[1000] flex flex-col items-center gap-2 transition-opacity duration-200",
        isMenuOpen ? "opacity-0 pointer-events-none" : "opacity-100"
      )}>
        {isAuthenticated && userData && (
          <div className="w-10 h-10 rounded-full overflow-hidden bg-bolt-elements-background-depth-3 border-2 border-accent-500">
            <img
              src={userData.user_metadata?.avatar_url || "/profile.png"}
              alt="Profile"
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).src = "/profile.png";
              }}
            />
          </div>
        )}
        {!isAuthenticated && (
          <div className="w-10 h-10 rounded-full bg-bolt-elements-background-depth-3 border-2 border-bolt-elements-borderColor flex items-center justify-center">
            <div className="i-ph:user text-bolt-elements-textSecondary text-lg" />
          </div>
        )}
        <div className="w-8 h-8 bg-bolt-elements-button-primary-background rounded-md flex items-center justify-center cursor-pointer hover:bg-bolt-elements-button-primary-backgroundHover transition-colors">
          <div className="i-ph:sidebar-simple-duotone text-bolt-elements-button-primary-text text-lg" />
        </div>
      </div>
      
      {/* Social Media Widgets */}
      <SocialMediaWidgets />
    </div>
  );
});