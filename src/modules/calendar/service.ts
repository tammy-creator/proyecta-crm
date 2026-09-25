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
    price: row.price ?? row.clinical_services?.price ?? undefined,
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
        .select('*, clinical_services(price)')
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

import { broadcastCalendarChange } from './calendarSync';
export { checkAppointmentConflict, checkBatchAppointmentConflicts, subscribeToCalendarSync, broadcastCalendarChange } from './calendarSync';

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
            price: appointment.price ?? null,
        })
        .select()
        .single();
    if (error) throw error;
    const created = mapAppointment(data);

    broadcastCalendarChange({
        action: 'create',
        appointmentId: created.id,
        therapistId: created.therapistId,
        therapistName: created.therapistName,
        patientName: created.patientName,
        start: created.start,
        end: created.end
    }).catch(err => console.warn('Broadcast sync error on create:', err));

    return created;
};

export const createAppointmentsBatch = async (appointments: Omit<Appointment, 'id'>[]): Promise<Appointment[]> => {
    if (!appointments || appointments.length === 0) return [];

    const rows = appointments.map(appointment => ({
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
        price: appointment.price ?? null,
    }));

    const { data, error } = await supabase
        .from('appointments')
        .insert(rows)
        .select();

    if (error) throw error;

    const createdList = (data ?? []).map(mapAppointment);

    if (createdList.length > 0) {
        const first = createdList[0];
        broadcastCalendarChange({
            action: 'create',
            appointmentId: first.id,
            therapistId: first.therapistId,
            therapistName: first.therapistName,
            patientName: first.patientName ? `${first.patientName} (${createdList.length} citas)` : undefined,
            start: first.start,
            end: first.end
        }).catch(err => console.warn('Broadcast sync error on batch create:', err));
    }

    return createdList;
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
            price: appointment.price ?? null,
        })
        .eq('id', appointment.id)
        .select()
        .single();
    if (error) throw error;
    const updated = mapAppointment(data);

    // Synchronize linked transaction if one exists
    try {
        const { data: existingTx } = await supabase
            .from('transactions')
            .select('id, amount, category, status, method')
            .eq('appointment_id', updated.id)
            .maybeSingle();

        if (existingTx) {
            const txUpdatePayload: any = {};

            // 1. Sync amount
            if (updated.price != null && Number(updated.price) !== Number(existingTx.amount)) {
                txUpdatePayload.amount = Number(updated.price);
            }

            // 2. Sync category (type of session)
            if (updated.type && updated.type !== existingTx.category) {
                txUpdatePayload.category = updated.type;
            }

            // 3. Sync names and date
            if (updated.patientName) txUpdatePayload.patient_name = updated.patientName;
            if (updated.therapistName) txUpdatePayload.therapist_name = updated.therapistName;
            if (updated.start) txUpdatePayload.date = updated.start;

            // 4. Sync status with appointment status / isPaid:
            if (updated.status === 'Finalizada' || updated.status === 'Programada' || updated.isPaid === false) {
                if (existingTx.method === 'Fin de mes' || updated.isPaid === false) {
                    txUpdatePayload.status = 'Pendiente';
                }
            } else if (updated.status === 'Cobrada' || updated.isPaid === true) {
                txUpdatePayload.status = 'Pagado';
            }

            if (Object.keys(txUpdatePayload).length > 0) {
                await supabase
                    .from('transactions')
                    .update(txUpdatePayload)
                    .eq('id', existingTx.id);
            }
        }
    } catch (syncErr) {
        console.warn('Error synchronizing transaction on updateAppointment:', syncErr);
    }

    broadcastCalendarChange({
        action: 'update',
        appointmentId: updated.id,
        therapistId: updated.therapistId,
        therapistName: updated.therapistName,
        patientName: updated.patientName,
        start: updated.start,
        end: updated.end
    }).catch(err => console.warn('Broadcast sync error on update:', err));

    return updated;
};

