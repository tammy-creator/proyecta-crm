import { supabase } from '../../lib/supabase';
import { format, differenceInSeconds, parseISO, addHours, startOfDay, endOfDay, isWithinInterval, set } from 'date-fns';
import { addAuditLog } from '../admin/service';
import type { WorkLog, WorkLogEvent, WorkStatus, MonthlyReportSignature, Attendance, AttendanceType } from './types';
import type { DaySchedule, WorkingHours } from '../therapists/types';
import { DAYS_OF_WEEK } from '../therapists/types';

// ─── New Attendance System ───────────────────────────────────────────────────

export const clockIn = async (userId: string, therapistId?: string): Promise<Attendance> => {
    const { data, error } = await supabase
        .from('attendance')
        .insert({
            user_id: userId,
            therapist_id: therapistId,
            start_time: new Date().toISOString(),
            type: 'work'
        })
        .select()
        .single();

    if (error) throw error;
    return {
        id: data.id,
        userId: data.user_id,
        therapistId: data.therapist_id,
        startTime: data.start_time,
        type: data.type as AttendanceType
    };
};

export const clockOut = async (attendanceId: string): Promise<Attendance> => {
    const { data, error } = await supabase
        .from('attendance')
        .update({ end_time: new Date().toISOString() })
        .eq('id', attendanceId)
        .select()
        .single();

    if (error) throw error;
    return {
        id: data.id,
        userId: data.user_id,
        therapistId: data.therapist_id,
        startTime: data.start_time,
        endTime: data.end_time,
        type: data.type as AttendanceType
    };
};

export const getCurrentAttendance = async (userId: string): Promise<Attendance | null> => {
    const today = startOfDay(new Date()).toISOString();
    const tonight = endOfDay(new Date()).toISOString();

    const { data, error } = await supabase
        .from('attendance')
        .select('*')
        .eq('user_id', userId)
        .eq('type', 'work')
        .is('end_time', null)
        .gte('start_time', today)
        .lte('start_time', tonight)
        .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    return {
        id: data.id,
        userId: data.user_id,
        therapistId: data.therapist_id,
        startTime: data.start_time,
        endTime: data.end_time,
        type: data.type as AttendanceType,
        notes: data.notes
    };
};

export const getAllAttendance = async (month: string, therapistId?: string): Promise<Attendance[]> => {
    const startDate = `${month}-01T00:00:00Z`;
    const lastDay = endOfMonth(parseISO(`${month}-01`));
    const endDate = lastDay.toISOString();

    let query = supabase
        .from('attendance')
        .select('*')
        .gte('start_time', startDate)
        .lte('start_time', endDate);

    if (therapistId && therapistId !== 'all') {
        query = query.eq('therapist_id', therapistId);
    }

    const { data, error } = await query.order('start_time', { ascending: true });
    if (error) throw error;

    return (data || []).map(d => ({
        id: d.id,
        userId: d.user_id,
        therapistId: d.therapist_id,
        startTime: d.start_time,
        endTime: d.end_time,
        type: d.type as AttendanceType,
        notes: d.notes
    }));
};

export const getTherapistVacations = async (therapistId: string): Promise<Attendance[]> => {
    let query = supabase
        .from('attendance')
        .select('*')
        .neq('type', 'work');

    if (therapistId && therapistId !== 'all') {
        query = query.eq('therapist_id', therapistId);
    }

    const { data, error } = await query.order('start_time', { ascending: false });

    if (error) throw error;
    return (data || []).map(d => ({
        id: d.id,
        userId: d.user_id,
        therapistId: d.therapist_id,
        startTime: d.start_time,
        endTime: d.end_time,
        type: d.type as AttendanceType,
        notes: d.notes
    }));
};


