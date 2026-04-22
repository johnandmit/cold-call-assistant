import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import { parse } from 'csv-parse/sync';

const supabase = createClient(
  'https://sgqfeificdzovtpelagf.supabase.co', 
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNncWZlaWZpY2R6b3Z0cGVsYWdmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzMTc5NzIsImV4cCI6MjA5MTg5Mzk3Mn0.EbeXsiYCZl8YVo4X5yYD676Wmb0mjxPaagfz71F5wk8'
);

// We need a valid v4 UUID generator to mock the CsvManager
function v4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function testPushCSV() {
  try {
    const csvContent = fs.readFileSync('c:\\Users\\johna\\Downloads\\contacts-2026-04-10 (9).csv', 'utf8');
    const records = parse(csvContent, { columns: true, skip_empty_lines: true });
    
    // Very basic mapping (assuming 'name' and 'phone' headers exist or something similar)
    // We just want to see if any field causes a postgres error
    const contacts = records.map(record => {
      return {
        id: v4(),
        campaign_id: 'fca8bc1c-de10-448b-b5cc-e5f8202438aa', // Default campaign
        user_id: '1672d40c-50a2-4937-b82e-5e0f16e03e75',
        name: record['Client Name'] || record['Name'] || record['name'] || 'Unknown',
        phone: record['Phone'] || record['phone'] || '',
        category: record['Category'] || record['category'] || '',
        // mock the rest
      };
    });

    console.log(`Processing ${contacts.length} contacts from CSV...`);
    
    const { data, error } = await supabase.from('contacts').upsert(contacts.slice(0, 100), { onConflict: 'id' });
    console.log('Result for first 100 CSV items:');
    console.log(JSON.stringify({data, error}, null, 2));

  } catch (e) {
    console.error('Error reading/parsing CSV:', e.message);
  }
}

testPushCSV();
