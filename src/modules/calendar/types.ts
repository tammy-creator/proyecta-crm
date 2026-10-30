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
    groupId?: string;      // Identificador de grupo para sesiones grupales
    isGroup?: boolean;     // Indica si la cita forma parte de una sesión grupal
    recurrence?: {
        weeks?: number;
        days?: number[];       // [1, 2, 3...] para Lunes, Martes...
        until?: string;        // Fecha límite
        originalId?: string;
        frequency?: 'weekly' | 'biweekly'; // 'weekly' (semanal) o 'biweekly' (quincenal / cada 15 días)
        groupId?: string;      // Identificador de grupo en recurrencias
        isGroup?: boolean;     // Flag de grupo en recurrencias
    };
    cancellationReason?: string; // Motivo de cancelación
    voiceNoteUrl?: string; // Almacén de audio o referencia
    notificacionRecordatorioEnviada?: boolean; // Integración con automatización de recordatorios de citas
    colIndex?: number;  // Layout property
    totalCols?: number; // Layout property
}

export interface DayAvailability {
    day: string;
    slots: { start: string; end: string }[];
}
