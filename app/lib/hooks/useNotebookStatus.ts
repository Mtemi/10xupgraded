import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '~/lib/superbase/client';

export interface NotebookStatus {
  status: 'running' | 'failed' | 'stopped' | 'completed' | 'initializing' | 'stopping';
  error?: string;
  error_history?: Array<{
    timestamp: string;
    message: string;
  }>;
}

export function useNotebookStatus(selectedFile: string | undefined) {
  const [status, setStatus] = useState<string>('stopped');
  const [error, setError] = useState<string | undefined>();
  const [logs, setLogs] = useState<string[]>([]);
  const lastCheckedTimestampRef = useRef<string | null>(null);
  const statusSubscriptionRef = useRef<any>(null);

  const fetchLatestStatus = useCallback(async () => {
    if (!selectedFile) return;

    const fileName = selectedFile.split('/').pop();
    if (!fileName) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.log('[useNotebookStatus] No authenticated user');
        return;
      }

      const { data, error } = await supabase
        .from('notebook_statuses')
        .select('*')
        .eq('user_id', user.id)
        .eq('notebook_name', fileName)
        .maybeSingle();

      if (error) {
        console.error('[useNotebookStatus] Error fetching status:', error);
        return;
      }

      if (data) {
        // console.log('[useNotebookStatus] Received status update:', {
        //   status: data.status,
        //   hasErrorHistory: !!data.error_history?.length
        // });

        setStatus(data.status);
        setError(data.error_message);

        if (data.error_history && Array.isArray(data.error_history)) {
          const newLogs = data.error_history
            .filter(entry => {
              return !lastCheckedTimestampRef.current || 
                     entry.timestamp > lastCheckedTimestampRef.current;
            })
            .map(entry => entry.message);

          if (newLogs.length > 0) {
            // console.log('[useNotebookStatus] Processing new logs:', newLogs.length);
            setLogs(prevLogs => [...prevLogs, ...newLogs]);
            
            // Update last checked timestamp to latest entry
            const latestEntry = data.error_history[data.error_history.length - 1];
            if (latestEntry) {
              lastCheckedTimestampRef.current = latestEntry.timestamp;
            }
          }
        }
      }
    } catch (error) {
      console.error('[useNotebookStatus] Error in fetchLatestStatus:', error);
    }
  }, [selectedFile]);

  useEffect(() => {
    if (!selectedFile) return;

    const fileName = selectedFile.split('/').pop();
    if (!fileName) return;

    console.log('[useNotebookStatus] Setting up for file:', fileName);

    // Clear previous state when file changes
    setStatus('stopped');
    setError(undefined);
    setLogs([]);
    lastCheckedTimestampRef.current = null;

    // Initial fetch
    fetchLatestStatus();

    // Set up polling with reduced frequency
    const interval = setInterval(fetchLatestStatus, 3000);

    // Clean up previous subscription if exists
    if (statusSubscriptionRef.current) {
      statusSubscriptionRef.current.unsubscribe();
    }

    // Subscribe to realtime changes
    const subscription = supabase
      .channel('notebook_status_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notebook_statuses',
          filter: `notebook_name=eq.${fileName}`
        },
        (payload) => {
          // console.log('[useNotebookStatus] Received realtime update:', payload);
          fetchLatestStatus();
        }
      )
      .subscribe();

    statusSubscriptionRef.current = subscription;

    return () => {
      clearInterval(interval);
      if (statusSubscriptionRef.current) {
        statusSubscriptionRef.current.unsubscribe();
      }
    };
  }, [selectedFile, fetchLatestStatus]);

  return {
    status,
    error,
    logs
  };
}