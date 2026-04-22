import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const envContent = readFileSync('.env.local', 'utf8');
const getEnv = (key) => {
  const match = envContent.match(new RegExp(`^${key}=(.+)$`, 'm'));
  return match ? match[1].trim() : '';
};

const supabase = createClient(getEnv('VITE_SUPABASE_URL'), getEnv('VITE_SUPABASE_ANON_KEY'));

async function test() {
  const { data: contacts } = await supabase.from('contacts').select('name, phone').limit(10);
  console.log(JSON.stringify(contacts, null, 2));
}

test().catch(console.error);
