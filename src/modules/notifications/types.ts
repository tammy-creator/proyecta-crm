export type NotificationType = 'CANCEL' | 'WORKFORCE' | 'REPORT' | 'DIARY' | 'INFO' | 'WHATSAPP' | 'SYSTEM' | 'AI_LOG';

export interface Notification {
    id: string;
    type: NotificationType;
    title: string;
    message: string;
    date: Date;
    read: boolean;
    actionLink?: string;
    priority: 'HIGH' | 'MEDIUM' | 'LOW';
}
