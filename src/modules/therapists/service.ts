import { supabase } from '../../lib/supabase';
import { type Therapist, type SpecialSchedule, type WorkingHours } from './types';

const mapTherapist = (row: any): Therapist => {
    let avatarUrl = row.avatar_url;
    if (avatarUrl && !avatarUrl.startsWith('http')) {
        const baseUrl = import.meta.env.VITE_AVATARS_SERVER_URL || '';
        avatarUrl = `${baseUrl}${avatarUrl}`;
    }

    const rawSchedule = Array.isArray(row.schedule) ? row.schedule : [];
    const isInactiveMeta = rawSchedule.some((s: any) => s.day === '__status__' && s.isActive === false);
    const isNoTimeTrackingMeta = rawSchedule.some((s: any) => s.day === '__time_tracking__' && s.hasTimeTracking === false);
    const cleanSchedule = rawSchedule.filter((s: any) => !s.day?.startsWith('__'));
    const isActive = row.is_active !== undefined ? Boolean(row.is_active) : !isInactiveMeta;
    const hasTimeTracking = !isNoTimeTrackingMeta;
    const specialSchedules = Array.isArray(row.special_schedules) ? row.special_schedules : [];

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
        schedule: cleanSchedule,
        specialSchedules: specialSchedules,
        isActive: isActive,
        hasTimeTracking: hasTimeTracking,
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
    let scheduleToSave = [...(therapist.schedule ?? [])].filter((s: any) => !s.day?.startsWith('__'));
    if (therapist.isActive === false) {
        scheduleToSave.push({ day: '__status__', enabled: false, isActive: false } as any);
    }
    if (therapist.hasTimeTracking === false) {
        scheduleToSave.push({ day: '__time_tracking__', enabled: false, hasTimeTracking: false } as any);
    }

    const basePayload: any = {
        full_name: therapist.fullName,
        specialty: therapist.specialty,
        license_number: therapist.licenseNumber,
        dni: therapist.dni,
        email: therapist.email,
        phone: therapist.phone,
        color: therapist.color,
        avatar_url: therapist.avatarUrl,
        session_start_offset: therapist.sessionStartOffset ?? 0,
        schedule: scheduleToSave,
        special_schedules: therapist.specialSchedules ?? [],
    };

    // Try inserting with is_active if column exists in database
    try {
        const { data, error } = await supabase
            .from('therapists')
            .insert({ ...basePayload, is_active: therapist.isActive !== false })
            .select()
            .single();
        if (!error && data) return mapTherapist(data);
    } catch (_) {}

    const { data, error } = await supabase
        .from('therapists')
        .insert(basePayload)
        .select()
        .single();
    if (error) throw error;
    return mapTherapist(data);
};

export const updateTherapist = async (therapist: Therapist): Promise<Therapist> => {
    let scheduleToSave = [...(therapist.schedule ?? [])].filter((s: any) => !s.day?.startsWith('__'));
    if (therapist.isActive === false) {
        scheduleToSave.push({ day: '__status__', enabled: false, isActive: false } as any);
    }
    if (therapist.hasTimeTracking === false) {
        scheduleToSave.push({ day: '__time_tracking__', enabled: false, hasTimeTracking: false } as any);
    }

    const basePayload: any = {
        full_name: therapist.fullName,
        specialty: therapist.specialty,
        license_number: therapist.licenseNumber,
        dni: therapist.dni,
        email: therapist.email,
        phone: therapist.phone,
        color: therapist.color,
        avatar_url: therapist.avatarUrl,
        session_start_offset: therapist.sessionStartOffset ?? 0,
        schedule: scheduleToSave,
        special_schedules: therapist.specialSchedules ?? [],
    };

    // Try updating with is_active if column exists in database
    try {
        const { data, error } = await supabase
            .from('therapists')
            .update({ ...basePayload, is_active: therapist.isActive !== false })
            .eq('id', therapist.id)
            .select()
            .single();
        if (!error && data) return mapTherapist(data);
    } catch (_) {}

    const { data, error } = await supabase
        .from('therapists')
        .update(basePayload)
        .eq('id', therapist.id)
        .select()
        .single();
    if (error) throw error;
    return mapTherapist(data);
};

