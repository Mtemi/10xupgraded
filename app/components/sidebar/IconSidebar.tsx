import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from '@remix-run/react';
import { useStore } from '@nanostores/react';
import { authStore } from '~/lib/stores/auth';
import { classNames } from '~/utils/classNames';
import { supabase } from '~/lib/superbase/client';
import { toast } from 'react-toastify';

interface IconSidebarProps {
  onMenuOpen?: (isOpen: boolean) => void;
}

export function IconSidebar({ onMenuOpen }: IconSidebarProps) {
  const { isAuthenticated } = useStore(authStore);
  const [isExpanded, setIsExpanded] = useState(false);
  const [userData, setUserData] = useState<any>(null);
  const [subscription, setSubscription] = useState<any>(null);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const fetchUserData = async () => {
      if (!isAuthenticated) return;

      try {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error || !user) return;

        setUserData({
          ...user,
          user_metadata: {
            ...user.user_metadata,
            avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture || "/profile.png",
          }
        });

        // Fetch subscription data
        const { data: sub, error: subError } = await supabase
          .from('subscriptions')
          .select(`
            *,
            subscription_plans (
              id,
              name,
              price_monthly,
              tokens_included
            )
          `)
          .eq('user_id', user.id)
          .eq('status', 'active')
          .maybeSingle();

        if (!subError && sub) {
          setSubscription(sub);
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
      }
    };

    fetchUserData();
  }, [isAuthenticated]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const threshold = 60;
      const exitThreshold = 280;

      if (e.clientX <= threshold) {
        setIsExpanded(true);
        onMenuOpen?.(true);
      } else if (e.clientX > exitThreshold) {
        setIsExpanded(false);
        onMenuOpen?.(false);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [onMenuOpen]);

  const isAdmin = userData && (
    userData.app_metadata?.is_admin === true ||
    userData.email === '10xtraders.ai@gmail.com' ||
    userData.email === 'bmutua350@gmail.com'
  );

  const menuItems = [
    {
      icon: 'i-ph:chat-circle-text-fill',
      label: 'Chat',
      href: '/',
      show: true,
      gradient: 'from-blue-500 to-cyan-500'
    },
    {
      icon: 'i-ph:folder-fill',
      label: 'Spaces',
      href: '/spaces',
      show: isAuthenticated,
      gradient: 'from-cyan-500 to-blue-500'
    },
    {
      icon: 'i-ph:chart-line-fill',
      label: 'Backtests',
      href: '/backtests',
      show: isAuthenticated,
      gradient: 'from-green-500 to-emerald-500'
    },
    {
      icon: 'i-ph:robot-fill',
      label: 'Bots',
      href: '/bots',
      show: isAuthenticated,
      gradient: 'from-purple-500 to-pink-500'
    },
    {
      icon: 'i-ph:user-fill',
      label: 'Profile',
      href: '/profile',
      show: isAuthenticated,
      gradient: 'from-orange-500 to-red-500'
    },
    {
      icon: 'i-ph:chart-bar-fill',
      label: 'Statistics',
      href: '/admin/statistics',
      show: isAdmin,
      gradient: 'from-indigo-500 to-purple-500'
    },
  ];

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div
      className={classNames(
        'fixed left-0 top-0 h-full z-[9999] transition-all duration-300 ease-in-out',
        isExpanded ? 'w-64' : 'w-16'
      )}
      style={{
        background: 'linear-gradient(180deg, #0f1419 0%, #0a0e17 100%)',
        borderRight: '1px solid rgba(75, 85, 99, 0.3)'
      }}
    >
      {/* Logo/Brand Area */}
      <div className="h-16 flex items-center justify-center border-b border-gray-800/50">
        {isExpanded ? (
          <div className="flex items-center gap-2 px-4">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
              <span className="text-white font-bold text-sm">10x</span>
            </div>
            <span className="text-white font-semibold text-sm">Traders AI</span>
          </div>
        ) : (
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
            <span className="text-white font-bold">10x</span>
          </div>
        )}
      </div>

      {/* Menu Items */}
      <div className="flex-1 py-6 space-y-2 px-2">
        {menuItems.map((item, index) => {
          if (!item.show) return null;

          const isActive = location.pathname === item.href ||
            (item.href !== '/' && location.pathname.startsWith(item.href));

          return (
            <Link
              key={index}
              to={item.href}
              className={classNames(
                'flex items-center gap-3 rounded-lg transition-all duration-200 group relative overflow-hidden',
                isExpanded ? 'px-3 py-3' : 'px-3 py-3 justify-center',
                isActive
                  ? 'bg-white/10 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              )}
            >
              {/* Icon with gradient background */}
              <div className={classNames(
                'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all duration-200',
                isActive
                  ? `bg-gradient-to-br ${item.gradient}`
                  : 'bg-gray-800/50 group-hover:bg-gray-700/50'
              )}>
                <div className={classNames(item.icon, 'text-lg', isActive ? 'text-white' : 'text-gray-400 group-hover:text-white')} />
              </div>

              {/* Label */}
              {isExpanded && (
                <span className="text-sm font-medium whitespace-nowrap">
                  {item.label}
                </span>
              )}

              {/* Tooltip for collapsed state */}
              {!isExpanded && (
                <div className="absolute left-full ml-2 px-3 py-2 bg-gray-900 text-white text-sm rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200 whitespace-nowrap z-50 border border-gray-700">
                  {item.label}
                  <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-900" />
                </div>
              )}
            </Link>
          );
        })}
      </div>

      {/* Settings Section */}
      <div className="border-t border-gray-800/50 py-2 px-2 space-y-1">
        <Link
          to="/subscription/plans"
          className={classNames(
            'flex items-center gap-3 rounded-lg transition-all duration-200 group',
            isExpanded ? 'px-3 py-2' : 'px-3 py-2 justify-center',
            'text-gray-400 hover:text-white hover:bg-white/5'
          )}
        >
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-gray-800/50 group-hover:bg-gray-700/50">
            <div className="i-ph:star-fill text-lg text-gray-400 group-hover:text-yellow-400" />
          </div>
          {isExpanded && <span className="text-sm font-medium">Subscription</span>}
        </Link>

        <button
          onClick={async () => {
            try {
              await supabase.auth.signOut();
              toast.success('Signed out successfully');
              navigate('/');
            } catch (error) {
              console.error('Error signing out:', error);
              toast.error('Failed to sign out');
            }
          }}
          className={classNames(
            'flex items-center gap-3 rounded-lg transition-all duration-200 group w-full',
            isExpanded ? 'px-3 py-2' : 'px-3 py-2 justify-center',
            'text-gray-400 hover:text-white hover:bg-white/5'
          )}
        >
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-gray-800/50 group-hover:bg-gray-700/50">
            <div className="i-ph:sign-out-fill text-lg text-gray-400 group-hover:text-red-400" />
          </div>
          {isExpanded && <span className="text-sm font-medium">Sign Out</span>}
        </button>
      </div>

      {/* User Profile Section */}
      <div className="border-t border-gray-800/50 p-3">
        {userData && (
          <div className={classNames(
            'flex items-center gap-3 transition-all duration-200',
            !isExpanded && 'justify-center'
          )}>
            <div className="relative flex-shrink-0">
              <img
                src={userData.user_metadata?.avatar_url}
                alt="Profile"
                className="w-10 h-10 rounded-full object-cover border-2 border-blue-500"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = "/profile.png";
                }}
              />
              <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-400 rounded-full border-2 border-[#0a0e17]" />
            </div>

            {isExpanded && (
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white font-medium truncate">
                  {userData.user_metadata?.full_name || 'User'}
                </p>
                {subscription && (
                  <p className="text-xs text-blue-400 truncate">
                    {subscription.subscription_plans?.name} • {subscription.subscription_plans?.tokens_included.toLocaleString()} tokens/mo
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Expand/Collapse Indicator */}
      <div className="absolute top-1/2 -right-3 -translate-y-1/2">
        <div className={classNames(
          'w-6 h-12 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-r-lg flex items-center justify-center cursor-pointer transition-all duration-200 opacity-0 group-hover:opacity-100',
          isExpanded ? 'opacity-100' : 'opacity-0 hover:opacity-100'
        )}>
          <div className={classNames(
            'i-ph:caret-right-fill text-white text-sm transition-transform duration-200',
            isExpanded && 'rotate-180'
          )} />
        </div>
      </div>
    </div>
  );
}
