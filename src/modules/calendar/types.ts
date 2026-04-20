export type AppointmentStatus = 'Programada' | 'En Sesión' | 'Finalizada' | 'Cobrada' | 'Cancelada' | 'Ausente' | 'Bloqueada';

export interface Appointment {
    id: string;
    patientId?: string;
    therapistId: string;
    patientName: string; // Denormalized for simpler display in mock
    therapistName: string;
    start: string; // ISO string
    end: string;   // ISO string
    status: AppointmentStatus;
    serviceId?: string;
    type: string; // e.g., 'Terapia Lenguaje', 'Evaluación'
    price?: number; // Precio del servicio asociado
    notes?: string;
    sessionDiary?: string; // Diario de sesión obligatorio
    isPaid?: boolean;      // Estado de cobro para alertas
    recurrence?: {
        weeks?: number;
        days?: number[];       // [1, 2, 3...] para Lunes, Martes...
        until?: string;        // Fecha límite
        originalId?: string;
    };
    cancellationReason?: string; // Motivo de cancelación
    voiceNoteUrl?: string; // Almacén de audio o referencia
    notificacionRecordatorioEnviada?: boolean; // Integración con automatización de recordatorios de citas
}

export interface DayAvailability {
    day: string;
    slots: { start: string; end: string }[];
}
