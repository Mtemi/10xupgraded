// File: src/components/Artifact.tsx
import { useStore } from '@nanostores/react';
import { AnimatePresence, motion } from 'framer-motion';
import { computed } from 'nanostores';
import {
  memo,
  useEffect,
  useRef,
  useState,
  useCallback
} from 'react';
import {
  createHighlighter,
  type BundledLanguage,
  type BundledTheme,
  type HighlighterGeneric
} from 'shiki';
import { useNavigate } from '@remix-run/react';
import { toast } from 'react-toastify';
import type { ActionState } from '~/lib/runtime/action-runner';
import { workbenchStore } from '~/lib/stores/workbench';
import { classNames } from '~/utils/classNames';
import { cubicEasingFn } from '~/utils/easings';
import { supabase } from '~/lib/superbase/client';
import { sanitizeLogs, desanitizeLogsForAI, desanitizeForAI } from '~/utils/content-sanitizer';
import { chatId, urlId } from '~/lib/persistence/useChatHistory';
import { APA_DOMAIN } from '~/lib/api/routing';

// Silence TS on import.meta.hot
declare global {
  interface ImportMeta { hot?: any }
}

const highlighterOptions = {
  langs: ['shell'],
  themes: ['light-plus', 'dark-plus'],
};
const shellHighlighter: HighlighterGeneric<BundledLanguage, BundledTheme> =
  import.meta.hot?.data.shellHighlighter
    ?? (await createHighlighter(highlighterOptions));
if (import.meta.hot) {
  import.meta.hot.data.shellHighlighter = shellHighlighter;
}

interface ArtifactProps { 
  messageId: string;
}

