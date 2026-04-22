-- Multi-user campaign sharing setup

-- 1. Create campaign_members table to support sharing
CREATE TABLE IF NOT EXISTS public.campaign_members (
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL DEFAULT 'member', -- 'owner' or 'member'
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, user_id)
);

ALTER TABLE public.campaign_members ENABLE ROW LEVEL SECURITY;

-- 2. Rules for campaign_members
-- Anyone can see rows where they are the user
CREATE POLICY "Users can see their own memberships" ON public.campaign_members
  FOR SELECT USING (user_id = auth.uid());

-- Tricky but essential: allowing users to join via Campaign ID.
-- If they know the exact campaign_id, they can insert themselves.
CREATE POLICY "Users can insert themselves into a campaign" ON public.campaign_members
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- 3. Update existing tables to check campaign_members instead of just user_id

-- ==========================================
-- CAMPAIGNS
-- ==========================================
-- Drop old restrictive policy if it exists (assuming default single-user policy existed)
DROP POLICY IF EXISTS "Users can read their own campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Users can update their own campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Users can delete their own campaigns" ON public.campaigns;

CREATE POLICY "Members can read campaigns" ON public.campaigns
  FOR SELECT USING (
    id IN (SELECT campaign_id FROM public.campaign_members WHERE user_id = auth.uid())
    OR user_id = auth.uid() -- Backwards compatibility
  );

CREATE POLICY "Members can update campaigns" ON public.campaigns
  FOR UPDATE USING (
    id IN (SELECT campaign_id FROM public.campaign_members WHERE user_id = auth.uid())
    OR user_id = auth.uid()
  );

-- ==========================================
-- CONTACTS
-- ==========================================
DROP POLICY IF EXISTS "Users can select own contacts" ON public.contacts;
DROP POLICY IF EXISTS "Users can update own contacts" ON public.contacts;
DROP POLICY IF EXISTS "Users can insert own contacts" ON public.contacts;
DROP POLICY IF EXISTS "Users can delete own contacts" ON public.contacts;

CREATE POLICY "Members can select contacts" ON public.contacts
  FOR SELECT USING (
    campaign_id IN (SELECT campaign_id FROM public.campaign_members WHERE user_id = auth.uid())
    OR user_id = auth.uid()
  );

CREATE POLICY "Members can update contacts" ON public.contacts
  FOR UPDATE USING (
    campaign_id IN (SELECT campaign_id FROM public.campaign_members WHERE user_id = auth.uid())
    OR user_id = auth.uid()
  );

CREATE POLICY "Members can insert contacts" ON public.contacts
  FOR INSERT WITH CHECK (
    campaign_id IN (SELECT campaign_id FROM public.campaign_members WHERE user_id = auth.uid())
    OR user_id = auth.uid()
  );

CREATE POLICY "Members can delete contacts" ON public.contacts
  FOR DELETE USING (
    campaign_id IN (SELECT campaign_id FROM public.campaign_members WHERE user_id = auth.uid())
    OR user_id = auth.uid()
  );

-- ==========================================
-- CALLS
-- ==========================================
DROP POLICY IF EXISTS "Users can insert own calls" ON public.calls;

CREATE POLICY "Members can read calls" ON public.calls
  FOR SELECT USING (
    campaign_id IN (SELECT campaign_id FROM public.campaign_members WHERE user_id = auth.uid())
    OR user_id = auth.uid()
  );

CREATE POLICY "Members can insert calls" ON public.calls
  FOR INSERT WITH CHECK (
    campaign_id IN (SELECT campaign_id FROM public.campaign_members WHERE user_id = auth.uid())
    OR user_id = auth.uid()
  );

CREATE POLICY "Members can update calls" ON public.calls
  FOR UPDATE USING (
    campaign_id IN (SELECT campaign_id FROM public.campaign_members WHERE user_id = auth.uid())
    OR user_id = auth.uid()
  );

-- ==========================================
-- SESSIONS
-- ==========================================
DROP POLICY IF EXISTS "Users can insert own sessions" ON public.sessions;

CREATE POLICY "Members can read sessions" ON public.sessions
  FOR SELECT USING (
    campaign_id IN (SELECT campaign_id FROM public.campaign_members WHERE user_id = auth.uid())
    OR user_id = auth.uid()
  );

CREATE POLICY "Members can insert sessions" ON public.sessions
  FOR INSERT WITH CHECK (
    campaign_id IN (SELECT campaign_id FROM public.campaign_members WHERE user_id = auth.uid())
    OR user_id = auth.uid()
  );

CREATE POLICY "Members can update sessions" ON public.sessions
  FOR UPDATE USING (
    campaign_id IN (SELECT campaign_id FROM public.campaign_members WHERE user_id = auth.uid())
    OR user_id = auth.uid()
  );

-- ==========================================
-- BACKFILL SCRIPT (MIGRATE EXISTING USERS)
-- ==========================================
-- Automatically add owners to the new members table for existing campaigns
INSERT INTO public.campaign_members (campaign_id, user_id, role)
SELECT id, user_id, 'owner' FROM public.campaigns
ON CONFLICT (campaign_id, user_id) DO NOTHING;
