import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';

const supabaseUrl = 'https://rmohexwayuazhoiocrcn.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJtb2hleHdheXVhemhvaW9jcmNuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTQ5MDk5MiwiZXhwIjoyMDg3MDY2OTkyfQ.zjHYOxmp-NkXLqjtR17nBmCYSbL8UGfl9bW2HZNMDeQ';
const supabase = createClient(supabaseUrl, supabaseKey);

const normalizeString = (str) => {
    if (!str) return '';
    const n = str.toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();
    return n;
};

async function diagnose() {
    const { data: dbPatients } = await supabase.from('patients').select('first_name, last_name').ilike('first_name', 'Xiel%');
    const dbXiel = dbPatients[0];
    const dbFullName = `${dbXiel.first_name} ${dbXiel.last_name}`;
    const dbNorm = normalizeString(dbFullName);

    const workbook = XLSX.readFile('Historial_Pacientes.csv');
    const rawData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
    const docXielRow = rawData.find(r => r['first name'] === 'Xiel');
    const docFullName = `${docXielRow['first name']} ${docXielRow['last name']}`;
    const docNorm = normalizeString(docFullName);

    console.log(`DB Raw: "${dbFullName}"`);
    console.log(`DB Norm: "${dbNorm}"`);
    console.log(`Doc Raw: "${docFullName}"`);
    console.log(`Doc Norm: "${docNorm}"`);
    console.log(`Match? ${dbNorm === docNorm}`);

    // Si no coinciden, ver códigos de caracteres
    if (dbNorm !== docNorm) {
        console.log("DB Chars:", [...dbNorm].map(c => c.charCodeAt(0)));
        console.log("Doc Chars:", [...docNorm].map(c => c.charCodeAt(0)));
    }
}

diagnose().catch(console.error);
