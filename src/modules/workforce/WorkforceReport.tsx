import React, { useState, useEffect } from 'react';
import { 
    format, 
    parseISO, 
    isSameDay, 
    eachDayOfInterval, 
    startOfMonth, 
    endOfMonth, 
    isWeekend, 
    startOfDay, 
    endOfDay
} from 'date-fns';
import { es } from 'date-fns/locale';
import { useAuth } from '../../context/AuthContext';
import { 
    Download, 
    Plus, 
    AlertCircle, 
    CheckCircle2, 
    History,
    CalendarDays,
    Trash2,
    Edit2,
    ArrowDownRight,
    ArrowUpRight,
    Calendar,
    Clock,
    ShieldCheck
} from 'lucide-react';
import { 
    getAllAttendance, 
    addAttendance, 
    updateAttendance, 
    deleteAttendance, 
    getAllSignatures, 
    getActiveTherapistsForMonth,
    getTherapistVacations
} from './service';
import { getTherapists } from '../therapists/service';
import { getAppointments } from '../calendar/service';
import { supabase } from '../../lib/supabase';
import type { Attendance, MonthlyReportSignature } from './types';
import type { Therapist } from '../therapists/types';
import type { CenterSettings } from '../admin/types';
import { getCenterSettings } from '../admin/service';
import Modal from '../../components/ui/Modal';
import { generateDetailedReportPDF } from '../../utils/pdfGenerator';
import './WorkforceReport.css';

