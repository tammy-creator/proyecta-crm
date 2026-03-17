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
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        const { userId, newPassword } = await req.json();

        if (!userId || !newPassword) {
            throw new Error('User ID and new password are required');
        }

        // 1. Update password in Auth and set metadata
        const { error: authError } = await supabaseClient.auth.admin.updateUserById(
            userId,
            {
                password: newPassword,
                user_metadata: { requires_password_change: true }
            }
        );

        if (authError) throw authError;

        // 2. Update flag in public.user_accounts
        const { error: dbError } = await supabaseClient
            .from('user_accounts')
            .update({ requires_password_change: true })
            .eq('id', userId);

        if (dbError) throw dbError;

        return new Response(JSON.stringify({ success: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });
    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        });
    }
});