export const updateTherapistTimeTracking = async (therapistId: string, hasTimeTracking: boolean): Promise<void> => {
    const { data: row, error: fetchErr } = await supabase
        .from('therapists')
        .select('schedule')
        .eq('id', therapistId)
        .single();
    if (fetchErr) throw fetchErr;

    const rawSchedule = Array.isArray(row?.schedule) ? row.schedule : [];
    const newSchedule = rawSchedule.filter((s: any) => s.day !== '__time_tracking__');
    if (!hasTimeTracking) {
        newSchedule.push({ day: '__time_tracking__', enabled: false, hasTimeTracking: false });
    }

    const { error: updateErr } = await supabase
        .from('therapists')
        .update({ schedule: newSchedule, updated_at: new Date().toISOString() })
        .eq('id', therapistId);
    if (updateErr) throw updateErr;
};

export const countTherapistAppointments = async (therapistId: string): Promise<number> => {
    const { count, error } = await supabase
        .from('appointments')
        .select('*', { count: 'exact', head: true })
        .eq('therapist_id', therapistId);
    if (error) {
        console.error("Error counting therapist appointments:", error);
        return 0;
    }
    return count || 0;
};

export const deleteTherapist = async (id: string): Promise<void> => {
    const appointmentCount = await countTherapistAppointments(id);
    if (appointmentCount > 0) {
        throw new Error(`Esta profesional tiene ${appointmentCount} cita(s) asociadas en su historial. Por seguridad clínica no se puede borrar su ficha; en su lugar, márcala como Inactiva.`);
    }

    // Clean up attendance records if any
    await supabase.from('attendance').delete().eq('therapist_id', id);

    const { error } = await supabase
        .from('therapists')
        .delete()
        .eq('id', id);
    if (error) throw error;
};

export const setTherapistActiveStatus = async (therapist: Therapist, isActive: boolean): Promise<Therapist> => {
    return updateTherapist({ ...therapist, isActive });
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

export const saveSpecialSchedulesForTherapists = async (
    therapistIds: string[],
    dates: string[], // ['2026-10-30', '2026-11-02', '2026-11-03']
    blocks: WorkingHours[],
    enabled: boolean = true,
    note?: string
): Promise<void> => {
    if (therapistIds.length === 0 || dates.length === 0) return;

    const { data: rows, error: fetchErr } = await supabase
        .from('therapists')
        .select('id, special_schedules')
        .in('id', therapistIds);

    if (fetchErr) throw fetchErr;

    const updates = (rows || []).map(row => {
        let specials: SpecialSchedule[] = Array.isArray(row.special_schedules) ? [...row.special_schedules] : [];

        dates.forEach(dateStr => {
            // Eliminar si ya existía para esa fecha
            specials = specials.filter(s => s.date !== dateStr);
            // Insertar nueva excepción
            specials.push({
                id: `${dateStr}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                date: dateStr,
                enabled,
                blocks,
                note: note || undefined
            });
        });

        // Ordenar por fecha ascendente
        specials.sort((a, b) => a.date.localeCompare(b.date));

        return supabase
            .from('therapists')
            .update({ special_schedules: specials, updated_at: new Date().toISOString() })
            .eq('id', row.id);
    });

    const results = await Promise.all(updates);
    const hasError = results.find(r => r.error);
    if (hasError?.error) throw hasError.error;
};

export const removeSpecialScheduleForTherapists = async (
    therapistIds: string[],
    date: string
): Promise<void> => {
    if (therapistIds.length === 0 || !date) return;

    const { data: rows, error: fetchErr } = await supabase
        .from('therapists')
        .select('id, special_schedules')
        .in('id', therapistIds);

    if (fetchErr) throw fetchErr;

    const updates = (rows || []).map(row => {
        const specials: SpecialSchedule[] = (Array.isArray(row.special_schedules) ? row.special_schedules : [])
            .filter((s: SpecialSchedule) => s.date !== date);

        return supabase
            .from('therapists')
            .update({ special_schedules: specials, updated_at: new Date().toISOString() })
            .eq('id', row.id);
    });

    const results = await Promise.all(updates);
    const hasError = results.find(r => r.error);
    if (hasError?.error) throw hasError.error;
};