const WorkforceReport: React.FC = () => {
    const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'));
    const [selectedTherapistId, setSelectedTherapistId] = useState<string>('');
    const [therapists, setTherapists] = useState<Therapist[]>([]);
    const [attendances, setAttendances] = useState<Attendance[]>([]);
    const [appointments, setAppointments] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [centerSettings, setCenterSettings] = useState<CenterSettings | null>(null);
    const [signedReports, setSignedReports] = useState<(MonthlyReportSignature & { therapistName?: string })[]>([]);
    const [activeTherapistsForMonth, setActiveTherapistsForMonth] = useState<string[]>([]);
    const [activeTherapistsCurrentMonth, setActiveTherapistsCurrentMonth] = useState<string[]>([]);
    
    // Modal state
    const [activeTab, setActiveTab] = useState<'daily' | 'absences' | 'signatures'>('daily');
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingRecord, setEditingRecord] = useState<Partial<Attendance> | null>(null);
    const [isAbsenceModalOpen, setIsAbsenceModalOpen] = useState(false);
    const [isVacationListModalOpen, setIsVacationListModalOpen] = useState(false);
    const [allVacations, setAllVacations] = useState<Attendance[]>([]);
    const [vacationLoading, setVacationLoading] = useState(false);
    const { user: currentUser } = useAuth();

    useEffect(() => {
        getTherapists().then(data => {
            setTherapists(data);
            if (data.length > 0 && !selectedTherapistId) {
                setSelectedTherapistId(data[0].id);
            }
        });

        getCenterSettings().then(setCenterSettings).catch(console.error);

        // Load signed reports for admin
        if (currentUser?.role === 'ADMIN') {
            getAllSignatures().then(setSignedReports).catch(console.error);
        }
    }, []);

    useEffect(() => {
        if (selectedTherapistId) {
            fetchData();
        }
    }, [month, selectedTherapistId]);

    useEffect(() => {
        if (currentUser?.role === 'ADMIN') {
            const currentMonth = format(new Date(), 'yyyy-MM');
            getActiveTherapistsForMonth(currentMonth).then(setActiveTherapistsCurrentMonth).catch(console.error);
            getActiveTherapistsForMonth(month).then(setActiveTherapistsForMonth).catch(console.error);
        }
    }, [month, currentUser]);

    const fetchData = async () => {
        if (!selectedTherapistId) return;
        setLoading(true);
        try {
            const attData = await getAllAttendance(month, selectedTherapistId);
            setAttendances(attData);

            const startDay = parseISO(`${month}-01`);
            const endDay = endOfMonth(startDay);
            
            const appts = await getAppointments(startDay, endDay);
            
            const filteredAppts = appts.filter(a => 
                a.therapistId === selectedTherapistId && 
                a.status !== 'Cancelada'
            );
            
            setAppointments(filteredAppts);
        } catch (error) {
            console.error("Error fetching workforce data:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleShowVacations = async () => {
        if (!selectedTherapistId) return;
        setVacationLoading(true);
        setIsVacationListModalOpen(true);
        try {
            const data = await getTherapistVacations(selectedTherapistId);
            setAllVacations(data);
        } catch (error) {
            console.error("Error fetching vacation history:", error);
        } finally {
            setVacationLoading(false);
        }
    };

    const handleDeleteFromHistory = async (id: string) => {
        try {
            const adminInfo = currentUser ? { id: currentUser.id, name: currentUser.name || 'Admin' } : undefined;
            await deleteAttendance(id, adminInfo);
            setAllVacations(prev => prev.filter(v => v.id !== id));
            fetchData();
        } catch (error: any) {
            console.error("Error deleting from history:", error);
            alert(`Error al eliminar: ${error.message || 'Error desconocido'}`);
        }
    };


    const handleSaveAttendance = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingRecord || !selectedTherapistId) return;

        // Validation for overlaps in absences
        if (editingRecord.type !== 'work') {
            const existingAbsences = await getTherapistVacations(selectedTherapistId);
            const newStart = parseISO(editingRecord.startTime!);
            const newEnd = editingRecord.endTime ? parseISO(editingRecord.endTime) : newStart;
            
            const hasOverlap = existingAbsences.some(abs => {
                if (abs.id === editingRecord.id) return false; // Ignore current if editing
                const absStart = parseISO(abs.startTime);
                const absEnd = abs.endTime ? parseISO(abs.endTime) : absStart;
                
                // Overlap logic: (StartA <= EndB) and (EndA >= StartB)
                return newStart <= absEnd && newEnd >= absStart;
            });

            if (hasOverlap) {
                alert("Ya existe una ausencia (vacación o baja) registrada para este terapeuta en las fechas seleccionadas. Por favor, revisa el historial.");
                return;
            }
        }

        try {
            let { data: userAccount } = await supabase
                .from('user_accounts')
                .select('id')
                .eq('therapist_id', selectedTherapistId)
                .maybeSingle();

            if (!userAccount) {
                const therapist = therapists.find(t => t.id === selectedTherapistId);
                if (therapist?.email) {
                    const { data: byEmail } = await supabase
                        .from('user_accounts')
                        .select('id')
                        .eq('email', therapist.email)
                        .maybeSingle();
                    userAccount = byEmail;
                }
            }

            if (!userAccount) {
                alert("Este terapeuta no tiene una cuenta de usuario activa. Por favor, crea una cuenta para el terapeuta en la pestaña 'Equipo y Roles' antes de registrar su asistencia.");
                return;
            }

            const payload = {
                ...editingRecord,
                userId: userAccount.id,
                therapistId: selectedTherapistId
            };

            const adminInfo = currentUser ? { id: currentUser.id, name: currentUser.name } : undefined;

            if (editingRecord.id) {
                await updateAttendance(editingRecord.id, payload as Attendance, adminInfo);
            } else {
                await addAttendance(payload as any, adminInfo);
            }
            
            setIsEditModalOpen(false);
            setIsAbsenceModalOpen(false);
            setEditingRecord(null);
            fetchData();
        } catch (error) {
            console.error("Error saving attendance:", error);
            alert("Error al guardar el registro.");
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm("¿Estás seguro de eliminar este registro?")) return;
        try {
            const adminInfo = currentUser ? { id: currentUser.id, name: currentUser.name } : undefined;
            await deleteAttendance(id, adminInfo);
            fetchData();
        } catch (error) {
            console.error("Error deleting registration:", error);
            alert("Error al eliminar el registro.");
        }
    };

    const daysInMonth = eachDayOfInterval({
        start: startOfMonth(parseISO(month + '-01')),
        end: endOfMonth(parseISO(month + '-01'))
    });

    const getDailyData = (day: Date) => {
        const dDate = startOfDay(day);
        
        const dayAtts = attendances.filter(a => a.startTime && isSameDay(parseISO(a.startTime), day));
        const dayAppts = appointments.filter(a => a.start && isSameDay(parseISO(a.start), day));
        
        const workAtt = dayAtts.find(a => a.type === 'work');
        
        const absenceAtt = attendances.find(a => {
            if (a.type === 'work' || !a.startTime) return false;
            const sDate = startOfDay(parseISO(a.startTime));
            // If endTime exists, use it. Otherwise, assume it's a single day absence.
            const eDate = a.endTime ? endOfDay(parseISO(a.endTime)) : endOfDay(parseISO(a.startTime));
            return dDate >= sDate && dDate <= eDate;
        });

        return {
            attendances: dayAtts,
            workAtt,
            absenceAtt,
            apptsCount: dayAppts.length,
            hasMissingClockIn: dayAppts.length > 0 && !workAtt && !absenceAtt && !isWeekend(day)
        };
    };

    const handleDownloadSignedReport = async (report: MonthlyReportSignature & { therapistName?: string }) => {
        try {
            const reportTherapist = therapists.find(t => t.id === report.therapistId);
            const reportDays = eachDayOfInterval({
                start: startOfMonth(parseISO(report.month + '-01')),
                end: endOfMonth(parseISO(report.month + '-01'))
            });

            // Fetch specific data for the report if it's different from the currently viewed
            const attData = await getAllAttendance(report.month, report.therapistId);
            const startDay = parseISO(`${report.month}-01`);
            const endDay = endOfMonth(startDay);
            const appts = await getAppointments(startDay, endDay);
            const filteredAppts = appts.filter(a => a.therapistId === report.therapistId && a.status !== 'Cancelada');

            const getReportDailyData = (day: Date) => {
                const dDate = startOfDay(day);
                const dayAtts = attData.filter(a => a.startTime && isSameDay(parseISO(a.startTime), day));
                const dayAppts = filteredAppts.filter(a => a.start && isSameDay(parseISO(a.start), day));
                const workAtt = dayAtts.find(a => a.type === 'work');
                const absenceAtt = attData.find(a => {
                    if (a.type === 'work' || !a.startTime) return false;
                    const sDate = startOfDay(parseISO(a.startTime));
                    const eDate = a.endTime ? endOfDay(parseISO(a.endTime)) : endOfDay(parseISO(a.startTime));
                    return dDate >= sDate && dDate <= eDate;
                });
                return { workAtt, absenceAtt, apptsCount: dayAppts.length };
            };

            const blob = await generateDetailedReportPDF({
                month: report.month,
                therapist: reportTherapist || { id: report.therapistId, fullName: report.therapistName || 'Desconocido', email: '', phone: '', specialty: '' } as Therapist,
                daysInMonth: reportDays,
                getDailyData: getReportDailyData,
                centerSettings,
                signature: report
            });

            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `Reporte_${report.therapistName?.replace(/\s+/g, '_')}_${report.month}.pdf`;
            link.click();
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error("Error generating local PDF:", err);
            alert("No se pudo generar el PDF.");
        }
    };

    const handlePrint = async () => {
        try {
            const therapist = therapists.find(t => t.id === selectedTherapistId);
            if (!therapist) return;
            const blob = await generateDetailedReportPDF({
                month,
                therapist,
                daysInMonth,
                getDailyData,
                centerSettings
            });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `Reporte_${therapist.fullName.replace(/\s+/g, '_')}_${month}.pdf`;
            link.click();
            URL.revokeObjectURL(url);
        } catch (e) {
            console.error("Error printing PDF", e);
            alert("No se pudo generar el PDF.");
        }
    };

    // Removed currentSignedReport as header download button was removed



    const totalHoursCurrentMonth = attendances
        .filter(a => a.type === 'work' && a.startTime && a.endTime)
        .reduce((acc, curr) => {
            const start = new Date(curr.startTime).getTime();
            const end = new Date(curr.endTime!).getTime();
            return acc + (end - start) / (1000 * 60 * 60);
        }, 0);

    const currentMonthStr = format(new Date(), 'yyyy-MM');
    // For signatures tab, we always care about the actual current month
    const effectiveMonth = activeTab === 'signatures' ? currentMonthStr : month;
    const isViewingCurrentMonth = effectiveMonth === currentMonthStr;

    const currentPendingSignatures = therapists.filter(t => 
        (activeTab === 'signatures' ? activeTherapistsCurrentMonth : activeTherapistsForMonth).includes(t.id) && 
        !signedReports.some(r => r.therapistId === t.id && r.month === effectiveMonth)
    );

    const filteredSignedReports: (MonthlyReportSignature & { therapistName?: string; isPending?: boolean; isInProgress?: boolean })[] = 
        selectedTherapistId === 'all' 
            ? [...signedReports]
            : [...signedReports.filter(r => r.therapistId === selectedTherapistId)];

    if (selectedTherapistId === 'all') {
        // Inject all pending signatures for the effective month
        currentPendingSignatures.forEach(t => {
            filteredSignedReports.unshift({
                id: 'pending-' + t.id + '-' + effectiveMonth,
                therapistId: t.id,
                month: effectiveMonth,
                signedAt: '',
                totalHours: 0,
                signatureImage: '',
                therapistName: t.fullName,
                isPending: !isViewingCurrentMonth,
                isInProgress: isViewingCurrentMonth
            } as any);
        });
    } else {
        const isSelectedTherapistPending = therapists.some(t => 
            t.id === selectedTherapistId && 
            (activeTab === 'signatures' ? activeTherapistsCurrentMonth : activeTherapistsForMonth).includes(t.id) && 
            !signedReports.some(r => r.therapistId === t.id && r.month === effectiveMonth)
        );

        if (isSelectedTherapistPending) {
            filteredSignedReports.unshift({
                id: 'pending-' + effectiveMonth,
                therapistId: selectedTherapistId,
                month: effectiveMonth,
                signedAt: '',
                totalHours: Number(totalHoursCurrentMonth.toFixed(1)),
                signatureImage: '',
                therapistName: therapists.find(t => t.id === selectedTherapistId)?.fullName,
                isPending: !isViewingCurrentMonth,
                isInProgress: isViewingCurrentMonth
            } as any);
        }
    }

    filteredSignedReports.sort((a, b) => b.month.localeCompare(a.month));

    return (
        <>
        <div className="workforce-report">
            {/* ── Header ── */}
            {/* ── Sub-Header for Controls ── */}
            <div className="workforce-header" style={{ marginBottom: '1.5rem' }}>
                <div className="workforce-header-controls">
                    {activeTab !== 'signatures' && (
                        <input
                            type="month"
                            value={month}
                            onChange={e => setMonth(e.target.value)}
                        />
                    )}
                    <select
                        value={selectedTherapistId}
                        onChange={e => setSelectedTherapistId(e.target.value)}
                    >
                        <option value="all">Todos los terapeutas</option>
                        {therapists.map(t => <option key={t.id} value={t.id}>{t.fullName}</option>)}
                    </select>
                </div>
                
                <div className="admin-tabs" style={{ margin: 0, borderBottom: 'none' }}>
                    <button
                        className={`tab-btn ${activeTab === 'daily' ? 'active' : ''}`}
                        onClick={() => setActiveTab('daily')}
                    >
                        <Clock size={18} /> Presencia
                    </button>
                    <button
                        className={`tab-btn ${activeTab === 'absences' ? 'active' : ''}`}
                        onClick={() => setActiveTab('absences')}
                    >
                        <Calendar size={18} /> Ausencias
                    </button>
                    {currentUser?.role === 'ADMIN' && (
                        <button
                            className={`tab-btn ${activeTab === 'signatures' ? 'active' : ''}`}
                            onClick={() => setActiveTab('signatures')}
                        >
                            <ShieldCheck size={18} /> Firmas
                        </button>
                    )}
                </div>

                <div className="workforce-header-actions">
                    <button 
                        className="btn-absence"
                        onClick={() => {
                            setEditingRecord({ type: 'vacation', startTime: startOfDay(new Date()).toISOString(), endTime: endOfDay(new Date()).toISOString() });
                            setIsAbsenceModalOpen(true);
                        }}
                    >
                        <CalendarDays size={16} /> Registrar Ausencia
                    </button>
                    <button className="btn-export" onClick={handlePrint}>
                        <Download size={16} /> Imprimir PDF
                    </button>
                </div>
            </div>

            <div className="workforce-content-tabs">
                {activeTab === 'daily' && (
                    <div className="animate-in">
                        {/* ── Summary Cards ── */}
                        <div className="workforce-summary">
                            <div className="summary-card summary-blue">
                                <div className="summary-card-label">Días Trabajados</div>
                                <div className="summary-card-value">{attendances.filter(a => a.type === 'work').length}</div>
                            </div>
                            <div className="summary-card summary-green">
                                <div className="summary-card-label">Citas Atendidas</div>
                                <div className="summary-card-value">{appointments.length}</div>
                            </div>
                            <div 
                                className="summary-card summary-orange" 
                                style={{ cursor: 'pointer' }}
                                onClick={() => setActiveTab('absences')}
                            >
                                <div className="summary-card-label">Vacaciones/Bajas</div>
                                <div className="summary-card-value">{attendances.filter(a => a.type !== 'work').length}</div>
                                <div style={{ fontSize: '0.65rem', color: '#78350f', marginTop: '4px', opacity: 0.8 }}>Haga clic para ver historial</div>
                            </div>
                        </div>

                        {/* ── Professional Table ── */}
                        <div className="wf-table-wrapper">
                            <table className="wf-table">
                                <thead>
                                    <tr>
                                        <th>Fecha</th>
                                        <th>Estado</th>
                                        <th>Entrada</th>
                                        <th>Salida</th>
                                        <th>Citas</th>
                                        <th style={{ textAlign: 'right' }}>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr>
                                            <td colSpan={6}>
                                                <div className="wf-loading">
                                                    <div className="wf-spinner"></div>
                                                    <span className="wf-loading-text">Cargando registros...</span>
                                                </div>
                                            </td>
                                        </tr>
                                    ) : (
                                        daysInMonth.map(day => {
                                            const { workAtt, absenceAtt, apptsCount, hasMissingClockIn } = getDailyData(day);
                                            const isToday = isSameDay(day, new Date());
                                            const weekend = isWeekend(day);

                                            if (!workAtt && !absenceAtt && !hasMissingClockIn && weekend) return null;

                                            const rowClass = [
                                                hasMissingClockIn ? 'wf-row-missing' : '',
                                                isToday ? 'wf-row-today' : ''
                                            ].filter(Boolean).join(' ');

                                            return (
                                                <tr key={day.toISOString()} className={rowClass}>
                                                    <td>
                                                        <span className="wf-date-name">{format(day, "EEEE d", { locale: es })}</span>
                                                        {isToday && <span className="wf-date-today">HOY</span>}
                                                    </td>
                                                    <td>
                                                        {absenceAtt ? (
                                                            <span className={`wf-badge ${absenceAtt.type === 'vacation' ? 'wf-badge-vacation' : 'wf-badge-sick'}`}>
                                                                {absenceAtt.type === 'vacation' ? 'Vacaciones' : 'Baja'}
                                                            </span>
                                                        ) : workAtt ? (
                                                            <span className="wf-badge wf-badge-ok">
                                                                <CheckCircle2 size={10} /> Ok
                                                            </span>
                                                        ) : hasMissingClockIn ? (
                                                            <span className="wf-badge wf-badge-missing">
                                                                <AlertCircle size={10} /> Falta
                                                            </span>
                                                        ) : (
                                                            <span className="wf-no-activity">Sin actividad</span>
                                                        )}
                                                    </td>
                                                    <td>
                                                        {workAtt ? (
                                                            <span className="wf-time-entry">
                                                                <ArrowDownRight size={14} className="wf-icon-in" />
                                                                {format(parseISO(workAtt.startTime), 'HH:mm')}
                                                            </span>
                                                        ) : <span className="wf-time-dash">—</span>}
                                                    </td>
                                                    <td>
                                                        {workAtt?.endTime ? (
                                                            <span className="wf-time-entry">
                                                                <ArrowUpRight size={14} className="wf-icon-out" />
                                                                {format(parseISO(workAtt.endTime), 'HH:mm')}
                                                            </span>
                                                        ) : <span className="wf-time-dash">—</span>}
                                                    </td>
                                                    <td>
                                                        {apptsCount > 0 ? (
                                                            <span className="wf-appts-pill">
                                                                <History size={12} /> {apptsCount}
                                                            </span>
                                                        ) : <span className="wf-time-dash">—</span>}
                                                    </td>
                                                    <td>
                                                        <div className="wf-actions">
                                                            {workAtt ? (
                                                                <>
                                                                    <button 
                                                                        className="wf-action-btn wf-action-edit"
                                                                        onClick={() => {
                                                                            setEditingRecord(workAtt);
                                                                            setIsEditModalOpen(true);
                                                                        }}
                                                                        title="Editar"
                                                                    >
                                                                        <Edit2 size={15} />
                                                                    </button>
                                                                    <button 
                                                                        className="wf-action-btn wf-action-delete"
                                                                        onClick={() => handleDelete(workAtt.id!)}
                                                                        title="Eliminar"
                                                                    >
                                                                        <Trash2 size={15} />
                                                                    </button>
                                                                </>
                                                            ) : absenceAtt ? (
                                                                <button 
                                                                    className="wf-action-btn wf-action-delete"
                                                                    onClick={() => handleDelete(absenceAtt.id!)}
                                                                    title="Eliminar Ausencia"
                                                                >
                                                                    <Trash2 size={15} />
                                                                </button>
                                                            ) : (
                                                                <button 
                                                                    className="wf-action-add"
                                                                    onClick={() => {
                                                                        const date = startOfDay(day);
                                                                        setEditingRecord({ 
                                                                            startTime: date.toISOString(), 
                                                                            type: 'work' 
                                                                        });
                                                                        setIsEditModalOpen(true);
                                                                    }}
                                                                >
                                                                    <Plus size={14} /> Fichar
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeTab === 'absences' && (
                    <div className="animate-in">
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '2rem' }}>
                            {/* ── Holiday Calendar ── */}
                            <div className="holiday-calendar" style={{ marginTop: 0 }}>
                                <div className="holiday-header">
                                    <div className="holiday-icon">
                                        <Calendar size={20} />
                                    </div>
                                    <div>
                                        <h3 className="holiday-title">Vista Gráfica</h3>
                                        <p className="holiday-subtitle">
                                            Resumen mensual de {therapists.find(t => t.id === selectedTherapistId)?.fullName}
                                        </p>
                                    </div>
                                </div>

                                <div className="holidays-grid">
                                    {['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'].map(d => (
                                        <div key={d} className="holidays-grid-day-label">{d}</div>
                                    ))}
                                    {daysInMonth.map(day => {
                                        const { absenceAtt } = getDailyData(day);
                                        const isVacation = absenceAtt?.type === 'vacation';
                                        const isSick = absenceAtt?.type === 'sick_leave';
                                        const isToday = isSameDay(day, new Date());

                                        const dayClass = [
                                            'holiday-day',
                                            isVacation ? 'holiday-day-vacation' : '',
                                            isSick ? 'holiday-day-sick' : '',
                                            !absenceAtt && isWeekend(day) ? 'holiday-day-weekend' : '',
                                            isToday && !absenceAtt ? 'holiday-day-today' : ''
                                        ].filter(Boolean).join(' ');

                                        return (
                                            <div key={day.toISOString()} className={dayClass}>
                                                <span className="holiday-day-number">{format(day, 'd')}</span>
                                                {absenceAtt && <div className="holiday-day-dot" />}
                                            </div>
                                        );
                                    })}
                                </div>
                                
                                <div className="holiday-legend">
                                    <div className="legend-item">
                                        <div className="legend-dot legend-dot-vacation" />
                                        <span className="legend-label">Vacaciones</span>
                                    </div>
                                    <div className="legend-item">
                                        <div className="legend-dot legend-dot-sick" />
                                        <span className="legend-label">Baja Médica</span>
                                    </div>
                                </div>
                            </div>

                            {/* ── Vacation History List ── */}
                            <div className="wf-table-wrapper" style={{ maxHeight: '500px', overflowY: 'auto' }}>
                                <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
                                    <h3 style={{ fontWeight: 600, color: '#1A5F7A' }}>Historial Completo</h3>
                                    <button 
                                        className="btn-secondary" 
                                        onClick={handleShowVacations}
                                        style={{ padding: '0.25rem 0.75rem', fontSize: '0.75rem' }}
                                    >
                                        Actualizar
                                    </button>
                                </div>
                                <table className="wf-table">
                                    <thead style={{ position: 'sticky', top: 0, zIndex: 1, background: '#f8fafc' }}>
                                        <tr>
                                            <th>Fecha</th>
                                            <th>Tipo</th>
                                            <th style={{ textAlign: 'right' }}>Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {allVacations.length === 0 ? (
                                            <tr>
                                                <td colSpan={3} style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                                                    Pulsa "Actualizar" para cargar el historial.
                                                </td>
                                            </tr>
                                        ) : (
                                            allVacations.map(v => (
                                                <tr key={v.id}>
                                                    <td style={{ fontSize: '0.85rem' }}>
                                                        {v.startTime ? format(parseISO(v.startTime), 'dd/MM/yyyy') : '—'}
                                                        {v.endTime && isSameDay(parseISO(v.startTime), parseISO(v.endTime)) ? '' : v.endTime ? ` al ${format(parseISO(v.endTime), 'dd/MM/yyyy')}` : ''}
                                                    </td>
                                                    <td>
                                                        <span className={`wf-badge ${v.type === 'vacation' ? 'wf-badge-vacation' : 'wf-badge-sick'}`} style={{ fontSize: '0.7rem', padding: '1px 6px' }}>
                                                            {v.type === 'vacation' ? 'VACACIONES' : 'BAJA'}
                                                        </span>
                                                    </td>
                                                    <td style={{ textAlign: 'right' }}>
                                                        <button 
                                                            className="wf-action-btn wf-action-delete"
                                                            onClick={() => handleDeleteFromHistory(v.id!)}
                                                            title="Eliminar registro"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'signatures' && currentUser?.role === 'ADMIN' && (
                    <div className="animate-in">
                        {/* ── Pending Signatures Alert ── */}
                        {currentPendingSignatures.length > 0 && (
                            <div className={`mb-6 p-4 rounded-lg border ${isViewingCurrentMonth ? 'bg-sky-50 border-sky-200' : 'bg-amber-50 border-amber-200'}`}>
                                <div className={`flex items-center gap-2 font-semibold mb-2 ${isViewingCurrentMonth ? 'text-sky-800' : 'text-amber-800'}`}>
                                    {isViewingCurrentMonth ? <Clock size={20} /> : <AlertCircle size={20} />}
                                    {isViewingCurrentMonth ? 'Reportes en curso' : 'Pendientes de Firma'} ({effectiveMonth})
                                </div>
                                <p className={`text-sm mb-3 ${isViewingCurrentMonth ? 'text-sky-700' : 'text-amber-700'}`}>
                                    {isViewingCurrentMonth 
                                        ? 'Los siguientes terapeutas tienen actividad registrada este mes y su reporte se generará al finalizar el periodo:'
                                        : 'Los siguientes terapeutas tienen actividad registrada en este mes pero no han firmado su reporte:'}
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {currentPendingSignatures.map(t => (
                                        <span 
                                            key={t.id} 
                                            className={`px-3 py-1 bg-white border text-xs rounded-full font-medium shadow-sm ${isViewingCurrentMonth ? 'border-sky-300 text-sky-800' : 'border-amber-300 text-amber-800'}`}
                                        >
                                            {t.fullName}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* ── Signed Reports Section ── */}
                        <div className="wf-table-wrapper">
                            <div className="p-4 border-b bg-gray-50">
                                <h3 style={{ fontWeight: 600, color: '#1A5F7A' }}>Reportes Recibidos</h3>
                            </div>
                            <table className="wf-table">
                                <thead>
                                    <tr>
                                        <th>Terapeuta</th>
                                        <th>Periodo</th>
                                        <th>Horas</th>
                                        <th>Fecha Firma</th>
                                        <th>Firma</th>
                                        <th>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredSignedReports.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
                                                No hay reportes firmados registrados aún para este terapeuta.
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredSignedReports.map(report => (
                                            <tr key={report.id} style={report.isPending || report.isInProgress ? { backgroundColor: report.isInProgress ? '#f0f9ff' : '#fffbeb' } : {}}>
                                                <td style={{ fontWeight: 600 }}>{report.therapistName}</td>
                                                <td>{report.month}</td>
                                                <td>{report.totalHours}h</td>
                                                <td style={{ fontSize: '0.85rem' }}>
                                                    {report.isInProgress ? (
                                                        <span className="text-sky-600 font-medium">En curso...</span>
                                                    ) : report.isPending ? (
                                                        <span className="text-amber-600 font-medium">No firmado</span>
                                                    ) : (
                                                        new Date(report.signedAt).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
                                                    )}
                                                </td>
                                                <td>
                                                    {report.isInProgress ? (
                                                        <span className="wf-badge wf-badge-ok" style={{ backgroundColor: '#e0f2fe', color: '#0369a1' }}>EN CURSO</span>
                                                    ) : report.isPending ? (
                                                        <span className="wf-badge wf-badge-missing" style={{ animation: 'none' }}>PENDIENTE</span>
                                                    ) : report.signatureImage ? (
                                                        <img
                                                            src={report.signatureImage}
                                                            alt="Firma"
                                                            style={{ height: '30px', borderRadius: '4px', border: '1px solid #e5e7eb' }}
                                                        />
                                                    ) : (
                                                        <span className="text-gray-400 text-xs">Sin imagen</span>
                                                    )}
                                                </td>
                                                <td>
                                                    {!report.isPending && !report.isInProgress ? (
                                                        <button
                                                            className="btn-secondary"
                                                            style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', padding: '4px 10px' }}
                                                            onClick={() => handleDownloadSignedReport(report)}
                                                        >
                                                            <Download size={14} /> Descargar PDF
                                                        </button>
                                                    ) : (
                                                        <div className={`text-xs italic ${report.isInProgress ? 'text-sky-700' : 'text-amber-700'}`}>
                                                            {report.isInProgress ? 'Periodo actual' : 'Esperando firma...'}
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            {/* ── Edit Modal ── */}
            <Modal
                isOpen={isEditModalOpen}
                onClose={() => {
                    setIsEditModalOpen(false);
                    setEditingRecord(null);
                }}
                title={editingRecord?.id ? "Editar Registro de Jornada" : "Fichaje Manual"}
            >
                <form onSubmit={handleSaveAttendance} className="wf-form">
                    <div className="wf-form-row">
                        <div>
                            <label className="wf-form-label">Hora Entrada</label>
                            <input
                                type="datetime-local"
                                value={editingRecord?.startTime ? format(parseISO(editingRecord.startTime), "yyyy-MM-dd'T'HH:mm") : ''}
                                onChange={e => setEditingRecord({ ...editingRecord, startTime: new Date(e.target.value).toISOString() })}
                                className="wf-form-input"
                                required
                            />
                        </div>
                        <div>
                            <label className="wf-form-label">Hora Salida</label>
                            <input
                                type="datetime-local"
                                value={editingRecord?.endTime ? format(parseISO(editingRecord.endTime), "yyyy-MM-dd'T'HH:mm") : ''}
                                onChange={e => setEditingRecord({ ...editingRecord, endTime: new Date(e.target.value).toISOString() })}
                                className="wf-form-input"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="wf-form-label">Notas y Observaciones</label>
                        <textarea
                            value={editingRecord?.notes || ''}
                            onChange={e => setEditingRecord({ ...editingRecord, notes: e.target.value })}
                            className="wf-form-textarea"
                            placeholder="Ej: Olvido de fichaje por emergencia..."
                        />
                    </div>
                    <div className="wf-form-footer">
                        <button type="button" className="wf-btn-cancel" onClick={() => setIsEditModalOpen(false)}>Cancelar</button>
                        <button type="submit" className="wf-btn-save">Guardar Cambios</button>
                    </div>
                </form>
            </Modal>

            {/* ── Absence Modal ── */}
            <Modal
                isOpen={isAbsenceModalOpen}
                onClose={() => {
                    setIsAbsenceModalOpen(false);
                    setEditingRecord(null);
                }}
                title="Registrar Periodo de Ausencia"
            >
                <form onSubmit={handleSaveAttendance} className="wf-form">
                    <div>
                        <label className="wf-form-label">Tipo de Ausencia</label>
                        <div className="wf-type-selector">
                            <button 
                                type="button"
                                onClick={() => setEditingRecord({ ...editingRecord, type: 'vacation' })}
                                className={`wf-type-btn ${editingRecord?.type === 'vacation' ? 'active-vacation' : ''}`}
                            >
                                <Calendar size={18} /> Vacaciones
                            </button>
                            <button 
                                type="button"
                                onClick={() => setEditingRecord({ ...editingRecord, type: 'sick_leave' })}
                                className={`wf-type-btn ${editingRecord?.type === 'sick_leave' ? 'active-sick' : ''}`}
                            >
                                <AlertCircle size={18} /> Baja Médica
                            </button>
                        </div>
                    </div>
                    <div className="wf-form-row">
                        <div>
                            <label className="wf-form-label">Fecha Inicio</label>
                            <input
                                type="date"
                                value={editingRecord?.startTime ? format(parseISO(editingRecord.startTime), "yyyy-MM-dd") : ''}
                                onChange={e => {
                                    const date = startOfDay(new Date(e.target.value));
                                    setEditingRecord({ ...editingRecord, startTime: date.toISOString() });
                                }}
                                className="wf-form-input"
                                required
                            />
                        </div>
                        <div>
                            <label className="wf-form-label">Fecha Fin</label>
                            <input
                                type="date"
                                value={editingRecord?.endTime ? format(parseISO(editingRecord.endTime), "yyyy-MM-dd") : ''}
                                onChange={e => {
                                    const date = endOfDay(new Date(e.target.value));
                                    setEditingRecord({ ...editingRecord, endTime: date.toISOString() });
                                }}
                                className="wf-form-input"
                                required
                            />
                        </div>
                    </div>
                    <div>
                        <label className="wf-form-label">Notas</label>
                        <input
                            type="text"
                            value={editingRecord?.notes || ''}
                            onChange={e => setEditingRecord({ ...editingRecord, notes: e.target.value })}
                            className="wf-form-input"
                            placeholder="Detalles adicionales..."
                        />
                    </div>
                    <div className="wf-form-footer">
                        <button type="button" className="wf-btn-cancel" onClick={() => setIsAbsenceModalOpen(false)}>Cancelar</button>
                        <button type="submit" className="wf-btn-save">Registrar Periodo</button>
                    </div>
                </form>
            </Modal>

        {/* ── Vacation History Modal ── */}
        <Modal
            isOpen={isVacationListModalOpen}
            onClose={() => setIsVacationListModalOpen(false)}
            title={`Historial de Ausencias: ${therapists.find(t => t.id === selectedTherapistId)?.fullName}`}
        >
            <div className="wf-vacation-list" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                {vacationLoading ? (
                    <div className="wf-loading"><div className="wf-spinner"></div></div>
                ) : allVacations.length === 0 ? (
                    <p style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>No se han registrado periodos de vacaciones o bajas para este terapeuta.</p>
                ) : (
                    <table className="wf-table" style={{ width: '100%' }}>
                        <thead style={{ position: 'sticky', top: 0, zIndex: 1, background: '#f8fafc' }}>
                            <tr>
                                <th>Fecha</th>
                                <th>Tipo</th>
                                <th>Notas</th>
                                <th style={{ textAlign: 'right' }}>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {allVacations.map(v => (
                                <tr key={v.id}>
                                    <td style={{ fontSize: '0.85rem' }}>
                                        {v.startTime ? format(parseISO(v.startTime), 'dd/MM/yyyy') : '—'}
                                        {v.endTime && isSameDay(parseISO(v.startTime), parseISO(v.endTime)) ? '' : v.endTime ? ` al ${format(parseISO(v.endTime), 'dd/MM/yyyy')}` : ''}
                                    </td>
                                    <td>
                                        <span className={`wf-badge ${v.type === 'vacation' ? 'wf-badge-vacation' : 'wf-badge-sick'}`}>
                                            {v.type === 'vacation' ? 'Vacaciones' : 'Baja'}
                                        </span>
                                    </td>
                                    <td style={{ fontSize: '0.8rem', color: '#64748b', maxWidth: '120px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={v.notes || ''}>
                                        {v.notes || '—'}
                                    </td>
                                    <td style={{ textAlign: 'right' }}>
                                        <button 
                                            className="wf-action-btn wf-action-delete"
                                            onClick={() => handleDeleteFromHistory(v.id!)}
                                            title="Eliminar registro"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
            <div className="wf-form-footer" style={{ marginTop: '1.5rem', justifyContent: 'flex-end' }}>
                <button type="button" className="btn-secondary" onClick={() => setIsVacationListModalOpen(false)}>Cerrar</button>
            </div>
        </Modal>
        </div>
        
        {/* ── Removed PrintableWorkforceReport overlay since PDF is now generated directly via JS ── */}

        </>
    );
};

export default WorkforceReport;
