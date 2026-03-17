import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Card from '../components/ui/Card';
import AppointmentDetailModal from '../components/ui/AppointmentDetailModal';
import { Users, Calendar, DollarSign, Activity, AlertTriangle, FileText, Clock } from 'lucide-react';
import { startOfDay, endOfDay, format } from 'date-fns';
import { getAppointments } from '../modules/calendar/service';
import { getTransactions } from '../modules/billing/service';
import { getWaitingList } from '../modules/patients/service';
import { supabase } from '../lib/supabase';
import { type Appointment } from '../modules/calendar/types';
import { type Transaction } from '../modules/billing/types';
import './Dashboard.css';

interface DashboardStats {
    todayCount: number;
    activePatients: number;
    todayRevenue: number;
    pendingRevenue: number;
    waitingListCount: number;
}

const Dashboard: React.FC = () => {
    const navigate = useNavigate();
    const { user, isRole } = useAuth();
    const [todayAppointments, setTodayAppointments] = useState<Appointment[]>([]);
    const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [stats, setStats] = useState<DashboardStats>({
        todayCount: 0,
        activePatients: 0,
        todayRevenue: 0,
        pendingRevenue: 0,
        waitingListCount: 0,
    });
    const [loading, setLoading] = useState(true);

    const getStatusClass = (status: string) => {
        const s = (status || '').trim().toLowerCase();
        if (s.includes('programada')) return 'programada';
        if (s.includes('sesi')) return 'en-sesion';
        if (s.includes('finalizada')) return 'finalizada';
        if (s.includes('cobrada')) return 'cobrada';
        if (s.includes('cancela')) return 'cancelada';
        if (s.includes('ausente')) return 'ausente';
        return 'default';
    };

    const calculateStatuses = (list: Appointment[]) => {
        const now = new Date();
        return list.map(appt => {
            if (appt.isPaid) return { ...appt, status: 'Cobrada' as const };

            const start = new Date(appt.start);
            const end = new Date(appt.end);

            if (['Cancelada', 'Cobrada', 'Ausente'].includes(appt.status)) {
                return appt;
            }

            let newStatus = appt.status;
            if (now >= start && now < end) {
                if (appt.status === 'Programada') newStatus = 'En Sesión';
            } else if (now >= end) {
                if (appt.status === 'Programada' || appt.status === 'En Sesión') newStatus = 'Finalizada';
            }

            return newStatus !== appt.status ? { ...appt, status: newStatus as any } : appt;
        });
    };

    useEffect(() => {
        if (user && isRole('THERAPIST') && !isRole('ADMIN')) {
            navigate('/calendar', { replace: true });
        }
    }, [user, isRole, navigate]);

    useEffect(() => {
        if (user && (!isRole('THERAPIST') || isRole('ADMIN'))) {
            loadDashboardData();
        } else if (user) {
            setLoading(false);
        }
    }, [user]);

    const loadDashboardData = async () => {
        try {
            const today = new Date();
            const start = startOfDay(today);
            const end = endOfDay(today);

            // Cargar en paralelo
            const [appts, transactions, patientsResult] = await Promise.all([
                getAppointments(start, end),
                getTransactions(),
                supabase
                    .from('patients')
                    .select('id', { count: 'exact' })
                    .eq('status', 'Activo'),
            ]);

            // Citas de hoy
            const todayAppts = appts
                .filter(a => {
                    const d = new Date(a.start);
                    return d >= start && d <= end;
                })
                .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

            setTodayAppointments(calculateStatuses(todayAppts.slice(0, 5)));

            // Ingresos de hoy
            const todayStr = format(today, 'yyyy-MM-dd');
            const todayTrans = transactions.filter(t => t.date && t.date.startsWith(todayStr));

            const todayRevenue = todayTrans
                .filter((t: Transaction) => t.status === 'Pagado')
                .reduce((sum: number, t: Transaction) => sum + Number(t.amount || 0), 0);

            // Pendiente del día: Transacciones Pendientes de hoy + Citas sin transacción de hoy
            const allTxApptIds = new Set(transactions.map(t => t.appointmentId).filter(Boolean));

            const pendingTransactionsAmount = todayTrans
                .filter(t => t.status === 'Pendiente')
                .reduce((sum, t) => sum + Number(t.amount || 0), 0);

            const now = new Date();
            const unchargedAppointmentsAmount = todayAppts
                .filter(a => !allTxApptIds.has(a.id) && !a.isPaid && new Date(a.start) <= now)
                .reduce((sum, a) => sum + Number(a.price || 0), 0);

            const pendingRevenue = pendingTransactionsAmount + unchargedAppointmentsAmount;

            // Lista de espera
            const waitingList = await getWaitingList();

            setStats({
                todayCount: todayAppts.length,
                activePatients: patientsResult.count ?? 0,
                todayRevenue,
                pendingRevenue,
                waitingListCount: waitingList.length,
            });
        } catch (err) {
            console.error('Error cargando dashboard:', err);
        } finally {
            setLoading(false);
        }
    };

    const statCards = [
        {
            title: 'Citas Hoy',
            value: loading ? '...' : String(stats.todayCount),
            icon: <Calendar size={24} className="text-blue" />,
            trend: loading ? '' : `${stats.todayCount === 0 ? 'Sin citas programadas' : 'sesiones programadas'}`,
            path: '/calendar'
        },
        {
            title: 'Pacientes Activos',
            value: loading ? '...' : String(stats.activePatients),
            icon: <Users size={24} className="text-green" />,
            trend: 'en tratamiento',
            path: '/patients'
        },
        {
            title: 'Ingresos Hoy',
            value: loading ? '...' : `${stats.todayRevenue.toFixed(0)}€`,
            icon: <DollarSign size={24} className="text-orange" />,
            trend: loading ? '' : `Pendiente ${stats.pendingRevenue.toFixed(0)}€`,
            path: '/billing'
        },
        {
            title: 'Lista de Espera',
            value: loading ? '...' : String(stats.waitingListCount),
            icon: <Clock size={24} className="text-purple" />,
            trend: stats.waitingListCount === 0 ? 'Sin pendientes' : 'Pacientes por asignar',
            path: '/waiting-list'
        },
    ];

    return (
        <div className="dashboard-container">
            <AppointmentDetailModal
                appointment={selectedAppt}
                isOpen={isModalOpen}
                onClose={() => {
                    setIsModalOpen(false);
                    setSelectedAppt(null);
                }}
            />
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="page-title">Panel de Control</h2>
                    <p className="text-secondary text-sm">Resumen general de Proyecta</p>
                </div>
            </div>

            <div className="stats-grid">
                {statCards.map((stat, index) => (
                    <Card
                        key={index}
                        className={`stat-card ${stat.path ? 'cursor-pointer hover:shadow-lg transition-all duration-200 transform hover:-translate-y-1' : ''}`}
                        onClick={() => stat.path ? navigate(stat.path) : undefined}
                    >
                        <div className="stat-icon-wrapper">{stat.icon}</div>
                        <div className="stat-info">
                            <span className="stat-value">{stat.value}</span>
                            <span className="stat-title">{stat.title}</span>
                            <span className="stat-trend">{stat.trend}</span>
                        </div>
                    </Card>
                ))}
            </div>

            <div className="dashboard-content-grid">
                <Card title="Agenda de Hoy" className="agenda-preview" action={<button className="btn-link" onClick={() => navigate('/calendar')}>Ver todo</button>}>
                    <div className="appointment-list">
                        {loading ? (
                            <div className="text-secondary text-sm p-4 text-center">Cargando...</div>
                        ) : todayAppointments.length === 0 ? (
                            <div className="text-secondary text-sm p-4 text-center italic">No hay citas programadas para hoy.</div>
                        ) : (
                            todayAppointments.map((appt) => (
                                <div
                                    key={appt.id}
                                    className={`appointment-item status-${getStatusClass(appt.status)} cursor-pointer transition-colors`}
                                    onClick={() => {
                                        setSelectedAppt(appt);
                                        setIsModalOpen(true);
                                    }}
                                    title={`Ver detalles: ${appt.status}`}
                                >
                                    <div className="time-badge">{format(new Date(appt.start), 'HH:mm')}</div>
                                    <div className="appt-details">
                                        <div className="flex justify-between items-start">
                                            <div className="flex flex-col">
                                                <div className="flex items-center gap-2">
                                                    <span className="patient-name">{appt.patientName}</span>
                                                    <div className="flex items-center gap-1">
                                                        {(appt.isPaid || appt.status === 'Cobrada') ? (
                                                            <span title="Cobrada"><DollarSign size={14} className="text-emerald-500" /></span>
                                                        ) : (
                                                            appt.status !== 'Cancelada' && (
                                                                <span title="Pendiente de cobro"><DollarSign size={14} className="text-red-500" /></span>
                                                            )
                                                        )}
                                                        {(appt.status === 'Finalizada' || appt.status === 'Cobrada') && !appt.sessionDiary && (
                                                            <span title="Falta diario de sesión"><AlertTriangle size={14} className="text-orange-500" /></span>
                                                        )}
                                                        {(appt.status === 'Finalizada' || appt.status === 'Cobrada') && appt.sessionDiary && (
                                                            <span title="Diario completado"><FileText size={14} className="text-blue-500" /></span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <span className={`appt-status-badge ${appt.status === 'Cobrada' ? 'is-paid' : ''}`}>
                                                {appt.status}
                                            </span>
                                        </div>
                                        <div className="flex justify-between text-xs text-secondary mt-1">
                                            <span className="therapy-type">{appt.type}</span>
                                            <span className="therapist-name">{appt.therapistName}</span>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </Card>

                <Card title="Resumen de Cobros" className="alerts-preview" subtitle="Transacciones pendientes de hoy">
                    <div className="space-y-3">
                        {loading ? (
                            <div className="text-secondary text-sm p-4 text-center">Cargando...</div>
                        ) : stats.pendingRevenue === 0 ? (
                            <div className="text-secondary text-sm p-4 text-center italic">No hay cobros pendientes.</div>
                        ) : (
                            <div className="alert-item p-3 border rounded-xl flex items-center justify-between bg-orange-50 border-orange-100">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-orange-100 rounded-lg text-orange-600">
                                        <AlertTriangle size={18} />
                                    </div>
                                    <div>
                                        <div className="font-bold text-sm">Cobros pendientes</div>
                                        <div className="text-xs text-orange-500">{stats.pendingRevenue.toFixed(2)}€ por cobrar</div>
                                    </div>
                                </div>
                                <button className="btn-icon micro" title="Ver facturación" onClick={() => navigate('/billing')}>
                                    <Clock size={14} />
                                </button>
                            </div>
                        )}
                    </div>
                </Card>
            </div>
        </div>
    );
};

export default Dashboard;
