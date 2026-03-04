export type PatientStatus = 'Activo' | 'En Pausa' | 'Alta' | 'Lista de espera';

export interface PatientFile {
    id: string;
    name: string;
    type: string;
    size: string;
    uploadDate: string;
}

export interface Patient {
    id: string;
    firstName: string;
    lastName: string;
    birthDate: string;
    age?: number;
    schooling?: string; // Etapa de escolarización
    address?: string;
    dni?: string; // DNI del paciente (opcional, suele ser del tutor)
    tutor1: {
        firstName: string;
        lastName: string;
        dni: string;
        job: string;
        phone: string;
        email: string;
    };
    tutor2?: {
        firstName: string;
        lastName: string;
        dni: string;
        job: string;
        phone: string;
    };
    allergies?: string;
    referralSource?: string; // Cómo nos conoció
    tutorName?: string; // Mantener por compatibilidad o simplificación en listas
    email: string;
    phone: string;
    status: PatientStatus;
    lastVisit?: string;
    notes?: string;
    files?: PatientFile[];
    consentSignature?: string; // Firma capturada en Base64
    createdAt: string;
}

export type UrgencyLevel = 'Baja' | 'Media' | 'Alta';

export interface WaitingListEntry {
    id: string;
    patientId: string;
    patientName: string;
    specialty: string;
    urgency: UrgencyLevel;
    registrationDate: string;
    notes?: string;
}

export interface PatientFilters {
    search: string;
    status?: PatientStatus;
}
