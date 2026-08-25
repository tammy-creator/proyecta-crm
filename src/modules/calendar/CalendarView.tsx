import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
    format,
    startOfWeek,
    addDays,
    subDays,
    eachDayOfInterval,
    isSameDay,
    parseISO,
    isValid,
    formatISO,
    setHours,
    setMinutes,
    setSeconds,
    setMilliseconds,
    addMinutes,
    addWeeks,
    subWeeks,
    differenceInMinutes,
    getDay,
    isBefore,
    isAfter,
    endOfDay,
    addHours,
    startOfMonth,
    endOfMonth,
    addMonths,
    subMonths,
    isSameMonth,
    endOfWeek,
    startOfDay
} from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Plus, X, User, UserPlus, Rocket, Puzzle, AlertTriangle, Clock as ClockIcon, DollarSign, Mic, Square, Info, Search, ArrowLeft } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getAppointments, createAppointment, updateAppointment, deleteAppointment } from './service';
import { getPatients, getWaitingList } from '../patients/service';
import { getTherapists } from '../therapists/service';
import { getServices } from '../admin/service';
// import { getCurrentStatus } from '../workforce/service'; // Unused in this file
import { type Appointment, type AppointmentStatus } from './types';
import { type Patient } from '../patients/types';
import { type Therapist } from '../therapists/types';
import { getIllustrativeAvatar } from '../therapists/utils';
import { type ClinicalService } from '../admin/types';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../hooks/useToast';
import QuickPatientModal from '../patients/QuickPatientModal';
import './CalendarView.css';

interface CalendarViewProps {
    mode?: 'TODAY_MULTI' | 'WEEKLY_SINGLE';
    therapistId?: string;
    onEditTherapist?: (therapist: Therapist) => void;
}

// Default fixed hours fallback (8:00 to 21:00)
const DEFAULT_HOURS = Array.from({ length: 14 }, (_, i) => i + 8);

