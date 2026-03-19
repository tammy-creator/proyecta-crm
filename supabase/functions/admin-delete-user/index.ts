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
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 401,
            });
        }

        const rawRole = (adminUser.user_metadata?.role || '').toString().trim().toUpperCase();
        let isAdmin = rawRole === 'ADMIN' || rawRole === 'ADMINISTRATOR';

        const supabaseService = createClient(supabaseUrl, serviceRoleKey);

        if (!isAdmin) {
            const { data: userData } = await supabaseService
                .from('user_accounts')
                .select('role')
                .eq('id', adminUser.id)
                .single();
            
            const dbRole = (userData?.role || '').toString().trim().toUpperCase();
            if (dbRole === 'ADMIN' || dbRole === 'ADMINISTRATOR') {
                isAdmin = true;
            }
        }

        if (!isAdmin) {
            return new Response(JSON.stringify({ error: 'Forbidden: Only administrators can delete users' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 403,
            });
        }

        // Parse payload
        const { userId } = await req.json();

        if (!userId) {
            return new Response(JSON.stringify({ error: 'User ID is required' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 400,
            });
        }

        // 1. Delete from public.user_accounts first (manual cleanup to be safe)
        const { error: dbError } = await supabaseService
            .from('user_accounts')
            .delete()
            .eq('id', userId);

        if (dbError) {
            console.error('Database deletion error:', dbError);
            // We continue even if DB delete fails, as the Auth delete is primary
        }

        // 2. Delete from Auth
        const { error: authError } = await supabaseService.auth.admin.deleteUser(userId);

        if (authError) {
            console.error('Auth deletion error:', authError);
            throw authError;
        }

        return new Response(JSON.stringify({ success: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });
    } catch (error: any) {
        console.error('Admin Delete User Error:', error.message || error);
        return new Response(JSON.stringify({ 
            error: error.message || 'Internal Server Error',
            details: error
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        });
    }
});
