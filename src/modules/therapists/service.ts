import { supabase } from '../../lib/supabase';
import { type Therapist } from './types';

const mapTherapist = (row: any): Therapist => {
    let avatarUrl = row.avatar_url;
    if (avatarUrl && !avatarUrl.startsWith('http')) {
        const baseUrl = import.meta.env.VITE_AVATARS_SERVER_URL || '';
        avatarUrl = `${baseUrl}${avatarUrl}`;
    }

    return {
        id: row.id,
        fullName: row.full_name,
        specialty: row.specialty,
        licenseNumber: row.license_number,
        dni: row.dni,
        email: row.email,
        phone: row.phone,
        color: row.color ?? '#BCE4EA',
        avatarUrl: avatarUrl,
        sessionStartOffset: row.session_start_offset ?? 0,
        schedule: row.schedule ?? [],
    };
};

export const getTherapists = async (): Promise<Therapist[]> => {
    const { data, error } = await supabase
        .from('therapists')
        .select('*')
        .order('full_name');
    if (error) throw error;
    return (data ?? []).map(mapTherapist);
};

export const createTherapist = async (therapist: Omit<Therapist, 'id'>): Promise<Therapist> => {
    const { data, error } = await supabase
        .from('therapists')
        .insert({
            full_name: therapist.fullName,
            specialty: therapist.specialty,
            license_number: therapist.licenseNumber,
            dni: therapist.dni,
            email: therapist.email,
            phone: therapist.phone,
            color: therapist.color,
            avatar_url: therapist.avatarUrl,
            session_start_offset: therapist.sessionStartOffset ?? 0,
            schedule: therapist.schedule ?? [],
        })
        .select()
        .single();
    if (error) throw error;
    return mapTherapist(data);
};

export const updateTherapist = async (therapist: Therapist): Promise<Therapist> => {
    const { data, error } = await supabase
        .from('therapists')
        .update({
            full_name: therapist.fullName,
            specialty: therapist.specialty,
            license_number: therapist.licenseNumber,
            dni: therapist.dni,
            email: therapist.email,
            phone: therapist.phone,
            color: therapist.color,
            avatar_url: therapist.avatarUrl,
            session_start_offset: therapist.sessionStartOffset ?? 0,
            schedule: therapist.schedule ?? [],
        })
        .eq('id', therapist.id)
        .select()
        .single();
    if (error) throw error;
    return mapTherapist(data);
};

export const changePassword = async (_userId: string, _currentPassword: string, newPassword: string): Promise<void> => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
};

export const adminResetPassword = async (therapistId: string, newPassword: string): Promise<void> => {
    try {
        const { data, error } = await supabase.functions.invoke('admin-reset-password', {
            body: { userId: therapistId, newPassword }
        });

        if (error) {
            console.error('Edge Function Invoke Error:', error);
            throw error; 
        }

        if (data?.error) {
            console.error('Edge Function Business Error:', data.error);
            throw new Error(data.error);
        }
    } catch (err: any) {
        console.error('adminResetPassword catch:', err);
        throw err;
    }
};

export const uploadTherapistAvatar = async (therapistId: string, file: File): Promise<string> => {
    // Saneamos el nombre para el almacenamiento
    const fileExt = file.name.split('.').pop();
    const fileName = `${therapistId}_${Date.now()}.${fileExt}`;
    const filePath = `${fileName}`; // Ya estamos en un bucket específico

    console.warn("[Storage Migration] Therapist avatar upload is disabled. Supabase bucket is gone.");
    throw new Error("La subida de avatares a Supabase ha sido desactivada. Por favor, usa el nuevo servidor.");
    
    /* 
    const { error: uploadError } = await supabase.storage
        .from('therapist-avatars') 
        .upload(filePath, file, {
            upsert: true,
            contentType: file.type
        });

    if (uploadError) {
        console.error("Error uploading avatar:", uploadError);
        throw uploadError;
    }

    const { data } = supabase.storage
        .from('therapist-avatars')
        .getPublicUrl(filePath);

    return data.publicUrl;
    */
};

