
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const supabase = createClient(
  'https://rmohexwayuazhoiocrcn.supabase.co',
  'sb_publishable_lOfzkbcOAZNDSnKOLiEgPg_1_B0yAvi'
);

async function run() {
  const { data: appointments } = await supabase
    .from('appointments')
    .select('patient_name, start_time')
    .is('patient_id', null);

  const g = {};
  appointments.forEach(a => {
    if (!g[a.patient_name]) g[a.patient_name] = { count: 0, date: a.start_time };
    g[a.patient_name].count++;
    if (a.start_time < g[a.patient_name].date) g[a.patient_name].date = a.start_time;
  });

  const list = Object.entries(g)
    .sort((a, b) => b[1].count - a[1].count)
    .map(([name, info]) => ({
      name,
      count: info.count,
      firstDate: info.date
    }));

  fs.writeFileSync('final_unlinked.json', JSON.stringify(list, null, 2), 'utf8');
  console.log(`Saved ${list.length} unique names.`);
}

run();
