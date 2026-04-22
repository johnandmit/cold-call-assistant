-- ============================================================
-- FULL_DATABASE_RESET.sql
-- 
-- COMPLETE Supabase database setup for the Cold Call Assistant.
-- Run this ONCE in your Supabase SQL Editor (Dashboard > SQL Editor).
--
-- This script is IDEMPOTENT — safe to run multiple times.
-- It will create missing tables, add missing columns, fix all
-- RLS policies, create all required functions/triggers, and
-- enable Realtime replication.
-- ============================================================


-- ============================================================
-- STEP 1: CORE TABLES
-- ============================================================

-- 1a. Profiles (must exist before campaigns reference it)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  full_name TEXT,
  last_active TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 1b. Campaigns
CREATE TABLE IF NOT EXISTS public.campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#6366f1',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

-- 1c. Campaign Members (sharing pivot table)
CREATE TABLE IF NOT EXISTS public.campaign_members (
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, user_id)
);
ALTER TABLE public.campaign_members ENABLE ROW LEVEL SECURITY;

-- 1d. Folders
CREATE TABLE IF NOT EXISTS public.folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;

-- 1e. Contacts
CREATE TABLE IF NOT EXISTS public.contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

-- 1f. Calls
CREATE TABLE IF NOT EXISTS public.calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  contact_id TEXT,
  contact_name TEXT,
  started_at TIMESTAMP WITH TIME ZONE,
  ended_at TIMESTAMP WITH TIME ZONE,
  duration_seconds INTEGER DEFAULT 0,
  transcript TEXT,
  recording_filename TEXT,
  recording_drive_url TEXT,
  notes TEXT,
  actions_taken JSONB DEFAULT '[]'::jsonb,
  call_rating INTEGER DEFAULT 0,
  call_success BOOLEAN,
  session_id TEXT,
  category TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;

-- 1g. Sessions
CREATE TABLE IF NOT EXISTS public.sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT,
  started_at TIMESTAMP WITH TIME ZONE,
  ended_at TIMESTAMP WITH TIME ZONE,
  calls_made INTEGER DEFAULT 0,
  outcomes JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- STEP 2: ADD MISSING COLUMNS (safe — skips if already present)
-- ============================================================

-- Campaigns
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES public.folders(id) ON DELETE SET NULL;

-- Contacts — every column the app pushes
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS google_maps_url TEXT;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS rating NUMERIC DEFAULT 0;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS review_count INTEGER DEFAULT 0;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS conversion_confidence_score NUMERIC DEFAULT 0;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS outreach_tier INTEGER DEFAULT 3;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS average_urgency TEXT;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS opening_hours TEXT;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS called BOOLEAN DEFAULT false;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS call_date TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS call_recording_drive_url TEXT;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS not_interested BOOLEAN DEFAULT false;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS follow_up_date TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS call_outcome TEXT;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS suppressed_until TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS hidden_from_queue BOOLEAN DEFAULT false;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS last_called_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS assigned_user_id UUID REFERENCES auth.users(id);
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS assigned_user_email TEXT;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS assigned_user_name TEXT;

-- Profiles — add full_name if missing
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name TEXT;


