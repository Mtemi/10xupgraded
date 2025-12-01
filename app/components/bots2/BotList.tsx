// File: src/components/BotList.tsx

import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { supabase } from '~/lib/superbase/client';
import { classNames } from '~/utils/classNames';
import { useNavigate } from '@remix-run/react';
import { BotDeployButton } from './BotDeployButton';
import { useFreqtradeWS, type FreqtradeEvent } from '~/lib/hooks/useFreqtradeWS';

export interface BotConfiguration {
  id: string;
  name: string;
  config: any;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  user_id: string;
}

// Function to sanitize logs - replace 'freqtrade' with '10xtraders'
const sanitizeLogs = (logs: string[]): string[] =>
  logs.map(log => log.replace(/freqtrade/gi, '10xtraders'));

export function BotList() {
  const [configurations, setConfigurations] = useState<BotConfiguration[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // pagination
  const [currentPage, setCurrentPage] = useState(1);
  const botsPerPage = 10;

  // fetch configs
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          toast.error('Please sign in to view your bots');
          return;
        }
        const { data, error } = await supabase
          .from('bot_configurations')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });
        if (error) throw error;
        setConfigurations(data || []);
      } catch {
        toast.error('Failed to load bot configurations');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const indexOfLastBot = currentPage * botsPerPage;
  const indexOfFirstBot = indexOfLastBot - botsPerPage;
  const currentBots = configurations.slice(indexOfFirstBot, indexOfLastBot);
  const totalPages = Math.max(1, Math.ceil(configurations.length / botsPerPage));

  // Function to change page
  const paginate = (pageNumber: number) => setCurrentPage(pageNumber);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin w-8 h-8 border-4 border-accent-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!configurations.length) {
    return (
      <div className="text-center p-8">
        <div className="text-bolt-elements-textSecondary mb-4">
          You don't have any bot configurations yet
        </div>
        <button
          onClick={() => navigate('/bots/new')}
          className="px-4 py-2 bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text rounded-md hover:bg-bolt-elements-button-primary-backgroundHover transition-colors"
        >
          Create Your First Bot
        </button>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-bolt-elements-background-depth-3">
            {[
              '#',
              'Name',
              'Exchange',
              'Strategy',
              'Service',
              'Trader',
              'Open Trades',
              'Logs',
              'Last Updated',
              'Actions',
            ].map(header => (
              <th
                key={header}
                className="px-3 py-2 text-left text-xs font-medium text-bolt-elements-textPrimary"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-bolt-elements-borderColor">
          {currentBots.map((cfg, idx) => (
            <BotRow
              key={cfg.id}
              config={cfg}
              index={indexOfFirstBot + idx + 1}
              onRemove={(id) => setConfigurations(cs => cs.filter(c => c.id !== id))}
            />
          ))}
        </tbody>
      </table>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center mt-6">
          <nav className="flex items-center gap-1">
            <button
              onClick={() => paginate(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className={classNames(
                "p-2 rounded-md text-bolt-elements-textSecondary",
                currentPage === 1
                  ? "opacity-50 cursor-not-allowed"
                  : "hover:bg-bolt-elements-background-depth-3 hover:text-bolt-elements-textPrimary"
              )}
            >
              <div className="i-ph:caret-left" />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(n => (
              <button
                key={n}
                onClick={() => paginate(n)}
                className={classNames(
                  "w-8 h-8 flex items-center justify-center rounded-md text-sm",
                  currentPage === n
                    ? "bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent"
                    : "text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3 hover:text-bolt-elements-textPrimary"
                )}
              >
                {n}
              </button>
            ))}
            <button
              onClick={() => paginate(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              className={classNames(
                "p-2 rounded-md text-bolt-elements-textSecondary",
                currentPage === totalPages
                  ? "opacity-50 cursor-not-allowed"
                  : "hover:bg-bolt-elements-background-depth-3 hover:text-bolt-elements-textPrimary"
              )}
            >
              <div className="i-ph:caret-right" />
            </button>
          </nav>
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// BotRow: a single row where we can freely call hooks
// -----------------------------------------------------------------------------
function BotRow({
  config,
  index,
  onRemove,
}: {
  config: BotConfiguration;
  index: number;
  onRemove: (id: string) => void;
}) {
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState<boolean>(false);
  const [stopping, setStopping] = useState<boolean>(false);
  const [starting, setStarting] = useState<boolean>(false);
  const [showingLogs, setShowingLogs] = useState<boolean>(false);
  const [logs, setLogs] = useState<string[]>([]);

  // Use the hook to get bot status
  const { 
    status, 
    phase, 
    ready, 
    running, 
    openTradesCount 
  } = useBotStatus(config.config?.strategy, config.user_id);

  // WS for this bot
  useFreqtradeWS({
    strategyName: config.config?.strategy,
    enabled: true,
    onEvent: (ev: FreqtradeEvent) => {
      // Log events for debugging
      console.debug('WS:', config.id, ev);
    },
    eventTypes: ['status','startup','entry','entry_fill','exit','exit_fill','warning','strategy_msg'],
  });

  // Fetch bot logs
  const fetchBotLogs = async (strategyName: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { 
        toast.error('Sign in to view logs'); 
        return; 
      }
      
      const res = await fetch(
        `/apa/podlogs?botName=${strategyName}&userId=${user.id}&lines=50`
      );
      
      if (!res.ok) {
        const txt = await res.text();
        try { 
          const errorData = JSON.parse(txt);
          toast.error(errorData.error || 'Failed to fetch logs'); 
        } catch { 
          toast.error(txt.slice(0, 100)); 
        }
        return;
      }
      
      const text = await res.text();
      const sanitized = sanitizeLogs(text.split('\n').filter(l => l.trim()));
      setLogs(sanitized.length ? sanitized : ['No logs available']);
      setShowingLogs(true);
    } catch (error) {
      console.error('Error fetching logs:', error);
      toast.error('Failed to fetch logs');
    }
  };

  // Navigate to edit page
  const handleEdit = () => navigate(`/bots/edit/${config.id}`);
  
  // Navigate to view details page
  const handleViewDetails = () => navigate(`/bots/view/${config.config?.strategy}`);

  // Delete bot configuration
  const handleDelete = async () => {
    setDeleting(true);
    try {
      // Delete pod if running
      if (ready || running) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          toast.error('Please sign in to delete bots');
          return;
        }
        
        await fetch(
          `/apa/deletepod?botName=${config.config?.strategy}&userId=${user.id}`,
          { method: 'DELETE' }
        );
      }
      
      // Delete from database
      await supabase.from('bot_configurations').delete().eq('id', config.id);
      toast.success('Bot configuration deleted');
      onRemove(config.id);
    } catch (error) {
      console.error('Error deleting bot:', error);
      toast.error('Failed to delete bot configuration');
    } finally {
      setDeleting(false);
    }
  };

  // Start bot
  const handleStartBot = async () => {
    setStarting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Please sign in to control bot');
        return;
      }
      
      const response = await fetch(
        `/user/${config.config?.strategy}/api/v1/start`, 
        {
          method: 'POST',
          headers: { 'Authorization': 'Basic ' + btoa(`meghan:${user.id}`) }
        }
      );
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText);
      }
      
      toast.success('Bot started successfully');
    } catch (error) {
      console.error('Error starting bot:', error);
      toast.error('Failed to start bot');
    } finally {
      setStarting(false);
    }
  };

  // Stop bot
  const handleStopBot = async () => {
    setStopping(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Please sign in to control bot');
        return;
      }
      
      const response = await fetch(
        `/user/${config.config?.strategy}/api/v1/stop`, 
        {
          method: 'POST',
          headers: { 'Authorization': 'Basic ' + btoa(`meghan:${user.id}`) }
        }
      );
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText);
      }
      
      toast.success('Bot stopped successfully');
    } catch (error) {
      console.error('Error stopping bot:', error);
      toast.error('Failed to stop bot');
    } finally {
      setStopping(false);
    }
  };

  // Close logs modal
  const closeLogs = () => {
    setShowingLogs(false);
    setLogs([]);
  };

  // Determine if we should show the "Start" button with attention-grabbing styling
  const showStartAttention = ready && !running;

  return (
    <>
      {showingLogs && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-bolt-elements-background-depth-2 rounded-lg p-6 max-w-4xl w-full max-h-[80vh] flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold text-bolt-elements-textPrimary">Bot Logs</h3>
              <button
                onClick={closeLogs}
                className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary"
              >
                <div className="i-ph:x-circle text-xl" />
              </button>
            </div>
            <div className="flex-1 overflow-auto bg-bolt-elements-background-depth-3 p-4 rounded font-mono text-xs text-bolt-elements-textSecondary">
              {logs.length > 0 ? (
                logs.map((line, index) => (
                  <div key={index} className="whitespace-pre-wrap mb-1">
                    {line}
                  </div>
                ))
              ) : (
                <div className="text-center py-4">No logs available</div>
              )}
            </div>
          </div>
        </div>
      )}
      
      <tr
        className={classNames(
          'hover:bg-bolt-elements-background-depth-3 transition-colors',
          config.is_active ? 'bg-bolt-elements-background-depth-3/30' : ''
        )}
      >
        <td className="px-3 py-2 text-xs text-bolt-elements-textPrimary">
          {index}
        </td>
        <td className="px-3 py-2 text-xs text-bolt-elements-textPrimary">
          <div className="flex items-center">
            {config.is_active && (
              <span className="w-2 h-2 bg-green-500 rounded-full mr-2" />
            )}
            {config.name}
          </div>
        </td>
        <td className="px-3 py-2 text-xs text-bolt-elements-textSecondary">
          {config.config?.exchange?.name || 'Not set'}
        </td>
        <td className="px-3 py-2 text-xs text-bolt-elements-textSecondary">
          <div className="max-w-[150px] truncate" title={config.config?.strategy || ''}>
            {config.config?.strategy || 'Not set'}
          </div>
        </td>
        <td className="px-3 py-2 text-xs">
          <span className={classNames(
            'inline-flex items-center px-2 py-1 rounded-full text-xs font-medium',
            {
              'bg-green-500/20 text-green-500': ready,
              'bg-blue-500/20 text-blue-500': phase === 'Running' && !ready,
              'bg-yellow-500/20 text-yellow-500': phase === 'Pending',
              'bg-red-500/20 text-red-500': phase === 'Failed',
              'bg-gray-500/20 text-gray-500': phase === 'NotFound',
              'bg-yellow-500/20 text-yellow-500': !phase && config.is_active,
              'bg-gray-500/20 text-gray-500': !phase && !config.is_active
            }
          )}>
            {ready
              ? 'Ready'
              : phase === 'Running' && !ready
              ? 'Deploying'
              : phase === 'Pending'
              ? 'Pending'
              : phase === 'Failed'
              ? 'Failed'
              : phase === 'NotFound'
              ? 'Not Deployed'
              : config.is_active
              ? 'Ready'
              : 'Inactive'}
          </span>
        </td>
        <td className="px-3 py-2 text-xs">
          {/* Enhanced Trader Status with action button */}
          {ready ? (
            <div className="flex items-center gap-2">
              {running ? (
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-500/20 text-green-500">
                    Running
                  </span>
                  <button
                    onClick={handleStopBot}
                    disabled={stopping}
                    className={classNames(
                      "inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium",
                      "bg-red-500/10 text-red-500 hover:bg-red-500/20",
                      stopping && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    {stopping ? (
                      <div className="i-svg-spinners:90-ring-with-bg text-sm" />
                    ) : (
                      <div className="i-ph:stop-circle text-sm" />
                    )}
                    {stopping ? "Stopping..." : "Stop"}
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleStartBot}
                  disabled={starting}
                  className={classNames(
                    "inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium",
                    "bg-yellow-500/20 text-yellow-500 hover:bg-yellow-500/30",
                    "border border-yellow-500/50 animate-pulse",
                    starting && "opacity-50 cursor-not-allowed"
                  )}
                >
                  {starting ? (
                    <>
                      <div className="i-svg-spinners:90-ring-with-bg text-sm" />
                      Starting...
                    </>
                  ) : (
                    <>
                      <div className="i-ph:play-circle text-sm" />
                      Start
                    </>
                  )}
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-center">
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-500/20 text-gray-500">
                {phase === 'NotFound' ? 'Deploy First' : 'Waiting for Deployment'}
              </span>
            </div>
          )}
        </td>
        <td className="px-3 py-2 text-xs text-bolt-elements-textPrimary">
          {openTradesCount != null ? (
            <span
              onClick={handleViewDetails}
              className={classNames(
                "inline-flex items-center px-2 py-1 rounded-full text-xs font-medium cursor-pointer",
                openTradesCount > 0
                  ? "bg-blue-500/20 text-blue-500"
                  : "bg-gray-500/20 text-gray-500"
              )}
            >
              {openTradesCount}
            </span>
          ) : (
            <span className="text-bolt-elements-textTertiary">-</span>
          )}
        </td>
        <td className="px-3 py-2 text-xs">
          {config.config?.strategy && (
            <button
              onClick={() => fetchBotLogs(config.config.strategy)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-4 hover:text-accent-500"
            >
              <div className="i-ph:terminal text-sm relative">
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 h-[2px] w-[5px] bg-current animate-[blink_1s_infinite]"></span>
              </div>
              Logs
            </button>
          )}
        </td>
        <td className="px-3 py-2 text-xs text-bolt-elements-textSecondary">
          {new Date(config.updated_at).toLocaleString()}
        </td>
        <td className="px-3 py-2 text-xs text-right">
          <div className="flex items-center justify-end space-x-1">
            <button
              onClick={handleViewDetails}
              className="p-1.5 text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-4 rounded-md transition-colors"
              title="View details"
            >
              <div className="i-ph:eye text-lg" />
            </button>
            <button
              onClick={handleEdit}
              className="p-1.5 text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-4 rounded-md transition-colors"
              title="Edit configuration"
            >
              <div className="i-ph:pencil-simple text-lg" />
            </button>
            
            <BotDeployButton
              botId={config.id}
              botConfig={config.config}
              iconOnly
              disabled={running || !config.config?.strategy}
            />
            <button
              onClick={handleDelete}
              disabled={deleting}
              className={classNames(
                "p-1.5 text-bolt-elements-textSecondary hover:text-red-500 hover:bg-bolt-elements-background-depth-4 rounded-md transition-colors",
                deleting && "opacity-50 cursor-not-allowed"
              )}
              title="Delete configuration"
            >
              <div className={classNames(
                "text-lg",
                deleting ? "i-svg-spinners:90-ring-with-bg" : "i-ph:trash"
              )} />
            </button>
          </div>
        </td>
      </tr>
    </>
  );
}

// Custom hook to get bot status
function useBotStatus(strategyName?: string, userId?: string) {
  const [status, setStatus] = useState<string>('unknown');
  const [phase, setPhase] = useState<string | undefined>();
  const [ready, setReady] = useState<boolean>(false);
  const [running, setRunning] = useState<boolean>(false);
  const [openTradesCount, setOpenTradesCount] = useState<number | undefined>();
  
  // Constants for health check
  const heartbeatInterval = 60; // seconds (matches Freqtrade internals.heartbeat_interval)
  const stalenessThreshold = heartbeatInterval * 2; // 2x interval = 120s

  useEffect(() => {
    if (!strategyName || !userId) return;

    let mounted = true;
    const checkStatus = async () => {
      try {
        // First check pod status
        const podResponse = await fetch(`/apa/podstatus?botName=${strategyName}&userId=${userId}`);
        if (!podResponse.ok) {
          console.error('Error fetching pod status:', podResponse.status);
          return;
        }
        
        const podData = await podResponse.json();
        
        if (mounted) {
          setPhase(podData.phase);
          setReady(podData.ready || false);
          
          // If pod is ready, check if bot is running via health endpoint
          if (podData.ready) {
            try {
              const healthResponse = await fetch(`/user/${strategyName}/api/v1/health`, {
                headers: {
                  'Authorization': 'Basic ' + btoa(`meghan:${userId}`)
                }
              });
              
              if (healthResponse.ok) {
                const healthData = await healthResponse.json();
                const nowTs = Math.floor(Date.now() / 1000);
                const age = nowTs - healthData.last_process_ts;
                
                // If heartbeat is fresh, bot is running
                if (age < stalenessThreshold) {
                  setRunning(true);
                  setStatus('running');
                } else {
                  // Heartbeat is stale, bot is stopped or hung
                  setRunning(false);
                  setStatus('stopped');
                }
              } else {
                // Health check failed, assume bot is not running
                setRunning(false);
                setStatus('stopped');
              }
              
              // Also check for open trades count
              const statusResponse = await fetch(`/user/${strategyName}/api/v1/status`, {
                headers: {
                  'Authorization': 'Basic ' + btoa(`meghan:${userId}`)
                }
              });
              
              if (statusResponse.ok) {
                const statusData = await statusResponse.json();
                
                // Determine open trades count
                const tradesCount = Array.isArray(statusData) 
                  ? statusData.length 
                  : Array.isArray(statusData?.open_trades) 
                    ? statusData.open_trades.length 
                    : 0;
                
                setOpenTradesCount(tradesCount);
              }
            } catch (error) {
              console.error('Error checking bot health:', error);
              setRunning(false);
              setStatus('error');
            }
          }
        }
      } catch (error) {
        console.error('Error checking bot status:', error);
        if (mounted) {
          setStatus('error');
        }
      }
    };

    // Initial check
    checkStatus();
    
    // Set up polling interval
    const interval = setInterval(checkStatus, 10000);
    
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [strategyName, userId, stalenessThreshold]);

  return { status, phase, ready, running, openTradesCount };
}