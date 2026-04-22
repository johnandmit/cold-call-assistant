-- master-campaign-setup.sql
-- Run this once in your Supabase SQL Editor to set up the multi-user system.

-- ==========================================
-- 1. TABLES SETUP
-- ==========================================

-- Campaigns (Enable RLS if not already)
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

-- Campaign Members (The pivot table for sharing)
CREATE TABLE IF NOT EXISTS public.campaign_members (
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL DEFAULT 'member', -- 'owner' or 'member'
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, user_id)
);
ALTER TABLE public.campaign_members ENABLE ROW LEVEL SECURITY;

-- Folders table for campaign organization
CREATE TABLE IF NOT EXISTS public.folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;

-- Add folder_id to campaigns
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES public.folders(id) ON DELETE SET NULL;

-- SINGLE OWNER ENFORCEMENT
-- Trigger to ensure only one owner exists per campaign
CREATE OR REPLACE FUNCTION public.ensure_single_owner()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role = 'owner' THEN
    UPDATE public.campaign_members 
    SET role = 'member' 
    WHERE campaign_id = NEW.campaign_id AND user_id != NEW.user_id AND role = 'owner';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_owner_assigned ON public.campaign_members;
CREATE TRIGGER on_owner_assigned
  BEFORE INSERT OR UPDATE ON public.campaign_members
  FOR EACH ROW EXECUTE FUNCTION public.ensure_single_owner();

-- DATA CLEANUP: Force campaign_members to match campaigns.user_id (The authoritative owner)
UPDATE public.campaign_members cm
SET role = 'owner'
FROM public.campaigns c
WHERE cm.campaign_id = c.id AND cm.user_id = c.user_id;

UPDATE public.campaign_members cm
SET role = 'member'
FROM public.campaigns c
WHERE cm.campaign_id = c.id AND cm.user_id != c.user_id AND cm.role = 'owner';

-- UNIQUE INDEX: Only one owner allowed per campaign
CREATE UNIQUE INDEX IF NOT EXISTS one_owner_per_campaign ON public.campaign_members (campaign_id) WHERE (role = 'owner');

-- Profiles (Public user metadata)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  last_active TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- 2. AUTH TRIGGER (Auto-create profile)
-- ==========================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (new.id, new.email);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill existing users
INSERT INTO public.profiles (id, email)
SELECT id, email FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- Backfill campaign owners
INSERT INTO public.campaign_members (campaign_id, user_id, role)
SELECT id, user_id, 'owner' FROM public.campaigns
ON CONFLICT (campaign_id, user_id) DO NOTHING;

-- ==========================================
-- 3. POLICIES (RLS)
-- ==========================================

-- Campaign Members
DROP POLICY IF EXISTS "Users can see their own memberships" ON public.campaign_members;
CREATE POLICY "Users can see their own memberships" ON public.campaign_members
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert themselves into a campaign" ON public.campaign_members;
CREATE POLICY "Users can insert themselves into a campaign" ON public.campaign_members
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Owners can update member roles" ON public.campaign_members;
CREATE POLICY "Owners can update member roles" ON public.campaign_members
  FOR UPDATE USING (
    campaign_id IN (SELECT id FROM public.campaigns WHERE user_id = auth.uid())
  );

-- Campaigns
DROP POLICY IF EXISTS "Members can read campaigns" ON public.campaigns;
CREATE POLICY "Members can read campaigns" ON public.campaigns
  FOR SELECT USING (
    id IN (SELECT campaign_id FROM public.campaign_members WHERE user_id = auth.uid())
    OR user_id = auth.uid()
  );

DROP POLICY IF EXISTS "Members can update campaigns" ON public.campaigns;
CREATE POLICY "Members can update campaigns" ON public.campaigns
  FOR UPDATE USING (
    id IN (SELECT campaign_id FROM public.campaign_members WHERE user_id = auth.uid())
    OR user_id = auth.uid()
  );

DROP POLICY IF EXISTS "Users can create their own campaigns" ON public.campaigns;
CREATE POLICY "Users can create their own campaigns" ON public.campaigns
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Owners can delete their own campaigns" ON public.campaigns;
CREATE POLICY "Owners can delete their own campaigns" ON public.campaigns
  FOR DELETE USING (auth.uid() = user_id);

-- Contacts / Calls / Sessions
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

