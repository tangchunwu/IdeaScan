
-- Step 1: Add mode column to openclaw_connections
ALTER TABLE public.openclaw_connections
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'direct';

-- Step 2: Add status column to openclaw_messages
ALTER TABLE public.openclaw_messages
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'delivered';

-- Step 3: Index for polling pending messages efficiently
CREATE INDEX IF NOT EXISTS idx_openclaw_messages_status_pending
  ON public.openclaw_messages (status, connection_id)
  WHERE status = 'pending';

-- Step 4: Enable Realtime for openclaw_messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.openclaw_messages;

-- Step 5: Add service_role full access policy for openclaw_messages (for poll/reply edge functions)
CREATE POLICY "Service role full access on openclaw_messages"
  ON public.openclaw_messages
  FOR ALL
  TO public
  USING (( SELECT auth.role() AS role) = 'service_role'::text)
  WITH CHECK (( SELECT auth.role() AS role) = 'service_role'::text);

-- Step 6: Add service_role SELECT policy for openclaw_connections (for poll/reply to verify token)
CREATE POLICY "Service role can read connections"
  ON public.openclaw_connections
  FOR SELECT
  TO public
  USING (( SELECT auth.role() AS role) = 'service_role'::text);
