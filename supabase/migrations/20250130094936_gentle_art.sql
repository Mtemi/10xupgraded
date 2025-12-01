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

-- Create subscription_plans table
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

-- Enable RLS
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;

-- Create policy for reading plans
CREATE POLICY "Subscription plans are viewable by everyone" 
    ON subscription_plans 
    FOR SELECT 
    USING (true);

-- Insert initial plans
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