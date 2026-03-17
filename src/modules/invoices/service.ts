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
    try {
        const year = new Date().getFullYear();
        const { data, error } = await supabase
            .from('invoices')
            .select('number')
            .order('number', { ascending: false })
            .limit(100);
        
        if (error) throw error;
        
        // Fallback simple count if no data
        if (!data || data.length === 0) return `${year}/001`;

        // Try to find the highest number for this year
        const yearPrefix = `${year}/`;
        const yearNumbers = data
            .map(i => i.number || '')
            .filter(n => n.startsWith(yearPrefix))
            .map(n => {
                const parts = n.split('/');
                return parts.length > 1 ? parseInt(parts[1]) : NaN;
            })
            .filter(n => !isNaN(n));

        const next = yearNumbers.length > 0 ? Math.max(...yearNumbers) + 1 : 1;
        return `${year}/${next.toString().padStart(3, '0')}`;
    } catch (e) {
        console.error("Error in getNextInvoiceNumber:", e);
        return `${new Date().getFullYear()}/001`; // Fallback
    }
};

export const existsInvoiceNumber = async (number: string): Promise<boolean> => {
    try {
        console.log(`[Service] Querying DB for invoice number: ${number}`);
        const { data, error, status } = await supabase
            .from('invoices')
            .select('id')
            .eq('number', number)
            .maybeSingle();
        
        if (error) {
            console.error(`[Service] Supabase Error (${status}):`, error);
            throw error;
        }
        console.log(`[Service] Query result:`, data);
        return !!data;
    } catch (e) {
        console.error("Error in existsInvoiceNumber:", e);
        // If it's a real error, we might want to alert it instead of assuming false
        throw e; 
    }
};

export const createInvoice = async (invoice: Omit<Invoice, 'id'>): Promise<Invoice> => {
    const number = invoice.number || await getNextInvoiceNumber();
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