export const deleteAppointment = async (appointmentId: string): Promise<void> => {
    // Delete associated transaction first to avoid dangling records (if any)
    await supabase.from('transactions').delete().eq('appointment_id', appointmentId);

    const { error } = await supabase
        .from('appointments')
        .delete()
        .eq('id', appointmentId);
    if (error) throw error;

    broadcastCalendarChange({
        action: 'delete',
        appointmentId
    }).catch(err => console.warn('Broadcast sync error on delete:', err));
};

export const markAppointmentPaid = async (appointmentId: string): Promise<void> => {
    const { data: currentAppt } = await supabase
        .from('appointments')
        .select('status, start_time, end_time')
        .eq('id', appointmentId)
        .maybeSingle();

    const updatePayload: { is_paid: boolean; status?: string } = { is_paid: true };
    if (currentAppt && !['Cancelada', 'Ausente', 'Bloqueada'].includes(currentAppt.status)) {
        updatePayload.status = 'Cobrada';
    }

    const { error } = await supabase
        .from('appointments')
        .update(updatePayload)
        .eq('id', appointmentId);
    if (error) throw error;

    // Sync linked transaction to Pagado
    try {
        await supabase
            .from('transactions')
            .update({ status: 'Pagado' })
            .eq('appointment_id', appointmentId);
    } catch (err) {
        console.warn('Error syncing tx on markAppointmentPaid:', err);
    }

    broadcastCalendarChange({
        action: 'status_change',
        appointmentId
    }).catch(err => console.warn('Broadcast sync error on markAppointmentPaid:', err));
};

export const setAppointmentPaidStatus = async (appointmentId: string, isPaid: boolean): Promise<void> => {
    const { data: currentAppt } = await supabase
        .from('appointments')
        .select('status, start_time, end_time')
        .eq('id', appointmentId)
        .maybeSingle();

    const updatePayload: { is_paid: boolean; status?: string } = { is_paid: isPaid };

    if (currentAppt && !['Cancelada', 'Ausente', 'Bloqueada'].includes(currentAppt.status)) {
        if (isPaid) {
            updatePayload.status = 'Cobrada';
        } else if (currentAppt.status === 'Cobrada') {
            const now = new Date();
            const end = currentAppt.end_time ? new Date(currentAppt.end_time) : null;
            updatePayload.status = (end && now < end) ? 'Programada' : 'Finalizada';
        }
    }

    const { error } = await supabase
        .from('appointments')
        .update(updatePayload)
        .eq('id', appointmentId);
    if (error) throw error;

    // Sync linked transaction status
    try {
        await supabase
            .from('transactions')
            .update({ status: isPaid ? 'Pagado' : 'Pendiente' })
            .eq('appointment_id', appointmentId);
    } catch (err) {
        console.warn('Error syncing tx on setAppointmentPaidStatus:', err);
    }

    broadcastCalendarChange({
        action: 'status_change',
        appointmentId
    }).catch(err => console.warn('Broadcast sync error on setAppointmentPaidStatus:', err));
};

export const getPendingRegistrationAppointments = async (daysBack: number = 1): Promise<Appointment[]> => {
    let query = supabase
        .from('appointments')
        .select('*')
        .in('status', ['Finalizada', 'Cobrada'])
        .is('session_diary', null)
        .order('start_time', { ascending: false });

    if (daysBack !== undefined && daysBack !== null && daysBack >= 0) {
        const sinceDate = new Date();
        sinceDate.setDate(sinceDate.getDate() - daysBack);
        sinceDate.setHours(0, 0, 0, 0);
        query = query.gte('start_time', sinceDate.toISOString());
    }

    const { data, error } = await query;
    
    if (error) throw error;
    
    // Also filter out empty strings in JS just in case, or use a more complex query
    return (data ?? [])
        .map(mapAppointment)
        .filter(a => !a.sessionDiary || a.sessionDiary.trim() === '');
};
