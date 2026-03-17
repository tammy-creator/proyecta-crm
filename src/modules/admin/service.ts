import { supabase } from '../../lib/supabase';
import { type CenterSettings, type AuditLog, type UserAccount, type ClinicalService } from './types';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const mapSettings = (row: any): CenterSettings => ({
    name: row.name,
    cif: row.cif,
    address: row.address,
    phone: row.phone,
    email: row.email,
    website: row.website,
});

const mapService = (row: any): ClinicalService => ({
    id: row.id,
    name: row.name,
    price: row.price,
});

const mapUser = (row: any): UserAccount => ({
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    role: row.role,
    status: row.status,
    therapistId: row.therapist_id,
    lastAccess: row.last_access,
    requiresPasswordChange: row.requires_password_change,
});

const mapLog = (row: any): AuditLog => ({
    id: row.id,
    userId: row.user_id ?? '',
    userName: row.user_name ?? '',
    action: row.action,
    details: row.details,
    timestamp: row.timestamp,
    category: row.category,
});

// ─── Configuración del centro ────────────────────────────────────────────────
export const getCenterSettings = async (): Promise<CenterSettings> => {
    const { data, error } = await supabase
        .from('center_settings')
        .select('*')
        .limit(1)
        .single();
    if (error) throw error;
    return mapSettings(data);
};

export const updateCenterSettings = async (settings: CenterSettings): Promise<void> => {
    const { data: existing } = await supabase.from('center_settings').select('id').limit(1).single();
    if (existing) {
        await supabase.from('center_settings').update({
            name: settings.name, cif: settings.cif, address: settings.address,
            phone: settings.phone, email: settings.email, website: settings.website,
        }).eq('id', existing.id);
    } else {
        await supabase.from('center_settings').insert({
            name: settings.name, cif: settings.cif, address: settings.address,
            phone: settings.phone, email: settings.email, website: settings.website,
        });
    }
};

// ─── Servicios clínicos ──────────────────────────────────────────────────────
export const getServices = async (): Promise<ClinicalService[]> => {
    const { data, error } = await supabase
        .from('clinical_services')
        .select('*')
        .eq('is_active', true)
        .order('name');
    if (error) throw error;
    return (data ?? []).map(mapService);
};

export const createService = async (service: Omit<ClinicalService, 'id'>): Promise<ClinicalService> => {
    const { data, error } = await supabase
        .from('clinical_services')
        .insert({ name: service.name, price: service.price })
        .select()
        .single();
    if (error) throw error;
    return mapService(data);
};

export const updateService = async (service: ClinicalService): Promise<ClinicalService> => {
    const { data, error } = await supabase
        .from('clinical_services')
        .update({ name: service.name, price: service.price })
        .eq('id', service.id)
        .select()
        .single();
    if (error) throw error;
    return mapService(data);
};

export const deleteService = async (id: string): Promise<boolean> => {
    const { error } = await supabase
        .from('clinical_services')
        .update({ is_active: false })
        .eq('id', id);
    if (error) throw error;
    return true;
};

// ─── Usuarios ───────────────────────────────────────────────────────────────
export const getUsers = async (): Promise<UserAccount[]> => {
    const { data, error } = await supabase
        .from('user_accounts')
        .select('*')
        .order('full_name');
    if (error) throw error;
    return (data ?? []).map(mapUser);
};

export const createUser = async (userData: Partial<UserAccount> & { password?: string }): Promise<UserAccount> => {
    const { data: { session } } = await supabase.auth.getSession();
    
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-create-user`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY
        },
        body: JSON.stringify(userData)
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Edge Function Error:', errorData);
        throw new Error(errorData.error || `Error ${response.status}: ${response.statusText}`);
    }

    const { user } = await response.json();
    return user;
};

export const updateUser = async (user: UserAccount): Promise<UserAccount> => {
    const { data, error } = await supabase
        .from('user_accounts')
        .update({
            full_name: user.fullName,
            email: user.email,
            role: user.role,
            status: user.status,
            therapist_id: user.therapistId,
        })
        .eq('id', user.id)
        .select()
        .single();
    if (error) throw error;
    return mapUser(data);
};

// ─── Logs de auditoría ────────────────────────────────────────────────────────
export const getAuditLogs = async (): Promise<AuditLog[]> => {
    const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(200);
    if (error) throw error;
    return (data ?? []).map(mapLog);
};

export const addAuditLog = async (log: Omit<AuditLog, 'id'>): Promise<void> => {
    await supabase.from('audit_logs').insert({
        user_id: log.userId || null,
        user_name: log.userName,
        action: log.action,
        details: log.details,
        timestamp: log.timestamp,
        category: log.category,
    });
};

// ─── Estadísticas de referidos (calculadas desde BD) ─────────────────────────
export const getReferralSourceStats = async (): Promise<{ source: string; count: number; percentage: number }[]> => {
    const { data, error } = await supabase
        .from('patients')
        .select('referral_source');
    if (error) throw error;

    const counts: Record<string, number> = {};
    (data ?? []).forEach((row: any) => {
        const src = row.referral_source || 'Otro';
        counts[src] = (counts[src] ?? 0) + 1;
    });

    const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
    return Object.entries(counts).map(([source, count]) => ({
        source,
        count,
        percentage: Math.round((count / total) * 100),
    }));
};
