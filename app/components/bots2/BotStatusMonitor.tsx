import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { supabase } from '~/lib/superbase/client';
import { classNames } from '~/utils/classNames';

interface BotStatusMonitorProps {
  botName: string;
  userId?: string;
  onStatusChange?: (status: { ready: boolean; phase: string }) => void;
}

export function BotStatusMonitor({ 
  botName, 
  userId,
  onStatusChange
}: BotStatusMonitorProps) {
  const [status, setStatus] = useState<{ ready: boolean; phase: string; reason?: string }>({ 
    ready: false, 
    phase: 'Unknown' 
  });
  const [logs, setLogs] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showLogs, setShowLogs] = useState(false);
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!botName) return;

    const fetchStatus = async () => {
      try {
        setIsLoading(true);
        
        // Get current user if userId not provided
        let currentUserId = userId;
        if (!currentUserId) {
          const { data: { user }, error: userError } = await supabase.auth.getUser();
          if (userError) throw userError;
          if (!user) throw new Error('User not authenticated');
          currentUserId = user.id;
        }

        // Fetch pod status
        const response = await fetch(`/apa/podstatus?botName=${botName}&userId=${currentUserId}`);
        
        if (!response.ok) {
          const errorData = await response.json();
          console.error('Error fetching pod status:', errorData);
          throw new Error(errorData.error || 'Failed to fetch status');
        }
        
        const statusData = await response.json();
        setStatus(statusData);
        
        // Notify parent component of status change if callback provided
        if (onStatusChange) {
          onStatusChange(statusData);
        }
        
        // If not ready, fetch logs
        if (!statusData.ready) {
          fetchLogs(currentUserId);
        }
      } catch (error) {
        console.error('Error checking bot status:', error);
        setStatus({ ready: false, phase: 'Error', reason: error instanceof Error ? error.message : 'Unknown error' });
      } finally {
        setIsLoading(false);
      }
    };

    const fetchLogs = async (currentUserId: string) => {
      try {
        const response = await fetch(`/apa/podlogs?botName=${botName}&userId=${currentUserId}&lines=50`);
        
        if (!response.ok) {
          console.error('Error fetching logs');
          return;
        }
        
        const logText = await response.text();
        if (logText) {
          setLogs(logText.split('\n').filter(line => line.trim()));
        }
      } catch (error) {
        console.error('Error fetching logs:', error);
      }
    };

    // Initial fetch
    fetchStatus();
    
    // Set up polling interval
    const interval = setInterval(fetchStatus, 5000);
    setPollingInterval(interval);
    
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [botName, userId, onStatusChange]);

  const getStatusDisplay = () => {
    if (isLoading) {
      return (
        <div className="flex items-center gap-2 text-bolt-elements-textSecondary">
          <div className="i-svg-spinners:90-ring-with-bg animate-spin text-lg" />
          <span>Checking status...</span>
        </div>
      );
    }

    switch (status.phase) {
      case 'Running':
        return (
          <div className="flex items-center gap-2 text-green-500">
            <div className="i-ph:check-circle-fill text-lg" />
            <span>{status.ready ? 'Bot running' : 'Bot starting up'}</span>
          </div>
        );
      case 'Pending':
        return (
          <div className="flex items-center gap-2 text-blue-500">
            <div className="i-svg-spinners:90-ring-with-bg animate-spin text-lg" />
            <span>Bot is initializing</span>
          </div>
        );
      case 'Failed':
        return (
          <div className="flex items-center gap-2 text-red-500">
            <div className="i-ph:x-circle-fill text-lg" />
            <span>Deployment failed{status.reason ? `: ${status.reason}` : ''}</span>
          </div>
        );
      case 'NotFound':
        return (
          <div className="flex items-center gap-2 text-bolt-elements-textSecondary">
            <div className="i-ph:info-circle text-lg" />
            <span>Bot not deployed</span>
          </div>
        );
      default:
        return (
          <div className="flex items-center gap-2 text-bolt-elements-textSecondary">
            <div className="i-ph:question-circle text-lg" />
            <span>Status: {status.phase}</span>
          </div>
        );
    }
  };

  return (
    <div className="bg-bolt-elements-background-depth-2 rounded-lg p-4 border border-bolt-elements-borderColor">
      <div className="flex justify-between items-center mb-4">
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
      
      <div className="mb-4">
        {getStatusDisplay()}
      </div>
      
      {showLogs && logs.length > 0 && (
        <div className="mt-4">
          <div className="bg-bolt-elements-background-depth-3 rounded p-3 max-h-[300px] overflow-auto font-mono text-xs text-bolt-elements-textSecondary">
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