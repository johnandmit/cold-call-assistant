-- Contact Lock Table: phone-based locking for multi-user collision prevention
-- This is a separate table because locks are ephemeral and phone-based,
-- not tied to any specific contact row (since users may have different IDs for the same lead).

CREATE TABLE IF NOT EXISTS public.contact_locks (
  phone TEXT PRIMARY KEY,
  locked_by UUID NOT NULL,
  locked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Allow all authenticated users to read/write locks
ALTER TABLE public.contact_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read locks" ON public.contact_locks
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can insert locks" ON public.contact_locks
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update their own locks" ON public.contact_locks
  FOR UPDATE USING (true);

CREATE POLICY "Users can delete their own locks" ON public.contact_locks
  FOR DELETE USING (locked_by = auth.uid());
