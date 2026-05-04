
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const supabase = createClient(
  'https://rmohexwayuazhoiocrcn.supabase.co',
  'sb_publishable_lOfzkbcOAZNDSnKOLiEgPg_1_B0yAvi'
);

function normalize(str) {
  if (!str) return '';
  return str.toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u00a0/g, ' ')
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, ' ')
    .trim();
}

async function run() {
  console.log("Fetching current patients and unlinked appointments...");
  const { data: patients } = await supabase.from('patients').select('id, first_name, last_name');
  const { data: appointments } = await supabase.from('appointments').select('id, patient_name').is('patient_id', null);

  const patientMap = patients.map(p => ({
    id: p.id,
    fullName: `${p.first_name} ${p.last_name}`,
    norm: normalize(`${p.first_name} ${p.last_name}`)
  }));

  // 1. Process filenames in scans folder
  const scanDir = 'c:/Users/ttorr/OneDrive/Escritorio/app_proyecta/scans';
  const scanFiles = fs.readdirSync(scanDir).filter(f => f.endsWith('.pdf'));
  
  for (const file of scanFiles) {
    const fullName = file.replace('.pdf', '').trim();
    const normName = normalize(fullName);
    
    let patient = patientMap.find(p => p.norm === normName);
    
    if (!patient) {
      console.log(`Creating patient from scan: ${fullName}`);
      const parts = fullName.split(' ');
      const firstName = parts[0];
      const lastName = parts.slice(1).join(' ');
      
      const { data: newPatient, error } = await supabase
        .from('patients')
        .insert([{ 
            first_name: firstName, 
            last_name: lastName || '',
            birth_date: '1900-01-01'
        }])
        .select()
        .single();
        
      if (!error && newPatient) {
        patient = {
          id: newPatient.id,
          fullName: `${newPatient.first_name} ${newPatient.last_name}`,
          norm: normalize(`${newPatient.first_name} ${newPatient.last_name}`)
        };
        patientMap.push(patient);
      }
    }
  }

  // 2. Manual Mappings
  const manualMappings = {
    "gabriel montedeva": "gabriel bouzo rodriguez",
    "ian aacc": "ian gonzalez castro",
    "ian gonzalez aacc": "ian gonzalez castro",
    "daniel sakina": "daniel rezaei",
    "marina rotacismo": "marina magdaleno cuevas",
    "malik tea": "malik"
  };

  // 3. Link
  let linkedCount = 0;
  for (const appt of appointments) {
    if (!appt.patient_name) continue;
    
    const cleanName = appt.patient_name.split('(')[0].trim();
    let apptNorm = normalize(cleanName);
    
    // Check manual mappings first
    if (manualMappings[apptNorm]) {
        apptNorm = manualMappings[apptNorm];
    }

    let match = patientMap.find(p => p.norm === apptNorm);

    // Try token match
    if (!match) {
        const apptTokens = apptNorm.split(' ').filter(t => t.length > 2);
        const candidates = patientMap.filter(p => {
            const pTokens = p.norm.split(' ').filter(t => t.length > 2);
            let intersection = 0;
            apptTokens.forEach(t => { if (pTokens.includes(t)) intersection++; });
            // For Malik, allow single word match
            if (apptNorm === "malik" && pTokens.includes("malik")) return true;
            return intersection >= 2 && intersection >= apptTokens.length - 1;
        });
        if (candidates.length === 1) match = candidates[0];
    }

    if (match) {
      console.log(`Linking: "${appt.patient_name}" -> ${match.fullName}`);
      const { error } = await supabase.from('appointments').update({ patient_id: match.id }).eq('id', appt.id);
      if (!error) linkedCount++;
    }
  }

  console.log(`\nFINISHED! Linked ${linkedCount} appointments.`);
}

run();
