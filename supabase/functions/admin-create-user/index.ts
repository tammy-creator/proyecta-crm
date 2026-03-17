import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
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

        // Initialize user-scoped client
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

        console.log('Admin user metadata:', JSON.stringify(adminUser.user_metadata));

        // 2. Determine Role (from Metadata first)
        const rawRole = (adminUser.user_metadata?.role || '').toString().trim().toUpperCase();
        console.log('Detected raw role from metadata:', rawRole);
        
        let isAdmin = rawRole === 'ADMIN' || rawRole === 'ADMINISTRATOR';

        // 3. Backup: Check Admin role in user_accounts table
        if (!isAdmin) {
            console.log('Metadata role not sufficient, checking user_accounts table...');
            const supabaseService = createClient(supabaseUrl, serviceRoleKey);
            const { data: userData, error: dbRoleError } = await supabaseService
                .from('user_accounts')
                .select('role')
                .eq('id', adminUser.id)
                .single();
            
            if (dbRoleError) {
                console.error('Error fetching role from DB:', JSON.stringify(dbRoleError));
            } else {
                console.log('Role found in database:', userData?.role);
                const dbRole = (userData?.role || '').toString().trim().toUpperCase();
                if (dbRole === 'ADMIN' || dbRole === 'ADMINISTRATOR') {
                    isAdmin = true;
                }
            }
        }

        if (!isAdmin) {
            console.warn(`Access denied for ${adminUser.email}. Role detected: ${rawRole}`);
            return new Response(JSON.stringify({ 
                error: 'Forbidden: Only administrators can create users',
                debugInfo: { metadataRole: rawRole }
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 403,
            });
        }

        // 4. Parse Request Payload
        const payload = await req.json();
        const { email, password, fullName, role, status, therapistId } = payload;

        if (!email || !password) {
            return new Response(JSON.stringify({ error: 'Email and password are required' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 400,
            });
        }

        const supabaseService = createClient(supabaseUrl, serviceRoleKey);

        // 5. Create or Get user in Auth (Idempotent)
        console.log('Synchronizing auth user:', email);
        let userId: string;
        
        const { data: authData, error: authError } = await supabaseService.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: {
                full_name: fullName,
                role: role,
                requires_password_change: true,
                therapist_id: therapistId
            }
        });

        if (authError) {
            // Check if user already exists
            const isCollision = authError.message?.toLowerCase().includes('already registered') || 
                               authError.status === 422 || 
                               (authError as any).code === 'email_exists';

            if (isCollision) {
                console.log('User already exists in Auth, fetching existing ID...');
                const { data: listData, error: listError } = await supabaseService.auth.admin.listUsers();
                if (listError) throw listError;
                
                const existingUser = listData.users.find(u => u.email === email);
                if (!existingUser) throw new Error('Could not find existing user even though Auth reported a collision.');
                userId = existingUser.id;
                console.log('Found existing Auth user ID:', userId);

                // Update metadata for existing user to ensure sync
                await supabaseService.auth.admin.updateUserById(userId, {
                    user_metadata: {
                        full_name: fullName,
                        role: role,
                        therapist_id: therapistId
                    }
                });
            } else {
                console.error('Auth creation error:', JSON.stringify(authError));
                throw authError;
            }
        } else {
            userId = authData.user.id;
            console.log('New Auth user created with ID:', userId);
        }

        // 6. Create or Update entry in user_accounts (UPSERT)
        console.log('Upserting user_accounts entry for ID:', userId);
        const { error: dbError } = await supabaseService
            .from('user_accounts')
            .upsert({
                id: userId,
                full_name: fullName,
                email,
                role,
                status,
                therapist_id: therapistId,
                requires_password_change: true
            });

        if (dbError) {
            console.error('Database insertion error:', JSON.stringify(dbError));
            throw dbError;
        }

        console.log('User synchronization complete');
        return new Response(JSON.stringify({ 
            success: true,
            user: { id: userId, email, fullName, role }
        }), {
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
