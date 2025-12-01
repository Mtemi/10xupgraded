-- Create subscription_plans table
CREATE TABLE IF NOT EXISTS subscription_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    price_monthly NUMERIC NOT NULL CHECK (price_monthly >= 0),
    tokens_included INTEGER NOT NULL CHECK (tokens_included >= 0),
    features JSONB NOT NULL DEFAULT '[]',
    stripe_price_id TEXT UNIQUE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

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

-- Enable RLS
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Create updated_at function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_subscription_plans_updated_at
    BEFORE UPDATE ON subscription_plans
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

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
    )
ON CONFLICT (name) DO UPDATE 
SET 
    description = EXCLUDED.description,
    price_monthly = EXCLUDED.price_monthly,
    tokens_included = EXCLUDED.tokens_included,
    features = EXCLUDED.features,
    stripe_price_id = EXCLUDED.stripe_price_id;

-- Modify handle_new_user function to include subscription
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    free_plan_id UUID;
BEGIN
    -- First handle the basic user creation
    INSERT INTO public.users (id, email)
    VALUES (NEW.id, NEW.email)
    ON CONFLICT (id) DO NOTHING;

    -- Then handle the free subscription
    SELECT id INTO free_plan_id
    FROM subscription_plans
    WHERE name = 'Free'
    LIMIT 1;

    IF free_plan_id IS NOT NULL THEN
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
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;