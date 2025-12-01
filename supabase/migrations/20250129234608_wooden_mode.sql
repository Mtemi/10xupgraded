-- Create token_usage table
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
BEGIN
  -- Get total tokens from user's subscription
  SELECT sp.tokens_included INTO total_tokens
  FROM subscriptions s
  JOIN subscription_plans sp ON s.plan_id = sp.id
  WHERE s.user_id = user_uuid
  AND s.status = 'active'
  LIMIT 1;

  -- Get total used tokens
  SELECT COALESCE(SUM(tokens_used), 0) INTO used_tokens
  FROM token_usage
  WHERE user_id = user_uuid
  AND created_at >= date_trunc('month', CURRENT_DATE);

  -- Return remaining tokens
  RETURN COALESCE(total_tokens - used_tokens, 0);
END;
$$;