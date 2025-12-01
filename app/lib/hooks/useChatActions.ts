import { useChat } from 'ai/react';
import { toast } from 'react-toastify';
import { chatId, db } from '~/lib/persistence/useChatHistory';
import { chatStore } from '~/lib/stores/chat';
import { supabase } from '~/lib/superbase/client';
import { estimateTokens, checkTokenAvailability, trackTokenUsage } from '~/lib/token-tracking';
import { extractStrategyClassName, generateStrategyName, updateStrategyClassName } from '~/utils/strategy-naming';
import { createScopedLogger } from '~/utils/logger';
import { urlId } from '~/lib/persistence/useChatHistory';
import { useRef, useEffect } from 'react';
import { desanitizeForAI } from '~/utils/content-sanitizer';

const logger = createScopedLogger('ChatActions');

export function useChatActions() {
  const mountedRef = useRef(true);
  
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const { append } = useChat({
    api: '/api/chat',
    onError: (error) => {
      console.error('[ChatActions] Chat error:', error);
      if (mountedRef.current) {
        toast.error('Failed to process message', { toastId: 'chat-actions-error' });
      }
    }
  });

  const extractTradingData = async (scriptContent: string, userId: string) => {
    logger.info('Extracting trading data from script');
    console.log('[extractTradingData] Starting analysis for user:', userId);
    console.log('[extractTradingData] Script length:', scriptContent.length);

    try {
      // Get current chat ID and URL ID
      const currentChatId = chatId.get();
      const currentUrlId = urlId.get();
      
      // Use either the URL ID or chat ID, with a fallback
      const associatedChatId = currentUrlId || currentChatId || null;
      
      // Check if strategy already exists for this chat and get its name
      const { data: existingScript, error: checkError } = await supabase
        .from('trading_scripts')
        .select('id, name, content')
        .eq('user_id', userId)
        .eq('chat_id', associatedChatId)
        .single();
      
      if (checkError && checkError.code !== 'PGRST116') {
        console.error('[extractTradingData] Error checking existing script:', checkError);
        throw checkError;
      }
      
      let strategyName;
      
      if (existingScript) {
        // Use existing strategy name
        strategyName = existingScript.name;
        console.log('[extractTradingData] Using existing strategy name:', strategyName);
      } else {
        // Generate a unique strategy name only for new strategies
        console.log('[extractTradingData] Generating unique strategy name for new strategy');
        let baseStrategyName = extractStrategyClassName(scriptContent);
        console.log('[extractTradingData] Extracted class name:', baseStrategyName);
        
        // Generate unique name with timestamp and random string
        const timestamp = Date.now().toString(36);
        const randomPart = Math.random().toString(36).substring(2, 8);
        
        if (!baseStrategyName) {
          strategyName = `FreqtradeStrategy_${timestamp}_${randomPart}`;
        } else {
          strategyName = `${baseStrategyName}_${timestamp}_${randomPart}`;
        }
        
        console.log('[extractTradingData] Generated new strategy name:', strategyName);
        
        // Save the script with the chat ID only if it doesn't exist
        const { error: scriptError, data: scriptData } = await supabase
          .from('trading_scripts')
          .insert({
            user_id: userId,
            name: strategyName,
            content: scriptContent,
            description: 'Generated Freqtrade trading strategy',
            chat_id: associatedChatId
          })
          .select();

        if (scriptError) {
          console.error('[extractTradingData] Error saving script:', scriptError);
          throw scriptError;
        }
        
        console.log('[extractTradingData] Script saved successfully with chat ID:', associatedChatId);
      }
      
      // Continue with analysis only if we have a strategy name
      if (!strategyName) {
        return;
      }
      
      // Prepare prompt for Claude to extract trading data
      const analysisPrompt = `
        Analyze this Freqtrade trading script and extract the following information in JSON format:
        1. All trading symbols (e.g., BTCUSDT, ETHUSDT)
        2. Timeframes used (e.g., 15m, 1h)
        3. Technical indicators with their parameters
        4. Buy/Sell conditions
        5. Risk management parameters

        Script to analyze:
        \`\`\`python
        ${scriptContent}
        \`\`\`

        Return ONLY a JSON object with these fields:
        {
          "symbols": ["symbol1", "symbol2"],
          "timeframes": ["timeframe1", "timeframe2"],
          "indicators": {
            "indicator1": { "parameters": {} },
            "indicator2": { "parameters": {} }
          },
          "conditions": {
            "buy": ["condition1", "condition2"],
            "sell": ["condition1", "condition2"]
          },
          "risk_parameters": {
            "stop_loss": "",
            "take_profit": "",
            "position_size": ""
          }
        }
      `;

      console.log('[extractTradingData] Estimating token usage');
      const estimatedTokens = await estimateTokens(analysisPrompt);
      console.log('[extractTradingData] Estimated tokens:', estimatedTokens);

      const hasTokens = await checkTokenAvailability(userId, estimatedTokens);
      console.log('[extractTradingData] Token availability check:', hasTokens);
      
      if (!hasTokens) {
        console.log('[extractTradingData] Insufficient tokens');
        toast.error('Insufficient tokens for analysis');
        return;
      }

      console.log('[extractTradingData] Sending analysis request to Claude');
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{
            role: 'user',
            content: analysisPrompt
          }]
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to analyze script: ${response.statusText}`);
      }

      const analysisText = await response.text();
      console.log('[extractTradingData] Received analysis response:', analysisText.substring(0, 200) + '...');

      try {
        const tradingData = JSON.parse(analysisText);
        console.log('[extractTradingData] Parsed trading data:', tradingData);

        console.log('[extractTradingData] Inserting trading signals into database');
        const { data, error } = await supabase.from('trading_signals').insert({
          user_id: userId,
          notebook_name: `${strategyName}.py`,
          symbol: tradingData.symbols[0] || 'BTCUSDT',
          timeframe: tradingData.timeframes[0] || '15m',
          chart_config: {
            symbols: tradingData.symbols,
            timeframes: tradingData.timeframes,
            indicators: Object.keys(tradingData.indicators),
            indicatorSettings: tradingData.indicators
          },
          signal_metadata: {
            conditions: tradingData.conditions,
            risk_parameters: tradingData.risk_parameters
          },
          signal_source: 'script_analysis'
        });

        if (error) {
          console.error('Error saving trading signals:', error);
          toast.error('Failed to save trading configuration');
        } else {
          console.log('[extractTradingData] Trading signals saved successfully:', data);
          toast.success('Strategy and trading configuration saved successfully');
        }

        // Track token usage
        console.log('[extractTradingData] Tracking token usage');
        await trackTokenUsage(userId, estimatedTokens, 'script_analysis');

      } catch (parseError) {
        console.error('Error parsing AI response:', parseError);
        toast.error('Failed to parse trading configuration');
      }

    } catch (error) {
      console.error('Detailed error in extractTradingData:', error);
      if (mountedRef.current) {
        toast.error('Failed to analyze trading strategy', { toastId: 'extract-data-error' });
      }
    }
  };

  const sendMessage = async (message: string) => {
    console.log('[sendMessage] Starting message send');
    logger.info('Sending message to AI');
    
    try {
      const currentChatId = chatId.get();
      if (!currentChatId) {
        console.error('[sendMessage] No active chat ID found');
        logger.error('No active chat ID found');
        if (mountedRef.current) {
          toast.error('No active chat session', { toastId: 'no-chat-session' });
        }
        return null;
      }

      console.log('[sendMessage] Processing message for chat:', currentChatId);
      console.log('[sendMessage] Current URL ID:', urlId.get());
      
      // Update chat store with user message
      const currentMessages = chatStore.get().messages || [];
      console.log('[sendMessage] Current message count:', currentMessages.length);
      logger.debug(`Current message count: ${currentMessages.length}`);
      
      chatStore.setKey('messages', [
        ...currentMessages,
        { role: 'user', content: message }
      ]);

      // Send message and wait for response
      console.log('[sendMessage] Sending message to API');
      logger.info('Appending message to chat');
      const response = await append({
        id: currentChatId,
        role: 'user',
        content: message
      });

      console.log('[sendMessage] Received response:', {
        responseReceived: true,
        length: response?.content.length,
        hasPython: response?.content.includes('```python')
      });
      logger.info('Received AI response');

      // If response contains Python code, extract trading data
      if (response && response.content.includes('```python')) {
        console.log('[sendMessage] Python code detected, extracting trading data');
        logger.info('Python code detected in response, extracting trading data');
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          console.log('[sendMessage] Processing for user:', user.id);
          
          // Convert any 10xtraders references back to freqtrade before processing
          const desanitizedContent = desanitizeForAI(response.content);
          
          // Extract the strategy class name from the content
          console.log('[sendMessage] Extracting strategy class name');
          let strategyClassName = extractStrategyClassName(desanitizedContent);
          console.log('[sendMessage] Extracted class name:', strategyClassName);
          
          // If no class name found or it's invalid, generate a new one
          if (!strategyClassName) {
            console.log('[sendMessage] No class name found, generating new one');
            strategyClassName = generateStrategyName('FreqtradeStrategy');
            console.log('[sendMessage] Generated class name:', strategyClassName);
            
            // Update the class name in the code to match the strategy name (with first letter capitalized)
            const capitalizedClassName = strategyClassName.charAt(0).toUpperCase() + strategyClassName.slice(1);
            console.log('[saveGeneratedScript] Using capitalized class name:', capitalizedClassName);
            
            // Update the class name in the content
            const currentClassName = extractStrategyClassName(desanitizedContent);
            if (currentClassName) {
              response.content = desanitizedContent.replace(
                new RegExp(`class\\s+${currentClassName}\\s*\\(\\s*IStrategy\\s*\\)`, 'g'),
                `class ${capitalizedClassName}(IStrategy)`
              );
              console.log('[saveGeneratedScript] Updated class name in code from', currentClassName, 'to', capitalizedClassName);
            }
            console.log('[sendMessage] Code updated with new class name');
            
            // If the content was updated, use it instead
            console.log('[sendMessage] Using updated content with new class name');
          }
          
          // Get current chat ID and URL ID
          const currentChatId = chatId.get();
          const currentUrlId = urlId.get();
          
          // Ensure we have a consistent chat ID - prefer existing chatId over urlId
          let associatedChatId = currentChatId || currentUrlId;
          
          // If we don't have any ID, generate one and set it consistently
          if (!associatedChatId) {
            associatedChatId = generateId('chat_');
            chatId.set(associatedChatId);
            urlId.set(associatedChatId);
          }
          
          // If we don't have any ID, generate one and set it consistently
          if (!associatedChatId) {
            associatedChatId = generateId('chat_');
            chatId.set(associatedChatId);
            urlId.set(associatedChatId);
          }
          
          console.log('[sendMessage] Saving script with chat association:', {
            scriptName: strategyClassName,
            chatId: associatedChatId
          });
          
          // Save the script with the chat ID
          await extractTradingData(desanitizedContent, user.id);
        } else {
          console.warn('[sendMessage] No authenticated user found');
        }
      }

      // Update chat store with assistant response
      if (response) {
        const updatedMessages = chatStore.get().messages || [];
        logger.info('Updating chat store with AI response');
        console.log('[sendMessage] Updating chat store with response');
        chatStore.setKey('messages', [
          ...updatedMessages,
          { role: 'assistant', content: response.content }
        ]);
      }

      // Store messages in IndexedDB if available
      if (db && response) {
        logger.info('Storing chat history in IndexedDB');
        // This will trigger the storeMessageHistory in useChatHistory
      }

      console.log('[sendMessage] Message processing complete');
      logger.info('Message processing complete');
      return response;

    } catch (error) {
      console.error('[sendMessage] Error:', error);
      logger.error('Error in sendMessage:', error);
      // Don't throw error, just log it and show toast
      if (typeof window !== 'undefined') {
        toast.error('Failed to process message', { 
          toastId: 'chat-actions-error',
          containerId: 'main-toast-container'
        });
      }
      return null;
    }
  };

  return { sendMessage };
}

// Helper function to generate unique IDs
function generateId(prefix: string = ''): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 10);
  return `${prefix}${timestamp}${randomPart}`;
}