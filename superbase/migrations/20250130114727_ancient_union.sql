/*
  # Automatic Free Plan Subscription Setup
  
  1. Changes
    - Creates a reliable trigger system for new user registration
    - Ensures users table exists with proper structure
    - Adds automatic free plan subscription assignment
    - Includes comprehensive error handling and logging
  
  2. Security
    - Enables RLS on all tables
    - Adds appropriate policies for user access
    - Uses SECURITY DEFINER for sensitive operations
*/

-- First ensure we have the basic users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY REFERENCES auth.users(id),
    email TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on users table
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Create policy for users to view their own data
CREATE POLICY "Users can view own data" ON users
    FOR SELECT
    TO authenticated
    USING (auth.uid() = id);

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create a two-step user creation and subscription process
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    -- Step 1: Create the user record
    INSERT INTO public.users (id, email)
    VALUES (NEW.id, NEW.email)
    ON CONFLICT (id) DO NOTHING;

    -- Step 2: Attempt to create free subscription
    DECLARE
        free_plan_id UUID;
    BEGIN
        -- Get the Free plan ID
        SELECT id INTO free_plan_id
        FROM subscription_plans
        WHERE name = 'Free'
        LIMIT 1;

        IF free_plan_id IS NULL THEN
            RAISE WARNING 'Free plan not found for user %', NEW.id;
            RETURN NEW;
        END IF;

        -- Create subscription
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
        WHEN unique_violation THEN
            RAISE NOTICE 'Subscription already exists for user %', NEW.id;
        WHEN undefined_table THEN
            RAISE NOTICE 'Subscriptions table does not exist yet for user %', NEW.id;
        WHEN OTHERS THEN
            RAISE WARNING 'Error creating subscription for user %: %', NEW.id, SQLERRM;
    END;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new user registration
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION handle_new_user();

-- Function to retroactively assign free plan to existing users
CREATE OR REPLACE FUNCTION assign_free_plan_to_existing_users()
RETURNS void AS $$
DECLARE
    user_record RECORD;
    free_plan_id UUID;
BEGIN
    -- Get the Free plan ID
    SELECT id INTO free_plan_id
    FROM subscription_plans
    WHERE name = 'Free'
    LIMIT 1;

    IF free_plan_id IS NULL THEN
        RAISE EXCEPTION 'Free plan not found';
    END IF;

    -- Process each user without a subscription
    FOR user_record IN 
        SELECT u.id 
        FROM auth.users u
        LEFT JOIN subscriptions s ON u.id = s.user_id
        WHERE s.id IS NULL
    LOOP
        BEGIN
            INSERT INTO subscriptions (
                user_id,
                plan_id,
                status,
                current_period_start,
                current_period_end
            ) VALUES (
                user_record.id,
                free_plan_id,
                'active',
                NOW(),
                NOW() + INTERVAL '1 month'
            );
            RAISE NOTICE 'Created free subscription for existing user %', user_record.id;
        EXCEPTION 
            WHEN unique_violation THEN
                RAISE NOTICE 'Subscription already exists for user %', user_record.id;
            WHEN OTHERS THEN
                RAISE WARNING 'Error creating subscription for user %: %', user_record.id, SQLERRM;
        END;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Run the function to handle existing users
SELECT assign_free_plan_to_existing_users();