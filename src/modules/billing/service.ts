import { supabase } from '../../lib/supabase';
import { type Transaction, type PaymentMethod, type PatientBalanceInfo, type AddPatientCreditParams } from './types';
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

const mapTransaction = (row: any): Transaction => {
    const rawCategory = row.category ?? '';
    const isSaldoAFavor =
        rawCategory.startsWith('[Saldo a favor]') ||
        rawCategory.includes('[Saldo a favor]') ||
        rawCategory === 'Saldo a favor' ||
        row.method === 'Saldo a favor' ||
        (!row.method && row.status === 'Pagado' && row.appointment_id);
    const cleanCategory = rawCategory.replace(/^\[Saldo a favor\]\s*/, '').trim();

    return {
        id: row.id,
        appointmentId: row.appointment_id ?? '',
        patientId: row.patient_id,
        patientName: (row.patient_name ?? '').replace(/\s+/g, ' ').trim(),
        therapistName: (row.therapist_name ?? '').replace(/\s+/g, ' ').trim(),
        amount: row.amount,
        date: row.date,
        paymentDate: row.payment_date || (row.status === 'Pagado' ? row.date : undefined),
        status: row.status,
        method: isSaldoAFavor ? 'Saldo a favor' : row.method,
        category: cleanCategory || (isSaldoAFavor ? 'Terapia' : ''),
        invoiceId: row.invoice_id,
        isReconciled: row.is_reconciled ?? false,
        notes: row.notes,
    };
};

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
    const isSaldo = method === 'Saldo a favor';
    const effectivePaymentDate = isFinDeMes ? null : (paymentDate || new Date().toISOString());

    let categoryToUpdate: string | undefined = undefined;
    if (isSaldo) {
        try {
            const { data: existing } = await supabase
                .from('transactions')
                .select('category')
                .eq('id', transactionId)
                .maybeSingle();
            const baseCat = (existing?.category || 'Terapia').replace(/^\[Saldo a favor\]\s*/, '').trim();
            categoryToUpdate = `[Saldo a favor] ${baseCat}`.trim();
        } catch (_) {}
    }

    const payload: any = {
        status: isFinDeMes ? 'Pendiente' : 'Pagado',
        method: isSaldo ? null : method,
        payment_date: effectivePaymentDate
    };
    if (categoryToUpdate) payload.category = categoryToUpdate;

    // Try updating with payment_date
    try {
        const { error } = await supabase
            .from('transactions')
            .update(payload)
            .eq('id', transactionId);
        if (!error) return true;
    } catch (_) {}

    // Fallback if payment_date column doesn't exist yet
    delete payload.payment_date;
    const { error: fallbackError } = await supabase
        .from('transactions')
        .update(payload)
        .eq('id', transactionId);
    if (fallbackError) throw fallbackError;
    return true;
};

