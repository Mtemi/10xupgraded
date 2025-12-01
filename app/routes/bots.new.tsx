import { PageLayout } from '~/components/layout/PageLayout';
import { BotConfigForm } from '~/components/bots/BotConfigForm';
import { useNavigate } from '@remix-run/react';
import { useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import { authStore, hasAccess } from '~/lib/stores/auth';
import { AuthDialog } from '~/components/auth/AuthDialog';
import { supabase } from '~/lib/superbase/client';
import { classNames } from '~/utils/classNames';
import { SocialMediaWidgets } from '~/components/ui/SocialMediaWidgets';

export default function NewBotPage() {
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
                Please sign in to create and configure trading bots
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
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-bolt-elements-textPrimary">
            Create New Bot Configuration
          </h1>
        </div>
        
        <BotConfigForm 
          onSave={() => navigate('/bots')}
          onCancel={() => navigate('/bots')}
        />
        
        {/* Bottom sidebar icons for new bot page */}
        <div className={classNames(
          "fixed bottom-16 left-4 z-[1000] flex flex-col items-center gap-2 transition-opacity duration-200",
          isMenuOpen ? "opacity-0 pointer-events-none" : "opacity-100"
        )}>
          {isAuthenticated && userData && (
            <div className="w-10 h-10 rounded-full overflow-hidden bg-bolt-elements-background-depth-3 border-2 border-accent-500">
              <img
                src={userData.user_metadata?.avatar_url || "/profile.png"}
                alt="Profile"
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = "/profile.png";
                }}
              />
            </div>
          )}
          {!isAuthenticated && (
            <div className="w-10 h-10 rounded-full bg-bolt-elements-background-depth-3 border-2 border-bolt-elements-borderColor flex items-center justify-center">
              <div className="i-ph:user text-bolt-elements-textSecondary text-lg" />
            </div>
          )}
          <div className="w-8 h-8 bg-bolt-elements-button-primary-background rounded-md flex items-center justify-center cursor-pointer hover:bg-bolt-elements-button-primary-backgroundHover transition-colors">
            <div className="i-ph:sidebar-simple-duotone text-bolt-elements-button-primary-text text-lg" />
          </div>
        </div>
      </div>
      
      {/* Social Media Widgets */}
      <SocialMediaWidgets />
    </PageLayout>
  );
}