-- ============================================================
-- STEP 3: INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_contacts_campaign_id ON public.contacts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON public.contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON public.contacts(phone);
CREATE INDEX IF NOT EXISTS idx_calls_campaign_id ON public.calls(campaign_id);
CREATE INDEX IF NOT EXISTS idx_calls_user_id ON public.calls(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_campaign_id ON public.sessions(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_members_user_id ON public.campaign_members(user_id);


-- ============================================================
-- STEP 4: UNIQUE CONSTRAINT — One owner per campaign
-- ============================================================

-- Drop the old index first to avoid errors
DROP INDEX IF EXISTS one_owner_per_campaign;
CREATE UNIQUE INDEX one_owner_per_campaign ON public.campaign_members (campaign_id) WHERE (role = 'owner');


-- ============================================================
-- STEP 5: RLS POLICIES (Drop all old ones first, then recreate)
-- ============================================================

-- ---- Profiles ----
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Public profiles are viewable by everyone" ON public.profiles
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (id = auth.uid());

-- ---- Campaign Members ----
DROP POLICY IF EXISTS "Users can see their own memberships" ON public.campaign_members;
CREATE POLICY "Users can see their own memberships" ON public.campaign_members
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert themselves into a campaign" ON public.campaign_members;
CREATE POLICY "Users can insert themselves into a campaign" ON public.campaign_members
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Owners can update member roles" ON public.campaign_members;
CREATE POLICY "Owners can update member roles" ON public.campaign_members
  FOR UPDATE USING (
    user_id = auth.uid()
    OR campaign_id IN (SELECT id FROM public.campaigns WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Members can delete own membership" ON public.campaign_members;
CREATE POLICY "Members can delete own membership" ON public.campaign_members
  FOR DELETE USING (user_id = auth.uid());

-- ---- Campaigns ----
DROP POLICY IF EXISTS "Members can read campaigns" ON public.campaigns;
CREATE POLICY "Members can read campaigns" ON public.campaigns
  FOR SELECT USING (
    id IN (SELECT campaign_id FROM public.campaign_members WHERE user_id = auth.uid())
    OR user_id = auth.uid()
  );

DROP POLICY IF EXISTS "Users can create their own campaigns" ON public.campaigns;
CREATE POLICY "Users can create their own campaigns" ON public.campaigns
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Members can update campaigns" ON public.campaigns;
CREATE POLICY "Members can update campaigns" ON public.campaigns
  FOR UPDATE USING (
    id IN (SELECT campaign_id FROM public.campaign_members WHERE user_id = auth.uid())
    OR user_id = auth.uid()
  );

DROP POLICY IF EXISTS "Owners can delete their own campaigns" ON public.campaigns;
CREATE POLICY "Owners can delete their own campaigns" ON public.campaigns
  FOR DELETE USING (auth.uid() = user_id);

-- ---- Contacts ----
DROP POLICY IF EXISTS "Campaign group access - Contacts" ON public.contacts;
DROP POLICY IF EXISTS "Members can select contacts" ON public.contacts;
DROP POLICY IF EXISTS "Members can insert contacts" ON public.contacts;
DROP POLICY IF EXISTS "Members can update contacts" ON public.contacts;
DROP POLICY IF EXISTS "Members can delete contacts" ON public.contacts;

CREATE POLICY "Campaign group access - Contacts" ON public.contacts
  FOR ALL USING (
    campaign_id IN (SELECT campaign_id FROM public.campaign_members WHERE user_id = auth.uid())
  )
  WITH CHECK (
    campaign_id IN (SELECT campaign_id FROM public.campaign_members WHERE user_id = auth.uid())
  );

-- ---- Calls ----
DROP POLICY IF EXISTS "Campaign group access - Calls" ON public.calls;

CREATE POLICY "Campaign group access - Calls" ON public.calls
  FOR ALL USING (
    campaign_id IN (SELECT campaign_id FROM public.campaign_members WHERE user_id = auth.uid())
  )
  WITH CHECK (
    campaign_id IN (SELECT campaign_id FROM public.campaign_members WHERE user_id = auth.uid())
  );

-- ---- Sessions ----
DROP POLICY IF EXISTS "Campaign group access - Sessions" ON public.sessions;

CREATE POLICY "Campaign group access - Sessions" ON public.sessions
  FOR ALL USING (
    campaign_id IN (SELECT campaign_id FROM public.campaign_members WHERE user_id = auth.uid())
  )
  WITH CHECK (
    campaign_id IN (SELECT campaign_id FROM public.campaign_members WHERE user_id = auth.uid())
  );

-- ---- Folders ----
DROP POLICY IF EXISTS "Users can manage their own folders" ON public.folders;
CREATE POLICY "Users can manage their own folders" ON public.folders
  FOR ALL USING (user_id = auth.uid());


-- ============================================================
-- STEP 6: TRIGGERS & FUNCTIONS
-- ============================================================

-- 6a. Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (new.id, new.email, COALESCE(new.raw_user_meta_data->>'full_name', ''))
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill existing users who might not have profiles
INSERT INTO public.profiles (id, email)
SELECT id, email FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- 6b. Single-owner enforcement trigger
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

-- 6c. ensure_campaign_membership (used by the app)
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

-- 6d. repair_campaign_admin_status (called on pull)
CREATE OR REPLACE FUNCTION public.repair_campaign_admin_status()
RETURNS JSON AS $$
DECLARE
  v_campaign RECORD;
  v_oldest_member UUID;
  v_count INT := 0;
BEGIN
  FOR v_campaign IN
    SELECT c.id, c.name, c.user_id as authoritative_owner
    FROM public.campaigns c
    WHERE NOT EXISTS (
      SELECT 1 FROM public.campaign_members cm
      WHERE cm.campaign_id = c.id AND cm.role = 'owner'
    )
  LOOP
    UPDATE public.campaign_members
    SET role = 'owner'
    WHERE campaign_id = v_campaign.id AND user_id = v_campaign.authoritative_owner;

    IF NOT FOUND THEN
      SELECT user_id INTO v_oldest_member
      FROM public.campaign_members
      WHERE campaign_id = v_campaign.id
      ORDER BY joined_at ASC
      LIMIT 1;

      IF v_oldest_member IS NOT NULL THEN
        UPDATE public.campaign_members SET role = 'owner'
          WHERE campaign_id = v_campaign.id AND user_id = v_oldest_member;
        UPDATE public.campaigns SET user_id = v_oldest_member WHERE id = v_campaign.id;
      END IF;
    END IF;

    v_count := v_count + 1;
  END LOOP;

  UPDATE public.campaigns c
  SET user_id = cm.user_id
  FROM public.campaign_members cm
  WHERE c.id = cm.campaign_id AND cm.role = 'owner' AND c.user_id != cm.user_id;

  RETURN json_build_object('success', true, 'repaired_count', v_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6e. handle_member_leave (with ownership succession)
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
  SELECT role INTO v_role FROM public.campaign_members
  WHERE campaign_id = p_campaign_id AND user_id = p_user_id;

  IF v_role IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'User is not a member');
  END IF;

  SELECT count(*) INTO v_member_count FROM public.campaign_members WHERE campaign_id = p_campaign_id;

  IF v_role = 'owner' THEN
    IF v_member_count = 1 THEN
      RETURN json_build_object('success', false, 'message', 'You are the only member. Delete the campaign instead.');
    ELSE
      SELECT user_id INTO v_next_owner FROM public.campaign_members
      WHERE campaign_id = p_campaign_id AND user_id != p_user_id
      ORDER BY joined_at ASC LIMIT 1;

      IF v_next_owner IS NOT NULL THEN
        UPDATE public.campaign_members SET role = 'owner' WHERE campaign_id = p_campaign_id AND user_id = v_next_owner;
        UPDATE public.campaigns SET user_id = v_next_owner WHERE id = p_campaign_id;
      END IF;
    END IF;
  END IF;

  DELETE FROM public.campaign_members WHERE campaign_id = p_campaign_id AND user_id = p_user_id;
  RETURN json_build_object('success', true, 'message', 'Left campaign');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- STEP 7: VIEWS (used by the app)
-- ============================================================

DROP VIEW IF EXISTS public.campaign_member_details;
CREATE VIEW public.campaign_member_details AS
SELECT
  cm.campaign_id,
  cm.user_id,
  cm.role,
  cm.joined_at,
  p.email,
  p.last_active
FROM public.campaign_members cm
JOIN public.profiles p ON cm.user_id = p.id;

-- get_campaign_members_with_stats RPC
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


-- ============================================================
-- STEP 8: BACKFILL — Ensure existing campaign owners have memberships
-- ============================================================

INSERT INTO public.campaign_members (campaign_id, user_id, role)
SELECT id, user_id, 'owner' FROM public.campaigns
ON CONFLICT (campaign_id, user_id) DO UPDATE SET role = 'owner';


-- ============================================================
-- STEP 9: REALTIME REPLICATION
-- Enable Realtime on the tables the app subscribes to.
-- ============================================================

-- This uses the supabase_realtime publication.
-- We add all relevant tables to it (ignore errors if already added).
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.contacts; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.calls; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.sessions; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.campaign_members; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.campaigns; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;


-- ============================================================
-- DONE! Your database is now fully configured.
-- 
-- After running this:
-- 1. Log out and back in on your cold call app
-- 2. Upload your CSV file again
-- 3. The other account should see the contacts immediately
-- ============================================================