export const addAttendance = async (attendance: Partial<Attendance>, adminInfo?: { id: string, name: string }): Promise<Attendance> => {
    if (adminInfo) {
        const { data, error } = await supabase.functions.invoke('admin-manage-attendance', {
            body: {
                action: 'insert',
                record: {
                    user_id: attendance.userId,
                    therapist_id: attendance.therapistId,
                    start_time: attendance.startTime,
                    end_time: attendance.endTime,
                    type: attendance.type,
                    notes: attendance.notes
                }
            }
        });
        
        if (error || !data.success) throw new Error(data?.error || error?.message || 'Error inserting attendance via admin API');
        
        await addAuditLog({
            userId: adminInfo.id,
            userName: adminInfo.name,
            action: `Adición manual de asistencia (${attendance.type})`,
            details: `Registro creado para ${attendance.therapistId || attendance.userId}. Inicio: ${attendance.startTime}`,
            timestamp: new Date().toISOString(),
            category: 'data'
        });

        const d = data.data;
        return {
            id: d.id,
            userId: d.user_id,
            therapistId: d.therapist_id,
            startTime: d.start_time,
            endTime: d.end_time,
            type: d.type as AttendanceType,
            notes: d.notes
        };
    }

    const { data, error } = await supabase
        .from('attendance')
        .insert({
            user_id: attendance.userId,
            therapist_id: attendance.therapistId,
            start_time: attendance.startTime,
            end_time: attendance.endTime,
            type: attendance.type,
            notes: attendance.notes
        })
        .select()
        .single();

    if (error) throw error;

    return {
        id: data.id,
        userId: data.user_id,
        therapistId: data.therapist_id,
        startTime: data.start_time,
        endTime: data.end_time,
        type: data.type as AttendanceType,
        notes: data.notes
    };
};

export const updateAttendance = async (id: string, updates: Partial<Attendance>, adminInfo?: { id: string, name: string }): Promise<Attendance> => {
    if (adminInfo) {
        const { data, error } = await supabase.functions.invoke('admin-manage-attendance', {
            body: {
                action: 'update',
                id,
                record: {
                    start_time: updates.startTime,
                    end_time: updates.endTime,
                    type: updates.type,
                    notes: updates.notes
                }
            }
        });
        
        if (error || !data.success) throw new Error(data?.error || error?.message || 'Error updating attendance via admin API');

        await addAuditLog({
            userId: adminInfo.id,
            userName: adminInfo.name,
            action: `Edición manual de asistencia`,
            details: `ID Registro: ${id}. Nuevos valores - Inicio: ${updates.startTime}, Fin: ${updates.endTime}`,
            timestamp: new Date().toISOString(),
            category: 'data'
        });

        const d = data.data;
        return {
            id: d.id,
            userId: d.user_id,
            therapistId: d.therapist_id,
            startTime: d.start_time,
            endTime: d.end_time,
            type: d.type as AttendanceType,
            notes: d.notes
        };
    }

    const { data, error } = await supabase
        .from('attendance')
        .update({
            start_time: updates.startTime,
            end_time: updates.endTime,
            type: updates.type,
            notes: updates.notes
        })
        .eq('id', id)
        .select()
        .single();

    if (error) throw error;

    return {
        id: data.id,
        userId: data.user_id,
        therapistId: data.therapist_id,
        startTime: data.start_time,
        endTime: data.end_time,
        type: data.type as AttendanceType,
        notes: data.notes
    };
};

export const cleanupDuplicates = async (therapistId: string, adminInfo: { id: string, name: string }): Promise<number> => {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session) {
        console.error("No active session found for admin action");
        throw new Error('Su sesión ha expirado o no es válida. Por favor, cierre sesión y vuelva a entrar.');
    }

    const { data, error } = await supabase.functions.invoke('admin-manage-attendance', {
        body: { action: 'cleanup', therapist_id: therapistId },
        headers: {
            Authorization: `Bearer ${session.access_token}`
        }
    });
    if (error || !data?.success) {
        console.error("Cleanup error details:", data?.details || data?.error || error);
        throw new Error(data?.details || data?.error || error?.message || 'Error cleaning up duplicates via admin API');
    }
    
    await addAuditLog({
        userId: adminInfo.id,
        userName: adminInfo.name,
        action: `Limpieza de duplicados`,
        details: `Se han eliminado registros duplicados para el terapeuta: ${therapistId}`,
        timestamp: new Date().toISOString(),
        category: 'data'
    });
    
    return data.data.deletedCount;
};

