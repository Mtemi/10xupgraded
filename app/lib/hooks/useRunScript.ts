import { useState, useCallback } from 'react';
import { supabase } from '~/lib/superbase/client';
import { toast } from 'react-toastify';

export function useRunScript() {
  const [isInitializing, setIsInitializing] = useState(false);

  const runScript = useCallback(async (
    scriptContent: string, 
    fileName: string, 
    apiKey?: string, 
    apiSecret?: string
  ) => {
    try {
      setIsInitializing(true);
      
      // Get authenticated user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      
      if (!user?.email) {
        toast.error('Please sign in to run scripts');
        return false;
      }
      
      // Get session for authentication
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      
      if (!session) {
        toast.error('Session expired. Please sign in again');
        return false;
      }
      
      // First, check if user has an active bot configuration
      const { data: botConfig, error: botConfigError } = await supabase
        .from('bot_configurations')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single();
        
      if (botConfigError && botConfigError.code !== 'PGRST116') {
        // PGRST116 is "no rows returned" which is expected if no active config
        throw botConfigError;
      }
      
      // If user has an active bot configuration, deploy it first
      if (botConfig) {
        toast.info('Initializing trading environment...');
        
        // Make request to initialize the Freqtrade instance
        const freqtradeResponse = await fetch(`/user/${user.email}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({
            ...botConfig.config,
            exchange: {
              ...botConfig.config.exchange,
              key: apiKey || botConfig.config.exchange.key,
              secret: apiSecret || botConfig.config.exchange.secret
            }
          })
        });
        
        if (!freqtradeResponse.ok) {
          const error = await freqtradeResponse.json();
          throw new Error(error.error || 'Failed to initialize trading environment');
        }
        
        toast.success('Trading environment initialized');
      }
      
      // Now run the script
      toast.info('Running script...');
      
      const response = await fetch('/apa/run-notebook', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          username: user.email,
          notebook_name: fileName,
          user_id: user.id,
          content: scriptContent
        })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to run script');
      }
      
      toast.success('Script execution started');
      return true;
    } catch (error) {
      console.error('Error running script:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to run script');
      return false;
    } finally {
      setIsInitializing(false);
    }
  }, []);

  return { runScript, isInitializing };
}