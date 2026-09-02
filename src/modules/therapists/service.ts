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
    const sanitizePath = (str: string) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '');
    const fileExt = file.name.split('.').pop() || 'png';
    const cleanFileName = sanitizePath(`${therapistId}_${Date.now()}.${fileExt}`);

    const webhookUrl = import.meta.env.VITE_N8N_UPLOAD_WEBHOOK_URL;
    if (!webhookUrl) {
        throw new Error("La URL del webhook de n8n no está configurada en las variables de entorno.");
    }

    const formData = new FormData();
    formData.append('file', file, cleanFileName);
    formData.append('patientId', '../therapist_avatars_backup');
    formData.append('fileName', cleanFileName);

    const response = await fetch(webhookUrl, {
        method: 'POST',
        body: formData
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Error al subir el avatar al servidor propio (${response.status}): ${errText}`);
    }

    const baseUrl = import.meta.env.VITE_AVATARS_SERVER_URL || '';
    return `${baseUrl}${cleanFileName}`;
};

