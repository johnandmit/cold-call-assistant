import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Manually parse .env.local
let env = {};
try {
  const envContent = fs.readFileSync('.env.local', 'utf8');
  const lines = envContent.split('\n');
  lines.forEach(line => {
    const parts = line.split('=');
    if (parts.length >= 2) {
      env[parts[0].trim()] = parts.slice(1).join('=').trim();
    }
  });
} catch (e) {
  console.error('Failed to read .env.local', e);
}

const supabaseUrl = env['VITE_SUPABASE_URL'];
const supabaseKey = env['VITE_SUPABASE_ANON_KEY'];

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase config');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchema() {
  console.log('--- Checking campaigns ---');
  const { data: cData, error: cError } = await supabase.from('campaigns').select('*').limit(1);
  if (cError) console.error('Campaigns Query failed:', cError.message);
  else if (cData && cData.length > 0) console.log('Campaigns Columns:', Object.keys(cData[0]));
  else console.log('No data in campaigns');

  console.log('\n--- Checking contacts ---');
  const { data: coData, error: coError } = await supabase.from('contacts').select('*').limit(1);
  if (coError) console.error('Contacts Query failed:', coError.message);
  else if (coData && coData.length > 0) console.log('Contacts Columns:', Object.keys(coData[0]));
  else {
      const { error: calledAtError } = await supabase.from('contacts').select('last_called_at').limit(1);
      console.log('Has last_called_at:', !calledAtError);
  }
}

checkSchema();
