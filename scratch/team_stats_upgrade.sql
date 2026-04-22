-- team_stats_upgrade.sql
-- Run this in your Supabase SQL Editor to enable detailed performance tracking.

CREATE OR REPLACE FUNCTION public.get_campaign_members_with_stats(p_campaign_id UUID)
RETURNS TABLE (
  id UUID,
  email TEXT,
  role TEXT,
  joined_at TIMESTAMP WITH TIME ZONE,
  last_active TIMESTAMP WITH TIME ZONE,
  total_calls BIGINT,
  success_count BIGINT,
  avg_rating NUMERIC,
  outcomes JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    m.user_id as id,
    m.email,
    m.role,
    m.joined_at,
    m.last_active,
    COUNT(c.id) as total_calls,
    COUNT(c.id) FILTER (WHERE c.call_success = true) as success_count,
    ROUND(AVG(c.call_rating) FILTER (WHERE c.call_rating > 0), 1) as avg_rating,
    (
      SELECT jsonb_object_agg(action, count)
      FROM (
        SELECT action, COUNT(*) as count
        FROM public.calls sub_c, unnest(sub_c.actions_taken) action
        WHERE sub_c.user_id = m.user_id AND sub_c.campaign_id = p_campaign_id
        GROUP BY action
      ) sub
    ) as outcomes
  FROM public.campaign_member_details m
  LEFT JOIN public.calls c ON c.user_id = m.user_id AND c.campaign_id = p_campaign_id
  WHERE m.campaign_id = p_campaign_id
  GROUP BY m.user_id, m.email, m.role, m.joined_at, m.last_active;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
