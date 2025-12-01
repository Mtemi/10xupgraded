import { PageLayout } from '~/components/layout/PageLayout';
import { BotList } from '~/components/bots/BotList';
import { useNavigate } from '@remix-run/react';
import { useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import { authStore, hasAccess } from '~/lib/stores/auth';
import { AuthDialog } from '~/components/auth/AuthDialog';
import { supabase } from '~/lib/superbase/client';
import { classNames } from '~/utils/classNames';
import { SocialMediaWidgets } from '~/components/ui/SocialMediaWidgets';

export default function BotsPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useStore(authStore);
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const [userData, setUserData] = useState<any>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Check authentication on page load (bypass in development)
  useEffect(() => {
    if (!hasAccess(isAuthenticated)) {
      setShowAuthDialog(true);
    }
  }, [isAuthenticated]);

  // Fetch user data when authenticated
  useEffect(() => {
    const fetchUserData = async () => {
      if (!isAuthenticated) {
        setUserData(null);
        return;
      }
      
      try {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error || !user) {
          setUserData(null);
          return;
        }
        
        setUserData({
          ...user,
          user_metadata: {
            ...user.user_metadata,
            avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture || "/profile.png",
          }
        });
      } catch (error) {
        console.error('Error fetching user data:', error);
        setUserData(null);
      }
    };
    
    fetchUserData();
  }, [isAuthenticated]);

  // Track menu open state by monitoring mouse position
  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      const enterThreshold = 40;
      const exitThreshold = 320;
      
      if (event.pageX < enterThreshold) {
        setIsMenuOpen(true);
      } else if (event.pageX > exitThreshold && !document.querySelector('.side-menu:hover')) {
        setIsMenuOpen(false);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);
  // Fetch and log trading scripts to check chat_id availability
  useEffect(() => {
    const fetchScripts = async () => {
      try {
        if (!isAuthenticated) return;
        
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data, error } = await supabase
          .from('trading_scripts')
          .select('id, name, chat_id')
          .eq('user_id', user.id)
          .limit(5);

        if (error) {
          console.error('Error fetching scripts:', error);
          return;
        }

        console.log('Trading scripts with chat_id:', data);
      } catch (error) {
        console.error('Error in fetchScripts:', error);
      }
    };

    fetchScripts();
  }, [isAuthenticated]);
  
  // Show auth dialog if not authenticated (bypass in development)
  if (!hasAccess(isAuthenticated)) {
    return (
      <PageLayout>
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-center p-8">
            <div className="text-center">
              <h1 className="text-3xl font-bold text-bolt-elements-textPrimary mb-4">
                Sign In Required
              </h1>
              <p className="text-bolt-elements-textSecondary mb-6">
                Please sign in to access your trading bots and configurations
              </p>
              <AuthDialog 
                isOpen={showAuthDialog} 
                onClose={() => {
                  setShowAuthDialog(false);
                  navigate('/');
                }}
                mode="signin"
                closeOnOverlayClick={false}
              />
            </div>
          </div>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <div className={classNames(
        "transition-all duration-300",
        isMenuOpen ? "ml-[300px]" : "ml-[64px]"
      )}>
      {/* Close Button */}
      <div className="fixed top-4 right-4 z-[1001]">
        <button
          onClick={() => navigate('/')}
          className="p-3 rounded-full bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3 transition-colors shadow-lg"
          title="Close and return to homepage"
        >
          <div className="i-ph:x-circle text-xl" />
        </button>
      </div>

      <div className="max-w-6xl mx-auto">
        <BotList />
      </div>
      </div>
      
      {/* Social Media Widgets */}
      <SocialMediaWidgets />
    </PageLayout>
  );
}