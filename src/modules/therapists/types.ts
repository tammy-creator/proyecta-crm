export interface WorkingHours {
    start: string; // "09:00"
    end: string;   // "14:00"
}

export interface DaySchedule {
    day: string; // "Monday", "Tuesday", etc.
    enabled: boolean;
    blocks: WorkingHours[];
}

export interface Therapist {
    id: string;
    fullName: string;
    specialty: string;
    licenseNumber?: string; // Nº Colegiado
    dni: string;
    email: string;
    phone: string;
    color: string; // Color identificativo para la agenda
    schedule: DaySchedule[];
    avatarUrl?: string; // Optional
    sessionStartOffset?: number; // Minutes from the hour (e.g. 0, 10, 50/-10)
}

export const SPECIALTIES = [
    'Psicología Clínica',
    'Logopedia',
    'Neuropsicología',
    'Terapia Ocupacional',
    'Psicopedagogía'
];

export const DAYS_OF_WEEK = [
    'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'
];
