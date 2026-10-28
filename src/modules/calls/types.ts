export type CallStatus = 'PENDING' | 'RETURNED' | 'NO_ANSWER' | 'INFO_ONLY';

export interface CallTracking {
    callId: string;
    status: CallStatus;
    returnedAt?: string;
    returnedBy?: string;
    notes?: string;
    updatedAt: string;
}

export interface ClaraCall {
    id: string;
    date: Date;
    phone: string;
    patientId?: string;
    patientName?: string;
    title: string;
    summary: string;
    rawMessage: string;
    isDismissed: boolean;
    tracking?: CallTracking;
}