const CalendarView: React.FC<CalendarViewProps> = ({ mode: initialMode, therapistId: filterTherapistId, onEditTherapist }) => {
    const { user, isRole } = useAuth();
    const { showToast } = useToast();

    const location = useLocation();
    const navigate = useNavigate();

    const [currentDate, setCurrentDate] = useState(new Date());
    const [currentTime, setCurrentTime] = useState(new Date());

    const [dynamicHours, setDynamicHours] = useState<number[]>(DEFAULT_HOURS);

    // Configuración ultra-flexible para que todo quepa en una sola pantalla
    const isEmbedded = !!initialMode;
    const gridRef = useRef<HTMLDivElement>(null);
    const [containerHeight, setContainerHeight] = useState(600);
    // Garantizamos un mínimo de 70px por hora para que las citas se lean perfectamente
    const slotHeight = isEmbedded ? Math.max(70, (containerHeight - 70) / (dynamicHours.length || 1)) : 100;
    const timeColWidth = isEmbedded ? 50 : 55; // Slightly wider for perfect comfort

    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [patients, setPatients] = useState<Patient[]>([]);
    const [therapists, setTherapists] = useState<Therapist[]>([]);
    const [services, setServices] = useState<ClinicalService[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedAppt, setSelectedAppt] = useState<Partial<Appointment> | null>(null);
    const [isCancelling, setIsCancelling] = useState(false);
    const [tempCancelReason, setTempCancelReason] = useState('Anulada por el usuario');
    const [cancelType, setCancelType] = useState<'internal' | 'patient'>('patient');
    const [cancelSubtype, setCancelSubtype] = useState<'standard' | 'late'>('standard');
    const [isRadarOpen, setIsRadarOpen] = useState(false);
    // const [confirmDelete, setConfirmDelete] = useState(false); // Unused
    const [isRecording, setIsRecording] = useState(false);
    const [miniCalendarDate, setMiniCalendarDate] = useState(new Date());
    const [gaps, setGaps] = useState<{ start: Date; end: Date; count: number; therapists?: string[]; therapistIds?: string[] }[]>([]);
    const [radarRange, setRadarRange] = useState<'today' | 'week' | 'month'>('today');
    const [radarTherapistId, setRadarTherapistId] = useState<string>('all');
    const [radarTimeFilter, setRadarTimeFilter] = useState<'all' | 'morning' | 'afternoon'>('all');
    const [absences, setAbsences] = useState<any[]>([]);

    // Doctoralia Style States
    const [selectedTherapistIds, setSelectedTherapistIds] = useState<string[]>([]);
    const [therapistSearch, setTherapistSearch] = useState('');

    const filteredTherapistList = therapists.filter(t => {
        const normalizedName = t.fullName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, ' ').trim();
        const normalizedSearch = therapistSearch.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, ' ').trim();
        return normalizedName.includes(normalizedSearch);
    });

    const handleSelectAllTherapists = () => {
        const visibleIds = filteredTherapistList.map(t => t.id);
        setSelectedTherapistIds(prev => {
            const newSelection = new Set([...prev, ...visibleIds]);
            return Array.from(newSelection);
        });
    };

    const handleDeselectAllTherapists = () => {
        const visibleIds = filteredTherapistList.map(t => t.id);
        setSelectedTherapistIds(prev => prev.filter(id => !visibleIds.includes(id)));
    };

    const isAllSelected = filteredTherapistList.length > 0 && filteredTherapistList.every(t => selectedTherapistIds.includes(t.id));
    const isSomeSelected = !isAllSelected && filteredTherapistList.some(t => selectedTherapistIds.includes(t.id));

    const handleToggleAll = () => {
        if (isAllSelected) {
            handleDeselectAllTherapists();
        } else {
            handleSelectAllTherapists();
        }
    };

    const masterCheckboxRef = useRef<HTMLInputElement>(null);
    useEffect(() => {
        if (masterCheckboxRef.current) {
            masterCheckboxRef.current.indeterminate = isSomeSelected;
        }
    }, [isSomeSelected]);

    const [draggedApptId, setDraggedApptId] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<'day' | 'week'>(() => {
        if (initialMode) return initialMode === 'WEEKLY_SINGLE' ? 'week' : 'day';
        return isRole('ADMIN') ? 'day' : 'week';
    });
    const [patientSearch, setPatientSearch] = useState('');
    const [showPatientSuggestions, setShowPatientSuggestions] = useState(false);
    const [isQuickPatientModalOpen, setIsQuickPatientModalOpen] = useState(false);
    const [quickPatientName, setQuickPatientName] = useState('');

    // Si no se pasa modo, se controla con viewMode
    const effectiveMode = initialMode || (viewMode === 'day' ? 'TODAY_MULTI' : 'WEEKLY_SINGLE');
    const effectiveTherapistId = filterTherapistId || (isRole('THERAPIST') ? user?.therapistId : undefined);

    const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
    const weekEnd = addDays(weekStart, 6); // Lunes a Domingo (6 días después del lunes)

    // Columnas: O bien los días de la semana, o bien los terapeutas
    const days = eachDayOfInterval({ start: weekStart, end: weekEnd });

    const handleOpenQuickPatientModal = (name: string) => {
        setQuickPatientName(name);
        setIsQuickPatientModalOpen(true);
    };

    const handleQuickPatientSuccess = (newPatient: Patient) => {
        // Actualizar estado local de pacientes
        setPatients(prev => [newPatient, ...prev]);

        // Seleccionar el nuevo paciente en la cita actual
        setSelectedAppt({
            ...selectedAppt,
            patientId: newPatient.id,
            patientName: `${newPatient.firstName} ${newPatient.lastName}`
        });

        setPatientSearch(`${newPatient.firstName} ${newPatient.lastName}`);
        setShowPatientSuggestions(false);
    };

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

            return newStatus !== appt.status ? { ...appt, status: newStatus as AppointmentStatus } : appt;
        });
    };

    const fetchAbsences = async () => {
        try {
            const { data, error } = await supabase
                .from('attendance')
                .select('*')
                .neq('type', 'work')
                .lte('start_time', weekEnd.toISOString())
                .gte('end_time', weekStart.toISOString());

            if (error) {
                console.error("Error fetching absences:", error);
                return;
            }
            setAbsences(data || []);
        } catch (err) {
            console.error("Critical error in fetchAbsences:", err);
        }
    };

    const fetchData = () => {
        getAppointments(weekStart, weekEnd).then(data => {
            const updatedData = calculateStatuses(data);
            setAppointments(updatedData);
        }).catch(err => {
            console.error("Error fetching appointments:", err);
            showToast("Error al cargar citas", "error");
        });
        fetchAbsences();
    };

    useEffect(() => {
        const handleRefresh = () => {
            console.log("Real-time refresh triggered");
            fetchData();
        };
        window.addEventListener('calendar-refresh', handleRefresh);
        return () => window.removeEventListener('calendar-refresh', handleRefresh);
    }, [weekStart, weekEnd]); // Depend on week start/end to ensure closure has right context

    useEffect(() => {
        fetchData();
        getPatients().then(setPatients).catch(err => console.error("Error in getPatients effect:", err.message || err));
        getTherapists().then(data => {
            // Filtrar para que 'Administración' no salga en el calendario
            const filteredTherapists = data.filter(t => t.specialty !== 'Administración');
            setTherapists(filteredTherapists);
            // Si hay un filtro de terapeuta, seleccionar solo ese; si no, todos por defecto
            setSelectedTherapistIds(filterTherapistId ? [filterTherapistId] : filteredTherapists.map(t => t.id));
            // Compute dynamic hour range from therapists' schedules, filtering if necessary
            computeDynamicHours(filteredTherapists, filterTherapistId || (isRole('THERAPIST') ? user?.therapistId : undefined));
        }).catch(err => console.error("Error in getTherapists effect:", err.message || err));
        getServices().then(setServices).catch(err => console.error("Error in getServices effect:", err.message || err));
    }, [currentDate]);

    // Handle navigation from Dashboard
    // Measure container height to adjust slots dynamically in modal mode
    useEffect(() => {
        if (!isEmbedded) return;
        const updateSize = () => {
            if (gridRef.current) {
                setContainerHeight(gridRef.current.clientHeight);
            }
        };
        updateSize();
        // Use ResizeObserver for more reliable measurements
        const resizeObserver = new ResizeObserver(updateSize);
        if (gridRef.current) resizeObserver.observe(gridRef.current);
        window.addEventListener('resize', updateSize);
        return () => {
            resizeObserver.disconnect();
            window.removeEventListener('resize', updateSize);
        };
    }, [isEmbedded, dynamicHours]);

    // Auto-scroll to current hour when grid opens or dynamic hours update
    useEffect(() => {
        const timeout = setTimeout(() => {
            const currentHour = new Date().getHours();
            const element = document.getElementById(`time-row-${currentHour}`);
            if (element && gridRef.current) {
                // Scroll to the hour, minus half a slot to see the previous hour context
                gridRef.current.scrollTop = element.offsetTop - (slotHeight / 2);
            }
        }, 300); // Small delay to ensure render is complete
        return () => clearTimeout(timeout);
    }, [dynamicHours]);

    // Handle navigation from Dashboard or Registry
    useEffect(() => {
        const state = location.state as { date?: string; openAppointmentId?: string } | null;
        if (state?.date) {
            const targetDate = parseISO(state.date);
            if (isValid(targetDate) && !isSameDay(targetDate, currentDate)) {
                setCurrentDate(targetDate);
            }
        }
    }, [location.state]);

    useEffect(() => {
        const state = location.state as { openAppointmentId?: string } | null;
        if (state?.openAppointmentId && appointments.length > 0) {
            const appt = appointments.find(a => a.id === state.openAppointmentId);
            if (appt) {
                handleOpenModal(appt);
                // Clear state to prevent reopening
                navigate(location.pathname, { replace: true, state: {} });
            }
        }
    }, [appointments, location.state]);

    const nextPeriod = () => {
        if (effectiveMode === 'TODAY_MULTI') setCurrentDate(addDays(currentDate, 1));
        else setCurrentDate(addWeeks(currentDate, 1));
    };

    const prevPeriod = () => {
        if (effectiveMode === 'TODAY_MULTI') setCurrentDate(addDays(currentDate, -1));
        else setCurrentDate(subWeeks(currentDate, 1));
    };


    useEffect(() => {
        if (effectiveMode === 'TODAY_MULTI' && getDay(currentDate) === 0) {
            // Si es domingo, saltar al lunes
            setCurrentDate(addDays(currentDate, 1));
        }
    }, [currentDate, effectiveMode]);

    // Auto-update statuses based on time (Interval)
    useEffect(() => {
        const interval = setInterval(() => {
            const now = new Date();
            setCurrentTime(now);
            setAppointments(current => calculateStatuses(current));
        }, 60000); // Run every minute
        return () => clearInterval(interval);
    }, []);

    // React to changes in data to recompute hours
    useEffect(() => {
        computeDynamicHours(therapists, effectiveTherapistId, appointments);
    }, [appointments, therapists, effectiveTherapistId]);

    // React to workforce check-in/out events
    useEffect(() => {
        const handler = () => fetchData();
        window.addEventListener('workforce-update', handler);
        return () => window.removeEventListener('workforce-update', handler);
    }, []);

    const computeDynamicHours = (therapistList: Therapist[], filterId?: string, appts: Appointment[] = []) => {
        let minHour = 8;
        let maxHour = 20;
        let found = false;

        const filteredList = filterId ? therapistList.filter(t => t.id === filterId) : therapistList;
        // Solo tener en cuenta citas que están en el rango de la semana actual para evitar expansiones por citas pasadas/futuras
        const filteredAppts = appts.filter(a => {
            const start = parseISO(a.start);
            const isInWeek = isAfter(start, subDays(weekStart, 1)) && isBefore(start, addDays(weekEnd, 1));
            const isTherapistMatch = !filterId || String(a.therapistId) === String(filterId);
            return isInWeek && isTherapistMatch;
        });

        filteredList.forEach(t => {
            if (!t.schedule || t.schedule.length === 0) return;
            t.schedule.forEach(day => {
                if (!day.enabled || day.blocks.length === 0) return;
                day.blocks.forEach(block => {
                    const startH = parseInt(block.start.split(':')[0], 10);
                    const endH = parseInt(block.end.split(':')[0], 10) + (parseInt(block.end.split(':')[1], 10) > 0 ? 1 : 0);
                    if (!found) { minHour = startH; maxHour = endH; found = true; }
                    else {
                        if (startH < minHour) minHour = startH;
                        if (endH > maxHour) maxHour = endH;
                    }
                });
            });
        });

        filteredAppts.forEach(a => {
            const startH = parseISO(a.start).getHours();
            const endH = parseISO(a.end).getHours() + (parseISO(a.end).getMinutes() > 0 ? 1 : 0);
            if (!found) { minHour = startH; maxHour = endH; found = true; }
            else {
                if (startH < minHour) minHour = startH;
                if (endH > maxHour) maxHour = endH;
            }
        });

        const finalMin = Math.max(0, minHour - 1);
        const finalMax = Math.min(24, maxHour + 1);

        const hours = [];
        for (let i = finalMin; i < finalMax; i++) {
            hours.push(i);
        }
        setDynamicHours(hours);
    };

    const goToToday = () => setCurrentDate(new Date());

    const isSlotEnabled = (date: Date, hour: number, tId?: string) => {
        if (!tId) return true;

        // Check for absence blocking
        const isAbsence = absences.some((a: any) => {
            if (a.therapist_id !== tId) return false;

            const start = parseISO(a.start_time);
            const end = a.end_time ? parseISO(a.end_time) : start;
            const slotTime = setMinutes(setHours(date, hour), 0);

            // Si es festivo o vacaciones, bloquea todo el día para ese terapeuta
            if (a.type === 'holiday' || a.type === 'vacation') {
                return isSameDay(date, start);
            }

            // Para otros tipos (baja, etc), verificamos solapamiento del bloque de hora
            return (slotTime >= start && slotTime <= end);
        });
        if (isAbsence) return false;

        const therapist = therapists.find(t => t.id === tId);
        if (!therapist || !therapist.schedule || therapist.schedule.length === 0) return true; // Si no hay horario, por defecto abierto

        const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
        const dayName = dayNames[getDay(date)];

        const daySchedule = therapist.schedule.find(d => d.day === dayName);
        if (!daySchedule || !daySchedule.enabled) return false;

        return daySchedule.blocks.some(block => {
            const startH = parseInt(block.start.split(':')[0], 10);
            const endH = parseInt(block.end.split(':')[0], 10) + (parseInt(block.end.split(':')[1], 10) > 0 ? 1 : 0);
            return hour >= startH && hour < endH;
        });
    };

    const getAvailableTherapists = (startStr?: string, endStr?: string) => {
        if (!startStr || !endStr) return therapists;
        const start = parseISO(startStr);
        const end = parseISO(endStr);
        const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
        const dayName = dayNames[getDay(start)];

        return therapists.filter(t => {
            // Include if it's the already selected therapist for an existing appointment
            if (selectedAppt?.id && t.id === selectedAppt.therapistId) return true;

            // 1. Check absences
            const hasAbsence = absences.some((a: any) => {
                const aStart = parseISO(a.start_time);
                const aEnd = a.end_time ? parseISO(a.end_time) : aStart;
                if (a.therapist_id !== t.id) return false;
                // Overlap check
                return start < aEnd && end > aStart;
            });
            if (hasAbsence) return false;

            // 2. Check schedule (Skip check if we are blocking)
            if (selectedAppt?.status === 'Bloqueada') return true;

            if (!t.schedule || t.schedule.length === 0) return true; // By default open if no schedule
            const daySchedule = t.schedule.find(d => d.day === dayName);
            if (!daySchedule || !daySchedule.enabled) return false;

            const startTimeVal = start.getHours() * 60 + start.getMinutes();
            const endTimeVal = end.getHours() * 60 + end.getMinutes();

            return daySchedule.blocks.some(block => {
                const [bStartH, bStartM] = block.start.split(':').map(Number);
                const [bEndH, bEndM] = block.end.split(':').map(Number);
                const bStartTimeVal = bStartH * 60 + bStartM;
                const bEndTimeVal = bEndH * 60 + bEndM;
                // Interval must be fully contained in block
                return startTimeVal >= bStartTimeVal && endTimeVal <= bEndTimeVal;
            });
        });
    };

    const checkForWaitingListMatches = async (apptStart: string) => {
        try {
            const date = parseISO(apptStart);
            const dayOfWeek = getDay(date); // 0=Sun, 1=Mon, 2=Tue...
            // Convert to 1=Mon, 2=Tue... used in our UI (S=6)
            const uiDay = dayOfWeek === 0 ? 7 : dayOfWeek;
            const apptMinutes = date.getHours() * 60 + date.getMinutes();

            const waitingList = await getWaitingList();
            const matches = waitingList.filter(entry => {
                const dayMatch = !entry.preferredDays?.length || entry.preferredDays.includes(uiDay);
                // Fuzzy hour match: preferred hour is within 30 minutes of the freed slot
                const hourMatch = !entry.preferredHours?.length || entry.preferredHours.some(h => {
                    const [ph, pm] = h.split(':').map(Number);
                    const prefMinutes = ph * 60 + pm;
                    return Math.abs(apptMinutes - prefMinutes) <= 30;
                });
                return dayMatch && hourMatch;
            });

            if (matches.length > 0) {
                const names = matches.map(m => m.patientName).join(', ');
                showToast(`¡Aviso! ${matches.length} paciente(s) en lista de espera encajan con este hueco: ${names}`, 'info');
            }
        } catch (err) {
            console.error('Error checking waiting list matches:', err);
        }
    };

    const handleOpenModal = async (appt?: Appointment, tId?: string, date?: Date, _isOutsideSchedule?: boolean) => {
        setIsCancelling(false);
        if (appt) {
            setSelectedAppt(appt);
            setPatientSearch(appt.patientName || '');
        } else {
            const startBase = startOfDay(date || new Date());
            const hours = (date || new Date()).getHours();
            const minutes = (date || new Date()).getMinutes();

            const startStr = formatISO(setMinutes(setHours(startBase, hours), minutes));
            // Default duration 60m
            const endStr = formatISO(addMinutes(parseISO(startStr), 60));

            const available = getAvailableTherapists(startStr, endStr);
            const therapistId = tId || available[0]?.id || therapists[0]?.id || '';
            const therapist = therapists.find(t => t.id === therapistId);

            setSelectedAppt({
                therapistId,
                therapistName: therapist?.fullName || '',
                start: startStr,
                end: endStr,
                status: 'Programada',
                patientId: '',
                patientName: '',
                type: 'Terapia',
                isPaid: false
            });
            setPatientSearch('');
        }
        setIsModalOpen(true);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedAppt) return;

        // Validación: Diario de sesión obligatorio
        const needsDiary = selectedAppt.status === 'Finalizada' || selectedAppt.status === 'Cobrada';
        if (needsDiary && (!selectedAppt.sessionDiary || selectedAppt.sessionDiary.trim() === '')) {
            showToast("El diario de sesión es obligatorio para finalizar o cobrar una cita.", "error");
            return;
        }

        const finalAppt = { ...selectedAppt };
        const isBlocked = finalAppt.status === 'Bloqueada';

        if (isBlocked) {
            finalAppt.patientId = undefined;
            finalAppt.serviceId = undefined;
            finalAppt.patientName = finalAppt.patientName || 'HORARIO BLOQUEADO';
            finalAppt.type = 'Bloqueo';
        } else {
            const p = patients.find(p => p.id === finalAppt.patientId);
            if (p) finalAppt.patientName = `${p.firstName} ${p.lastName}`;
            const t = therapists.find(t => t.id === finalAppt.therapistId);
            if (t) finalAppt.therapistName = t.fullName;

            // Ensure type name is set if service is selected
            if (finalAppt.serviceId) {
                const s = services.find(s => s.id === finalAppt.serviceId);
                if (s) finalAppt.type = s.name;
            }
        }

        if (finalAppt.id) {
            await updateAppointment(finalAppt as Appointment);
            // If we just cancelled the appointment, check for waiting list matches
            if (finalAppt.status === 'Cancelada' && finalAppt.start) {
                await checkForWaitingListMatches(finalAppt.start);
            }
        } else {
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

    const handleAnularCita = (e?: React.MouseEvent) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        setIsCancelling(true);
        setTempCancelReason('Anulada por el usuario');
    };

    const confirmCancellation = async () => {
        if (!selectedAppt?.id) return;

        try {
            if (cancelType === 'internal') {
                // Si es error de gestión, eliminamos la cita por completo del sistema
                await deleteAppointment(selectedAppt.id);
                showToast("Cita eliminada correctamente (Error de gestión)", "success");
            } else {
                // Si es cancelación de paciente, mantenemos el registro
                let finalStatus: AppointmentStatus = 'Cancelada';
                let finalReason = tempCancelReason;

                if (cancelSubtype === 'late') {
                    // Según política: <24h se da como disfrutada (Ausente) y se debe abonar
                    finalStatus = 'Ausente';
                    finalReason = `CANCELACIÓN TARDE (<24h): ${tempCancelReason}`;
                } else {
                    finalStatus = 'Cancelada';
                    finalReason = `Cancelación Paciente (>24h): ${tempCancelReason}`;
                }

                const updated = {
                    ...selectedAppt,
                    status: finalStatus,
                    cancellationReason: finalReason
                } as Appointment;

                await updateAppointment(updated);

                if (updated.start && finalStatus === 'Cancelada') {
                    try {
                        await checkForWaitingListMatches(updated.start);
                    } catch (err) {
                        console.error("Non-blocking error in waiting list match:", err);
                    }
                }

                showToast(
                    cancelSubtype === 'late'
                        ? "Cita marcada como Ausente (fuera de plazo). Pendiente de cobro."
                        : "Cita anulada correctamente",
                    "success"
                );
            }

            setIsCancelling(false);
            setIsModalOpen(false);
            fetchData();
        } catch (err: any) {
            console.error("Error in confirmCancellation:", err);
            showToast(`Error: ${err.message || 'Error desconocido'}`, "error");
        }
    };

    const findGaps = async (range?: 'today' | 'week' | 'month', therapistId?: string, timeFilter?: 'all' | 'morning' | 'afternoon') => {
        const targetRange = range || radarRange;
        const targetTherapistId = (therapistId && therapistId !== 'undefined') ? therapistId : radarTherapistId;
        const targetTimeFilter = timeFilter || radarTimeFilter;

        if (targetTherapistId !== radarTherapistId) setRadarTherapistId(targetTherapistId);
        if (targetRange !== radarRange) setRadarRange(targetRange);
        if (targetTimeFilter !== radarTimeFilter) setRadarTimeFilter(targetTimeFilter);

        const foundGaps: { start: Date; end: Date; count: number; therapists?: string[]; therapistIds?: string[] }[] = [];
        let viewDays: Date[] = [];

        const now = new Date();
        const todayStart = startOfDay(now);
        const baseDate = isBefore(startOfDay(currentDate), todayStart) ? todayStart : startOfDay(currentDate);

        let searchStart = todayStart;
        let searchEnd = todayStart;

        if (targetRange === 'today') {
            viewDays = [baseDate];
            searchStart = startOfDay(baseDate);
            searchEnd = endOfDay(baseDate);
        } else if (targetRange === 'week') {
            const startOfSearchWeek = startOfWeek(baseDate, { weekStartsOn: 1 });
            for (let i = 0; i < 6; i++) {
                const d = addDays(startOfSearchWeek, i);
                if (isAfter(d, todayStart) || isSameDay(d, todayStart)) {
                    viewDays.push(d);
                }
            }
            searchStart = startOfSearchWeek;
            searchEnd = endOfDay(addDays(startOfSearchWeek, 6));
        } else if (targetRange === 'month') {
            const startM = startOfMonth(baseDate);
            const endM = endOfMonth(baseDate);
            viewDays = eachDayOfInterval({ start: startM, end: endM })
                .filter(d => (isAfter(d, todayStart) || isSameDay(d, todayStart)) && d.getDay() !== 0);
            searchStart = startM;
            searchEnd = endM;
        }



        try {
            const [freshTherapists, freshAppointments, absResult] = await Promise.all([
                getTherapists(),
                getAppointments(searchStart, searchEnd),
                supabase
                    .from('attendance')
                    .select('*')
                    .neq('type', 'work')
                    .lte('start_time', searchEnd.toISOString())
                    .gte('end_time', searchStart.toISOString())
            ]);

            const freshAbsences = absResult.data;
            const therapistsToUse = freshTherapists.filter(t => t.specialty !== 'Administración');
            const normalizedAbsences = freshAbsences || [];



            const normDay = (name: string) => name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

            const addSlotsInInterval = (intervalStart: Date, intervalEnd: Date, t: Therapist, blockStartMins: number) => {
                let s = new Date(intervalStart);
                const currentMins = s.getMinutes();
                if (currentMins !== blockStartMins) {
                    s = setSeconds(setMilliseconds(s, 0), 0);
                    if (currentMins < blockStartMins) {
                        s = setMinutes(s, blockStartMins);
                    } else {
                        s = setMinutes(addHours(s, 1), blockStartMins);
                    }
                }
                if (isBefore(s, intervalStart)) s = addHours(s, 1);

                while (differenceInMinutes(intervalEnd, s) >= 60) {
                    const e = addMinutes(s, 60);
                    const hour = s.getHours();
                    let match = true;
                    if (targetTimeFilter === 'morning') match = hour >= 9 && hour < 14;
                    else if (targetTimeFilter === 'afternoon') match = hour >= 15 && hour < 20;

                    if (match) {
                        foundGaps.push({
                            start: new Date(s),
                            end: new Date(e),
                            count: 1,
                            therapists: [t.fullName?.split(' ')[0] || 'Terapeuta'],
                            therapistIds: [t.id]
                        });
                    }
                    s = addMinutes(s, 60);
                }
            };

            for (const day of viewDays) {
                const dayStr = format(day, 'yyyy-MM-dd');
                const dayNameRaw = format(day, "EEEE", { locale: es });
                const targetDayName = normDay(dayNameRaw);

                const dayTherapists = targetTherapistId === 'all'
                    ? therapistsToUse
                    : therapistsToUse.filter(t => t.id === targetTherapistId);



                for (const t of dayTherapists) {
                    const daySchedule = t.schedule?.find(s => normDay(s.day) === targetDayName);

                    if (!daySchedule || !daySchedule.enabled || !daySchedule.blocks) continue;

                    const dayAbsences = normalizedAbsences.filter(a =>
                        a.therapist_id === t.id &&
                        format(new Date(a.start_time), 'yyyy-MM-dd') === dayStr
                    );

                    if (dayAbsences.some(a => a.type === 'holiday' || a.type === 'vacation')) continue;

                    const tOccupations = [
                        ...freshAppointments
                            .filter(a => a.therapistId === t.id && (a.status !== 'Cancelada' && a.status !== 'Ausente'))
                            .filter(a => format(new Date(a.start), 'yyyy-MM-dd') === dayStr)
                            .map(a => ({ start: new Date(a.start), end: new Date(a.end) })),
                        ...dayAbsences.map(a => ({
                            start: new Date(a.start_time),
                            end: a.end_time ? new Date(a.end_time) : endOfDay(new Date(a.start_time))
                        }))
                    ].sort((a, b) => a.start.getTime() - b.start.getTime());



                    for (const block of daySchedule.blocks) {
                        const [startH, startM] = block.start.split(':').map(Number);
                        const [endH, endM] = block.end.split(':').map(Number);
                        const workStart = setMinutes(setHours(startOfDay(day), startH), startM);
                        const workEnd = setMinutes(setHours(startOfDay(day), endH), endM);

                        let cursor = workStart;
                        if (isSameDay(day, todayStart) && isBefore(cursor, now)) {
                            cursor = now;
                        }

                        for (const occ of tOccupations) {
                            if (isBefore(occ.end, cursor)) continue;
                            if (isAfter(occ.start, workEnd)) break;
                            if (isAfter(occ.start, cursor)) addSlotsInInterval(cursor, occ.start, t, startM);
                            if (isAfter(occ.end, cursor)) cursor = occ.end;
                        }

                        if (isBefore(cursor, workEnd)) addSlotsInInterval(cursor, workEnd, t, startM);
                    }
                }

            }

            const mergedGaps: { start: Date; end: Date; count: number; therapists?: string[]; therapistIds?: string[] }[] = [];
            for (const g of foundGaps) {
                const existing = mergedGaps.find(mg => mg.start.getTime() === g.start.getTime() && mg.end.getTime() === g.end.getTime());
                if (existing) {
                    existing.count++;
                    if (g.therapists) existing.therapists = Array.from(new Set([...(existing.therapists || []), ...g.therapists]));
                    if (g.therapistIds) existing.therapistIds = Array.from(new Set([...(existing.therapistIds || []), ...g.therapistIds]));
                } else mergedGaps.push({ ...g });
            }


            setGaps(mergedGaps.sort((a, b) => a.start.getTime() - b.start.getTime()));
            setIsRadarOpen(true);
        } catch (err) {
            console.error("Error in findGaps:", err);
            showToast("Error al buscar huecos", "error");
        }
    };

    const getAppointmentPosition = (start: string, end: string) => {
        const startDate = parseISO(start);
        const endDate = parseISO(end);

        // Normalizar a minutos para evitar problemas de milisegundos
        const startHour = startDate.getHours();
        const startMin = startDate.getMinutes();
        const duration = differenceInMinutes(
            setSeconds(setMilliseconds(endDate, 0), 0),
            setSeconds(setMilliseconds(startDate, 0), 0)
        );

        const baseHour = dynamicHours.length > 0 ? dynamicHours[0] : 8;
        const top = (startHour - baseHour) * slotHeight + (startMin / 60) * slotHeight;
        const height = (duration / 60) * slotHeight;
        return { top: `${top}px`, height: `${height}px` };
    };

    const filteredAppointments = useMemo(() => {
        const unique = new Map();
        appointments.forEach(a => {
            if (a.id) unique.set(a.id, a);
        });
        const distinct = Array.from(unique.values());

        return distinct.filter(appt => {
            // Hide canceled appointments from the visual calendar
            if (appt.status === 'Cancelada') return false;

            // Si hay un terapeuta específico forzado (por filtro o por rol), mostrar solo ese
            if (effectiveTherapistId) {
                return String(appt.therapistId) === String(effectiveTherapistId);
            }

            // Respetar las selecciones laterales: solo mostrar citas si el terapeuta está seleccionado
            return selectedTherapistIds.includes(appt.therapistId);
        });
    }, [appointments, effectiveTherapistId, effectiveMode, selectedTherapistIds]);

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
            showToast("Tu navegador no soporta el reconocimiento de voz. Te recomendamos Chrome.", "info");
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

    const handleDragStart = (e: React.DragEvent, apptId: string) => {
        setDraggedApptId(apptId);
        e.dataTransfer.effectAllowed = 'move';
        e.currentTarget.classList.add('opacity-40', 'scale-95');
    };

    const handleDragEnd = (e: React.DragEvent) => {
        e.currentTarget.classList.remove('opacity-40', 'scale-95');
        setDraggedApptId(null);
    };

    const handleDrop = async (e: React.DragEvent, targetDate: Date, targetHour: number, targetMin: number, targetTherapistId?: string) => {
        e.preventDefault();
        e.currentTarget.classList.remove('bg-gray-100/50');
        if (!draggedApptId) return;

        const appt = appointments.find(a => a.id === draggedApptId);
        if (!appt) return;

        const startBase = parseISO(appt.start);
        const endBase = parseISO(appt.end);
        const duration = differenceInMinutes(endBase, startBase);

        const newStart = setMinutes(setHours(targetDate, targetHour), targetMin);
        const newEnd = addMinutes(newStart, duration);

        const updatedAppt = {
            ...appt,
            start: formatISO(newStart),
            end: formatISO(newEnd),
            therapistId: targetTherapistId || appt.therapistId
        };

        // Optimistic UI update
        setAppointments(prev => prev.map(a => a.id === draggedApptId ? (updatedAppt as Appointment) : a));
        setDraggedApptId(null);

        // API call
        await updateAppointment(updatedAppt as Appointment);
    };

    const isMultiDay = effectiveMode !== 'TODAY_MULTI';
    const columns = !isMultiDay ? therapists : days;

    // Configuración dinámica de columnas
    // Forzamos 100% para que el navegador intente ajustar las columnas al ancho disponible
    const gridStyle = {
        display: 'grid',
        gridTemplateColumns: `${timeColWidth}px repeat(${columns.length}, minmax(0, 1fr))`,
        minWidth: '100%',
        gap: !isMultiDay ? '4px' : '2px'
    };

    const patientCache = useMemo(() => new Map(patients.map(p => [p.id, p])), [patients]);

    return (
        <div className={`calendar-page-layout ${initialMode ? 'embedded-mode' : ''} ${isRole('THERAPIST') && !initialMode ? 'therapist-mode' : ''}`}>
            {/* Si no estamos integrados y NO somos terapeutas viendo su propia agenda forzada, mostrar panel izquierdo */}
            {!initialMode && isRole('ADMIN') && (
                <div className="calendar-left-sidebar">
                    <div className="sidebar-top-nav">
                        <button onClick={() => navigate('/dashboard')} className="calendar-back-btn-top" title="Volver al inicio">
                            <ArrowLeft size={16} /> <span>Inicio</span>
                        </button>
                    </div>

                    <div className="mini-calendar-sidebar-section">
                        <div className="mini-calendar-header">
                            <h4 className="mini-calendar-month-name">
                                {format(miniCalendarDate, 'MMMM yyyy', { locale: es })}
                            </h4>
                            <div className="mini-calendar-nav-btns">
                                <button onClick={() => setMiniCalendarDate(subMonths(miniCalendarDate, 1))} className="mini-nav-btn">
                                    <ChevronLeft size={14} />
                                </button>
                                <button onClick={() => setMiniCalendarDate(addMonths(miniCalendarDate, 1))} className="mini-nav-btn">
                                    <ChevronRight size={14} />
                                </button>
                            </div>
                        </div>
                        <div className="mini-calendar-grid">
                            {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(d => (
                                <div key={d} className="mini-calendar-weekday">{d}</div>
                            ))}
                            {(() => {
                                const monthStart = startOfMonth(miniCalendarDate);
                                const monthEnd = endOfMonth(monthStart);
                                const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
                                const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });
                                return eachDayOfInterval({ start: startDate, end: endDate }).map((day, idx) => (
                                    <div
                                        key={idx}
                                        className={`mini-calendar-day 
                                            ${!isSameMonth(day, monthStart) ? 'outside' : ''} 
                                            ${isSameDay(day, currentDate) ? 'selected' : ''} 
                                            ${isSameDay(day, new Date()) ? 'today' : ''}`}
                                        onClick={() => setCurrentDate(day)}
                                    >
                                        {format(day, 'd')}
                                    </div>
                                ));
                            })()}
                        </div>
                    </div>

                    <div className="calendar-compact-filters">
                        <div className="calendar-search-wrapper-compact">
                            <Search className="calendar-search-icon" size={14} />
                            <input
                                type="text"
                                placeholder="Filtrar profesionales..."
                                className="calendar-search-input-compact"
                                value={therapistSearch}
                                onChange={e => setTherapistSearch(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="calendar-therapist-list">
                        <div
                            className={`calendar-therapist-item master-toggle ${isAllSelected ? 'selected' : ''}`}
                            onClick={handleToggleAll}
                        >
                            <div className="calendar-checkbox-wrapper">
                                <input
                                    type="checkbox"
                                    ref={masterCheckboxRef}
                                    checked={isAllSelected}
                                    readOnly
                                    className="calendar-checkbox"
                                    onClick={e => e.stopPropagation()}
                                    onChange={handleToggleAll}
                                />
                            </div>
                            <div className="calendar-master-avatar shadow-sm">
                                <User size={16} className="text-gray-500" />
                            </div>
                            <div className="calendar-therapist-info">
                                <div className="calendar-therapist-name font-bold">Todos los profesionales</div>
                                <div className="calendar-therapist-spec text-[11px] text-gray-500">
                                    {isAllSelected ? 'Todos seleccionados' : isSomeSelected ? 'Selección parcial' : 'Ninguno seleccionado'}
                                </div>
                            </div>
                        </div>

                        {filteredTherapistList.map(t => {
                            const isSelected = selectedTherapistIds.includes(t.id);
                            return (
                                <div
                                    key={t.id}
                                    className={`calendar-therapist-item ${isSelected ? 'selected' : ''}`}
                                    onClick={() => {
                                        if (isSelected) {
                                            setSelectedTherapistIds(prev => prev.filter(id => id !== t.id));
                                        } else {
                                            setSelectedTherapistIds(prev => [...prev, t.id]);
                                        }
                                    }}
                                >
                                    <div className="calendar-checkbox-wrapper">
                                        <input
                                            type="checkbox"
                                            checked={isSelected}
                                            readOnly
                                            className="calendar-checkbox"
                                            onClick={e => e.stopPropagation()}
                                            onChange={() => {
                                                if (isSelected) setSelectedTherapistIds(prev => prev.filter(id => id !== t.id));
                                                else setSelectedTherapistIds(prev => [...prev, t.id]);
                                            }}
                                        />
                                    </div>
                                    <img src={getIllustrativeAvatar(t)} alt={t.fullName} className="calendar-therapist-avatar" />
                                    <div className="calendar-therapist-info">
                                        <div className="calendar-therapist-name" title={t.fullName}>{t.fullName}</div>
                                        <div className="calendar-therapist-spec" title={t.specialty || ''}>{t.specialty || 'Terapeuta'}</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            <div className={`calendar-container ${initialMode ? 'embedded-mode' : ''}`} style={isEmbedded ? { flex: '0 0 auto', minHeight: 0, minWidth: 0 } : {}}>
                <div className="calendar-controls-wrapper">
                    <div className="calendar-nav-toolbar">
                        <div className="calendar-nav-left">
                            <h2 className="current-view-label uppercase text-sm tracking-wider text-gray-800 font-extrabold max-w-[200px] text-left truncate">
                                {effectiveMode === 'TODAY_MULTI'
                                    ? format(currentDate, "eeee, d MMMM yyyy", { locale: es })
                                    : `SEMANA: ${format(weekStart, "d MMM", { locale: es })} - ${format(weekEnd, "d MMM", { locale: es })}`
                                }
                            </h2>
                            <div className="calendar-nav-controls">
                                <button className="nav-btn-arrow" onClick={prevPeriod} title="Anterior"><ChevronLeft size={20} /></button>
                                <button className="nav-btn-today" onClick={goToToday}>Hoy</button>
                                <button className="nav-btn-arrow" onClick={nextPeriod} title="Siguiente"><ChevronRight size={20} /></button>
                            </div>
                        </div>

                        {!initialMode && (
                            <div className="calendar-actions flex items-center gap-4">
                                {isRole('ADMIN') && (
                                    <div className="calendar-view-toggle">
                                        {selectedTherapistIds.length === 0 && isRole('ADMIN') && viewMode === 'week' && (
                                            <div className="absolute top-[-30px] right-0 bg-red-100 text-red-700 px-3 py-1 rounded text-xs animate-bounce shadow">
                                                Selecciona un terapeuta a la izquierda
                                            </div>
                                        )}
                                        <button
                                            className={`view-toggle-btn ${viewMode === 'day' ? 'active' : ''}`}
                                            onClick={() => setViewMode('day')}
                                        >DÍA</button>
                                        <button
                                            className={`view-toggle-btn ${viewMode === 'week' ? 'active' : ''}`}
                                            onClick={() => {
                                                if (selectedTherapistIds.length === 0) {
                                                    showToast('Selecciona al menos un terapeuta a la izquierda para ver su vista semanal', 'info');
                                                }
                                                setViewMode('week');
                                            }}
                                        >SEMANA</button>
                                    </div>
                                )}

                                <button className="calendar-btn-pill calendar-btn-secondary" onClick={() => findGaps(radarRange, effectiveTherapistId || 'all')} style={{ display: 'flex', alignItems: 'center', gap: '6px' }} title="Buscar huecos disponibles en la agenda">
                                    <Puzzle size={16} /> Radar Huecos
                                </button>
                                {isRole('ADMIN') && (
                                    <button
                                        className="calendar-btn-pill calendar-btn-primary"
                                        onClick={() => {
                                            // Mantenemos el día en el que está el usuario en el calendario
                                            setViewMode('day');
                                            // Asegurar que se seleccionen todas las terapeutas para que aparezcan sus columnas
                                            setSelectedTherapistIds(therapists.map(t => t.id));
                                            handleOpenModal(undefined, undefined, currentDate);
                                        }}
                                        style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                                    >
                                        <Plus size={16} /> Nueva Cita
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                <div className={`calendar-grid-wrapper h-full overflow-hidden flex flex-col bg-white ${isEmbedded ? 'flex-1 border border-gray-200 rounded-xl shadow-sm' : ''}`} style={isEmbedded ? { minHeight: '0' } : {}}>
                    <div ref={gridRef} className="calendar-main-grid flex-1 overflow-y-auto" style={{ ...gridStyle, scrollbarGutter: 'stable', height: '100%' }}>
                        {/* --- HEADER ROW (Sticky) --- */}
                        <div className="weekly-header-cell"
                            style={{
                                gridColumn: '1',
                                position: 'sticky',
                                top: 0,
                                left: 0,
                                zIndex: 115,
                                backgroundColor: 'white',
                                borderBottom: '1px solid #e2e8f0',
                                borderRight: '1px solid #e2e8f0',
                                height: isEmbedded ? '60px' : '70px',
                                borderTopLeftRadius: isEmbedded ? '0.75rem' : '0'
                            }}>
                            {effectiveMode === 'WEEKLY_SINGLE' && (
                                <div
                                    style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        height: '100%',
                                        padding: '2px',
                                        cursor: onEditTherapist ? 'pointer' : 'default'
                                    }}
                                    onClick={() => {
                                        if (onEditTherapist && effectiveTherapistId) {
                                            const t = therapists.find(t => t.id === effectiveTherapistId);
                                            if (t) onEditTherapist(t);
                                        }
                                    }}
                                    className={onEditTherapist ? 'header-link-hover' : ''}
                                    title="Ver ficha y horario"
                                >
                                    {effectiveTherapistId && therapists.some(t => t.id === effectiveTherapistId) ? (
                                        <span style={{
                                            fontSize: isEmbedded ? '11px' : '13px',
                                            fontWeight: '800',
                                            color: '#334155',
                                            textTransform: 'uppercase'
                                        }}>
                                            {therapists.find(t => t.id === effectiveTherapistId)?.fullName.split(' ')[0]}
                                        </span>
                                    ) : (
                                        <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 'bold' }}>
                                            {isRole('ADMIN') ? 'Equipo' : 'Tú'}
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>

                        {columns.map((col, i) => {
                            const isTherapist = effectiveMode === 'TODAY_MULTI';
                            const therapist = isTherapist ? (col as Therapist) : null;
                            const therapistColor = therapist?.color || '#3b82f6';

                            return (
                                <div key={`header-${i}`} className="header-cell relative flex flex-col items-center" style={{
                                    gridColumn: `${i + 2}`,
                                    position: 'sticky',
                                    top: 0,
                                    zIndex: 110,
                                    height: isEmbedded ? '50px' : '70px',
                                    padding: '2px 0',
                                    textAlign: 'center',
                                    backgroundColor: 'white',
                                    ...(isTherapist
                                        ? {
                                            borderTopLeftRadius: '12px',
                                            borderTopRightRadius: '12px',
                                            border: `1px solid ${therapistColor}40`,
                                            boxShadow: `inset 0 -2px 0 ${therapistColor}20`,
                                            background: `linear-gradient(to bottom, white, ${therapistColor}08)`
                                        }
                                        : { backgroundColor: 'white', borderBottom: '1px solid #e2e8f0' })
                                }}>
                                    {isTherapist ? (
                                        <div className="therapist-col-header">
                                            <div className="therapist-avatar-wrapper shadow-sm" style={{ width: '32px', height: '32px', backgroundColor: 'white', borderRadius: '50%' }}>
                                                <img
                                                    src={getIllustrativeAvatar(therapist!)}
                                                    alt={therapist?.fullName || 'Terapeuta'}
                                                    className="therapist-header-avatar"
                                                    style={{ border: 'none', width: '100%', height: '100%', borderRadius: '50%' }}
                                                />
                                            </div>
                                            <span className="therapist-name-label">
                                                {(therapist?.fullName || 'Terapeuta').split(' ')[0]} {(therapist?.fullName || '').split(' ')[1] || ''}
                                            </span>
                                        </div>
                                    ) : (
                                        <div className={`day-col-header ${isSameDay(col as Date, new Date()) ? 'today' : ''} flex flex-row items-center justify-center gap-1 h-full`}>
                                            <span className="day-name font-bold text-[11px] uppercase text-gray-500">
                                                {format(col as Date, 'EEE', { locale: es })}
                                            </span>
                                            <span className={`day-number font-black text-[13px] ${isSameDay(col as Date, new Date()) ? 'bg-[#e07a5f] text-white rounded-md px-1' : 'text-gray-800'}`}>
                                                {format(col as Date, 'd')}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        {/* --- BODY COLUMNS (Row 2) --- */}
                        <div className="time-column flex flex-col bg-white" style={{ gridRow: '2', gridColumn: '1', position: 'sticky', left: 0, zIndex: 90, borderRight: '1px solid #e2e8f0' }}>
                            {dynamicHours.map((h: number) => (
                                <div key={h} id={`time-row-${h}`} className="time-cell-group flex flex-col items-center justify-start" style={{ height: `${slotHeight}px`, padding: isEmbedded ? '4px 0' : '6px 0' }}>
                                    <div className="font-semibold text-gray-500 text-[11px] w-full text-center">{h}:00</div>
                                    {!isEmbedded && (
                                        <div className="font-medium text-gray-400 text-[10px] w-full text-center mt-auto">{h}:30</div>
                                    )}
                                </div>
                            ))}
                        </div>

                        {columns.map((col, i) => (
                            <div key={`col-${i}`} className={`day-column ${i >= columns.length - 2 ? 'day-column-last' : ''}`} style={{ gridRow: '2', gridColumn: `${i + 2}` }}>
                                {/* Current Time Line Indicator */}
                                {((effectiveMode === 'TODAY_MULTI' && isSameDay(currentDate, new Date())) ||
                                    (effectiveMode === 'WEEKLY_SINGLE' && isSameDay(col as Date, new Date()))) &&
                                    (currentTime.getHours() >= (dynamicHours[0] || 8) && currentTime.getHours() <= (dynamicHours[dynamicHours.length - 1] || 21)) && (
                                        <div
                                            className="current-time-line"
                                            style={{
                                                top: `${(currentTime.getHours() - (dynamicHours[0] || 8)) * slotHeight + (currentTime.getMinutes() / 60) * slotHeight}px`
                                            }}
                                        >
                                            {(i === 0 || effectiveMode === 'WEEKLY_SINGLE') && <div className="line-ball" />}
                                        </div>
                                    )}
                                {/* Slots clicables de fondo interactivos para Drag & Drop */}
                                {dynamicHours.map((h: number) => {
                                    const date = effectiveMode === 'TODAY_MULTI' ? currentDate : (col as Date);
                                    const tId = effectiveMode === 'TODAY_MULTI'
                                        ? (col as Therapist).id
                                        : (effectiveTherapistId || (selectedTherapistIds.length === 1 ? selectedTherapistIds[0] : undefined));
                                    const enabled = isSlotEnabled(date, h, tId);

                                    return (
                                        <div key={h} className="relative w-full" style={{ height: `${slotHeight}px` }}>
                                            {/* 00-30 Slot */}
                                            <div
                                                className={`grid-slot-half ${!enabled ? 'slot-disabled' : ''}`}
                                                onClick={() => handleOpenModal(undefined, tId, setMinutes(setHours(date, h), 0), !enabled)}
                                                onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }}
                                                onDragLeave={e => e.currentTarget.classList.remove('drag-over')}
                                                onDrop={e => { e.currentTarget.classList.remove('drag-over'); handleDrop(e, date, h, 0, tId); }}
                                            />
                                            {/* 30-60 Slot */}
                                            <div
                                                className={`grid-slot-half solid-border ${!enabled ? 'slot-disabled' : ''}`}
                                                onClick={() => handleOpenModal(undefined, tId, setMinutes(setHours(date, h), 30), !enabled)}
                                                onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }}
                                                onDragLeave={e => e.currentTarget.classList.remove('drag-over')}
                                                onDrop={e => { e.currentTarget.classList.remove('drag-over'); handleDrop(e, date, h, 30, tId); }}
                                            />
                                        </div>
                                    );
                                })}

                                {absences
                                    .filter((a: any) => {
                                        if (effectiveTherapistId) {
                                            if (a.therapist_id !== effectiveTherapistId) return false;
                                        } else {
                                            if (!selectedTherapistIds.includes(a.therapist_id)) return false;
                                        }
                                        if (effectiveMode === 'TODAY_MULTI') {
                                            return a.therapist_id === (col as Therapist).id;
                                        }
                                        return true;
                                    })
                                    .filter((a: any) => {
                                        const colDate = effectiveMode === 'TODAY_MULTI' ? currentDate : (col as Date);
                                        const start = startOfDay(parseISO(a.start_time));
                                        const end = endOfDay(a.end_time ? parseISO(a.end_time) : start);
                                        return colDate >= start && colDate <= end;
                                    })
                                    .map((a: any) => {
                                        const start = parseISO(a.start_time);
                                        const end = a.end_time ? parseISO(a.end_time) : addHours(start, 24);

                                        let pos = getAppointmentPosition(a.start_time, end.toISOString());
                                        const topVal = parseInt(pos.top);
                                        if (topVal < 0) {
                                            const heightVal = parseInt(pos.height) + topVal;
                                            pos = { ...pos, top: '0px', height: `${Math.max(40, heightVal)}px` };
                                        }

                                        const isHoliday = a.type === 'holiday';
                                        const isVacation = a.type === 'vacation';
                                        const isSick = a.type === 'sick_leave';

                                        let bgColor = 'repeating-linear-gradient(45deg, #f3f4f6, #f3f4f6 10px, #e5e7eb 10px, #e5e7eb 20px)';
                                        let borderColor = '#d1d5db';
                                        let textColor = '#6b7280';

                                        if (isHoliday) {
                                            bgColor = 'repeating-linear-gradient(45deg, #fef3c7, #fef3c7 10px, #fde68a 10px, #fde68a 20px)';
                                            borderColor = '#f59e0b';
                                            textColor = '#92400e';
                                        } else if (isVacation) {
                                            bgColor = 'repeating-linear-gradient(45deg, #e0f2fe, #e0f2fe 10px, #bae6fd 10px, #bae6fd 20px)';
                                            borderColor = '#0ea5e9';
                                            textColor = '#075985';
                                        } else if (isSick) {
                                            bgColor = 'repeating-linear-gradient(45deg, #fee2e2, #fee2e2 10px, #fecaca 10px, #fecaca 20px)';
                                            borderColor = '#ef4444';
                                            textColor = '#991b1b';
                                        }

                                        return (
                                            <div
                                                key={a.id}
                                                className="absence-block"
                                                style={{
                                                    ...pos,
                                                    position: 'absolute',
                                                    left: 0,
                                                    right: 0,
                                                    zIndex: 1,
                                                    background: bgColor,
                                                    border: `1px solid ${borderColor}`,
                                                    borderRadius: '4px',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    padding: '4px',
                                                    overflow: 'hidden'
                                                }}
                                            >
                                                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: textColor }}>
                                                    {isVacation ? 'Vacaciones' : isHoliday ? 'Festivo' : 'Baja Médica'}
                                                </span>
                                                {a.notes && <span className="text-[9px] truncate w-full text-center opacity-80" style={{ color: textColor }}>{a.notes}</span>}
                                            </div>
                                        );
                                    })
                                }

                                {filteredAppointments
                                    .filter(appt => {
                                        if (effectiveMode === 'TODAY_MULTI') {
                                            return isSameDay(parseISO(appt.start), currentDate) && appt.therapistId === (col as Therapist).id;
                                        } else {
                                            return isSameDay(parseISO(appt.start), col as Date);
                                        }
                                    })
                                    .sort((a, b) => parseISO(a.start).getTime() - parseISO(b.start).getTime())
                                    .reduce((acc: { raw: Appointment[], rendered: any[] }, appt) => {
                                        // 1. First, group connected appointments (clusters)
                                        const apptInCluster = acc.raw.filter((a: Appointment) => {
                                            const aStart = setSeconds(setMilliseconds(parseISO(a.start), 0), 0).getTime();
                                            const aEnd = setSeconds(setMilliseconds(parseISO(a.end), 0), 0).getTime();
                                            const bStart = setSeconds(setMilliseconds(parseISO(appt.start), 0), 0).getTime();
                                            const bEnd = setSeconds(setMilliseconds(parseISO(appt.end), 0), 0).getTime();

                                            // Solapamiento real (con margen de 1 segundo para evitar bordes exactos de citas consecutivas)
                                            return bStart < (aEnd - 1000) && (aStart + 1000) < bEnd;
                                        });

                                        // 2. Determine column for this appointment
                                        let colIndex = 0;
                                        const occupiedCols = new Set();
                                        apptInCluster.forEach(other => {
                                            if (other.colIndex !== undefined) occupiedCols.add(other.colIndex);
                                        });
                                        while (occupiedCols.has(colIndex)) colIndex++;

                                        // 3. Keep track of maximum columns in this specific "moment"
                                        // To simplify, we'll re-calculate totalCols for all in cluster later if needed,
                                        // but a simpler way is to just use the current max overlap in that instant.
                                        const newAppt = { ...appt, colIndex };
                                        acc.raw.push(newAppt);
                                        return acc;
                                    }, { raw: [] as any[] }).raw
                                    .map((appt: any, _idx: number, all: any[]) => {
                                        // 4. For each appointment, find how many TOTAL columns are needed in its "vicinity"
                                        const overlapping = all.filter(other => {
                                            const aStart = setSeconds(setMilliseconds(parseISO(appt.start), 0), 0).getTime();
                                            const aEnd = setSeconds(setMilliseconds(parseISO(appt.end), 0), 0).getTime();
                                            const bStart = setSeconds(setMilliseconds(parseISO(other.start), 0), 0).getTime();
                                            const bEnd = setSeconds(setMilliseconds(parseISO(other.end), 0), 0).getTime();

                                            // Solapamiento REAL: uno empieza antes de que el otro termine (con margen de 1 min)
                                            return bStart < (aEnd - 1000) && (aStart + 1000) < bEnd;
                                        });
                                        // El número real de columnas es el colIndex más alto de los que se solapan + 1
                                        const totalCols = Math.max(1, ...overlapping.map(o => (o.colIndex || 0) + 1));

                                        const pos = getAppointmentPosition(appt.start, appt.end);

                                        // Calculamos el ancho y posición horizontal exacta
                                        // Si no hay solapamientos reales, forzamos 100%
                                        const isReallyOverlapping = overlapping.length > 1;
                                        const widthPct = isReallyOverlapping ? (100 / totalCols) : 100;
                                        const leftPct = isReallyOverlapping ? (appt.colIndex * widthPct) : 0;

                                        // DOCTORALIA PASTEL COLOR MAPPING STANDARD (Softer, better contrast)
                                        const statusStyles: Record<string, { bg: string, border: string, text: string }> = {
                                            'Programada': { bg: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8' },       // Pastel blue
                                            'En Sesión': { bg: '#ecfdf5', border: '#a7f3d0', text: '#047857' },        // Pastel mint green
                                            'Finalizada': { bg: '#fefce8', border: '#fde047', text: '#a16207' },       // Pastel yellow
                                            'Cobrada': { bg: '#fefce8', border: '#fde047', text: '#a16207' },          // Pastel yellow
                                            'Cancelada': { bg: '#fef2f2', border: '#fecaca', text: '#b91c1c' },        // Pastel red
                                            'Ausente': { bg: '#f8fafc', border: '#e2e8f0', text: '#334155' },          // Pastel gray
                                            'Bloqueada': { bg: '#f1f5f9', border: '#cbd5e1', text: '#475569' },        // Sober gray
                                        };

                                        const styleConfig = statusStyles[appt.status] || statusStyles['Programada'];

                                        const durationMins = (parseISO(appt.end).getTime() - parseISO(appt.start).getTime()) / 60000;
                                        const isShortBlock = durationMins <= 30;

                                        const pData = patientCache.get(appt.patientId);

                                        const hasDiary = !!appt.sessionDiary;
                                        const isPaid = !!appt.isPaid;
                                        const needsDiary = appt.status === 'Finalizada' || appt.status === 'Cobrada';
                                        const apptTherapist = therapists.find(t => t.id === appt.therapistId);

                                        return (
                                            <div
                                                key={appt.id}
                                                draggable
                                                onDragStart={(e) => handleDragStart(e, appt.id)}
                                                onDragEnd={handleDragEnd}
                                                className={`appointment-block ${appt.status === 'Bloqueada' ? 'status-blocked' : ''}`}
                                                style={{
                                                    top: pos.top,
                                                    height: pos.height,
                                                    left: `${leftPct}%`,
                                                    width: `${widthPct}%`,
                                                    backgroundColor: styleConfig.bg,
                                                    borderColor: styleConfig.border,
                                                    color: styleConfig.text,
                                                    zIndex: 10 + appt.colIndex,
                                                    boxShadow: appt.totalCols > 1 ? '-1px 0 4px rgba(0,0,0,0.05)' : '0 1px 3px rgba(0,0,0,0.05)',
                                                    borderRadius: isShortBlock ? '0.5rem' : '0.75rem',
                                                    padding: isShortBlock ? '0.15rem 0.35rem' : (totalCols > 1 ? '0.25rem' : '0.35rem 0.5rem'),
                                                    minHeight: '24px'
                                                }}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleOpenModal(appt);
                                                }}
                                            >
                                                <div className="appt-icon-tray">
                                                    {appt.status === 'Programada' && <ClockIcon size={12} />}
                                                    {appt.status === 'En Sesión' && <Rocket size={12} />}
                                                    {(appt.status === 'Finalizada' || appt.status === 'Cobrada') && <DollarSign size={12} />}
                                                    {appt.status === 'Cancelada' && <AlertTriangle size={12} />}
                                                    {appt.status === 'Ausente' && <User size={12} />}
                                                    {appt.status === 'Bloqueada' && <Info size={12} />}
                                                </div>
                                                <div className="appt-block-content">
                                                    <div className="appt-block-header">
                                                        {effectiveMode === 'WEEKLY_SINGLE' && apptTherapist && (
                                                            <div className="appt-inner-avatar" title={apptTherapist.fullName} style={{ backgroundColor: 'white' }}>
                                                                <img src={getIllustrativeAvatar(apptTherapist)} alt={apptTherapist.fullName} />
                                                            </div>
                                                        )}
                                                        <div className="appt-patient-name" style={{ color: styleConfig.text }}>
                                                            {appt.status === 'Bloqueada' ? (appt.patientName || 'HORARIO BLOQUEADO') : appt.patientName}
                                                            {isPaid && <span className="appt-paid-badge" title="Cita Cobrada">€</span>}
                                                        </div>
                                                    </div>
                                                    <div className="appt-time-type">
                                                        <span>{format(parseISO(appt.start), 'HH:mm')}-{format(parseISO(appt.end), 'HH:mm')} | {apptTherapist?.fullName?.split(' ')[0] || 'T'}</span>
                                                        <div style={{ marginLeft: 'auto', display: 'flex', gap: '4px' }}>
                                                            {needsDiary && !hasDiary && <AlertTriangle size={12} style={{ color: '#ef4444' }} />}
                                                            {!isPaid && (appt.status === 'Finalizada' || appt.status === 'Ausente') && <DollarSign size={12} style={{ color: '#ef4444' }} />}
                                                        </div>
                                                    </div>
                                                    <div className="appt-service-type" style={{
                                                        fontSize: totalCols > 1 ? '0.6rem' : '0.65rem',
                                                        opacity: 0.9
                                                    }}>
                                                        {appt.type}
                                                    </div>
                                                </div>

                                                {/* Hover Tooltip flotante mejorado */}
                                                <div className="appt-hover-tooltip">
                                                    <div className="tooltip-arrow"></div>
                                                    <div className="tooltip-title">{appt.status === 'Bloqueada' ? 'Horario Bloqueado' : appt.patientName}</div>
                                                    {appt.status !== 'Bloqueada' && (
                                                        <>
                                                            <div className="tooltip-detail"><User size={12} /> Tel: <b>{pData?.phone || 'No registrado'}</b></div>
                                                            <div className="tooltip-detail">
                                                                <ClockIcon size={12} /> Recordatorio:
                                                                <b style={{ color: appt.notificacionRecordatorioEnviada ? '#059669' : '#dc2626', marginLeft: '4px' }}>
                                                                    {appt.notificacionRecordatorioEnviada ? 'Enviado' : 'No enviado'}
                                                                </b>
                                                            </div>
                                                            <div className="tooltip-detail">
                                                                <Plus size={12} /> Próxima:
                                                                <b style={{ marginLeft: '4px' }}>
                                                                    {appointments
                                                                        .filter(a => a.patientId === appt.patientId && isAfter(parseISO(a.start), parseISO(appt.start)))
                                                                        .sort((a, b) => parseISO(a.start).getTime() - parseISO(b.start).getTime())[0]
                                                                        ? format(parseISO(appointments
                                                                            .filter(a => a.patientId === appt.patientId && isAfter(parseISO(a.start), parseISO(appt.start)))
                                                                            .sort((a, b) => parseISO(a.start).getTime() - parseISO(b.start).getTime())[0].start), "d 'de' MMM, HH:mm", { locale: es })
                                                                        : 'No hay más esta semana'
                                                                    }
                                                                </b>
                                                            </div>
                                                            <div className="tooltip-badge">{appt.type}</div>
                                                        </>
                                                    )}
                                                    {appt.status === 'Bloqueada' && <div className="tooltip-badge">Bloqueo</div>}
                                                </div>
                                            </div>
                                        );
                                    })
                                }
                            </div>
                        ))}
                    </div>
                </div>
            </div>



            {isModalOpen && selectedAppt && (
                <div className="modal-overlay" onClick={() => { setIsModalOpen(false); setIsCancelling(false); }}>
                    <div className="modal-content appointment-modal-narrow" onClick={e => e.stopPropagation()}>
                        {isCancelling ? (
                            <div style={{ padding: '1.5rem' }}>
                                <div className="modal-header" style={{ marginBottom: '1.25rem', borderBottom: 'none' }}>
                                    <h3 style={{ color: '#b91c1c', display: 'flex', alignItems: 'center', gap: '0.75rem', margin: 0 }}>
                                        <AlertTriangle size={24} /> Anular Cita
                                    </h3>
                                    <button className="btn-icon-round" onClick={() => { setIsModalOpen(false); setIsCancelling(false); }}><X size={20} /></button>
                                </div>

                                <div className="space-y-4">
                                    {/* Selector de Responsable */}
                                    <div className="form-group">
                                        <label style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem', display: 'block' }}>
                                            Responsable de la anulación
                                        </label>
                                        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
                                            <button
                                                type="button"
                                                onClick={() => setCancelType('patient')}
                                                style={{
                                                    flex: 1, padding: '0.75rem', borderRadius: '12px', border: '2px solid',
                                                    borderColor: cancelType === 'patient' ? '#b91c1c' : '#eee',
                                                    backgroundColor: cancelType === 'patient' ? '#fef2f2' : 'white',
                                                    color: cancelType === 'patient' ? '#b91c1c' : '#64748b',
                                                    fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', transition: 'all 0.2s'
                                                }}
                                            >
                                                Paciente
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setCancelType('internal')}
                                                style={{
                                                    flex: 1, padding: '0.75rem', borderRadius: '12px', border: '2px solid',
                                                    borderColor: cancelType === 'internal' ? '#475569' : '#eee',
                                                    backgroundColor: cancelType === 'internal' ? '#f8fafc' : 'white',
                                                    color: cancelType === 'internal' ? '#475569' : '#64748b',
                                                    fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', transition: 'all 0.2s'
                                                }}
                                            >
                                                Error de gestión
                                            </button>
                                        </div>
                                    </div>

                                    {/* Selector de Plazo (Solo si es Paciente) */}
                                    {cancelType === 'patient' && (
                                        <div className="form-group" style={{ marginBottom: '1rem' }}>
                                            <label style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem', display: 'block' }}>
                                                Política de Cancelación
                                            </label>
                                            <div style={{ display: 'flex', gap: '0.75rem' }}>
                                                <button
                                                    type="button"
                                                    onClick={() => setCancelSubtype('standard')}
                                                    style={{
                                                        flex: 1, padding: '0.75rem', borderRadius: '12px', border: '2px solid',
                                                        borderColor: cancelSubtype === 'standard' ? '#059669' : '#eee',
                                                        backgroundColor: cancelSubtype === 'standard' ? '#ecfdf5' : 'white',
                                                        color: cancelSubtype === 'standard' ? '#059669' : '#64748b',
                                                        fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer'
                                                    }}
                                                >
                                                    En plazo (&gt;24h)
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setCancelSubtype('late')}
                                                    style={{
                                                        flex: 1, padding: '0.75rem', borderRadius: '12px', border: '2px solid',
                                                        borderColor: cancelSubtype === 'late' ? '#e11d48' : '#eee',
                                                        backgroundColor: cancelSubtype === 'late' ? '#fff1f2' : 'white',
                                                        color: cancelSubtype === 'late' ? '#e11d48' : '#64748b',
                                                        fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer'
                                                    }}
                                                >
                                                    FUERA PLAZO (&lt;24h)
                                                </button>
                                            </div>
                                            {cancelSubtype === 'late' && (
                                                <p style={{ margin: '0.75rem 0 0 0', fontSize: '0.75rem', color: '#e11d48', fontWeight: 600 }}>
                                                    * Se marcará como "Ausente". El paciente deberá abonar la sesión.
                                                </p>
                                            )}
                                        </div>
                                    )}

                                    <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                                        <label style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem', display: 'block' }}>
                                            Motivo detallado
                                        </label>
                                        <textarea
                                            autoFocus
                                            className="custom-textarea"
                                            value={tempCancelReason}
                                            onChange={e => setTempCancelReason(e.target.value)}
                                            style={{
                                                width: '100%', minHeight: '100px', padding: '1rem', borderRadius: '12px',
                                                border: '2px solid #eee', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box',
                                                fontFamily: 'inherit'
                                            }}
                                            placeholder="Detalla el motivo aquí..."
                                        />
                                    </div>

                                    <div className="modal-footer" style={{ borderTop: '1px solid #eee', paddingTop: '1.5rem', marginTop: '0.5rem' }}>
                                        <button
                                            type="button" className="btn-secondary"
                                            onClick={() => setIsCancelling(false)}
                                            style={{ minWidth: '100px' }}
                                        >
                                            Volver
                                        </button>
                                        <button
                                            type="button" className="btn-danger"
                                            onClick={confirmCancellation}
                                            style={{ minWidth: '180px', backgroundColor: cancelSubtype === 'late' && cancelType === 'patient' ? '#e11d48' : '#b91c1c', color: 'white' }}
                                        >
                                            {cancelSubtype === 'late' && cancelType === 'patient' ? 'Confirmar y Cobrar' : 'Confirmar Anulación'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className="modal-header">
                                    <h3>{selectedAppt.id ? 'Detalles de la Cita' : 'Nueva Cita'}</h3>
                                    <button className="btn-icon-round" onClick={() => { setIsModalOpen(false); setIsCancelling(false); }}><X size={20} /></button>
                                </div>
                                <form className="modal-form" onSubmit={handleSave} id="appointment-form">
                                    <div className="form-grid">
                                        <div className="form-group" style={{ gridColumn: 'span 2' }}>
                                            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-dashed mb-2">
                                                <div className="flex items-center gap-2">
                                                    <div className={`p-2 rounded-lg ${selectedAppt.status === 'Bloqueada' ? 'bg-slate-200 text-slate-700' : 'bg-blue-50 text-blue-600'}`}>
                                                        <Puzzle size={18} />
                                                    </div>
                                                    <div>
                                                        <div className="text-sm font-bold">Bloquear este horario</div>
                                                        <div className="text-xs text-gray-500">Impide que se agenden citas en este bloque</div>
                                                    </div>
                                                </div>
                                                <label className="relative inline-flex items-center cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        className="sr-only peer"
                                                        checked={selectedAppt.status === 'Bloqueada'}
                                                        onChange={e => {
                                                            const isBlocked = e.target.checked;
                                                            setSelectedAppt({
                                                                ...selectedAppt,
                                                                status: isBlocked ? 'Bloqueada' : 'Programada',
                                                                patientId: isBlocked ? undefined : '',
                                                                patientName: isBlocked ? 'HORARIO BLOQUEADO' : '',
                                                                type: isBlocked ? 'Bloqueo' : 'Terapia'
                                                            });
                                                        }}
                                                    />
                                                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-slate-600"></div>
                                                </label>
                                            </div>
                                        </div>
                                        {selectedAppt.status !== ('Bloqueada' as any) && (
                                            <div className="form-group" style={{ position: 'relative' }}>
                                                <label><User size={12} className="mr-1" /> Paciente</label>
                                                <input
                                                    type="text"
                                                    placeholder="Buscar paciente..."
                                                    value={patientSearch}
                                                    required={selectedAppt.status !== ('Bloqueada' as any)}
                                                    onFocus={() => setShowPatientSuggestions(true)}
                                                    onBlur={() => setTimeout(() => setShowPatientSuggestions(false), 200)}
                                                    onChange={e => {
                                                        setPatientSearch(e.target.value);
                                                        setShowPatientSuggestions(true);
                                                        // Reset patientId if search doesn't match exactly
                                                        if (selectedAppt.patientId) {
                                                            setSelectedAppt({ ...selectedAppt, patientId: '', patientName: e.target.value });
                                                        }
                                                    }}
                                                    style={{ height: '36px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid #ddd', width: '100%', fontSize: '0.85rem' }}
                                                />
                                                {showPatientSuggestions && patientSearch && (
                                                    <div style={{
                                                        position: 'absolute',
                                                        top: '100%',
                                                        left: 0,
                                                        right: 0,
                                                        backgroundColor: 'white',
                                                        border: '1px solid #ddd',
                                                        borderRadius: '8px',
                                                        boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                                                        zIndex: 1000,
                                                        marginTop: '4px',
                                                        maxHeight: '200px',
                                                        overflowY: 'auto'
                                                    }}>
                                                        {patients
                                                            .filter(p => {
                                                                const fullName = `${p.firstName} ${p.lastName}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, ' ').trim();
                                                                const search = patientSearch.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, ' ').trim();
                                                                return fullName.includes(search);
                                                            })
                                                            .slice(0, 6)
                                                            .map(p => (
                                                                <div
                                                                    key={p.id}
                                                                    onClick={() => {
                                                                        setSelectedAppt({ ...selectedAppt, patientId: p.id, patientName: `${p.firstName} ${p.lastName}` });
                                                                        setPatientSearch(`${p.firstName} ${p.lastName}`);
                                                                        setShowPatientSuggestions(false);
                                                                    }}
                                                                    style={{
                                                                        padding: '0.5rem 0.75rem',
                                                                        cursor: 'pointer',
                                                                        fontSize: '0.85rem',
                                                                        borderBottom: '1px solid #f0f0f0'
                                                                    }}
                                                                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f8fafc'}
                                                                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                                                >
                                                                    <div style={{ fontWeight: 'bold', color: '#1e293b' }}>{p.firstName} {p.lastName}</div>
                                                                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{p.email || 'Sin email'}</div>
                                                                </div>
                                                            ))
                                                        }
                                                        {patientSearch && (
                                                            <div
                                                                onClick={() => handleOpenQuickPatientModal(patientSearch)}
                                                                style={{
                                                                    padding: '0.75rem',
                                                                    cursor: 'pointer',
                                                                    fontSize: '0.85rem',
                                                                    backgroundColor: '#f0f9ff',
                                                                    color: '#0369a1',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: '8px',
                                                                    fontWeight: '600',
                                                                    borderTop: '1px solid #bae6fd'
                                                                }}
                                                                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#e0f2fe'}
                                                                onMouseLeave={e => e.currentTarget.style.backgroundColor = '#f0f9ff'}
                                                            >
                                                                <UserPlus size={16} />
                                                                Crear nuevo: "{patientSearch}"
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        <div className="form-group" style={{ gridColumn: selectedAppt.status === 'Bloqueada' ? 'span 2' : 'auto' }}>
                                            <label><User size={12} className="mr-1" /> Terapeuta</label>
                                            <div className="flex items-center gap-2">
                                                <select
                                                    required
                                                    disabled={!isRole('ADMIN')}
                                                    value={selectedAppt.therapistId}
                                                    onChange={e => {
                                                        const t = therapists.find(th => th.id === e.target.value);
                                                        setSelectedAppt({ ...selectedAppt, therapistId: e.target.value, therapistName: t?.fullName || '' });
                                                    }}
                                                    style={{ flex: 1, height: '36px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid #ddd', fontSize: '0.85rem' }}
                                                >
                                                    <option value="">Seleccionar terapeuta...</option>
                                                    {(() => {
                                                        const available = getAvailableTherapists(selectedAppt.start, selectedAppt.end);
                                                        const singleTId = effectiveTherapistId || (selectedTherapistIds.length === 1 ? selectedTherapistIds[0] : undefined);
                                                        const filteredOptions = singleTId ? available.filter(t => t.id === singleTId) : available;
                                                        return filteredOptions.map(t => (
                                                            <option key={t.id} value={t.id}>{t.fullName}</option>
                                                        ));
                                                    })()}
                                                </select>
                                                {selectedAppt.therapistId && (
                                                    <div style={{ width: 28, height: 28, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, border: '1px solid #eee' }}>
                                                        <img
                                                            src={getIllustrativeAvatar(therapists.find(t => t.id === selectedAppt.therapistId)!)}
                                                            alt="Avatar"
                                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="form-row-3">
                                        <div className="form-group"><label>Fecha</label><input type="date" required value={getModalDate()} onChange={e => handleModalDateChange(e.target.value)} style={{ height: '36px', fontSize: '0.85rem' }} /></div>
                                        <div className="form-group"><label>Inicio</label><input type="time" required value={getModalStartTime()} onChange={e => handleModalTimeChange('start', e.target.value)} style={{ height: '36px', fontSize: '0.85rem' }} /></div>
                                        <div className="form-group"><label>Fin</label><input type="time" required value={getModalEndTime()} onChange={e => handleModalTimeChange('end', e.target.value)} style={{ height: '36px', fontSize: '0.85rem' }} /></div>
                                    </div>
                                    <div className="form-grid" style={{ gridTemplateColumns: selectedAppt.status !== 'Bloqueada' ? '1.5fr 1fr 1.2fr' : '1fr 1fr' }}>
                                        {selectedAppt.status !== 'Bloqueada' && (
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
                                                            type: s ? s.name : selectedAppt.type,
                                                            price: s ? s.price : undefined
                                                        });
                                                    }}
                                                    style={{ height: '36px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid #ddd', width: '100%', fontSize: '0.85rem' }}
                                                >
                                                    <option value="">Seleccionar...</option>
                                                    {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                                </select>
                                            </div>
                                        )}
                                        {selectedAppt.status !== 'Bloqueada' && (
                                            <div className="form-group">
                                                <label>Precio Sesión (€)</label>
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    min="0"
                                                    required
                                                    placeholder="Ej: 60.00"
                                                    value={selectedAppt.price !== undefined && selectedAppt.price !== null ? selectedAppt.price : ''}
                                                    onChange={e => {
                                                        const val = e.target.value;
                                                        setSelectedAppt({
                                                            ...selectedAppt,
                                                            price: val === '' ? undefined : Number(val)
                                                        });
                                                    }}
                                                    style={{ height: '36px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid #ddd', width: '100%', fontSize: '0.85rem' }}
                                                />
                                            </div>
                                        )}
                                        <div className="form-group" style={{ gridColumn: selectedAppt.status === 'Bloqueada' ? 'span 2' : 'auto' }}>
                                            <label>Estado</label>
                                            <select
                                                value={selectedAppt.status}
                                                onChange={e => {
                                                    const newStatus = e.target.value as any;
                                                    if (selectedAppt) {
                                                        setSelectedAppt({
                                                            ...selectedAppt,
                                                            status: newStatus,
                                                            patientName: newStatus === 'Bloqueada' ? (selectedAppt.patientName || 'HORARIO BLOQUEADO') : selectedAppt.patientName
                                                        });
                                                        if (selectedAppt.start) {
                                                            checkForWaitingListMatches(selectedAppt.start);
                                                        }
                                                    }
                                                }}
                                                style={{ height: '36px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid #ddd', width: '100%', fontSize: '0.85rem' }}
                                            >
                                                <option value="Programada">Programada</option>
                                                <option value="En Sesión">En Sesión</option>
                                                <option value="Finalizada">Finalizada</option>
                                                <option value="Cobrada">Cobrada</option>
                                                <option value="Cancelada">Cancelada</option>
                                                <option value="Ausente">Ausente</option>
                                                <option value="Bloqueada">🔒 Bloqueada</option>
                                            </select>
                                        </div>
                                        {selectedAppt.status === 'Bloqueada' && (
                                            <div className="form-group" style={{ gridColumn: 'span 2' }}>
                                                <label>Motivo del bloqueo / Título</label>
                                                <input
                                                    type="text"
                                                    value={selectedAppt.patientName || ''}
                                                    onChange={e => setSelectedAppt({ ...selectedAppt, patientName: e.target.value })}
                                                    placeholder="Ej: Reunión de equipo, Formación, Descanso..."
                                                    style={{ height: '36px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid #ddd', width: '100%', fontSize: '0.85rem' }}
                                                />
                                            </div>
                                        )}
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

                                    {(selectedAppt.status === 'Finalizada' || selectedAppt.status === 'Cobrada' || (selectedAppt.start && isAfter(new Date(), parseISO(selectedAppt.start)) && selectedAppt.status === 'Programada')) && (
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
                                                value={selectedAppt.sessionDiary || ''}
                                                onChange={e => {
                                                    const updates: any = { sessionDiary: e.target.value };
                                                    // Si escribe el diario y estaba en Programada, asumimos que se realizó
                                                    if (selectedAppt.status === 'Programada') {
                                                        updates.status = 'Finalizada';
                                                    }
                                                    setSelectedAppt({ ...selectedAppt, ...updates });
                                                }}
                                                placeholder="Escribe el progreso de la sesión..."
                                                rows={3}
                                                style={{ width: '100%', minHeight: '80px', padding: '0.75rem', borderRadius: '8px', border: '1px solid #ddd', fontFamily: 'inherit', fontSize: '0.875rem' }}
                                            />
                                        </div>
                                    )}

                                    {!selectedAppt.id && (
                                        <div className="recurrence-section p-3 bg-gray-50 rounded-xl border border-dashed mb-4">
                                            <label className="flex items-center gap-2 font-bold text-xs mb-3 text-secondary uppercase tracking-wider">
                                                <Puzzle size={14} /> Configuración de Recurrencia
                                            </label>

                                            <div className="day-selector flex gap-1 mb-2">
                                                {['L', 'M', 'X', 'J', 'V', 'S'].map((day, i) => {
                                                    const dayNum = i + 1;
                                                    const isSelected = selectedAppt.recurrence?.days?.includes(dayNum);
                                                    return (
                                                        <button
                                                            key={day}
                                                            type="button"
                                                            className={`day-btn ${isSelected ? 'active' : ''}`}
                                                            style={{ width: '28px', height: '28px', fontSize: '0.7rem' }}
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

                                            <div className="form-grid">
                                                <div className="form-group">
                                                    <label>Repetir (Semanas)</label>
                                                    <input
                                                        type="number"
                                                        min="1"
                                                        max="52"
                                                        disabled={!!selectedAppt.recurrence?.until}
                                                        placeholder="Nº"
                                                        value={selectedAppt.recurrence?.weeks || ''}
                                                        onChange={e => setSelectedAppt({
                                                            ...selectedAppt,
                                                            recurrence: { ...selectedAppt.recurrence, weeks: parseInt(e.target.value) || undefined, until: undefined }
                                                        })}
                                                        style={{ height: '34px', padding: '0 0.5rem', borderRadius: '6px', fontSize: '0.85rem' }}
                                                    />
                                                </div>
                                                <div className="form-group">
                                                    <label>O hasta fecha</label>
                                                    <input
                                                        type="date"
                                                        disabled={!!selectedAppt.recurrence?.weeks && selectedAppt.recurrence.weeks > 0}
                                                        value={selectedAppt.recurrence?.until || ''}
                                                        onChange={e => setSelectedAppt({
                                                            ...selectedAppt,
                                                            recurrence: { ...selectedAppt.recurrence, until: e.target.value, weeks: undefined }
                                                        })}
                                                        style={{ height: '34px', padding: '0 0.5rem', borderRadius: '6px', fontSize: '0.85rem' }}
                                                    />
                                                </div>
                                            </div>
                                            {(!selectedAppt.recurrence?.weeks && !selectedAppt.recurrence?.until) && (
                                                <p className="text-[10px] text-secondary mt-2 italic">Cita única si no se indica duración.</p>
                                            )}
                                        </div>
                                    )}

                                </form>

                                <div className="modal-footer">


                                    {selectedAppt?.id && selectedAppt.status !== 'Cancelada' && (
                                        <button
                                            type="button"
                                            className="btn-secondary"
                                            onClick={(e) => handleAnularCita(e)}
                                            style={{
                                                marginRight: 'auto',
                                                borderColor: '#fca5a5',
                                                color: '#b91c1c',
                                                backgroundColor: '#fef2f2',
                                                minWidth: '130px'
                                            }}
                                        >
                                            Anular Cita
                                        </button>
                                    )}
                                    <button type="button" className="btn-secondary" onClick={() => { setIsModalOpen(false); setIsCancelling(false); }}>Cancelar</button>
                                    <button type="submit" className="btn-primary" form="appointment-form">Guardar</button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {isRadarOpen && (
                <div className="modal-overlay">
                    <div className="modal-content no-padding flex-layout" style={{ maxWidth: '800px', width: '95%', height: '85vh', maxHeight: '85vh' }}>
                        <div className="modal-header" style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #eee', marginBottom: 0 }}>
                            <div className="flex items-center gap-2">
                                <Puzzle size={20} className="text-secondary" />
                                <h3 style={{ margin: 0 }}>Radar de Huecos</h3>
                            </div>
                            <button className="btn-icon-round" onClick={() => setIsRadarOpen(false)}>
                                <X size={20} />
                            </button>
                        </div>

                        {/* ── Filter Bar ── */}
                        <div className="radar-filter-bar">
                            <div className="radar-label-row">
                                <span className="radar-label">Rango</span>
                                <span className="radar-label">Profesional</span>
                                <span className="radar-label">Franja Horaria</span>
                            </div>

                            <div className="flex flex-wrap items-center gap-4">
                                <div className="radar-range-selector flex-1 min-w-[180px]">
                                    {(['today', 'week', 'month'] as const).map(r => (
                                        <button
                                            key={r}
                                            type="button"
                                            className={`radar-range-btn ${radarRange === r ? 'active' : ''}`}
                                            onClick={() => {
                                                setRadarRange(r);
                                                findGaps(r, radarTherapistId, radarTimeFilter);
                                            }}
                                        >
                                            <span>{r === 'today' ? 'Hoy' : r === 'week' ? 'Semana' : 'Mes'}</span>
                                        </button>
                                    ))}
                                </div>

                                <div className="radar-therapist-select-wrapper flex-1 min-w-[200px]">
                                    <select
                                        className="radar-therapist-select"
                                        disabled={!!effectiveTherapistId && (isRole('THERAPIST') || !!filterTherapistId)}
                                        value={radarTherapistId}
                                        onChange={(e) => {
                                            setRadarTherapistId(e.target.value);
                                            findGaps(radarRange, e.target.value, radarTimeFilter);
                                        }}
                                    >
                                        <option value="all">👥 Todos</option>
                                        {therapists.map(t => (
                                            <option key={t.id} value={t.id}>👤 {t.fullName.split(' ')[0]}</option>
                                        ))}
                                    </select>
                                    <div className="radar-therapist-select-icon">
                                        <ChevronRight size={16} className="rotate-90" />
                                    </div>
                                </div>

                                <div className="radar-range-selector flex-1 min-w-[200px]">
                                    {(['all', 'morning', 'afternoon'] as const).map(f => (
                                        <button
                                            key={f}
                                            type="button"
                                            className={`radar-range-btn ${radarTimeFilter === f ? 'active' : ''}`}
                                            onClick={() => {
                                                setRadarTimeFilter(f);
                                                findGaps(radarRange, radarTherapistId, f);
                                            }}
                                        >
                                            <span>{f === 'all' ? 'Todo' : f === 'morning' ? 'Mañana' : 'Tarde'}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', minHeight: 0, background: 'white' }}>
                            {gaps.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '3rem 0' }}>
                                    <div style={{ background: '#f8fafc', width: 80, height: 80, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem', border: '2px dashed #e2e8f0' }}>
                                        <Info size={32} style={{ color: '#cbd5e1' }} />
                                    </div>
                                    <p className="text-primary" style={{ fontWeight: 700, fontSize: '1.1rem' }}>No hay huecos disponibles</p>
                                    <p className="text-secondary" style={{ fontSize: '0.85rem', marginTop: '0.5rem', maxWidth: 250, margin: '0.5rem auto 0' }}>Prueba ampliando el rango o cambiando de terapeuta.</p>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                    {/* Group by date */}
                                    {Object.entries(
                                        gaps.reduce((acc, gap) => {
                                            const dayLabel = format(gap.start, "EEEE d 'de' MMMM", { locale: es });
                                            if (!acc[dayLabel]) acc[dayLabel] = [];
                                            acc[dayLabel].push(gap);
                                            return acc;
                                        }, {} as Record<string, typeof gaps>)
                                    ).map(([day, dayGaps]) => (
                                        <div key={day}>
                                            <h4 className="radar-day-group-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-accent-blue)' }}></div>
                                                {day}
                                            </h4>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.75rem' }}>
                                                {dayGaps.map((gap, idx) => (
                                                    <div
                                                        key={idx}
                                                        className="radar-slot-card"
                                                        onClick={() => {
                                                            const targetTId = radarTherapistId !== 'all'
                                                                ? radarTherapistId
                                                                : gap.therapistIds?.[0];

                                                            handleOpenModal(undefined, targetTId, gap.start);
                                                            setIsRadarOpen(false);
                                                        }}
                                                    >
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                                            <div style={{ background: 'linear-gradient(135deg, #eff6ff, #eef2ff)', padding: '0.75rem', borderRadius: '1rem', color: 'var(--color-accent-blue)', border: '1px solid #dbeafe', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                                                                <ClockIcon size={20} />
                                                            </div>
                                                            <div>
                                                                <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                    {format(gap.start, 'HH:mm')} - {format(gap.end, 'HH:mm')}
                                                                </div>
                                                                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', fontWeight: 600, marginTop: '0.125rem', opacity: 0.8 }}>
                                                                    {radarTherapistId === 'all'
                                                                        ? `Disponible con: ${gap.therapists?.join(', ')}`
                                                                        : `${gap.count} bloque(s) libre(s)`}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div className={`radar-availability-badge ${gap.count > 1 ? 'radar-availability-high' : 'radar-availability-medium'}`}>
                                                            {gap.count > 1 ? 'Preferente' : 'Último'}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div style={{ marginTop: 'auto', padding: '1rem 1.5rem', borderTop: '1px solid #eee', display: 'flex', justifyContent: 'flex-end', background: '#f9fafb', borderRadius: '0 0 20px 20px' }}>
                            <button className="btn-secondary" onClick={() => setIsRadarOpen(false)}>Cerrar Radar</button>
                        </div>
                    </div>
                </div>
            )}
            {/* Modal de Creación Rápida de Pacientes */}
            <QuickPatientModal
                isOpen={isQuickPatientModalOpen}
                onClose={() => setIsQuickPatientModalOpen(false)}
                onSuccess={handleQuickPatientSuccess}
                initialName={quickPatientName}
            />
        </div>
    );
};

export default CalendarView;

