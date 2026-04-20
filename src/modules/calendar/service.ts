import { supabase } from '../../lib/supabase';
import { type Appointment } from './types';

const mapAppointment = (row: any): Appointment => ({
    id: row.id,
    patientId: row.patient_id,
    therapistId: row.therapist_id,
    serviceId: row.service_id,
    patientName: row.patient_name ?? '',
    therapistName: row.therapist_name ?? '',
    start: row.start_time,
    end: row.end_time,
    status: row.status,
    type: row.type ?? '',
    price: row.clinical_services?.price ?? undefined,
    notes: row.notes,
    sessionDiary: row.session_diary,
    isPaid: row.is_paid ?? false,
    cancellationReason: row.cancellation_reason,
    voiceNoteUrl: row.voice_note_url,
    notificacionRecordatorioEnviada: row.notificacion_recordatorio_enviada,
    recurrence: row.recurrence,
});


export const getAppointments = async (start: Date, end: Date, therapistId?: string): Promise<Appointment[]> => {
    let query = supabase
        .from('appointments')
        .select('*, clinical_services(price)')
        .gte('start_time', start.toISOString())
        .lte('start_time', end.toISOString());
    
    if (therapistId && therapistId !== 'all') {
        query = query.eq('therapist_id', therapistId);
    }

    const { data, error } = await query.order('start_time');
    if (error) throw error;
    return (data ?? []).map(mapAppointment);
};


export const getAppointmentsByPatient = async (patientId: string): Promise<Appointment[]> => {
    const { data, error } = await supabase
        .from('appointments')
        .select('*')
        .eq('patient_id', patientId)
        .order('start_time', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapAppointment);
};

export const getUnpaidAppointments = async (therapistId?: string): Promise<Appointment[]> => {
    let query = supabase
        .from('appointments')
        .select('*, clinical_services(price)')
        .eq('is_paid', false);
    
    if (therapistId && therapistId !== 'all') {
        query = query.eq('therapist_id', therapistId);
    }

    const { data, error } = await query.order('start_time', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapAppointment);
};

export const createAppointment = async (appointment: Omit<Appointment, 'id'>): Promise<Appointment> => {
    const { data, error } = await supabase
        .from('appointments')
        .insert({
            patient_id: appointment.patientId || null,
            therapist_id: appointment.therapistId,
            service_id: appointment.serviceId || null,
            patient_name: appointment.patientName,
            therapist_name: appointment.therapistName,
            start_time: appointment.start,
            end_time: appointment.end,
            status: appointment.status,
            type: appointment.type,
            notes: appointment.notes,
            session_diary: appointment.sessionDiary,
            is_paid: appointment.isPaid ?? false,
            cancellation_reason: appointment.cancellationReason,
            voice_note_url: appointment.voiceNoteUrl,
            recurrence: appointment.recurrence ?? null,
            notificacion_recordatorio_enviada: appointment.notificacionRecordatorioEnviada ?? false,
        })
        .select()
        .single();
    if (error) throw error;
    return mapAppointment(data);
};

export const updateAppointment = async (appointment: Appointment): Promise<Appointment> => {
    const { data, error } = await supabase
        .from('appointments')
        .update({
            patient_id: appointment.patientId || null,
            therapist_id: appointment.therapistId,
            service_id: appointment.serviceId || null,
            patient_name: appointment.patientName,
            therapist_name: appointment.therapistName,
            start_time: appointment.start,
            end_time: appointment.end,
            status: appointment.status,
            type: appointment.type,
            notes: appointment.notes,
            session_diary: appointment.sessionDiary,
            is_paid: appointment.isPaid ?? false,
            cancellation_reason: appointment.cancellationReason,
            voice_note_url: appointment.voiceNoteUrl,
            recurrence: appointment.recurrence ?? null,
            notificacion_recordatorio_enviada: appointment.notificacionRecordatorioEnviada ?? false,
        })
        .eq('id', appointment.id)
        .select()
        .single();
    if (error) throw error;
    return mapAppointment(data);
};

export const deleteAppointment = async (appointmentId: string): Promise<void> => {
    // Delete associated transaction first to avoid dangling records (if any)
    await supabase.from('transactions').delete().eq('appointment_id', appointmentId);

    const { error } = await supabase
        .from('appointments')
        .delete()
        .eq('id', appointmentId);
    if (error) throw error;
};

export const markAppointmentPaid = async (appointmentId: string): Promise<void> => {
    const { error } = await supabase
        .from('appointments')
        .update({ is_paid: true })
        .eq('id', appointmentId);
    if (error) throw error;
};

export const setAppointmentPaidStatus = async (appointmentId: string, isPaid: boolean): Promise<void> => {
    const { error } = await supabase
        .from('appointments')
        .update({ is_paid: isPaid })
        .eq('id', appointmentId);
    if (error) throw error;
};
