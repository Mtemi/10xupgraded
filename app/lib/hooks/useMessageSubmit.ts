import { useState, useCallback } from 'react';
import { supabase } from '~/lib/superbase/client';
import { toast } from 'react-toastify';
import { estimateTokens, checkTokenAvailability, trackTokenUsage } from '~/lib/token-tracking';

export function useMessageSubmit() {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submitMessage = useCallback(async (message: string) => {
    try {
      setIsSubmitting(true);
      
      // Get authenticated user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) {
        throw userError;
      }
      
      if (!user) {
        toast.error('Please sign in to continue');
        return null;
      }
      
      // Estimate token usage
      const estimatedTokens = await estimateTokens(message);
      const hasTokens = await checkTokenAvailability(user.id, estimatedTokens);
      
      if (!hasTokens) {
        return null;
      }
      
      // Send message to API
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: message }]
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to process message');
      }
      
      // Read the response
      const responseText = await response.text();
      
      // Track token usage
      await trackTokenUsage(user.id, estimatedTokens, 'script_generation');
      
      return {
        id: Date.now().toString(),
        role: 'assistant' as const,
        content: responseText
      };
    } catch (error) {
      console.error('Error submitting message:', error);
      toast.error('Failed to process message');
      return null;
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  return { submitMessage, isSubmitting };
}