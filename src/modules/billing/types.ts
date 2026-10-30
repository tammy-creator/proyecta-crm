export type TransactionStatus = 'Pagado' | 'Pendiente' | 'Deuda';
export type PaymentMethod = 'Efectivo' | 'Tarjeta' | 'Transferencia' | 'Fin de mes' | 'Saldo a favor';

export interface Transaction {
    id: string;
    appointmentId: string;
    patientId: string;
    patientName: string;
    therapistName?: string;
    amount: number;
    date: string; // ISO string (session / accrual date)
    paymentDate?: string; // ISO string (actual payment / cash date)
    status: TransactionStatus;
    method?: PaymentMethod;
    category: string; // e.g., 'Terapia', 'Evaluación Material', 'Ingreso Beca'
    invoiceId?: string; // Link to generated invoice of this transaction
    isReconciled?: boolean; // For bank transfer reconciliation
    notes?: string;
}

export interface FinanceSummary {
    totalRevenue: number;
    pendingRevenue: number;
    totalTransactions: number;
}

export interface PatientBalanceInfo {
    balance: number;
    totalDeposited: number;
    totalConsumed: number;
}

export interface PatientBalance extends PatientBalanceInfo {
    patientId: string;
    patientName: string;
    transactions: Transaction[];
}

export interface AddPatientCreditParams {
    patientId: string;
    patientName: string;
    amount: number;
    method: 'Transferencia' | 'Tarjeta' | 'Efectivo';
    category?: string; // 'Ingreso Beca', 'Anticipo mensualidad', 'Bono sesiones'
    paymentDate?: string;
    therapistName?: string;
    notes?: string;
}
