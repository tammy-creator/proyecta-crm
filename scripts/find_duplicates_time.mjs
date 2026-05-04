import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://rmohexwayuazhoiocrcn.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJtb2hleHdheXVhemhvaW9jcmNuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTQ5MDk5MiwiZXhwIjoyMDg3MDY2OTkyfQ.zjHYOxmp-NkXLqjtR17nBmCYSbL8UGfl9bW2HZNMDeQ';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDuplicates() {
    console.log("Checking for same-time appointments...");
    const { data: apps, error } = await supabase
        .from('appointments')
        .select('id, start_time, patient_id, patient_name');

    if (error) {
        console.error(error);
        return;
    }

    const seen = new Map();
    const duplicates = [];

    for (const app of apps) {
        const key = `${app.patient_id}_${app.start_time}`;

        if (seen.has(key)) {
            duplicates.push({
                original: seen.get(key),
                duplicate: app.id,
                patient: app.patient_name,
                time: app.start_time
            });
        } else {
            seen.set(key, app.id);
        }
    }

    console.log(`Found ${duplicates.length} same-time duplicates.`);
    if (duplicates.length > 0) {
        console.log("Example:", duplicates[0]);
    }
}

checkDuplicates().catch(console.error);
