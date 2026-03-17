import React from 'react';
import type { Notification } from '../../modules/notifications/types';
import { Bell, AlertCircle, FileText, CalendarX, Info, Clock, X } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import './NotificationPanel.css';

interface NotificationPanelProps {
    notifications: Notification[];
    onClose: () => void;
    onMarkAsRead: (id: string) => void;
    onDismiss: (id: string) => void;
}

const NotificationPanel: React.FC<NotificationPanelProps> = ({ notifications, onClose, onMarkAsRead, onDismiss }) => {

    const getIcon = (type: string) => {
        switch (type) {
            case 'CANCEL': return <CalendarX size={18} className="text-red-500" />;
            case 'WORKFORCE': return <Clock size={18} className="text-orange-500" />;
            case 'REPORT': return <FileText size={18} className="text-blue-500" />;
            case 'DIARY': return <AlertCircle size={18} className="text-purple-500" />;
            default: return <Info size={18} className="text-gray-500" />;
        }
    };

    return (
        <div className="notification-panel">
            <div className="notification-header">
                <h3>Notificaciones</h3>
                <button className="close-panel-btn" onClick={onClose} title="Cerrar">
                    <X size={18} />
                </button>
            </div>

            <div className="notification-list">
                {notifications.length === 0 ? (
                    <div className="p-4 text-center text-gray-400 text-sm">
                        <Bell size={24} className="mx-auto mb-2 opacity-20" />
                        No tienes notificaciones nuevas
                    </div>
                ) : (
                    notifications.map(n => (
                        <div key={n.id} className={`notification-item ${n.read ? 'read' : 'unread'} priority-${n.priority.toLowerCase()}`}>
                            <div className="notification-icon">
                                {getIcon(n.type)}
                            </div>
                            <div className="notification-content">
                                <h4 className="notification-title">{n.title}</h4>
                                <p className="notification-message">{n.message}</p>
                                <span className="notification-time">
                                    {format(new Date(n.date), "d MMM HH:mm", { locale: es })}
                                </span>
                            </div>
                            {!n.read && (
                                <button
                                    className="mark-read-btn"
                                    title="Marcar como leída"
                                    onClick={() => onMarkAsRead(n.id)}
                                >
                                    <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                                </button>
                            )}
                            <button
                                className="dismiss-btn"
                                title="Descartar"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onDismiss(n.id);
                                }}
                            >
                                <X size={14} />
                            </button>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default NotificationPanel;
