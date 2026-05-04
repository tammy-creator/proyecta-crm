
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const [key, value] = line.split('=');
  if (key && value) env[key.trim()] = value.trim();
});

const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseKey = env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkEverything() {
  console.log('--- CHECKING THERAPISTS TABLE ---');
  const { data: therapists, error: tError } = await supabase.from('therapists').select('*');
  if (tError) console.error('Error therapists:', tError);
  else {
    console.log(`Found ${therapists.length} clinical profiles.`);
    therapists.forEach(t => console.log(`Profile: ${t.full_name} | ID: ${t.id} | Email: ${t.email}`));
  }

  console.log('\n--- CHECKING USER_ACCOUNTS TABLE ---');
  const { data: users, error: uError } = await supabase.from('user_accounts').select('*');
  if (uError) console.error('Error users:', uError);
  else {
    console.log(`Found ${users.length} accounts.`);
    users.forEach(u => console.log(`Account: ${u.full_name} | Role: ${u.role} | Status: ${u.status} | Email: ${u.email}`));
  }

  const missingNames = ['ruth', 'marta'];
  console.log('\n--- SEARCHING FOR RUTH AND MARTA IN BOTH ---');
  if (therapists) {
    therapists.filter(t => missingNames.some(name => t.full_name.toLowerCase().includes(name)))
      .forEach(t => console.log(`FOUND IN THERAPISTS: ${t.full_name}`));
  }
  if (users) {
    users.filter(u => missingNames.some(name => u.full_name.toLowerCase().includes(name)))
      .forEach(u => console.log(`FOUND IN USER_ACCOUNTS: ${u.full_name}`));
  }
}

checkEverything();
