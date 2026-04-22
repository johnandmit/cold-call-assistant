import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function checkCampaignHealth() {
  console.log('Checking campaign ownership health...');
  
  // 1. Get all campaigns
  const { data: campaigns, error: campErr } = await supabase.from('campaigns').select('id, name, user_id');
  if (campErr) return console.error('Error fetching campaigns:', campErr);

  for (const c of campaigns) {
    // 2. Check if there is an owner in campaign_members
    const { data: members, error: memErr } = await supabase
      .from('campaign_members')
      .select('user_id, role, joined_at')
      .eq('campaign_id', c.id);
    
    if (memErr) {
      console.error(`Error fetching members for ${c.name}:`, memErr);
      continue;
    }

    const owner = members.find(m => m.role === 'owner');
    if (!owner) {
      console.warn(`⚠️ Campaign "${c.name}" (${c.id}) HAS NO OWNER!`);
      console.log('Members:', members);
    } else {
      console.log(`✅ Campaign "${c.name}" has owner: ${owner.user_id}`);
    }
  }
}

checkCampaignHealth();
