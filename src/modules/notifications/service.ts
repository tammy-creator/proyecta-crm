import { getAppointments } from '../calendar/service';
import { getMonthlyReport, getSignature } from '../workforce/service';
import { getTherapists } from '../therapists/service';
import { subMonths } from 'date-fns';
import { supabase } from '../../lib/supabase';
import type { Notification } from './types';

const DISMISSED_KEY = 'proyecta_dismissed_ids';

export const getDismissedIds = (): string[] => {
    const data = localStorage.getItem(DISMISSED_KEY);
    return data ? JSON.parse(data) : [];
};

export const dismissNotification = async (id: string, isPersistent?: boolean) => {
    const ids = getDismissedIds();
    if (!ids.includes(id)) {
        ids.push(id);
        localStorage.setItem(DISMISSED_KEY, JSON.stringify(ids));
    }

    if (isPersistent) {
        // Instead of deleting, we mark as dismissed in the DB
        try {
            await supabase
                .from('system_notifications')
                .update({ is_dismissed: true })
                .eq('id', id);
        } catch (error) {
            console.error('Error dismissing notification in DB:', error);
        }
    }
};

export const clearOldDismissedIds = () => {
    // No-op for now
};

export const getNotifications = async (role: 'ADMIN' | 'THERAPIST', userId: string): Promise<Notification[]> => {
    const notifications: Notification[] = [];
    
    // 0. FETCH PERSISTENT NOTIFICATIONS FROM DB
    try {
        const { data: dbNotifications, error } = await supabase
            .from('system_notifications')
            .select('*')
            .eq('is_dismissed', false) // Only active notifications
            .order('created_at', { ascending: false });

        if (!error && dbNotifications) {
            dbNotifications.forEach(n => {
                notifications.push({
                    id: n.id,
                    type: (n.type as any) || 'INFO',
                    title: n.title,
                    message: n.message,
                    date: new Date(n.created_at),
                    read: n.read || false,
                    priority: 'HIGH',
                });
            });
        }
    } catch (error) {
        console.error('Error fetching persistent notifications:', error);
    }

    const now = new Date();
    const lastMonth = subMonths(now, 1);
    const lastMonthStr = lastMonth.toISOString().slice(0, 7); // YYYY-MM

    // 1. ALERTAS PARA ADMIN
    if (role === 'ADMIN') {
        // A. Citas canceladas (SOLO HOY)
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);

        const allAppointments = await getAppointments(startOfDay, endOfDay);
        const recentCancellations = allAppointments.filter(a =>
            a.status === 'Cancelada'
        );

        recentCancellations.forEach(c => {
            notifications.push({
                id: `cancel-${c.id}`,
                type: 'CANCEL',
                title: 'Cita Cancelada',
                message: `La cita con ${c.patientName} (${c.therapistName}) fue cancelada. Motivo: ${c.cancellationReason || 'No especificado'}.`,
                date: new Date(c.start),
                read: false,
                priority: 'HIGH',
            });
        });

        // B. Informes mensuales sin firmar (mes anterior)
        try {
            const therapists = await getTherapists();
            for (const t of therapists) {
                const sig = await getSignature(t.id, lastMonthStr);
                if (!sig) {
                    const report = await getMonthlyReport(t.id, lastMonthStr);
                    if (report.length > 0) {
                        notifications.push({
                            id: `unsigned-${t.id}-${lastMonthStr}`,
                            type: 'REPORT',
                            title: 'Reporte Mensual Pendiente',
                            message: `${t.fullName} no ha firmado su reporte de horas de ${lastMonthStr}.`,
                            date: now,
                            read: false,
                            priority: 'MEDIUM',
                            actionLink: '/workforce',
                        });
                    }
                }
            }
        } catch (_) {
            // Si no hay terapeutas aún, ignorar silenciosamente
        }
    }

    // 2. ALERTAS PARA TERAPEUTA
    if (role === 'THERAPIST') {
        // A. Firma pendiente del mes anterior
        const mySig = await getSignature(userId, lastMonthStr);
        const myReport = await getMonthlyReport(userId, lastMonthStr);

        if (!mySig && myReport.length > 0) {
            notifications.push({
                id: `my-unsigned-${lastMonthStr}`,
                type: 'REPORT',
                title: 'Firma Pendiente',
                message: `Tienes pendiente firmar tu reporte de horas de ${lastMonthStr}.`,
                date: now,
                read: false,
                priority: 'HIGH',
                actionLink: 'OPEN_SIGNING_MODAL',
            });
        }

        // B. Diarios de sesión faltantes (SOLO HOY)
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const myAppts = await getAppointments(startOfDay, now);
        const missingDiary = myAppts.filter(a =>
            a.therapistId === userId &&
            (a.status === 'Finalizada' || a.status === 'Cobrada') &&
            !a.sessionDiary
        );

        missingDiary.forEach(a => {
            notifications.push({
                id: `missing-diary-${a.id}`,
                type: 'DIARY',
                title: 'Diario de Sesión Faltante',
                message: `No has registrado el diario clínico para la sesión con ${a.patientName} del ${new Date(a.start).toLocaleDateString('es-ES')}.`,
                date: new Date(a.start),
                read: false,
                priority: 'MEDIUM',
            });
        });
    }

    return notifications.sort((a, b) => b.date.getTime() - a.date.getTime());
};

export const getAIActivity = async (days: number = 3): Promise<Notification[]> => {
    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0); // From the beginning of the period

    try {
        // Super broad filter to debug: catch common bot variants and titles
        const { data, error } = await supabase
            .from('system_notifications')
            .select('*')
            .or('type.ilike.AI_LOG,type.ilike.WHATSAPP,type.ilike.BOT,title.ilike.%Cita%')
            .order('created_at', { ascending: false })
            .limit(20);

        if (error) throw error;

        return (data || []).map(n => ({
            id: n.id,
            type: 'AI_LOG',
            title: n.title,
            message: n.message,
            date: new Date(n.created_at),
            read: n.read || false,
            priority: 'LOW',
        }));
    } catch (error) {
        console.error('Error fetching AI activity:', error);
        return [];
    }
};
