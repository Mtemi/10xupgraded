import { useState, useEffect } from 'react';
import { supabase } from '~/lib/superbase/client';

interface BotStatusDebuggerProps {
  strategyName: string;
}

export function BotStatusDebugger({ strategyName }: BotStatusDebuggerProps) {
  const [statusData, setStatusData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!strategyName) return;

    const fetchStatus = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setError('No authenticated user found');
          return;
        }

        console.log(`[BotStatusDebugger] Fetching status for ${strategyName}`);
        const response = await fetch(`/apa/podstatus?botName=${strategyName}&userId=${user.id}`);
        
        if (!response.ok) {
          const errorText = await response.text();
          setError(`API Error: ${response.status} ${response.statusText} - ${errorText}`);
          return;
        }
        
        const data = await response.json();
        console.log('[BotStatusDebugger] Received data:', data);
        setStatusData(data);
      } catch (error) {
        console.error('[BotStatusDebugger] Error:', error);
        setError(error instanceof Error ? error.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    
    return () => clearInterval(interval);
  }, [strategyName]);

  if (loading) {
    return <div>Loading status data...</div>;
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  return (
    <div className="p-4 bg-bolt-elements-background-depth-3 rounded-lg mb-4">
      <h3 className="text-lg font-medium mb-2">Bot Status Debug Info</h3>
      <pre className="text-xs overflow-auto max-h-[200px] p-2 bg-bolt-elements-background-depth-4 rounded">
        {JSON.stringify(statusData, null, 2)}
      </pre>
    </div>
  );
}