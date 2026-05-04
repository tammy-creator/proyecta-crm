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
        .replace(/\s+/g, ' ') // Convertir múltiples espacios en uno solo
        .trim();
};

async function getUnmatchedPatients() {
    console.log("🔍 Buscando pacientes del historial que no están registrados (Versión Fuzzy)...");

    // 1. Obtener pacientes actuales
    const { data: patients, error: pError } = await supabase.from('patients').select('first_name, last_name');
    if (pError) throw pError;
    
    // Mapeos manuales solicitados por el usuario
    const manualOverrides = {
        "carmen laura": "jorge abol",
        "daniel (sakina)": "daniel rezaei",
        "esteba pablo": "esteban pablo gomez reyes",
        "valeria sensible": "valeria huertas",
        "ian gonzalez aacc": "ian gonzalez castro",
        "alex riesgo": "alex riesgo rodriguez",
        "cecilia": "cecilia suarez ramon",
        "malik tea": "malik malaika",
        "max ruth": "maximiliano",
        "ruth tomescu": "ruth ilalla tomescu",
        "dylan fernando reyes reyes": "dylan reyes reyes",
        "ianna": "ianna silvestre",
        "christabel giegbefumwen omoruyi": "christabel g-omoruyi"
    };

    const patientMap = patients.map(p => ({
        fullName: normalizeString(`${p.first_name} ${p.last_name}`),
        firstName: normalizeString(p.first_name),
        lastName: normalizeString(p.last_name)
    }));

    // 2. Leer Excel
    const workbook = XLSX.readFile('Historial_Pacientes.csv');
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json(worksheet);

    const unmatched = new Set();
    const unmatchedDetails = {}; 

    for (const row of rawData) {
        const firstNameDoc = row['first name'];
        const lastNameDoc = row['last name'];
        const fullNameRaw = `${firstNameDoc} ${lastNameDoc}`;
        if (fullNameRaw.trim() === "undefined undefined") continue;

        const fullNameDoc = normalizeString(fullNameRaw);
        const firstNameNorm = normalizeString(firstNameDoc);
        const firstSurnameDoc = normalizeString(lastNameDoc).split(' ')[0];

        // Mismo algoritmo que el importador
        let matched = !!manualOverrides[fullNameDoc];

        if (!matched) {
            matched = patientMap.some(p => p.fullName === fullNameDoc);
        }

        if (!matched && firstNameNorm.length > 2) {
            matched = patientMap.some(p => {
                const nameMatch = p.firstName === firstNameNorm;
                if (!nameMatch) return false;
                const dbLastName = p.lastName;
                const docLastName = normalizeString(lastNameDoc);
                return dbLastName.includes(docLastName) || docLastName.includes(dbLastName);
            });
        }

        if (!matched && firstNameNorm.length > 2 && firstSurnameDoc.length > 2) {
            const candidates = patientMap.filter(p => {
                const nameMatch = p.firstName === firstNameNorm;
                if (!nameMatch) return false;
                const dbFirstSurname = p.lastName.split(' ')[0];
                return dbFirstSurname === firstSurnameDoc;
            });
            if (candidates.length === 1) matched = true;
        }

        if (!matched) {
            unmatched.add(fullNameRaw);
            unmatchedDetails[fullNameRaw] = (unmatchedDetails[fullNameRaw] || 0) + 1;
        }
    }

    const sortedUnmatched = Array.from(unmatched).sort();
    
    let report = "Nombre en Historial Doctoralia;Cantidad de Notas\n";
    sortedUnmatched.forEach(name => {
        if (!name.toLowerCase().includes("trabajo no asistencial") && !name.toLowerCase().includes("historias clinicas")) {
            report += `${name};${unmatchedDetails[name]}\n`;
        }
    });

    fs.writeFileSync('pacientes_historial_no_encontrados.csv', '\uFEFF' + report, 'utf8');
    console.log("\n📄 Se ha regenerado 'pacientes_historial_no_encontrados.csv' con lógica sincronizada.");
}

getUnmatchedPatients().catch(console.error);
