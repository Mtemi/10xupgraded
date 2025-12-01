-- Drop existing trigger first
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create a simpler version of handle_new_user with better error handling
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    free_plan_id UUID;
BEGIN
    -- First handle the basic user creation
    BEGIN
        INSERT INTO public.users (id, email)
        VALUES (NEW.id, NEW.email)
        ON CONFLICT (id) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
        -- Log error but don't fail
        RAISE WARNING 'Error creating user record: %', SQLERRM;
    END;

    -- Then try to create the free subscription
    BEGIN
        -- Get free plan ID
        SELECT id INTO free_plan_id
        FROM subscription_plans
        WHERE name = 'Free'
        LIMIT 1;

        IF free_plan_id IS NULL THEN
            RAISE WARNING 'Free plan not found';
            RETURN NEW;
        END IF;

        -- Create subscription
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

    EXCEPTION WHEN OTHERS THEN
        -- Log error but don't fail
        RAISE WARNING 'Error creating subscription: %', SQLERRM;
    END;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate the trigger
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION handle_new_user();