export type NotificationType = 'CANCEL' | 'WORKFORCE' | 'REPORT' | 'DIARY' | 'INFO';

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
