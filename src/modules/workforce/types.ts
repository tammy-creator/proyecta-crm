export type WorkStatus = 'offline' | 'working' | 'break';

export interface WorkLogEvent {
    type: 'check-in' | 'break-start' | 'break-end' | 'check-out';
    timestamp: string; // ISO string
}

export interface WorkLog {
    id: string;
    therapistId: string;
    date: string; // YYYY-MM-DD
    events: WorkLogEvent[];
    totalWorkedMinutes: number; // Calculated
}

export interface MonthlyReportSignature {
    id: string;
    therapistId: string;
    month: string; // YYYY-MM
    totalHours: number;
    signedAt: string; // ISO string
    declaration: string; // Legal text accepted
}
