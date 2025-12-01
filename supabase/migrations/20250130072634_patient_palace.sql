/*
  # Create subscriptions table and auto-assign function
  
  1. New Tables
    - subscriptions
      - id (uuid, primary key) 
      - user_id (uuid, references auth.users)
      - plan_id (uuid, references subscription_plans)
      - status (text)
      - stripe_subscription_id (text)
      - current_period_start (timestamptz)
      - current_period_end (timestamptz)
      - cancel_at_period_end (boolean)
      - created_at (timestamptz)
      - updated_at (timestamptz)

  2. Functions
    - handle_new_user() - Assigns free plan to new users
    
  3. Security
    - Enable RLS
    - Add policies for user access
*/

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
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own subscriptions"
  ON subscriptions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all subscriptions"
  ON subscriptions
  USING (auth.role() = 'service_role');

-- Create updated_at trigger
CREATE TRIGGER update_subscriptions_updated_at
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create function to auto-assign free plan with better error handling and logging
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
  -- Get the Free plan ID with error handling
  BEGIN
    SELECT id INTO free_plan_id
    FROM subscription_plans
    WHERE name = 'Free'
    LIMIT 1;

    IF free_plan_id IS NULL THEN
      log_message := format('Error: Free plan not found for user %s', NEW.id);
      RAISE WARNING '%', log_message;
      RETURN NEW;
    END IF;

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

    log_message := format('Success: Free subscription created for user %s', NEW.id);
    RAISE NOTICE '%', log_message;

  EXCEPTION 
    WHEN unique_violation THEN
      -- Log duplicate subscription attempt
      log_message := format('Notice: Subscription already exists for user %s', NEW.id);
      RAISE NOTICE '%', log_message;
      RETURN NEW;
    WHEN OTHERS THEN
      -- Log other errors but don't prevent user creation
      log_message := format('Error creating subscription for user %s: %s', NEW.id, SQLERRM);
      RAISE WARNING '%', log_message;
  END;

  RETURN NEW;
END;
$$;

-- Create trigger for new user registration
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();