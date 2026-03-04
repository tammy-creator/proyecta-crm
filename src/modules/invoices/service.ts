import { supabase } from '../../lib/supabase';
import type { Invoice } from './types';

const mapInvoice = (row: any): Invoice => ({
    id: row.id,
    number: row.number,
    date: row.date,
    patientId: row.patient_id,
    patientName: row.patient_name ?? '',
    amount: row.amount,
    status: row.status,
    items: row.items ?? [],
    transactionId: row.transaction_id,
});

export const getInvoices = async (): Promise<Invoice[]> => {
    const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .order('date', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapInvoice);
};

export const getNextInvoiceNumber = async (): Promise<string> => {
    const year = new Date().getFullYear();
    const { count } = await supabase
        .from('invoices')
        .select('*', { count: 'exact', head: true })
        .like('date', `${year}%`);
    const next = (count ?? 0) + 1;
    return `${year}/${next.toString().padStart(3, '0')}`;
};

export const createInvoice = async (invoice: Omit<Invoice, 'id' | 'number'>): Promise<Invoice> => {
    const number = await getNextInvoiceNumber();
    const { data, error } = await supabase
        .from('invoices')
        .insert({
            number,
            date: invoice.date,
            patient_id: invoice.patientId,
            patient_name: invoice.patientName,
            amount: invoice.amount,
            status: invoice.status,
            items: invoice.items,
            transaction_id: invoice.transactionId ?? null,
        })
        .select()
        .single();
    if (error) throw error;
    return mapInvoice(data);
};

export const updateInvoice = async (invoice: Invoice): Promise<boolean> => {
    const { error } = await supabase
        .from('invoices')
        .update({
            date: invoice.date,
            patient_id: invoice.patientId,
            patient_name: invoice.patientName,
            amount: invoice.amount,
            status: invoice.status,
            items: invoice.items,
            transaction_id: invoice.transactionId ?? null,
        })
        .eq('id', invoice.id);
    if (error) throw error;
    return true;
};
