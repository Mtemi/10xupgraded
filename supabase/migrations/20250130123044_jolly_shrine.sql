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

  -- Get total used tokens
  SELECT COALESCE(SUM(tokens_used), 0) INTO used_tokens
  FROM token_usage
  WHERE user_id = user_uuid
  AND created_at >= date_trunc('month', CURRENT_DATE);

  RETURN COALESCE(total_tokens - used_tokens, 0);
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_remaining_tokens(UUID) TO authenticated;