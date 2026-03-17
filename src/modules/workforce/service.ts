import { supabase } from '../../lib/supabase';
import { format, differenceInSeconds, parseISO } from 'date-fns';
import type { WorkLog, WorkLogEvent, WorkStatus, MonthlyReportSignature } from './types';

// ─── Helpers ─────────────────────────────────────────────────────────────────
const calculateDailySeconds = (events: WorkLogEvent[]): number => {
    let total = 0;
    let workStart: Date | null = null;
    events.forEach(e => {
        const time = parseISO(e.timestamp);
        switch (e.type) {
            case 'check-in':
            case 'break-end':
                workStart = time;
                break;
            case 'break-start':
            case 'check-out':
                if (workStart) {
                    total += differenceInSeconds(time, workStart);
                    workStart = null;
                }
                break;
        }
    });
    if (workStart) total += differenceInSeconds(new Date(), workStart);
    return total;
};

const mapEvents = (rows: any[]): WorkLogEvent[] =>
    rows.map(r => ({ type: r.type, timestamp: r.timestamp }));

// ─── Work Logs ───────────────────────────────────────────────────────────────
export const getTodayLog = async (therapistId: string): Promise<WorkLog | null> => {
    const today = format(new Date(), 'yyyy-MM-dd');

    let { data: log, error } = await supabase
        .from('work_logs')
        .select('*, work_log_events(*)')
        .eq('therapist_id', therapistId)
        .eq('date', today)
        .maybeSingle();

    if (error) throw error;

    if (!log) {
        const { data: newLog, error: createError } = await supabase
            .from('work_logs')
            .insert({ therapist_id: therapistId, date: today, total_worked_minutes: 0 })
            .select('*, work_log_events(*)')
            .single();
        if (createError) throw createError;
        log = newLog;
    }

    return {
        id: log.id,
        therapistId: log.therapist_id,
        date: log.date,
        events: mapEvents(log.work_log_events ?? []),
        totalWorkedMinutes: log.total_worked_minutes,
    };
};

export const getCurrentStatus = async (therapistId: string): Promise<WorkStatus> => {
    const log = await getTodayLog(therapistId);
    if (!log || log.events.length === 0) return 'offline';
    const last = log.events[log.events.length - 1];
    if (last.type === 'check-in' || last.type === 'break-end') return 'working';
    if (last.type === 'break-start') return 'break';
    return 'offline';
};

export const getLiveWorkStats = async (
    therapistId: string
): Promise<{ status: WorkStatus; totalSeconds: number; lastEventTime?: string }> => {
    const log = await getTodayLog(therapistId);
    if (!log) return { status: 'offline', totalSeconds: 0 };
    const status = await getCurrentStatus(therapistId);
    const totalSeconds = calculateDailySeconds(log.events);
    const lastEvent = log.events.length > 0 ? log.events[log.events.length - 1].timestamp : undefined;
    return { status, totalSeconds, lastEventTime: lastEvent };
};

export const addEvent = async (therapistId: string, type: WorkLogEvent['type']): Promise<WorkLog> => {
    const log = await getTodayLog(therapistId);
    if (!log) throw new Error('No log found for today');

    await supabase.from('work_log_events').insert({
        work_log_id: log.id,
        type,
        timestamp: new Date().toISOString(),
    });

    if (type === 'check-out') {
        const updatedLog = await getTodayLog(therapistId);
        const totalMinutes = Math.floor(calculateDailySeconds(updatedLog!.events) / 60);
        await supabase.from('work_logs').update({ total_worked_minutes: totalMinutes }).eq('id', log.id);
    }

    return (await getTodayLog(therapistId))!;
};

export const getMonthlyReport = async (therapistId: string, month: string): Promise<WorkLog[]> => {
    const startDate = `${month}-01`;
    const lastDay = new Date(parseISO(startDate));
    lastDay.setMonth(lastDay.getMonth() + 1);
    lastDay.setDate(0);
    const endDate = format(lastDay, 'yyyy-MM-dd');

    const { data, error } = await supabase
        .from('work_logs')
        .select('*, work_log_events(*)')
        .eq('therapist_id', therapistId)
        .gte('date', startDate)
        .lte('date', endDate);
    if (error) throw error;
    return (data ?? []).map(row => ({
        id: row.id,
        therapistId: row.therapist_id,
        date: row.date,
        events: mapEvents(row.work_log_events ?? []),
        totalWorkedMinutes: row.total_worked_minutes,
    }));
};

// ─── Firmas mensuales ─────────────────────────────────────────────────────────
export const signMonthlyReport = async (
    therapistId: string,
    month: string,
    totalHours: number
): Promise<MonthlyReportSignature> => {
    const existing = await getSignature(therapistId, month);
    if (existing) throw new Error('Este reporte mensual ya ha sido firmado.');

    const declaration = 'Declaro que las horas registradas en este reporte son veraces y corresponden a mi actividad laboral efectiva durante el periodo indicado.';
    const { data, error } = await supabase
        .from('monthly_report_signatures')
        .insert({ therapist_id: therapistId, month, total_hours: totalHours, signed_at: new Date().toISOString(), declaration })
        .select()
        .single();
    if (error) throw error;
    return { id: data.id, therapistId: data.therapist_id, month: data.month, totalHours: data.total_hours, signedAt: data.signed_at, declaration: data.declaration };
};

export const getSignature = async (therapistId: string, month: string): Promise<MonthlyReportSignature | undefined> => {
    const { data, error } = await supabase
        .from('monthly_report_signatures')
        .select('*')
        .eq('therapist_id', therapistId)
        .eq('month', month)
        .maybeSingle();
    if (error || !data) return undefined;
    return { id: data.id, therapistId: data.therapist_id, month: data.month, totalHours: data.total_hours, signedAt: data.signed_at, declaration: data.declaration };
};
