import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
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
    endOfDay,
    addHours,
    startOfMonth,
    endOfMonth,
    startOfDay,
    startOfToday
} from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Plus, X, User, Rocket, Puzzle, AlertTriangle, Clock as ClockIcon, DollarSign, Mic, Square, Info, Search, ArrowLeft } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getAppointments, createAppointment, updateAppointment, deleteAppointment } from './service';
import { getPatients, getWaitingList } from '../patients/service';
import { getTherapists } from '../therapists/service';
import { getServices } from '../admin/service';
import { getCurrentStatus } from '../workforce/service';
import { type Appointment } from './types';
import { type Patient } from '../patients/types';
import { type Therapist } from '../therapists/types';
import { getIllustrativeAvatar } from '../therapists/utils';
import { type ClinicalService } from '../admin/types';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../hooks/useToast';
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
    const slotHeight = isEmbedded ? Math.max(70, (containerHeight - 70) / (dynamicHours.length || 1)) : 80;
    const timeColWidth = isEmbedded ? 50 : 55; // Slightly wider for perfect comfort

    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [patients, setPatients] = useState<Patient[]>([]);
    const [therapists, setTherapists] = useState<Therapist[]>([]);
    const [services, setServices] = useState<ClinicalService[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedAppt, setSelectedAppt] = useState<Partial<Appointment> | null>(null);
    const [isRadarOpen, setIsRadarOpen] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [gaps, setGaps] = useState<{ start: Date; end: Date; count: number; therapists?: string[]; therapistIds?: string[] }[]>([]);
    const [radarRange, setRadarRange] = useState<'today' | 'week' | 'month'>('today');
    const [radarTherapistId, setRadarTherapistId] = useState<string>('all');
    const [absences, setAbsences] = useState<any[]>([]);

    // Doctoralia Style States
    const [selectedTherapistIds, setSelectedTherapistIds] = useState<string[]>([]);
    const [therapistSearch, setTherapistSearch] = useState('');
    const [draggedApptId, setDraggedApptId] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<'day' | 'week'>(initialMode === 'WEEKLY_SINGLE' ? 'week' : (isRole('ADMIN') ? 'day' : 'week'));

    // Si no se pasa modo, se controla con viewMode
    const effectiveMode = initialMode || (viewMode === 'day' ? 'TODAY_MULTI' : 'WEEKLY_SINGLE');
    const effectiveTherapistId = filterTherapistId || (isRole('THERAPIST') ? user?.therapistId : undefined);

    const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
    const weekEnd = addDays(weekStart, 6); // Lunes a Domingo (6 días después del lunes)

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

    const fetchAbsences = async () => {
        try {
            const { data, error } = await supabase
                .from('attendance')
                .select('*')
                .neq('type', 'work')
                .or(`start_time.gte.${weekStart.toISOString()},end_time.lte.${weekEnd.toISOString()}`);
            
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
            setTherapists(data);
            setSelectedTherapistIds(data.map(t => t.id)); // Select all by default
            // Compute dynamic hour range from therapists' schedules, filtering if necessary
            computeDynamicHours(data, filterTherapistId || (isRole('THERAPIST') ? user?.therapistId : undefined));
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

    // React to workforce check-in/out events
    useEffect(() => {
        const handler = () => fetchData();
        window.addEventListener('workforce-update', handler);
        return () => window.removeEventListener('workforce-update', handler);
    }, []);

    const computeDynamicHours = (therapistList: Therapist[], filterId?: string) => {
        let minHour = 8;
        let maxHour = 21;
        let found = false;

        const filteredList = filterId ? therapistList.filter(t => t.id === filterId) : therapistList;

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

        // Add 1 hour buffer before start to help readability, clamp between 6-23
        // In embedded mode, be even tighter if found
        const finalMin = Math.max(6, found ? minHour : 8);
        const finalMax = Math.min(23, found ? maxHour : 21);
        setDynamicHours(Array.from({ length: Math.max(1, finalMax - finalMin) }, (_, i) => i + finalMin));
    };

    const goToToday = () => setCurrentDate(new Date());

    const isSlotEnabled = (date: Date, hour: number, tId?: string) => {
        if (!tId) return true;

        // Check for absence blocking
        const isAbsence = absences.some((a: any) => {
            const start = parseISO(a.start_time);
            const end = a.end_time ? parseISO(a.end_time) : start;
            const slotTime = setMinutes(setHours(date, hour), 0);
            return (slotTime >= start && slotTime <= end) || isSameDay(date, start);
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

            // 2. Check schedule
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

    const handleOpenModal = async (appt?: Appointment, tId?: string, date?: Date) => {
        // Validación de Control Horario
        if (isRole('THERAPIST') && user?.therapistId) {
            const status = await getCurrentStatus(user.therapistId);
            if (status !== 'working') {
                // Verificar si estamos dentro de su horario laboral TEÓRICO
                const therapist = therapists.find(t => t.id === user.therapistId);
                if (therapist) {
                    const now = new Date();
                    const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
                    const dayName = dayNames[getDay(now)];
                    const daySchedule = therapist.schedule?.find(d => d.day === dayName);
                    
                    if (daySchedule && daySchedule.enabled) {
                        const currentMinutes = now.getHours() * 60 + now.getMinutes();
                        const isInShift = daySchedule.blocks.some(block => {
                            const [startH, startM] = block.start.split(':').map(Number);
                            const [endH, endM] = block.end.split(':').map(Number);
                            const startMin = startH * 60 + startM;
                            const endMin = endH * 60 + endM;
                            return currentMinutes >= startMin && currentMinutes < endMin;
                        });

                        if (isInShift) {
                            showToast("Acceso denegado. Estás en tu horario laboral y debes fichar la ENTRADA para gestionar la agenda.", "error");
                            return;
                        }
                    }
                }
            }
        }

        if (appt) {
            setSelectedAppt(appt);
        } else {
            const startBase = date || new Date();
            const startStr = formatISO(startBase);
            // Default duration 60m
            const endStr = formatISO(addMinutes(startBase, 60));
            
            const available = getAvailableTherapists(startStr, endStr);
            const therapistId = tId || available[0]?.id || therapists[0]?.id || '';
            const therapist = therapists.find(t => t.id === therapistId);
            const offset = therapist?.sessionStartOffset || 0;

            const startWithOffset = setMinutes(setHours(startBase, startBase.getHours()), offset);
            const finalStartStr = formatISO(startWithOffset);

            setSelectedAppt({
                patientId: '',
                patientName: '',
                therapistId,
                therapistName: therapist?.fullName || '',
                serviceId: '',
                type: 'Terapia',
                start: finalStartStr,
                end: formatISO(addMinutes(parseISO(finalStartStr), 60)),
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
            showToast("El diario de sesión es obligatorio para finalizar o cobrar una cita.", "error");
            return;
        }

        const finalAppt = { ...selectedAppt };
        const isBlocked = finalAppt.status === 'Bloqueada';

        if (isBlocked) {
            finalAppt.patientId = undefined;
            finalAppt.serviceId = undefined;
            finalAppt.patientName = 'HORARIO BLOQUEADO';
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

    const findGaps = (range?: 'today' | 'week' | 'month', therapistId?: string) => {
        const targetRange = range || radarRange;
        const targetTherapistId = therapistId || (radarTherapistId === 'all' && effectiveTherapistId ? effectiveTherapistId : radarTherapistId);
        
        if (targetTherapistId !== radarTherapistId) setRadarTherapistId(targetTherapistId);
        if (targetRange !== radarRange) setRadarRange(targetRange);

        const foundGaps: { start: Date; end: Date; count: number; therapists?: string[]; therapistIds?: string[] }[] = [];
        let viewDays: Date[] = [];
        const today = startOfToday();
        const baseDateForSearch = isBefore(currentDate, today) ? today : currentDate;
        const startOfSearchWeek = startOfWeek(baseDateForSearch, { weekStartsOn: 1 });

        if (targetRange === 'today') {
            viewDays = [baseDateForSearch];
        } else if (targetRange === 'week') {
            viewDays = eachDayOfInterval({ 
                start: startOfSearchWeek, 
                end: addDays(startOfSearchWeek, 5) 
            }).filter(d => isAfter(d, today) || isSameDay(d, today));
        } else if (targetRange === 'month') {
            viewDays = eachDayOfInterval({ 
                start: startOfMonth(baseDateForSearch), 
                end: endOfMonth(baseDateForSearch) 
            }).filter(d => (isAfter(d, today) || isSameDay(d, today)) && d.getDay() !== 0 && d.getDay() !== 6); 
        }

        viewDays.forEach(day => {
            const dayName = format(day, "EEEE", { locale: es });
            const capitalizedDay = dayName.charAt(0).toUpperCase() + dayName.slice(1);
            
            const therapistsToInspect = targetTherapistId === 'all' 
                ? therapists 
                : therapists.filter(t => t.id === targetTherapistId);

            therapistsToInspect.forEach(t => {
                const daySchedule = t.schedule?.find(s => s.day === capitalizedDay);
                if (!daySchedule || !daySchedule.enabled || !daySchedule.blocks) return;

                daySchedule.blocks.forEach(block => {
                    const [startH, startM] = block.start.split(':').map(Number);
                    const [endH, endM] = block.end.split(':').map(Number);
                    
                    const workStart = setMinutes(setHours(startOfDay(day), startH), startM);
                    const workEnd = setMinutes(setHours(startOfDay(day), endH), endM);

                    // Filter valid appointments only
                    const tAppts = appointments
                        .filter(a => a.therapistId === t.id && (a.status !== 'Cancelada' && a.status !== 'Ausente'))
                        .filter(a => isSameDay(parseISO(a.start), day))
                        .map(a => ({ start: parseISO(a.start), end: parseISO(a.end) }))
                        .sort((a, b) => a.start.getTime() - b.start.getTime());

                    let cursor = workStart;
                    // If searching for today, don't show past gaps
                    if (isSameDay(day, today) && isBefore(cursor, new Date())) {
                        cursor = new Date();
                        // Round up to nearest 5m? No, just use as is for precision
                    }

                    tAppts.forEach(appt => {
                        // Ensure appointment is within current block
                        if (isBefore(appt.start, cursor)) {
                            if (isAfter(appt.end, cursor)) cursor = appt.end;
                            return;
                        }
                        if (isAfter(appt.start, workEnd)) return;

                        if (isAfter(appt.start, cursor)) {
                            let gapCursor = cursor;
                            while (differenceInMinutes(appt.start, gapCursor) >= 60) {
                                const nextSlot = addHours(gapCursor, 1);
                                foundGaps.push({ 
                                    start: gapCursor, 
                                    end: nextSlot, 
                                    count: 1, 
                                    therapists: [t.fullName?.split(' ')[0] || 'Terapeuta'],
                                    therapistIds: [t.id]
                                });
                                gapCursor = nextSlot;
                            }
                        }
                        if (isAfter(appt.end, cursor)) {
                            cursor = appt.end;
                        }
                    });

                    // Final gap in block
                    if (isBefore(cursor, workEnd)) {
                        let gapCursor = cursor;
                        while (differenceInMinutes(workEnd, gapCursor) >= 60) {
                            const nextSlot = addHours(gapCursor, 1);
                            foundGaps.push({ 
                                start: gapCursor, 
                                end: nextSlot, 
                                count: 1, 
                                therapists: [t.fullName?.split(' ')[0] || 'Terapeuta'],
                                therapistIds: [t.id]
                            });
                            gapCursor = nextSlot;
                        }
                    }
                });
            });
        });

        // Group gaps that are at the same time across different therapists
        const mergedGaps: { start: Date; end: Date; count: number; therapists?: string[]; therapistIds?: string[] }[] = [];
        foundGaps.forEach(g => {
            const existing = mergedGaps.find(mg => 
                mg.start.getTime() === g.start.getTime() && 
                mg.end.getTime() === g.end.getTime()
            );
            if (existing) {
                existing.count++;
                if (g.therapists) existing.therapists = Array.from(new Set([...(existing.therapists || []), ...g.therapists]));
                if (g.therapistIds) existing.therapistIds = Array.from(new Set([...(existing.therapistIds || []), ...g.therapistIds]));
            } else {
                mergedGaps.push({ ...g });
            }
        });

        setGaps(mergedGaps.sort((a, b) => a.start.getTime() - b.start.getTime()).slice(0, 50));
        setIsRadarOpen(true);
    };



    const getAppointmentPosition = (start: string, end: string) => {
        const startDate = parseISO(start);
        const endDate = parseISO(end);
        const startHour = startDate.getHours();
        const startMin = startDate.getMinutes();
        const duration = differenceInMinutes(endDate, startDate);
        const baseHour = dynamicHours.length > 0 ? dynamicHours[0] : 8;
        const top = (startHour - baseHour) * slotHeight + (startMin / 60) * slotHeight;
        const height = (duration / 60) * slotHeight;
        return { top: `${top}px`, height: `${height}px` };
    };

    const filteredAppointments = appointments.filter(appt => {
        if (isRole('THERAPIST')) {
            return appt.therapistId === (effectiveTherapistId || 'NONE');
        }
        if (effectiveMode === 'WEEKLY_SINGLE') {
            if (selectedTherapistIds.length > 0) {
                return selectedTherapistIds.includes(appt.therapistId);
            }
        }
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

    const visibleTherapists = therapists.filter(t => selectedTherapistIds.includes(t.id));
    const isMultiDay = effectiveMode !== 'TODAY_MULTI';
    const columns = !isMultiDay ? visibleTherapists : days;
    
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
                    <div className="calendar-left-sidebar-header">
                        <div className="calendar-left-sidebar-title-row">
                            <h3 className="calendar-left-sidebar-title">Filtros de Terapeutas</h3>
                            <button onClick={() => navigate('/dashboard')} className="calendar-back-btn" title="Volver al inicio">
                                <ArrowLeft size={18} />
                            </button>
                        </div>
                        <div className="calendar-search-wrapper">
                            <Search className="calendar-search-icon" size={16} />
                            <input 
                                type="text" 
                                placeholder="Buscar..." 
                                className="calendar-search-input"
                                value={therapistSearch}
                                onChange={e => setTherapistSearch(e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="calendar-therapist-list">
                        {therapists
                            .filter(t => t.fullName.toLowerCase().includes(therapistSearch.toLowerCase()))
                            .map(t => {
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
                                <button className="calendar-btn-pill calendar-btn-primary" onClick={() => handleOpenModal()} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
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
                             zIndex: 110, 
                             backgroundColor: '#fcfbfa', 
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
                    
                    {columns.map((col, i) => (
                        <div key={`header-${i}`} className="header-cell relative flex flex-col items-center" style={{ 
                            gridColumn: `${i + 2}`,
                            position: 'sticky',
                            top: 0,
                            zIndex: 100,
                            height: isEmbedded ? '45px' : '70px',
                            padding: isEmbedded ? '4px 0' : '0.5rem 0',
                            textAlign: 'center',
                            ...(effectiveMode === 'TODAY_MULTI' 
                                ? { backgroundColor: `${(col as Therapist).color}15`, borderTopLeftRadius: '12px', borderTopRightRadius: '12px', border: `1px solid ${(col as Therapist).color}30` } 
                                : { backgroundColor: '#f0f4f8', border: '1px solid #e1e8f0', borderTopLeftRadius: '8px', borderTopRightRadius: '8px' }),
                            borderBottom: '1px solid #e2e8f0'
                        }}>
                            {effectiveMode === 'TODAY_MULTI' ? (
                                <div className="therapist-col-header">
                                    <div className="therapist-avatar-wrapper shadow-sm" style={{ width: '32px', height: '32px', backgroundColor: 'white', borderRadius: '50%' }}>
                                        <img src={getIllustrativeAvatar(col as Therapist)} alt={(col as Therapist).fullName} className="therapist-header-avatar" style={{ border: 'none', width: '100%', height: '100%', borderRadius: '50%' }} />
                                    </div>
                                    <span className="therapist-name-label">
                                        {((col as Therapist).fullName).split(' ')[0]} {((col as Therapist).fullName).split(' ')[1] || ''}
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
                    ))}

                    {/* --- BODY COLUMNS (Row 2) --- */}
                    <div className="time-column flex flex-col bg-[#fcfbfa]" style={{ gridRow: '2', gridColumn: '1', position: 'sticky', left: 0, zIndex: 90, borderRight: '1px solid #e2e8f0' }}>
                        {dynamicHours.map((h: number) => (
                            <div key={h} className="time-cell-group flex flex-col items-center justify-start" style={{ height: `${slotHeight}px`, padding: isEmbedded ? '4px 0' : '6px 0' }}>
                                <div className="font-semibold text-gray-500 text-[11px] w-full text-center">{h}:00</div>
                                {!isEmbedded && (
                                    <div className="font-medium text-gray-400 text-[10px] w-full text-center mt-auto">{h}:30</div>
                                )}
                            </div>
                        ))}
                    </div>

                    {columns.map((col, i) => (
                        <div key={`col-${i}`} className="day-column" style={{ gridRow: '2', gridColumn: `${i + 2}` }}>
                            {/* Current Time Line Indicator */}
                            {((effectiveMode === 'TODAY_MULTI' && isSameDay(currentDate, new Date())) || 
                              (effectiveMode === 'WEEKLY_SINGLE' && isSameDay(col as Date, new Date()))) && 
                              (currentTime.getHours() >= (dynamicHours[0] || 8) && currentTime.getHours() <= (dynamicHours[dynamicHours.length - 1] || 21)) && (
                                <div 
                                    className="current-time-line" 
                                    style={{ 
                                        top: `${(currentTime.getHours() - (dynamicHours[0] || 8)) * 80 + (currentTime.getMinutes() / 60) * 80}px` 
                                    }}
                                >
                                    {(i === 0 || effectiveMode === 'WEEKLY_SINGLE') && <div className="line-ball" />}
                                </div>
                            )}
                            {/* Slots clicables de fondo interactivos para Drag & Drop */}
                            {dynamicHours.map((h: number) => {
                                const date = effectiveMode === 'TODAY_MULTI' ? currentDate : (col as Date);
                                const tId = effectiveMode === 'TODAY_MULTI' ? (col as Therapist).id : effectiveTherapistId;
                                const enabled = isSlotEnabled(date, h, tId);

                                return (
                                    <div key={h} className="relative w-full" style={{ height: `${slotHeight}px` }}>
                                        {/* 00-30 Slot */}
                                        <div
                                            className={`grid-slot-half ${!enabled ? 'slot-disabled' : ''}`}
                                            onClick={() => enabled && handleOpenModal(undefined, tId, setMinutes(setHours(date, h), 0))}
                                            onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }}
                                            onDragLeave={e => e.currentTarget.classList.remove('drag-over')}
                                            onDrop={e => { e.currentTarget.classList.remove('drag-over'); handleDrop(e, date, h, 0, tId); }}
                                        />
                                        {/* 30-60 Slot */}
                                        <div
                                            className={`grid-slot-half solid-border ${!enabled ? 'slot-disabled' : ''}`}
                                            onClick={() => enabled && handleOpenModal(undefined, tId, setMinutes(setHours(date, h), 30))}
                                            onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }}
                                            onDragLeave={e => e.currentTarget.classList.remove('drag-over')}
                                            onDrop={e => { e.currentTarget.classList.remove('drag-over'); handleDrop(e, date, h, 30, tId); }}
                                        />
                                    </div>
                                );
                            })}

                            {absences
                                .filter((a: any) => a.therapist_id === (effectiveMode === 'TODAY_MULTI' ? (col as Therapist).id : effectiveTherapistId))
                                .filter((a: any) => isSameDay(parseISO(a.start_time), effectiveMode === 'TODAY_MULTI' ? currentDate : (col as Date)))
                                .map((a: any) => {
                                    const start = parseISO(a.start_time);
                                    const end = a.end_time ? parseISO(a.end_time) : addHours(start, 24);
                                    const pos = getAppointmentPosition(a.start_time, end.toISOString());
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
                                                background: 'repeating-linear-gradient(45deg, #f3f4f6, #f3f4f6 10px, #e5e7eb 10px, #e5e7eb 20px)',
                                                border: '1px solid #d1d5db',
                                                borderRadius: '4px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                padding: '4px',
                                                overflow: 'hidden'
                                            }}
                                        >
                                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                                                {a.type === 'vacation' ? 'Vacaciones' : 'Baja Médica'}
                                            </span>
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
                                .reduce((acc, appt) => {
                                    const active = acc.active.filter(a => parseISO(a.end) > parseISO(appt.start));
                                    const overlapIndex = active.length;
                                    active.push(appt);
                                    acc.result.push({ ...appt, overlapIndex });
                                    acc.active = active;
                                    return acc;
                                }, { result: [] as any[], active: [] as any[] }).result
                                .map((appt: any) => {
                                    const pos = getAppointmentPosition(appt.start, appt.end);
                                    
                                    // Súper-posición parcial gráfica de los bloques y offset horizontal si hay overlap
                                    const adjustedHeight = `calc(${pos.height} + 4px)`;
                                    const horizontalOffset = appt.overlapIndex > 0 ? `${appt.overlapIndex * 15}px` : '4px';
                                    const rightOffset = appt.overlapIndex > 0 ? `-${appt.overlapIndex * 5}px` : '4px';

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
                                                height: adjustedHeight,
                                                left: horizontalOffset,
                                                right: rightOffset,
                                                backgroundColor: styleConfig.bg,
                                                borderColor: styleConfig.border,
                                                color: styleConfig.text,
                                                zIndex: 10 + appt.overlapIndex,
                                                boxShadow: appt.overlapIndex > 0 ? '-4px 0 15px rgba(0,0,0,0.05)' : '0 1px 3px rgba(0,0,0,0.05)',
                                                borderRadius: isShortBlock ? '9999px' : '0.85rem'
                                            }}
                                            onClick={() => {
                                                setSelectedAppt(appt);
                                                setIsModalOpen(true);
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
                                                        {appt.status === 'Bloqueada' ? 'HORARIO BLOQUEADO' : appt.patientName}
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
                                                <div className="appt-service-type">
                                                    {appt.type}
                                                </div>
                                                {!isShortBlock && <div className="appt-status-text">Status: {appt.status === 'Programada' ? 'Pendiente' : appt.status}</div>}
                                            </div>

                                            {/* Hover Tooltip flotante */}
                                            <div className="appt-hover-tooltip">
                                                <div className="tooltip-arrow"></div>
                                                <div className="tooltip-title">{appt.status === 'Bloqueada' ? 'Horario Bloqueado' : appt.patientName}</div>
                                                {appt.status !== 'Bloqueada' && <div className="tooltip-detail"><User size={12}/> Tel: <b>{pData?.phone || 'No registrado'}</b></div>}
                                                <div className="tooltip-badge">{appt.status === 'Bloqueada' ? 'Bloqueo' : appt.type}</div>
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
                <div className="modal-overlay">
                    <div className="modal-content appointment-modal-narrow">
                        <div className="modal-header">
                            <h3>{selectedAppt.id ? 'Detalles de la Cita' : 'Nueva Cita'}</h3>
                            <button className="btn-icon-round" onClick={() => setIsModalOpen(false)}><X size={20} /></button>
                        </div>
                        <form className="modal-form" onSubmit={handleSave}>
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
                                {selectedAppt.status !== 'Bloqueada' && (
                                    <div className="form-group">
                                        <label><User size={12} className="mr-1" /> Paciente</label>
                                        <select
                                            required
                                            value={selectedAppt.patientId}
                                            onChange={e => {
                                                const p = patients.find(pat => pat.id === e.target.value);
                                                setSelectedAppt({ ...selectedAppt, patientId: e.target.value, patientName: p ? `${p.firstName} ${p.lastName}` : '' });
                                            }}
                                            style={{ height: '36px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid #ddd', width: '100%', fontSize: '0.85rem' }}
                                        >
                                            <option value="">Seleccionar paciente...</option>
                                            {patients.map(p => <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>)}
                                        </select>
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
                                            {getAvailableTherapists(selectedAppt.start, selectedAppt.end).map(t => (
                                                <option key={t.id} value={t.id}>{t.fullName}</option>
                                            ))}
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
                            <div className="form-grid">
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
                                                    type: s ? s.name : selectedAppt.type
                                                });
                                            }}
                                            style={{ height: '36px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid #ddd', width: '100%', fontSize: '0.85rem' }}
                                        >
                                            <option value="">Seleccionar...</option>
                                            {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                        </select>
                                    </div>
                                )}
                                <div className="form-group" style={{ gridColumn: selectedAppt.status === 'Bloqueada' ? 'span 2' : 'auto' }}>
                                    <label>Estado</label>
                                    <select
                                        value={selectedAppt.status}
                                        onChange={e => {
                                            const newStatus = e.target.value as any;
                                            if (selectedAppt) {
                                                setSelectedAppt({ ...selectedAppt, status: newStatus });
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
                                        value={selectedAppt.sessionDiary || ''}
                                        onChange={e => setSelectedAppt({ ...selectedAppt, sessionDiary: e.target.value })}
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
                    <div className="modal-content no-padding flex-layout" style={{ maxWidth: '500px', width: '95%', height: 'auto', minHeight: '400px', maxHeight: '85vh' }}>
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
                                <span className="radar-label">Rango de búsqueda</span>
                                <span className="radar-label">Profesional</span>
                            </div>
                            
                            <div className="flex items-center gap-4">
                                <div className="radar-range-selector flex-[0.4]">
                                    {(['today', 'week', 'month'] as const).map(r => (
                                        <button
                                            key={r}
                                            type="button"
                                            className={`radar-range-btn ${radarRange === r ? 'active' : ''}`}
                                            onClick={() => {
                                                setRadarRange(r);
                                                findGaps(r, radarTherapistId);
                                            }}
                                        >
                                            {r === 'today' && <ClockIcon size={14} />}
                                            {r === 'week' && <Search size={14} />}
                                            {r === 'month' && <Puzzle size={14} />}
                                            <span>{r === 'today' ? 'Hoy' : r === 'week' ? 'Semana' : 'Mes'}</span>
                                        </button>
                                    ))}
                                </div>

                                <div className="radar-therapist-select-wrapper flex-[0.6]">
                                    <select 
                                        className="radar-therapist-select"
                                        disabled={!!effectiveTherapistId && (isRole('THERAPIST') || !!filterTherapistId)}
                                        value={radarTherapistId}
                                        onChange={(e) => {
                                            setRadarTherapistId(e.target.value);
                                            findGaps(radarRange, e.target.value);
                                        }}
                                    >
                                        <option value="all">👥 Todos los profesionales</option>
                                        {therapists.map(t => (
                                            <option key={t.id} value={t.id}>👤 {t.fullName}</option>
                                        ))}
                                    </select>
                                    <div className="radar-therapist-select-icon">
                                        <ChevronRight size={16} className="rotate-90" />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white overflow-y-auto flex-1" style={{ padding: '1.5rem' }}>
                            {gaps.length === 0 ? (
                                <div className="text-center py-12">
                                    <div className="bg-slate-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 border border-dashed border-slate-200">
                                        <Info size={32} className="text-slate-300" />
                                    </div>
                                    <p className="text-primary font-bold text-lg">No hay huecos disponibles</p>
                                    <p className="text-sm text-secondary mt-1 max-w-[250px] mx-auto">Prueba ampliando el rango o cambiando de terapeuta.</p>
                                </div>
                            ) : (
                                <div className="space-y-6">
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
                                            <h4 className="radar-day-group-title flex items-center gap-2">
                                                <div className="w-1.5 h-1.5 rounded-full bg-accent-blue font-bold"></div>
                                                {day}
                                            </h4>
                                            <div className="grid grid-cols-1 gap-3">
                                                {dayGaps.map((gap, idx) => (
                                                    <div 
                                                        key={idx} 
                                                        className="radar-slot-card group"
                                                        onClick={() => {
                                                            const targetTId = radarTherapistId !== 'all' 
                                                                ? radarTherapistId 
                                                                : gap.therapistIds?.[0];

                                                            setSelectedAppt({ 
                                                                start: formatISO(gap.start), 
                                                                end: formatISO(gap.end),
                                                                therapistId: targetTId
                                                            });
                                                            setIsRadarOpen(false);
                                                            setIsModalOpen(true);
                                                        }}
                                                    >
                                                        <div className="flex items-center gap-4">
                                                            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-3 rounded-2xl text-accent-blue border border-blue-100 shadow-sm group-hover:scale-110 transition-transform">
                                                                <ClockIcon size={20} />
                                                            </div>
                                                            <div>
                                                                <div className="font-extrabold text-base text-primary flex items-center gap-2">
                                                                    {format(gap.start, 'HH:mm')} - {format(gap.end, 'HH:mm')}
                                                                </div>
                                                                <div className="text-xs text-secondary font-semibold mt-0.5 opacity-80">
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
                        <div className="mt-auto p-4 border-t flex justify-end bg-gray-50" style={{ borderRadius: '0 0 20px 20px' }}>
                            <button className="btn-secondary" onClick={() => setIsRadarOpen(false)}>Cerrar Radar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CalendarView;

