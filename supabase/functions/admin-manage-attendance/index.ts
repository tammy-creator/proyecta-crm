import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
        const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

        const authHeader = req.headers.get('Authorization');
        if (!authHeader) {
            console.error('Missing Authorization header');
            return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 401,
            });
        }

        const userClient = createClient(supabaseUrl, anonKey, {
            global: { headers: { Authorization: authHeader } }
        });
        
        const { data: { user: adminUser }, error: userError } = await userClient.auth.getUser();

        if (userError || !adminUser) {
            console.error('JWT Verification Error:', userError?.message || 'No user found');
            return new Response(JSON.stringify({ 
                error: 'Unauthorized', 
                details: userError?.message || 'Token verification failed' 
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 401,
            });
        }

        console.log(`Authenticated as: ${adminUser.email} (${adminUser.id})`);

        const rawRole = (adminUser.user_metadata?.role || '').toString().trim().toUpperCase();
        let isAdmin = rawRole === 'ADMIN' || rawRole === 'ADMINISTRATOR';

        const supabaseService = createClient(supabaseUrl, serviceRoleKey);

        if (!isAdmin) {
            const { data: userData, error: dbRoleError } = await supabaseService
                .from('user_accounts')
                .select('role')
                .eq('id', adminUser.id)
                .single();
            
            if (dbRoleError) console.warn('Error fetching DB role:', dbRoleError.message);

            const dbRole = (userData?.role || '').toString().trim().toUpperCase();
            if (dbRole === 'ADMIN' || dbRole === 'ADMINISTRATOR') {
                isAdmin = true;
            }
        }

        if (!isAdmin) {
            console.error(`Access Denied: User ${adminUser.email} is not an admin`);
            return new Response(JSON.stringify({ error: 'Forbidden: Only administrators can manage attendance for others' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 403,
            });
        }

        // --- NEW FIX: Ensure admin is in user_accounts to avoid FK and RLS issues ---
        console.log('Self-repair: ensuring admin account exists in user_accounts...');
        await supabaseService.from('user_accounts').upsert({
            id: adminUser.id,
            email: adminUser.email,
            full_name: adminUser.user_metadata?.full_name || 'Administrador',
            role: 'Admin',
            status: 'Active'
        }, { onConflict: 'id' });
        // ------------------------------------------------------------------------

        const payload = await req.json();
        const { action, id, record, therapist_id } = payload;
        
        let result;
        if (action === 'insert') {
            const { data, error } = await supabaseService.from('attendance').insert(record).select().single();
            if (error) throw error;
            result = data;
        } else if (action === 'update') {
            const { data, error } = await supabaseService.from('attendance').update(record).eq('id', id).select().single();
            if (error) throw error;
            result = data;
        } else if (action === 'delete') {
            const { error } = await supabaseService.from('attendance').delete().eq('id', id);
            if (error) throw error;
            result = { success: true };
        } else if (action === 'cleanup') {
            if (!therapist_id) throw new Error('Therapist ID required for cleanup');
            
            // Fetch all non-work attendance for this therapist
            const { data: allAtt, error: fetchError } = await supabaseService
                .from('attendance')
                .select('id, start_time, end_time, type, notes')
                .eq('therapist_id', therapist_id)
                .neq('type', 'work');
            
            if (fetchError) throw fetchError;
            
            const seen = new Set();
            const toDelete: string[] = [];
            
            (allAtt || []).forEach(v => {
                // Key: normalized time and type
                const key = `${v.start_time}-${v.end_time || ''}-${v.type}`;
                if (seen.has(key)) {
                    toDelete.push(v.id);
                } else {
                    seen.add(key);
                }
            });
            
            if (toDelete.length > 0) {
                const { error: delError } = await supabaseService
                    .from('attendance')
                    .delete()
                    .in('id', toDelete);
                if (delError) throw delError;
            }
            
            result = { deletedCount: toDelete.length };
        } else {
            throw new Error('Invalid action');
        }

        return new Response(JSON.stringify({ success: true, data: result }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });
    } catch (error: any) {
        console.error('Attendance Management Error:', error.message || error);
        return new Response(JSON.stringify({ 
            error: error.message || 'Internal Server Error',
            details: error
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        });
    }
});
