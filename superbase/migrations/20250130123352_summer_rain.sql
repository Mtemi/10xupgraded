/*
  # Create token_usage table
  
  1. New Tables
    - token_usage
      - id (UUID, primary key)
      - user_id (UUID, references auth.users)
      - tokens_used (INTEGER)
      - operation_type (TEXT)
      - created_at (TIMESTAMPTZ)
  
  2. Security
    - Enable RLS
    - Add policies for users to view and insert their own token usage
    - Add CASCADE delete when user is deleted
*/

-- Create token_usage table
CREATE TABLE IF NOT EXISTS token_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  tokens_used INTEGER NOT NULL CHECK (tokens_used > 0),
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

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_token_usage_user_id_created_at 
ON token_usage(user_id, created_at);

-- Create function to get remaining tokens
CREATE OR REPLACE FUNCTION get_remaining_tokens(user_uuid UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total_tokens INTEGER;
  used_tokens INTEGER;
BEGIN
  -- Get total tokens from user's subscription
  SELECT sp.tokens_included INTO total_tokens
  FROM subscriptions s
  JOIN subscription_plans sp ON s.plan_id = sp.id
  WHERE s.user_id = user_uuid
  AND s.status = 'active'
  LIMIT 1;

  IF total_tokens IS NULL THEN
    RETURN 0;
  END IF;

  -- Get total used tokens for current month
  SELECT COALESCE(SUM(tokens_used), 0) INTO used_tokens
  FROM token_usage
  WHERE user_id = user_uuid
  AND created_at >= date_trunc('month', CURRENT_DATE);

  RETURN COALESCE(total_tokens - used_tokens, 0);
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_remaining_tokens(UUID) TO authenticated;