export const Artifact = memo(({ messageId }: ArtifactProps) => {
  const navigate = useNavigate();

  const artifacts = useStore(workbenchStore.artifacts);
  const artifact = artifacts[messageId];
  const actions = useStore(
    computed(artifact.runner.actions, (a) => Object.values(a))
  );

  const userToggledActions = useRef(false);
  const [showActions, setShowActions] = useState(false);

  const [savedFiles, setSavedFiles] = useState<Set<string>>(new Set());

  // Layout-neutral scroll helper - respects user scroll preference
  const scrollToBottom = () => {
    const sc = document.querySelector('[data-chat-scroll-container]') as HTMLElement | null;
    if (!sc) return;

    // Check if user is near bottom (within 150px)
    const { scrollTop, scrollHeight, clientHeight } = sc;
    const distanceFromBottom = scrollHeight - clientHeight - scrollTop;

    // Only auto-scroll if user is already near bottom (hasn't scrolled up)
    if (distanceFromBottom <= 150) {
      sc.scrollTo({ top: sc.scrollHeight, behavior: 'smooth' });
    }
  };

  // When artifact actions list changes (files complete, logs attach), conditionally scroll to bottom
  useEffect(() => {
    scrollToBottom();
  }, [actions]);

  // When DB save completes (you dispatch 'databaseSaveComplete' already), conditionally scroll to bottom
  useEffect(() => {
    const onDbSaved = () => scrollToBottom();
    window.addEventListener('databaseSaveComplete', onDbSaved);
    return () => window.removeEventListener('databaseSaveComplete', onDbSaved);
  }, []);

  const saveStrategyToDatabase = useCallback(async (filePath: string, content: string) => {
    try {
      console.log('[Artifact] Starting database save for:', filePath);

      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        console.log('[Artifact] No authenticated user, skipping database save');
        return;
      }

      // Extract strategy name from filePath (remove .py extension)
      const strategyName = filePath.split('/').pop()?.replace('.py', '') || 'defaultstrategy';
      console.log('[Artifact] Using strategy name for database:', strategyName);
      
      // Get current chat ID and URL ID
      const currentChatId = chatId.get();
      const currentUrlId = urlId.get();
      
      // Use either the URL ID or chat ID, with a fallback
      let associatedChatId = currentChatId || currentUrlId;
      
      // If we don't have any ID, generate one and set it consistently
      if (!associatedChatId) {
        const timestamp = Date.now().toString(36);
        const randomPart = Math.random().toString(36).substring(2, 10);
        associatedChatId = `chat_${timestamp}${randomPart}`;
        chatId.set(associatedChatId);
        urlId.set(associatedChatId);
        console.log('[Artifact] Generated new chat ID:', associatedChatId);
      }
      
      console.log('[Artifact] Using chat ID for association:', associatedChatId);

      const databaseContent = desanitizeForAI(content);
      console.log('[Artifact] Content prepared for database storage');

      // Save to database with exact filename
      const { data, error } = await supabase.from('trading_scripts').upsert({
        user_id: user.id,
        name: strategyName, // Use exact strategy name from filename
        content: databaseContent,
        description: 'Generated trading strategy',
        chat_id: associatedChatId,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,name', // Handle conflicts based on user_id and name
        ignoreDuplicates: false
      }).select();

      if (error) {
        console.error('[Artifact] Failed to save script to database:', error.message);
        toast.error(`Failed to save ${strategyName} to database`);
      } else {
        console.log('[Artifact] Script saved successfully with exact filename:', {
          savedData: data,
          filename: strategyName
        });
        
        toast.success(`Strategy "${strategyName}" saved successfully!`);

        // Mark this exact file (with .py) as processed so we don't double-save
        setSavedFiles(prev => new Set([...prev, filePath]));

        // Signal completion for other components
        window.dispatchEvent(new CustomEvent('databaseSaveComplete', {
          detail: {
            filePath: filePath,
            messageId,
            strategyName: strategyName,
            success: true
          }
        }));
      }

    } catch (error) {
      console.error('[Artifact] Error in saveStrategyToDatabase:', error);
      const strategyName = filePath.split('/').pop()?.replace('.py', '') || 'strategy';
      toast.error(`Critical error saving ${strategyName}`);

      window.dispatchEvent(new CustomEvent('databaseSaveComplete', {
        detail: {
          filePath: filePath,
          messageId,
          strategyName: strategyName,
          success: false,
          error: error instanceof Error ? error.message : String(error)
        }
      }));
    }
  }, [messageId]);

  // Process Python files immediately when action completes
  useEffect(() => {
    const processPythonFiles = async () => {
      for (const action of actions) {
        if (action.type === 'file' && 
            action.filePath?.endsWith('.py') && 
            action.status === 'complete' &&
            action.content &&
            !savedFiles.has(action.filePath)) {
          
          console.log('[Artifact] Processing completed Python file:', action.filePath);
          await saveStrategyToDatabase(action.filePath, action.content);
        }
      }
    };
    
    processPythonFiles();
  }, [actions, savedFiles, saveStrategyToDatabase]);

  // ─── deployment & log state ────────────────────────────────────────────────
  const [botDeploymentStatus, setBotDeploymentStatus] = useState<{
    phase: string;
    ready: boolean;
    hasError: boolean;
    strategyName?: string;
    hasBot: boolean;
    isChecking: boolean;
  }>({
    phase: 'unknown',
    ready: false,
    hasError: false,
    hasBot: false,
    isChecking: true
  });

  const [logs, setLogs] = useState<string[]>([]);
  const [showingLogs, setShowingLogs] = useState(false);
  const [selectedStrategy, setSelectedStrategy] = useState<string | null>(null);
  const [isDeploying, setIsDeploying] = useState(false);
  const [hasBotConfig, setHasBotConfig] = useState(false);
  const [botConfigId, setBotConfigId] = useState<string | null>(null);

  // ⭐ Immediately end "Checking..." and surface the Configure button on save
  useEffect(() => {
    const onDbSaved = (ev: Event) => {
      const e = ev as CustomEvent<{ success: boolean; strategyName?: string }>;
      if (!e.detail?.success) return;

      // Stop "Checking…" and ensure the "Configure Bot" button renders now
      setBotDeploymentStatus(s => ({
        ...s,
        isChecking: false,
        hasBot: false,         // no deployed bot yet -> show Configure
        hasError: false,
        ready: false,
        strategyName: e.detail.strategyName ?? s.strategyName
      }));
    };

    window.addEventListener('databaseSaveComplete', onDbSaved);
    return () => window.removeEventListener('databaseSaveComplete', onDbSaved);
  }, []);

  // ─── extract strategy name from the .py action ─────────────────────────────
  const extractStrategyName = useCallback(() => {
    const fileAct = actions.find(a => a.type === 'file' && a.filePath?.endsWith('.py'));
    if (!fileAct) return null;
    // Extract strategy name from the properly generated file path
    const fileName = fileAct.filePath!.split('/').pop()!.replace('.py','');
    return fileName;
  }, [actions]);


  // ─── poll pod status ───────────────────────────────────────────────────────
  const checkBotDeploymentStatus = useCallback(async () => {
    const strat = extractStrategyName();
    if (!strat) {
      setBotDeploymentStatus(s => ({ ...s, isChecking:false, hasBot:false }));
      setHasBotConfig(false);
      return;
    }
    try {
      const { data:{ user } } = await supabase.auth.getUser();
      if (!user) {
        setBotDeploymentStatus(s => ({ ...s, isChecking:false, hasBot:false, strategyName: strat }));
        setHasBotConfig(false);
        return;
      }
      // Check if bot configuration exists
      const { data:cfgs, error:cfgErr } = await supabase
        .from('bot_configurations')
        .select('*')
        .eq('user_id', user.id);
      if (cfgErr) throw cfgErr;
      const matchingConfig = cfgs?.find(c => c.config?.strategy === strat);

      if (!matchingConfig) {
        setBotDeploymentStatus(s => ({ ...s, isChecking:false, hasBot:false, strategyName: strat }));
        setHasBotConfig(false);
        setBotConfigId(null);
        return;
      }

      // Bot config exists
      setHasBotConfig(true);
      setBotConfigId(matchingConfig.id);

      // Check pod status
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/apa/podstatus?botName=${strat}&userId=${user.id}`, {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}
      });
      if (!res.ok) {
        setBotDeploymentStatus(s => ({
          ...s,
          isChecking:false,
          hasBot:true,
          phase:'NotFound',
          ready:false,
          hasError:false,
          strategyName: strat
        }));
        return;
      }
      const data = await res.json();
      setBotDeploymentStatus({
        phase: data.phase   || 'Unknown',
        ready: data.ready   || false,
        hasError: data.hasError || false,
        hasBot: true,
        isChecking: false,
        strategyName: strat,
        scriptSaved: false
      });
    } catch(e) {
      console.error(e);
      setBotDeploymentStatus(s => ({ ...s, isChecking:false, hasBot:false }));
      setHasBotConfig(false);
    }
  }, [extractStrategyName]);

  useEffect(() => {
    if (actions.length) {
      checkBotDeploymentStatus();
      const iv = setInterval(checkBotDeploymentStatus, 5000);
      return () => clearInterval(iv);
    }
  }, [actions, checkBotDeploymentStatus]);

  // ─── fetch + sanitize logs ─────────────────────────────────────────────────
  const fetchBotLogs = useCallback(async (strategyName: string) => {
    try {
      const { data:{ user } } = await supabase.auth.getUser();
      if (!user) { toast.error('Sign in to view logs'); return; }
      const res = await fetch(
        `/apa/podlogs?botName=${strategyName}&userId=${user.id}&lines=50`
      );
      if (!res.ok) {
        const txt = await res.text();
        try { toast.error(JSON.parse(txt).error || txt); }
        catch { toast.error(txt.slice(0,100)); }
        return;
      }
      const text = await res.text();
      const sanitized = text
        .split('\n')
        .filter(l => l.trim())
        .map(l => l.replace(/freqtrade/gi,'10xtraders'));
      setLogs(sanitized.length ? sanitized : ['No logs available for this bot']);
      setSelectedStrategy(strategyName);
      setShowingLogs(true);
    } catch(e) {
      console.error(e);
      toast.error('Failed to fetch logs');
    }
  }, []);

  // ─── Handle redeploy ────────────────────────────────────────────────────────
  const handleRedeploy = async () => {
    const strat = extractStrategyName();
    if (!strat || !botConfigId || !hasBotConfig) {
      toast.error('No bot configuration found');
      return;
    }

    setIsDeploying(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Please sign in to deploy');
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Session expired');
        return;
      }

      // Fetch bot configuration
      const { data: config, error: configErr } = await supabase
        .from('bot_configurations')
        .select('*')
        .eq('id', botConfigId)
        .single();

      if (configErr || !config) {
        toast.error('Failed to load bot configuration');
        return;
      }

      toast.info('Redeploying bot with updated strategy...');

      const deploymentUrl = `https://10xtraders.ai/apa/user/kubecheck/${user.id}/${strat}`;
      const response = await fetch(deploymentUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(config.config),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Deployment failed' }));
        throw new Error(error.error || 'Deployment failed');
      }

      toast.success('Bot redeployed successfully!');

      // Update status immediately
      setBotDeploymentStatus(prev => ({
        ...prev,
        phase: 'Deploying',
        ready: false,
        hasError: false,
        isChecking: false
      }));

      // Refresh status after a delay
      setTimeout(() => checkBotDeploymentStatus(), 3000);
    } catch (error) {
      console.error('Redeploy error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to redeploy bot');
    } finally {
      setIsDeploying(false);
    }
  };

  // ─── badge + fine-tune button logic ────────────────────────────────────────
  const getDeploymentStatusDisplay = () => {
    // Show Configure Bot immediately when we have a strategy name
    const strat = extractStrategyName();
    if (strat) {
      return {
        text: 'Configure Bot',
        icon: 'i-ph:robot',
        color: 'text-accent-500 hover:text-accent-600 cursor-pointer',
        onClick: () => navigate('/bots/new')
      };
    }

    // No strategy available yet
    return null;
  };
  const deploymentStatus = getDeploymentStatusDisplay();

  // ─── Status badge display (mimics BotList.tsx) ────────────────────────────
  const getStatusBadge = () => {
    if (botDeploymentStatus.isChecking) {
      return {
        text: '⏳ Checking...',
        className: 'bg-gray-500/20 text-gray-500'
      };
    }

    const { phase, ready, hasError, hasBot } = botDeploymentStatus;

    // Not deployed
    if (!hasBot || phase === 'NotFound') {
      return {
        text: 'Not Deployed',
        className: 'bg-gray-500/20 text-gray-500'
      };
    }

    // Deploying
    if (phase === 'Deploying' || isDeploying) {
      return {
        text: '🟡 Deploying',
        className: 'bg-yellow-500/20 text-yellow-500'
      };
    }

    // Error state
    if (hasError) {
      return {
        text: '🛠️ Re-configure',
        className: 'bg-amber-500/20 text-amber-500'
      };
    }

    // Running
    if (ready && phase === 'Running') {
      return {
        text: '✅ Running',
        className: 'bg-green-500/20 text-green-500'
      };
    }

    // Pending
    if (phase === 'Pending') {
      return {
        text: '🟡 Pending',
        className: 'bg-yellow-500/20 text-yellow-500'
      };
    }

    // Unknown/Default
    return {
      text: phase || 'Unknown',
      className: 'bg-gray-500/20 text-gray-500'
    };
  };

  const statusBadge = getStatusBadge();

  const toggleActions = () => {
    userToggledActions.current = true;
    setShowActions(x => !x);
  };

  useEffect(() => {
    if (actions.length && !showActions && !userToggledActions.current) {
      setShowActions(true);
    }
  }, [actions]);

  // ─── ActionList component with proper database saving ─────────────────────
  interface ActionListProps { 
    actions: ActionState[];
    savedFiles: Set<string>;
    setSavedFiles: React.Dispatch<React.SetStateAction<Set<string>>>;
    chatId?: string;
    onPythonFileProcessed?: (filePath: string, content: string) => Promise<void>;
  }

  const ActionList = memo(({ actions, savedFiles, setSavedFiles, chatId, onPythonFileProcessed }: ActionListProps) => {
    
    // Process Python files immediately when action completes
    useEffect(() => {
      const processPythonFiles = async () => {
        for (const action of actions) {
          if (action.type === 'file' && 
              action.filePath?.endsWith('.py') && 
              action.status === 'complete' &&
              action.content &&
              !savedFiles.has(action.filePath)) {
            
            console.log('[ActionList] 🐍 Processing completed Python file:', action.filePath);
            
            if (onPythonFileProcessed) {
              await onPythonFileProcessed(action.filePath, action.content);
            }
          }
        }
      };
      
      processPythonFiles();
    }, [actions, savedFiles, onPythonFileProcessed]);

    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
        <ul className="list-none space-y-2.5">
          {actions.map((action, idx) => {
            const { status, type, content } = action;
            const isLast = idx === actions.length - 1;
            return (
              <motion.li key={idx} variants={actionVariants} initial="hidden" animate="visible" transition={{ duration: 0.2, ease: cubicEasingFn }}>
                <div className="flex items-center gap-1.5 text-sm">
                  <div className={classNames('text-lg', getIconColor(status))}>
                    {status === 'running' ? <div className="i-svg-spinners:90-ring-with-bg" /> 
                     : status === 'pending' ? <div className="i-ph:circle-duotone" /> 
                     : status === 'complete' ? <div className="i-ph:check" /> 
                     : (status === 'failed' || status === 'aborted') ? <div className="i-ph:x" /> 
                     : null}
                  </div>
                  {type === 'file' ? (
                    <div>
                      Open{' '}
                      <span className="bg-bolt-elements-artifacts-inlineCode-background text-bolt-elements-artifacts-inlineCode-text px-1.5 py-1 rounded-md">
                        {action.filePath}
                      </span>
                    </div>
                  ) : type === 'shell' ? (
                    <div className="flex items-center w-full min-h-[28px]">
                      <span className="flex-1">Run command</span>
                    </div>
                  ) : null}
                </div>
                {type === 'shell' && (
                  <ShellCodeBlock
                    classsName={classNames('mt-1', { 'mb-3.5': !isLast })}
                    code={content}
                  />
                )}
              </motion.li>
            );
          })}
        </ul>
      </motion.div>
    );
  });

  // ─── render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Only render if we have actions and this is the end of the message */}
      {/* Buttons moved to Workbench editor header */}
      {actions.length > 0 && artifact && (
        <div className="hidden">
          {/* All bot action buttons removed - now in editor panel header */}
        </div>
      )}
      {/** exactly the same LogsModal from BotList.tsx **/}
      <LogsModal
        showingLogs={showingLogs}
        logs={logs}
        closeLogs={() => {
          setShowingLogs(false);
          setSelectedStrategy(null);
          setLogs([]);
        }}
        strategyChatIds={{ [selectedStrategy!]: /* your chat_id map */ '' }}
        config={{
          id: '',
          name: '',
          config: { strategy: selectedStrategy! },
          is_active: false,
          created_at: '',
          updated_at: '',
          user_id: '',
          chat_id: undefined
        }}
      />
    </>
  );
});

