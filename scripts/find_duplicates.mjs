import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://rmohexwayuazhoiocrcn.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJtb2hleHdheXVhemhvaW9jcmNuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTQ5MDk5MiwiZXhwIjoyMDg3MDY2OTkyfQ.zjHYOxmp-NkXLqjtR17nBmCYSbL8UGfl9bW2HZNMDeQ';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDuplicates() {
    console.log("Checking for duplicate appointments...");
    const { data: apps, error } = await supabase
        .from('appointments')
        .select('id, start_time, patient_id, session_diary, patient_name');

    if (error) {
        console.error(error);
        return;
    }

    const seen = new Map();
    const duplicates = [];

    for (const app of apps) {
        if (!app.session_diary) continue;
        
        // Clave: Paciente + Fecha (solo día) + Contenido
        const date = app.start_time.split('T')[0];
        const content = app.session_diary.trim();
        const key = `${app.patient_id}_${date}_${content}`;

        if (seen.has(key)) {
            duplicates.push({
                original: seen.get(key),
                duplicate: app.id,
                patient: app.patient_name,
                date: date
            });
        } else {
            seen.set(key, app.id);
        }
    }

    console.log(`Found ${duplicates.length} likely duplicates.`);
    if (duplicates.length > 0) {
        console.log("Example:", duplicates[0]);
    }

    // Si hay muchos duplicados, podríamos borrarlos.
    // Pero primero confirmemos con el usuario o veamos si podemos borrarlos automáticamente.
    // Solo borraremos los que tienen EXACTAMENTE el mismo contenido y paciente en el mismo día.
}

checkDuplicates().catch(console.error);
