import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    format, 
    parseISO, 
    isValid
} from 'date-fns';
import { es } from 'date-fns/locale';
import { supabase } from '../../lib/supabase';
import { 
    Search, 
    Calendar as CalendarIcon, 
    User, 
    Clock, 
    AlertTriangle, 
    X, 
    Eye, 
    ExternalLink,
    Lock,
    Stethoscope,
    FileText,
    CreditCard,
    Wallet,
    Send,
    CalendarClock
} from 'lucide-react';
import { getAppointments, updateAppointment } from './service';
import { getTransactions, createTransaction, updateTransaction } from '../billing/service';
import { type Transaction } from '../billing/types';
import { type Appointment, type AppointmentStatus } from './types';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../hooks/useToast';
import Card from '../../components/ui/Card';
import './AppointmentRegistry.css';

const AppointmentRegistry: React.FC = () => {
    const { isRole, user } = useAuth();
    const navigate = useNavigate();
    const { showToast } = useToast();
    
    const [loading, setLoading] = useState(true);
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    
    // Filters
    const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('ALL');
    const [therapistFilter, setTherapistFilter] = useState<string>('ALL');
    const [paymentFilter, setPaymentFilter] = useState<string>('ALL');
    
    // Modal
    const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    useEffect(() => {
        fetchData();
    }, [startDate, endDate]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const start = new Date(startDate);
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            
            if (!isValid(start) || !isValid(end)) {
                setLoading(false);
                return;
            }

            const effectiveTherapistId = isRole('THERAPIST') ? user?.therapistId : undefined;
            const effectiveTherapistName = isRole('THERAPIST') ? user?.name : undefined;
            
            const [data, txData] = await Promise.all([
                getAppointments(start, end, effectiveTherapistId),
                getTransactions(effectiveTherapistName)
            ]);
            
            setAppointments(data);
            setTransactions(txData);
        } catch (error) {
            console.error("Error fetching appointments:", error);
            showToast("Error al cargar el registro de citas", "error");
        } finally {
            setLoading(false);
        }
    };

    const getPaymentInfo = (appt: Appointment) => {
        const tx = transactions.find(t => t.appointmentId === appt.id);
        if (tx) {
            return {
                method: tx.method,
                label: tx.method || (tx.status === 'Pagado' ? 'Pagado' : 'Pendiente'),
                isPaid: tx.status === 'Pagado',
                status: tx.status
            };
        }
        
        // Solo mostrar como pendiente si la cita ya pasó y no es cancelación/bloqueo
        const now = new Date();
        const apptStart = parseISO(appt.start);
        if (apptStart < now && appt.status !== 'Cancelada' && appt.status !== 'Bloqueada') {
            return {
                label: 'Pendiente de pago',
                isPaid: false,
                method: 'PENDIENTE'
            };
        }
        
        return null;
    };

    const getStatusBadgeClass = (status: AppointmentStatus) => {
        switch (status) {
            case 'Programada': return 'badge-info';
            case 'En Sesión': return 'badge-primary';
            case 'Finalizada': return 'badge-success';
            case 'Cobrada': return 'badge-premium';
            case 'Cancelada': return 'badge-danger';
            case 'Ausente': return 'badge-warning';
            case 'Bloqueada': return 'badge-neutral';
            default: return '';
        }
    };

    const getEffectiveStatus = (appt: Appointment): AppointmentStatus => {
        if (['Cancelada', 'Cobrada', 'Ausente', 'Bloqueada'].includes(appt.status)) {
            return appt.status;
        }

        const now = new Date();
        const start = parseISO(appt.start);
        const end = parseISO(appt.end);

        if ((now >= start) && (now < end)) {
            if (appt.status === 'Programada') return 'En Sesión';
        } else if (now >= end) {
            if (appt.status === 'Programada' || appt.status === 'En Sesión') return 'Finalizada';
        }

        return appt.status;
    };

    const filteredAppointments = appointments.filter(appt => {
        // Search term (Patient, Therapist, Type, or Notes)
        const searchLower = searchTerm.toLowerCase();
        const matchesSearch = 
            appt.patientName?.toLowerCase().includes(searchLower) ||
            appt.therapistName?.toLowerCase().includes(searchLower) ||
            appt.type?.toLowerCase().includes(searchLower) ||
            appt.notes?.toLowerCase().includes(searchLower);

        // Status filter
        const effectiveStatus = getEffectiveStatus(appt);
        const matchesStatus = statusFilter === 'ALL' || effectiveStatus === statusFilter;

        // Therapist filter
        const matchesTherapist = therapistFilter === 'ALL' || appt.therapistId === therapistFilter;

        // Payment filter
        const payInfo = getPaymentInfo(appt);
        let matchesPayment = paymentFilter === 'ALL';
        if (paymentFilter === 'PAGADO') {
            matchesPayment = !!payInfo?.isPaid;
        } else if (paymentFilter === 'PENDIENTE') {
            matchesPayment = !!(payInfo && !payInfo.isPaid);
        } else if (paymentFilter !== 'ALL') {
            matchesPayment = payInfo?.method === paymentFilter;
        }

        return matchesSearch && matchesStatus && matchesTherapist && matchesPayment;
    }).sort((a, b) => a.start.localeCompare(b.start)); // Oldest first



    const handleAmountChange = async (appt: Appointment, newAmount: number) => {
        try {
            await updateAppointment({ ...appt, price: newAmount });
            setAppointments(prev => prev.map(a => a.id === appt.id ? { ...a, price: newAmount } : a));
            showToast(`Importe actualizado a ${newAmount}€`, 'success');
        } catch (error) {
            console.error("Error updating amount:", error);
            showToast("Error al actualizar el importe", 'error');
        }
    };

    const handlePaymentChange = async (appt: Appointment, method: string) => {
        try {
            if (method === 'PENDIENTE') {
                // 1. Delete transactions for this appt
                const txToDelete = transactions.filter(t => t.appointmentId === appt.id);
                for (const tx of txToDelete) {
                    const { error } = await supabase.from('transactions').delete().eq('id', tx.id);
                    if (error) throw error;
                }

                // 2. Mark appt as unpaid
                await updateAppointment({ ...appt, isPaid: false });

                setAppointments(prev => prev.map(a => a.id === appt.id ? { ...a, isPaid: false } : a));
                showToast("Cobro eliminado", 'info');
            } else {
                // 1. Validate we have a patient
                if (!appt.patientId) {
                    showToast("No se puede cobrar una cita sin paciente asignado", 'error');
                    return;
                }

                // 2. Determine status and isPaid
                const txStatus = method === 'Fin de mes' ? 'Pendiente' : 'Pagado';
                const isPaid = method !== 'Fin de mes';

                // 3. Check if transaction already exists to update it, or create new one
                const existingTx = transactions.find(t => t.appointmentId === appt.id);
                
                if (existingTx) {
                    await updateTransaction({ 
                        ...existingTx, 
                        status: txStatus, 
                        method: method as any,
                        amount: appt.price || 60 
                    });
                } else {
                    await createTransaction({
                        appointmentId: appt.id,
                        patientId: appt.patientId,
                        patientName: appt.patientName || '',
                        therapistName: appt.therapistName || '',
                        amount: appt.price || 60,
                        method: method as any,
                        date: appt.start,
                        status: txStatus,
                        category: appt.type || 'Sesión',
                        notes: `Gestionado desde Registro de Citas`
                    });
                }

                // 4. Mark appointment status
                // We only set to 'Cobrada' if it's a FINALIZED session being PAID now.
                // If it's 'Fin de mes' (isPaid=false), we keep the status as is (usually 'Finalizada').
                let newStatus = appt.status;
                if (isPaid && (appt.status === 'Finalizada' || getEffectiveStatus(appt) === 'Finalizada')) {
                    newStatus = 'Cobrada';
                }

                await updateAppointment({ ...appt, isPaid, status: newStatus });

                setAppointments(prev => prev.map(a => a.id === appt.id ? { ...a, isPaid, status: newStatus } : a));
                showToast(isPaid ? `Cobro registrado: ${method}` : `Asignado a: ${method} (Pendiente)`, 'success');
            }
            
            // Refresh transactions
            const txData = await getTransactions(isRole('THERAPIST') ? user?.name : undefined);
            setTransactions(txData);
        } catch (error: any) {
            console.error("Error updating payment full detail:", error);
            const msg = error.message || error.details || "Error desconocido";
            showToast(`Error al procesar el cobro: ${msg}`, 'error');
        }
    };

    const handleStatusChange = async (appt: Appointment, newStatus: AppointmentStatus) => {
        try {
            await updateAppointment({ ...appt, status: newStatus });
            setAppointments(prev => prev.map(a => a.id === appt.id ? { ...a, status: newStatus } : a));
            showToast(`Estado actualizado a ${newStatus}`, 'success');
        } catch (error) {
            console.error("Error updating status:", error);
            showToast("Error al actualizar el estado", 'error');
        }
    };



    const handleViewInCalendar = (appt: Appointment) => {
        const date = appt.start.split('T')[0];
        navigate('/calendar', { state: { openAppointmentId: appt.id, date } });
    };

    const handleOpenDetail = (appt: Appointment) => {
        setSelectedAppt(appt);
        setIsModalOpen(true);
    };

    const uniqueTherapists = Array.from(new Set(appointments.map(a => JSON.stringify({ id: a.therapistId, name: a.therapistName }))))
        .map(s => JSON.parse(s))
        .sort((a, b) => a.name.localeCompare(b.name));

    return (
        <div className="appt-registry-container">
            <div className="registry-header">
                <div>
                    <h1 className="registry-title">
                        <FileText size={28} className="text-primary" />
                        Registro de Citas
                    </h1>
                    <p className="registry-subtitle">Histórico completo y búsqueda avanzada de sesiones</p>
                </div>
                
                <div className="registry-stats">
                    <div className="stat-pill">
                        <span className="stat-label">Total en rango:</span>
                        <span className="stat-value">{filteredAppointments.length}</span>
                    </div>
                </div>
            </div>

            <Card className="registry-filters-card">
                <div className="filters-toolbar">
                    <div className="filter-group-inline search-main">
                        <Search size={16} className="text-slate-400" />
                        <input 
                            type="text" 
                            placeholder="Buscar paciente, descripción..." 
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>

                    <div className="filter-group-inline">
                        <label>Desde</label>
                        <input 
                            type="date" 
                            value={startDate} 
                            onChange={e => setStartDate(e.target.value)} 
                        />
                    </div>

                    <div className="filter-group-inline">
                        <label>Hasta</label>
                        <input 
                            type="date" 
                            value={endDate} 
                            onChange={e => setEndDate(e.target.value)} 
                        />
                    </div>
                </div>
            </Card>

            <div className="registry-table-wrapper">
                <table className="registry-table">
                    <thead>
                        <tr>
                            <th>Fecha y Hora</th>
                            <th>Paciente / Descripción</th>
                            <th>
                                <div className="header-with-filter">
                                    <span>Terapeuta</span>
                                    {!isRole('THERAPIST') && (
                                        <select className="header-select" value={therapistFilter} onChange={e => setTherapistFilter(e.target.value)}>
                                            <option value="ALL">Todos</option>
                                            {uniqueTherapists.map(t => (
                                                <option key={t.id} value={t.id}>{t.name}</option>
                                            ))}
                                        </select>
                                    )}
                                </div>
                            </th>
                            <th>Servicio</th>
                            <th style={{ width: '100px' }}>Importe</th>
                            <th>
                                <div className="header-with-filter">
                                    <span>Estado</span>
                                    <select className="header-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                                        <option value="ALL">Todos</option>
                                        <option value="Programada">Programada</option>
                                        <option value="En Sesión">En Sesión</option>
                                        <option value="Finalizada">Finalizada</option>
                                        <option value="Cobrada">Cobrada</option>
                                        <option value="Cancelada">Cancelada</option>
                                        <option value="Ausente">Ausente</option>
                                        <option value="Bloqueada">Bloqueada</option>
                                    </select>
                                </div>
                            </th>
                            <th>
                                <div className="header-with-filter">
                                    <span>Forma de Pago</span>
                                    <select className="header-select" value={paymentFilter} onChange={e => setPaymentFilter(e.target.value)}>
                                        <option value="ALL">Todos</option>
                                        <option value="PAGADO">Cobrado (Cualquiera)</option>
                                        <option value="PENDIENTE">Pendiente</option>
                                        <option value="Efectivo">Efectivo</option>
                                        <option value="Tarjeta">Tarjeta</option>
                                        <option value="Transferencia">Transferencia</option>
                                        <option value="Fin de mes">Fin de mes</option>
                                    </select>
                                </div>
                            </th>
                            <th className="text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={8} className="text-center p-8">
                                    <div className="loading-spinner-small"></div>
                                    <p className="mt-2 text-secondary">Cargando citas...</p>
                                </td>
                            </tr>
                        ) : filteredAppointments.length === 0 ? (
                            <tr>
                                <td colSpan={8} className="text-center p-12">
                                    <div className="empty-state-icon">
                                        <Search size={48} />
                                    </div>
                                    <h3>No se encontraron citas</h3>
                                    <p className="text-secondary">Prueba a ajustar los filtros o el rango de fechas.</p>
                                </td>
                            </tr>
                        ) : (
                            filteredAppointments.map(appt => (
                                <tr key={appt.id} className={appt.status === 'Cancelada' ? 'row-cancelled' : ''}>
                                    <td className="cell-datetime">
                                        <div className="date-main">{format(parseISO(appt.start), 'dd/MM/yyyy')}</div>
                                        <div className="time-sub">{format(parseISO(appt.start), 'HH:mm')} - {format(parseISO(appt.end), 'HH:mm')}</div>
                                    </td>
                                    <td className="cell-patient">
                                        {appt.status === 'Bloqueada' ? (
                                            <div className="flex items-center gap-2 text-slate-500 font-medium">
                                                <Lock size={14} />
                                                <span>{appt.patientName || 'Horario bloqueado'}</span>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-2">
                                                <div className="patient-avatar-small">
                                                    {appt.patientName?.charAt(0)}
                                                </div>
                                                <span className="font-bold">{appt.patientName}</span>
                                            </div>
                                        )}
                                    </td>
                                    <td>
                                        <div className="text-sm font-medium">{appt.therapistName}</div>
                                    </td>
                                    <td>
                                        <div className="service-tag">{appt.type}</div>
                                    </td>
                                    <td>
                                        {isRole('ADMIN') ? (
                                            <div className="flex items-center gap-1">
                                                <input 
                                                    type="number" 
                                                    className="registry-amount-input"
                                                    defaultValue={appt.price || 60}
                                                    onBlur={(e) => handleAmountChange(appt, Number(e.target.value))}
                                                />
                                                <span className="text-secondary text-xs">€</span>
                                            </div>
                                        ) : (
                                            <span className="font-bold">{appt.price || 60}€</span>
                                        )}
                                    </td>
                                    <td>
                                        {isRole('ADMIN') ? (
                                            <select 
                                                className={`registry-status-select ${getStatusBadgeClass(getEffectiveStatus(appt))}`}
                                                value={appt.status}
                                                onChange={(e) => handleStatusChange(appt, e.target.value as AppointmentStatus)}
                                            >
                                                <option value="Programada">Programada</option>
                                                <option value="En Sesión">En Sesión</option>
                                                <option value="Finalizada">Finalizada</option>
                                                <option value="Cobrada">Cobrada</option>
                                                <option value="Cancelada">Cancelada</option>
                                                <option value="Ausente">Ausente</option>
                                                <option value="Bloqueada">Bloqueada</option>
                                            </select>
                                        ) : (
                                            <span className={`badge ${getStatusBadgeClass(getEffectiveStatus(appt))}`}>
                                                {getEffectiveStatus(appt)}
                                            </span>
                                        )}
                                    </td>
                                    <td>
                                        {(() => {
                                            const payInfo = getPaymentInfo(appt);
                                            
                                            if (isRole('ADMIN')) {
                                                const currentMethod = payInfo?.method || 'PENDIENTE';
                                                const isPaid = payInfo?.isPaid || false;
                                                return (
                                                    <select 
                                                        className={`registry-payment-select ${isPaid ? 'paid' : 'unpaid'} ${currentMethod === 'Fin de mes' ? 'delayed' : ''}`}
                                                        value={currentMethod}
                                                        onChange={(e) => handlePaymentChange(appt, e.target.value)}
                                                    >
                                                        <option value="PENDIENTE">⚠️ Pendiente</option>
                                                        <option value="Tarjeta">💳 Tarjeta</option>
                                                        <option value="Efectivo">💵 Efectivo</option>
                                                        <option value="Transferencia">🏦 Transferencia</option>
                                                        <option value="Fin de mes">📅 Fin de mes</option>
                                                    </select>
                                                );
                                            }

                                            if (payInfo?.isPaid) {
                                                return (
                                                    <div className="flex items-center gap-2 text-emerald-600 font-bold text-xs uppercase bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100">
                                                        {payInfo.method === 'Tarjeta' && <CreditCard size={14} />}
                                                        {payInfo.method === 'Efectivo' && <Wallet size={14} />}
                                                        {payInfo.method === 'Transferencia' && <Send size={14} />}
                                                        {payInfo.method === 'Fin de mes' && <CalendarClock size={14} />}
                                                        {payInfo.label}
                                                    </div>
                                                );
                                            } else {
                                                return (
                                                    <div className="flex items-center gap-1.5 text-amber-600 font-bold text-xs uppercase px-2 py-1 bg-amber-50 rounded-lg border border-amber-100">
                                                        <AlertTriangle size={14} />
                                                        {payInfo?.label || 'Pendiente'}
                                                    </div>
                                                );
                                            }
                                        })()}
                                    </td>
                                    <td className="text-right">
                                        <div className="flex justify-end gap-2">
                                            <button 
                                                className="btn-icon-registry" 
                                                onClick={() => handleOpenDetail(appt)}
                                                title="Ver detalles"
                                            >
                                                <Eye size={18} />
                                            </button>
                                            <button 
                                                className="btn-icon-registry highlight" 
                                                onClick={() => handleViewInCalendar(appt)}
                                                title="Ver en Agenda"
                                            >
                                                <CalendarIcon size={18} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Modal de Detalles */}
            {isModalOpen && selectedAppt && (
                <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
                    <div className="modal-content registry-detail-modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <div className="flex items-center gap-3">
                                <div className={`header-icon ${getStatusBadgeClass(selectedAppt.status)}`}>
                                    {selectedAppt.status === 'Bloqueada' ? <Lock size={20} /> : <Stethoscope size={20} />}
                                </div>
                                <div>
                                    <h3 className="m-0">{selectedAppt.status === 'Bloqueada' ? 'Detalle de Bloqueo' : 'Detalle de la Cita'}</h3>
                                    <span className="text-xs text-secondary">{selectedAppt.id}</span>
                                </div>
                            </div>
                            <button className="btn-icon-round" onClick={() => setIsModalOpen(false)}><X size={20} /></button>
                        </div>

                        <div className="detail-body">
                            <div className="detail-section grid grid-cols-2 gap-4">
                                <div className="info-block">
                                    <label>Fecha y Hora</label>
                                    <div className="value">
                                        <CalendarIcon size={14} />
                                        {format(parseISO(selectedAppt.start), "EEEE d 'de' MMMM, yyyy", { locale: es })}
                                    </div>
                                    <div className="value-sub">
                                        <Clock size={14} />
                                        {format(parseISO(selectedAppt.start), 'HH:mm')} - {format(parseISO(selectedAppt.end), 'HH:mm')}
                                    </div>
                                </div>
                                <div className="info-block">
                                    <label>Estado</label>
                                    <span className={`badge ${getStatusBadgeClass(selectedAppt.status)}`}>
                                        {selectedAppt.status}
                                    </span>
                                </div>
                            </div>

                            <div className="detail-section">
                                <div className="info-block">
                                    <label>{selectedAppt.status === 'Bloqueada' ? 'Descripción' : 'Paciente'}</label>
                                    <div className="value-large">{selectedAppt.patientName}</div>
                                </div>
                            </div>

                            <div className="detail-section grid grid-cols-2 gap-4">
                                <div className="info-block">
                                    <label>Terapeuta</label>
                                    <div className="value">
                                        <User size={14} />
                                        {selectedAppt.therapistName}
                                    </div>
                                </div>
                                <div className="info-block">
                                    <label>Servicio</label>
                                    <div className="value">{selectedAppt.type}</div>
                                </div>
                            </div>

                            {selectedAppt.notes && (
                                <div className="detail-section">
                                    <div className="info-block">
                                        <label>Notas de la Cita</label>
                                        <div className="text-content">{selectedAppt.notes}</div>
                                    </div>
                                </div>
                            )}

                            {selectedAppt.sessionDiary && (
                                <div className="detail-section">
                                    <div className="info-block highlight-diary">
                                        <label className="flex items-center gap-2">
                                            <FileText size={14} /> Diario de Sesión
                                        </label>
                                        <div className="text-content diary-text">{selectedAppt.sessionDiary}</div>
                                    </div>
                                </div>
                            )}

                            {selectedAppt.cancellationReason && (
                                <div className="detail-section">
                                    <div className="info-block warning-block">
                                        <label className="flex items-center gap-2 text-red-600">
                                            <AlertTriangle size={14} /> Motivo de Cancelación
                                        </label>
                                        <div className="text-content">{selectedAppt.cancellationReason}</div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="modal-footer">
                            <button className="btn-secondary" onClick={() => setIsModalOpen(false)}>Cerrar</button>
                            <button className="btn-primary flex items-center gap-2" onClick={() => handleViewInCalendar(selectedAppt)}>
                                <ExternalLink size={16} />
                                Ir a la Agenda
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AppointmentRegistry;
