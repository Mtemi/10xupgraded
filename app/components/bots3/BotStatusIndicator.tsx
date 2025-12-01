import { useState, useEffect } from 'react';
import { classNames } from '~/utils/classNames';
import { supabase } from '~/lib/superbase/client';

interface BotStatusIndicatorProps {
  botId: string;
  strategyName?: string;
  initialStatus?: 'running' | 'stopped' | 'error' | 'unknown' | 'deploying' | 'failed';
  className?: string;
}

export function BotStatusIndicator({ 
  botId, 
  strategyName,
  initialStatus = 'pending..',
  className = ''
}: BotStatusIndicatorProps) {
  const [status, setStatus] = useState(initialStatus);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [isPolling, setIsPolling] = useState(false);

  console.log('[BotStatusIndicator] Initialized with:', { 
    botId, 
    strategyName, 
    initialStatus 
  });

  useEffect(() => {
    let mounted = true;
    let statusInterval: NodeJS.Timeout;

    const checkStatus = async () => {
      try {
        if (!mounted) return;
        
        console.log('[BotStatusIndicator] Checking status for:', { 
          botId, 
          strategyName 
        });
        
        // If we have a strategy name, check the pod status
        if (strategyName) {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) {
            console.log('[BotStatusIndicator] No authenticated user found');
            return;
          }

          console.log(`[BotStatusIndicator] Fetching status from /apa/podstatus?botName=${strategyName}&userId=${user.id}`);
          const response = await fetch(`/apa/podstatus?botName=${strategyName}&userId=${user.id}`);
          
          if (!response.ok) {
            console.error('[BotStatusIndicator] Error fetching pod status:', response.status, response.statusText);
            setStatus('error');
            return;
          }
          
          const statusData = await response.json();
          // console.log('[BotStatusIndicator] Received status data:', statusData);
          
          if (statusData.ready) {
            console.log('[BotStatusIndicator] Setting status to running');
            setStatus('running');
          } else if (statusData.phase === 'Failed') {
            console.log('[BotStatusIndicator] Setting status to failed');
            setStatus('failed');
          } else if (statusData.phase === 'NotFound') {
            console.log('[BotStatusIndicator] Setting status to stopped');
            setStatus('stopped');
          } else {
            console.log(`[BotStatusIndicator] Setting status to deploying (phase: ${statusData.phase})`);
            setStatus('deploying');
          }
        } else {
          console.log('[BotStatusIndicator] No strategyName provided, skipping status check');
        }
        
        setLastUpdated(new Date());
        setIsPolling(true);
      } catch (error) {
        console.error('[BotStatusIndicator] Error checking bot status:', error);
        setStatus('error');
      }
    };

    // Initial check
    console.log('[BotStatusIndicator] Running initial status check');
    checkStatus();

    // Set up polling if we have a strategy name
    if (strategyName) {
      console.log('[BotStatusIndicator] Setting up polling interval');
      statusInterval = setInterval(checkStatus, 10000); // Check every 10 seconds
    }

    return () => {
      console.log('[BotStatusIndicator] Cleaning up');
      mounted = false;
      if (statusInterval) clearInterval(statusInterval);
    };
  }, [botId, strategyName]);

  useEffect(() => {
    console.log('[BotStatusIndicator] Status changed to:', status);
  }, [status]);

  const getStatusColor = () => {
    switch (status) {
      case 'running':
        return 'bg-green-500';
      case 'stopped':
        return 'bg-gray-500';
      case 'error':
      case 'failed':
        return 'bg-red-500';
      case 'deploying':
        return 'bg-blue-500';
      default:
        return 'bg-yellow-500';
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'running':
        return 'Running';
      case 'stopped':
        return 'Stopped';
      case 'error':
        return 'Error';
      case 'failed':
        return 'Failed';
      case 'deploying':
        return 'Deploying';
      default:
        return 'Unknown';
    }
  };

  return (
    <div className={classNames("flex items-center", className)}>
      <div className={classNames(
        "w-2 h-2 rounded-full mr-2", 
        getStatusColor(),
        { "animate-pulse": status === 'deploying' }
      )}></div>
      <span className="text-xs text-bolt-elements-textSecondary">
        {getStatusText()}
      </span>
      {isPolling && (
        <span className="text-xs text-bolt-elements-textTertiary ml-2" title={lastUpdated.toLocaleString()}>
          {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      )}
    </div>
  );
}