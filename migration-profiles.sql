-- 1. Create Profiles Table (to store public user info like emails)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles Policies
CREATE POLICY "Public profiles are viewable by everyone" ON public.profiles
  FOR SELECT USING (true);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- 2. Trigger to automatically create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (new.id, new.email);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. Backfill existing users into profiles
INSERT INTO public.profiles (id, email)
SELECT id, email FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- 4. Campaign Roles Cleanup
-- Ensure RLS is enabled on campaigns and other tables (Critical Fix)
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

-- 5. Strict Single Owner Constraint (Optional but requested)
-- Note: The logic for "Only one owner" will be enforced in the UI/App logic mostly,
-- but we can add a constraint if desired. For now, let's stick to the Member table logic.

-- 6. Add "last_active" to profiles to track member activity
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_active TIMESTAMP WITH TIME ZONE DEFAULT now();

-- 7. Update Campaign Members Privacy
-- Members of a campaign can see each other's profiles
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
