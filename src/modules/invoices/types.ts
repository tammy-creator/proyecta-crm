export type InvoiceStatus = 'Issued' | 'Cancelled';

export interface InvoiceItem {
    description: string;
    amount: number;
}

export interface Invoice {
    id: string;
    number: string; // e.g., "2024/001"
    date: string; // ISO string
    patientId: string;
    patientName: string;
    amount: number;
    status: InvoiceStatus;
    items: InvoiceItem[];
    transactionId?: string; // Link to source paymet
}
