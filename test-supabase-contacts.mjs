import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://sgqfeificdzovtpelagf.supabase.co', 
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNncWZlaWZpY2R6b3Z0cGVsYWdmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzMTc5NzIsImV4cCI6MjA5MTg5Mzk3Mn0.EbeXsiYCZl8YVo4X5yYD676Wmb0mjxPaagfz71F5wk8'
);

import fs from 'fs';

async function testPush() {
  console.log('Testing push of a contact with the correct schema format');
  
  // Try inserting a valid contact with a valid campaign_id that we know exists
  // fca8bc1c-de10-448b-b5cc-e5f8202438aa
  
  const contact = {
    id: crypto.randomUUID(),
    campaign_id: 'fca8bc1c-de10-448b-b5cc-e5f8202438aa',
    user_id: '1672d40c-50a2-4937-b82e-5e0f16e03e75',
    name: 'Real Test Contact',
    phone: '+1234567890',
  };

  const { data, error } = await supabase.from('contacts').upsert([contact], { onConflict: 'id' });
  console.log('Valid campaign contact Result:');
  console.log(JSON.stringify({data, error}, null, 2));
}

testPush();
