-- Create a function to handle new user registration and subscription
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    free_plan_id UUID;
BEGIN
    -- First create the user record
    INSERT INTO public.users (id, email)
    VALUES (NEW.id, NEW.email)
    ON CONFLICT (id) DO NOTHING;

    -- Get the Free plan ID
    SELECT id INTO free_plan_id
    FROM subscription_plans
    WHERE name = 'Free'
    LIMIT 1;

    -- If free plan exists, create subscription
    IF free_plan_id IS NOT NULL THEN
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
            
            RAISE NOTICE 'Created free subscription for user %', NEW.id;
        EXCEPTION 
            WHEN unique_violation THEN
                RAISE NOTICE 'Subscription already exists for user %', NEW.id;
            WHEN OTHERS THEN
                RAISE WARNING 'Error creating subscription for user %: %', NEW.id, SQLERRM;
        END;
    ELSE
        RAISE WARNING 'Free plan not found when creating user %', NEW.id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create trigger for new user registration
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION handle_new_user();

-- Function to assign free plan to existing users who don't have it
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
        RAISE WARNING 'Free plan not found';
        RETURN;
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