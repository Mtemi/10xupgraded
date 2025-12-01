/*
  # Create token usage tracking table
  
  1. New Tables
    - token_usage
      - id (uuid, primary key)
      - user_id (uuid, references auth.users)
      - tokens_used (integer)
      - operation_type (text)
      - created_at (timestamptz)
      
  2. Functions
    - get_remaining_tokens() - Calculate remaining tokens for user
    
  3. Security
    - Enable RLS
    - Add policies for user access
*/

-- Create token_usage table

-- Drop existing function first
DROP FUNCTION IF EXISTS get_remaining_tokens(uuid);

CREATE TABLE IF NOT EXISTS token_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  tokens_used INTEGER NOT NULL,
  operation_type TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE token_usage ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own token usage"
  ON token_usage
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own token usage"
  ON token_usage
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Create function to get remaining tokens
CREATE OR REPLACE FUNCTION get_remaining_tokens(user_uuid UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  total_tokens INTEGER;
  used_tokens INTEGER;
  log_message TEXT;
BEGIN
  -- Get total tokens from user's subscription
  SELECT sp.tokens_included INTO total_tokens
  FROM subscriptions s
  JOIN subscription_plans sp ON s.plan_id = sp.id
  WHERE s.user_id = user_uuid
  AND s.status = 'active'
  LIMIT 1;

  IF total_tokens IS NULL THEN
    log_message := format('Warning: No active subscription found for user %s', user_uuid);
    RAISE WARNING '%', log_message;
    RETURN 0;
  END IF;

  -- Get total used tokens
  SELECT COALESCE(SUM(tokens_used), 0) INTO used_tokens
  FROM token_usage
  WHERE user_id = user_uuid
  AND created_at >= date_trunc('month', CURRENT_DATE);

  -- Log token calculation
  log_message := format('Token calculation for user %s: Total=%s, Used=%s, Remaining=%s',
                       user_uuid, total_tokens, used_tokens, total_tokens - used_tokens);
  RAISE NOTICE '%', log_message;

  RETURN COALESCE(total_tokens - used_tokens, 0);
EXCEPTION
  WHEN OTHERS THEN
    log_message := format('Error calculating remaining tokens for user %s: %s', user_uuid, SQLERRM);
    RAISE WARNING '%', log_message;
    RETURN 0;
END;
$$;