-- First ensure subscription_plans table exists
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

-- Ensure RLS is enabled
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;

-- Ensure the view policy exists
DO $$ 
BEGIN
    DROP POLICY IF EXISTS "Subscription plans are viewable by everyone" ON subscription_plans;
    CREATE POLICY "Subscription plans are viewable by everyone" 
        ON subscription_plans 
        FOR SELECT 
        USING (true);
EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE 'Table subscription_plans does not exist yet';
END $$;

-- Ensure Free plan exists
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

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create or replace the handle_new_user function with better error handling
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
    -- Get the Free plan ID
    SELECT id INTO free_plan_id
    FROM subscription_plans
    WHERE name = 'Free'
    LIMIT 1;

    -- Log the attempt
    RAISE NOTICE 'Attempting to create free subscription for user %. Free plan ID: %', NEW.id, free_plan_id;

    -- If no free plan exists, log warning but don't fail
    IF free_plan_id IS NULL THEN
        RAISE WARNING 'Free plan not found for user %', NEW.id;
        RETURN NEW;
    END IF;

    -- Create subscription for new user
    BEGIN
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

        RAISE NOTICE 'Successfully created free subscription for user %', NEW.id;
    EXCEPTION 
        WHEN undefined_table THEN
            -- If subscriptions table doesn't exist yet, log but don't fail
            RAISE NOTICE 'Subscriptions table does not exist yet for user %', NEW.id;
            RETURN NEW;
        WHEN unique_violation THEN
            -- If subscription already exists, log but don't fail
            RAISE NOTICE 'Subscription already exists for user %', NEW.id;
            RETURN NEW;
        WHEN OTHERS THEN
            -- Log other errors but don't prevent user creation
            RAISE WARNING 'Error creating subscription for user %: %', NEW.id, SQLERRM;
    END;

    RETURN NEW;
END;
$$;

-- Recreate the trigger
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION handle_new_user();