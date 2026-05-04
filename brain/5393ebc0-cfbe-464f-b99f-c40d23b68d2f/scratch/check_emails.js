import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://rmohexwayuazhoiocrcn.supabase.co',
  'sb_publishable_lOfzkbcOAZNDSnKOLiEgPg_1_B0yAvi'
);

async function checkEmails() {
  const { data, error } = await supabase
    .from('therapists')
    .select('full_name, email');
  
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  console.log('--- THERAPIST EMAILS ---');
  data.forEach(t => {
    console.log(`${t.full_name}: "${t.email}"`);
  });
}

checkEmails();
