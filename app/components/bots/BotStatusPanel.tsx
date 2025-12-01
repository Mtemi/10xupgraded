import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { supabase } from '~/lib/superbase/client';
import { classNames } from '~/utils/classNames';

interface BotStatusPanelProps {
  strategyName: string;
  userId?: string;
}

export function BotStatusPanel({ strategyName, userId }: BotStatusPanelProps) {
  const [status, setStatus] = useState<string>('stopped');
  const [error, setError] = useState<string | undefined>();
  const [logs, setLogs] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState(false);

  useEffect(() => {
    if (!strategyName) return;

    let mounted = true;
    let statusInterval: NodeJS.Timeout;

    const fetchStatus = async () => {
      if (!mounted) return;

      try {
        // Get current user if userId not provided
        let currentUserId = userId;
        if (!currentUserId) {
          const { data: { user }, error: userError } = await supabase.auth.getUser();
          if (userError) throw userError;
          if (!user) throw new Error('User not authenticated');
          currentUserId = user.id;
        }

        // Fetch pod status
        const response = await fetch(`/apa/podstatus?botName=${strategyName}&userId=${currentUserId}`);
        
        if (!response.ok) {
          const errorData = await response.json();
          console.error('Error fetching pod status:', errorData);
          setStatus('error');
          setError(errorData.error || 'Failed to fetch status');
          return;
        }
        
        const statusData = await response.json();
        
        if (statusData.ready) {
          setStatus('running');
        } else if (statusData.phase === 'Failed') {
          setStatus('failed');
          setError(statusData.reason || 'Deployment failed');
        } else if (statusData.phase === 'NotFound') {
          setStatus('not_deployed');
        } else {
          setStatus('deploying');
        }
        
        // If we're in a non-final state, also fetch logs
        if (statusData.phase !== 'NotFound' && !statusData.ready && statusData.phase !== 'Failed') {
          fetchLogs(currentUserId);
        }
      } catch (error) {
        console.error('Error checking bot status:', error);
        setStatus('error');
        setError(error instanceof Error ? error.message : 'Unknown error');
      }
    };

    const fetchLogs = async (currentUserId: string) => {
      try {
        const logsResponse = await fetch(`/apa/podlogs?botName=${strategyName}&userId=${currentUserId}&lines=20`);
        
        if (!logsResponse.ok) {
          console.error('Error fetching logs');
          return;
        }
        
        const logsText = await logsResponse.text();
        if (logsText) {
          setLogs(logsText.split('\n'));
        }
      } catch (error) {
        console.error('Error fetching logs:', error);
      }
    };

    // Initial fetch
    fetchStatus();
    
    // Set up polling interval
    statusInterval = setInterval(fetchStatus, 5000);
    
    return () => {
      mounted = false;
      clearInterval(statusInterval);
    };
  }, [strategyName, userId]);

  const getStatusDisplay = () => {
    switch (status) {
      case 'running':
        return (
          <div className="flex items-center gap-2 text-green-500">
            <div className="i-ph:check-circle-fill text-lg" />
            <span>Bot running</span>
          </div>
        );
      case 'deploying':
        return (
          <div className="flex items-center gap-2 text-blue-500">
            <div className="i-svg-spinners:90-ring-with-bg animate-spin text-lg" />
            <span>Deploying bot</span>
          </div>
        );
      case 'failed':
        return (
          <div className="flex items-center gap-2 text-red-500">
            <div className="i-ph:x-circle-fill text-lg" />
            <span>Deployment failed{error ? `: ${error}` : ''}</span>
          </div>
        );
      case 'not_deployed':
        return (
          <div className="flex items-center gap-2 text-bolt-elements-textSecondary">
            <div className="i-ph:info-circle text-lg" />
            <span>Bot not deployed</span>
          </div>
        );
      case 'error':
        return (
          <div className="flex items-center gap-2 text-red-500">
            <div className="i-ph:warning-circle-fill text-lg" />
            <span>Error checking status{error ? `: ${error}` : ''}</span>
          </div>
        );
      default:
        return (
          <div className="flex items-center gap-2 text-bolt-elements-textSecondary">
            <div className="i-ph:question-circle text-lg" />
            <span>Unknown status</span>
          </div>
        );
    }
  };

  if (status === 'running' || status === 'not_deployed') {
    return null; // Don't show the panel for running or not deployed bots
  }

  return (
    <div className="mb-4 bg-bolt-elements-background-depth-2 rounded-lg p-4 border border-bolt-elements-borderColor">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-lg font-medium text-bolt-elements-textPrimary">Bot Status</h3>
        {logs.length > 0 && (
          <button
            onClick={() => setShowLogs(!showLogs)}
            className="text-sm text-accent-500 hover:text-accent-600 flex items-center gap-1"
          >
            <div className={showLogs ? "i-ph:eye-slash" : "i-ph:eye"} />
            {showLogs ? "Hide Logs" : "View Logs"}
          </button>
        )}
      </div>
      
      <div className="mb-2">
        {getStatusDisplay()}
      </div>
      
      {showLogs && logs.length > 0 && (
        <div className="mt-4">
          <div className="bg-bolt-elements-background-depth-3 rounded p-3 max-h-[200px] overflow-auto font-mono text-xs text-bolt-elements-textSecondary">
            {logs.map((line, index) => (
              <div key={index} className="whitespace-pre-wrap">
                {line}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}