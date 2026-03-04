export type TransactionStatus = 'Pagado' | 'Pendiente' | 'Deuda';
export type PaymentMethod = 'Efectivo' | 'Tarjeta' | 'Transferencia';

export interface Transaction {
    id: string;
    appointmentId: string;
    patientId: string;
    patientName: string;
    therapistName?: string;
    amount: number;
    date: string; // ISO string
    status: TransactionStatus;
    method?: PaymentMethod;
    category: string; // e.g., 'Terapia', 'Evaluación Material'
    invoiceId?: string; // Link to generated invoice of this transaction
}

export interface FinanceSummary {
    totalRevenue: number;
    pendingRevenue: number;
    totalTransactions: number;
}
