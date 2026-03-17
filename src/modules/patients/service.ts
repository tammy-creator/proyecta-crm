import { supabase } from '../../lib/supabase';
import { type Patient, type PatientFile, type WaitingListEntry } from './types';

// ─── Helpers de mapeo BD → App ────────────────────────────────────────────────
const mapPatient = (row: any): Patient => {
    const tutors = row.patient_tutors || [];
    const t1Row = tutors.find((t: any) => t.order_num === 1);
    const t2Row = tutors.find((t: any) => t.order_num === 2);

    return {
        id: row.id,
        firstName: row.first_name,
        lastName: row.last_name,
        birthDate: row.birth_date,
        schooling: row.schooling,
        address: row.address,
        dni: row.dni,
        allergies: row.allergies,
        referralSource: row.referral_source,
        // Prioridad: Tutor 1 > Root Patient > Vacío
        email: t1Row?.email || row.email || '',
        phone: t1Row?.phone || row.phone || '',
        status: row.status,
        lastVisit: row.last_visit,
        notes: row.notes,
        consentSignature: row.consent_signature,
        createdAt: row.created_at?.split('T')[0] ?? '',
        tutor1: t1Row
            ? {
                firstName: t1Row.first_name || '',
                lastName: t1Row.last_name || '',
                dni: t1Row.dni || '',
                job: t1Row.job || '',
                phone: t1Row.phone || '',
                email: t1Row.email || '',
            }
            : { firstName: '', lastName: '', dni: '', job: '', phone: '', email: '' },
        tutor2: t2Row
            ? {
                firstName: t2Row.first_name || '',
                lastName: t2Row.last_name || '',
                dni: t2Row.dni || '',
                job: t2Row.job || '',
                phone: t2Row.phone || '',
            }
            : undefined,
        tutorName: t1Row ? `${t1Row.first_name} ${t1Row.last_name}` : '',
        files: (row.patient_files ?? []).map((f: any) => ({
            id: f.id,
            name: f.name,
            type: f.type,
            size: f.size,
            uploadDate: f.upload_date,
        })),
    };
};

// ─── Pacientes ────────────────────────────────────────────────────────────────
export const getPatients = async (): Promise<Patient[]> => {
    const { data, error } = await supabase
        .from('patients')
        .select('*, patient_tutors(*), patient_files(*)')
        .order('created_at', { ascending: false });

    if (error) {
        console.error("[Persistence] Error fetching patients list:", error);
        throw error;
    }
    return (data ?? []).map(mapPatient);
};

export const getPatientById = async (id: string): Promise<Patient | undefined> => {
    const { data, error } = await supabase
        .from('patients')
        .select('*, patient_tutors(*), patient_files(*)')
        .eq('id', id)
        .single();

    if (error) {
        console.error(`[Persistence] Error fetching patient ${id}:`, error);
        return undefined;
    }
    return mapPatient(data);
};

export const createPatient = async (patient: Omit<Patient, 'id' | 'createdAt'>): Promise<Patient> => {
    console.log("[Persistence] Creating new patient...");
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
            email: patient.email || patient.tutor1?.email || '',
            phone: patient.phone || patient.tutor1?.phone || '',
            status: patient.status,
            notes: patient.notes,
            consent_signature: patient.consentSignature,
        })
        .select()
        .single();

    if (error) throw error;

    // Insertar Tutor 1 si existe
    if (patient.tutor1 && (patient.tutor1.firstName || patient.tutor1.email)) {
        const { error: t1Error } = await supabase.from('patient_tutors').insert({
            patient_id: patientRow.id,
            order_num: 1,
            first_name: patient.tutor1.firstName || '',
            last_name: patient.tutor1.lastName || '',
            dni: patient.tutor1.dni || '',
            job: patient.tutor1.job || '',
            phone: patient.tutor1.phone || '',
            email: patient.tutor1.email || '',
        });
        if (t1Error) throw t1Error;
    }

    // Insertar Tutor 2 si existe
    if (patient.tutor2 && patient.tutor2.firstName) {
        const { error: t2Error } = await supabase.from('patient_tutors').insert({
            patient_id: patientRow.id,
            order_num: 2,
            first_name: patient.tutor2.firstName || '',
            last_name: patient.tutor2.lastName || '',
            dni: patient.tutor2.dni || '',
            job: patient.tutor2.job || '',
            phone: patient.tutor2.phone || '',
        });
        if (t2Error) throw t2Error;
    }

    return (await getPatientById(patientRow.id))!;
};

export const updatePatient = async (patient: Patient): Promise<Patient> => {
    console.log(`[Persistence] Updating patient ${patient.id}...`);

    // 1. Actualizar tabla base de Paciente
    const { error: rootError } = await supabase
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
            email: patient.email || patient.tutor1?.email || '',
            phone: patient.phone || patient.tutor1?.phone || '',
            status: patient.status,
            last_visit: patient.lastVisit,
            notes: patient.notes,
            consent_signature: patient.consentSignature,
        })
        .eq('id', patient.id);

    if (rootError) {
        console.error("[Persistence] Root update failed:", rootError);
        throw rootError;
    }

    // 2. Gestionar Tutores
    const { data: existingTutors, error: tutorsFetchError } = await supabase
        .from('patient_tutors')
        .select('*')
        .eq('patient_id', patient.id);

    if (tutorsFetchError) throw tutorsFetchError;

    // Proceso para Tutor 1
    if (patient.tutor1) {
        const t1 = patient.tutor1;
        const existingT1 = existingTutors?.find((row: any) => row.order_num === 1);
        const hasData = t1.firstName || t1.lastName || t1.email || t1.phone;

        if (existingT1) {
            const { error: updateError } = await supabase.from('patient_tutors').update({
                first_name: t1.firstName || '',
                last_name: t1.lastName || '',
                dni: t1.dni || '',
                job: t1.job || '',
                phone: t1.phone || '',
                email: t1.email || '',
            }).eq('id', existingT1.id);
            if (updateError) throw updateError;
        } else if (hasData) {
            const { error: insertError } = await supabase.from('patient_tutors').insert({
                patient_id: patient.id,
                order_num: 1,
                first_name: t1.firstName || '',
                last_name: t1.lastName || '',
                dni: t1.dni || '',
                job: t1.job || '',
                phone: t1.phone || '',
                email: t1.email || '',
            });
            if (insertError) throw insertError;
        }
    }

    // Proceso para Tutor 2
    if (patient.tutor2) {
        const t2 = patient.tutor2;
        const existingT2 = existingTutors?.find((row: any) => row.order_num === 2);
        const hasData = t2.firstName || t2.lastName || t2.phone;

        if (existingT2) {
            const { error: updateError } = await supabase.from('patient_tutors').update({
                first_name: t2.firstName || '',
                last_name: t2.lastName || '',
                dni: t2.dni || '',
                job: t2.job || '',
                phone: t2.phone || '',
            }).eq('id', existingT2.id);
            if (updateError) throw updateError;
        } else if (hasData) {
            const { error: insertError } = await supabase.from('patient_tutors').insert({
                patient_id: patient.id,
                order_num: 2,
                first_name: t2.firstName || '',
                last_name: t2.lastName || '',
                dni: t2.dni || '',
                job: t2.job || '',
                phone: t2.phone || '',
            });
            if (insertError) throw insertError;
        }
    }

    const final = await getPatientById(patient.id);
    if (!final) throw new Error("Could not retrieve patient after update");

    console.log(`[Persistence] Update successful. Final email: ${final.email}`);
    return final;
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
