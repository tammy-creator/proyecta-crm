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

async function importHistory() {
    console.log("🚀 Iniciando importación de historial clínico (Versión Mejorada)...");

    // 1. Obtener todos los pacientes y un terapeuta por defecto
    const { data: patients, error: pError } = await supabase.from('patients').select('id, first_name, last_name');
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

    // Mapeo precocinado para velocidad
    const patientMap = patients.map(p => ({
        id: p.id,
        fullName: normalizeString(`${p.first_name} ${p.last_name}`),
        firstName: normalizeString(p.first_name),
        lastName: normalizeString(p.last_name),
        raw: p
    }));

    const { data: therapists, error: tError } = await supabase.from('therapists').select('id').limit(1);
    if (tError || !therapists || therapists.length === 0) {
        throw new Error("No se encontró ningún terapeuta en la base de datos.");
    }
    const defaultTherapistId = therapists[0].id;
    console.log(`✅ Cargados ${patients.length} pacientes y terapeuta por defecto.`);

    // 2. Leer archivo Excel
    const workbook = XLSX.readFile('Historial_Pacientes.csv');
    const rawData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);

    console.log(`📊 Procesando ${rawData.length} registros del historial...`);

    let importedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    let matchedByFuzzy = 0;

    for (const row of rawData) {
        const firstNameDoc = row['first name'];
        const lastNameDoc = row['last name'];
        const fullNameRawDoc = `${firstNameDoc} ${lastNameDoc}`;
        const fullNameDoc = normalizeString(fullNameRawDoc);
        const firstNameNorm = normalizeString(firstNameDoc);
        
        let matchedPatient = null;

        // Intento 0: Overrides manuales
        if (manualOverrides[fullNameDoc]) {
            const targetName = manualOverrides[fullNameDoc];
            matchedPatient = patientMap.find(p => p.fullName === targetName);
        }

        // Intento 1: Match Exacto (Normalizado)
        if (!matchedPatient) {
            matchedPatient = patientMap.find(p => p.fullName === fullNameDoc);
        }

        // Intento 2: Match Difuso (si no hay match exacto)
        if (!matchedPatient && firstNameNorm.length > 2) {
            // Buscamos si el nombre coincide y el apellido de la DB está contenido en el del historial o viceversa
            matchedPatient = patientMap.find(p => {
                const nameMatch = p.firstName === firstNameNorm;
                if (!nameMatch) return false;
                
                const dbLastName = p.lastName;
                const docLastName = normalizeString(lastNameDoc);
                
                return dbLastName.includes(docLastName) || docLastName.includes(dbLastName);
            });
            
            if (matchedPatient) matchedByFuzzy++;
        }

        // Intento 3: Match por Nombre + Primer Apellido (Solicitado por usuario)
        if (!matchedPatient && firstNameNorm.length > 2) {
            const firstSurnameDoc = normalizeString(lastNameDoc).split(' ')[0];
            
            if (firstSurnameDoc && firstSurnameDoc.length > 2) {
                // Buscamos candidatos que coincidan en Nombre y Primer Apellido
                const candidates = patientMap.filter(p => {
                    const nameMatch = p.firstName === firstNameNorm;
                    if (!nameMatch) return false;
                    
                    const dbFirstSurname = p.lastName.split(' ')[0];
                    return dbFirstSurname === firstSurnameDoc;
                });

                // Solo asignamos si hay un único candidato claro para evitar errores
                if (candidates.length === 1) {
                    matchedPatient = candidates[0];
                    matchedByFuzzy++;
                }
            }
        }

        if (!matchedPatient) {
            skippedCount++;
            continue;
        }

        const patientId = matchedPatient.id;
        const patientRaw = matchedPatient.raw;

        // Convertir fecha de Excel (serial) a ISO
        let dateVal = row['date'];
        let dateObj;
        if (typeof dateVal === 'number') {
            dateObj = new Date((dateVal - 25569) * 86400 * 1000);
        } else {
            dateObj = new Date(dateVal);
        }

        const clinicalNote = row['value'] || '';
        if (!clinicalNote) {
            skippedCount++;
            continue;
        }

        const startTime = new Date(dateObj);
        startTime.setHours(9, 0, 0, 0);
        const endTime = new Date(dateObj);
        endTime.setHours(10, 0, 0, 0);

        // Verificar si ya existe (evitar duplicados si relanzamos el script)
        const { data: existing } = await supabase
            .from('appointments')
            .select('id, session_diary')
            .eq('patient_id', patientId)
            .eq('start_time', startTime.toISOString())
            .limit(1);

        if (existing && existing.length > 0) {
            // Si ya existe pero no tiene diario, se lo ponemos
            if (!existing[0].session_diary) {
                await supabase
                    .from('appointments')
                    .update({ session_diary: clinicalNote })
                    .eq('id', existing[0].id);
                importedCount++;
            } else {
                // Ya estaba importado
                skippedCount++;
            }
        } else {
            // Crear nueva cita
            const { error: iError } = await supabase
                .from('appointments')
                .insert({
                    patient_id: patientId,
                    patient_name: `${patientRaw.first_name} ${patientRaw.last_name}`,
                    therapist_id: defaultTherapistId,
                    start_time: startTime.toISOString(),
                    end_time: endTime.toISOString(),
                    status: 'Finalizada',
                    type: 'Sesión Importada',
                    session_diary: clinicalNote,
                    therapist_name: 'Doctoralia'
                });

            if (iError) {
                console.error(`❌ Error insertando nota para ${firstNameDoc}:`, iError);
                errorCount++;
            } else {
                importedCount++;
            }
        }

        if (importedCount % 100 === 0 && importedCount > 0) {
            console.log(`⏳ Progresando... ${importedCount} notas procesadas (${matchedByFuzzy} vía match difuso).`);
        }
    }

    console.log(`\n🎉 Resumen de importación finalizado:`);
    console.log(`✅ Importadas/Actualizadas: ${importedCount}`);
    console.log(`🔍 Coincidencias difusas: ${matchedByFuzzy}`);
    console.log(`⚠️ Saltadas (no match/vacías/ya existentes): ${skippedCount}`);
    console.log(`❌ Errores: ${errorCount}`);
}

importHistory().catch(console.error);
