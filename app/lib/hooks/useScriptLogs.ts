import { useEffect, useState } from 'react';
import { socket, initializeSocket } from '~/lib/socket/client';
import { supabase } from '~/lib/superbase/client';

export function useScriptLogs(scriptName: string | undefined) {
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    if (!scriptName) return;

    const setupSocket = async () => {
      try {
        // Get authenticated user
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error) {
          console.error('[useScriptLogs] Failed to fetch user:', error);
          return;
        }

        if (!user) {
          console.warn('[useScriptLogs] No authenticated user found.');
          return;
        }

        console.log('[useScriptLogs] Setting up socket for script:', scriptName);
        
        // Initialize socket connection
        const socket = initializeSocket(user.email!);

        // Handle execution logs
        const handleExecutionLog = (data: { notebook_name: string; output: string }) => {
          console.log('[useScriptLogs] Received execution log:', {
            notebook: data.notebook_name,
            output: data.output?.substring(0, 100) + '...'
          });
          
          if (data.notebook_name === scriptName) {
            setLogs(prev => [...prev, data.output]);
          }
        };

        // Handle status updates
        const handleStatusUpdate = (data: { notebook_name: string; status: string; error?: string }) => {
          // console.log('[useScriptLogs] Received status update:', {
          //   notebook: data.notebook_name,
          //   status: data.status,
          //   error: data.error
          // });
          
          if (data.notebook_name === scriptName) {
            if (data.error) {
              setLogs(prev => [...prev, `Error: ${data.error}`]);
            }
            setLogs(prev => [...prev, `Status: ${data.status}`]);
          }
        };

        // Subscribe to events
        socket.on('execution_log', handleExecutionLog);
        socket.on('notebook_status', handleStatusUpdate);

        return () => {
          console.log('[useScriptLogs] Cleaning up socket listeners');
          socket.off('execution_log', handleExecutionLog);
          socket.off('notebook_status', handleStatusUpdate);
        };
      } catch (error) {
        console.error('[useScriptLogs] Error initializing socket:', error);
      }
    };

    setupSocket();
  }, [scriptName]);

  return logs;
}
