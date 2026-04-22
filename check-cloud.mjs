import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://sgqfeificdzovtpelagf.supabase.co', 
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNncWZlaWZpY2R6b3Z0cGVsYWdmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzMTc5NzIsImV4cCI6MjA5MTg5Mzk3Mn0.EbeXsiYCZl8YVo4X5yYD676Wmb0mjxPaagfz71F5wk8'
);

async function checkCloud() {
  const { count: campaignsCount } = await supabase.from('campaigns').select('*', { count: 'exact', head: true });
  console.log('Campaigns Count:', campaignsCount);
  
  const { data: contacts } = await supabase.from('contacts').select('id, name, campaign_id, user_id');
  console.log(`Contacts in Cloud: ${contacts?.length || 0}`);
  if (contacts?.length > 0) {
    console.log('First few contacts:', contacts.slice(0, 3));
  }
}

checkCloud();
