import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
    format,
    startOfWeek,
    addDays,
    eachDayOfInterval,
    isSameDay,
    parseISO,
    formatISO,
    setHours,
    setMinutes,
    addMinutes,
    addWeeks,
    subWeeks,
    differenceInMinutes,
    getDay,
    isBefore,
    isAfter,
    endOfDay
} from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Plus, X, User, Rocket, Puzzle, AlertTriangle, Clock as ClockIcon, DollarSign, Mic, Square } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getAppointments, createAppointment, updateAppointment, deleteAppointment } from './service';
import { getPatients } from '../patients/service';
import { getTherapists } from '../therapists/service';
import { getServices } from '../admin/service';
import { getCurrentStatus } from '../workforce/service';
import { type Appointment } from './types';
import { type Patient } from '../patients/types';
import { type Therapist } from '../therapists/types';
import { type ClinicalService } from '../admin/types';
import './CalendarView.css';

interface CalendarViewProps {
    mode?: 'TODAY_MULTI' | 'WEEKLY_SINGLE';
    therapistId?: string;
}

const HOURS = Array.from({ length: 14 }, (_, i) => i + 8); // 8:00 to 21:00

const CalendarView: React.FC<CalendarViewProps> = ({ mode: initialMode, therapistId: filterTherapistId }) => {
    const { user, isRole } = useAuth();

    // Si no se pasa modo, el admin ve todos hoy, el terapeuta su semana
    const effectiveMode = initialMode || (isRole('ADMIN') ? 'TODAY_MULTI' : 'WEEKLY_SINGLE');
    const effectiveTherapistId = filterTherapistId || (isRole('THERAPIST') ? user?.id : undefined);

    const location = useLocation(); // Hoisted to top level

    const [currentDate, setCurrentDate] = useState(new Date());
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [patients, setPatients] = useState<Patient[]>([]);
    const [therapists, setTherapists] = useState<Therapist[]>([]);
    const [services, setServices] = useState<ClinicalService[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedAppt, setSelectedAppt] = useState<Partial<Appointment> | null>(null);
    const [isRadarOpen, setIsRadarOpen] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [gaps, setGaps] = useState<{ start: Date; end: Date; count: number }[]>([]);

    const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
    const weekEnd = addDays(weekStart, 6);

    // Columnas: O bien los días de la semana, o bien los terapeutas
    const days = eachDayOfInterval({ start: weekStart, end: weekEnd });

    // Helper to calculate statuses
    const calculateStatuses = (list: Appointment[]) => {
        const now = new Date();
        return list.map(appt => {
            const start = parseISO(appt.start);
            const end = parseISO(appt.end);

            if (['Cancelada', 'Cobrada', 'Ausente'].includes(appt.status)) {
                return appt;
            }

            let newStatus = appt.status;
            // Check if NOW is >= start AND < end
            if ((isAfter(now, start) || now.getTime() === start.getTime()) && isBefore(now, end)) {
                if (appt.status === 'Programada') newStatus = 'En Sesión';
            } else if (isAfter(now, end) || now.getTime() === end.getTime()) {
                if (appt.status === 'Programada' || appt.status === 'En Sesión') newStatus = 'Finalizada';
            }

            return newStatus !== appt.status ? { ...appt, status: newStatus as any } : appt;
        });
    };

    const fetchData = () => {
        getAppointments(weekStart, weekEnd).then(data => {
            // Apply status check immediately upon fetch
            const updatedData = calculateStatuses(data);
            setAppointments(updatedData);
        });
    };

    useEffect(() => {
        fetchData();
        getPatients().then(setPatients);
        getTherapists().then(setTherapists);
        getServices().then(setServices);
    }, [currentDate]);

    // Handle navigation from Dashboard
    useEffect(() => {
        const state = location.state as { openAppointmentId?: string } | null;
        if (state?.openAppointmentId && appointments.length > 0) {
            const appt = appointments.find(a => a.id === state.openAppointmentId);
            if (appt) {
                handleOpenModal(appt);
                // Clear state to prevent reopening on re-renders (this is a bit tricky with history, but acceptable for now)
                window.history.replaceState({}, document.title);
            }
        }
    }, [appointments, location]);

    const nextPeriod = () => {
        if (effectiveMode === 'TODAY_MULTI') setCurrentDate(addDays(currentDate, 1));
        else setCurrentDate(addWeeks(currentDate, 1));
    };

    const prevPeriod = () => {
        if (effectiveMode === 'TODAY_MULTI') setCurrentDate(addDays(currentDate, -1));
        else setCurrentDate(subWeeks(currentDate, 1));
    };

    // Auto-update statuses based on time (Interval)
    useEffect(() => {
        const interval = setInterval(() => {
            setAppointments(current => calculateStatuses(current));
        }, 60000); // Run every minute
        return () => clearInterval(interval);
    }, []);

    const goToToday = () => setCurrentDate(new Date());

    const handleOpenModal = async (appt?: Appointment, tId?: string, date?: Date) => {
        // Validación de Control Horario
        if (isRole('THERAPIST') && user?.id) {
            const status = await getCurrentStatus(user.id);
            if (status !== 'working') {
                alert("⛔ ACCESO DENEGADO\n\nDebes fichar la ENTRADA en el panel lateral antes de gestionar la agenda clínica.\n\nNormativa laboral vigente.");
                return;
            }
        }

        if (appt) {
            setSelectedAppt(appt);
        } else {
            const therapistId = tId || therapists[0]?.id || '';
            const therapist = therapists.find(t => t.id === therapistId);
            const offset = therapist?.sessionStartOffset || 0;

            let startBase = date || new Date();
            // Si venimos de un clic en el calendario, la hora ya está en el date.
            // Aplicamos el desfase del terapeuta.
            const startWithOffset = setMinutes(setHours(startBase, startBase.getHours()), offset);
            const startStr = formatISO(startWithOffset);

            setSelectedAppt({
                patientId: '',
                patientName: '',
                therapistId,
                therapistName: therapist?.fullName || '',
                serviceId: '',
                type: 'Terapia',
                start: startStr,
                end: formatISO(addMinutes(parseISO(startStr), 60)),
                status: 'Programada'
            });
        }
        setIsModalOpen(true);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedAppt) return;

        // Validación: Diario de sesión obligatorio
        const needsDiary = selectedAppt.status === 'Finalizada' || selectedAppt.status === 'Cobrada';
        if (needsDiary && (!selectedAppt.sessionDiary || selectedAppt.sessionDiary.trim() === '')) {
            alert("⚠️ El DIARIO DE SESIÓN es obligatorio para finalizar o cobrar una cita.\n\nPor favor, completa el progreso del paciente antes de guardar.");
            return;
        }

        const finalAppt = { ...selectedAppt };
        const p = patients.find(p => p.id === finalAppt.patientId);
        if (p) finalAppt.patientName = `${p.firstName} ${p.lastName}`;
        const t = therapists.find(t => t.id === finalAppt.therapistId);
        if (t) finalAppt.therapistName = t.fullName;

        // Ensure type name is set if service is selected
        if (finalAppt.serviceId) {
            const s = services.find(s => s.id === finalAppt.serviceId);
            if (s) finalAppt.type = s.name;
        }

        if (finalAppt.id) await updateAppointment(finalAppt as Appointment);
        else {
            if (finalAppt.recurrence && (finalAppt.recurrence.weeks || finalAppt.recurrence.until || (finalAppt.recurrence.days && finalAppt.recurrence.days.length > 0))) {
                const startBase = parseISO(finalAppt.start!);
                const endBase = parseISO(finalAppt.end!);
                const duration = differenceInMinutes(endBase, startBase);

                const selectedDays = finalAppt.recurrence.days || [getDay(startBase)];
                let limitDate: Date;

                if (finalAppt.recurrence.until) {
                    limitDate = parseISO(finalAppt.recurrence.until);
                } else {
                    const weeks = finalAppt.recurrence.weeks || 1;
                    limitDate = addWeeks(startBase, weeks - 1);
                }

                // Asegurar que abarcamos todo el día de la fecha límite
                const finalLimit = endOfDay(limitDate);

                // Empezamos desde el inicio de la semana de la fecha base para iterar bien los días
                const startOfFirstWeek = startOfWeek(startBase, { weekStartsOn: 1 });

                let currentWeekStart = startOfFirstWeek;
                while (isBefore(currentWeekStart, finalLimit) || isSameDay(currentWeekStart, finalLimit)) {
                    for (const dayIndex of selectedDays) {
                        // Ajustar dayIndex porque date-fns usa 0=Domingo, 1=Lunes...
                        // pero mi selector usará 1=Lunes... 7=Domingo o similar
                        const targetDate = addDays(currentWeekStart, (dayIndex - 1));

                        // Solo crear si es el mismo día o posterior al inicio, y anterior al límite
                        if ((isSameDay(targetDate, startBase) || isAfter(targetDate, startBase)) &&
                            (isBefore(targetDate, finalLimit) || isSameDay(targetDate, finalLimit))) {

                            const newStart = setMinutes(setHours(targetDate, startBase.getHours()), startBase.getMinutes());
                            const newEnd = addMinutes(newStart, duration);

                            await createAppointment({
                                ...finalAppt as Omit<Appointment, 'id'>,
                                start: formatISO(newStart),
                                end: formatISO(newEnd),
                                recurrence: { weeks: 1, originalId: 'SERIE' }
                            });
                        }
                    }
                    currentWeekStart = addWeeks(currentWeekStart, 1);
                }
            } else {
                await createAppointment(finalAppt as Omit<Appointment, 'id'>);
            }
        }

        setIsModalOpen(false);
        fetchData();
    };

    const handleDeleteAppointment = async () => {
        if (!selectedAppt?.id) return;
        const confirm = window.confirm(
            `¿Eliminar la cita de ${selectedAppt.patientName} del ${format(parseISO(selectedAppt.start!), "d 'de' MMMM 'a las' HH:mm", { locale: es })}?\n\nEsta acción no se puede deshacer.`
        );
        if (!confirm) return;
        await deleteAppointment(selectedAppt.id);
        setIsModalOpen(false);
        fetchData();
    };

    const findGaps = () => {
        const potentialGaps: { start: Date; end: Date; count: number }[] = [];
        const viewDays = effectiveMode === 'TODAY_MULTI' ? [currentDate] : days;

        viewDays.forEach(day => {
            HOURS.forEach(hour => {
                [0, 30].forEach(min => {
                    const start = setMinutes(setHours(day, hour), min);
                    const end = addMinutes(start, 30);

                    // Contar terapeutas libres en este slot
                    const busyCount = appointments.filter(appt => {
                        const aStart = parseISO(appt.start);
                        const aEnd = parseISO(appt.end);
                        return isSameDay(aStart, start) && (
                            (start >= aStart && start < aEnd) ||
                            (end > aStart && end <= aEnd)
                        );
                    }).length;

                    const freeCount = therapists.length - busyCount;
                    if (freeCount >= Math.max(1, therapists.length - 1)) {
                        potentialGaps.push({ start, end, count: freeCount });
                    }
                });
            });
        });
        setGaps(potentialGaps.slice(0, 10)); // Mostrar top 10
        setIsRadarOpen(true);
    };

    const getAppointmentPosition = (start: string, end: string) => {
        const startDate = parseISO(start);
        const endDate = parseISO(end);
        const startHour = startDate.getHours();
        const startMin = startDate.getMinutes();
        const duration = differenceInMinutes(endDate, startDate);
        const top = (startHour - 8) * 80 + (startMin / 60) * 80;
        const height = (duration / 60) * 80;
        return { top: `${top}px`, height: `${height}px` };
    };

    const filteredAppointments = appointments.filter(appt => {
        return effectiveTherapistId ? appt.therapistId === effectiveTherapistId : true;
    });

    const getModalDate = () => selectedAppt?.start ? format(parseISO(selectedAppt.start), 'yyyy-MM-dd') : '';
    const getModalStartTime = () => selectedAppt?.start ? format(parseISO(selectedAppt.start), 'HH:mm') : '';
    const getModalEndTime = () => selectedAppt?.end ? format(parseISO(selectedAppt.end), 'HH:mm') : '';

    const handleModalDateChange = (dateStr: string) => {
        if (!selectedAppt?.start) return;
        const newDay = parseISO(dateStr);
        const oldStart = parseISO(selectedAppt.start);
        const oldEnd = parseISO(selectedAppt.end!);
        const newStart = setMinutes(setHours(newDay, oldStart.getHours()), oldStart.getMinutes());
        const newEnd = setMinutes(setHours(newDay, oldEnd.getHours()), oldEnd.getMinutes());
        setSelectedAppt({ ...selectedAppt, start: formatISO(newStart), end: formatISO(newEnd) });
    };

    const handleModalTimeChange = (type: 'start' | 'end', timeStr: string) => {
        if (!selectedAppt?.start) return;
        const [h, m] = timeStr.split(':').map(Number);
        const base = parseISO(selectedAppt.start);
        const newTime = formatISO(setMinutes(setHours(base, h), m));

        if (type === 'start') {
            const newEndTime = formatISO(addMinutes(parseISO(newTime), 60));
            setSelectedAppt({ ...selectedAppt, start: newTime, end: newEndTime });
        } else {
            setSelectedAppt({ ...selectedAppt, end: newTime });
        }
    };

    // Necesitamos un ref para el intervalo de stop de voz
    const isRecordingRef = React.useRef(isRecording);
    useEffect(() => {
        isRecordingRef.current = isRecording;
    }, [isRecording]);

    const toggleVoiceDiary = () => {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            alert("Tu navegador no soporta el reconocimiento de voz. Te recomendamos Chrome.");
            return;
        }

        if (isRecording) {
            setIsRecording(false);
            return;
        }

        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.lang = 'es-ES';
        recognition.interimResults = true;
        recognition.continuous = true;

        recognition.onstart = () => setIsRecording(true);
        recognition.onend = () => setIsRecording(false);
        recognition.onerror = () => setIsRecording(false);

        recognition.onresult = (event: any) => {
            let finalTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                }
            }
            if (finalTranscript && selectedAppt) {
                const currentDiary = selectedAppt.sessionDiary || '';
                setSelectedAppt({
                    ...selectedAppt,
                    sessionDiary: currentDiary + (currentDiary ? ' ' : '') + finalTranscript
                });
            }
        };

        recognition.start();

        // El stop se controla con el estado isRecording
        const checkStop = setInterval(() => {
            if (!isRecordingRef.current) {
                recognition.stop();
                clearInterval(checkStop);
            }
        }, 100);
    };

    const columns = effectiveMode === 'TODAY_MULTI' ? therapists : days;

    return (
        <div className={`calendar-container ${initialMode ? 'embedded-mode' : ''}`}>
            <div className="calendar-controls">
                <div className="calendar-nav">
                    <button className="btn-secondary" onClick={goToToday}>Hoy</button>
                    <div className="nav-arrows flex gap-2">
                        <button className="btn-icon-round" onClick={prevPeriod}><ChevronLeft size={20} /></button>
                        <button className="btn-icon-round" onClick={nextPeriod}><ChevronRight size={20} /></button>
                    </div>
                </div>

                <h2 className="current-view-label">
                    {effectiveMode === 'TODAY_MULTI'
                        ? format(currentDate, "eeee, d 'de' MMMM", { locale: es })
                        : `${format(weekStart, "d MMM", { locale: es })} - ${format(weekEnd, "d MMM", { locale: es })}`
                    }
                </h2>

                {!initialMode && (
                    <div className="calendar-actions flex gap-2">
                        <div
                            className="gap-radar-control flex items-center gap-2 px-3 py-1 border rounded-full bg-white text-xs font-medium cursor-pointer hover:bg-gray-50"
                            onClick={findGaps}
                        >
                            <Puzzle size={14} className="text-secondary" />
                            <span>Radar de Huecos</span>
                        </div>
                        {isRole('ADMIN') && (
                            <button className="btn-primary flex items-center gap-2" onClick={() => handleOpenModal()}>
                                <Plus size={18} /> Nueva Cita
                            </button>
                        )}
                    </div>
                )}
            </div>

            <div className="calendar-grid-wrapper">
                <div className="calendar-header">
                    <div className="header-cell"></div>
                    {columns.map((col, i) => (
                        <div key={i} className="header-cell">
                            {effectiveMode === 'TODAY_MULTI' ? (
                                <div className="therapist-col-header">
                                    <span className="day-name">{(col as Therapist).fullName}</span>
                                    <span className="day-number" style={{ color: (col as Therapist).color }}>●</span>
                                </div>
                            ) : (
                                <div className={`day-col-header ${isSameDay(col as Date, new Date()) ? 'today' : ''}`}>
                                    <span className="day-name">{format(col as Date, 'eee', { locale: es })}</span>
                                    <span className="day-number">{format(col as Date, 'd')}</span>
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                <div className="calendar-body">
                    <div className="time-column">
                        {HOURS.map(h => <div key={h} className="time-cell">{h}:00</div>)}
                    </div>

                    {columns.map((col, i) => (
                        <div key={i} className="day-column">
                            {/* Slots clicables de fondo */}
                            {HOURS.map(h => (
                                <div
                                    key={h}
                                    className="grid-slot"
                                    onClick={() => {
                                        const date = effectiveMode === 'TODAY_MULTI' ? currentDate : (col as Date);
                                        const startWithHour = setHours(date, h);
                                        const startWithTime = setMinutes(startWithHour, 0);
                                        handleOpenModal(undefined, effectiveMode === 'TODAY_MULTI' ? (col as Therapist).id : effectiveTherapistId, startWithTime);
                                    }}
                                />
                            ))}

                            {filteredAppointments
                                .filter(appt => {
                                    if (effectiveMode === 'TODAY_MULTI') {
                                        return isSameDay(parseISO(appt.start), currentDate) && appt.therapistId === (col as Therapist).id;
                                    } else {
                                        return isSameDay(parseISO(appt.start), col as Date);
                                    }
                                })
                                .map(appt => {
                                    const pos = getAppointmentPosition(appt.start, appt.end);
                                    const statusColorMap: Record<string, string> = {
                                        'Programada': '#BCE4EA',
                                        'En Sesión': '#FFB74D',
                                        'Finalizada': '#E0E0E0', // Gray for finished
                                        'Cobrada': '#81C784',
                                        'Cancelada': '#E57373',
                                        'Ausente': '#90A4AE'
                                    };

                                    const bgColor = statusColorMap[appt.status] || '#BCE4EA';
                                    const hasDiary = !!appt.sessionDiary;
                                    const isPaid = !!appt.isPaid;
                                    const needsDiary = appt.status === 'Finalizada' || appt.status === 'Cobrada';

                                    return (
                                        <div
                                            key={appt.id}
                                            className={`appointment-block status-${appt.status.replace(' ', '-').toLowerCase()}`}
                                            style={{
                                                ...pos,
                                                borderLeftColor: therapists.find(t => t.id === appt.therapistId)?.color,
                                                backgroundColor: bgColor,
                                                color: '#1a1a1a'
                                            }}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleOpenModal(appt);
                                            }}
                                        >
                                            <div className="flex justify-between items-start w-full">
                                                <span className="appt-patient" style={{ fontWeight: 600, fontSize: '0.75rem' }}>{appt.patientName}</span>
                                                <div className="flex gap-1">
                                                    {needsDiary && !hasDiary && <span title="Falta diario de sesión"><AlertTriangle size={12} className="text-danger" /></span>}
                                                    {!isPaid && appt.status !== 'Cancelada' && <span title="Pendiente de cobro"><DollarSign size={12} style={{ color: '#d32f2f' }} /></span>}
                                                    {appt.recurrence && (appt.status !== 'Cancelada') && (appt.recurrence.weeks || appt.recurrence.days || appt.recurrence.until) && (
                                                        <span title="Cita recurrente"><ClockIcon size={12} className="text-secondary" /></span>
                                                    )}
                                                </div>
                                            </div>
                                            <span className="appt-type" style={{ fontSize: '0.65rem', opacity: 0.8 }}>{appt.type}</span>
                                        </div>
                                    );
                                })
                            }
                        </div>
                    ))}
                </div>
            </div>

            {isModalOpen && selectedAppt && (
                <div className="modal-overlay">
                    <div className="modal-content" style={{ maxWidth: '500px' }}>
                        <div className="modal-header">
                            <h3>{selectedAppt.id ? 'Detalles de la Cita' : 'Nueva Cita'}</h3>
                            <button className="btn-icon-round" onClick={() => setIsModalOpen(false)}><X size={20} /></button>
                        </div>
                        <form className="modal-form" onSubmit={handleSave}>
                            <div className="form-group">
                                <label><User size={14} style={{ marginRight: 6 }} /> Paciente</label>
                                <select required value={selectedAppt.patientId} onChange={e => setSelectedAppt({ ...selectedAppt, patientId: e.target.value })} style={{ padding: '0.75rem', borderRadius: '8px', border: '1px solid #ddd' }}>
                                    <option value="">Seleccionar paciente...</option>
                                    {patients.map(p => <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>)}
                                </select>
                            </div>
                            <div className="form-group">
                                <label><User size={14} style={{ marginRight: 6 }} /> Terapeuta</label>
                                <select required value={selectedAppt.therapistId} onChange={e => setSelectedAppt({ ...selectedAppt, therapistId: e.target.value })} style={{ padding: '0.75rem', borderRadius: '8px', border: '1px solid #ddd' }}>
                                    {therapists.map(t => <option key={t.id} value={t.id}>{t.fullName}</option>)}
                                </select>
                            </div>
                            <div className="flex gap-4">
                                <div className="form-group" style={{ flex: 2 }}><label>Fecha</label><input type="date" required value={getModalDate()} onChange={e => handleModalDateChange(e.target.value)} /></div>
                                <div className="form-group" style={{ flex: 1 }}><label>Inicio</label><input type="time" required value={getModalStartTime()} onChange={e => handleModalTimeChange('start', e.target.value)} /></div>
                                <div className="form-group" style={{ flex: 1 }}><label>Fin</label><input type="time" required value={getModalEndTime()} onChange={e => handleModalTimeChange('end', e.target.value)} /></div>
                            </div>
                            <div className="form-group">
                                <label>Servicio Clínico</label>
                                <select
                                    required
                                    value={selectedAppt.serviceId || ''}
                                    onChange={e => {
                                        const s = services.find(srv => srv.id === e.target.value);
                                        setSelectedAppt({
                                            ...selectedAppt,
                                            serviceId: e.target.value,
                                            type: s ? s.name : selectedAppt.type
                                        });
                                    }}
                                    style={{ padding: '0.75rem', borderRadius: '8px', border: '1px solid #ddd' }}
                                >
                                    <option value="">Seleccionar servicio...</option>
                                    {services.map(s => <option key={s.id} value={s.id}>{s.name} ({s.price}€)</option>)}
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Estado</label>
                                <select
                                    value={selectedAppt.status}
                                    onChange={e => setSelectedAppt({ ...selectedAppt, status: e.target.value as any })}
                                    style={{ padding: '0.75rem', borderRadius: '8px', border: '1px solid #ddd' }}
                                >
                                    <option value="Programada">Programada</option>
                                    <option value="En Sesión">En Sesión</option>
                                    <option value="Finalizada">Finalizada</option>
                                    <option value="Cobrada">Cobrada</option>
                                    <option value="Cancelada">Cancelada</option>
                                    <option value="Ausente">Ausente</option>
                                </select>
                            </div>

                            {selectedAppt.status === 'Cancelada' && (
                                <div className="form-group">
                                    <label>Motivo de Cancelación</label>
                                    <select
                                        required
                                        value={selectedAppt.cancellationReason || ''}
                                        onChange={e => setSelectedAppt({ ...selectedAppt, cancellationReason: e.target.value })}
                                        style={{ padding: '0.75rem', borderRadius: '8px', border: '1px solid #ddd' }}
                                    >
                                        <option value="">Seleccionar motivo...</option>
                                        <option value="Enfermedad">Enfermedad</option>
                                        <option value="Olvido">Olvido</option>
                                        <option value="Transporte">Problemas de Transporte</option>
                                        <option value="Personal">Motivo Personal</option>
                                        <option value="Otro">Otro</option>
                                    </select>
                                </div>
                            )}

                            {(selectedAppt.status === 'Finalizada' || selectedAppt.status === 'Cobrada') && (
                                <div className="form-group diary-group">
                                    <div className="flex justify-between items-center mb-1">
                                        <label className="flex items-center gap-2 m-0">
                                            <Rocket size={14} className="text-secondary" /> Diario de Sesión (Progreso)
                                        </label>
                                        <button
                                            type="button"
                                            className={`btn-voice-toggle ${isRecording ? 'recording' : ''}`}
                                            onClick={toggleVoiceDiary}
                                            title={isRecording ? 'Detener grabación' : 'Dictar por voz'}
                                        >
                                            {isRecording ? <Square size={14} fill="currentColor" /> : <Mic size={14} />}
                                            <span>{isRecording ? 'Grabando...' : 'Dictar'}</span>
                                        </button>
                                    </div>
                                    <textarea
                                        required
                                        placeholder="Anota el progreso de la sesión aquí..."
                                        value={selectedAppt.sessionDiary || ''}
                                        onChange={e => setSelectedAppt({ ...selectedAppt, sessionDiary: e.target.value })}
                                        style={{ width: '100%', minHeight: '100px', padding: '0.75rem', borderRadius: '8px', border: '1px solid #ddd', fontFamily: 'inherit' }}
                                    />
                                </div>
                            )}

                            {!selectedAppt.id && (
                                <div className="recurrence-section p-3 bg-gray-50 rounded-xl border border-dashed mb-4">
                                    <label className="flex items-center gap-2 font-bold text-xs mb-3 text-secondary uppercase tracking-wider">
                                        <Puzzle size={14} /> Configuración de Recurrencia
                                    </label>

                                    <div className="day-selector flex gap-1 mb-4">
                                        {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((day, i) => {
                                            const dayNum = i + 1;
                                            const isSelected = selectedAppt.recurrence?.days?.includes(dayNum);
                                            return (
                                                <button
                                                    key={day}
                                                    type="button"
                                                    className={`day-btn ${isSelected ? 'active' : ''}`}
                                                    onClick={() => {
                                                        const currentDays = selectedAppt.recurrence?.days || [];
                                                        const newDays = isSelected
                                                            ? currentDays.filter(d => d !== dayNum)
                                                            : [...currentDays, dayNum].sort();
                                                        setSelectedAppt({
                                                            ...selectedAppt,
                                                            recurrence: { ...selectedAppt.recurrence, days: newDays }
                                                        });
                                                    }}
                                                >
                                                    {day}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="form-group">
                                            <label className="text-xs">Repetir durante (Semanas)</label>
                                            <input
                                                type="number"
                                                min="1"
                                                max="52"
                                                disabled={!!selectedAppt.recurrence?.until}
                                                placeholder="Nº semanas"
                                                value={selectedAppt.recurrence?.weeks || ''}
                                                onChange={e => setSelectedAppt({
                                                    ...selectedAppt,
                                                    recurrence: { ...selectedAppt.recurrence, weeks: parseInt(e.target.value) || undefined, until: undefined }
                                                })}
                                                style={{ padding: '0.5rem', borderRadius: '6px' }}
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label className="text-xs">O hasta fecha límite</label>
                                            <input
                                                type="date"
                                                disabled={!!selectedAppt.recurrence?.weeks && selectedAppt.recurrence.weeks > 0}
                                                value={selectedAppt.recurrence?.until || ''}
                                                onChange={e => setSelectedAppt({
                                                    ...selectedAppt,
                                                    recurrence: { ...selectedAppt.recurrence, until: e.target.value, weeks: undefined }
                                                })}
                                                style={{ padding: '0.5rem', borderRadius: '6px' }}
                                            />
                                        </div>
                                    </div>
                                    {(!selectedAppt.recurrence?.weeks && !selectedAppt.recurrence?.until) && (
                                        <p className="text-[10px] text-secondary mt-2 italic">Cita única si no se indica duración.</p>
                                    )}
                                </div>
                            )}

                            <div className="modal-footer">
                                {selectedAppt?.id && isRole('ADMIN') && (
                                    <button
                                        type="button"
                                        className="btn-danger"
                                        onClick={handleDeleteAppointment}
                                        style={{ marginRight: 'auto' }}
                                    >
                                        Eliminar cita
                                    </button>
                                )}
                                <button type="button" className="btn-secondary" onClick={() => setIsModalOpen(false)}>Cancelar</button>
                                <button type="submit" className="btn-primary">Guardar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {isRadarOpen && (
                <div className="modal-overlay">
                    <div className="modal-content" style={{ maxWidth: '400px' }}>
                        <div className="modal-header">
                            <div className="flex items-center gap-2">
                                <Puzzle size={20} className="text-secondary" />
                                <h3>Radar de Huecos Libres</h3>
                            </div>
                            <button className="btn-icon-round" onClick={() => setIsRadarOpen(false)}><X size={20} /></button>
                        </div>
                        <div className="p-4">
                            <p className="text-sm text-secondary mb-4">Huecos con máxima disponibilidad de terapeutas encontrados:</p>
                            <div className="space-y-2">
                                {gaps.length === 0 ? (
                                    <div className="text-center py-4 text-secondary italic">No se encontraron huecos óptimos.</div>
                                ) : (
                                    gaps.map((gap, i) => (
                                        <div
                                            key={i}
                                            className="flex justify-between items-center p-3 border rounded-xl hover:bg-primary-light cursor-pointer transition-colors"
                                            onClick={() => {
                                                handleOpenModal(undefined, undefined, gap.start);
                                                setIsRadarOpen(false);
                                            }}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="bg-white p-2 rounded-lg border shadow-sm">
                                                    <ClockIcon size={16} className="text-secondary" />
                                                </div>
                                                <div>
                                                    <div className="font-bold text-sm">
                                                        {format(gap.start, "EEEE d 'de' MMMM", { locale: es })}
                                                    </div>
                                                    <div className="text-xs text-secondary">
                                                        {format(gap.start, 'HH:mm')} - {format(gap.end, 'HH:mm')}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="text-xs font-bold bg-green-100 text-green-700 px-2 py-1 rounded-full">
                                                {gap.count} Libres
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn-secondary w-full" onClick={() => setIsRadarOpen(false)}>Cerrar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CalendarView;
