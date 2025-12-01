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

-- Create subscription_plans table with improved constraints
CREATE TABLE subscription_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE CHECK (length(trim(name)) > 0),
    description TEXT,
    price_monthly NUMERIC NOT NULL CHECK (price_monthly >= 0),
    tokens_included INTEGER NOT NULL CHECK (tokens_included >= 0),
    features JSONB NOT NULL DEFAULT '[]',
    stripe_price_id TEXT UNIQUE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create updated_at function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for updated_at
CREATE TRIGGER update_subscription_plans_updated_at
    BEFORE UPDATE ON subscription_plans
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;

-- Create policy for reading plans with improved security
CREATE POLICY "Subscription plans are viewable by everyone" 
    ON subscription_plans 
    FOR SELECT 
    USING (true);

-- Create function to validate plan before insert/update
CREATE OR REPLACE FUNCTION validate_subscription_plan()
RETURNS TRIGGER AS $$
BEGIN
    -- Validate name
    IF length(trim(NEW.name)) = 0 THEN
        RAISE EXCEPTION 'Plan name cannot be empty';
    END IF;

    -- Validate price
    IF NEW.price_monthly < 0 THEN
        RAISE EXCEPTION 'Price cannot be negative';
    END IF;

    -- Validate tokens
    IF NEW.tokens_included < 0 THEN
        RAISE EXCEPTION 'Token amount cannot be negative';
    END IF;

    -- Validate features JSON
    IF NOT (NEW.features IS NULL OR jsonb_typeof(NEW.features) = 'array') THEN
        RAISE EXCEPTION 'Features must be a JSON array';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for plan validation
CREATE TRIGGER validate_subscription_plan_trigger
    BEFORE INSERT OR UPDATE ON subscription_plans
    FOR EACH ROW
    EXECUTE FUNCTION validate_subscription_plan();

-- Insert initial plans with error handling
DO $$ 
BEGIN
    -- Insert Free plan
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
        )
    ON CONFLICT (name) DO UPDATE 
    SET 
        description = EXCLUDED.description,
        price_monthly = EXCLUDED.price_monthly,
        tokens_included = EXCLUDED.tokens_included,
        features = EXCLUDED.features;

    -- Insert ScriptPro plan
    INSERT INTO subscription_plans 
        (name, description, price_monthly, tokens_included, features, stripe_price_id)
    VALUES
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
        )
    ON CONFLICT (name) DO UPDATE 
    SET 
        description = EXCLUDED.description,
        price_monthly = EXCLUDED.price_monthly,
        tokens_included = EXCLUDED.tokens_included,
        features = EXCLUDED.features,
        stripe_price_id = EXCLUDED.stripe_price_id;

    -- Insert BotPro plan
    INSERT INTO subscription_plans 
        (name, description, price_monthly, tokens_included, features, stripe_price_id)
    VALUES
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
        )
    ON CONFLICT (name) DO UPDATE 
    SET 
        description = EXCLUDED.description,
        price_monthly = EXCLUDED.price_monthly,
        tokens_included = EXCLUDED.tokens_included,
        features = EXCLUDED.features,
        stripe_price_id = EXCLUDED.stripe_price_id;

EXCEPTION WHEN OTHERS THEN
    -- Log error but allow migration to continue
    RAISE WARNING 'Error inserting subscription plans: %', SQLERRM;
END $$;

-- Create function to log plan changes
CREATE OR REPLACE FUNCTION log_subscription_plan_changes()
RETURNS TRIGGER AS $$
BEGIN
    RAISE NOTICE 'Subscription plan % % at %', 
        CASE 
            WHEN TG_OP = 'INSERT' THEN 'created'
            WHEN TG_OP = 'UPDATE' THEN 'updated'
            WHEN TG_OP = 'DELETE' THEN 'deleted'
        END,
        CASE 
            WHEN TG_OP = 'DELETE' THEN OLD.name 
            ELSE NEW.name 
        END,
        now();
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for logging plan changes
CREATE TRIGGER log_subscription_plan_changes_trigger
    AFTER INSERT OR UPDATE OR DELETE ON subscription_plans
    FOR EACH ROW
    EXECUTE FUNCTION log_subscription_plan_changes();

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_subscription_plans_name ON subscription_plans(name);
CREATE INDEX IF NOT EXISTS idx_subscription_plans_price ON subscription_plans(price_monthly);
CREATE INDEX IF NOT EXISTS idx_subscription_plans_stripe_id ON subscription_plans(stripe_price_id) WHERE stripe_price_id IS NOT NULL;