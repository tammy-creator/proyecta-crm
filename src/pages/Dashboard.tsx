import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Card from '../components/ui/Card';
import { Users, Calendar, DollarSign, Activity, Clock, AlertTriangle } from 'lucide-react';
import { startOfDay, endOfDay, format } from 'date-fns';
import { getAppointments } from '../modules/calendar/service';
import { getTransactions } from '../modules/billing/service';
import { supabase } from '../lib/supabase';
import { type Appointment } from '../modules/calendar/types';
import { type Transaction } from '../modules/billing/types';
import './Dashboard.css';

interface DashboardStats {
    todayCount: number;
    activePatients: number;
    todayRevenue: number;
    pendingRevenue: number;
    attendanceRate: number;
}

const Dashboard: React.FC = () => {
    const navigate = useNavigate();
    const { isRole } = useAuth();
    const [todayAppointments, setTodayAppointments] = useState<Appointment[]>([]);
    const [stats, setStats] = useState<DashboardStats>({
        todayCount: 0,
        activePatients: 0,
        todayRevenue: 0,
        pendingRevenue: 0,
        attendanceRate: 0,
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (isRole('THERAPIST') && !isRole('ADMIN')) {
            navigate('/calendar');
            return;
        }
        loadDashboardData();
    }, []);

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

            setTodayAppointments(todayAppts.slice(0, 5));

            // Ingresos de hoy
            const todayTrans = transactions.filter(t => {
                const d = new Date(t.date);
                return d >= start && d <= end;
            });
            const todayRevenue = todayTrans
                .filter((t: Transaction) => t.status === 'Pagado')
                .reduce((sum: number, t: Transaction) => sum + t.amount, 0);
            const pendingRevenue = transactions
                .filter((t: Transaction) => t.status === 'Pendiente')
                .reduce((sum: number, t: Transaction) => sum + t.amount, 0);

            // Tasa de asistencia (últimas 30 sesiones)
            const recentAppts = await getAppointments(
                new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000),
                today
            );
            const completed = recentAppts.filter(a =>
                a.status === 'Finalizada' || a.status === 'Cobrada'
            ).length;
            const totalNonCancelled = recentAppts.filter(a => a.status !== 'Cancelada').length;
            const attendanceRate = totalNonCancelled > 0
                ? Math.round((completed / totalNonCancelled) * 100)
                : 100;

            setStats({
                todayCount: todayAppts.length,
                activePatients: patientsResult.count ?? 0,
                todayRevenue,
                pendingRevenue,
                attendanceRate,
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
        },
        {
            title: 'Pacientes Activos',
            value: loading ? '...' : String(stats.activePatients),
            icon: <Users size={24} className="text-green" />,
            trend: 'en tratamiento',
        },
        {
            title: 'Ingresos Hoy',
            value: loading ? '...' : `${stats.todayRevenue.toFixed(0)}€`,
            icon: <DollarSign size={24} className="text-orange" />,
            trend: loading ? '' : `Pendiente ${stats.pendingRevenue.toFixed(0)}€`,
        },
        {
            title: 'Asistencia',
            value: loading ? '...' : `${stats.attendanceRate}%`,
            icon: <Activity size={24} className="text-purple" />,
            trend: stats.attendanceRate >= 90 ? 'Excelente' : stats.attendanceRate >= 75 ? 'Estable' : 'Baja',
        },
    ];

    return (
        <div className="dashboard-container">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="page-title">Panel de Control</h2>
                    <p className="text-secondary text-sm">Resumen general de Proyecta</p>
                </div>
            </div>

            <div className="stats-grid">
                {statCards.map((stat, index) => (
                    <Card key={index} className="stat-card">
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
                                    className="appointment-item cursor-pointer hover:bg-gray-50 transition-colors"
                                    onClick={() => navigate('/calendar', { state: { openAppointmentId: appt.id } })}
                                    title="Ver en calendario"
                                >
                                    <div className="time-badge">{format(new Date(appt.start), 'HH:mm')}</div>
                                    <div className="appt-details">
                                        <div className="flex justify-between">
                                            <span className="patient-name">{appt.patientName}</span>
                                            <span className="text-xs text-secondary font-medium">{appt.therapistName}</span>
                                        </div>
                                        <span className="therapy-type">{appt.type}</span>
                                    </div>
                                    <div className={`status-indicator status-${appt.status.replace(' ', '-').toLowerCase()}`}></div>
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
