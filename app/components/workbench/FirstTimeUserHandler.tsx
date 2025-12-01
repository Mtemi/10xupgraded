import { useEffect, useState, useCallback } from 'react';
import { supabase } from '~/lib/superbase/client';
import { toast } from 'react-toastify';
import { createDefaultBotConfigForStrategy } from '~/lib/config/default-bot-config';

interface FirstTimeUserHandlerProps {
  strategyName: string | null;
  onDeploymentStart?: () => void;
  onDeploymentComplete?: (success: boolean, botId?: string) => void;
}

export function FirstTimeUserHandler({
  strategyName,
  onDeploymentStart,
  onDeploymentComplete
}: FirstTimeUserHandlerProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasProcessed, setHasProcessed] = useState(false);

  const autoDeployFirstStrategy = useCallback(async () => {
    if (!strategyName || isProcessing || hasProcessed) {
      return;
    }

    console.log('[FirstTimeUserHandler] Starting auto-deployment for:', strategyName);
    setIsProcessing(true);
    onDeploymentStart?.();

    try {
      // Get authenticated user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        console.log('[FirstTimeUserHandler] No authenticated user');
        return;
      }

      // Check if this is the user's first strategy
      const { data: existingConfigs, error: configCheckError } = await supabase
        .from('bot_configurations')
        .select('id')
        .eq('user_id', user.id);

      if (configCheckError) {
        console.error('[FirstTimeUserHandler] Error checking existing configs:', configCheckError);
        throw configCheckError;
      }

      // Only auto-deploy if this is the first bot configuration
      if (existingConfigs && existingConfigs.length > 0) {
        console.log('[FirstTimeUserHandler] User already has bot configurations, skipping auto-deploy');
        setHasProcessed(true);
        return;
      }

      console.log('[FirstTimeUserHandler] This is user\'s first strategy, proceeding with auto-deployment');

      // Create default bot configuration
      const defaultConfig = createDefaultBotConfigForStrategy(strategyName);

      // Save bot configuration to database
      const { data: botConfig, error: saveError } = await supabase
        .from('bot_configurations')
        .insert({
          user_id: user.id,
          name: defaultConfig.name,
          config: defaultConfig.config,
          is_active: true
        })
        .select()
        .single();

      if (saveError || !botConfig) {
        console.error('[FirstTimeUserHandler] Error saving bot configuration:', saveError);
        throw new Error('Failed to create bot configuration');
      }

      console.log('[FirstTimeUserHandler] Bot configuration created:', botConfig.id);

      // Get session for deployment API
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) {
        throw new Error('No valid session for deployment');
      }

      // Deploy the bot using the same endpoint as BotList
      const deploymentUrl = `/apa/user/${user.email}/${strategyName}?bot_id=${botConfig.id}`;
      console.log('[FirstTimeUserHandler] Deploying to:', deploymentUrl);

      const response = await fetch(deploymentUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify(botConfig.config)
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Deployment failed' }));
        throw new Error(error.error || 'Failed to deploy bot');
      }

      const result = await response.json();
      console.log('[FirstTimeUserHandler] Deployment successful:', result);

      toast.success('🎉 Your first bot has been auto-deployed! Check the logs below.');
      setHasProcessed(true);
      onDeploymentComplete?.(true, botConfig.id);

    } catch (error) {
      console.error('[FirstTimeUserHandler] Auto-deployment failed:', error);
      toast.error('Auto-deployment failed. Please configure your bot manually.');
      onDeploymentComplete?.(false);
    } finally {
      setIsProcessing(false);
    }
  }, [strategyName, isProcessing, hasProcessed, onDeploymentStart, onDeploymentComplete]);

  // Listen for database save completion event
  useEffect(() => {
    const handleDatabaseSaveComplete = (event: Event) => {
      const customEvent = event as CustomEvent<{ success: boolean; strategyName: string }>;
      if (customEvent.detail?.success && customEvent.detail?.strategyName) {
        console.log('[FirstTimeUserHandler] Database save complete, triggering auto-deployment');
        // Trigger auto-deployment after a small delay
        setTimeout(() => {
          autoDeployFirstStrategy();
        }, 1500);
      }
    };

    window.addEventListener('databaseSaveComplete', handleDatabaseSaveComplete);

    return () => {
      window.removeEventListener('databaseSaveComplete', handleDatabaseSaveComplete);
    };
  }, [autoDeployFirstStrategy]);

  // This component doesn't render anything
  return null;
}
