import * as Dialog from '@radix-ui/react-dialog';
import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { supabase } from '~/lib/superbase/client';
import { toast } from 'react-toastify';
import { IconButton } from '~/components/ui/IconButton';

// Update the interface to include API key and secret in onConfirm
interface ApiKeyDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (apiKey: string, apiSecret: string) => void; // Modified to pass keys
  platformId: string;
}

export function ApiKeyDialog({ isOpen, onClose, onConfirm, platformId }: ApiKeyDialogProps) {
  const [existingKeys, setExistingKeys] = useState<{apiKey: string, apiSecret: string} | null>(null);
  const [newApiKey, setNewApiKey] = useState('');
  const [newApiSecret, setNewApiSecret] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchExistingKeys = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          toast.error('Please sign in to access API keys');
          return;
        }

        // Get the platform ID from trading_platforms table
        const { data: platformData, error: platformError } = await supabase
          .from('trading_platforms')
          .select('id')
          .eq('name', 'binance')
          .single();

        if (platformError) {
          console.error('Error fetching platform ID:', platformError);
          toast.error('Error fetching platform information');
          return;
        }

        // Get existing API keys for the user and platform
        const { data, error } = await supabase
          .from('user_api_keys')
          .select('api_key, api_secret')
          .eq('user_id', user.id)
          .eq('platform_id', platformData.id)
          .single();

        if (error) {
          if (error.code === 'PGRST116') { // No data found
            console.log('No existing API keys found');
            setExistingKeys(null);
          } else {
            console.error('Error fetching API keys:', error);
            throw error;
          }
        } else if (data) {
          setExistingKeys({
            apiKey: data.api_key,
            apiSecret: data.api_secret
          });
        }
      } catch (error) {
        console.error('Error fetching API keys:', error);
        toast.error('Failed to fetch API keys');
      } finally {
        setIsLoading(false);
      }
    };

    if (isOpen) {
      fetchExistingKeys();
    }
  }, [isOpen]);

  const handleSubmit = async (useExisting: boolean = false) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Please sign in to save API keys');
        return;
      }

      // Get platform ID
      const { data: platformData, error: platformError } = await supabase
        .from('trading_platforms')
        .select('id')
        .eq('name', 'binance')
        .single();

      if (platformError) {
        console.error('Error fetching platform ID:', platformError);
        toast.error('Failed to get platform information');
        return;
      }

      let finalApiKey: string;
      let finalApiSecret: string;

      if (useExisting) {
        if (!existingKeys) {
          toast.error('No existing keys found');
          return;
        }
        finalApiKey = existingKeys.apiKey;
        finalApiSecret = existingKeys.apiSecret;
      } else {
        if (!newApiKey || !newApiSecret) {
          toast.error('Please provide both API key and secret');
          return;
        }
        finalApiKey = newApiKey;
        finalApiSecret = newApiSecret;

        // Save/Update keys in database
        const { error: upsertError } = await supabase
          .from('user_api_keys')
          .upsert({
            user_id: user.id,
            platform_id: platformData.id,
            api_key: newApiKey,
            api_secret: newApiSecret
          }, {
            onConflict: 'user_id,platform_id'
          });

        if (upsertError) {
          console.error('Error saving API keys:', upsertError);
          throw upsertError;
        }
      }

      toast.success('API keys confirmed successfully');
      onConfirm(finalApiKey, finalApiSecret); // Pass the keys to parent component
      onClose();
    } catch (error) {
      console.error('Error saving API keys:', error);
      toast.error('Failed to save API keys');
    }
  };

  const maskKey = (key: string) => `${key.substring(0, 4)}...${key.substring(key.length - 4)}`;

  return (
    <Dialog.Root open={isOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[9999]" />
        <Dialog.Content asChild>
          <motion.div
            className="fixed top-1/2 left-1/2 popupCustomCenter w-[90vw] max-w-[400px] bg-bolt-elements-background-depth-2 rounded-lg p-6 z-[10000] border border-bolt-elements-borderColor"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
          >
            <Dialog.Title className="text-xl font-semibold mb-4 text-bolt-elements-textPrimary">
              API Key Confirmation
            </Dialog.Title>

            {isLoading ? (
              // <div className="text-center py-4">Loading...</div>
              <div className="text-center py-4 text-bolt-elements-textPrimary">Loading...</div>
            ) : existingKeys ? (
              <div className="mb-6">
                <p className="text-bolt-elements-textSecondary mb-4">
                  You have existing API keys stored:
                </p>
                <div className="bg-bolt-elements-background-depth-1 p-3 rounded mb-4">
                  {/* <p>API Key: {maskKey(existingKeys.apiKey)}</p>
                  <p>API Secret: {maskKey(existingKeys.apiSecret)}</p> */}
                  <p className="text-bolt-elements-textPrimary">API Key: <span className="text-bolt-elements-textPrimary">{maskKey(existingKeys.apiKey)}</span></p>
                  <p className="text-bolt-elements-textPrimary">API Secret: <span className="text-bolt-elements-textPrimary">{maskKey(existingKeys.apiSecret)}</span></p>

                </div>
                <div className="flex gap-4">
                  <button
                    onClick={() => handleSubmit(true)}
                    className="flex-1 bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text p-2 rounded hover:bg-bolt-elements-button-primary-backgroundHover"
                  >
                    Use Existing Keys
                  </button>
                  <button
                    onClick={() => setExistingKeys(null)}
                    className="flex-1 bg-bolt-elements-button-secondary-background text-bolt-elements-button-secondary-text p-2 rounded hover:bg-bolt-elements-button-secondary-backgroundHover"
                  >
                    Enter New Keys
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-bolt-elements-textSecondary mb-1">
                    API Key
                  </label>
                  <input
                    type="text"
                    value={newApiKey}
                    onChange={(e) => setNewApiKey(e.target.value)}
                    className="w-full p-2 rounded bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor text-bolt-elements-textPrimary"
                    placeholder="Enter your API key"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-bolt-elements-textSecondary mb-1">
                    API Secret
                  </label>
                  <input
                    type="password"
                    value={newApiSecret}
                    onChange={(e) => setNewApiSecret(e.target.value)}
                    className="w-full p-2 rounded bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor text-bolt-elements-textPrimary"
                    placeholder="Enter your API secret"
                  />
                </div>
                <button
                  onClick={() => handleSubmit(false)}
                  className="w-full bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text p-2 rounded hover:bg-bolt-elements-button-primary-backgroundHover"
                >
                  Save and Continue
                </button>
              </div>
            )}

            {/* <button
              onClick={onClose}
              className="absolute top-4 right-4 text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary"
            >
              <div className="i-ph:x-circle text-xl" />
            </button> */}
            <IconButton
              icon="i-ph:x-circle"
              className="absolute top-2 right-2"
              size="xl"
              onClick={onClose}
            />
          </motion.div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}