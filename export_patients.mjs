
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const supabase = createClient(
  'https://rmohexwayuazhoiocrcn.supabase.co',
  'sb_publishable_lOfzkbcOAZNDSnKOLiEgPg_1_B0yAvi'
);

async function exportPatients() {
  console.log("Fetching patients...");
  const { data, error } = await supabase.from('patients').select('*');
  
  if (error) {
    console.error("Error fetching patients:", error);
    return;
  }

  if (!data || data.length === 0) {
    console.log("No patients found.");
    return;
  }

  const headers = Object.keys(data[0]);
  const rows = data.map(row => {
    return headers.map(header => {
      let val = row[header];
      if (val === null || val === undefined) return '';
      // Convert to string and escape quotes
      let strVal = String(val).replace(/"/g, '""');
      // Wrap in quotes if it contains separator or newline
      if (strVal.includes(';') || strVal.includes('\n') || strVal.includes('\r')) {
        return `"${strVal}"`;
      }
      return strVal;
    }).join(';');
  });

  const csvContent = [headers.join(';'), ...rows].join('\n');
  
  // Use BOM for Excel compatibility with UTF-8
  fs.writeFileSync('export_pacientes_completo.csv', '\uFEFF' + csvContent, 'utf8');
  console.log(`✅ Exportación completada: ${data.length} pacientes guardados en 'export_pacientes_completo.csv'`);
}

exportPatients();
