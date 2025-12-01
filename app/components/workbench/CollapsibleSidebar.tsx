import { useState } from 'react';
import { Link, useNavigate, useLocation } from '@remix-run/react';
import { classNames } from '~/utils/classNames';
import { useStore } from '@nanostores/react';
import { authStore } from '~/lib/stores/auth';

export function CollapsibleSidebar() {
  const [isExpanded, setIsExpanded] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated } = useStore(authStore);

  const menuItems = [
    { icon: 'i-ph:chat-circle-dots-duotone', label: 'AI Chatbot', path: '/' },
    { icon: 'i-ph:robot-duotone', label: 'Bots', path: '/bots' },
    { icon: 'i-ph:chart-line-duotone', label: 'Statistics', path: '/admin/statistics' },
    { icon: 'i-ph:credit-card-duotone', label: 'Subscription', path: '/subscription/plans' },
    { icon: 'i-ph:user-circle-duotone', label: 'Profile', path: '#' },
  ];

  return (
    <div
      className={classNames(
        'fixed left-0 top-[var(--header-height)] bottom-0 bg-bolt-elements-background-depth-1 border-r border-bolt-elements-borderColor transition-all duration-300 ease-in-out z-50',
        isExpanded ? 'w-56' : 'w-16'
      )}
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
    >
      <div className="flex flex-col h-full py-4">
        {menuItems.map((item, index) => {
          const isActive = location.pathname === item.path;

          return (
            <button
              key={index}
              onClick={() => item.path !== '#' && navigate(item.path)}
              className={classNames(
                'flex items-center gap-3 px-4 py-3 transition-colors duration-200 relative',
                isActive
                  ? 'text-bolt-elements-textPrimary bg-bolt-elements-background-depth-3'
                  : 'text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-2'
              )}
            >
              {isActive && (
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-accent-500" />
              )}

              <div className={classNames(item.icon, 'text-xl flex-shrink-0')} />

              <span
                className={classNames(
                  'text-sm font-medium whitespace-nowrap transition-opacity duration-300',
                  isExpanded ? 'opacity-100' : 'opacity-0 w-0'
                )}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
