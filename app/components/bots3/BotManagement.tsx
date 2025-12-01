import { useState } from 'react';
import { BotList } from './BotList';
import { BotConfigForm } from './BotConfigForm';
import { classNames } from '~/utils/classNames';
import { useNavigate } from '@remix-run/react';
import { supabase } from '~/lib/superbase/client';
import { toast } from 'react-toastify';
import { useSubscriptionFeatures } from '~/lib/hooks/useSubscriptionFeatures';

type View = 'list' | 'new';

export function BotManagement() {
  const [view, setView] = useState<View>('list');
  const navigate = useNavigate();
  const { maxPaperBots, maxLiveBots, planName } = useSubscriptionFeatures();
  
  const handleAddBot = async () => {
    try {
      // Get authenticated user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        toast.error('Please sign in to create bots');
        return;
      }
      
      // Count existing bots
      const { data: existingBots, error: countError } = await supabase
        .from('bot_configurations')
        .select('id, config')
        .eq('user_id', user.id);
      
      if (countError) {
        console.error('Error counting existing bots:', countError);
        toast.error('Failed to verify bot limits');
        return;
      }
      
      // Count paper and live bots
      const paperBotCount = existingBots?.filter(bot => bot.config?.dry_run === true).length || 0;
      const liveBotCount = existingBots?.filter(bot => bot.config?.dry_run === false).length || 0;
      const totalBotCount = paperBotCount + liveBotCount;
      
      // Check against plan limits
      if (planName === 'Free' && paperBotCount >= 2) {
        toast.error('Your Free plan allows only 1 paper bot. Please upgrade to create more bots.');
        return;
      }
      
      if (planName === 'Pro' && totalBotCount >= 5) {
        toast.error('Your Pro plan allows a maximum of 5 bots (paper and live combined). Please upgrade to create more bots.');
        return;
      }
      
      if (planName === 'Elite' && totalBotCount >= 15) {
        toast.error('Your Elite plan allows a maximum of 15 bots (paper and live combined).');
        return;
      }
      
      // If within limits, proceed to the new bot form
      setView('new');
      
    } catch (error) {
      console.error('Error checking bot limits:', error);
      toast.error('Failed to verify bot limits');
    }
  };
  
  return (
    <div className="bg-bolt-elements-background-depth-2 rounded-lg shadow-md overflow-hidden">
      <div className="flex justify-between items-center p-4 border-b border-bolt-elements-borderColor">
        <div className="flex">
          <button
            onClick={() => setView('list')}
            className={classNames(
              "px-6 py-2 text-sm font-medium transition-colors rounded-md",
              view === 'list'
                ? "bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary"
                : "text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3"
            )}
          >
            <div className="flex items-center gap-2">
              <div className="i-ph:list-bullets" />
              View Bots
            </div>
          </button>
          <button
            onClick={handleAddBot}
            className={classNames(
              "px-6 py-2 text-sm font-medium transition-colors rounded-md ml-2",
              view === 'new'
                ? "bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary"
                : "text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3"
            )}
          >
            <div className="flex items-center gap-2">
              <div className="i-ph:plus-circle" />
              Add Bot
            </div>
          </button>
        </div>
        
        <button
          onClick={() => navigate('/')}
          className="p-2 rounded-full text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3"
          title="Close"
        >
          <div className="i-ph:x-circle text-xl" />
        </button>
      </div>
      
      <div className="p-4">
        {view === 'list' ? (
          <BotList />
        ) : (
          <BotConfigForm 
            onSave={() => setView('list')}
            onCancel={() => setView('list')}
          />
        )}
      </div>
    </div>
  );
}