export const deleteAttendance = async (id: string, adminInfo?: { id: string, name: string }): Promise<void> => {
    if (adminInfo) {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError || !session) {
            console.error("No active session found for admin action");
            throw new Error('Su sesión ha expirado o no es válida. Por favor, cierre sesión y vuelva a entrar.');
        }

        const { data, error } = await supabase.functions.invoke('admin-manage-attendance', {
            body: { action: 'delete', id },
            headers: {
                Authorization: `Bearer ${session.access_token}`
            }
        });
        if (error || !data?.success) {
            console.error("Delete error details:", data?.details || data?.error || error);
            throw new Error(data?.details || data?.error || error?.message || 'Error deleting attendance via admin API');
        }
        
        await addAuditLog({
            userId: adminInfo.id,
            userName: adminInfo.name,
            action: `Eliminación de asistencia`,
            details: `ID Registro eliminado: ${id}`,
            timestamp: new Date().toISOString(),
            category: 'data'
        });
        return;
    }

    const { error } = await supabase.from('attendance').delete().eq('id', id);
    if (error) throw error;
};

export const getUpcomingAppointment = async (therapistId: string) => {
    const now = new Date();
    const soon = addHours(now, 1).toISOString();

    let query = supabase
        .from('appointments')
        .select('id, start_time, patient_name')
        .gte('start_time', now.toISOString())
        .lte('start_time', soon);

    if (therapistId && therapistId !== 'all') {
        query = query.eq('therapist_id', therapistId);
    }

    const { data, error } = await query
        .order('start_time', { ascending: true })
        .limit(1)
        .maybeSingle();

    if (error) throw error;
    return data;
};

const endOfMonth = (date: Date): Date => {
    const d = new Date(date);
    d.setMonth(d.getMonth() + 1);
    d.setDate(0);
    d.setHours(23, 59, 59, 999);
    return d;
};

// ─── Legacy Work Logs (Keep for compatibility if needed) ───────────────────────
export const getTodayLog = async (therapistId: string): Promise<WorkLog | null> => {
    const today = format(new Date(), 'yyyy-MM-dd');
    let query = supabase
        .from('work_logs')
        .select('*, work_log_events(*)')
        .eq('date', today);

    if (therapistId && therapistId !== 'all') {
        query = query.eq('therapist_id', therapistId);
    }

    const { data: log, error } = await query.maybeSingle();
    if (error) throw error;
    if (!log) return null;
    return {
        id: log.id,
        therapistId: log.therapist_id,
        date: log.date,
        events: (log.work_log_events || []).map((r: any) => ({ type: r.type, timestamp: r.timestamp })),
        totalWorkedMinutes: log.total_worked_minutes,
    };
};

export const getCurrentStatus = async (therapistId: string): Promise<WorkStatus> => {
    const attendance = await getCurrentAttendanceByTherapist(therapistId);
    return attendance ? 'working' : 'offline';
};

