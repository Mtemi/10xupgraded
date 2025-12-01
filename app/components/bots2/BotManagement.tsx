import { useState } from 'react';
import { BotList } from './BotList';
import { BotConfigForm } from './BotConfigForm';
import { classNames } from '~/utils/classNames';
import { useNavigate } from '@remix-run/react';

type View = 'list' | 'new';

export function BotManagement() {
  const [view, setView] = useState<View>('list');
  const navigate = useNavigate();
  
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
            onClick={() => setView('new')}
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