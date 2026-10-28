import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Card from '../components/ui/Card';
import AppointmentDetailModal from '../components/ui/AppointmentDetailModal';
import { Users, Calendar, DollarSign, AlertTriangle, FileText, Clock, BarChart3, ShieldCheck, PhoneCall, PhoneForwarded, FileEdit } from 'lucide-react';
import { startOfDay, endOfDay, format, subDays, eachDayOfInterval, isSameDay, isSameMonth, startOfMonth, endOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { getAppointments } from '../modules/calendar/service';
import { getTransactions } from '../modules/billing/service';
import { getWaitingList } from '../modules/patients/service';
import { getPendingRegistrationAppointments } from '../modules/calendar/service';
import { supabase } from '../lib/supabase';
import { type Appointment } from '../modules/calendar/types';
import { type Transaction } from '../modules/billing/types';
import { getClaraCalls, formatPhoneDisplay } from '../modules/calls/service';
import type { ClaraCall } from '../modules/calls/types';
import { CallModal } from '../modules/calls/CallModal';
import './Dashboard.css';

interface DashboardStats {
    todayCount: number;
    activePatients: number;
    todayRevenue: number;
    pendingRevenue: number;
    waitingListCount: number;
    weeklyOccupancy: { day: string; fullDate: string; count: number }[];
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
        weeklyOccupancy: [],
    });
    const [pendingAudit, setPendingAudit] = useState<Appointment[]>([]);
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
        loadDashboardData();

        const handleRefresh = () => {
            loadDashboardData();
            loadAILogs();
        };

        window.addEventListener('notification-refresh', handleRefresh);
        window.addEventListener('calls-updated', handleRefresh);
        return () => {
            window.removeEventListener('notification-refresh', handleRefresh);
            window.removeEventListener('calls-updated', handleRefresh);
        };
    }, [user]);

    const [showAllAiLogs, setShowAllAiLogs] = useState<boolean>(false);
    const [claraCalls, setClaraCalls] = useState<ClaraCall[]>([]);
    const [selectedCall, setSelectedCall] = useState<ClaraCall | null>(null);
    const [isCallModalOpen, setIsCallModalOpen] = useState(false);

    const loadAILogs = async () => {
        try {
            const calls = await getClaraCalls();
            setClaraCalls(calls);
        } catch (error) {
            console.error('Error cargando llamadas de Clara:', error);
        }
    };

    const loadDashboardData = async () => {
        if (!user) return;
        try {
            loadAILogs();
            const today = new Date();
            const start = startOfDay(today);
            const end = endOfDay(today);

            // Si es terapeuta, filtramos por su ID, si es admin, pedimos 'all'
            const effectiveTherapistId = isRole('ADMIN') ? undefined : user.therapistId;
            const [appts, transactions, patientsResult] = await Promise.all([
                getAppointments(start, end, effectiveTherapistId),
                getTransactions(effectiveTherapistId),
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

            // Pendiente del Mes: Transacciones Pendientes del mes + Citas sin transacción del mes (hasta ahora)
            const allTxApptIds = new Set(transactions.map(t => t.appointmentId).filter(Boolean));
            const now = new Date();
            const monthStart = startOfMonth(now);
            const monthEnd = endOfMonth(now);

            // Fetch all appointments for the current month for the pending calculation
            const monthAppts = await getAppointments(monthStart, monthEnd, effectiveTherapistId);

            const pendingTransactionsAmount = transactions
                .filter(t => t.status === 'Pendiente' && isSameMonth(new Date(t.date), now))
                .reduce((sum, t) => sum + Number(t.amount || 0), 0);

            const unchargedAppointmentsAmount = monthAppts
                .filter(a => !allTxApptIds.has(a.id) && !a.isPaid && a.status !== 'Cancelada' && new Date(a.start) <= now)
                .reduce((sum, a) => sum + Number(a.price || 0), 0);

            const pendingRevenue = pendingTransactionsAmount + unchargedAppointmentsAmount;

            // Lista de espera
            const waitingList = await getWaitingList();

            // 4. Ocupación Semanal (Últimos 7 días)
            const weekStart = subDays(today, 6);
            const weekAppts = await getAppointments(startOfDay(weekStart), endOfDay(today), effectiveTherapistId);

            const days = eachDayOfInterval({ start: weekStart, end: today });
            const weeklyOccupancy = days.map(day => {
                const count = weekAppts.filter(a => isSameDay(new Date(a.start), day)).length;
                return {
                    day: format(day, 'EEE', { locale: es }),
                    fullDate: format(day, 'dd/MM'),
                    count
                };
            });

            setStats({
                todayCount: todayAppts.length,
                activePatients: patientsResult.count ?? 0,
                todayRevenue,
                pendingRevenue,
                waitingListCount: waitingList.length,
                weeklyOccupancy,
            });

            // 5. Auditoría de registros pendientes
            const pendingData = await getPendingRegistrationAppointments();
            const filteredPending = isRole('ADMIN') ? pendingData : pendingData.filter(a => a.therapistId === user.therapistId);
            setPendingAudit(filteredPending);
        } catch (err) {
            console.error('Error cargando dashboard:', err);
        } finally {
            setLoading(false);
        }
    };

    const statCards = [
        {
            title: 'Pacientes',
            value: loading ? '...' : String(stats.activePatients),
            icon: <Users strokeWidth={1.5} />,
            trend: 'Base de datos activa',
            path: '/patients',
            type: 'patients'
        },
        {
            title: 'Citas Hoy',
            value: loading ? '...' : String(stats.todayCount),
            icon: <Calendar strokeWidth={1.5} />,
            trend: stats.todayCount === 0 ? 'Sin actividad' : `${stats.todayCount} sesiones hoy`,
            path: '/calendar',
            type: 'appointments'
        },
        {
            title: 'Ingresos Hoy',
            value: loading ? '...' : `${stats.todayRevenue.toFixed(0)}€`,
            icon: <DollarSign strokeWidth={1.5} />,
            trend: stats.pendingRevenue > 0 ? `${stats.pendingRevenue.toFixed(0)}€ pendiente mes` : 'Todo al día',
            path: '/billing',
            type: 'revenue'
        },
        {
            title: 'Espera',
            value: loading ? '...' : String(stats.waitingListCount),
            icon: <Clock strokeWidth={1.5} />,
            trend: stats.waitingListCount === 0 ? 'Sin demora' : 'Pacientes en cola',
            path: '/waiting-list',
            type: 'waiting'
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
            <CallModal
                call={selectedCall}
                isOpen={isCallModalOpen}
                onClose={() => {
                    setIsCallModalOpen(false);
                    setSelectedCall(null);
                }}
                onSaved={loadAILogs}
            />
            <div className="flex flex-col items-center justify-center mb-10 text-center">
                <h2 className="page-title" style={{ marginBottom: '0.5rem' }}>Panel de Control</h2>
                <p className="text-secondary text-base opacity-80">Resumen general de Proyecta</p>
            </div>

            <div className="stats-grid">
                {statCards.map((stat, index) => (
                    <Card
                        key={index}
                        className={`stat-card ${stat.type} ${stat.path ? 'cursor-pointer hover:shadow-lg transition-all duration-200 transform hover:-translate-y-1' : ''}`}
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

            <div className="dashboard-content-grid chart-section top-row">
                <Card
                    title="Ocupación Semanal (Citas por día)"
                    subtitle="Actividad de los últimos 7 días"
                    icon={<BarChart3 size={20} className="text-primary" />}
                    className="occupancy-chart"
                >
                    <div className="chart-wrapper">
                        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                            <BarChart data={stats.weeklyOccupancy} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis
                                    dataKey="day"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fontSize: 12, fill: '#64748b', fontWeight: 600 }}
                                    dy={10}
                                />
                                <YAxis
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fontSize: 12, fill: '#64748b' }}
                                    allowDecimals={false}
                                />
                                <Tooltip
                                    cursor={{ fill: 'rgba(52, 152, 219, 0.05)', radius: 12 }}
                                    contentStyle={{
                                        borderRadius: '16px',
                                        border: 'none',
                                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                                        padding: '12px'
                                    }}
                                    itemStyle={{ fontWeight: 'bold', color: '#1d4ed8' }}
                                    labelStyle={{ marginBottom: '4px', color: '#64748b' }}
                                />
                                <Bar
                                    dataKey="count"
                                    name="Citas"
                                    radius={[8, 8, 0, 0]}
                                    fill="#3b82f6"
                                    barSize={40}
                                />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </Card>

                {(() => {
                    const threeDaysLimit = startOfDay(subDays(new Date(), 3));
                    const callsLast3Days = claraCalls.filter(c => new Date(c.date) >= threeDaysLimit);
                    const pendingRecentCount = callsLast3Days.filter(c => c.tracking?.status === 'PENDING').length;

                    return (
                        <Card 
                            title="Actividad del Bot (IA / Clara)" 
                            className="ai-logs-preview" 
                            subtitle={!showAllAiLogs ? `${pendingRecentCount} llamadas pendientes (últimos 3 días)` : "Historial de los últimos 3 días"}
                            action={
                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                                    <div style={{ display: 'flex', gap: '4px' }}>
                                        <button
                                            type="button"
                                            style={{
                                                fontSize: '11px',
                                                fontWeight: !showAllAiLogs ? 700 : 500,
                                                padding: '4px 10px',
                                                borderRadius: '6px',
                                                border: '1px solid',
                                                borderColor: !showAllAiLogs ? '#93c5fd' : '#e2e8f0',
                                                backgroundColor: !showAllAiLogs ? '#eff6ff' : '#ffffff',
                                                color: !showAllAiLogs ? '#1d4ed8' : '#64748b',
                                                cursor: 'pointer'
                                            }}
                                            onClick={() => setShowAllAiLogs(false)}
                                        >
                                            ⏳ Pendientes ({pendingRecentCount})
                                        </button>
                                        <button
                                            type="button"
                                            style={{
                                                fontSize: '11px',
                                                fontWeight: showAllAiLogs ? 700 : 500,
                                                padding: '4px 10px',
                                                borderRadius: '6px',
                                                border: '1px solid',
                                                borderColor: showAllAiLogs ? '#93c5fd' : '#e2e8f0',
                                                backgroundColor: showAllAiLogs ? '#eff6ff' : '#ffffff',
                                                color: showAllAiLogs ? '#1d4ed8' : '#64748b',
                                                cursor: 'pointer'
                                            }}
                                            onClick={() => setShowAllAiLogs(true)}
                                        >
                                            Historial 3 días ({callsLast3Days.length})
                                        </button>
                                    </div>
                                    <Link
                                        to="/calls"
                                        style={{
                                            fontSize: '11px',
                                            fontWeight: 700,
                                            padding: '4px 10px',
                                            borderRadius: '6px',
                                            backgroundColor: '#0284c7',
                                            color: '#ffffff',
                                            textDecoration: 'none',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '5px'
                                        }}
                                        title="Ver todo el historial completo de llamadas"
                                    >
                                        <PhoneCall size={12} />
                                        <span>Ver Registro Completo</span>
                                    </Link>
                                </div>
                            }
                        >
                            <div className="ai-logs-container">
                                {(() => {
                                    const displayed = !showAllAiLogs
                                        ? callsLast3Days.filter(c => c.tracking?.status === 'PENDING')
                                        : callsLast3Days;

                                    if (displayed.length === 0) {
                                        return (
                                            <div className="text-secondary text-sm p-4 text-center italic">
                                                {!showAllAiLogs ? '🎉 ¡Al día! No hay llamadas pendientes de devolver en los últimos 3 días.' : 'Sin llamadas en los últimos 3 días.'}
                                            </div>
                                        );
                                    }

                            return (
                                <table className="ai-logs-table">
                                    <thead>
                                        <tr>
                                            <th>Fecha</th>
                                            <th>Contacto</th>
                                            <th>Resumen</th>
                                            <th className="text-right" style={{ width: '130px' }}>Gestión</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {displayed.map(call => {
                                            const isPending = call.tracking?.status === 'PENDING';
                                            const isReturned = call.tracking?.status === 'RETURNED';

                                            return (
                                                <tr key={call.id} style={{ opacity: isReturned ? 0.75 : 1 }}>
                                                    <td className="log-date">{format(call.date, 'dd/MM HH:mm')}</td>
                                                    <td style={{ minWidth: '140px' }}>
                                                        <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '13px' }}>
                                                            {formatPhoneDisplay(call.phone)}
                                                        </div>
                                                        {call.patientName && (
                                                            <div style={{ fontSize: '11px', color: '#0284c7', fontWeight: 600 }}>
                                                                {call.patientName}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="log-message">
                                                        <div>{call.summary}</div>
                                                        {call.tracking?.notes && (
                                                            <div style={{ marginTop: '4px', fontSize: '11px', color: '#059669', backgroundColor: '#ecfdf5', padding: '2px 6px', borderRadius: '4px', border: '1px solid #a7f3d0' }}>
                                                                <strong>Nota ({call.tracking.returnedBy}):</strong> {call.tracking.notes}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="text-right">
                                                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setSelectedCall(call);
                                                                    setIsCallModalOpen(true);
                                                                }}
                                                                style={{
                                                                    padding: '4px 8px',
                                                                    borderRadius: '6px',
                                                                    border: isPending ? 'none' : '1px solid #cbd5e1',
                                                                    backgroundColor: isPending ? '#0284c7' : '#ffffff',
                                                                    color: isPending ? '#ffffff' : '#475569',
                                                                    fontWeight: 700,
                                                                    fontSize: '11px',
                                                                    cursor: 'pointer',
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    gap: '4px'
                                                                }}
                                                                title="Registrar devolución o editar reporte"
                                                            >
                                                                {isPending ? (
                                                                    <>
                                                                        <PhoneForwarded size={12} /> Devolver
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <FileEdit size={12} /> Gestionada
                                                                    </>
                                                                )}
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            );
                        })()}
                    </div>
                </Card>
            );
        })()}
    </div>

            <div className="dashboard-content-grid" style={{ marginBottom: '4rem' }}>
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

                <Card title="Resumen de Cobros" className="alerts-preview" subtitle="Pendiente acumulado del mes">
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

            {/* Nueva Sección de Auditoría Global */}
            <div className="dashboard-audit-section" style={{ marginTop: '4rem', marginBottom: '3rem' }}>
                <Card
                    title="Auditoría Clínica: Diarios Pendientes de Registro"
                    subtitle={isRole('ADMIN') ? "Hoy y ayer · Vista global del centro" : "Hoy y ayer · Mis sesiones pendientes"}
                    icon={<FileText size={20} className="text-red-500" />}
                >
                    {pendingAudit.length === 0 ? (
                        <div className="py-8 text-center text-secondary italic">
                            <ShieldCheck size={40} className="mx-auto mb-2 opacity-20 text-emerald-500" />
                            <p>No hay sesiones pendientes de registro clínico de hoy ni de ayer. ¡Al día!</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold letter-spacing-wider">
                                    <tr>
                                        <th className="px-4 py-3">Paciente</th>
                                        <th className="px-4 py-3">Fecha</th>
                                        {isRole('ADMIN') && <th className="px-4 py-3">Terapeuta</th>}
                                        <th className="px-4 py-3">Servicio</th>
                                        <th className="px-4 py-3 text-right">Acción</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {pendingAudit.map(appt => (
                                        <tr key={appt.id} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-4 py-4 font-bold text-slate-700">{appt.patientName}</td>
                                            <td className="px-4 py-4 text-slate-500">
                                                {new Date(appt.start).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                                            </td>
                                            {isRole('ADMIN') && (
                                                <td className="px-4 py-4">
                                                    <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded-md text-[11px] font-medium">
                                                        {appt.therapistName}
                                                    </span>
                                                </td>
                                            )}
                                            <td className="px-4 py-4 text-slate-500 italic">{appt.type}</td>
                                            <td className="px-4 py-4 text-right">
                                                <button
                                                    className="text-primary hover:underline font-bold"
                                                    onClick={() => navigate(`/patients?id=${appt.patientId}&tab=history`)}
                                                >
                                                    Completar Registro
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {pendingAudit.length > 5 && (
                                <p className="text-[10px] text-center mt-4 text-slate-400 italic">
                                    Mostrando las últimas sesiones pendientes...
                                </p>
                            )}
                        </div>
                    )}
                </Card>
            </div>
        </div>
    );
};

export default Dashboard;
