import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import type { Session, User as SupabaseUser } from '@supabase/supabase-js';

export type UserRole = 'ADMIN' | 'THERAPIST';

interface User {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    requiresPasswordChange: boolean;
    therapistId?: string;
}

interface AuthContextType {
    user: User | null;
    session: Session | null;
    loading: boolean;
    login: (email: string, password: string) => Promise<User>;
    logout: () => Promise<void>;
    isRole: (role: UserRole) => boolean;
    refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Helper: map Supabase user to app User
// Role is stored in user_metadata.role (set when creating the user in Admin)
const mapUser = (supabaseUser: SupabaseUser): User => {
    const meta = supabaseUser.user_metadata || {};
    const role: UserRole = meta.role?.toUpperCase() === 'ADMIN' ? 'ADMIN' : 'THERAPIST';
    const name = meta.full_name || meta.name || supabaseUser.email?.split('@')[0] || 'Usuario';
    const requiresPasswordChange = meta.requires_password_change === true;

    return {
        id: supabaseUser.id,
        name,
        email: supabaseUser.email || '',
        role,
        requiresPasswordChange,
        therapistId: meta.therapist_id,
    };
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Get initial session
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            const initialUser = session?.user ? mapUser(session.user) : null;
            setUser(initialUser);

            // Sync therapistId if missing
            if (initialUser && !initialUser.therapistId) {
                syncTherapistId(initialUser.id);
            }
            setLoading(false);
        });

        // Listen for auth state changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
            const updatedUser = session?.user ? mapUser(session.user) : null;
            setUser(updatedUser);

            if (updatedUser && !updatedUser.therapistId) {
                syncTherapistId(updatedUser.id);
            }
            setLoading(false);
        });

        return () => subscription.unsubscribe();
    }, []);

    const syncTherapistId = async (authId: string) => {
        try {
            // Priority 1: Check user_accounts table
            const { data: account } = await supabase
                .from('user_accounts')
                .select('therapist_id, email')
                .eq('id', authId)
                .maybeSingle();

            if (account?.therapist_id) {
                setUser(prev => prev ? { ...prev, therapistId: account.therapist_id } : null);
                return;
            }

            // Priority 2: Fallback to matching by email in therapists table
            const email = account?.email || (await supabase.auth.getUser()).data.user?.email;
            if (email) {
                const { data: therapist } = await supabase
                    .from('therapists')
                    .select('id')
                    .eq('email', email)
                    .maybeSingle();

                if (therapist) {
                    setUser(prev => prev ? { ...prev, therapistId: therapist.id } : null);
                }
            }
        } catch (e) {
            console.error("Error syncing therapist ID:", e);
        }
    };

    const login = async (email: string, password: string): Promise<User> => {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        const mappedUser = mapUser(data.user);
        setUser(mappedUser); // Pre-set user for immediate use
        return mappedUser;
    };

    const logout = async () => {
        await supabase.auth.signOut();
    };

    const refreshUser = async () => {
        const { data: { user: supabaseUser } } = await supabase.auth.getUser();
        if (supabaseUser) {
            setUser(mapUser(supabaseUser));
        }
    };

    const isRole = (role: UserRole) => user?.role === role;

    return (
        <AuthContext.Provider value={{ user, session, loading, login, logout, isRole, refreshUser }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
