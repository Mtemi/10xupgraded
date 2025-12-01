-- Drop the trigger created in peaceful_river
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Drop the function created in peaceful_river
DROP FUNCTION IF EXISTS handle_new_user() CASCADE;

-- Restore the previous trigger function from yellow_delta migration
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

-- Recreate the trigger with the restored function
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION handle_new_user();