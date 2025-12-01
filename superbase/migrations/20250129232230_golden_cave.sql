/*
  # Add Free Plan and Auto-Assignment Trigger
  
  1. Changes
    - Add Free plan to subscription_plans
    - Create function and trigger for auto-assigning free plan to new users
    
  2. Security
    - Function runs with SECURITY DEFINER to ensure it can access auth.users
*/

-- Add Free plan
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
  );

-- Create function to auto-assign free plan
CREATE OR REPLACE FUNCTION handle_new_user() 
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  free_plan_id UUID;
BEGIN
  -- Get the Free plan ID
  SELECT id INTO free_plan_id
  FROM subscription_plans
  WHERE name = 'Free'
  LIMIT 1;

  -- Create subscription for new user
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

  RETURN NEW;
END;
$$;

-- Create trigger for new user registration
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();