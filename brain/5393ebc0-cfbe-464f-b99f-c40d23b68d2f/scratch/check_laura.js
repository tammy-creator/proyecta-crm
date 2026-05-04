import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://rmohexwayuazhoiocrcn.supabase.co',
  'sb_publishable_lOfzkbcOAZNDSnKOLiEgPg_1_B0yAvi'
);

async function checkLaura() {
  const { data, error } = await supabase
    .from('therapists')
    .select('id, full_name, avatar_url')
    .ilike('full_name', '%Laura Chico%');
  
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  console.log('--- LAURA CHICO AVATAR ---');
  console.log(JSON.stringify(data, null, 2));
}

checkLaura();
