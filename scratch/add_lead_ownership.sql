-- Add lead ownership columns to contacts table
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS assigned_user_id UUID REFERENCES auth.users(id);
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS assigned_user_email TEXT;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS assigned_user_name TEXT;

-- Update RLS if necessary (though the existing campaign-based RLS should cover visibility,
-- we might want to eventually add specific protections for 'assigned_user_id')