-- Simple logic: if you are in the campaign_members table for that campaign, you can access its data.
CREATE POLICY "Campaign group access - Contacts" ON public.contacts
FOR ALL USING (campaign_id IN (SELECT campaign_id FROM public.campaign_members WHERE user_id = auth.uid()));

CREATE POLICY "Campaign group access - Calls" ON public.calls
FOR ALL USING (campaign_id IN (SELECT campaign_id FROM public.campaign_members WHERE user_id = auth.uid()));

CREATE POLICY "Campaign group access - Sessions" ON public.sessions
FOR ALL USING (campaign_id IN (SELECT campaign_id FROM public.campaign_members WHERE user_id = auth.uid()));

-- Profiles
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Public profiles are viewable by everyone" ON public.profiles
  FOR SELECT USING (true);

-- Folders Policies
DROP POLICY IF EXISTS "Users can manage their own folders" ON public.folders;
CREATE POLICY "Users can manage their own folders" ON public.folders
  FOR ALL USING (user_id = auth.uid());

-- ==========================================
-- 4. UTILS & ANALYTICS VIEWS
-- ==========================================

-- View to join member info with their profiles
CREATE OR REPLACE VIEW public.campaign_member_details AS
SELECT 
  cm.campaign_id,
  cm.user_id,
  cm.role,
  cm.joined_at,
  p.email,
  p.last_active
FROM public.campaign_members cm
JOIN public.profiles p ON cm.user_id = p.id;

-- Function to get members with stats (referenced in react code)
CREATE OR REPLACE FUNCTION public.get_campaign_members_with_stats(p_campaign_id UUID)
RETURNS TABLE (
  id UUID,
  email TEXT,
  role TEXT,
  joined_at TIMESTAMP WITH TIME ZONE,
  last_active TIMESTAMP WITH TIME ZONE,
  total_calls BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    m.user_id as id,
    m.email,
    m.role,
    m.joined_at,
    m.last_active,
    (SELECT count(*) FROM public.calls c WHERE c.user_id = m.user_id AND c.campaign_id = p_campaign_id) as total_calls
  FROM public.campaign_member_details m
  WHERE m.campaign_id = p_campaign_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to ensure membership exists without overwriting existing roles
CREATE OR REPLACE FUNCTION public.ensure_campaign_membership(
  p_campaign_id UUID,
  p_user_id UUID,
  p_role TEXT DEFAULT 'member'
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO public.campaign_members (campaign_id, user_id, role)
  VALUES (p_campaign_id, p_user_id, p_role)
  ON CONFLICT (campaign_id, user_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to handle member departure with ownership succession
CREATE OR REPLACE FUNCTION public.handle_member_leave(
  p_campaign_id UUID,
  p_user_id UUID
)
RETURNS JSON AS $$
DECLARE
  v_role TEXT;
  v_member_count INT;
  v_next_owner UUID;
BEGIN
  -- 1. Check current role and member count
  SELECT role INTO v_role FROM public.campaign_members 
  WHERE campaign_id = p_campaign_id AND user_id = p_user_id;
  
  IF v_role IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'User is not a member of this campaign');
  END IF;

  SELECT count(*) INTO v_member_count FROM public.campaign_members WHERE campaign_id = p_campaign_id;

  -- 2. Logic for Owners
  IF v_role = 'owner' THEN
    IF v_member_count = 1 THEN
      -- Cannot leave as the last member (must delete instead)
      RETURN json_build_object('success', false, 'message', 'You are the only member. You must delete the campaign instead of leaving.');
    ELSE
      -- Find next oldest member (earliest joined_at)
      SELECT user_id INTO v_next_owner FROM public.campaign_members 
      WHERE campaign_id = p_campaign_id AND user_id != p_user_id
      ORDER BY joined_at ASC LIMIT 1;
      
      IF v_next_owner IS NOT NULL THEN
        -- Promote new owner
        UPDATE public.campaign_members SET role = 'owner' WHERE campaign_id = p_campaign_id AND user_id = v_next_owner;
        -- Update campaign record
        UPDATE public.campaigns SET user_id = v_next_owner WHERE id = p_campaign_id;
      END IF;
    END IF;
  END IF;

  -- 3. Remove the user
  DELETE FROM public.campaign_members WHERE campaign_id = p_campaign_id AND user_id = p_user_id;

  RETURN json_build_object('success', true, 'message', 'Successfully left campaign');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
