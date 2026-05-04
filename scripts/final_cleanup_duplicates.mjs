import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://rmohexwayuazhoiocrcn.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJtb2hleHdheXVhemhvaW9jcmNuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTQ5MDk5MiwiZXhwIjoyMDg3MDY2OTkyfQ.zjHYOxmp-NkXLqjtR17nBmCYSbL8UGfl9bW2HZNMDeQ';
const supabase = createClient(supabaseUrl, supabaseKey);

async function cleanupAllDuplicates() {
    console.log("🚀 Iniciando limpieza de citas duplicadas...");
    const { data: apps, error } = await supabase.from('appointments').select('*');
    if (error) throw error;

    const groups = {};
    apps.forEach(app => {
        const key = `${app.patient_id}_${app.start_time}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(app);
    });

    const idsToDelete = [];
    let totalGroupsWithDups = 0;

    for (const key in groups) {
        const list = groups[key];
        if (list.length > 1) {
            totalGroupsWithDups++;
            
            // Ordenar: primero las que tienen contenido (session_diary), luego por fecha de creación (más antigua primero)
            list.sort((a, b) => {
                const aHasContent = (a.session_diary || a.notes) ? 1 : 0;
                const bHasContent = (b.session_diary || b.notes) ? 1 : 0;
                
                if (aHasContent !== bHasContent) return bHasContent - aHasContent;
                
                return new Date(a.created_at) - new Date(b.created_at);
            });

            // El primero se queda, el resto se borra
            const toKeep = list[0];
            const toDelete = list.slice(1).map(a => a.id);
            idsToDelete.push(...toDelete);
        }
    }

    console.log(`📊 Encontrados ${totalGroupsWithDups} grupos con duplicados.`);
    console.log(`🗑️ Total de registros a eliminar: ${idsToDelete.length}`);

    if (idsToDelete.length > 0) {
        // Borrar en bloques de 100
        for (let i = 0; i < idsToDelete.length; i += 100) {
            const batch = idsToDelete.slice(i, i + 100);
            const { error: dError } = await supabase
                .from('appointments')
                .delete()
                .in('id', batch);
            
            if (dError) {
                console.error(`❌ Error borrando bloque ${i/100 + 1}:`, dError);
            } else {
                console.log(`✅ Bloque ${Math.floor(i/100) + 1} eliminado.`);
            }
        }
    }

    console.log("\n✨ Limpieza finalizada correctamente.");
}

cleanupAllDuplicates().catch(console.error);
