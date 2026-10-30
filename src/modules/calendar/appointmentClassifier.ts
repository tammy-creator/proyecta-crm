import { type Appointment } from './types';

export type AppointmentCategory =
    | 'CLINICAL'           // Cita asistencial real (con paciente atendible/facturable)
    | 'POSSIBLE_PATIENT'   // Bloqueo que contiene el nombre de un paciente o formato de reserva
    | 'ABSENCE_NOTICE'     // Bloqueo manual de aviso de ausencia ("no viene X", "X no asiste")
    | 'OPERATIONAL_BLOCK'  // Vacaciones, libre, supervisión, trabajo no asistencial
    | 'CANCELLED';         // Cita anulada con status Cancelada

export interface ClassificationResult {
    category: AppointmentCategory;
    reason: string;
    detectedPatientName?: string;
    detectedPatientId?: string;
    isBillable: boolean;
}

export interface PatientLookupItem {
    id: string;
    firstName?: string;
    lastName?: string;
    name: string;
}

export const normalizeText = (str?: string | null): string => {
    if (!str) return '';
    return str
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
};

const OPERATIONAL_KEYWORDS = [
    'vacaciones',
    'vacacion',
    'horario bloqueado',
    'libre',
    'no asistencial',
    'trabajo no',
    'supervisión',
    'supervision',
    'coordinación',
    'coordinacion',
    'reunión',
    'reunion',
    'formación',
    'formacion',
    'asuntos propios',
    'médico',
    'medico',
    'baja laboral',
    'baja médica',
    'baja medica',
    'dia personal',
    'día personal',
    'asuntos personales',
    'tania no'
];

const ABSENCE_KEYWORDS = [
    'no viene',
    'no puede',
    'cancela',
    'anula',
    'descansa',
    'no asiste',
    'falta',
    'no acude'
];

/**
 * Clasifica cualquier cita o bloqueo en una de las 5 categorías operativas.
 */
export const classifyAppointment = (
    appt: Partial<Appointment>,
    patientsList: PatientLookupItem[] = []
): ClassificationResult => {
    const status = appt.status || 'Programada';
    const rawPatient = appt.patientName || '';
    const normPatient = normalizeText(rawPatient);
    const normType = normalizeText(appt.type);
    const normNotes = normalizeText(appt.notes);
    const combined = `${normPatient} ${normType} ${normNotes}`;

    // 1. Canceladas
    if (status === 'Cancelada') {
        return {
            category: 'CANCELLED',
            reason: 'Cita cancelada',
            isBillable: false,
            detectedPatientName: rawPatient || undefined,
            detectedPatientId: appt.patientId || undefined
        };
    }

    // 2. Comprobar si es un evento operativo puro (incluso si está guardado como Programada)
    const isPureOperational = OPERATIONAL_KEYWORDS.some(kw => 
        normPatient.includes(kw) || normType.includes(kw)
    );
    if (isPureOperational) {
        return {
            category: 'OPERATIONAL_BLOCK',
            reason: 'Evento operativo, descanso o trabajo no asistencial',
            isBillable: false
        };
    }

    // 3. Comprobar avisos manuales de ausencia ("no viene martin", "luis no puede")
    const isAbsence = ABSENCE_KEYWORDS.some(kw => 
        normPatient.includes(kw) || normNotes.includes(kw)
    );
    if (isAbsence) {
        let matchedPatientName: string | undefined;
        let matchedPatientId: string | undefined;

        if (patientsList.length > 0) {
            const match = patientsList.find(p => {
                const normP = normalizeText(p.name);
                const normFirst = normalizeText(p.firstName);
                return normP.length > 3 && (combined.includes(normP) || (normFirst.length >= 4 && combined.includes(normFirst)));
            });
            if (match) {
                matchedPatientName = match.name;
                matchedPatientId = match.id;
            }
        }

        return {
            category: 'ABSENCE_NOTICE',
            reason: 'Aviso de ausencia manual (alumno no asiste)',
            detectedPatientName: matchedPatientName || rawPatient,
            detectedPatientId: matchedPatientId || appt.patientId || undefined,
            isBillable: false
        };
    }

    // 4. Si el status es Bloqueada o el tipo es Bloqueo
    const isBlock = status === 'Bloqueada' || normType === 'bloqueo' || normType === 'bloqueada';
    if (isBlock) {
        // ¿Menciona a un paciente real del CRM?
        let matchedPatient: PatientLookupItem | undefined;
        if (patientsList.length > 0 && normPatient.length >= 3) {
            matchedPatient = patientsList.find(p => {
                const normFull = normalizeText(p.name);
                const normFirst = normalizeText(p.firstName);
                if (normFull.length > 3 && normPatient.includes(normFull)) return true;
                if (normFirst.length >= 4 && (normPatient === normFirst || normPatient.startsWith(normFirst + ' ') || normPatient.includes(` ${normFirst} `) || normPatient.includes(`${normFirst}?`))) {
                    return true;
                }
                return false;
            });
        }

        if (matchedPatient) {
            return {
                category: 'POSSIBLE_PATIENT',
                reason: `Paciente identificado: "${matchedPatient.name}"`,
                detectedPatientName: matchedPatient.name,
                detectedPatientId: matchedPatient.id,
                isBillable: false
            };
        }

        // Si tiene formato de reserva con interrogante o palabras de cita
        if (rawPatient.includes('?') || normPatient.includes('viene') || normPatient.includes('recuperar') || normPatient.includes('entrevista') || normPatient.includes('evaluac')) {
            const cleanName = rawPatient.replace(/[?]/g, '').trim();
            return {
                category: 'POSSIBLE_PATIENT',
                reason: 'Formato de reserva o cita tentativa en bloqueo',
                detectedPatientName: cleanName,
                isBillable: false
            };
        }

        return {
            category: 'OPERATIONAL_BLOCK',
            reason: 'Bloqueo de horario sin paciente asociado',
            isBillable: false
        };
    }

    // 5. Cita clínica asistencial ordinaria
    return {
        category: 'CLINICAL',
        reason: 'Cita asistencial clínica válida',
        detectedPatientName: rawPatient || undefined,
        detectedPatientId: appt.patientId || undefined,
        isBillable: true
    };
};
