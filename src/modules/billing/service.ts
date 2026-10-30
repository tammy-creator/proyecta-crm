import { supabase } from '../../lib/supabase';
import { type Transaction, type PaymentMethod } from './types';
import { markAppointmentPaid, setAppointmentPaidStatus } from '../calendar/service';

export const isNonClinicalSession = (patientName?: string, type?: string, status?: string): boolean => {
    if (status === 'Bloqueada' || status === 'Cancelada') return true;
    const p = (patientName || '').toLowerCase().trim();
    const t = (type || '').toLowerCase().trim();
    if (t === 'bloqueo' || t === 'bloqueada') return true;
    return (
        p.includes('no asistencial') ||
        p.includes('trabajo no') ||
        p.includes('coordinación') ||
        p.includes('coordinacion') ||
        p.includes('vacaci') ||
        p.includes('libre') ||
        p.includes('bloque') ||
        p.includes('supervis') ||
        p.includes('reuni') ||
        p.includes('formaci') ||
        p.includes('médico') ||
        p.includes('medico') ||
        p.includes('baja') ||
        p.includes('no viene') ||
        p.includes('no puede') ||
        p.includes('descansa') ||
        t.includes('no asistencial') ||
        t.includes('trabajo no') ||
        t.includes('coordinación') ||
        t.includes('coordinacion') ||
        t.includes('bloqueo')
    );
};

const mapTransaction = (row: any): Transaction => ({
    id: row.id,
    appointmentId: row.appointment_id ?? '',
    patientId: row.patient_id,
    patientName: (row.patient_name ?? '').replace(/\s+/g, ' ').trim(),
    therapistName: (row.therapist_name ?? '').replace(/\s+/g, ' ').trim(),
    amount: row.amount,
    date: row.date,
    paymentDate: row.payment_date || (row.status === 'Pagado' ? row.date : undefined),
    status: row.status,
    method: row.method,
    category: row.category ?? '',
    invoiceId: row.invoice_id,
    isReconciled: row.is_reconciled ?? false,
    notes: row.notes,
});

export const getTransactions = async (therapistName?: string): Promise<Transaction[]> => {
    const PAGE_SIZE = 1000;
    const allRows: any[] = [];
    let page = 0;
    let hasMore = true;

    while (hasMore) {
        let query = supabase
            .from('transactions')
            .select('*');
        
        if (therapistName) {
            query = query.eq('therapist_name', therapistName);
        }

        const { data, error } = await query
            .order('date', { ascending: false })
            .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

        if (error) throw error;
        if (data && data.length > 0) {
            allRows.push(...data);
            if (data.length < PAGE_SIZE) {
                hasMore = false;
            } else {
                page++;
            }
        } else {
            hasMore = false;
        }
    }

    return allRows.map(mapTransaction);
};

export const recordPayment = async (
    transactionId: string,
    method: PaymentMethod,
    paymentDate?: string
): Promise<boolean> => {
    const isFinDeMes = method === 'Fin de mes';
    const effectivePaymentDate = isFinDeMes ? null : (paymentDate || new Date().toISOString());

    // Try updating with payment_date
    try {
        const { error } = await supabase
            .from('transactions')
            .update({
                status: isFinDeMes ? 'Pendiente' : 'Pagado',
                method,
                payment_date: effectivePaymentDate
            })
            .eq('id', transactionId);
        if (!error) return true;
    } catch (_) {}

    // Fallback if payment_date column doesn't exist yet
    const { error: fallbackError } = await supabase
        .from('transactions')
        .update({
            status: isFinDeMes ? 'Pendiente' : 'Pagado',
            method
        })
        .eq('id', transactionId);
    if (fallbackError) throw fallbackError;
    return true;
};

export const updateTransaction = async (transaction: Transaction): Promise<boolean> => {
    const isPaid = transaction.status === 'Pagado';
    const paymentDateToSave = isPaid
        ? (transaction.paymentDate || transaction.date || new Date().toISOString())
        : null;

    const basePayload: any = {
        appointment_id: transaction.appointmentId || null,
        patient_id: transaction.patientId,
        patient_name: transaction.patientName,
        therapist_name: transaction.therapistName,
        amount: transaction.amount,
        date: transaction.date,
        status: transaction.status,
        method: transaction.method ?? null,
        category: transaction.category,
        invoice_id: transaction.invoiceId ?? null,
        is_reconciled: transaction.isReconciled ?? false,
    };

    try {
        const { error } = await supabase
            .from('transactions')
            .update({ ...basePayload, payment_date: paymentDateToSave })
            .eq('id', transaction.id);
        if (!error) {
            if (transaction.appointmentId) {
                await supabase
                    .from('appointments')
                    .update({ price: transaction.amount })
                    .eq('id', transaction.appointmentId);
            }
            return true;
        }
    } catch (_) {}

    // Fallback without payment_date
    const { error } = await supabase
        .from('transactions')
        .update(basePayload)
        .eq('id', transaction.id);
    if (error) throw error;

    if (transaction.appointmentId) {
        await supabase
            .from('appointments')
            .update({ price: transaction.amount })
            .eq('id', transaction.appointmentId);
    }
    return true;
};

// In-flight map to prevent concurrent double-clicks or parallel requests creating duplicate transactions
const inFlightAppointmentTx = new Map<string, Promise<Transaction>>();

