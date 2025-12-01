-- Drop existing foreign key constraint
ALTER TABLE subscriptions
DROP CONSTRAINT IF EXISTS subscriptions_user_id_fkey;

-- Re-add the constraint with ON DELETE CASCADE
ALTER TABLE subscriptions
ADD CONSTRAINT subscriptions_user_id_fkey
FOREIGN KEY (user_id)
REFERENCES auth.users(id)
ON DELETE CASCADE;

-- Also add CASCADE to token_usage table if it exists
ALTER TABLE IF EXISTS token_usage
DROP CONSTRAINT IF EXISTS token_usage_user_id_fkey;

ALTER TABLE IF EXISTS token_usage
ADD CONSTRAINT token_usage_user_id_fkey
FOREIGN KEY (user_id)
REFERENCES auth.users(id)
ON DELETE CASCADE;