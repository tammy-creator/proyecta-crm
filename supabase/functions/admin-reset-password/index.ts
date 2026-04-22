import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
    console.log(`[DEBUG] admin-reset-password triggered: ${req.method} ${req.url}`);
    
    // 0. Handle CORS Preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
        const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

        // 1. Get the current user from JWT to verify they are an admin
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) {
            console.error('Missing Authorization header');
            return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 401,
            });
        }

        // Initialize user-scoped client to verify identity
        const userClient = createClient(supabaseUrl, anonKey, {
            global: { headers: { Authorization: authHeader } }
        });
        
        const { data: { user: adminUser }, error: userError } = await userClient.auth.getUser();

        if (userError || !adminUser) {
            console.error('Auth verification failed:', userError || 'No user session');
            return new Response(JSON.stringify({ 
                error: 'Unauthorized',
                details: userError?.message || 'Invalid user session'
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 401,
            });
        }

        // 2. Verify ADMIN role
        const role = (adminUser.user_metadata?.role || '').toString().trim().toUpperCase();
        if (role !== 'ADMIN') {
            console.warn(`Unauthorized attempt from ${adminUser.email}. Role: ${role}`);
            return new Response(JSON.stringify({ error: 'Forbidden: Only administrators can reset passwords' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 403,
            });
        }

        const { userId, newPassword } = await req.json();

        if (!userId || !newPassword) {
            throw new Error('User ID and new password are required');
        }

        // 3. Initialize Service Client for administrative actions
        const supabaseService = createClient(supabaseUrl, serviceRoleKey);

        console.log(`Resetting password for user ${userId} requested by ${adminUser.email}`);

        // 4. HEALING STEP: Get account info from DB to restore metadata if lost
        const { data: account, error: accountError } = await supabaseService
            .from('user_accounts')
            .select('role, therapist_id, email')
            .eq('id', userId)
            .single();

        let finalTherapistId = account?.therapist_id;
        let finalRole = account?.role || 'THERAPIST';

        // 5. ULTIMATE FALLBACK: If therapist_id is missing, search by email in therapists table
        if (!finalTherapistId) {
            console.log(`[HEAL] ID missing in user_accounts for ${userId}, searching clinical table by email...`);
            const targetEmail = account?.email || (await supabaseService.auth.admin.getUserById(userId)).data.user?.email;
            
            if (targetEmail) {
                const { data: clinicalTherapist } = await supabaseService
                    .from('therapists')
                    .select('id')
                    .eq('email', targetEmail)
                    .maybeSingle();
                
                if (clinicalTherapist) {
                    finalTherapistId = clinicalTherapist.id;
                    console.log(`[HEAL] Found therapist_id ${finalTherapistId} via email match.`);
                    
                    // Sync back to user_accounts table for future consistency
                    await supabaseService
                        .from('user_accounts')
                        .update({ therapist_id: finalTherapistId })
                        .eq('id', userId);
                }
            }
        }

        // 6. Update password in Auth and MERGE metadata (ensuring persistent access)
        const { error: authError } = await supabaseService.auth.admin.updateUserById(
            userId,
            {
                password: newPassword,
                user_metadata: { 
                    requires_password_change: true,
                    role: finalRole,
                    therapist_id: finalTherapistId
                }
            }
        );

        if (authError) {
            console.error('Backend Auth Error:', JSON.stringify(authError));
            throw authError;
        }

        // 5. Update flag in public.user_accounts
        const { error: dbError } = await supabaseService
            .from('user_accounts')
            .update({ requires_password_change: true })
            .eq('id', userId);

        if (dbError) {
            console.error('Database Update Error:', JSON.stringify(dbError));
            throw dbError;
        }

        return new Response(JSON.stringify({ success: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });
    } catch (error: any) {
        console.error('Fatal Edge Function Error:', error.message || error);
        return new Response(JSON.stringify({ 
            error: error.message || 'Internal Server Error',
            details: error
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        });
    }
});