export const createTransaction = async (
    transaction: Omit<Transaction, 'id'>
): Promise<Transaction> => {
    // If there is already a creation in flight for this appointment, reuse that promise
    if (transaction.appointmentId && inFlightAppointmentTx.has(transaction.appointmentId)) {
        return inFlightAppointmentTx.get(transaction.appointmentId)!;
    }

    const executeCreate = async (): Promise<Transaction> => {
        const isPaid = transaction.status === 'Pagado';
        const effectivePaymentDate = isPaid
            ? (transaction.paymentDate || new Date().toISOString())
            : null;

        // 1. If appointmentId is provided, check if a transaction already exists for it in DB
        if (transaction.appointmentId) {
            const { data: existing } = await supabase
                .from('transactions')
                .select('*')
                .eq('appointment_id', transaction.appointmentId)
                .maybeSingle();

            if (existing) {
                console.warn(`[createTransaction] Transaction already exists for appointment ${transaction.appointmentId}. Updating instead of creating duplicate.`);
                
                try {
                    const { data: updated, error: updateError } = await supabase
                        .from('transactions')
                        .update({
                            patient_id: transaction.patientId,
                            patient_name: transaction.patientName,
                            therapist_name: transaction.therapistName,
                            amount: transaction.amount,
                            date: transaction.date,
                            payment_date: effectivePaymentDate,
                            status: transaction.status,
                            method: transaction.method ?? null,
                            category: transaction.category,
                        })
                        .eq('id', existing.id)
                        .select()
                        .single();
                    if (!updateError && updated) return mapTransaction(updated);
                } catch (_) {}

                const { data: updatedFallback, error: fallbackError } = await supabase
                    .from('transactions')
                    .update({
                        patient_id: transaction.patientId,
                        patient_name: transaction.patientName,
                        therapist_name: transaction.therapistName,
                        amount: transaction.amount,
                        date: transaction.date,
                        status: transaction.status,
                        method: transaction.method ?? null,
                        category: transaction.category,
                    })
                    .eq('id', existing.id)
                    .select()
                    .single();
                if (fallbackError) throw fallbackError;
                return mapTransaction(updatedFallback);
            }
        }

        // 2. Insert new transaction
        try {
            const { data, error } = await supabase
                .from('transactions')
                .insert({
                    appointment_id: transaction.appointmentId || null,
                    patient_id: transaction.patientId,
                    patient_name: transaction.patientName,
                    therapist_name: transaction.therapistName,
                    amount: transaction.amount,
                    date: transaction.date,
                    payment_date: effectivePaymentDate,
                    status: transaction.status,
                    method: transaction.method ?? null,
                    category: transaction.category,
                    invoice_id: transaction.invoiceId ?? null,
                    is_reconciled: transaction.isReconciled ?? false,
                })
                .select()
                .single();
            if (!error && data) return mapTransaction(data);
        } catch (_) {}

        // Fallback without payment_date
        const { data, error } = await supabase
            .from('transactions')
            .insert({
                appointment_id: transaction.appointmentId || null,
                patient_id: transaction.patientId,
                patient_name: transaction.patientName,
                therapist_name: transaction.therapistName,
                amount: transaction.amount,
                date: transaction.date,
                status: transaction.status,
                method: transaction.method ?? null,
                category: transaction.category,
                invoice_id: transaction.invoiceId ?? null,
                is_reconciled: transaction.isReconciled ?? false,
            })
            .select()
            .single();
        if (error) throw error;
        return mapTransaction(data);
    };

    if (transaction.appointmentId) {
        const promise = executeCreate().finally(() => {
            inFlightAppointmentTx.delete(transaction.appointmentId!);
        });
        inFlightAppointmentTx.set(transaction.appointmentId, promise);
        return promise;
    }

    return executeCreate();
};

export interface BatchPaymentItem {
    appointmentId?: string;
    transactionId?: string;
    amount: number;
    patientId: string;
    patientName: string;
    therapistName?: string;
    date: string; // appointment start or tx date
    category?: string;
}

export const batchPayAppointments = async (
    items: BatchPaymentItem[],
    method: PaymentMethod,
    paymentDate: string = new Date().toISOString()
): Promise<{ success: number; failed: number }> => {
    let success = 0;
    let failed = 0;
    const isFinDeMes = method === 'Fin de mes';
    const effectivePaymentDate = isFinDeMes ? undefined : paymentDate;

    for (const item of items) {
        try {
            if (item.transactionId) {
                await recordPayment(item.transactionId, method, effectivePaymentDate);
                if (item.appointmentId) {
                    if (isFinDeMes) {
                        await setAppointmentPaidStatus(item.appointmentId, false);
                    } else {
                        await markAppointmentPaid(item.appointmentId);
                    }
                }
            } else if (item.appointmentId) {
                await createTransaction({
                    appointmentId: item.appointmentId,
                    patientId: item.patientId,
                    patientName: item.patientName,
                    therapistName: item.therapistName,
                    amount: item.amount,
                    date: item.date,
                    paymentDate: effectivePaymentDate,
                    status: isFinDeMes ? 'Pendiente' : 'Pagado',
                    method,
                    category: item.category || 'Terapia',
                });
                if (isFinDeMes) {
                    await setAppointmentPaidStatus(item.appointmentId, false);
                } else {
                    await markAppointmentPaid(item.appointmentId);
                }
            }
            success++;
        } catch (err) {
            console.error(`[batchPayAppointments] Error processing item:`, item, err);
            failed++;
        }
    }
    return { success, failed };
};

export const toggleReconciliation = async (transactionId: string, isReconciled: boolean): Promise<boolean> => {
    const { error } = await supabase
        .from('transactions')
        .update({ is_reconciled: isReconciled })
        .eq('id', transactionId);
    if (error) throw error;
    return true;
};
