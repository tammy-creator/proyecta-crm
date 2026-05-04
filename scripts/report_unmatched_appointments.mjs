import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';
import fs from 'fs';

const supabaseUrl = 'https://rmohexwayuazhoiocrcn.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJtb2hleHdheXVhemhvaW9jcmNuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTQ5MDk5MiwiZXhwIjoyMDg3MDY2OTkyfQ.zjHYOxmp-NkXLqjtR17nBmCYSbL8UGfl9bW2HZNMDeQ';
const supabase = createClient(supabaseUrl, supabaseKey);

const normalizeString = (str) => {
    if (str === null || str === undefined) return '';
    const s = String(str);
    return s.toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, ' ')
        .trim();
};

async function reportUnmatched() {
    console.log("🔍 Generando reporte de citas no asignadas...");

    const { data: patients } = await supabase.from('patients').select('id, first_name, last_name');
    const patientMap = patients.map(p => ({
        fullName: normalizeString(`${p.first_name} ${p.last_name}`),
        firstName: normalizeString(p.first_name),
        lastName: normalizeString(p.last_name)
    }));

    const workbook = XLSX.readFile('citas_pacientes.csv');
    const rawData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);

    const todayISO = new Date().toISOString().split('T')[0];
    const unmatched = [];

    for (const row of rawData) {
        const firstNameDoc = row['first name'];
        const lastNameDoc = row['last name'];
        const startTimeStr = row['start time'];
        const serviceRaw = row['service'] || '';

        if (!startTimeStr) continue;

        // Solo reportar de hoy en adelante
        let startTime;
        if (startTimeStr instanceof Date) {
            startTime = startTimeStr.toISOString().split('T')[0];
        } else if (typeof startTimeStr === 'string') {
            const parts = startTimeStr.split(' ');
            if (parts.length < 1) continue;
            const [day, month, year] = parts[0].split('/');
            startTime = `${year}-${month}-${day}`;
        } else {
            continue;
        }
        if (startTime < todayISO) continue;

        const isBlocked = normalizeString(firstNameDoc).includes('reunion') || 
                          normalizeString(firstNameDoc).includes('coordinacion') ||
                          normalizeString(firstNameDoc).includes('bloqueo') ||
                          normalizeString(serviceRaw).includes('reunion') ||
                          normalizeString(serviceRaw).includes('coordinacion');

        if (isBlocked) continue; // Los bloqueos no necesitan paciente

        const fullNameDoc = normalizeString(`${firstNameDoc} ${lastNameDoc}`);
        let pMatch = patientMap.find(p => p.fullName === fullNameDoc);
        if (!pMatch) {
            const firstSurnameDoc = normalizeString(lastNameDoc).split(' ')[0];
            const candidates = patientMap.filter(p => p.firstName === normalizeString(firstNameDoc) && p.lastName.split(' ')[0] === firstSurnameDoc);
            if (candidates.length === 1) pMatch = candidates[0];
        }

        if (!pMatch) {
            unmatched.push({
                fecha: startTimeStr,
                paciente: `${firstNameDoc} ${lastNameDoc}`,
                servicio: serviceRaw
            });
        }
    }

    let report = "Fecha;Paciente en Doctoralia;Servicio\n";
    unmatched.forEach(u => {
        report += `${u.fecha};${u.paciente};${u.servicio}\n`;
    });

    fs.writeFileSync('citas_no_asignadas.csv', '\uFEFF' + report, 'utf8');
    console.log(`\n📄 Reporte generado: 'citas_no_asignadas.csv' con ${unmatched.length} citas sin paciente.`);
    
    // Mostrar los primeros 10 en consola
    if (unmatched.length > 0) {
        console.log("\nPrimeros casos encontrados:");
        unmatched.slice(0, 10).forEach(u => console.log(`- ${u.fecha}: ${u.paciente}`));
    }
}

reportUnmatched().catch(console.error);
