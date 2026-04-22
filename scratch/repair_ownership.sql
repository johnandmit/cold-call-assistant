-- repair_ownership.sql
-- Run this in your Supabase SQL Editor to fix any campaigns without an admin.

CREATE OR REPLACE FUNCTION public.repair_campaign_admin_status()
RETURNS JSON AS $$
DECLARE
  v_campaign RECORD;
  v_oldest_member UUID;
  v_count INT := 0;
BEGIN
  -- 1. Find campaigns that have NO owner in the campaign_members table
  FOR v_campaign IN 
    SELECT c.id, c.name, c.user_id as authoritative_owner
    FROM public.campaigns c
    WHERE NOT EXISTS (
      SELECT 1 FROM public.campaign_members cm 
      WHERE cm.campaign_id = c.id AND cm.role = 'owner'
    )
  LOOP
    -- 2. Try to promote the authoritative owner if they are a member
    UPDATE public.campaign_members 
    SET role = 'owner'
    WHERE campaign_id = v_campaign.id AND user_id = v_campaign.authoritative_owner;
    
    -- 3. If still no owner (authoritative owner wasn't a member), find oldest member
    IF NOT FOUND THEN
      SELECT user_id INTO v_oldest_member 
      FROM public.campaign_members 
      WHERE campaign_id = v_campaign.id 
      ORDER BY joined_at ASC 
      LIMIT 1;
      
      IF v_oldest_member IS NOT NULL THEN
        UPDATE public.campaign_members SET role = 'owner' WHERE campaign_id = v_campaign.id AND user_id = v_oldest_member;
        -- Update the campaign table to match this new reality
        UPDATE public.campaigns SET user_id = v_oldest_member WHERE id = v_campaign.id;
      END IF;
    END IF;
    
    v_count := v_count + 1;
  END LOOP;

  -- 4. Final Safety: Ensure any current 'owner' members also match the user_id in the campaigns table
  -- (This fixes the "displaying improperly" case where role is owner but user_id is different)
  UPDATE public.campaigns c
  SET user_id = cm.user_id
  FROM public.campaign_members cm
  WHERE c.id = cm.campaign_id AND cm.role = 'owner' AND c.user_id != cm.user_id;

  RETURN json_build_object('success', true, 'repaired_count', v_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Execute repair immediately
SELECT public.repair_campaign_admin_status();
