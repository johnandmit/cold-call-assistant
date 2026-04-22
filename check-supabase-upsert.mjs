import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient('https://sgqfeificdzovtpelagf.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNncWZlaWZpY2R6b3Z0cGVsYWdmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzMTc5NzIsImV4cCI6MjA5MTg5Mzk3Mn0.EbeXsiYCZl8YVo4X5yYD676Wmb0mjxPaagfz71F5wk8');

async function check() {
  const { data, error } = await supabase.from('contacts').upsert({ id: crypto.randomUUID(), name: 'Test Contact', phone: '123', user_id: 'test' }, { onConflict: 'id' });
  console.log('Upsert Result:');
  console.log(JSON.stringify({data, error}, null, 2));
}

check();
