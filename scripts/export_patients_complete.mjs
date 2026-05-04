import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const supabaseUrl = 'https://rmohexwayuazhoiocrcn.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJtb2hleHdheXVhemhvaW9jcmNuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTQ5MDk5MiwiZXhwIjoyMDg3MDY2OTkyfQ.zjHYOxmp-NkXLqjtR17nBmCYSbL8UGfl9bW2HZNMDeQ';
const supabase = createClient(supabaseUrl, supabaseKey);

async function exportPatients() {
    console.log("🚀 Iniciando exportación completa de pacientes...");
    
    // 1. Obtener pacientes con tutores
    const { data: patients, error: pError } = await supabase
        .from('patients')
        .select(`
            *,
            patient_tutors(*)
        `)
        .order('last_name', { ascending: true });

    if (pError) {
        console.error("❌ Error al obtener pacientes:", pError);
        return;
    }

    // 2. Obtener terapeutas para mapear nombres
    const { data: therapists, error: tError } = await supabase
        .from('therapists')
        .select('id, full_name');
    
    const therapistMap = {};
    if (!tError && therapists) {
        therapists.forEach(t => {
            therapistMap[t.id] = t.full_name;
        });
    }

    console.log(`✅ ${patients.length} pacientes recuperados.`);

    // 3. Preparar datos para CSV
    const rows = patients.map(p => {
        const t1 = p.patient_tutors?.find(t => t.order_num === 1) || {};
        const t2 = p.patient_tutors?.find(t => t.order_num === 2) || {};
        
        return {
            'ID': p.id,
            'Nombre': p.first_name,
            'Apellidos': p.last_name,
            'Fecha Nacimiento': p.birth_date,
            'DNI': p.dni,
            'Email': p.email,
            'Teléfono': p.phone,
            'Dirección': p.address,
            'Estado': p.status,
            'Escolaridad': p.schooling,
            'Alergias': p.allergies,
            'Origen (Referencia)': p.referral_source,
            'Terapeuta Asignado': therapistMap[p.therapist_id] || 'Sin asignar',
            'Última Visita': p.last_visit,
            'Fecha Creación': p.created_at,
            'Tutor 1 - Nombre': t1.first_name || '',
            'Tutor 1 - Apellidos': t1.last_name || '',
            'Tutor 1 - DNI': t1.dni || '',
            'Tutor 1 - Teléfono': t1.phone || '',
            'Tutor 1 - Email': t1.email || '',
            'Tutor 1 - Profesión': t1.job || '',
            'Tutor 2 - Nombre': t2.first_name || '',
            'Tutor 2 - Apellidos': t2.last_name || '',
            'Tutor 2 - Teléfono': t2.phone || '',
            'LOPD Firmado': p.consent_lopd ? 'SÍ' : 'NO',
            'Fecha LOPD': p.consent_date || ''
        };
    });

    if (rows.length === 0) {
        console.log("⚠️ No hay datos para exportar.");
        return;
    }

    const headers = Object.keys(rows[0]);
    const csvContent = rows.map(row => {
        return headers.map(header => {
            let val = row[header];
            if (val === null || val === undefined) return '';
            let strVal = String(val).replace(/"/g, '""');
            // Usamos punto y coma para compatibilidad directa con Excel en español
            if (strVal.includes(';') || strVal.includes('\n') || strVal.includes('\r')) {
                return `"${strVal}"`;
            }
            return strVal;
        }).join(';');
    });

    const finalCsv = [headers.join(';'), ...csvContent].join('\n');
    
    // Guardar con BOM para que Excel reconozca los caracteres especiales (ñ, tildes)
    fs.writeFileSync('export_pacientes_completo.csv', '\uFEFF' + finalCsv, 'utf8');
    
    console.log("🎉 Exportación finalizada: 'export_pacientes_completo.csv' generado con éxito.");
}

exportPatients().catch(console.error);
