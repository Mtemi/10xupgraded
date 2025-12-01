import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { supabase } from '~/lib/superbase/client';
import { classNames } from '~/utils/classNames';

interface BotDeploymentStatusProps {
  botId: string;
  strategyName: string;
  onDeploymentComplete?: () => void;
}

// Function to sanitize logs - replace 'freqtrade' with '10xtraders'
const sanitizeLogs = (logs: string[]): string[] => {
  return logs.map(log => log.replace(/freqtrade/gi, '10xtraders'));
};

export function BotDeploymentStatus({ 
  botId, 
  strategyName, 
  onDeploymentComplete 
}: BotDeploymentStatusProps) {
  const [status, setStatus] = useState<'pending' | 'deploying' | 'ready' | 'failed'>('pending');
  const [logs, setLogs] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Start polling for status when component mounts
    const interval = setInterval(checkDeploymentStatus, 3000);
    setPollingInterval(interval);
    
    // Initial status check
    checkDeploymentStatus();
    
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [botId, strategyName]);

  const checkDeploymentStatus = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Please sign in to check deployment status');
        return;
      }

      // Fetch pod status
      const response = await fetch(`/apa/podstatus?botName=${strategyName}&userId=${user.id}`);
      
      if (!response.ok) {
        console.error('[BotDeploymentStatus] Error fetching pod status:', response.status, response.statusText);
        return;
      }
      
      const statusData = await response.json();
      // console.log('[BotDeploymentStatus] Received status data:', statusData);
      
      // Update status based on response
      if (statusData.ready) {
        setStatus('ready');
        if (pollingInterval) {
          clearInterval(pollingInterval);
          setPollingInterval(null);
        }
        if (onDeploymentComplete) {
          onDeploymentComplete();
        }
      } else if (statusData.phase === 'Failed') {
        setStatus('failed');
        if (pollingInterval) {
          clearInterval(pollingInterval);
          setPollingInterval(null);
        }
      } else if (statusData.phase === 'NotFound') {
        setStatus('pending');
      } else {
        setStatus('deploying');
      }
      
      // Fetch logs if we're still deploying or failed
      if (status !== 'ready') {
        fetchDeploymentLogs();
      }
    } catch (error) {
      console.error('Error checking deployment status:', error);
    }
  };

  const fetchDeploymentLogs = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const response = await fetch(`/apa/podlogs?botName=${strategyName}&userId=${user.id}`);
      
      if (!response.ok) {
        console.error('Error fetching logs');
        return;
      }
      
      const logText = await response.text();
      if (logText) {
        // Apply sanitization to replace 'freqtrade' with '10xtraders'
        const sanitizedLogs = sanitizeLogs(logText.split('\n'));
        setLogs(sanitizedLogs);
      }
    } catch (error) {
      console.error('Error fetching deployment logs:', error);
    }
  };

  const getStatusDisplay = () => {
    switch (status) {
      case 'pending':
        return (
          <div className="flex items-center gap-2 text-bolt-elements-textSecondary">
            <div className="i-svg-spinners:90-ring-with-bg animate-spin text-lg" />
            <span>Initializing deployment...</span>
          </div>
        );
      case 'deploying':
        return (
          <div className="flex items-center gap-2 text-bolt-elements-textSecondary">
            <div className="i-svg-spinners:90-ring-with-bg animate-spin text-lg" />
            <span>Deploying bot...</span>
          </div>
        );
      case 'ready':
        return (
          <div className="flex items-center gap-2 text-green-500">
            <div className="i-ph:check-circle-fill text-lg" />
            <span>Bot deployed and running</span>
          </div>
        );
      case 'failed':
        return (
          <div className="flex items-center gap-2 text-red-500">
            <div className="i-ph:x-circle-fill text-lg" />
            <span>Deployment failed</span>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="bg-bolt-elements-background-depth-2 rounded-lg p-4 border border-bolt-elements-borderColor">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-medium text-bolt-elements-textPrimary">Deployment Status</h3>
        {(status === 'deploying' || status === 'failed') && (
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