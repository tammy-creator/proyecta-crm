import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://rmohexwayuazhoiocrcn.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJtb2hleHdheXVhemhvaW9jcmNuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTQ5MDk5MiwiZXhwIjoyMDg3MDY2OTkyfQ.zjHYOxmp-NkXLqjtR17nBmCYSbL8UGfl9bW2HZNMDeQ';
const supabase = createClient(supabaseUrl, supabaseKey);

async function analyzeDuplicates() {
    console.log("Analyzing 417 duplicates...");
    const { data: apps } = await supabase.from('appointments').select('*');
    
    const seen = new Map();
    const dups = [];

    for (const app of apps) {
        const key = `${app.patient_id}_${app.start_time}`;
        if (seen.has(key)) {
            dups.push({ original: seen.get(key), duplicate: app });
        } else {
            seen.set(key, app);
        }
    }

    console.log(`Analyzing ${dups.length} duplicates...`);
    
    // Contar cuántos son de Doctoralia
    const doctoraliaDups = dups.filter(d => d.duplicate.therapist_name === 'Doctoralia' || d.original.therapist_name === 'Doctoralia');
    console.log(`Doctoralia involved in ${doctoraliaDups.length} dups.`);
    
    // Contar cuántos tienen mismo terapeuta
    const sameTherapist = dups.filter(d => d.duplicate.therapist_id === d.original.therapist_id);
    console.log(`Same therapist in ${sameTherapist.length} dups.`);

    // Mostrar un ejemplo de NO Doctoralia
    const nonDoc = dups.find(d => d.duplicate.therapist_name !== 'Doctoralia' && d.original.therapist_name !== 'Doctoralia');
    if (nonDoc) {
        console.log("Example of NON-Doctoralia dup:");
        console.log("Original:", nonDoc.original.patient_name, nonDoc.original.start_time, nonDoc.original.therapist_name, nonDoc.original.created_at);
        console.log("Duplicate:", nonDoc.duplicate.patient_name, nonDoc.duplicate.start_time, nonDoc.duplicate.therapist_name, nonDoc.duplicate.created_at);
    }
}

analyzeDuplicates().catch(console.error);
