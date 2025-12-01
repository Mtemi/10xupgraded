-- Drop and recreate the operation check constraint with exact string matching
ALTER TABLE token_usage DROP CONSTRAINT IF EXISTS token_usage_operation_check;

-- Add new operation type check constraint with more precise validation
ALTER TABLE token_usage ADD CONSTRAINT token_usage_operation_check
  CHECK (
    operation_type IN ('script_generation', 'bot_execution', 'token_purchase')
  );

-- Add separate constraint for token usage values
ALTER TABLE token_usage ADD CONSTRAINT token_usage_value_check
  CHECK (
    (operation_type IN ('script_generation', 'bot_execution') AND tokens_used > 0) OR
    (operation_type = 'token_purchase' AND tokens_used < 0)
  );