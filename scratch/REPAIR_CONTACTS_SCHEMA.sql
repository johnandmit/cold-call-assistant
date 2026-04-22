-- REPAIR_CONTACTS_SCHEMA.sql
-- Run this in your Supabase SQL Editor to fix CSV upload issues.

-- 1. Ensure the contacts table exists with basic columns
CREATE TABLE IF NOT EXISTS public.contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 2. Add all missing columns used by the app
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

-- 3. Enable RLS
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

-- 4. Recreate Policies to ensure they are correct
DROP POLICY IF EXISTS "Members can select contacts" ON public.contacts;
DROP POLICY IF EXISTS "Members can update contacts" ON public.contacts;
DROP POLICY IF EXISTS "Members can insert contacts" ON public.contacts;
DROP POLICY IF EXISTS "Members can delete contacts" ON public.contacts;
DROP POLICY IF EXISTS "Campaign group access - Contacts" ON public.contacts;

CREATE POLICY "Campaign group access - Contacts" ON public.contacts
FOR ALL USING (
    campaign_id IN (
        SELECT campaign_id FROM public.campaign_members WHERE user_id = auth.uid()
    )
);

-- 5. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_contacts_campaign_id ON public.contacts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON public.contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON public.contacts(phone);
