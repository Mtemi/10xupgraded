import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { supabase } from '~/lib/superbase/client';
import { classNames } from '~/utils/classNames';
import { BotDeploymentStatus } from './BotDeploymentStatus';

interface BotDeployButtonProps {
  botId: string;
  botConfig: any;
  className?: string;
  buttonText?: string;
  iconOnly?: boolean;
  disabled?: boolean;
}

export function BotDeployButton({ 
  botId, 
  botConfig, 
  className = '', 
  buttonText = 'Deploy',
  iconOnly = false,
  disabled = false
}: BotDeployButtonProps) {
  const [isDeploying, setIsDeploying] = useState(false);
  const [strategyName, setStrategyName] = useState<string | null>(null);
  const [showDeploymentStatus, setShowDeploymentStatus] = useState(false);

  // Fetch the strategy name when component mounts
  useEffect(() => {
    const fetchStrategyName = async () => {
      try {
        // console.log('[BotDeployButton] Fetching strategy name for bot:', botId);
        // console.log('[BotDeployButton] Bot config:', botConfig);
        
        // First try to get from the config directly
        if (botConfig && botConfig.strategy) {
          // console.log('[BotDeployButton] Found strategy in config:', botConfig.strategy);
          setStrategyName(botConfig.strategy);
          return;
        }
        
        // If not in config, try to get from the database
        // console.log('[BotDeployButton] Strategy not in config, fetching from database');
        const { data, error } = await supabase
          .rpc('get_bot_strategy', { p_bot_id: botId });
          
        if (error) {
          // console.error('[BotDeployButton] Error fetching strategy:', error);
          throw error;
        }
        
        if (data) {
          // console.log('[BotDeployButton] Retrieved strategy from database:', data);
          setStrategyName(data);
        } else {
          console.log('[BotDeployButton] No strategy found for bot');
        }
      } catch (error) {
        console.error('Error fetching strategy name:', error);
      }
    };
    
    fetchStrategyName();
  }, [botId, botConfig]);

  const handleDeploy = async () => {
    try {
      setIsDeploying(true);
      // console.log('[BotDeployButton] Starting deployment');
      
      // Get user and session
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Please sign in to deploy bot');
        return;
      }
      
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Session expired. Please sign in again');
        return;
      }
      
      // Ensure we have a strategy name
      const deployStrategyName = strategyName || botConfig.strategy;
      if (!deployStrategyName) {
        toast.error('No strategy selected for this bot');
        return;
      }
      
      // console.log('[BotDeployButton] Deploying with strategy:', deployStrategyName);
      toast.info('Initializing bot deployment...');
      
      // Make request to the Flask API with strategy name in the URL
      // Format: /apa/user/{email}/{strategy_name}?bot_id={botId}
      const apiUrl = `/apa/user/${user.email}/${deployStrategyName}?bot_id=${botId}`;
      // console.log('[BotDeployButton] API URL:', apiUrl);
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify(botConfig)
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to deploy bot');
      }
      
      const result = await response.json();
      // console.log('[BotDeployButton] Deployment initiated:', result);
      toast.success('Bot deployment initiated');
      
      // Show deployment status component
      setShowDeploymentStatus(true);
    } catch (error) {
      console.error('[BotDeployButton] Error deploying bot:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to deploy bot');
      setIsDeploying(false);
    }
  };

  const handleDeploymentComplete = () => {
    setIsDeploying(false);
    setShowDeploymentStatus(false);
    toast.success('Bot deployment completed successfully');
  };

  if (showDeploymentStatus) {
    return (
      <BotDeploymentStatus 
        botId={botId} 
        strategyName={strategyName || ''} 
        onDeploymentComplete={handleDeploymentComplete}
      />
    );
  }

  return (
    <button
      onClick={handleDeploy}
      disabled={isDeploying || !strategyName || disabled}
      className={classNames(
        "transition-colors",
        iconOnly 
          ? "p-1.5 text-bolt-elements-textSecondary hover:text-accent-500 hover:bg-bolt-elements-background-depth-4 rounded-md"
          : "px-4 py-2 bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text rounded-md hover:bg-bolt-elements-button-primary-backgroundHover",
        (isDeploying || !strategyName || disabled) && "opacity-50 cursor-not-allowed",
        className
      )}
      title={strategyName ? `Deploy bot with ${strategyName} strategy` : "No strategy selected"}
    >
      {isDeploying ? (
        <>
          <div className={classNames(
            "i-svg-spinners:90-ring-with-bg",
            iconOnly ? "text-lg" : "inline-block mr-2"
          )} />
          {!iconOnly && "Deploying..."}
        </>
      ) : (
        <>
          <div className={classNames(
            "i-ph:rocket-launch",
            iconOnly ? "text-lg" : "inline-block mr-2"
          )} />
          {!iconOnly && buttonText}
        </>
      )}
    </button>
  );
}