export interface CenterSettings {
    name: string;
    cif: string;
    address: string;
    phone: string;
    email: string;
    website?: string;
}

export type AuditLogCategory = 'auth' | 'data' | 'billing' | 'calendar' | 'system';

export interface AuditLog {
    id: string;
    userId: string;
    userName: string;
    action: string;
    details?: string;
    timestamp: string; // ISO string
    category: AuditLogCategory;
}

export interface UserAccount {
    id: string;
    fullName: string;
    email: string;
    role: 'Admin' | 'Therapist' | 'Staff';
    status: 'Active' | 'Inactive';
    therapistId?: string;
    lastAccess?: string;
    requiresPasswordChange?: boolean;
}

export interface ClinicalService {
    id: string;
    name: string;
    price: number;
}
