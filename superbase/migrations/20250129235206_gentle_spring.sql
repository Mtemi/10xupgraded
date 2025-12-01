-- Drop existing function if it exists
DROP FUNCTION IF EXISTS handle_new_user();

-- Create updated function with better error handling
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    free_plan_id UUID;
BEGIN
    -- Get the Free plan ID with better error handling
    BEGIN
        SELECT id INTO free_plan_id 
        FROM public.subscription_plans 
        WHERE name = 'Free' 
        LIMIT 1;

        -- Prevent inserting NULL plan_id
        IF free_plan_id IS NULL THEN
            RAISE EXCEPTION 'Free plan does not exist!';
        END IF;

        -- Attempt to insert new subscription
        INSERT INTO public.subscriptions (
            user_id, 
            plan_id, 
            status, 
            current_period_start, 
            current_period_end
        )
        VALUES (
            NEW.id, 
            free_plan_id, 
            'active', 
            NOW(), 
            NOW() + INTERVAL '30 days'
        );

    EXCEPTION 
        WHEN unique_violation THEN
            -- If subscription already exists, just return
            RAISE NOTICE 'Subscription already exists for user %', NEW.id;
            RETURN NEW;
        WHEN OTHERS THEN
            -- Log error but don't prevent user creation
            RAISE WARNING 'Error creating subscription for user %: %', NEW.id, SQLERRM;
            RETURN NEW;
    END;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION handle_new_user() TO authenticated;
GRANT EXECUTE ON FUNCTION handle_new_user() TO service_role;