export const updateTransaction = async (transaction: Transaction): Promise<boolean> => {
    const isPaid = transaction.status === 'Pagado';
    const isSaldo = transaction.method === 'Saldo a favor';
    const paymentDateToSave = isPaid
        ? (transaction.paymentDate || transaction.date || new Date().toISOString())
        : null;

    let effectiveCategory = transaction.category;
    if (isSaldo) {
        const base = (transaction.category || 'Terapia').replace(/^\[Saldo a favor\]\s*/, '').trim();
        effectiveCategory = `[Saldo a favor] ${base}`.trim();
    }

    const basePayload: any = {
        appointment_id: transaction.appointmentId || null,
        patient_id: transaction.patientId,
        patient_name: transaction.patientName,
        therapist_name: transaction.therapistName,
        amount: transaction.amount,
        date: transaction.date,
        status: transaction.status,
        method: isSaldo ? null : (transaction.method ?? null),
        category: effectiveCategory,
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
        const isSaldo = transaction.method === 'Saldo a favor';
        const effectivePaymentDate = isPaid
            ? (transaction.paymentDate || new Date().toISOString())
            : null;

        let effectiveCategory = transaction.category;
        if (isSaldo) {
            const base = (transaction.category || 'Terapia').replace(/^\[Saldo a favor\]\s*/, '').trim();
            effectiveCategory = `[Saldo a favor] ${base}`.trim();
        }

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
                            method: isSaldo ? null : (transaction.method ?? null),
                            category: effectiveCategory,
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
                        method: isSaldo ? null : (transaction.method ?? null),
                        category: effectiveCategory,
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
                    method: isSaldo ? null : (transaction.method ?? null),
                    category: effectiveCategory,
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
                method: isSaldo ? null : (transaction.method ?? null),
                category: effectiveCategory,
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

export const isAdvanceDeposit = (category?: string, status?: string): boolean => {
    if (status && status !== 'Pagado') return false;
    const cat = (category || '').toLowerCase().trim();
    if (cat.includes('[saldo a favor]')) return false;
    return (
        cat.includes('ingreso beca') ||
        cat.includes('anticipo') ||
        cat.includes('bono') ||
        cat === 'beca'
    );
};

export const isSaldoConsumption = (method?: string, category?: string, status?: string): boolean => {
    if (status && status !== 'Pagado') return false;
    return method === 'Saldo a favor' || (category || '').includes('[Saldo a favor]');
};

export const computePatientBalances = (allTransactions: Transaction[]): Map<string, PatientBalanceInfo> => {
    const map = new Map<string, PatientBalanceInfo>();

    const getOrCreate = (key: string): PatientBalanceInfo => {
        let entry = map.get(key);
        if (!entry) {
            entry = { balance: 0, totalDeposited: 0, totalConsumed: 0 };
            map.set(key, entry);
        }
        return entry;
    };

    allTransactions.forEach(t => {
        if (t.status !== 'Pagado') return;
        const amount = Number(t.amount || 0);
        if (isNaN(amount) || amount <= 0) return;

        const keys: string[] = [];
        if (t.patientId) keys.push(t.patientId);
        if (t.patientName) keys.push(t.patientName.toLowerCase().trim());

        const isDeposit = isAdvanceDeposit(t.category, t.status);
        const isConsumption = isSaldoConsumption(t.method, t.category, t.status);

        if (isDeposit) {
            keys.forEach(k => {
                const entry = getOrCreate(k);
                entry.totalDeposited += amount;
                entry.balance += amount;
            });
        } else if (isConsumption) {
            keys.forEach(k => {
                const entry = getOrCreate(k);
                entry.totalConsumed += amount;
                entry.balance -= amount;
            });
        }
    });

    return map;
};

export const addPatientCredit = async (params: AddPatientCreditParams): Promise<Transaction> => {
    const nowIso = params.paymentDate || new Date().toISOString();
    const category = params.notes
        ? `${params.category || 'Ingreso Beca'} (${params.notes})`
        : (params.category || 'Ingreso Beca');

    const payload: any = {
        appointment_id: null,
        patient_id: params.patientId,
        patient_name: params.patientName,
        therapist_name: params.therapistName || 'Administración',
        amount: Number(params.amount),
        date: nowIso,
        payment_date: nowIso,
        status: 'Pagado',
        method: params.method,
        category: category.trim(),
    };

    try {
        const { data, error } = await supabase
            .from('transactions')
            .insert(payload)
            .select()
            .single();
        if (!error && data) return mapTransaction(data);
    } catch (_) {}

    delete payload.payment_date;
    const { data, error } = await supabase
        .from('transactions')
        .insert(payload)
        .select()
        .single();
    if (error) throw error;
    return mapTransaction(data);
};

export const deletePatientCredit = async (transactionId: string): Promise<boolean> => {
    const { error } = await supabase
        .from('transactions')
        .delete()
        .eq('id', transactionId);
    if (error) throw error;
    return true;
};
