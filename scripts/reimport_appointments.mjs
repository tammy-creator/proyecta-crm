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
        .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "") // Eliminar puntuación y paréntesis
        .replace(/\s+/g, ' ')
        .trim();
};

async function reimportAppointments() {
    console.log("🚀 Iniciando RE-IMPORTACIÓN de citas (Versión Refinada)...");

    // 1. Limpiar calendario futuro (manteniendo el historial de Doctoralia)
    const todayISO = new Date().toISOString().split('T')[0];
    console.log(`Sweep: Limpiando citas desde ${todayISO} (excepto historial)...`);
    
    const { error: dError } = await supabase
        .from('appointments')
        .delete()
        .gte('start_time', todayISO)
        .neq('therapist_name', 'Doctoralia');

    if (dError) throw dError;

    // 2. Cargar Pacientes y Terapeutas para el mapeo
    const { data: patients, error: pErr } = await supabase.from('patients').select('id, first_name, last_name');
    if (pErr) {
        console.error("❌ Error cargando pacientes:", pErr);
        return;
    }
    const { data: therapists, error: tErr } = await supabase.from('therapists').select('id, full_name');
    if (tErr) {
        console.error("❌ Error cargando terapeutas:", tErr);
        return;
    }

    const manualOverrides = {
        "carmen laura": "jorge abol",
        "daniel sakina": "daniel rezaei", // Sin paréntesis por la nueva normalización
        "esteba pablo": "esteban pablo gomez reyes",
        "esteban pablo": "esteban pablo gomez reyes",
        "valeria sensible": "valeria huertas",
        "ian gonzalez aacc": "ian gonzalez castro",
        "alex riesgo": "alex riesgo rodriguez",
        "cecilia": "cecilia suarez ramon",
        "malik tea": "malik malaika",
        "max ruth": "maximiliano",
        "ruth tomescu": "ruth ilalla tomescu",
        "dylan fernando reyes reyes": "dylan reyes reyes",
        "ianna": "ianna silvestre",
        "christabel giegbefumwen omoruyi": "christabel g-omoruyi",
        "eliam oulkady": "eliam oulkady lage",
        "ana lucia": "ana lucia ulloa rodriguez",
        "gabriel montedeva": "gabriel bouzo rodriguez",
        "marina rotacismo": "marina martinez gutierrez",
        "angel canada": "angel castro gomez",
        "diego ruben sanchez": "diego ruben",
        "valentina olvido lopez rodriguez": "valentina olvido"
    };

    const patientMap = (patients || []).map(p => ({
        id: p.id,
        fullName: normalizeString(`${p.first_name} ${p.last_name}`),
        firstName: normalizeString(p.first_name),
        lastName: normalizeString(p.last_name),
        raw: p
    }));

    const therapistMap = (therapists || []).map(t => {
        const normName = normalizeString(t.full_name);
        const parts = t.full_name.split(' ');
        const lastNameFirst = normalizeString(`${parts.slice(1).join(' ')}, ${parts[0]}`);
        
        return {
            id: t.id,
            fullName: normName,
            lastNameFirstName: lastNameFirst
        };
    });

    // 3. Leer archivo de citas (Forzar lectura de strings para evitar swap de meses)
    const workbook = XLSX.readFile('citas_pacientes.csv', { cellDates: false, raw: true });
    const rawData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { raw: true });

    console.log(`📊 Procesando ${rawData.length} citas del archivo (Modo Raw)...`);

    let importedCount = 0;
    let blockedCount = 0;
    let skippedCount = 0;
    let unmatched = [];

    for (const row of rawData) {
        const firstNameDoc = row['first name'];
        const lastNameDoc = row['last name'];
        const therapistRaw = row['agenda'];
        const serviceRaw = row['service'] || '';
        const startTimeStr = row['start time'];
        const endTimeStr = row['end time'];
        const statusRaw = row['appointment status'];

        if (!startTimeStr) continue;

        // Parsear fechas (Robusto ante Excel Serial, Date objects y Strings con saltos de línea)
        const parseDate = (val) => {
            if (!val) return null;
            
            // Caso 1: Ya es un objeto Date
            if (val instanceof Date) return val.toISOString();
            
            // Caso 2: Es un número (Excel Serial Date)
            if (typeof val === 'number') {
                const date = new Date(Math.round((val - 25569) * 86400 * 1000));
                return isNaN(date.getTime()) ? null : date.toISOString();
            }

            // Caso 3: Es un string
            if (typeof val === 'string') {
                const cleanVal = val.replace(/\s+/g, ' ').trim();
                const parts = cleanVal.split(' ');
                
                if (parts.length < 2) {
                    // Intentar ver si es solo fecha (aunque necesitamos hora)
                    const [day, month, year] = cleanVal.split('/');
                    if (day && month && year) {
                        const d = new Date(year, month - 1, day);
                        return isNaN(d.getTime()) ? null : d.toISOString();
                    }
                    return null;
                }

                const [datePart, timePart] = parts;
                const [day, month, year] = datePart.split('/');
                const [hour, min] = timePart.split(':');
                
                if (!day || !month || !year || !hour || !min) return null;
                
                const d = new Date(year, month - 1, day, hour, min);
                return isNaN(d.getTime()) ? null : d.toISOString();
            }

            return null;
        };

        const startTime = parseDate(startTimeStr);
        const endTime = parseDate(endTimeStr);

        if (firstNameDoc === 'Gabriel') {
            console.log(`🔍 DEBUG Gabriel: startTimeStr="${startTimeStr}", parsed="${startTime}", todayISO="${todayISO}", isLess=${startTime < todayISO}`);
        }

        if (!startTime) {
            skippedCount++;
            continue;
        }

        if (startTime < todayISO) {
            skippedCount++;
            continue;
        }

        // Determinar si es un bloqueo o GRUPO
        const firstNameNorm = normalizeString(firstNameDoc);
        const lastNameNorm = normalizeString(lastNameDoc);
        const serviceNorm = normalizeString(serviceRaw);

        const isBlocked = firstNameNorm.includes('reunion') || 
                          firstNameNorm.includes('coordinacion') ||
                          firstNameNorm.includes('bloqueo') ||
                          firstNameNorm.includes('grupo') || // Grupos como bloqueos
                          serviceNorm.includes('reunion') ||
                          serviceNorm.includes('coordinacion') ||
                          serviceNorm.includes('grupo');

        let patientId = null;
        let patientName = `${firstNameDoc} ${lastNameDoc}`;
        let status = 'Programada';
        
        if (isBlocked) {
            status = 'Bloqueada';
            patientName = (firstNameDoc || '') + (lastNameDoc ? ' ' + lastNameDoc : '') + (serviceRaw ? ' - ' + serviceRaw : '');
            blockedCount++;
        } else {
            const fullNameDoc = normalizeString(`${firstNameDoc} ${lastNameDoc}`);
            let pMatch = null;

            // Intento 0: Overrides
            if (manualOverrides[fullNameDoc]) {
                const targetName = manualOverrides[fullNameDoc];
                pMatch = patientMap.find(p => p.fullName.includes(targetName));
            }
            if (!pMatch && manualOverrides[firstNameNorm]) {
                 const targetName = manualOverrides[firstNameNorm];
                 pMatch = patientMap.find(p => p.fullName.includes(targetName));
            }

            // Intento 1: Match Exacto
            if (!pMatch) {
                pMatch = patientMap.find(p => p.fullName === fullNameDoc);
            }

            // Intento 2: Match Difuso (Nombres contenidos + Apellidos contenidos)
            if (!pMatch && firstNameNorm.length > 2) {
                pMatch = patientMap.find(p => {
                    const dbFirstName = p.firstName;
                    const docFirstName = firstNameNorm;
                    const nameMatch = dbFirstName.includes(docFirstName) || docFirstName.includes(dbFirstName);
                    if (!nameMatch) return false;
                    
                    const dbLastName = p.lastName;
                    const docLastName = lastNameNorm;
                    // Si no hay apellidos en uno de los dos, confiamos en el nombre (si es único)
                    if (!dbLastName || !docLastName) return true;
                    
                    return dbLastName.includes(docLastName) || docLastName.includes(dbLastName);
                });
            }

            // Intento 3: Match por Nombre + Primer Apellido
            if (!pMatch && firstNameNorm.length > 2) {
                const firstSurnameDoc = lastNameNorm.split(' ')[0];
                if (firstSurnameDoc && firstSurnameDoc.length > 2) {
                    const candidates = patientMap.filter(p => {
                        const dbFirstName = p.firstName;
                        const docFirstName = firstNameNorm;
                        const nameMatch = dbFirstName.includes(docFirstName) || docFirstName.includes(dbFirstName);
                        if (!nameMatch) return false;
                        
                        const dbFirstSurname = p.lastName.split(' ')[0];
                        return dbFirstSurname === firstSurnameDoc;
                    });
                    if (candidates.length === 1) pMatch = candidates[0];
                }
            }

            // Intento 4: Match solo por nombre si es único (Especial para Ianna, Pelayo, etc.)
            if (!pMatch && firstNameNorm.length > 3) {
                const candidates = patientMap.filter(p => p.firstName.includes(firstNameNorm) || firstNameNorm.includes(p.firstName));
                if (candidates.length === 1) {
                    pMatch = candidates[0];
                }
            }

            if (pMatch) {
                patientId = pMatch.id;
                patientName = `${pMatch.raw.first_name} ${pMatch.raw.last_name}`;
            } else {
                unmatched.push({ fecha: startTimeStr, paciente: `${firstNameDoc} ${lastNameDoc}`, servicio: serviceRaw });
            }
        }

        // Mapeo de Terapeuta
        const therapistNorm = normalizeString(therapistRaw);
        let tMatch = therapistMap.find(t => t.lastNameFirstName === therapistNorm || t.fullName === therapistNorm);
        const therapistId = tMatch ? tMatch.id : null;
        const therapistName = therapistRaw;

        // Insertar
        const { error: iError } = await supabase
            .from('appointments')
            .insert({
                patient_id: patientId,
                patient_name: patientName,
                therapist_id: therapistId,
                therapist_name: therapistName,
                start_time: startTime,
                end_time: endTime,
                status: status,
                type: serviceRaw,
                notes: row['comments'] || ''
            });

        if (iError) {
            console.error(`❌ Error insertando cita para ${patientName}:`, iError);
        } else {
            importedCount++;
        }
    }

    console.log(`\n✅ RE-IMPORTACIÓN FINALIZADA:`);
    console.log(`📅 Citas cargadas: ${importedCount}`);
    console.log(`🔒 Bloqueos creados: ${blockedCount}`);
    console.log(`⏭️  Citas pasadas omitidas: ${skippedCount}`);
    console.log(`❓ Citas sin paciente asignado: ${unmatched.length}`);

    if (unmatched.length > 0) {
        let report = "Fecha;Paciente en Doctoralia;Servicio\n";
        unmatched.forEach(u => {
            report += `${u.fecha};${u.paciente};${u.servicio}\n`;
        });
        fs.writeFileSync('citas_no_asignadas_V2.csv', '\uFEFF' + report, 'utf8');
        console.log(`📄 Reporte de no asignadas guardado en: 'citas_no_asignadas_V2.csv'`);
    }
}

reimportAppointments().catch(console.error);
