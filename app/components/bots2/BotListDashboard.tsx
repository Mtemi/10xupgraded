import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { supabase } from '~/lib/superbase/client';
import { classNames } from '~/utils/classNames';
import { useNavigate } from '@remix-run/react';
import { BotDeployButton } from './BotDeployButton';
import { useFreqtradeWS, type FreqtradeEvent } from '~/lib/hooks/useFreqtradeWS';

interface BotConfiguration {
  id: string;
  name: string;
  config: any;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  user_id: string;
}

// Function to sanitize logs - replace 'freqtrade' with '10xtraders'
const sanitizeLogs = (logs: string[]): string[] => {
  return logs.map(log => log.replace(/freqtrade/gi, '10xtraders'));
};

export function BotList() {
  const [configurations, setConfigurations] = useState<BotConfiguration[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [stopping, setStopping] = useState<string | null>(null);
  const [starting, setStarting] = useState<string | null>(null);
  const [botStatuses, setBotStatuses] = useState<Record<string, { 
    status: string, 
    running: boolean, 
    manualStopped: boolean, 
    reason?: string,
    openTradesCount?: number,
    ready?: boolean,
    phase?: string 
  }>>({});
  const [traderStatuses, setTraderStatuses] = useState<Record<string, {
    status: string,
    state?: string,
    version?: string,
    lastUpdate: Date
  }>>({});
  const [showingLogs, setShowingLogs] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const botsPerPage = 10;

  // WebSocket connections for each bot
  const [wsConnections, setWsConnections] = useState<Record<string, boolean>>({});
  const [activeWebSockets, setActiveWebSockets] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchConfigurations();
  }, []);

  // Set up polling for bot statuses
  useEffect(() => {
    if (configurations.length === 0) return;

    const pollStatuses = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const newStatuses: Record<string, { status: string, running: boolean, manualStopped: boolean, reason?: string, openTradesCount?: number, ready?: boolean, phase?: string }> = {};
      
      for (const config of configurations) {
        if (config.config?.strategy) {
          try {
            // Get current status from state to preserve manualStopped flag
            const currentStatus = botStatuses[config.id] || { status: 'unknown', running: false, manualStopped: false };
            
            // Only check status if not manually stopped
            if (!currentStatus.manualStopped) {
              const status = await checkBotStatus(config.config.strategy, user.id);
              newStatuses[config.id] = { 
                ...status, 
                manualStopped: currentStatus.manualStopped 
              };
            } else {
              // Preserve the stopped status for manually stopped bots
              newStatuses[config.id] = { 
                status: 'stopped', 
                running: false, 
                manualStopped: true,
                reason: currentStatus.reason
              };
            }
          } catch (err) {
            console.error(`Failed to check status for bot ${config.config.strategy}:`, err);
            // Keep existing status if available, otherwise set to unknown
            newStatuses[config.id] = botStatuses[config.id] || { status: 'unknown', running: false, manualStopped: false };
          }
        }
      }
      
      setBotStatuses(newStatuses);
    };

    // Poll every 10 seconds
    const interval = setInterval(pollStatuses, 10000);
    
    // Initial poll
    pollStatuses();
    
    return () => clearInterval(interval);
  }, [configurations, botStatuses]);

  const fetchConfigurations = async () => {
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

      // Check status for each bot
      if (data && data.length > 0) {
        const statuses: Record<string, { status: string, running: boolean, manualStopped: boolean, reason?: string, openTradesCount?: number, ready?: boolean, phase?: string }> = {};
        
        for (const config of data) {
          if (config.config?.strategy) {
            try {
              const status = await checkBotStatus(config.config.strategy, user.id);
              statuses[config.id] = { 
                ...status, 
                manualStopped: botStatuses[config.id]?.manualStopped || false 
              };
            } catch (err) {
              console.error(`Failed to check status for bot ${config.config.strategy}:`, err);
              statuses[config.id] = { status: 'unknown', running: false, manualStopped: false };
            }
          }
        }
        
        setBotStatuses(statuses);
      }
    } catch (error) {
      console.error('Error fetching bot configurations:', error);
      toast.error('Failed to load bot configurations');
    } finally {
      setLoading(false);
    }
  };

  const checkBotStatus = async (strategyName: string, userId: string): Promise<{ 
    status: string, 
    running: boolean, 
    reason?: string,
    openTradesCount?: number,
    ready?: boolean,
    phase?: string
  }> => {
    try {
      // First, get the pod status to determine if the bot is running
      console.log(`[BotList] Checking pod status for ${strategyName}`);
      const response = await fetch(`/apa/podstatus?botName=${strategyName}&userId=${userId}`);
      
      if (!response.ok) {
        console.error(`[BotList] Error response from status check:`, response.status, response.statusText);
        return { status: 'stopped', running: false };
      }
      
      const data = await response.json();
      
      let status = 'unknown';
      let running = false;
      
      if (data.ready === true) {
        status = 'running';
        running = true;
      } else if (data.phase === 'Failed') {
        status = 'failed';
        running = false;
      } else if (data.phase === 'Running') {
        status = 'deploying'; // Running but not ready yet
        running = false;
      } else if (data.phase === 'Pending') {
        status = 'deploying';
        running = false;
      } else if (data.phase === 'NotFound') {
        status = 'stopped';
        running = false;
      }
      
      // If the bot is running, try to get the open trades count from the API
      let openTradesCount = 0;
      if (running) {
        try {
          const apiUsername = 'meghan';
          const apiPassword = userId;
          const statusUrl = `/user/${strategyName}/api/v1/status`;
          
          const statusResponse = await fetch(statusUrl, {
            headers: {
              'Authorization': 'Basic ' + btoa(`${apiUsername}:${apiPassword}`),
              'Content-Type': 'application/json'
            }
          });
          
          if (statusResponse.ok) {
            const apiData = await statusResponse.json();
            console.log('[BotList] API status response:', apiData);
            
            let botStatus = 'unknown';
            if (Array.isArray(apiData)) {
              // This shouldn't happen for /status — fallback only
              openTradesCount = apiData.length;
              botStatus = 'running'; // fallback assumption
            } else if (apiData && typeof apiData === 'object') {
              const openTrades = Array.isArray(apiData.open_trades) ? apiData.open_trades : [];
              openTradesCount = openTrades.length;
            
              if (apiData.status === 'stopped') {
                botStatus = 'stopped';
              } else if (apiData.status === 'running') {
                botStatus = 'running';
              } else if (apiData.status === 'error') {
                botStatus = 'error';
              }
            }
            
            
            console.log(`[BotList] Open trades count for ${strategyName}: ${openTradesCount}`);
          }
        } catch (apiError) {
          console.error(`[BotList] Error getting open trades count:`, apiError);
          // Continue with pod status even if API call fails
        }
      }
      
      return { 
        status, 
        running,
        reason: data.reason,
        openTradesCount,
        ready: data.ready,
        phase: data.phase
      };
    } catch (error) {
      console.error('Error checking bot status:', error);
      return { status: 'error', running: false };
    }
  };

  const fetchBotLogs = async (strategyName: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Please sign in to view logs');
        return;
      }

      console.log(`[BotList] Fetching logs for bot: ${strategyName}, userId: ${user.id}`);
      const response = await fetch(`/apa/podlogs?botName=${strategyName}&userId=${user.id}&lines=50`);
      
      if (!response.ok) {
        const errorText = await response.text();
        // Extract meaningful error message if possible
        let errorMessage = 'Failed to fetch logs';
        try {
          // Try to parse as JSON
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error || errorJson.message || errorMessage;
        } catch {
          // If not JSON, use text but limit length
          errorMessage = errorText.length > 100 ? 
            `${errorText.substring(0, 100)}...` : 
            errorText;
        }
        
        toast.error(errorMessage);
        return;
      }
      
      const logText = await response.text();
      if (logText) {
        // Apply sanitization to replace 'freqtrade' with '10xtraders'
        const sanitizedLogs = sanitizeLogs(logText.split('\n').filter(line => line.trim()));
        setLogs(sanitizedLogs);
      } else {
        setLogs(['No logs available']);
      }
      
      setShowingLogs(strategyName);
    } catch (error) {
      console.error('Error fetching bot logs:', error);
      toast.error('Failed to fetch logs');
    }
  };

  const handleEdit = (id: string) => {
    navigate(`/bots/edit/${id}`);
  };

  const handleDelete = async (id: string) => {
    try {
      setDeleting(id);
  
      const config = configurations.find(c => c.id === id);
      if (!config || !config.config?.strategy) {
        toast.error('Invalid bot configuration');
        setDeleting(null);
        return;
      }
  
      const strategyName = config.config.strategy;
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        toast.error('Please sign in to delete bots');
        setDeleting(null);
        return;
      }
  
      // Check if the bot has active trades using the status endpoint
      try {
        const apiUsername = 'meghan';
        const apiPassword = user.id;
        const statusUrl = `/user/${strategyName}/api/v1/status`;
  
        const statusResponse = await fetch(statusUrl, {
          headers: {
            'Authorization': 'Basic ' + btoa(`${apiUsername}:${apiPassword}`),
            'Content-Type': 'application/json'
          }
        });
  
        if (statusResponse.ok) {
          const responseText = await statusResponse.text();
          let tradesArray;
          
          try {
            tradesArray = JSON.parse(responseText);
          } catch (parseError) {
            console.error('Error parsing status response:', parseError, responseText);
            toast.warn('Could not verify trades, proceeding cautiously.');
            tradesArray = [];
          }
          
          const tradeCount = Array.isArray(tradesArray) ? tradesArray.length : 0;
  
          if (tradeCount > 0) {
            toast.error(`Cannot delete bot with ${tradeCount} active trades. Please close all trades first or stop the bot using the Stop button.`);
            setDeleting(null);
            return;
          }
        } else {
          // If we can't check trades, just log and continue
          console.log('Could not verify trades, proceeding with deletion');
        }
      } catch (error) {
        console.error('Error checking trades, proceeding with deletion:', error);
        // Continue even if check fails
      }
  
      // Delete the pod if it's running
      if (botStatuses[id]?.running) {
        try {
          const deleteResponse = await fetch(`/apa/deletepod?botName=${strategyName}&userId=${user.id}`, {
            method: 'DELETE'
          });
  
          if (!deleteResponse.ok) {
            const responseText = await deleteResponse.text();
            let errorMessage = 'Failed to delete pod';
            
            try {
              const errorData = JSON.parse(responseText);
              errorMessage = errorData.error || errorData.message || errorMessage;
            } catch {
              errorMessage = responseText.length > 100 ? 
                `${responseText.substring(0, 100)}...` : 
                responseText;
            }
            
            console.error('Error deleting pod:', errorMessage);
            // Continue with database deletion even if pod deletion fails
          } else {
            console.log('Pod deleted successfully');
          }
        } catch (podError) {
          console.error('Error deleting pod:', podError);
          // Continue even if pod deletion fails
        }
      }
  
      // Delete configuration from database
      const { error } = await supabase
        .from('bot_configurations')
        .delete()
        .eq('id', id);
  
      if (error) throw error;
  
      setConfigurations(prev => prev.filter(config => config.id !== id));
      toast.success('Bot configuration deleted successfully');
    } catch (error) {
      console.error('Error deleting bot configuration:', error);
      toast.error('Failed to delete bot configuration');
    } finally {
      setDeleting(null);
    }
  };

  const handleStartBot = async (id: string) => {
    try {
      setStarting(id);
      
      const config = configurations.find(c => c.id === id);
      if (!config || !config.config?.strategy) {
        toast.error('Strategy not found');
        return;
      }
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Please sign in to control bot');
        return;
      }
      
      const apiUsername = 'meghan';
      const apiPassword = user.id;
      const strategyName = config.config.strategy;
      
      // Construct the API URL for the bot action
      const actionUrl = `/user/${strategyName}/api/v1/start`;
      
      // Make the API request
      const response = await fetch(actionUrl, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${apiUsername}:${apiPassword}`),
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        let errorMessage = 'Failed to start bot';
        
        try {
          // Try to get JSON error
          const errorData = await response.json();
          errorMessage = errorData.error || errorData.message || errorMessage;
        } catch {
          // If not JSON, try to get text error
          try {
            const errorText = await response.text();
            // Clean up HTML error messages
            if (errorText.includes('<html>')) {
              errorMessage = 'Server error: Bot may not be deployed yet';
            } else {
              errorMessage = errorText.length > 100 ? 
                `${errorText.substring(0, 100)}...` : 
                errorText;
            }
          } catch {
            // If all else fails, use default message
          }
        }
        
        throw new Error(errorMessage);
      }
      
      const data = await response.json();
      
      // Update status based on the response
      setBotStatuses(prev => ({
        ...prev,
        [id]: { 
          ...prev[id],
          status: 'running', 
          running: true,
          manualStopped: false
        }
      }));
      
      toast.success('Bot started successfully');
      
      // Update active WebSockets to include this bot
      setActiveWebSockets(prev => ({
        ...prev,
        [id]: config.config.strategy
      }));
      
    } catch (error) {
      console.error(`Error starting bot:`, error);
      toast.error(`Failed to start bot: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setStarting(null);
    }
  };

  const handleBotAction = async (id: string, action: 'stop' | 'reload') => {
    try {
      if (action === 'stop') {
        setStopping(id);
      }
      
      const config = configurations.find(c => c.id === id);
      if (!config || !config.config?.strategy) {
        toast.error('Strategy not found');
        return;
      }
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Please sign in to control bot');
        return;
      }
      
      const apiUsername = 'meghan';
      const apiPassword = user.id;
      const strategyName = config.config.strategy;
      
      // Construct the API URL for the bot action
      const actionUrl = `/user/${strategyName}/api/v1/${action}`;
      
      // Make the API request
      const response = await fetch(actionUrl, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${apiUsername}:${apiPassword}`),
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        let errorMessage = `Failed to ${action} bot`;
        
        try {
          // Try to get JSON error
          const errorData = await response.json();
          errorMessage = errorData.error || errorData.message || errorMessage;
        } catch {
          // If not JSON, try to get text error
          try {
            const errorText = await response.text();
            // Clean up HTML error messages
            if (errorText.includes('<html>')) {
              errorMessage = `Server error: Bot may not be running`;
            } else {
              errorMessage = errorText.length > 100 ? 
                `${errorText.substring(0, 100)}...` : 
                errorText;
            }
          } catch {
            // If all else fails, use default message
          }
        }
        
        throw new Error(errorMessage);
      }
      
      const data = await response.json();
      
      // Update status based on the action
      if (action === 'stop') {
        // Set status to stopped immediately based on API response
        setBotStatuses(prev => ({
          ...prev,
          [id]: { 
            ...prev[id], 
            status: 'stopped', 
            running: false, 
            manualStopped: true // Mark as manually stopped to prevent polling from changing it
          }
        }));
        
        toast.success(data.status === 'already stopped' ? 'Bot was already stopped' : 'Bot stopped successfully');
        
        // Remove from active WebSockets
        setActiveWebSockets(prev => {
          const newConnections = {...prev};
          delete newConnections[id];
          return newConnections;
        });
      } else {
        toast.success(`Bot ${action} request successful`);
      }
    } catch (error) {
      console.error(`Error ${action}ing bot:`, error);
      toast.error(`Failed to ${action} bot: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      if (action === 'stop') {
        setStopping(null);
      }
    }
  };

  const handleViewDetails = (id: string) => {
    // Get the strategy name from the configuration
    const config = configurations.find(c => c.id === id);
    if (!config || !config.config?.strategy) {
      toast.error('No strategy found for this bot');
      return;
    }
    
    // Navigate to the bot view page with the strategy name
    navigate(`/bots/view/${config.config.strategy}`);
  };

  const closeLogs = () => {
    setShowingLogs(null);
    setLogs([]);
  };

  // Handle WebSocket events for a specific bot
  const handleBotEvent = (botId: string, event: FreqtradeEvent) => {
    console.log(`[BotList] Received event for bot ${botId}:`, event);
    
    switch (event.type) {
      case 'status':
        // Update bot status based on WebSocket event
        setTraderStatuses(prev => ({
          ...prev,
          [botId]: {
            ...prev[botId] || {},
            status: event.data.status,
            state: event.data.state,
            version: event.data.version,
            lastUpdate: new Date()
          }
        }));
        
        // Also update the bot status if it's a running/stopped status
        if (event.data.status === 'running' || event.data.status === 'stopped') {
          setBotStatuses(prev => ({
            ...prev,
            [botId]: {
              ...prev[botId],
              status: event.data.status,
              running: event.data.status === 'running',
              manualStopped: event.data.status === 'stopped' ? true : prev[botId]?.manualStopped || false
            }
          }));
        }
        break;
        
      case 'entry':
      case 'entry_fill':
      case 'exit':
      case 'exit_fill':
        // Update open trades count
        const config = configurations.find(c => c.id === botId);
        if (config && config.config?.strategy) {
          // Refresh bot status to get updated trade count
          checkBotStatus(config.config.strategy, config.user_id)
            .then(status => {
              setBotStatuses(prev => ({
                ...prev,
                [botId]: {
                  ...prev[botId],
                  ...status
                }
              }));
            });
        }
        break;
        
      case 'warning':
        // Show warning as toast
        toast.warning(event.data.message || 'Bot warning');
        break;
        
      case 'strategy_msg':
        // Show strategy message as toast
        toast.info(event.data.msg || 'Strategy message');
        break;
    }
  };

  // Set up WebSocket connections for all bots
  useEffect(() => {
    if (configurations.length === 0) return;
    
    const setupWebSockets = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      // Create a new connections object
      const newConnections: Record<string, boolean> = {};
      
      for (const config of configurations) {
        if (config.config?.strategy) {
          // Mark this bot as having a WebSocket connection
          newConnections[config.id] = true;
          
          // We don't actually create the WebSocket here - that's handled by the useFreqtradeWS hook
          // This just tracks which bots should have connections
        }
      }
      
      setWsConnections(newConnections);
    };
    
    setupWebSockets();
  }, [configurations]);

  // Get current bots for pagination
  const indexOfLastBot = currentPage * botsPerPage;
  const indexOfFirstBot = indexOfLastBot - botsPerPage;
  const currentBots = configurations.slice(indexOfFirstBot, indexOfLastBot);
  const totalPages = Math.max(1, Math.ceil(configurations.length / botsPerPage));

  // Change page
  const paginate = (pageNumber: number) => setCurrentPage(pageNumber);

  // For each bot with an active WebSocket connection, use the hook
  Object.entries(activeWebSockets).forEach(([botId, strategyName]) => {
    useFreqtradeWS({
      strategyName,
      enabled: true,
      onEvent: (event) => handleBotEvent(botId, event),
      eventTypes: ['status', 'startup', 'entry', 'entry_fill', 'exit', 'exit_fill', 'warning', 'strategy_msg']
    });
  });

  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin w-8 h-8 border-4 border-accent-500 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (configurations.length === 0) {
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
      
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-bolt-elements-background-depth-3">
            <th className="px-3 py-2 text-left text-xs font-medium text-bolt-elements-textPrimary">#</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-bolt-elements-textPrimary">Name</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-bolt-elements-textPrimary">Exchange</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-bolt-elements-textPrimary">Strategy</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-bolt-elements-textPrimary">TSaaS - Status</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-bolt-elements-textPrimary">Trader Status</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-bolt-elements-textPrimary">Open Trades</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-bolt-elements-textPrimary">Logs</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-bolt-elements-textPrimary">Last Updated</th>
            <th className="px-3 py-2 text-right text-xs font-medium text-bolt-elements-textPrimary">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-bolt-elements-borderColor">
          {currentBots.map((config, index) => (
            <tr 
              key={config.id} 
              className={classNames(
                "hover:bg-bolt-elements-background-depth-3 transition-colors",
                config.is_active ? "bg-bolt-elements-background-depth-3/30" : ""
              )}
            >
              <td className="px-3 py-2 text-xs text-bolt-elements-textPrimary">
                {indexOfFirstBot + index + 1}
              </td>
              <td className="px-3 py-2 text-xs text-bolt-elements-textPrimary">
                <div className="flex items-center">
                  {config.is_active && (
                    <span className="w-2 h-2 bg-green-500 rounded-full mr-2" title="Active configuration"></span>
                  )}
                  {config.name}
                </div>
              </td>
              <td className="px-3 py-2 text-xs text-bolt-elements-textSecondary">
                {config.config?.exchange?.name || 'Not set'}
              </td>
              <td className="px-3 py-2 text-xs text-bolt-elements-textSecondary">
                <div className="max-w-[150px] truncate" title={config.config?.strategy || 'Not set'}>
                  {config.config?.strategy || 'Not set'}
                </div>
              </td>
              <td className="px-3 py-2 text-xs">
                <span className={classNames(
                  "inline-flex items-center px-2 py-1 rounded-full text-xs font-medium",
                  botStatuses[config.id]?.ready
                    ? "bg-green-500/20 text-green-500" 
                    : botStatuses[config.id]?.phase === 'Running'
                      ? "bg-blue-500/20 text-blue-500"
                      : botStatuses[config.id]?.phase === 'Pending'
                        ? "bg-yellow-500/20 text-yellow-500"
                        : botStatuses[config.id]?.phase === 'Failed'
                          ? "bg-red-500/20 text-red-500"
                          : botStatuses[config.id]?.phase === 'NotFound'
                            ? "bg-gray-500/20 text-gray-500"
                            : config.is_active 
                              ? "bg-yellow-500/20 text-yellow-500"
                              : "bg-gray-500/20 text-gray-500"
                )}>
                  {botStatuses[config.id]?.ready 
                    ? 'Running' 
                    : botStatuses[config.id]?.phase === 'Running'
                      ? 'Deploying'
                      : botStatuses[config.id]?.phase === 'Pending'
                        ? 'Pending'
                        : botStatuses[config.id]?.phase === 'Failed'
                          ? 'Failed'
                          : botStatuses[config.id]?.phase === 'NotFound'
                            ? 'Not Deployed'
                            : config.is_active 
                              ? 'Ready' 
                              : 'Inactive'}
                </span>
              </td>
              <td className="px-3 py-2 text-xs">
                <span className={classNames(
                  "inline-flex items-center px-2 py-1 rounded-full text-xs font-medium",
                  traderStatuses[config.id]?.status === 'running'
                    ? "bg-green-500/20 text-green-500" 
                    : traderStatuses[config.id]?.status === 'stopped'
                      ? "bg-gray-500/20 text-gray-500"
                      : traderStatuses[config.id]?.status === 'error'
                        ? "bg-red-500/20 text-red-500"
                        : "bg-gray-500/20 text-gray-500"
                )}>
                  {traderStatuses[config.id]?.status === 'running'
                    ? 'Running' 
                    : traderStatuses[config.id]?.status === 'stopped'
                      ? 'Stopped'
                      : traderStatuses[config.id]?.status === 'error'
                        ? 'Error'
                        : 'Unknown'}
                </span>
              </td>
              <td className="px-3 py-2 text-xs text-bolt-elements-textPrimary">
                {botStatuses[config.id]?.openTradesCount != null ? (
                  <span
                    onClick={() => handleViewDetails(config.id)}
                    className={classNames(
                      "inline-flex items-center px-2 py-1 rounded-full text-xs font-medium cursor-pointer",
                      botStatuses[config.id]!.openTradesCount > 0
                        ? "bg-blue-500/20 text-blue-500"
                        : "bg-gray-500/20 text-gray-500"
                    )}
                  >
                    {botStatuses[config.id]!.openTradesCount}
                  </span>
                ) : (
                  <span className="text-bolt-elements-textTertiary">-</span>
                )}
              </td>
              <td className="px-3 py-2 text-xs">
                {config.config?.strategy && (
                  <button
                    onClick={() => fetchBotLogs(config.config.strategy)}
                    className={classNames(
                      "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                      "bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary",
                      "hover:bg-bolt-elements-background-depth-4 hover:text-accent-500"
                    )}
                    title={botStatuses[config.id]?.reason || "View logs"}
                  >
                    <div className="i-ph:terminal text-sm relative">
                      <span className="absolute bottom-0 left-1/2 -translate-x-1/2 h-[2px] w-[5px] bg-current animate-[blink_1s_infinite]"></span>
                    </div>
                    <span>Logs</span>
                  </button>
                )}
              </td>
              <td className="px-3 py-2 text-xs text-bolt-elements-textSecondary">
                {new Date(config.updated_at).toLocaleString()}
              </td>
              <td className="px-3 py-2 text-xs text-right">
                <div className="flex items-center justify-end space-x-1">
                  {/* View Details Button */}
                  <button
                    onClick={() => handleViewDetails(config.id)}
                    className="p-1.5 text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-4 rounded-md transition-colors"
                    title="View details"
                  >
                    <div className="i-ph:eye text-lg" />
                  </button>
                
                  {/* Edit Button */}
                  <button
                    onClick={() => handleEdit(config.id)}
                    className="p-1.5 text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-4 rounded-md transition-colors"
                    title="Edit configuration"
                  >
                    <div className="i-ph:pencil-simple text-lg" />
                  </button>
                  
                  {/* Start Button - Show for all deployed bots */}
                  {botStatuses[config.id]?.ready && (
                    <button
                      onClick={() => handleStartBot(config.id)}
                      disabled={starting === config.id}
                      className={classNames(
                        "p-1.5 text-bolt-elements-textSecondary hover:text-green-500 hover:bg-bolt-elements-background-depth-4 rounded-md transition-colors",
                        starting === config.id && "opacity-50 cursor-not-allowed"
                      )}
                      title="Start bot"
                    >
                      <div className={classNames(
                        "text-lg",
                        starting === config.id ? "i-svg-spinners:90-ring-with-bg" : "i-ph:play-circle"
                      )} />
                    </button>
                  )}
                  
                  {/* Stop Button - Only show for running bots */}
                  {botStatuses[config.id]?.running && (
                    <button
                      onClick={() => handleBotAction(config.id, 'stop')}
                      disabled={stopping === config.id}
                      className={classNames(
                        "p-1.5 text-bolt-elements-textSecondary hover:text-red-500 hover:bg-bolt-elements-background-depth-4 rounded-md transition-colors",
                        stopping === config.id && "opacity-50 cursor-not-allowed"
                      )}
                      title="Stop bot"
                    >
                      <div className={classNames(
                        "text-lg",
                        stopping === config.id ? "i-svg-spinners:90-ring-with-bg" : "i-ph:stop-circle"
                      )} />
                    </button>
                  )}
                  
                  {/* Deploy Button */}
                  <BotDeployButton
                    botId={config.id}
                    botConfig={config.config}
                    iconOnly
                    disabled={botStatuses[config.id]?.running || !config.config?.strategy}
                  />
                  
                  {/* Delete Button */}
                  <button
                    onClick={() => handleDelete(config.id)}
                    disabled={deleting === config.id}
                    className={classNames(
                      "p-1.5 text-bolt-elements-textSecondary hover:text-red-500 hover:bg-bolt-elements-background-depth-4 rounded-md transition-colors",
                      deleting === config.id && "opacity-50 cursor-not-allowed"
                    )}
                    title="Delete configuration"
                  >
                    <div className={classNames(
                      "text-lg",
                      deleting === config.id ? "i-svg-spinners:90-ring-with-bg" : "i-ph:trash"
                    )} />
                  </button>
                </div>
              </td>
            </tr>
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
            
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(number => (
              <button
                key={number}
                onClick={() => paginate(number)}
                className={classNames(
                  "w-8 h-8 flex items-center justify-center rounded-md text-sm",
                  currentPage === number
                    ? "bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent"
                    : "text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3 hover:text-bolt-elements-textPrimary"
                )}
              >
                {number}
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