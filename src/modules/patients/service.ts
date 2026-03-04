import { supabase } from '../../lib/supabase';
import { type Patient, type PatientFile, type WaitingListEntry } from './types';

// ─── Helpers de mapeo BD → App ────────────────────────────────────────────────
const mapPatient = (row: any): Patient => ({
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    birthDate: row.birth_date,
    schooling: row.schooling,
    address: row.address,
    dni: row.dni,
    allergies: row.allergies,
    referralSource: row.referral_source,
    email: row.email ?? '',
    phone: row.phone ?? '',
    status: row.status,
    lastVisit: row.last_visit,
    notes: row.notes,
    consentSignature: row.consent_signature,
    createdAt: row.created_at?.split('T')[0] ?? '',
    tutor1: row.patient_tutors?.[0]
        ? {
            firstName: row.patient_tutors[0].first_name,
            lastName: row.patient_tutors[0].last_name,
            dni: row.patient_tutors[0].dni ?? '',
            job: row.patient_tutors[0].job ?? '',
            phone: row.patient_tutors[0].phone ?? '',
            email: row.patient_tutors[0].email ?? '',
        }
        : { firstName: '', lastName: '', dni: '', job: '', phone: '', email: '' },
    tutor2: row.patient_tutors?.[1]
        ? {
            firstName: row.patient_tutors[1].first_name,
            lastName: row.patient_tutors[1].last_name,
            dni: row.patient_tutors[1].dni ?? '',
            job: row.patient_tutors[1].job ?? '',
            phone: row.patient_tutors[1].phone ?? '',
        }
        : undefined,
    tutorName: row.patient_tutors?.[0]
        ? `${row.patient_tutors[0].first_name} ${row.patient_tutors[0].last_name}`
        : '',
    files: row.patient_files?.map((f: any) => ({
        id: f.id,
        name: f.name,
        type: f.type,
        size: f.size,
        uploadDate: f.upload_date,
    })),
});

// ─── Pacientes ────────────────────────────────────────────────────────────────
export const getPatients = async (): Promise<Patient[]> => {
    const { data, error } = await supabase
        .from('patients')
        .select('*, patient_tutors(*), patient_files(*)')
        .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapPatient);
};

export const getPatientById = async (id: string): Promise<Patient | undefined> => {
    const { data, error } = await supabase
        .from('patients')
        .select('*, patient_tutors(*), patient_files(*)')
        .eq('id', id)
        .single();
    if (error) return undefined;
    return mapPatient(data);
};

export const createPatient = async (patient: Omit<Patient, 'id' | 'createdAt'>): Promise<Patient> => {
    const { data: patientRow, error } = await supabase
        .from('patients')
        .insert({
            first_name: patient.firstName,
            last_name: patient.lastName,
            birth_date: patient.birthDate,
            schooling: patient.schooling,
            address: patient.address,
            dni: patient.dni,
            allergies: patient.allergies,
            referral_source: patient.referralSource,
            email: patient.email,
            phone: patient.phone,
            status: patient.status,
            notes: patient.notes,
            consent_signature: patient.consentSignature,
        })
        .select()
        .single();
    if (error) throw error;

    // Insertar tutor principal
    if (patient.tutor1?.firstName) {
        await supabase.from('patient_tutors').insert({
            patient_id: patientRow.id,
            order_num: 1,
            first_name: patient.tutor1.firstName,
            last_name: patient.tutor1.lastName,
            dni: patient.tutor1.dni,
            job: patient.tutor1.job,
            phone: patient.tutor1.phone,
            email: patient.tutor1.email,
        });
    }
    // Insertar tutor secundario si existe
    if (patient.tutor2?.firstName) {
        await supabase.from('patient_tutors').insert({
            patient_id: patientRow.id,
            order_num: 2,
            first_name: patient.tutor2.firstName,
            last_name: patient.tutor2.lastName,
            dni: patient.tutor2.dni,
            job: patient.tutor2.job,
            phone: patient.tutor2.phone,
        });
    }

    const created = await getPatientById(patientRow.id);
    return created!;
};

export const updatePatient = async (patient: Patient): Promise<Patient> => {
    const { error } = await supabase
        .from('patients')
        .update({
            first_name: patient.firstName,
            last_name: patient.lastName,
            birth_date: patient.birthDate,
            schooling: patient.schooling,
            address: patient.address,
            dni: patient.dni,
            allergies: patient.allergies,
            referral_source: patient.referralSource,
            email: patient.email,
            phone: patient.phone,
            status: patient.status,
            last_visit: patient.lastVisit,
            notes: patient.notes,
            consent_signature: patient.consentSignature,
        })
        .eq('id', patient.id);
    if (error) throw error;

    // Actualizar tutor 1
    const { data: existingTutors } = await supabase
        .from('patient_tutors')
        .select('*')
        .eq('patient_id', patient.id)
        .order('order_num');

    if (patient.tutor1?.firstName) {
        const t1 = existingTutors?.find((t: any) => t.order_num === 1);
        if (t1) {
            await supabase.from('patient_tutors').update({
                first_name: patient.tutor1.firstName,
                last_name: patient.tutor1.lastName,
                dni: patient.tutor1.dni,
                job: patient.tutor1.job,
                phone: patient.tutor1.phone,
                email: patient.tutor1.email,
            }).eq('id', t1.id);
        } else {
            await supabase.from('patient_tutors').insert({
                patient_id: patient.id, order_num: 1,
                first_name: patient.tutor1.firstName, last_name: patient.tutor1.lastName,
                dni: patient.tutor1.dni, job: patient.tutor1.job,
                phone: patient.tutor1.phone, email: patient.tutor1.email,
            });
        }
    }

    return (await getPatientById(patient.id))!;
};

export const uploadPatientFile = async (patientId: string, file: Omit<PatientFile, 'id' | 'uploadDate'>): Promise<PatientFile> => {
    const { data, error } = await supabase
        .from('patient_files')
        .insert({
            patient_id: patientId,
            name: file.name,
            type: file.type,
            size: file.size,
        })
        .select()
        .single();
    if (error) throw error;
    return { id: data.id, name: data.name, type: data.type, size: data.size, uploadDate: data.upload_date };
};

export const getPatientsWithPoorAttendance = async (): Promise<Patient[]> => {
    // En el futuro: query con conteo de ausencias. Por ahora devuelve vacío.
    return [];
};

// ─── Lista de espera ──────────────────────────────────────────────────────────
const mapWaiting = (row: any): WaitingListEntry => ({
    id: row.id,
    patientId: row.patient_id ?? '',
    patientName: row.patient_name,
    specialty: row.specialty,
    urgency: row.urgency,
    registrationDate: row.registration_date,
    notes: row.notes,
});

export const getWaitingList = async (): Promise<WaitingListEntry[]> => {
    const { data, error } = await supabase
        .from('waiting_list')
        .select('*')
        .order('registration_date', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapWaiting);
};

export const addToWaitingList = async (entry: Omit<WaitingListEntry, 'id' | 'registrationDate'>): Promise<WaitingListEntry> => {
    const { data, error } = await supabase
        .from('waiting_list')
        .insert({
            patient_id: entry.patientId || null,
            patient_name: entry.patientName,
            specialty: entry.specialty,
            urgency: entry.urgency,
            notes: entry.notes,
        })
        .select()
        .single();
    if (error) throw error;
    return mapWaiting(data);
};

export const removeFromWaitingList = async (id: string): Promise<boolean> => {
    const { error } = await supabase.from('waiting_list').delete().eq('id', id);
    if (error) throw error;
    return true;
};
