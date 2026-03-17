import { supabase } from '../../lib/supabase';
import { type Transaction, type PaymentMethod } from './types';

const mapTransaction = (row: any): Transaction => ({
    id: row.id,
    appointmentId: row.appointment_id ?? '',
    patientId: row.patient_id,
    patientName: row.patient_name ?? '',
    therapistName: row.therapist_name,
    amount: row.amount,
    date: row.date,
    status: row.status,
    method: row.method,
    category: row.category ?? '',
    invoiceId: row.invoice_id,
    isReconciled: row.is_reconciled ?? false,
});

export const getTransactions = async (): Promise<Transaction[]> => {
    const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .order('date', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapTransaction);
};

export const recordPayment = async (transactionId: string, method: PaymentMethod): Promise<boolean> => {
    const { error } = await supabase
        .from('transactions')
        .update({ status: 'Pagado', method })
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
    return true;
};

export const createTransaction = async (
    transaction: Omit<Transaction, 'id'>
): Promise<Transaction> => {
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

export const toggleReconciliation = async (transactionId: string, isReconciled: boolean): Promise<boolean> => {
    const { error } = await supabase
        .from('transactions')
        .update({ is_reconciled: isReconciled })
        .eq('id', transactionId);
    if (error) throw error;
    return true;
};
