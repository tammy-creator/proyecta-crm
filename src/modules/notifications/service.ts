import { getAppointments } from '../calendar/service';
import { getMonthlyReport, getSignature } from '../workforce/service';
import { getTherapists } from '../therapists/service';
import { subMonths, endOfMonth, isPast } from 'date-fns';
import type { Notification } from './types';

export const getNotifications = async (role: 'ADMIN' | 'THERAPIST', userId: string): Promise<Notification[]> => {
    const notifications: Notification[] = [];
    const now = new Date();
    const lastMonth = subMonths(now, 1);
    const lastMonthStr = lastMonth.toISOString().slice(0, 7); // YYYY-MM

    // 1. ALERTAS PARA ADMIN
    if (role === 'ADMIN') {
        // A. Citas canceladas (últimas 2 semanas)
        const allAppointments = await getAppointments(subMonths(now, 1), endOfMonth(now));
        const recentCancellations = allAppointments.filter(a =>
            a.status === 'Cancelada' &&
            new Date(a.start) > subMonths(now, 0.5)
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

        // B. Diarios de sesión faltantes
        const myAppts = await getAppointments(subMonths(now, 1), now);
        const missingDiary = myAppts.filter(a =>
            a.therapistId === userId &&
            (a.status === 'Finalizada' || a.status === 'Cobrada') &&
            isPast(new Date(a.start)) &&
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
