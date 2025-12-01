-- First ensure the subscription_plans table exists
CREATE TABLE IF NOT EXISTS subscription_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    price_monthly NUMERIC NOT NULL CHECK (price_monthly >= 0),
    tokens_included INTEGER NOT NULL CHECK (tokens_included >= 0),
    features JSONB NOT NULL DEFAULT '[]',
    stripe_price_id TEXT UNIQUE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add UNIQUE constraint to name column if it doesn't exist
DO $$ 
BEGIN
    -- Check if the unique constraint already exists
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'subscription_plans_name_key'
    ) THEN
        ALTER TABLE subscription_plans ADD CONSTRAINT subscription_plans_name_key UNIQUE (name);
    END IF;
EXCEPTION 
    WHEN undefined_table THEN
        RAISE NOTICE 'Table subscription_plans does not exist yet';
END $$;

-- Ensure RLS is enabled
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;

-- Recreate the view policy
DROP POLICY IF EXISTS "Subscription plans are viewable by everyone" ON subscription_plans;
CREATE POLICY "Subscription plans are viewable by everyone" 
    ON subscription_plans 
    FOR SELECT 
    USING (true);

-- Insert or update Free plan with proper error handling
DO $$ 
BEGIN
    INSERT INTO subscription_plans 
        (name, description, price_monthly, tokens_included, features)
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
            ]'::jsonb
        )
    ON CONFLICT (name) 
    DO UPDATE SET 
        description = EXCLUDED.description,
        price_monthly = EXCLUDED.price_monthly,
        tokens_included = EXCLUDED.tokens_included,
        features = EXCLUDED.features;
EXCEPTION 
    WHEN undefined_table THEN
        RAISE NOTICE 'Table subscription_plans does not exist yet';
    WHEN OTHERS THEN
        RAISE NOTICE 'Error inserting Free plan: %', SQLERRM;
END $$;