export const checkScheduleAdherence = async (therapistId: string, checkDate?: Date): Promise<{ isAdherent: boolean; currentBlock?: WorkingHours }> => {
    try {
        const { data: therapist, error } = await supabase
            .from('therapists')
            .select('schedule')
            .eq('id', therapistId)
            .single();

        if (error || !therapist) return { isAdherent: true };

        const schedule: DaySchedule[] = therapist.schedule || [];
        const now = checkDate || new Date();
        const dayIdx = now.getDay(); 
        
        // Sunday
        if (dayIdx === 0) return { isAdherent: false };

        // DAYS_OF_WEEK: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
        const dayName = DAYS_OF_WEEK[dayIdx - 1]; 
        const daySched = schedule.find(s => 
            s.day?.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") === 
            dayName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        );

        if (!daySched || !daySched.enabled || !daySched.blocks.length) {
            return { isAdherent: false };
        }

        const activeBlock = daySched.blocks.find(block => {
            const [startH, startM] = block.start.split(':').map(Number);
            const [endH, endM] = block.end.split(':').map(Number);
            
            const startDate = set(now, { hours: startH, minutes: startM, seconds: 0, milliseconds: 0 });
            const endDate = set(now, { hours: endH, minutes: endM, seconds: 0, milliseconds: 0 });
            
            return isWithinInterval(now, { start: startDate, end: endDate });
        });

        return {
            isAdherent: !!activeBlock,
            currentBlock: activeBlock
        };
    } catch (e) {
        console.error("Error checking schedule adherence:", e);
        return { isAdherent: true };
    }
};

const getCurrentAttendanceByTherapist = async (therapistId: string): Promise<Attendance | null> => {
    const today = startOfDay(new Date()).toISOString();
    const tonight = endOfDay(new Date()).toISOString();

    let query = supabase
        .from('attendance')
        .select('*')
        .eq('type', 'work')
        .is('end_time', null)
        .gte('start_time', today)
        .lte('start_time', tonight);

    if (therapistId && therapistId !== 'all') {
        query = query.eq('therapist_id', therapistId);
    }

    const { data, error } = await query.maybeSingle();

    if (error) throw error;
    if (!data) return null;
    return {
        id: data.id,
        userId: data.user_id,
        therapistId: data.therapist_id,
        startTime: data.start_time,
        endTime: data.end_time,
        type: data.type as AttendanceType
    };
};

export const getLiveWorkStats = async (
    therapistId: string
): Promise<{ status: WorkStatus; totalSeconds: number; lastEventTime?: string; currentAttendanceId?: string }> => {
    const attendance = await getCurrentAttendanceByTherapist(therapistId);
    
    // Calculate total seconds from all 'work' records today
    const today = startOfDay(new Date()).toISOString();
    let query = supabase
        .from('attendance')
        .select('*')
        .eq('type', 'work')
        .gte('start_time', today);

    if (therapistId && therapistId !== 'all') {
        query = query.eq('therapist_id', therapistId);
    }

    const { data: allToday } = await query;

    let totalSeconds = 0;
    (allToday || []).forEach(record => {
        const start = parseISO(record.start_time);
        const end = record.end_time ? parseISO(record.end_time) : new Date();
        totalSeconds += Math.max(0, differenceInSeconds(end, start));
    });

    return { 
        status: attendance ? 'working' : 'offline', 
        totalSeconds, 
        lastEventTime: attendance?.startTime,
        currentAttendanceId: attendance?.id
    };
};

export const addEvent = async (_therapistId: string, _type: WorkLogEvent['type']): Promise<WorkLog> => {
    throw new Error("Use new clockIn/clockOut system");
};

export const getActiveTherapistsForMonth = async (month: string): Promise<string[]> => {
    const startDate = `${month}-01T00:00:00Z`;
    const lastDay = endOfMonth(parseISO(`${month}-01`));
    const endDate = lastDay.toISOString();

    const [attRes, apptRes] = await Promise.all([
        supabase.from('attendance').select('therapist_id').gte('start_time', startDate).lte('start_time', endDate),
        supabase.from('appointments').select('therapist_id').gte('start_time', startDate).lte('start_time', endDate).neq('status', 'Cancelada')
    ]);

    const activeTherapists = new Set<string>();
    
    (attRes.data || []).forEach(a => {
        if (a.therapist_id) activeTherapists.add(a.therapist_id);
    });
    
    (apptRes.data || []).forEach(a => {
        if (a.therapist_id) activeTherapists.add(a.therapist_id);
    });

    return Array.from(activeTherapists);
};

