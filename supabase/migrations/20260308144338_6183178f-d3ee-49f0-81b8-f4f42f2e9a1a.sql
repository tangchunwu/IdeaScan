
-- Referral codes table
CREATE TABLE public.referral_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  code text NOT NULL UNIQUE,
  uses_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Referral redemptions table
CREATE TABLE public.referral_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  referrer_id uuid NOT NULL,
  redeemed_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(redeemed_by)
);

-- Enable RLS
ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_redemptions ENABLE ROW LEVEL SECURITY;

-- RLS: Users can view/create their own referral codes
CREATE POLICY "Users can view own codes" ON public.referral_codes FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can create own codes" ON public.referral_codes FOR INSERT WITH CHECK (user_id = auth.uid());

-- RLS: Users can redeem codes (insert redemption)
CREATE POLICY "Users can redeem codes" ON public.referral_redemptions FOR INSERT WITH CHECK (redeemed_by = auth.uid());
CREATE POLICY "Users can view own redemptions" ON public.referral_redemptions FOR SELECT USING (referrer_id = auth.uid() OR redeemed_by = auth.uid());

-- Service role full access
CREATE POLICY "Service role manages codes" ON public.referral_codes FOR ALL USING ((SELECT auth.role()) = 'service_role') WITH CHECK ((SELECT auth.role()) = 'service_role');
CREATE POLICY "Service role manages redemptions" ON public.referral_redemptions FOR ALL USING ((SELECT auth.role()) = 'service_role') WITH CHECK ((SELECT auth.role()) = 'service_role');

-- Function to redeem a referral code (gives +1 quota to both parties)
CREATE OR REPLACE FUNCTION public.redeem_referral(p_code text, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referrer_id uuid;
  v_already_redeemed boolean;
BEGIN
  -- Check if user already redeemed any code
  SELECT EXISTS(SELECT 1 FROM referral_redemptions WHERE redeemed_by = p_user_id) INTO v_already_redeemed;
  IF v_already_redeemed THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_redeemed');
  END IF;

  -- Find referrer
  SELECT user_id INTO v_referrer_id FROM referral_codes WHERE code = p_code;
  IF v_referrer_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_code');
  END IF;

  -- Can't refer yourself
  IF v_referrer_id = p_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'self_referral');
  END IF;

  -- Record redemption
  INSERT INTO referral_redemptions (code, referrer_id, redeemed_by)
  VALUES (p_code, v_referrer_id, p_user_id);

  -- Update uses count
  UPDATE referral_codes SET uses_count = uses_count + 1 WHERE code = p_code;

  -- Give +1 quota to both referrer and redeemed user
  INSERT INTO user_quotas (user_id, free_tikhub_limit)
  VALUES (v_referrer_id, 4)
  ON CONFLICT (user_id) DO UPDATE SET free_tikhub_limit = user_quotas.free_tikhub_limit + 1, updated_at = now();

  INSERT INTO user_quotas (user_id, free_tikhub_limit)
  VALUES (p_user_id, 4)
  ON CONFLICT (user_id) DO UPDATE SET free_tikhub_limit = user_quotas.free_tikhub_limit + 1, updated_at = now();

  RETURN jsonb_build_object('success', true, 'bonus', 1);
END;
$$;
