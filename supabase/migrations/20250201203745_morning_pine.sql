-- First drop the existing operation check constraint
ALTER TABLE token_usage DROP CONSTRAINT IF EXISTS token_usage_operation_check;

-- Drop the tokens_used check constraint if it exists
ALTER TABLE token_usage DROP CONSTRAINT IF EXISTS token_usage_tokens_used_check;

-- Add new operation type check constraint
ALTER TABLE token_usage ADD CONSTRAINT token_usage_operation_check
  CHECK (
    (operation_type = 'script_generation' AND tokens_used > 0) OR
    (operation_type = 'bot_execution' AND tokens_used > 0) OR
    (operation_type = 'token_purchase' AND tokens_used < 0)
  );

-- Update get_remaining_tokens function to handle negative values (purchases)
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
  -- Note: token purchases are negative values, so SUM will subtract them
  SELECT COALESCE(SUM(tokens_used), 0) INTO used_tokens
  FROM token_usage
  WHERE user_id = user_uuid
  AND created_at >= date_trunc('month', CURRENT_DATE);

  -- Subtract used_tokens (which includes negative values for purchases)
  RETURN total_tokens - used_tokens;
END;
$$;

-- Create function to add tokens to balance
CREATE OR REPLACE FUNCTION add_tokens_to_balance(user_uuid UUID, tokens_to_add INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_balance INTEGER;
  new_balance INTEGER;
BEGIN
  -- Insert token purchase record (negative value represents a credit)
  INSERT INTO token_usage (
    user_id,
    tokens_used,
    operation_type
  ) VALUES (
    user_uuid,
    -tokens_to_add,  -- Negative value for purchases/credits
    'token_purchase'
  );

  -- Get updated balance
  SELECT get_remaining_tokens(user_uuid) INTO new_balance;
  
  RETURN new_balance;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION add_tokens_to_balance(UUID, INTEGER) TO authenticated;