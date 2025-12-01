-- Add policies for users to manage their subscriptions
CREATE POLICY "Users can insert their own subscriptions"
  ON subscriptions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own subscriptions"
  ON subscriptions
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    -- Only allow updating specific fields
    auth.uid() = user_id AND
    -- Ensure they can't change user_id
    OLD.user_id = NEW.user_id AND
    -- Only allow updating status and plan_id
    (
      (OLD.status != NEW.status) OR
      (OLD.plan_id != NEW.plan_id)
    )
  );

-- Add policy for users to delete their subscriptions
CREATE POLICY "Users can delete their own subscriptions"
  ON subscriptions
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Add function to validate subscription changes
CREATE OR REPLACE FUNCTION validate_subscription_change()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  current_active_sub UUID;
BEGIN
  -- Check if user already has an active subscription
  SELECT id INTO current_active_sub
  FROM subscriptions
  WHERE user_id = NEW.user_id
  AND status = 'active'
  AND id != NEW.id;

  -- If inserting/updating to active status, ensure no other active subscription exists
  IF NEW.status = 'active' AND current_active_sub IS NOT NULL THEN
    RAISE EXCEPTION 'User already has an active subscription';
  END IF;

  -- Validate plan exists
  IF NOT EXISTS (SELECT 1 FROM subscription_plans WHERE id = NEW.plan_id) THEN
    RAISE EXCEPTION 'Invalid plan_id';
  END IF;

  RETURN NEW;
END;
$$;

-- Add trigger to validate subscription changes
DROP TRIGGER IF EXISTS validate_subscription_change_trigger ON subscriptions;
CREATE TRIGGER validate_subscription_change_trigger
  BEFORE INSERT OR UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION validate_subscription_change();

-- Add function to handle subscription status changes
CREATE OR REPLACE FUNCTION handle_subscription_status_change()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- If status changed to 'cancelled' or 'inactive'
  IF NEW.status IN ('cancelled', 'inactive') AND OLD.status = 'active' THEN
    -- Set cancel_at_period_end to true
    NEW.cancel_at_period_end := true;
  END IF;

  -- If reactivating a subscription
  IF NEW.status = 'active' AND OLD.status IN ('cancelled', 'inactive') THEN
    -- Reset cancel_at_period_end and update period dates
    NEW.cancel_at_period_end := false;
    NEW.current_period_start := NOW();
    NEW.current_period_end := NOW() + INTERVAL '1 month';
  END IF;

  RETURN NEW;
END;
$$;

-- Add trigger for subscription status changes
DROP TRIGGER IF EXISTS handle_subscription_status_change_trigger ON subscriptions;
CREATE TRIGGER handle_subscription_status_change_trigger
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW
  WHEN (NEW.status IS DISTINCT FROM OLD.status)
  EXECUTE FUNCTION handle_subscription_status_change();