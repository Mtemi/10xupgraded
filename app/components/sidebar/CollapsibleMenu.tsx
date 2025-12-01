import { useState } from 'react';
import { Link, useLocation } from '@remix-run/react';
import { classNames } from '~/utils/classNames';

interface MenuItem {
  icon: string;
  label: string;
  href: string;
  badge?: string;
}

const menuItems: MenuItem[] = [
  { icon: 'i-ph:chat-circle-text', label: 'AI Chatbot', href: '/', badge: 'New Bot #D3155' },
  { icon: 'i-ph:folder', label: 'Spaces', href: '/spaces' },
  { icon: 'i-ph:chats', label: 'Chat', href: '/chat' },
  { icon: 'i-ph:chart-line', label: 'Backtests', href: '/backtests' },
  { icon: 'i-ph:robot', label: 'Bots', href: '/bots' },
  { icon: 'i-ph:user', label: 'Profile', href: '/profile' },
];

export function CollapsibleMenu() {
  const [isExpanded, setIsExpanded] = useState(false);
  const location = useLocation();

  return (
    <div
      className={classNames(
        'fixed left-0 top-0 h-full bg-[#0a0a0a] border-r border-[#2a2e39] transition-all duration-300 z-50 flex flex-col',
        isExpanded ? 'w-64' : 'w-16'
      )}
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
    >
      {/* Logo/Brand */}
      <div className="h-16 flex items-center justify-center border-b border-[#2a2e39]">
        <div className={classNames('flex items-center gap-2', isExpanded ? 'px-4' : 'px-0')}>
          <div className="i-ph:lightning text-2xl text-blue-500" />
          {isExpanded && <span className="text-white font-semibold">TBB</span>}
        </div>
      </div>

      {/* Menu Items */}
      <nav className="flex-1 py-4">
        {menuItems.map((item) => {
          const isActive = location.pathname === item.href;

          return (
            <Link
              key={item.href}
              to={item.href}
              className={classNames(
                'flex items-center gap-3 px-4 py-3 mx-2 rounded-lg transition-colors',
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:bg-[#1a1a1a] hover:text-white'
              )}
            >
              <div className={classNames(item.icon, 'text-xl flex-shrink-0')} />
              {isExpanded && (
                <div className="flex items-center justify-between flex-1 overflow-hidden">
                  <span className="text-sm font-medium whitespace-nowrap">{item.label}</span>
                  {item.badge && (
                    <span className="text-xs px-2 py-0.5 bg-[#1e293b] rounded text-gray-400 ml-2">
                      {item.badge}
                    </span>
                  )}
                </div>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Bottom Section */}
      <div className="border-t border-[#2a2e39] p-4">
        <button
          className={classNames(
            'flex items-center gap-3 w-full px-4 py-3 rounded-lg transition-colors',
            'text-gray-400 hover:bg-[#1a1a1a] hover:text-white'
          )}
        >
          <div className="i-ph:gear text-xl flex-shrink-0" />
          {isExpanded && <span className="text-sm font-medium">Settings</span>}
        </button>

        <button
          className={classNames(
            'flex items-center gap-3 w-full px-4 py-3 rounded-lg transition-colors mt-2',
            'text-gray-400 hover:bg-[#1a1a1a] hover:text-white'
          )}
        >
          <div className="i-ph:sign-out text-xl flex-shrink-0" />
          {isExpanded && <span className="text-sm font-medium">Sign Out</span>}
        </button>
      </div>
    </div>
  );
}
