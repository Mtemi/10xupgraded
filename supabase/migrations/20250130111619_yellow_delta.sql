-- Drop existing trigger first
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Modify handle_new_user function with better error handling and logging
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    free_plan_id UUID;
    log_message TEXT;
BEGIN
    -- First handle the basic user creation
    INSERT INTO public.users (id, email)
    VALUES (NEW.id, NEW.email)
    ON CONFLICT (id) DO NOTHING;

    -- Get the Free plan ID with proper error handling
    BEGIN
        SELECT id INTO free_plan_id
        FROM subscription_plans
        WHERE name = 'Free'
        LIMIT 1;

        IF free_plan_id IS NULL THEN
            RAISE WARNING 'Free plan not found when creating user %', NEW.id;
            RETURN NEW;
        END IF;

        -- Create subscription for new user with error handling
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
            -- If subscription already exists, log but don't fail
            RAISE NOTICE 'Subscription already exists for user %', NEW.id;
        WHEN OTHERS THEN
            -- Log other errors but don't prevent user creation
            RAISE WARNING 'Error creating subscription for user %: %', NEW.id, SQLERRM;
    END;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate the trigger
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION handle_new_user();

-- Ensure all existing users have free subscriptions
DO $$ 
DECLARE
    free_plan_id UUID;
    user_record RECORD;
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

    -- Loop through all users who don't have any subscription
    FOR user_record IN 
        SELECT u.id 
        FROM auth.users u
        LEFT JOIN subscriptions s ON u.id = s.user_id
        WHERE s.id IS NULL
    LOOP
        -- Create free subscription for user
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
END $$;