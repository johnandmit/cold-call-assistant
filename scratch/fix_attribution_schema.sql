-- fix_attribution_schema.sql
-- Run this in your Supabase SQL Editor to enable automatic join for user names and emails.

-- 1. Ensure foreign key from sessions to profiles so we can fetch emails
ALTER TABLE public.sessions
DROP CONSTRAINT IF EXISTS sessions_user_id_fkey,
ADD CONSTRAINT sessions_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES public.profiles(id) 
ON DELETE SET NULL;

-- 2. Ensure foreign key from contacts to profiles for lead ownership attribution
ALTER TABLE public.contacts
DROP CONSTRAINT IF EXISTS contacts_assigned_user_id_fkey,
ADD CONSTRAINT contacts_assigned_user_id_fkey 
FOREIGN KEY (assigned_user_id) REFERENCES public.profiles(id) 
ON DELETE SET NULL;

-- 3. Verify relationships
-- After running this, the API can now do:
-- select=*,profiles(email)