export const getMonthlyReport = async (therapistId: string, month: string): Promise<{ date: string; totalMinutes: number }[]> => {
    const startDate = `${month}-01T00:00:00Z`;
    const lastDay = endOfMonth(parseISO(`${month}-01`));
    const endDate = lastDay.toISOString();

    let query = supabase
        .from('attendance')
        .select('*')
        .eq('type', 'work')
        .not('end_time', 'is', null)
        .gte('start_time', startDate)
        .lte('start_time', endDate);

    if (therapistId && therapistId !== 'all') {
        query = query.eq('therapist_id', therapistId);
    }

    const { data, error } = await query.order('start_time', { ascending: true });

    if (error) throw error;

    // Group by date and sum minutes
    const dailyMap: Record<string, number> = {};
    (data || []).forEach(record => {
        const day = format(parseISO(record.start_time), 'yyyy-MM-dd');
        const start = parseISO(record.start_time);
        const end = parseISO(record.end_time);
        const minutes = Math.max(0, differenceInSeconds(end, start) / 60);
        dailyMap[day] = (dailyMap[day] || 0) + minutes;
    });

    return Object.entries(dailyMap).map(([date, totalMinutes]) => ({
        date,
        totalMinutes: Math.round(totalMinutes)
    }));
};

// ─── Firmas mensuales ─────────────────────────────────────────────────────────
export const signMonthlyReport = async (
    therapistId: string,
    month: string,
    totalHours: number,
    signatureImage?: string
): Promise<MonthlyReportSignature> => {
    const existing = await getSignature(therapistId, month);
    if (existing) throw new Error('Este reporte mensual ya ha sido firmado.');

    const declaration = 'Declaro que las horas registradas en este reporte son veraces y corresponden a mi actividad laboral efectiva durante el periodo indicado.';
    const { data, error } = await supabase
        .from('monthly_report_signatures')
        .insert({
            therapist_id: therapistId,
            month,
            total_hours: totalHours,
            signed_at: new Date().toISOString(),
            declaration,
            signature_image: signatureImage || null
        })
        .select()
        .single();
    if (error) throw error;
    return {
        id: data.id,
        therapistId: data.therapist_id,
        month: data.month,
        totalHours: data.total_hours,
        signedAt: data.signed_at,
        declaration: data.declaration,
        signatureImage: data.signature_image
    };
};

export const getSignature = async (therapistId: string, month: string): Promise<MonthlyReportSignature | undefined> => {
    let query = supabase
        .from('monthly_report_signatures')
        .select('*')
        .eq('month', month);

    if (therapistId && therapistId !== 'all') {
        query = query.eq('therapist_id', therapistId);
    }

    const { data, error } = await query.maybeSingle();
    if (error || !data) return undefined;
    return {
        id: data.id,
        therapistId: data.therapist_id,
        month: data.month,
        totalHours: data.total_hours,
        signedAt: data.signed_at,
        declaration: data.declaration,
        signatureImage: data.signature_image
    };
};

export const getAllSignatures = async (): Promise<(MonthlyReportSignature & { therapistName?: string })[]> => {
    const { data, error } = await supabase
        .from('monthly_report_signatures')
        .select('*, therapists(full_name)')
        .order('signed_at', { ascending: false });
    if (error) throw error;
    return (data || []).map((d: any) => ({
        id: d.id,
        therapistId: d.therapist_id,
        month: d.month,
        totalHours: d.total_hours,
        signedAt: d.signed_at,
        declaration: d.declaration,
        signatureImage: d.signature_image,
        therapistName: d.therapists?.full_name || 'Desconocido'
    }));
};

export const sendSignedReport = async (payload: {
    therapistName: string;
    month: string;
    totalHours: number;
    signatureImage: string;
    totalDays: number;
    pdfBase64?: string;
}): Promise<{ success: boolean }> => {
    const { data, error } = await supabase.functions.invoke('send-signed-report', {
        body: payload
    });
    if (error) throw error;
    return data;
};
