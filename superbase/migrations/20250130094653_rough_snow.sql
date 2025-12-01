-- First, drop everything in the correct order to avoid dependency issues
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS validate_subscription_change_trigger ON subscriptions;
DROP TRIGGER IF EXISTS handle_subscription_status_change_trigger ON subscriptions;
DROP TRIGGER IF EXISTS update_subscriptions_updated_at ON subscriptions;
DROP TRIGGER IF EXISTS update_subscription_plans_updated_at ON subscription_plans;

DROP FUNCTION IF EXISTS handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS validate_subscription_change() CASCADE;
DROP FUNCTION IF EXISTS handle_subscription_status_change() CASCADE;
DROP FUNCTION IF EXISTS get_remaining_tokens(uuid) CASCADE;
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;

DROP TABLE IF EXISTS token_usage CASCADE;
DROP TABLE IF EXISTS subscriptions CASCADE;
DROP TABLE IF EXISTS subscription_plans CASCADE;

-- Now recreate everything in the correct order

-- 1. Create the updated_at function first
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 2. Create subscription_plans table
CREATE TABLE subscription_plans (
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

-- 3. Create subscriptions table
CREATE TABLE subscriptions (
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

-- 4. Create token_usage table
CREATE TABLE token_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    tokens_used INTEGER NOT NULL,
    operation_type TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Enable RLS on all tables
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_usage ENABLE ROW LEVEL SECURITY;

-- 6. Create all necessary functions
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
    SELECT sp.tokens_included INTO total_tokens
    FROM subscriptions s
    JOIN subscription_plans sp ON s.plan_id = sp.id
    WHERE s.user_id = user_uuid
    AND s.status = 'active'
    LIMIT 1;

    SELECT COALESCE(SUM(tokens_used), 0) INTO used_tokens
    FROM token_usage
    WHERE user_id = user_uuid
    AND created_at >= date_trunc('month', CURRENT_DATE);

    RETURN COALESCE(total_tokens - used_tokens, 0);
END;
$$;

-- 7. Create handle_new_user function
CREATE OR REPLACE FUNCTION handle_new_user() 
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    free_plan_id UUID;
BEGIN
    SELECT id INTO free_plan_id
    FROM subscription_plans
    WHERE name = 'Free'
    LIMIT 1;

    IF free_plan_id IS NULL THEN
        RETURN NEW;
    END IF;

    INSERT INTO subscriptions (
        user_id,
        plan_id,
        status
    ) VALUES (
        NEW.id,
        free_plan_id,
        'active'
    )
    ON CONFLICT (user_id, plan_id) DO NOTHING;

    RETURN NEW;
EXCEPTION 
    WHEN OTHERS THEN
        -- Log error but don't prevent user creation
        RAISE WARNING 'Error in handle_new_user: %', SQLERRM;
        RETURN NEW;
END;
$$;

-- 8. Create all triggers
CREATE TRIGGER update_subscription_plans_updated_at
    BEFORE UPDATE ON subscription_plans
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION handle_new_user();

-- 9. Create all policies
CREATE POLICY "Subscription plans are viewable by everyone" 
    ON subscription_plans 
    FOR SELECT 
    USING (true);

CREATE POLICY "Users can view their own subscriptions"
    ON subscriptions
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

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

CREATE POLICY "Service role can manage all subscriptions"
    ON subscriptions
    USING (auth.role() = 'service_role');

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

-- 10. Insert initial plans
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