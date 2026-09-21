import { format, parseISO } from 'date-fns';
import { supabase } from '../../lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface CalendarSyncEvent {
    action: 'create' | 'update' | 'delete' | 'status_change';
    appointmentId?: string;
    therapistId?: string;
    therapistName?: string;
    patientName?: string;
    start?: string;
    end?: string;
    authorName?: string;
    senderId?: string;
    timestamp: number;
}

export interface ConflictCheckResult {
    hasConflict: boolean;
    conflictingAppointment?: {
        id: string;
        patientName: string;
        therapistName: string;
        start: string;
        end: string;
        status: string;
    };
    message?: string;
}

type SyncListener = (event: CalendarSyncEvent) => void;

const CLIENT_ID: string = typeof window !== 'undefined'
    ? (window.sessionStorage.getItem('proyecta_client_id') || (() => {
        const id = 'client_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();
        try { window.sessionStorage.setItem('proyecta_client_id', id); } catch (_) {}
        return id;
    })())
    : 'server_' + Math.random().toString(36).substring(2, 9);

let realtimeChannel: RealtimeChannel | null = null;
let broadcastChannel: BroadcastChannel | null = null;
const listeners = new Set<SyncListener>();

/**
 * Ensures the singleton Supabase Realtime and Browser BroadcastChannel are active.
 */
function ensureSyncChannels() {
    if (typeof window === 'undefined') return;

    // 1. Browser-level BroadcastChannel for instantaneous intra-device sync across tabs
    if (!broadcastChannel && 'BroadcastChannel' in window) {
        try {
            broadcastChannel = new BroadcastChannel('proyecta_calendar_channel');
            broadcastChannel.onmessage = (messageEvent) => {
                const event = messageEvent.data as CalendarSyncEvent;
                if (event && event.senderId !== CLIENT_ID) {
                    listeners.forEach(fn => fn(event));
                }
            };
        } catch (e) {
            console.warn('BroadcastChannel not supported or failed to initialize:', e);
        }
    }

    // 2. Supabase Realtime channel for inter-device sync across computers
    if (!realtimeChannel) {
        realtimeChannel = supabase
            .channel('calendar_sync_v1')
            .on('broadcast', { event: 'calendar_changed' }, (payload) => {
                const event = payload.payload as CalendarSyncEvent;
                if (event && event.senderId !== CLIENT_ID) {
                    listeners.forEach(fn => fn(event));
                }
            })
            // Extra safety net: listen to Postgres changes if publication is active or enabled
            .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, (payload) => {
                const now = Date.now();
                const event: CalendarSyncEvent = {
                    action: (payload.eventType?.toLowerCase() as any) || 'update',
                    appointmentId: (payload.new as any)?.id || (payload.old as any)?.id,
                    therapistId: (payload.new as any)?.therapist_id,
                    timestamp: now
                };
                listeners.forEach(fn => fn(event));
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance' }, () => {
                const now = Date.now();
                const event: CalendarSyncEvent = {
                    action: 'update',
                    timestamp: now
                };
                listeners.forEach(fn => fn(event));
            })
            .subscribe((_status, err) => {
                if (err) {
                    console.error('Supabase calendar sync subscription error:', err);
                }
            });
    }
}

/**
 * Subscribes a callback to calendar sync updates.
 * Returns an unsubscription function.
 */
export function subscribeToCalendarSync(callback: SyncListener): () => void {
    ensureSyncChannels();
    listeners.add(callback);

    return () => {
        listeners.delete(callback);
        if (listeners.size === 0) {
            if (broadcastChannel) {
                broadcastChannel.close();
                broadcastChannel = null;
            }
            if (realtimeChannel) {
                supabase.removeChannel(realtimeChannel);
                realtimeChannel = null;
            }
        }
    };
}

/**
 * Broadcasts a calendar modification event to all connected computers, tabs, and local listeners.
 */
export async function broadcastCalendarChange(eventData: Omit<CalendarSyncEvent, 'timestamp' | 'senderId'>): Promise<void> {
    ensureSyncChannels();
    const event: CalendarSyncEvent = {
        ...eventData,
        senderId: CLIENT_ID,
        timestamp: Date.now()
    };

    // 1. Dispatch local window event
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('calendar-refresh', { detail: event }));
    }

    // 2. Broadcast to other tabs on the same computer
    if (broadcastChannel) {
        try {
            broadcastChannel.postMessage(event);
        } catch (e) {
            console.warn('Error posting message to BroadcastChannel:', e);
        }
    }

    // 3. Broadcast to all other computers via Supabase Realtime
    if (realtimeChannel) {
        try {
            await realtimeChannel.send({
                type: 'broadcast',
                event: 'calendar_changed',
                payload: event
            });
        } catch (e) {
            console.error('Error broadcasting calendar change over Supabase Realtime:', e);
        }
    }
}

/**
 * Checks against the database whether the therapist already has an overlapping active appointment.
 * 
 * Interval overlap condition:
 * (start_time < newEnd AND end_time > newStart) AND status != 'Cancelada'
 * 
 * If excludeAppointmentId is provided (e.g. editing an existing appointment), that appointment is excluded.
 */
export async function checkAppointmentConflict({
    therapistId,
    start,
    end,
    excludeAppointmentId,
}: {
    therapistId: string;
    start: string; // ISO string
    end: string;   // ISO string
    excludeAppointmentId?: string;
}): Promise<ConflictCheckResult> {
    if (!therapistId || !start || !end) {
        return { hasConflict: false };
    }

    try {
        let query = supabase
            .from('appointments')
            .select('id, patient_name, therapist_name, start_time, end_time, status')
            .eq('therapist_id', therapistId)
            .neq('status', 'Cancelada')
            .lt('start_time', end)
            .gt('end_time', start);

        if (excludeAppointmentId) {
            query = query.neq('id', excludeAppointmentId);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Error querying appointment conflicts:', error);
            return { hasConflict: false };
        }

        if (data && data.length > 0) {
            const conflict = data[0];
            const startStr = format(parseISO(conflict.start_time), 'HH:mm');
            const endStr = format(parseISO(conflict.end_time), 'HH:mm');
            const patientName = conflict.patient_name ? conflict.patient_name.trim() : 'otro paciente';
            const therapistName = conflict.therapist_name ? conflict.therapist_name.trim() : 'La terapeuta';

            return {
                hasConflict: true,
                conflictingAppointment: {
                    id: conflict.id,
                    patientName: conflict.patient_name,
                    therapistName: conflict.therapist_name,
                    start: conflict.start_time,
                    end: conflict.end_time,
                    status: conflict.status
                },
                message: `${therapistName} ya tiene una cita reservada de ${startStr} a ${endStr} (${patientName}). No es posible duplicar el horario.`
            };
        }

        return { hasConflict: false };
    } catch (err) {
        console.error('Unexpected error in checkAppointmentConflict:', err);
        return { hasConflict: false };
    }
}
