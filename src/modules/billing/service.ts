import { supabase } from '../../lib/supabase';
import { type Transaction, type PaymentMethod } from './types';

const mapTransaction = (row: any): Transaction => ({
    id: row.id,
    appointmentId: row.appointment_id ?? '',
    patientId: row.patient_id,
    patientName: (row.patient_name ?? '').replace(/\s+/g, ' ').trim(),
    therapistName: (row.therapist_name ?? '').replace(/\s+/g, ' ').trim(),
    amount: row.amount,
    date: row.date,
    status: row.status,
    method: row.method,
    category: row.category ?? '',
    invoiceId: row.invoice_id,
    isReconciled: row.is_reconciled ?? false,
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

export const recordPayment = async (transactionId: string, method: PaymentMethod): Promise<boolean> => {
    const isFinDeMes = method === 'Fin de mes';
    const { error } = await supabase
        .from('transactions')
        .update({
            status: isFinDeMes ? 'Pendiente' : 'Pagado',
            method
        })
        .eq('id', transactionId);
    if (error) throw error;
    return true;
};

export const updateTransaction = async (transaction: Transaction): Promise<boolean> => {
    const { error } = await supabase
        .from('transactions')
        .update({
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
        // 1. If appointmentId is provided, check if a transaction already exists for it in DB
        if (transaction.appointmentId) {
            const { data: existing } = await supabase
                .from('transactions')
                .select('*')
                .eq('appointment_id', transaction.appointmentId)
                .maybeSingle();

            if (existing) {
                console.warn(`[createTransaction] Transaction already exists for appointment ${transaction.appointmentId}. Updating instead of creating duplicate.`);
                const { data: updated, error: updateError } = await supabase
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
                if (updateError) throw updateError;
                return mapTransaction(updated);
            }
        }

        // 2. Insert new transaction
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

export const toggleReconciliation = async (transactionId: string, isReconciled: boolean): Promise<boolean> => {
    const { error } = await supabase
        .from('transactions')
        .update({ is_reconciled: isReconciled })
        .eq('id', transactionId);
    if (error) throw error;
    return true;
};
