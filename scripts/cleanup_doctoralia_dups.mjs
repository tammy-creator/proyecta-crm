import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://rmohexwayuazhoiocrcn.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJtb2hleHdheXVhemhvaW9jcmNuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTQ5MDk5MiwiZXhwIjoyMDg3MDY2OTkyfQ.zjHYOxmp-NkXLqjtR17nBmCYSbL8UGfl9bW2HZNMDeQ';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDoctoraliaDuplicates() {
    console.log("Checking for Doctoralia duplicates...");
    const { data: apps, error } = await supabase
        .from('appointments')
        .select('id, start_time, patient_id, patient_name, therapist_name')
        .eq('therapist_name', 'Doctoralia');

    if (error) {
        console.error(error);
        return;
    }

    const seen = new Map();
    const duplicates = [];

    for (const app of apps) {
        const key = `${app.patient_id}_${app.start_time}`;
        if (seen.has(key)) {
            duplicates.push(app.id);
        } else {
            seen.set(key, app.id);
        }
    }

    console.log(`Found ${duplicates.length} Doctoralia duplicates.`);
    
    if (duplicates.length > 0) {
        console.log("Cleaning up Doctoralia duplicates...");
        // Borrar los duplicados
        for (let i = 0; i < duplicates.length; i += 100) {
            const batch = duplicates.slice(i, i + 100);
            const { error: dError } = await supabase
                .from('appointments')
                .delete()
                .in('id', batch);
            if (dError) console.error(dError);
        }
        console.log("Done.");
    }
}

checkDoctoraliaDuplicates().catch(console.error);
