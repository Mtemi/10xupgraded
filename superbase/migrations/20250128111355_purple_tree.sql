-- Drop existing objects to ensure clean state
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user();
DROP FUNCTION IF EXISTS get_remaining_tokens(uuid);

-- Ensure tables exist in correct order
CREATE TABLE IF NOT EXISTS subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  price_monthly NUMERIC NOT NULL,
  tokens_included INTEGER NOT NULL,
  features JSONB NOT NULL DEFAULT '[]',
  stripe_price_id TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS for subscription_plans
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;

-- Create subscriptions table
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  plan_id UUID REFERENCES subscription_plans(id) NOT NULL,
  status TEXT NOT NULL,
  stripe_subscription_id TEXT UNIQUE,
  current_period_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  current_period_end TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '1 month'),
  cancel_at_period_end BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, plan_id)
);

-- Enable RLS for subscriptions
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Create token_usage table
CREATE TABLE IF NOT EXISTS token_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  tokens_used INTEGER NOT NULL,
  operation_type TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS for token_usage
ALTER TABLE token_usage ENABLE ROW LEVEL SECURITY;

-- Create updated_at function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create handle_new_user function with better error handling
CREATE OR REPLACE FUNCTION handle_new_user() 
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  free_plan_id UUID;
  log_message TEXT;
BEGIN
  -- Get the Free plan ID with error handling
  BEGIN
    SELECT id INTO free_plan_id
    FROM subscription_plans
    WHERE name = 'Free'
    LIMIT 1;

    IF free_plan_id IS NULL THEN
      log_message := format('Error: Free plan not found for user %s', NEW.id);
      RAISE WARNING '%', log_message;
      RETURN NEW;
    END IF;

    -- Create subscription for new user
    INSERT INTO subscriptions (
      user_id,
      plan_id,
      status,
      current_period_start,
      current_period_end
    ) VALUES (
      NEW.id,
      free_plan_id,
      'active',
      NOW(),
      NOW() + INTERVAL '1 month'
    );

    log_message := format('Success: Free subscription created for user %s', NEW.id);
    RAISE NOTICE '%', log_message;

  EXCEPTION 
    WHEN unique_violation THEN
      log_message := format('Notice: Subscription already exists for user %s', NEW.id);
      RAISE NOTICE '%', log_message;
      RETURN NEW;
    WHEN OTHERS THEN
      log_message := format('Error creating subscription for user %s: %s', NEW.id, SQLERRM);
      RAISE WARNING '%', log_message;
  END;

  RETURN NEW;
END;
$$;

-- Create get_remaining_tokens function
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

-- Create all necessary triggers
CREATE TRIGGER update_subscription_plans_updated_at
    BEFORE UPDATE ON subscription_plans
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create auth trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- Insert default plans
INSERT INTO subscription_plans 
  (name, description, price_monthly, tokens_included, features, stripe_price_id)
VALUES
  (
    'Free',
    'Start with free tokens',
    0,
    10000,
    '[
      "AI trading strategy generation",
      "Basic script customization", 
      "Community support"
    ]'::jsonb,
    NULL
  ),
  (
    'ScriptPro',
    'Start generating your trading scripts',
    25,
    100000,
    '[
      "AI trading strategy sandbox",
      "Create 100% custom bots",
      "Fine tune with user-friendly console",
      "Trading scripts repository",
      "Add tokens on-the-go"
    ]'::jsonb,
    'price_1QmLCoG33iVgxEOwwvVpPbpD'
  ),
  (
    'BotPro',
    'Everything in ScriptPro, plus bot execution',
    50,
    300000,
    '[
      "Run trading bots in single environment",
      "Dynamic user dashboard",
      "Full control over bot deployment",
      "Real-time trading logs", 
      "Multi-bot interface",
      "24/7 uptime on secure, scalable platform",
      "Email support"
    ]'::jsonb,
    'price_1QmLGNG33iVgxEOwjSUkEgRA'
  );

-- Create RLS policies
CREATE POLICY "Subscription plans are viewable by everyone" 
  ON subscription_plans 
  FOR SELECT 
  USING (true);

CREATE POLICY "Users can view their own subscriptions"
  ON subscriptions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all subscriptions"
  ON subscriptions
  USING (auth.role() = 'service_role');

CREATE POLICY "Users can insert their own subscriptions"
ON subscriptions
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own subscriptions"
ON subscriptions
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

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