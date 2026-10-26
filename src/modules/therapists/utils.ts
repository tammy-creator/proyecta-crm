import { type Therapist, type WorkingHours, DAYS_OF_WEEK } from './types';
import { format, parseISO, isValid } from 'date-fns';

export const getIllustrativeAvatar = (t: Partial<Therapist>) => {
    if (t.avatarUrl) {
        if (t.avatarUrl.startsWith('http')) return t.avatarUrl;
        return `${import.meta.env.VITE_AVATARS_SERVER_URL}${t.avatarUrl}`;
    }
    // Usamos la versión 7.x que es más estable y forzamos sonrisa simple
    const seed = encodeURIComponent(t.fullName || 'default');
    return `https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}&mouth=smile&eyebrows=default`;
};

export interface ResolvedDaySchedule {
    enabled: boolean;
    blocks: WorkingHours[];
    isSpecial?: boolean;
    note?: string;
    hasExplicitSchedule: boolean;
}

/**
 * Obtiene el horario resuelto para un terapeuta en una fecha determinada.
 * Comprueba primero si existe una excepción / horario especial por fecha.
 * Si no existe, recurre al horario semanal recurrente.
 */
export const getTherapistDaySchedule = (
    therapist: Pick<Therapist, 'schedule' | 'specialSchedules'> | null | undefined,
    date: Date | string
): ResolvedDaySchedule => {
    if (!therapist) {
        return { enabled: false, blocks: [], hasExplicitSchedule: false };
    }

    const dateObj = typeof date === 'string' ? parseISO(date) : date;
    if (!isValid(dateObj)) {
        return { enabled: false, blocks: [], hasExplicitSchedule: false };
    }

    const dateStr = format(dateObj, 'yyyy-MM-dd');

    // 1. Comprobar horario especial / excepción por fecha
    const special = therapist.specialSchedules?.find(s => s.date === dateStr);
    if (special) {
        return {
            enabled: special.enabled,
            blocks: special.blocks || [],
            isSpecial: true,
            note: special.note,
            hasExplicitSchedule: true
        };
    }

    // 2. Si no tiene horario semanal definido
    if (!therapist.schedule || therapist.schedule.length === 0) {
        return { enabled: true, blocks: [], hasExplicitSchedule: false };
    }

    // 3. Horario semanal recurrente
    const dayIdx = dateObj.getDay();
    // 0 = Domingo
    if (dayIdx === 0) {
        return { enabled: false, blocks: [], hasExplicitSchedule: true };
    }

    // DAYS_OF_WEEK: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
    const dayName = DAYS_OF_WEEK[dayIdx - 1];
    const daySched = therapist.schedule.find(s => 
        s.day?.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") === 
        dayName?.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    );

    if (!daySched || !daySched.enabled) {
        return { enabled: false, blocks: [], hasExplicitSchedule: true };
    }

    return {
        enabled: true,
        blocks: daySched.blocks || [],
        isSpecial: false,
        hasExplicitSchedule: true
    };
};