// ─── ShellCodeBlock, ActionList & getIconColor unchanged ─────────────────────
interface ShellCodeBlockProps { classsName?: string; code:string }
function ShellCodeBlock({ classsName, code }:ShellCodeBlockProps){
  return (
    <div
      className={classNames('text-xs', classsName)}
      dangerouslySetInnerHTML={{
        __html: shellHighlighter.codeToHtml(code,{ lang:'shell', theme:'dark-plus' })
      }}
    />
  );
}

const actionVariants = { hidden:{opacity:0,y:20}, visible:{opacity:1,y:0} };

function getIconColor(status:ActionState['status']){
  switch(status){
    case 'pending': return 'text-bolt-elements-textTertiary';
    case 'running': return 'text-bolt-elements-loader-progress';
    case 'complete': return 'text-bolt-elements-icon-success';
    case 'aborted': return 'text-bolt-elements-textSecondary';
    case 'failed':  return 'text-bolt-elements-icon-error';
    default:        return undefined;
  }
}

// ─── LogsModal verbatim from BotList.tsx ─────────────────────────────────────
export interface BotConfiguration {
  id: string;
  name: string;
  config: any;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  user_id: string;
  chat_id?: string;
}

interface LogsModalProps {
  showingLogs: boolean;
  logs: string[];
  closeLogs: () => void;
  strategyChatIds: Record<string, string>;
  config: BotConfiguration; // has user_id and config.strategy
}
function LogsModal({
  showingLogs,
  logs,
  closeLogs,
  strategyChatIds,
  config
}: LogsModalProps) {
  const navigate = useNavigate();

  const handleFineTune = useCallback(async () => {
    const strategy = config.config?.strategy;
    if (!strategy) {
      toast.error('No strategy available');
      return;
    }

    // 1) figure out the chatId (either from props or fetch it now)
    let chatId = strategyChatIds[strategy];
    if (!chatId) {
      try {
        const { data: script, error: scriptErr } = await supabase
          .from('trading_scripts')
          .select('chat_id')
          .eq('user_id', config.user_id)
          .eq('name', strategy)
          .single();
        if (scriptErr || !script?.chat_id) {
          toast.error('No chat associated with this strategy');
          return;
        }
        chatId = script.chat_id;
      } catch (e) {
        console.error(e);
        toast.error('Failed to look up chat for fine-tuning');
        return;
      }
    }

    // 2) ensure we have logs
    if (!logs.length) {
      toast.error('No logs available for analysis');
      return;
    }
    const filtered = logs.filter(l => l.trim()).slice(-50);
    if (!filtered.length) {
      toast.error('No valid log entries found for analysis');
      return;
    }

      // 3) Convert logs back to freqtrade format for AI processing and build the fine-tune message
      const desanitizedLogs = desanitizeLogsForAI(filtered);
      const txt = desanitizedLogs.join('\n');
    const msg = `Please analyze these execution logs from my ${strategy} trading strategy and rewrite the code noting the logs below:

Execution Logs (${filtered.length} entries):

${txt}

Analyze the logs and improve the strategy based on these logs.`;
    localStorage.setItem(`pendingFineTuneMessage_${chatId}`, msg);
    localStorage.setItem('hasPendingFineTune', 'true');

    // 4) close modal + jump to chat
    closeLogs();
    navigate(`/chat/${chatId}`);
    toast.success(`Logs (${filtered.length}) prepared for AI analysis`);
  }, [strategyChatIds, config, logs, navigate, closeLogs]);

  if (!showingLogs) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-bolt-elements-background-depth-2 rounded-lg p-6 max-w-4xl w-full max-h-[80vh] flex flex-col">
        <div className="flex justify-between items-center mb-4 gap-4">
          <h3 className="text-xl font-semibold text-bolt-elements-textPrimary">Bot Logs</h3>
          <button
            onClick={handleFineTune}
            className="px-4 py-2 bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text rounded-md hover:bg-bolt-elements-button-primary-backgroundHover transition-colors flex items-center gap-2"
            disabled={!logs.length}
          >
            <div className="i-ph:robot text-lg" />
            Fine Tune with AI
          </button>
          <button
            onClick={closeLogs}
            className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary"
          >
            <div className="i-ph:x-circle text-xl" />
          </button>
        </div>
        <div className="flex-1 overflow-auto bg-bolt-elements-background-depth-3 p-4 rounded font-mono text-xs text-bolt-elements-textSecondary">
          {!logs.length ? (
            <div className="text-center text-bolt-elements-textTertiary">No logs available</div>
          ) : (
            logs.map((line, i) => (
              <div key={i} className="whitespace-pre-wrap mb-1 hover:bg-bolt-elements-background-depth-4 px-1 rounded">
                {line}
              </div>
            ))
          )}
        </div>
        {logs.length > 0 && (
          <div className="mt-4 text-xs text-bolt-elements-textTertiary text-center">
            Showing {logs.length} log entries •{' '}
            <span className="text-accent-500 ml-1">
              Click "Fine Tune with AI" to analyze these logs and improve your strategy
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── ActionList component with proper database saving ─────────────────────
interface ActionListProps { 
  actions: ActionState[];
  savedFiles: Set<string>;
  setSavedFiles: React.Dispatch<React.SetStateAction<Set<string>>>;
  chatId?: string;
  onPythonFileProcessed?: (filePath: string, content: string) => Promise<void>;
}

const ActionList = memo(({ actions, savedFiles, setSavedFiles, chatId, onPythonFileProcessed }: ActionListProps) => {
  
  // Process Python files immediately when action completes
  useEffect(() => {
    const processPythonFiles = async () => {
      for (const action of actions) {
        if (action.type === 'file' && 
            action.filePath?.endsWith('.py') && 
            action.status === 'complete' &&
            action.content &&
            !savedFiles.has(action.filePath)) {
          
          console.log('[ActionList] 🐍 Processing completed Python file:', action.filePath);
          
          if (onPythonFileProcessed) {
            await onPythonFileProcessed(action.filePath, action.content);
          }
        }
      }
    };
    
    processPythonFiles();
  }, [actions, savedFiles, onPythonFileProcessed]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
      <ul className="list-none space-y-2.5">
        {actions.map((action, idx) => {
          const { status, type, content } = action;
          const isLast = idx === actions.length - 1;
          return (
            <motion.li key={idx} variants={actionVariants} initial="hidden" animate="visible" transition={{ duration: 0.2, ease: cubicEasingFn }}>
              <div className="flex items-center gap-1.5 text-sm">
                <div className={classNames('text-lg', getIconColor(status))}>
                  {status === 'running' ? <div className="i-svg-spinners:90-ring-with-bg" /> 
                   : status === 'pending' ? <div className="i-ph:circle-duotone" /> 
                   : status === 'complete' ? <div className="i-ph:check" /> 
                   : (status === 'failed' || status === 'aborted') ? <div className="i-ph:x" /> 
                   : null}
                </div>
              </div>
              {type === 'shell' && (
                <ShellCodeBlock
                  classsName={classNames('mt-1', { 'mb-3.5': !isLast })}
                  code={content}
                />
              )}
            </motion.li>
          );
        })}
      </ul>
    </motion.div>
  );
});