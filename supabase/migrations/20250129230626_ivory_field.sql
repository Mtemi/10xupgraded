/*
  # Create Subscription Plans Schema

  1. New Tables
    - subscription_plans
      - id (uuid, primary key)
      - name (text)
      - description (text)
      - price_monthly (numeric)
      - tokens_included (integer)
      - features (jsonb)
      - stripe_price_id (text)
      - created_at (timestamptz)
      - updated_at (timestamptz)

  2. Security
    - Enable RLS on subscription_plans table
    - Add policy for authenticated users to read plans
    
  3. Initial Data
    - Insert default subscription plans
*/

-- Drop existing table if it exists
DROP TABLE IF EXISTS subscription_plans CASCADE;

-- Create subscription_plans table
CREATE TABLE subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  price_monthly NUMERIC NOT NULL,
  tokens_included INTEGER NOT NULL,
  features JSONB NOT NULL DEFAULT '[]',
  stripe_price_id TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;

-- Create policy for reading plans
CREATE POLICY "Subscription plans are viewable by everyone" 
  ON subscription_plans 
  FOR SELECT 
  USING (true);

-- Insert default plans
INSERT INTO subscription_plans 
  (name, description, price_monthly, tokens_included, features, stripe_price_id)
VALUES
  (
    'ScriptPro',
    'Start generating your trading scripts',
    25,
    100000,
    '[
      "AI trading strategy sandbox",
      "Create 100% custom bots",
      "Fine tune with user-friendly console",
      "Trading scripts repository",
      "Add tokens on-the-go"
    ]',
    'price_1OvXXXXXXXXXXXXX'  -- Replace with your actual Stripe price ID
  ),
  (
    'BotPro',
    'Everything in ScriptPro, plus bot execution',
    50,
    300000,
    '[
      "Run trading bots in single environment",
      "Dynamic user dashboard",
      "Full control over bot deployment",
      "Real-time trading logs", 
      "Multi-bot interface",
      "24/7 uptime on secure, scalable platform",
      "Email support"
    ]',
    'price_2OvXXXXXXXXXXXXX'  -- Replace with your actual Stripe price ID
  );

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_subscription_plans_updated_at
    BEFORE UPDATE ON subscription_plans
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();