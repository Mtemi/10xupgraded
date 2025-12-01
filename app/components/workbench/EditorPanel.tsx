import { useStore } from '@nanostores/react';
import { motion } from 'framer-motion';
import { memo, useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { Panel, PanelGroup, PanelResizeHandle, type ImperativePanelHandle } from 'react-resizable-panels';
import {
  CodeMirrorEditor,
  type EditorDocument,
  type EditorSettings,
  type OnChangeCallback as OnEditorChange,
  type OnScrollCallback as OnEditorScroll,
} from '~/components/editor/codemirror/CodeMirrorEditor';
import { IconButton } from '~/components/ui/IconButton';
import { PanelHeader } from '~/components/ui/PanelHeader';
import { PanelHeaderButton } from '~/components/ui/PanelHeaderButton';
import { shortcutEventEmitter } from '~/lib/hooks';
import type { FileMap } from '~/lib/stores/files';
import { themeStore } from '~/lib/stores/theme';
import { workbenchStore } from '~/lib/stores/workbench';
import { classNames } from '~/utils/classNames';
import { WORK_DIR } from '~/utils/constants';
import { renderLogger } from '~/utils/logger';
import { FileBreadcrumb } from './FileBreadcrumb';
import { FileTree } from './FileTree';
import { Terminal, type TerminalRef } from './terminal/Terminal';
import { toast } from "react-toastify";
import { supabase } from '~/lib/superbase/client';
import { ApiKeyDialog } from '~/components/auth/ApiKeyDialog';
import { detectApiKeyVariables } from '~/utils/script-parser';
import { webcontainer } from '~/lib/webcontainer';
import { useNotebookStatus } from '~/lib/hooks/useNotebookStatus';
import { LiveTradingAIDialog } from './LiveTradingAIDialog';
import { estimateTokens, checkTokenAvailability, trackTokenUsage } from '~/lib/token-tracking';
import { chatStore, type ChatState, type ChatMessage , sendChatMessage} from '~/lib/stores/chat';
import { chatId } from '~/lib/persistence/useChatHistory';
import { useChat } from 'ai/react';
import { useChatActions } from '~/lib/hooks/useChatActions';
import { useNavigate } from '@remix-run/react';
import { sanitizeCodeContent, desanitizeForAI } from '~/utils/content-sanitizer';


const isMobile = () => {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < 640;
};

interface EditorPanelProps {
  files?: FileMap;
  unsavedFiles?: Set<string>;
  editorDocument?: EditorDocument;
  selectedFile?: string | undefined;
  isStreaming?: boolean;
  onEditorChange?: OnEditorChange;
  onEditorScroll?: OnEditorScroll;
  onFileSelect?: (value?: string) => void;
  onFileSave?: () => void;
  onFileReset?: () => void;
}

const DEFAULT_TERMINAL_SIZE = 25;
const DEFAULT_EDITOR_SIZE = 100 - DEFAULT_TERMINAL_SIZE;
const editorSettings: EditorSettings = { tabSize: 2 };

export const EditorPanel = memo(
  ({
    files,
    unsavedFiles,
    editorDocument,
    selectedFile,
    isStreaming,
    onFileSelect,
    onEditorChange,
    onEditorScroll,
    onFileSave,
    onFileReset,
  }: EditorPanelProps) => {
    renderLogger.trace('EditorPanel');

    const theme = useStore(themeStore);
    const showTerminal = useStore(workbenchStore.showTerminal);
    const [showApiKeyDialog, setShowApiKeyDialog] = useState(false);
    const [showAIDialog, setShowAIDialog] = useState(false);
    const [pendingScriptContent, setPendingScriptContent] = useState<string | null>(null);
    const [isProcessingAI, setIsProcessingAI] = useState(false);
    const [hasLogs, setHasLogs] = useState(false);
    const [terminalVisible, setTerminalVisible] = useState(false);
    const navigate = useNavigate();

    const terminalRef = useRef<TerminalRef>(null);
    const terminalPanelRef = useRef<ImperativePanelHandle>(null);
    const terminalToggledByShortcut = useRef(false);
    const [hasTunedVersions, setHasTunedVersions] = useState(false);

    // NEW: Local state for current version
    const [localCurrentVersion, setLocalCurrentVersion] = useState(0);

    // Get notebook status and logs using the hook
    const [isInitializing, setIsInitializing] = useState(false);
    const [accumulatedLogs, setAccumulatedLogs] = useState<string[]>([]);
    const [isProcessingLogs, setIsProcessingLogs] = useState(false);
    const { status, error, logs } = useNotebookStatus(selectedFile);
    
    // =========================================================================
    // 1. Effect for streaming logs and accumulating them
    // =========================================================================
    useEffect(() => {
      if (terminalRef.current && logs.length > 0 && terminalVisible) {
        // Sanitize logs before displaying
        const sanitizedLogs = sanitizeLogs(logs);
        const lastLog = sanitizedLogs[sanitizedLogs.length - 1];
        terminalRef.current.write(lastLog + '\n');
        setHasLogs(true);
        setAccumulatedLogs(prevLogs => [...prevLogs, lastLog]);
      }
    }, [logs, terminalVisible]);
    
    const { sendMessage } = useChatActions();
    // =========================================================================
    // 2. Separate effect for processing accumulated logs (AI improvement)
    // =========================================================================
    // First, define the chat store state type at the top of the file

    // useEffect(() => {
    //   // Skip if conditions aren't met
    //   if (!terminalVisible || isProcessingLogs || accumulatedLogs.length === 0 || !selectedFile || !editorDocument) {
    //     return;
    //   }
    
    //   const processLogs = async () => {
    //     try {
    //       setIsProcessingLogs(true);
    
    //       // Get authenticated user
    //       const { data: { user } } = await supabase.auth.getUser();
    //       if (!user) {
    //         console.log('No authenticated user found');
    //         return;
    //       }
    
    //       // Get file name without extension
    //       const fileName = selectedFile.split('/').pop()?.replace(/\.py$/, '');
    //       if (!fileName) {
    //         console.log('Invalid file name');
    //         return;
    //       }
    
    //       // Get notebook status and script versions
    //       const [notebookStatus, scriptResponse] = await Promise.all([
    //         supabase
    //           .from('notebook_statuses')
    //           .select('chunk_size, iterations, custom_instructions')
    //           .eq('user_id', user.id)
    //           .eq('notebook_name', `${fileName}.py`)
    //           .single(),
    //         supabase
    //           .from('trading_scripts')
    //           .select('content_v1, content_v2, content_v3, content_v4, content_v5, current_version')
    //           .eq('user_id', user.id)
    //           .eq('name', fileName)
    //           .single()
    //       ]);
    
    //       // Validate configuration
    //       if (!notebookStatus.data?.chunk_size || !notebookStatus.data?.iterations) {
    //         console.log('No configuration found:', notebookStatus);
    //         return;
    //       }
    
    //       const targetIterations = notebookStatus.data.iterations;
    //       const chunkSize = notebookStatus.data.chunk_size;
    //       const fetchedVersion = scriptResponse.data?.current_version || 0;
    //       const currentVersion = Math.max(localCurrentVersion, fetchedVersion);
    
    //       // Check if we've reached target iterations
    //       if (currentVersion >= targetIterations) {
    //         console.log('All target iterations completed:', { currentVersion, targetIterations });
    //         setAccumulatedLogs([]); // Clear logs
    //         return;
    //       }

    //       // Check if we have enough logs for a chunk
    //       if (accumulatedLogs.length >= chunkSize) {
    //         const latestChunk = accumulatedLogs.slice(-chunkSize).join('\n');
    //         const currentContent = editorDocument?.value || '';
    //         console.log('latestChunk:', { latestChunk });
    
    //         // Check token availability
    //         const estimatedTokens = await estimateTokens(
    //           currentContent + latestChunk + (notebookStatus.data.custom_instructions || '')
    //         );
    //         const hasTokens = await checkTokenAvailability(user.id, estimatedTokens);
    //         if (!hasTokens) return;
    
    //         // Get current chat ID first
    //         const currentChatId = chatId.get();
    //         if (!currentChatId) {
    //           console.error('No active chat ID found');
    //           toast.error('No active chat session');
    //           return;
    //         }

    //         // Prepare message for chat
    //         const message = `Improve this trading bot code based on execution logs:

    //         Current Code:
    //         \`\`\`python
    //         ${currentContent}
    //         \`\`\`

    //         Execution Logs:
    //         \`\`\`
    //         ${latestChunk}
    //         \`\`\`
    //         ${notebookStatus.data.custom_instructions ? `Additional Instructions: ${notebookStatus.data.custom_instructions}` : ''}

    //         Return ONLY the improved Python code.`;

    //         console.log('Adding message to chat:', currentChatId);

    //         // With this:
    //         const response = await sendMessage(message);
    //         const chatResponse = response.content;

    //         // Process the response
    //         const improvedCode = extractScriptFromResponse(chatResponse);
    //         if (improvedCode) {
    //           const nextVersion = currentVersion + 1;
    //           const updateData = {
    //             [`content_v${nextVersion}`]: improvedCode,
    //             current_version: nextVersion,
    //             last_improved_at: new Date().toISOString()
    //           };
    
    //           // Update script in database
    //           const { error: updateError } = await supabase
    //             .from('trading_scripts')
    //             .update(updateData)
    //             .eq('user_id', user.id)
    //             .eq('name', fileName);
    
    //           if (updateError) {
    //             console.error('Error updating script:', updateError);
    //             toast.error('Failed to save improved version');
    //             return;
    //           }
    
    //           // Update UI and state
    //           toast.success(`Created improved version v${nextVersion} of ${targetIterations}`);
    //           setHasTunedVersions(true);
    //           setLocalCurrentVersion(nextVersion);
    //           setAccumulatedLogs([]);
    
    //           console.log('Successfully processed version:', {
    //             version: nextVersion,
    //             targetIterations,
    //             remainingIterations: targetIterations - nextVersion
    //           });
    //         }
    //       }

    //     } catch (error) {
    //       console.error('Error processing AI improvements:', error);
    //       toast.error('Failed to process improvements');
    //     } finally {
    //       setIsProcessingLogs(false);
    //     }
    //   };
    
    //   processLogs();
    // }, [accumulatedLogs, terminalVisible, selectedFile, editorDocument, isProcessingLogs, localCurrentVersion]);
    

    const activeFileSegments = useMemo(() => {
      if (!editorDocument) {
        return undefined;
      }
      return editorDocument.filePath.split('/');
    }, [editorDocument]);

    const activeFileUnsaved = useMemo(() => {
      return editorDocument !== undefined && unsavedFiles?.has(editorDocument.filePath);
    }, [editorDocument, unsavedFiles]);

    useEffect(() => {
      const unsubscribeFromEventEmitter = shortcutEventEmitter.on('toggleTerminal', () => {
        terminalToggledByShortcut.current = true;
      });

      const unsubscribeFromThemeStore = themeStore.subscribe(() => {
        if (terminalRef.current) {
          terminalRef.current.reloadStyles();
        }
      });

      return () => {
        unsubscribeFromEventEmitter();
        unsubscribeFromThemeStore();
      };
    }, []);

    useEffect(() => {
      const loadScripts = async () => {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;

          const { data: scripts, error } = await supabase
            .from('trading_scripts')
            .select('*')
            .eq('user_id', user.id);

          if (error) {
            console.error('Error loading scripts:', error);
            return;
          }

          const container = await webcontainer;
          if (!container) {
            console.error('WebContainer not initialized');
            return;
          }

          for (const script of scripts) {
            const filePath = `/home/project/${script.name}.py`;
            // Sanitize script content before writing to file
            const sanitizedContent = sanitizeCodeContent(script.content);
            await container.fs.writeFile(filePath, sanitizedContent);
          }
        } catch (error) {
          console.error('Error loading scripts:', error);
        }
      };

      loadScripts();
    }, []);

    useEffect(() => {
      const { current: terminal } = terminalPanelRef;

      if (!terminal) {
        return;
      }

      const isCollapsed = terminal.isCollapsed();

      if (!showTerminal && !isCollapsed) {
        terminal.collapse();
        setTerminalVisible(false);
      } else if (showTerminal && isCollapsed) {
        terminal.resize(DEFAULT_TERMINAL_SIZE);
        setTerminalVisible(true);
      }

      terminalToggledByShortcut.current = false;
    }, [showTerminal]);

    const strategyConfig = {
      "$schema": "https://schema.freqtrade.io/schema.json",
      "max_open_trades": 3,
      "stake_currency": "USDT",
      "stake_amount": 100,
      "tradable_balance_ratio": 0.99,
      "available_capital": 0.0,
      "amend_last_stake_amount": false,
      "last_stake_amount_min_ratio": 0.5,
      "amount_reserve_percent": 0.05,
      "timeframe": "5m",
      "fiat_display_currency": "USD",
      "dry_run": true,
      "dry_run_wallet": 1000,
      "cancel_open_orders_on_exit": false,
      "process_only_new_candles": true,
    
      "minimal_roi.60": 0.01,
      "minimal_roi.30": 0.02,
      "minimal_roi.0": 0.04,
      "stoploss": -0.10,
      "trailing_stop": false,
      "trailing_stop_positive": 0.005,
      "trailing_stop_positive_offset": 0.0051,
      "trailing_only_offset_is_reached": false,
      "use_exit_signal": true,
      "exit_profit_only": false,
      "exit_profit_offset": 0.0,
      "ignore_roi_if_entry_signal": false,
      "ignore_buying_expired_candle_after": 0,
    
      "position_adjustment_enable": false,
      "max_entry_position_adjustment": -1,
    
      "order_types.entry": "limit",
      "order_types.exit": "limit",
      "order_types.stoploss": "market",
      "order_types.emergency_exit": "market",
      "order_types.force_entry": "market",
      "order_types.force_exit": "market",
      "order_types.stoploss_on_exchange": false,
      "order_types.stoploss_on_exchange_interval": 60,
    
      "order_time_in_force.entry": "gtc",
      "order_time_in_force.exit": "gtc",
    
      "entry_pricing.price_side": "bid",
      "entry_pricing.use_order_book": false,
      "entry_pricing.order_book_top": 1,
      "entry_pricing.price_last_balance": 0.0,
      "entry_pricing.check_depth_of_market.enabled": false,
      "entry_pricing.check_depth_of_market.bids_to_ask_delta": 1,
    
      "exit_pricing.price_side": "ask",
      "exit_pricing.use_order_book": false,
      "exit_pricing.order_book_top": 1,
      "exit_pricing.price_last_balance": 0.0,
    
      "unfilledtimeout.entry": 10,
      "unfilledtimeout.exit": 30,
      "unfilledtimeout.unit": "minutes",
      "unfilledtimeout.exit_timeout_count": 0,
    
      "pairlists": "[{\"method\": \"StaticPairList\"}, {\"method\": \"VolumePairList\", \"number_assets\": 20, \"sort_key\": \"quoteVolume\", \"refresh_period\": 1800}, {\"method\": \"AgeFilter\", \"min_days_listed\": 10}, {\"method\": \"PrecisionFilter\"}, {\"method\": \"PriceFilter\", \"low_price_ratio\": 0.01, \"min_price\": 0.00000010}, {\"method\": \"SpreadFilter\", \"max_spread_ratio\": 0.005}, {\"method\": \"RangeStabilityFilter\", \"lookback_days\": 10, \"min_rate_of_change\": 0.01, \"refresh_period\": 1440}]",
    
      "protections": "[{\"method\": \"StoplossGuard\", \"lookback_period_candles\": 60, \"trade_limit\": 4, \"stop_duration_candles\": 60, \"only_per_pair\": false}, {\"method\": \"CooldownPeriod\", \"stop_duration_candles\": 20}, {\"method\": \"MaxDrawdown\", \"lookback_period_candles\": 200, \"trade_limit\": 20, \"stop_duration_candles\": 10, \"max_allowed_drawdown\": 0.2}, {\"method\": \"LowProfitPairs\", \"lookback_period_candles\": 360, \"trade_limit\": 1, \"stop_duration_candles\": 2, \"required_profit\": 0.02}]",
    
      "exchange.name": "binance",
      "exchange.sandbox": false,
      "exchange.key": "YOUR_API_KEY",
      "exchange.secret": "YOUR_API_SECRET",
      "exchange.password": "",
      "exchange.uid": "",
      "exchange.enable_ws": true,
      "exchange.markets_refresh_interval": 60,
      "exchange.skip_open_order_update": false,
      "exchange.unknown_fee_rate": 0.0,
      "exchange.log_responses": false,
      "exchange.only_from_ccxt": false,
    
      "telegram.enabled": false,
      "telegram.token": "YOUR_TELEGRAM_BOT_TOKEN",
      "telegram.chat_id": "YOUR_CHAT_ID",
      "api_server.enabled": true,
      "api_server.listen_ip_address": "127.0.0.1",
      "api_server.listen_port": 8080,
      "api_server.verbosity": "error",
      "api_server.enable_openapi": false,
      "api_server.jwt_secret_key": "CHANGE_ME_TO_RANDOM_SECRET",
      "api_server.CORS_origins": "[]",
      "api_server.username": "meghan",
      "api_server.password": "SuperSecret1!",
      "api_server.ws_token": "SOME_RANDOM_WS_TOKEN",
    
      "bot_name": "MeghanBot",
      "initial_state": "running",
      "force_entry_enable": false,
      "internals.process_throttle_secs": 5,
      "internals.heartbeat_interval": 60,
      "disable_dataframe_checks": false,
      "strategy": "Strategy001",
      "strategy_path": "user_data/strategies/",
      "dataformat_ohlcv": "json",
      "dataformat_trades": "jsongz"
    }

    const handleStopScript = async () => {
      if (!selectedFile) return;

      const fileName = selectedFile.split('/').pop() || '';

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          toast.error('Please sign in to stop scripts');
          return;
        }

        // Check if script is actually running
        if (status !== 'running' && status !== 'initializing') {
          toast.warning('Script is not currently running');
          return;
        }

        // Get the process ID from notebook_statuses
        const { data: notebookStatus, error: statusError } = await supabase
          .from('notebook_statuses')
          .select('process_id, status')
          .eq('user_id', user.id)
          .eq('notebook_name', fileName)
          .single();

        console.log('[Stop] Current notebook status:', notebookStatus);

        // Prepare request body
        const requestBody = {
          notebook_name: fileName,
          user_id: user.id,
          process_id: notebookStatus?.process_id || null
        };

        console.log('[Stop] Sending stop request:', requestBody);

        const response = await fetch('/apa/stop-notebook', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
          const contentType = response.headers.get('content-type');
          let errorMessage = 'Failed to stop script';

          if (contentType && contentType.includes('application/json')) {
            const data = await response.json();
            errorMessage = data.error || errorMessage;
          } else {
            const text = await response.text();
            console.error('[Stop] Non-JSON error response:', text);
          }

          throw new Error(errorMessage);
        }

        const data = await response.json();
        console.log('[Stop] Stop request successful:', data);

        // Show success message with details
        if (data.status === 'success') {
          const details = data.details || {};
          let message = data.message;

          // Add details to message if process termination was attempted
          if (details.process_terminated !== undefined) {
            message += details.process_terminated 
              ? ' (Process terminated successfully)'
              : ' (Process termination not required or failed)';
          }

          toast.info(message);
        } else {
          toast.warning(data.message || 'Stop request processed with warnings');
        }

      } catch (error) {
        console.error('[Stop] Error stopping script:', error);
        toast.error(error instanceof Error ? error.message : 'Failed to stop script');
      }
    };

    const handleRunScript = async () => {
      if (!selectedFile || !editorDocument) return;
    
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        
        if (!session) {
          toast.error('Please sign in to run scripts');
          return;
        }

        console.log('[EditorPanel] SESSION:', session);

        const fileName = selectedFile.split('/').pop() || '';
    
        if (status === 'running' || status === 'stopping') {
          toast.warning(`Script is already ${status}`);
          return;
        }
    
        // Sanitize code content before checking for API keys
        const sanitizedContent = sanitizeCodeContent(editorDocument.value);
        
        if (detectApiKeyVariables(sanitizedContent)) {
          setPendingScriptContent(sanitizedContent);
          setShowApiKeyDialog(true);
          return;
        }
    
        setIsInitializing(true);
        await new Promise(resolve => setTimeout(resolve, 0));
    

    
        const freqtradeResponse = await fetch(`/apa/user/${session.user.email}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify(strategyConfig)
        });
    
        if (!freqtradeResponse.ok) {
          const error = await freqtradeResponse.json();
          throw new Error(error.error || 'Failed to create Freqtrade instance');
        }
    
        const startTime = Date.now();
        const response = await fetch(`/user/${session.user.email}`, {
        // const response = await fetch('/apa/run-notebook', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify(strategyConfig)
          // body: JSON.stringify({
          //   username: session.user.email,
          //   notebook_name: fileName,
          //   user_id: session.user.id,
          //   content: editorDocument.value
          // })
        });
    
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to run script');
        }
    
        const elapsed = Date.now() - startTime;
        if (elapsed < 1500) {
          await new Promise(resolve => setTimeout(resolve, 1500 - elapsed));
        }
      } catch (error) {
        console.error('Error running script:', error);
        toast.error(error instanceof Error ? error.message : 'Failed to run script');
      } finally {
        setIsInitializing(false);
      }
    };  
    
    const handleApiKeyConfirm = async (apiKey: string, apiSecret: string) => {
      if (!pendingScriptContent || !selectedFile) return;
    
      // Set initializing state when starting after API key confirmation
      setIsInitializing(true);
      await new Promise(resolve => setTimeout(resolve, 0));
    
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      console.log('[EditorPanel] SESSION:', session);
      if (!session) {
        toast.error('Please sign in to run scripts');
        return;
      }

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.email) {
          toast.error('Please sign in to run scripts');
          return;
        }
    
        const fileName = selectedFile.split('/').pop() || '';
        const contentWithKeys = appendApiKeysToScript(pendingScriptContent, apiKey, apiSecret);
    
        const startTime = Date.now();
        // const response = await fetch('/apa/run-notebook', {
        const response = await fetch(`/apa/user/${session.user.email}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify(strategyConfig)
          // body: JSON.stringify({
          //   username: user.email,
          //   notebook_name: fileName,
          //   user_id: user.id,
          //   content: contentWithKeys
          // })
        });
    
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to run script');
        }
    
        // Make sure the "Initializing..." state stays visible for at least 1.5 seconds
        const elapsed = Date.now() - startTime;
        if (elapsed < 1500) {
          await new Promise(resolve => setTimeout(resolve, 1500 - elapsed));
        }
    
        setPendingScriptContent(null);
        setShowApiKeyDialog(false);
    
      } catch (error) {
        console.error('Error running script:', error);
        toast.error(error instanceof Error ? error.message : 'Failed to run script');
      } finally {
        setIsInitializing(false);
      }
    };

    const appendApiKeysToScript = (content: string, apiKey: string, apiSecret: string) => {
      const lines = content.split('\n');
      let modifiedLines = [...lines];

      const apiKeyPattern = /(BINANCE_API_KEY|API_KEY)\s*=\s*(["'].*["']|None|''|""|\{.*\}|\[.*\]|\(.*\))?/;
      const apiSecretPattern = /(BINANCE_API_SECRET|API_SECRET|SECRET_KEY)\s*=\s*(["'].*["']|None|''|""|\{.*\}|\[.*\]|\(.*\))?/;

      let keyFound = false;
      let secretFound = false;
      let keyVarName = 'BINANCE_API_KEY';
      let secretVarName = 'BINANCE_API_SECRET';

      for (const line of lines) {
        const keyMatch = line.match(apiKeyPattern);
        const secretMatch = line.match(apiSecretPattern);

        if (keyMatch && keyMatch[1]) {
          keyVarName = keyMatch[1];
        }
        if (secretMatch && secretMatch[1]) {
          secretVarName = secretMatch[1];
        }
      }

      modifiedLines = modifiedLines.map(line => {
        if (apiKeyPattern.test(line)) {
          keyFound = true;
          return `${keyVarName} = "${apiKey}"  # Updated by TBB`;
        }
        if (apiSecretPattern.test(line)) {
          secretFound = true;
          return `${secretVarName} = "${apiSecret}"  # Updated by TBB`;
        }
        return line;
      });

      if (!keyFound || !secretFound) {
        let insertIndex = 0;
        for (let i = 0; i < modifiedLines.length; i++) {
          if (modifiedLines[i].trim().startsWith('import') || modifiedLines[i].trim().startsWith('from')) {
            insertIndex = i + 1;
          }
        }

        const keysToAdd = [];
        if (!keyFound) {
          keysToAdd.push(`${keyVarName} = "${apiKey}"  # Added by TBB`);
        }
        if (!secretFound) {
          keysToAdd.push(`${secretVarName} = "${apiSecret}"  # Added by TBB`);
        }

        modifiedLines.splice(insertIndex, 0, '', ...keysToAdd, '');
      }

      return modifiedLines.join('\n');
    };

    const getRunButtonText = (fileName: string) => {
      if (isInitializing) return 'Initializing...';
      switch (status) {
        case 'initializing': return 'Initializing...';
        case 'running': return 'Running';
        case 'stopping': return 'Stopping...';
        case 'failed': return 'Configure Your Bot';
        case 'completed': return 'Configure Your Bot';
        case 'stopped': return 'Configure Your Bot';
        default: return 'Configure Your Bot';
      }
    };

    useEffect(() => {
      const checkTunedVersions = async () => {
        if (!selectedFile) return;

        // Remove this unnecessary query - we can check tuned versions when needed
        // This was causing 406 errors and interfering with auto-scroll
        setHasTunedVersions(false);
      };

      checkTunedVersions();
    }, [selectedFile]);

    // Create a modified version of onEditorChange that sanitizes code
    const handleSanitizedEditorChange = useCallback<OnEditorChange>((update) => {
      // Don't modify the actual file content, just what's displayed
      if (onEditorChange) {
        onEditorChange(update);
      }
    }, [onEditorChange]);

    // Create a wrapper for the editor document that sanitizes the content
    const sanitizedEditorDocument = useMemo(() => {
      if (!editorDocument) return undefined;
      
      return {
        ...editorDocument,
        value: sanitizeCodeContent(editorDocument.value)
      };
    }, [editorDocument]);

    return (
      <>
        <PanelGroup direction="vertical">
          <Panel defaultSize={showTerminal ? DEFAULT_EDITOR_SIZE : 100} minSize={20}>
            <PanelGroup direction="horizontal">
              <Panel defaultSize={20} minSize={10} collapsible>
                <div className="flex flex-col border-r border-bolt-elements-borderColor h-full">
                  <PanelHeader>
                    <div className="i-ph:tree-structure-duotone shrink-0" />
                    Files
                  </PanelHeader>
                  <FileTree
                    className="h-full"
                    files={files}
                    hideRoot
                    unsavedFiles={unsavedFiles}
                    rootFolder={WORK_DIR}
                    selectedFile={selectedFile}
                    onFileSelect={onFileSelect}
                  />
                </div>
              </Panel>
              <PanelResizeHandle />
              <Panel className="flex flex-col" defaultSize={80} minSize={20}>
                <PanelHeader className="overflow-x-auto">
                  {activeFileSegments?.length && (
                    <div className="flex items-center flex-1 text-sm">
                      <FileBreadcrumb pathSegments={activeFileSegments} files={files} onFileSelect={onFileSelect} />

                      {/* {activeFileSegments[activeFileSegments.length - 1].endsWith('.py') && editorDocument && ( */}
                      {activeFileSegments[activeFileSegments.length - 1].endsWith('') && editorDocument && (
                        <div className="flex items-center gap-2 ml-2">


                          {status === 'running' && (
                            <button
                              onClick={handleStopScript}
                              disabled={status === 'stopping'}
                              className={classNames(
                                "px-3 py-1 rounded-md text-sm font-medium transition-colors",
                                "flex items-center gap-2",
                                {
                                  'bg-bolt-elements-button-secondary-background text-bolt-elements-button-secondary-text hover:bg-bolt-elements-button-secondary-backgroundHover': 
                                    status !== 'stopping',
                                  'cursor-not-allowed opacity-75': status === 'stopping'
                                }
                              )}
                            >
                              <div className={classNames(
                                "i-ph:stop-circle",
                                { "animate-spin": status === 'stopping' }
                              )} />
                              {status === 'stopping' ? 'Stopping...' : 'Stop'}
                            </button>
                          )}

                          {hasLogs && (
                            <button
                              onClick={() => setShowAIDialog(true)}
                              disabled={isProcessingAI}
                              className={classNames(
                                "px-3 py-1 rounded-md text-sm font-medium transition-colors",
                                "flex items-center gap-2",
                                "bg-bolt-elements-button-secondary-background text-bolt-elements-button-secondary-text hover:bg-bolt-elements-button-secondary-backgroundHover",
                                { "cursor-not-allowed opacity-75": isProcessingAI }
                              )}
                            >
                              <div className={classNames(
                                "i-ph:robot",
                                { "animate-spin": isProcessingAI }
                              )} />
                              {isProcessingAI ? 'Processing...' : 'AI Analysis'}
                            </button>
                          )}

                          {hasTunedVersions && (
                            <button
                              onClick={() => {
                                // Handle viewing tuned versions
                              }}
                              className="px-3 py-1 rounded-md text-sm font-medium transition-colors flex items-center gap-2 bg-bolt-elements-button-secondary-background text-bolt-elements-button-secondary-text hover:bg-bolt-elements-button-secondary-backgroundHover"
                            >
                              <div className="i-ph:git-branch" />
                              View Tuned Versions
                            </button>
                          )}
                          
                          {activeFileUnsaved && (
                            <div className="flex gap-1 ml-auto -mr-1.5">
                              <PanelHeaderButton onClick={onFileSave}>
                                <div className="i-ph:floppy-disk-duotone" />
                                Save
                              </PanelHeaderButton>
                              <PanelHeaderButton onClick={onFileReset}>
                                <div className="i-ph:clock-counter-clockwise-duotone" />
                                Reset
                              </PanelHeaderButton>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </PanelHeader>

                <div className="h-full flex-1 overflow-hidden">
                  <CodeMirrorEditor
                    theme={theme}
                    editable={!isStreaming && editorDocument !== undefined}
                    settings={editorSettings}
                    doc={sanitizedEditorDocument}
                    autoFocusOnDocumentChange={!isMobile()}
                    onScroll={onEditorScroll}
                    onChange={handleSanitizedEditorChange}
                    onSave={onFileSave}
                  />
                </div>
              </Panel>
            </PanelGroup>
          </Panel>
          <PanelResizeHandle />

          <Panel
            ref={terminalPanelRef}
            defaultSize={showTerminal ? DEFAULT_TERMINAL_SIZE : 0}
            minSize={10}
            collapsible
            onExpand={() => {
              if (!terminalToggledByShortcut.current) {
                workbenchStore.toggleTerminal(true);
                setTerminalVisible(true);
              }
            }}
            onCollapse={() => {
              if (!terminalToggledByShortcut.current) {
                workbenchStore.toggleTerminal(false);
                setTerminalVisible(false);
              }
            }}
          >

            {terminalVisible && (
              <div className="h-full">
                <div className="bg-bolt-elements-terminals-background h-full flex flex-col">
                  <div className="flex items-center bg-bolt-elements-background-depth-2 border-y border-bolt-elements-borderColor gap-1.5 min-h-[34px] p-2">
                    <div className="flex items-center text-sm cursor-pointer gap-1.5 px-3 py-2 h-full whitespace-nowrap rounded-full bg-bolt-elements-terminals-buttonBackground text-bolt-elements-textPrimary">
                      <div className="i-ph:terminal-window-duotone text-lg" />
                      Output Terminal
                      {status && (
                        <span className={classNames(
                          'ml-2 px-2 py-0.5 rounded-full text-xs',
                          {
                            'bg-green-500/20 text-green-500': status === 'running',
                            'bg-red-500/20 text-red-500': status === 'failed',
                            'bg-gray-500/20 text-gray-500': status === 'stopped',
                            'bg-yellow-500/20 text-yellow-500': status === 'stopping',
                            'bg-blue-500/20 text-blue-500': status === 'completed',
                            'bg-purple-500/20 text-purple-500': status === 'initializing' || isInitializing
                          }
                        )}>
                          {isInitializing ? 'Initializing' : status.charAt(0).toUpperCase() + status.slice(1)}
                        </span>
                      )}
                    </div>
                    {hasLogs && (
                      <button
                        onClick={() => setShowAIDialog(true)}
                        className={classNames(
                          "ml-2 px-3 py-1 rounded-md text-sm font-medium transition-colors flex items-center gap-2",
                          "bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text",
                          "hover:bg-bolt-elements-button-primary-backgroundHover",
                          "disabled:opacity-50 disabled:cursor-not-allowed"
                        )}
                        disabled={isProcessingAI}
                      >
                        <div className={classNames(
                          "i-ph:robot",
                          { "animate-spin": isProcessingAI }
                        )} />
                        {hasLogs && (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setShowAIDialog(true)}
                              className={classNames(
                                "px-3 py-1 rounded-md text-sm font-medium transition-colors flex items-center gap-2",
                                "bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text",
                                "hover:bg-bolt-elements-button-primary-backgroundHover",
                                "disabled:opacity-50 disabled:cursor-not-allowed"
                              )}
                              disabled={isProcessingAI}
                            >
                              {isProcessingAI ? "Processing..." : "Fine Tune with AI"}
                              <div 
                                className="ml-1 text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary cursor-help"
                                title="AI will analyze your logs and suggest improvements to your trading strategy"
                              >
                                <div className="i-ph:question-circle" />
                              </div>
                            </button>
                            {hasTunedVersions && (
                              <span className="text-sm text-green-500 flex items-center gap-1">
                                <div className="i-ph:check-circle" />
                                Fine tuned versions available
                              </span>
                            )}
                          </div>
                        )}
                      </button>
                    )}
                    <IconButton
                      className="ml-auto"
                      icon="i-ph:caret-down"
                      title="Close"
                      size="md"
                      onClick={() => {
                        workbenchStore.toggleTerminal(false);
                        setTerminalVisible(false);
                      }}
                    />
                  </div>
                  <Terminal
                    className="h-full overflow-hidden"
                    ref={terminalRef}
                    onTerminalReady={(terminal) => workbenchStore.attachTerminal(terminal)}
                    onTerminalResize={(cols, rows) => workbenchStore.onTerminalResize(cols, rows)}
                    theme={theme}
                    logs={logs}
                  />
                </div>
              </div>
            )}
          </Panel>
          
        </PanelGroup>
        
        <ApiKeyDialog
          isOpen={showApiKeyDialog}
          onClose={() => {
            setShowApiKeyDialog(false);
            setPendingScriptContent(null);
          }}
          onConfirm={handleApiKeyConfirm}
          platformId="binance"
        />

        <LiveTradingAIDialog
          isOpen={showAIDialog}
          onClose={() => setShowAIDialog(false)}
          selectedFile={selectedFile}
        />
      </>
    );
  },
);

function extractScriptFromResponse(response: string): string | null {
  const match = response.match(/```python\n([\s\S]*?)```/);
  return match ? match[1].trim() : null;
}