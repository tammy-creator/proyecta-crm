import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Bell, LogOut, ChevronDown, Clock, LayoutDashboard, Calendar, Users, FileText, ShieldCheck, UserRound } from 'lucide-react';
import './Header.css';
import { useLocation, useNavigate } from 'react-router-dom';
import WorkforceWidget from '../../modules/workforce/WorkforceWidget';
import NotificationPanel from '../notifications/NotificationPanel';
import { getNotifications, getDismissedIds, dismissNotification, clearOldDismissedIds } from '../../modules/notifications/service';
import type { Notification } from '../../modules/notifications/types';

const Header: React.FC = () => {
    const { user, logout, isRole } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();
    const [isProfileOpen, setIsProfileOpen] = useState(false);
    const [isWorkforceOpen, setIsWorkforceOpen] = useState(false);

    // Notification State
    const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);

    const [showClockInReminder, setShowClockInReminder] = useState(false);

    // Fetch notifications
    useEffect(() => {
        if (user) {
            loadNotifications();
            if (user.role === 'THERAPIST') {
                checkClockInStatus();
            }
        }
    }, [user, location.pathname]);

    const checkClockInStatus = async () => {
        if (!user || !user.therapistId) return; // Ensure therapistId exists
        const { getLiveWorkStats } = await import('../../modules/workforce/service');
        const stats = await getLiveWorkStats(user.therapistId); // Use user.therapistId

        // If they are offline AND haven't been reminded this session
        const hasBeenReminded = sessionStorage.getItem('clock_in_reminded');
        if (stats.status === 'offline' && !hasBeenReminded) {
            setShowClockInReminder(true);
            sessionStorage.setItem('clock_in_reminded', 'true');
        }
    };

    const loadNotifications = async () => {
        if (!user) return;
        const role = user.role as 'ADMIN' | 'THERAPIST';

        const allNotifs = await getNotifications(role, user.therapistId || user.id);

        // Filtrar las que han sido descartadas hoy
        const dismissedIds = getDismissedIds();
        const filtered = allNotifs.filter(n => !dismissedIds.includes(n.id));

        setNotifications(filtered);
        setUnreadCount(filtered.filter(n => !n.read).length);
    };

    const handleDismiss = (id: string) => {
        dismissNotification(id);
        const updated = notifications.filter(n => n.id !== id);
        setNotifications(updated);
        setUnreadCount(updated.filter(n => !n.read).length);
    };

    const handleMarkAsRead = (id: string) => {
        const updated = notifications.map(n =>
            n.id === id ? { ...n, read: true } : n
        );
        setNotifications(updated);
        setUnreadCount(updated.filter(n => !n.read).length);
    };

    const getPageInfo = () => {
        const path = location.pathname;
        if (path === '/') return { title: 'Dashboard', icon: <span className="header-icon text-secondary"><LayoutDashboard size={24} /></span> };
        if (path.startsWith('/calendar')) return { title: 'Agenda', icon: <span className="header-icon text-primary"><Calendar size={24} /></span> };
        if (path.startsWith('/patients')) return { title: 'Pacientes', icon: <span className="header-icon text-emerald-500"><Users size={24} /></span> };
        if (path.startsWith('/waiting-list')) return { title: 'Lista de Espera', icon: <span className="header-icon text-amber-500"><Clock size={24} /></span> };
        if (path.startsWith('/therapists')) return { title: 'Terapeutas', icon: <span className="header-icon text-indigo-500"><UserRound size={24} /></span> };
        if (path.startsWith('/billing')) return { title: 'Facturación', icon: <span className="header-icon text-blue-500"><FileText size={24} /></span> };
        if (path.startsWith('/admin')) return { title: 'Configuración', icon: <span className="header-icon text-slate-500"><ShieldCheck size={24} /></span> };

        return { title: 'Proyecta CRM', icon: null };
    };

    const { title, icon } = getPageInfo();

    const handleLogout = async () => {
        await logout();
        navigate('/login', { replace: true });
    };

    return (
        <header className="app-header-container">
            {showClockInReminder && (
                <div className="clock-in-reminder-banner">
                    <div className="flex items-center gap-2">
                        <Clock size={16} />
                        <span>No has fichado la entrada todavía. Recuerda registrar tu inicio de jornada.</span>
                    </div>
                    <div className="flex items-center gap-4">
                        <button className="underline font-bold" onClick={() => {
                            setIsWorkforceOpen(true);
                            setShowClockInReminder(false);
                        }}>Fichar Ahora</button>
                        <button onClick={() => setShowClockInReminder(false)}>&times;</button>
                    </div>
                </div>
            )}
            <div className="app-header">
                <div className="header-left">
                    <div className="header-page-info">
                        {icon}
                        <h1 className="page-title">{title}</h1>
                    </div>
                </div>

                <div className="header-right">
                    {/* Workforce Compact Widget - Click to expand */}
                    <div className="header-action-item">
                        <button
                            className="btn-icon-text workforce-trigger"
                            onClick={() => setIsWorkforceOpen(!isWorkforceOpen)}
                        >
                            <Clock size={18} />
                            <span>Fichar</span>
                        </button>
                        {isWorkforceOpen && (
                            <div className="workforce-popover">
                                <WorkforceWidget />
                            </div>
                        )}
                    </div>

                    {/* Notifications */}
                    <div className="header-action-item">
                        <button
                            className="btn-icon-round relative"
                            onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
                        >
                            <Bell size={20} />
                            {unreadCount > 0 && <span className="notification-badge">{unreadCount}</span>}
                        </button>
                        {isNotificationsOpen && (
                            <div style={{ position: 'absolute', top: '100%', right: 0, zIndex: 9999 }}>
                                <NotificationPanel
                                    notifications={notifications}
                                    onClose={() => setIsNotificationsOpen(false)}
                                    onMarkAsRead={handleMarkAsRead}
                                    onDismiss={handleDismiss}
                                />
                            </div>
                        )}
                    </div>

                    {/* Profile */}
                    <div className="header-profile-container">
                        <button
                            className="header-profile-btn"
                            onClick={() => setIsProfileOpen(!isProfileOpen)}
                        >
                            <div className="avatar small">{user?.name.charAt(0)}</div>
                            <span className="profile-name">{user?.name}</span>
                            <ChevronDown size={14} className={`transition-transform ${isProfileOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {isProfileOpen && (
                            <div className="profile-dropdown">
                                <div className="dropdown-header">
                                    <p className="font-bold">{user?.name}</p>
                                    <p className="text-xs text-gray-500">{user?.email}</p>
                                    <span className="text-xs" style={{ color: '#1A5F7A', fontWeight: 600 }}>
                                        {isRole('ADMIN') ? '🔑 Admin' : '🩺 Terapeuta'}
                                    </span>
                                </div>
                                <div className="dropdown-divider"></div>
                                <button className="dropdown-item text-red-600" onClick={handleLogout}>
                                    <LogOut size={16} />
                                    <span>Cerrar Sesión</span>
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </header>
    );
};

export default Header;
