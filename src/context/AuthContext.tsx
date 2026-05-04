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
    avatarUrl?: string;
    identities?: { id: string, name: string, avatarUrl?: string, specialty?: string }[];
}

interface AuthContextType {
    user: User | null;
    session: Session | null;
    loading: boolean;
    login: (email: string, password: string) => Promise<User>;
    logout: () => Promise<void>;
    isRole: (role: UserRole) => boolean;
    refreshUser: () => Promise<void>;
    selectIdentity: (therapistId: string | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Helper: map Supabase user to app User
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
        avatarUrl: meta.avatar_url,
        identities: [],
    };
}

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Get initial session with error handling to prevent infinite loading
        const initAuth = async () => {
            try {
                const { data: { session }, error } = await supabase.auth.getSession();
                if (error) throw error;
                
                setSession(session);
                const initialUser = session?.user ? mapUser(session.user) : null;
                setUser(initialUser);

                // Sync therapistId and data
                if (initialUser) {
                    syncTherapistId(initialUser.id);
                }
            } catch (error) {
                console.error("Initial auth session error:", error);
            } finally {
                setLoading(false);
            }
        };

        initAuth();

        // Listen for auth state changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
            const updatedUser = session?.user ? mapUser(session.user) : null;
            setUser(updatedUser);

            if (updatedUser) {
                syncTherapistId(updatedUser.id);
            }
            setLoading(false);
        });

        return () => subscription.unsubscribe();
    }, []);

    const syncTherapistId = async (_authId: string) => {
        try {
            const { data: { user: supabaseUser } } = await supabase.auth.getUser();
            const email = supabaseUser?.email;
            
            if (!email) return;

            // Fetch all therapists with this email
            const { data: therapists } = await supabase
                .from('therapists')
                .select('id, full_name, avatar_url, specialty')
                .eq('email', email);

            const identities = (therapists || []).map(t => ({
                id: t.id,
                name: t.full_name,
                avatarUrl: t.avatar_url,
                specialty: t.specialty
            }));

            // Check if we have a saved identity in this session
            const savedId = sessionStorage.getItem('active_identity');
            const activeId = savedId || (identities.length === 1 ? identities[0].id : null);

            setUser(prev => {
                if (!prev) return null;
                const active = identities.find(i => i.id === activeId);
                return {
                    ...prev,
                    identities,
                    therapistId: activeId || prev.therapistId,
                    name: active?.name || prev.name,
                    avatarUrl: active?.avatarUrl || prev.avatarUrl
                };
            });
        } catch (e) {
            console.error("Error syncing therapist identities:", e);
        }
    };

    const selectIdentity = (therapistId: string | null) => {
        if (!user) return;
        
        if (therapistId) {
            sessionStorage.setItem('active_identity', therapistId);
            const identity = user.identities?.find(i => i.id === therapistId);
            if (identity) {
                setUser({
                    ...user,
                    therapistId: identity.id,
                    name: identity.name,
                    avatarUrl: identity.avatarUrl
                });
            }
        } else {
            // Revert to base Admin identity
            sessionStorage.removeItem('active_identity');
            const getBaseMetadata = async () => {
                const { data: { user: supabaseUser } } = await supabase.auth.getUser();
                const meta = supabaseUser?.user_metadata || {};
                setUser(prev => prev ? {
                    ...prev,
                    therapistId: undefined,
                    name: meta.full_name || meta.name || prev.email.split('@')[0],
                    avatarUrl: meta.avatar_url
                } : null);
            };
            getBaseMetadata();
        }
    };

    const login = async (email: string, password: string): Promise<User> => {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        
        sessionStorage.removeItem('active_identity'); // Reset on new login
        const mappedUser = mapUser(data.user);
        setUser(mappedUser);
        
        await syncTherapistId(data.user.id);
        return mappedUser;
    };

    const logout = async () => {
        try {
            sessionStorage.removeItem('active_identity');
            // We use a try-catch because if the session is already invalid or expired, 
            // signOut might throw an error, but we still want to clear the local state.
            await supabase.auth.signOut();
        } catch (error) {
            console.error("Error during Supabase signOut:", error);
        } finally {
            // Force clear local state to ensure the UI updates
            setUser(null);
            setSession(null);
        }
    };

    const refreshUser = async () => {
        const { data: { user: supabaseUser } } = await supabase.auth.getUser();
        if (supabaseUser) {
            const upUser = mapUser(supabaseUser);
            setUser(upUser);
            await syncTherapistId(supabaseUser.id);
        }
    };

    const isRole = (role: UserRole) => user?.role === role;

    return (
        <AuthContext.Provider value={{ user, session, loading, login, logout, isRole, refreshUser, selectIdentity }}>
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
