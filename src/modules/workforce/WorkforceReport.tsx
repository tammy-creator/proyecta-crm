import React, { useState, useEffect, useMemo } from 'react';
import { 
    format, 
    parseISO, 
    isSameDay, 
    eachDayOfInterval, 
    startOfMonth, 
    endOfMonth, 
    isWeekend, 
    startOfDay, 
    endOfDay,
    set,
    subMonths,
    addMonths,
    isWithinInterval,
    differenceInMinutes
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
    ShieldCheck,
    Info,
    Printer,
    Sun,
    X,
    ChevronLeft,
    ChevronRight,
    LayoutGrid,
    List,
    FileText,
    Users,
    PenTool
} from 'lucide-react';
import { 
    getAllAttendance, 
    addAttendance, 
    updateAttendance,
    deleteAttendance, 
    getAllSignatures, 
    checkScheduleAdherence
} from './service';
import { getTherapists, updateTherapistTimeTracking } from '../therapists/service';
import { getAppointments } from '../calendar/service';
import { supabase } from '../../lib/supabase';
import type { Therapist, WorkingHours } from '../therapists/types';
import { DAYS_OF_WEEK } from '../therapists/types';
import type { Attendance, MonthlyReportSignature } from './types';
import type { CenterSettings } from '../admin/types';
import { getCenterSettings } from '../admin/service';
import Modal from '../../components/ui/Modal';
import PrintPortal from '../../components/ui/PrintPortal';
import WorkforcePrintDocument from './WorkforcePrintDocument';
import SigningModal from './SigningModal';
import { useToast } from '../../hooks/useToast';
import './WorkforceReport.css';

const WorkforceReport: React.FC = () => {
    const { showToast } = useToast();
    const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'));
    const [filterDate, setFilterDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [selectedTherapistId, setSelectedTherapistId] = useState<string>('all');
    const [therapists, setTherapists] = useState<Therapist[]>([]);
    const [attendances, setAttendances] = useState<Attendance[]>([]);
    const [appointments, setAppointments] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [centerSettings, setCenterSettings] = useState<CenterSettings | null>(null);
    const [signedReports, setSignedReports] = useState<(MonthlyReportSignature & { therapistName?: string })[]>([]);
    
    // Modal state
    const [activeTab, setActiveTab] = useState<'daily' | 'absences' | 'signatures'>('daily');
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingRecord, setEditingRecord] = useState<Partial<Attendance & { isGlobal?: boolean }> | null>(null);
    const [manualBlocks, setManualBlocks] = useState<WorkingHours[]>([
        { start: '', end: '' }
    ]);
    const [isPrinting, setIsPrinting] = useState(false);
    const [printData, setPrintData] = useState<{
        month: string;
        therapist: Therapist;
        daysInMonth: Date[];
        getDailyData: (day: Date) => any;
        signature?: MonthlyReportSignature | null;
    } | null>(null);
    const [isAbsenceModalOpen, setIsAbsenceModalOpen] = useState(false);
    const [isAdherenceModalOpen, setIsAdherenceModalOpen] = useState(false);
    const [isVacationListModalOpen, setIsVacationListModalOpen] = useState(false);
    const [allVacations, setAllVacations] = useState<Attendance[]>([]);
    const [vacationLoading, setVacationLoading] = useState(false);
    const [selectedDayAbsences, setSelectedDayAbsences] = useState<{ day: Date, absences: (Attendance & { therapistName?: string })[] } | null>(null);
    const [sigViewMode, setSigViewMode] = useState<'cards' | 'table'>('cards');
    const [sigStatusFilter, setSigStatusFilter] = useState<'all' | 'signed' | 'pending'>('all');
    const [showAllHistory, setShowAllHistory] = useState(false);
    const [isTimeTrackingModalOpen, setIsTimeTrackingModalOpen] = useState(false);
    const [previewSigningTherapistId, setPreviewSigningTherapistId] = useState<string | null>(null);
    const { user: currentUser } = useAuth();

    // Active therapists (excludes deactivated accounts like Laura Chico)
    const activeTherapists = therapists.filter(t => t.isActive !== false);

    // Therapists subject to daily time tracking and monthly signatures (excludes Ruth, Marta, etc.)
    const timeTrackingTherapists = activeTherapists.filter(t => t.hasTimeTracking !== false);

    useEffect(() => {
        getTherapists().then(data => {
            setTherapists(data);
            // Removed forced default selection to allow 'all' by default
        });

        getCenterSettings().then(setCenterSettings).catch(console.error);

        // Load signed reports for admin
        if (currentUser?.role === 'ADMIN') {
            getAllSignatures().then(setSignedReports).catch(console.error);
        }
    }, []);

    // Manage body class for printing
    useEffect(() => {
        if (isPrinting) {
            document.body.classList.add('print-active');
        } else {
            document.body.classList.remove('print-active');
        }
        return () => document.body.classList.remove('print-active');
    }, [isPrinting]);

    useEffect(() => {
        fetchData();
    }, [month, selectedTherapistId]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const therapistToFetch = selectedTherapistId === 'all' ? undefined : selectedTherapistId;
            const attData = await getAllAttendance(month, therapistToFetch);
            setAttendances(attData);

            const startDay = parseISO(`${month}-01`);
            const endDay = endOfMonth(startDay);
            const appts = await getAppointments(startDay, endDay);
            
            const filteredAppts = selectedTherapistId === 'all' 
                ? appts.filter(a => a.status !== 'Cancelada')
                : appts.filter(a => a.therapistId === selectedTherapistId && a.status !== 'Cancelada');
            
            setAppointments(filteredAppts);
            
            // Populate allVacations for the history list
            if (selectedTherapistId === 'all') {
                setAllVacations(attData.filter(a => a.type !== 'work'));
            } else {
                const currentYear = format(new Date(), 'yyyy');
                const { data: yearData, error: yearError } = await supabase
                    .from('attendance')
                    .select('*')
                    .eq('therapist_id', selectedTherapistId)
                    .neq('type', 'work')
                    .gte('start_time', `${currentYear}-01-01T00:00:00Z`)
                    .lte('start_time', `${currentYear}-12-31T23:59:59Z`)
                    .order('start_time', { ascending: false });
                
                if (yearError) {
                    console.error("Error fetching year data:", yearError);
                } else {
                    setAllVacations((yearData || []).map(d => ({
                        id: d.id,
                        userId: d.user_id,
                        therapistId: d.therapist_id,
                        startTime: d.start_time,
                        endTime: d.end_time,
                        type: d.type as 'work' | 'vacation' | 'sick_leave',
                        notes: d.notes
                    })));
                }
            }
            
        } catch (error) {
            console.error("Error fetching workforce data:", error);
            showToast("Error al cargar los datos. Por favor, refresca la página.", "error");
        } finally {
            setLoading(false);
        }
    };

    const handleShowVacations = async () => {
        setVacationLoading(true);
        setIsVacationListModalOpen(true);
        try {
            const currentYear = format(new Date(), 'yyyy');
            let query = supabase
                .from('attendance')
                .select('*')
                .neq('type', 'work')
                .gte('start_time', `${currentYear}-01-01T00:00:00Z`)
                .lte('start_time', `${currentYear}-12-31T23:59:59Z`)
                .order('start_time', { ascending: false });

            if (selectedTherapistId !== 'all') {
                query = query.eq('therapist_id', selectedTherapistId);
            }

            const { data, error } = await query;
            if (error) throw error;
            setAllVacations((data || []).map(d => ({
                id: d.id,
                userId: d.user_id,
                therapistId: d.therapist_id,
                startTime: d.start_time,
                endTime: d.end_time,
                type: d.type as any,
                notes: d.notes
            })));
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
            showToast(`Error al eliminar: ${error.message || 'Error desconocido'}`, "error");
        }
    };


    const handleSaveAttendance = async (e?: React.FormEvent, skipAdherenceCheck: boolean = false) => {
        if (e) e.preventDefault();
        if (!editingRecord || !selectedTherapistId) return;

        const adminInfo = currentUser ? { id: currentUser.id, name: currentUser.name } : undefined;

        // NEW: Special handling for Global Holidays
        if (editingRecord.type === 'holiday' && editingRecord.isGlobal) {
            try {
                // Fetch all user accounts to match therapists
                const { data: userAccounts, error: uaError } = await supabase
                    .from('user_accounts')
                    .select('id, therapist_id, email, full_name');
                
                if (uaError) throw uaError;

                const therapistsToRecord = activeTherapists.filter(t => t.id !== 'all');
                
                if (therapistsToRecord.length === 0) {
                    showToast("No se han encontrado terapeutas en la lista para asignar el festivo.", "info");
                    return;
                }

                let successCount = 0;
                let failCount = 0;
                let noAccountCount = 0;

                for (const t of therapistsToRecord) {
                    // Try to match by therapist_id first, then by email (case-insensitive)
                    const tUserAccount = userAccounts?.find(ua => ua.therapist_id === t.id) || 
                                       (t.email ? userAccounts?.find(ua => ua.email?.toLowerCase() === t.email?.toLowerCase()) : null);
                    
                    const userId = tUserAccount?.id || currentUser?.id;
                    
                    if (userId) {
                        try {
                            await addAttendance({
                                userId: userId,
                                therapistId: t.id,
                                startTime: editingRecord.startTime,
                                endTime: editingRecord.endTime,
                                type: 'holiday',
                                notes: editingRecord.notes ? `(FESTIVO GLOBAL) ${editingRecord.notes}` : 'FESTIVO GLOBAL'
                            }, adminInfo);
                            successCount++;
                        } catch (err) {
                            console.error(`Error saving holiday for ${t.fullName}:`, err);
                            failCount++;
                        }
                    } else {
                        noAccountCount++;
                    }
                }

                setIsAbsenceModalOpen(false);
                setEditingRecord(null);
                fetchData();
                
                if (successCount > 0) {
                    showToast(`Festivo global registrado para ${successCount} terapeutas.${failCount > 0 ? ` (${failCount} fallos)` : ''}${noAccountCount > 0 ? `. ${noAccountCount} terapeutas no tienen cuenta vinculada.` : ''}`, "success");
                } else {
                    showToast(`No se ha podido registrar nada. ${noAccountCount} terapeutas sin cuenta vinculada. Total cuentas encontradas: ${userAccounts?.length || 0}`, "error");
                }
                return;
            } catch (err: any) {
                console.error("Error saving global holiday:", err);
                showToast(`Error crítico al registrar festivo global: ${err.message || 'Error desconocido'}`, "error");
                return;
            }
        }

        // Determine the actual therapist for this record
        const targetTherapistId = editingRecord.therapistId || (selectedTherapistId !== 'all' ? selectedTherapistId : null);
        
        if (!targetTherapistId) {
            showToast("No se ha podido determinar el terapeuta para este registro.", "error");
            return;
        }

        // Validation for date order in absences
        if (editingRecord.type !== 'work') {
            const newStart = parseISO(editingRecord.startTime!);
            const newEnd = editingRecord.endTime ? parseISO(editingRecord.endTime) : newStart;
            
            if (newEnd < newStart) {
                showToast("La fecha de fin no puede ser anterior a la fecha de inicio.", "error");
                return;
            }
        }

        // Validation for work shifts (schedule adherence)
        if (editingRecord.type === 'work' && !skipAdherenceCheck) {
            const { isAdherent } = await checkScheduleAdherence(targetTherapistId, parseISO(editingRecord.startTime!));
            if (!isAdherent) {
                setIsAdherenceModalOpen(true);
                return;
            }
        }

        try {
            // Determine if we are updating existing records or adding new ones
            const isEditing = !!editingRecord.id;

            // Try to find the user account linked to this therapist
            let { data: userAccount } = await supabase
                .from('user_accounts')
                .select('id')
                .eq('therapist_id', targetTherapistId)
                .maybeSingle();

            if (!userAccount) {
                const therapist = therapists.find(t => t.id === targetTherapistId);
                if (therapist?.email) {
                    const { data: byEmail } = await supabase
                        .from('user_accounts')
                        .select('id')
                        .ilike('email', therapist.email)
                        .maybeSingle();
                    userAccount = byEmail;
                }
            }

            const targetUserId = userAccount?.id || currentUser?.id;

            if (!targetUserId) {
                const name = therapists.find(t => t.id === targetTherapistId)?.fullName || 'este terapeuta';
                const email = therapists.find(t => t.id === targetTherapistId)?.email;
                showToast(`No se ha encontrado una cuenta de usuario vinculada para ${name}.${email ? ` Buscado por email: ${email}` : ' No tiene email configurado.'} Revisa 'Equipo y Roles'.`, "error");
                return;
            }

            if (editingRecord.type !== 'work') {
                const sDate = startOfDay(parseISO(editingRecord.startTime!));
                const eDate = editingRecord.endTime ? endOfDay(parseISO(editingRecord.endTime)) : endOfDay(parseISO(editingRecord.startTime!));

                // Clean up any conflicting work records for this therapist in this interval
                const conflictingWork = attendances.filter(a =>
                    a.therapistId === targetTherapistId &&
                    a.type === 'work' &&
                    a.startTime &&
                    isWithinInterval(parseISO(a.startTime), { start: sDate, end: eDate })
                );

                for (const w of conflictingWork) {
                    if (w.id && w.id !== editingRecord.id) {
                        try {
                            await deleteAttendance(w.id, adminInfo);
                        } catch (delErr) {
                            console.warn("Could not delete conflicting work record:", delErr);
                        }
                    }
                }

                // Clean up any other overlapping absence records in this interval
                const conflictingAbsences = attendances.filter(a =>
                    a.therapistId === targetTherapistId &&
                    a.type !== 'work' &&
                    a.startTime &&
                    a.id !== editingRecord.id &&
                    (
                        isWithinInterval(parseISO(a.startTime), { start: sDate, end: eDate }) ||
                        (a.endTime && isWithinInterval(parseISO(a.endTime), { start: sDate, end: eDate }))
                    )
                );

                for (const a of conflictingAbsences) {
                    if (a.id) {
                        try {
                            await deleteAttendance(a.id, adminInfo);
                        } catch (delErr) {
                            console.warn("Could not delete conflicting absence record:", delErr);
                        }
                    }
                }

                const payload = {
                    userId: targetUserId,
                    therapistId: targetTherapistId,
                    startTime: sDate.toISOString(),
                    endTime: eDate.toISOString(),
                    type: editingRecord.type,
                    notes: editingRecord.notes
                };

                if (isEditing && editingRecord.id) {
                    await updateAttendance(editingRecord.id, payload as any, adminInfo);
                } else {
                    await addAttendance(payload as any, adminInfo);
                }

                const typeLabel = editingRecord.type === 'vacation' 
                    ? 'Vacaciones' 
                    : editingRecord.type === 'holiday' 
                        ? 'Festivo' 
                        : 'Baja médica';

                showToast(isEditing ? `${typeLabel} actualizadas correctamente` : `${typeLabel} registradas correctamente`, "success");
            } else {
                const baseDate = parseISO(editingRecord.startTime!);
                const dayStart = startOfDay(baseDate);
                const dayEnd = endOfDay(baseDate);

                // Clear any current daily records on this date (both old work and any absence)
                const existingRecordsOnDay = attendances.filter(a =>
                    a.therapistId === targetTherapistId &&
                    a.startTime &&
                    isWithinInterval(parseISO(a.startTime), { start: dayStart, end: dayEnd })
                );

                for (const rec of existingRecordsOnDay) {
                    if (rec.id) {
                        try {
                            await deleteAttendance(rec.id, adminInfo);
                        } catch (delErr) {
                            console.warn("Could not delete existing day record:", delErr);
                        }
                    }
                }

                // Fallback direct delete
                try {
                    await supabase
                        .from('attendance')
                        .delete()
                        .eq('therapist_id', targetTherapistId)
                        .gte('start_time', dayStart.toISOString())
                        .lte('start_time', dayEnd.toISOString());
                } catch (_) {}

                // Multi-block support for both new and edit operations
                for (const block of manualBlocks) {
                    if (!block.start || !block.end) continue;
                    
                    // If it's the placeholder '-', skip it
                    if (block.end === '—') continue;

                    const [sH, sM] = block.start.split(':').map(Number);
                    const [eH, eM] = block.end.split(':').map(Number);
                    
                    const blockStart = set(baseDate, { hours: sH, minutes: sM, seconds: 0, milliseconds: 0 });
                    const blockEnd = set(baseDate, { hours: eH, minutes: eM, seconds: 0, milliseconds: 0 });

                    const payload = {
                        userId: targetUserId,
                        therapistId: targetTherapistId,
                        startTime: blockStart.toISOString(),
                        endTime: blockEnd.toISOString(),
                        type: 'work',
                        notes: editingRecord.notes
                    };
                    
                    await addAttendance(payload as any, adminInfo);
                }
                showToast(isEditing ? "Registros actualizados correctamente" : "Jornada registrada correctamente", "success");
            }
            
            setIsEditModalOpen(false);
            setIsAbsenceModalOpen(false);
            setEditingRecord(null);
            setManualBlocks([]);
            fetchData();
        } catch (error: any) {
            console.error("Error saving attendance:", error);
            showToast(`Error al guardar el registro: ${error?.message || 'Error desconocido'}`, "error");
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
            showToast("Error al eliminar el registro.", "error");
        }
    };

    const daysInMonth = eachDayOfInterval({
        start: startOfMonth(parseISO(month + '-01')),
        end: endOfMonth(parseISO(month + '-01'))
    });

    const getDailyData = (day: Date, tId?: string) => {
        const targetId = tId || selectedTherapistId;
        const dDate = startOfDay(day);
        
        const dayAtts = attendances.filter(a => 
            a.therapistId === targetId &&
            a.startTime && isSameDay(parseISO(a.startTime), day)
        );
        const dayAppts = appointments.filter(a => 
            a.therapistId === targetId &&
            a.start && isSameDay(parseISO(a.start), day)
        );
        
        const workAtts = dayAtts
            .filter(a => a.type === 'work')
            .sort((a, b) => a.startTime.localeCompare(b.startTime));
        
        const absenceAtt = attendances.find(a => {
            if (a.type === 'work' || !a.startTime || (targetId && a.therapistId !== targetId)) return false;
            const sDate = startOfDay(parseISO(a.startTime));
            // If endTime exists, use it. Otherwise, assume it's a single day absence.
            const eDate = a.endTime ? endOfDay(parseISO(a.endTime)) : endOfDay(parseISO(a.startTime));
            return dDate >= sDate && dDate <= eDate;
        });

        const targetTherapist = therapists.find(t => t.id === targetId);
        const isSubjectToTimeTracking = targetTherapist ? targetTherapist.hasTimeTracking !== false && targetTherapist.isActive !== false : true;

        return {
            attendances: dayAtts,
            workAtts,
            absenceAtt,
            apptsCount: dayAppts.length,
            hasMissingClockIn: isSubjectToTimeTracking && dayAppts.length > 0 && workAtts.length === 0 && !absenceAtt && !isWeekend(day)
        };
    };

    const tableSummary = useMemo(() => {
        let totalMins = 0;
        let totalAppts = 0;
        let workedDaysCount = 0;
        let absenceDaysCount = 0;

        const isAll = selectedTherapistId === 'all';
        const items = isAll ? timeTrackingTherapists : daysInMonth;

        items.forEach(item => {
            const day = isAll ? parseISO(filterDate) : (item as Date);
            const therapist = isAll ? (item as Therapist) : therapists.find(t => t.id === selectedTherapistId);
            const { workAtts, absenceAtt, apptsCount } = getDailyData(day, isAll ? therapist?.id : undefined);

            totalAppts += apptsCount || 0;
            if (absenceAtt) absenceDaysCount++;
            if (workAtts && workAtts.length > 0) {
                workedDaysCount++;
                workAtts.forEach(att => {
                    if (att.startTime && att.endTime) {
                        try {
                            const m = differenceInMinutes(parseISO(att.endTime), parseISO(att.startTime));
                            if (m > 0) totalMins += m;
                        } catch (_) {}
                    }
                });
            }
        });

        const hours = Math.floor(totalMins / 60);
        const mins = totalMins % 60;
        const formattedHours = totalMins > 0 ? (mins > 0 ? `${hours}h ${mins}m` : `${hours}h`) : '0h';

        return {
            totalMins,
            formattedHours,
            totalAppts,
            workedDaysCount,
            absenceDaysCount
        };
    }, [selectedTherapistId, filterDate, daysInMonth, timeTrackingTherapists, therapists, attendances, appointments]);

    const handleDownloadSignedReport = async (report: MonthlyReportSignature & { therapistName?: string; isPending?: boolean; isInProgress?: boolean }) => {
        try {
            const reportTherapist = therapists.find(t => t.id === report.therapistId) || { 
                id: report.therapistId, 
                fullName: report.therapistName || 'Desconocido', 
                email: '', 
                phone: '', 
                specialty: '' 
            } as Therapist;

            const reportDays = eachDayOfInterval({
                start: startOfMonth(parseISO(report.month + '-01')),
                end: endOfMonth(parseISO(report.month + '-01'))
            });

            // Full data gathering for the print view
            const attData = await getAllAttendance(report.month, report.therapistId);
            const startDay = parseISO(`${report.month}-01`);
            const endDay = endOfMonth(startDay);
            const freshAppts = await getAppointments(startDay, endDay);
            const filteredAppts = freshAppts.filter(a => a.therapistId === report.therapistId && a.status !== 'Cancelada');

            const getReportDailyData = (day: Date) => {
                const dayAtts = attData.filter(a => a.startTime && isSameDay(parseISO(a.startTime), day));
                const dayAppts = filteredAppts.filter(a => a.start && isSameDay(parseISO(a.start), day));
                const workAtts = dayAtts
                    .filter(a => a.type === 'work')
                    .sort((a, b) => a.startTime.localeCompare(b.startTime));
                const absenceAtt = attData.find(a => {
                    if (a.type === 'work' || !a.startTime) return false;
                    const sDate = startOfDay(parseISO(a.startTime));
                    const eDate = a.endTime ? endOfDay(parseISO(a.endTime)) : endOfDay(parseISO(a.startTime));
                    const dDate = startOfDay(day);
                    return dDate >= sDate && dDate <= eDate;
                });
                return { workAtts, absenceAtt, apptsCount: dayAppts.length };
            };

            const signatureForPrint = (report.signedAt && !report.isPending && !report.isInProgress) ? report : null;

            setPrintData({
                month: report.month,
                therapist: reportTherapist,
                daysInMonth: reportDays,
                getDailyData: getReportDailyData,
                signature: signatureForPrint
            });
            setIsPrinting(true);
        } catch (err) {
            console.error("Error setting up print preview:", err);
            showToast("Error al preparar la vista de impresión.", "error");
        }
    };


    // Removed currentSignedReport as header download button was removed



    const addManualBlock = () => {
        setManualBlocks([...manualBlocks, { start: '09:00', end: '14:00' }]);
    };

    const removeManualBlock = (index: number) => {
        if (manualBlocks.length <= 1) return;
        setManualBlocks(manualBlocks.filter((_, i) => i !== index));
    };

    const updateManualBlock = (index: number, field: 'start' | 'end', value: string) => {
        const updated = [...manualBlocks];
        updated[index] = { ...updated[index], [field]: value };
        setManualBlocks(updated);
    };


    const currentMonthStr = format(new Date(), 'yyyy-MM');
    const previousMonthStr = format(subMonths(new Date(), 1), 'yyyy-MM');
    const effectiveMonth = month;
    const isViewingCurrentMonth = effectiveMonth === currentMonthStr;
    const isViewingPastMonth = effectiveMonth < currentMonthStr;

    const handlePrevMonth = () => {
        setShowAllHistory(false);
        const d = parseISO(`${month}-01`);
        setMonth(format(subMonths(d, 1), 'yyyy-MM'));
    };

    const handleNextMonth = () => {
        setShowAllHistory(false);
        const d = parseISO(`${month}-01`);
        setMonth(format(addMonths(d, 1), 'yyyy-MM'));
    };

    const handleSelectMonth = (targetMonth: string) => {
        setShowAllHistory(false);
        setMonth(targetMonth);
    };

    // Calculate pending count for previous closed month (for badge on tab)
    const prevMonthSignatures = signedReports.filter(r => r.month === previousMonthStr);
    const prevMonthPendingCount = timeTrackingTherapists.filter(t =>
        !prevMonthSignatures.some(r => r.therapistId === t.id)
    ).length;

    // Build complete report list for the selected month (effectiveMonth)
    const relevantTherapistsForMonth = therapists.filter(t => {
        if (selectedTherapistId !== 'all' && t.id !== selectedTherapistId) return false;
        const hasSig = signedReports.some(r => r.therapistId === t.id && r.month === effectiveMonth);
        if (hasSig) return true;
        // Exclude inactive therapists or therapists not subject to time tracking
        if (t.isActive === false || t.hasTimeTracking === false) return false;
        return true;
    });

    // Map each therapist to a unified MonthlyReport item for the selected month
    const monthGeneratedReports: (MonthlyReportSignature & {
        therapistName?: string;
        specialty?: string;
        activeDays?: number;
        apptsCount?: number;
        isPending?: boolean;
        isInProgress?: boolean;
        status?: 'signed' | 'pending' | 'in_progress';
    })[] = relevantTherapistsForMonth.map(t => {
        const existingSig = signedReports.find(r => r.therapistId === t.id && r.month === effectiveMonth);

        const therapistAtts = attendances.filter(a => a.type === 'work' && a.startTime && a.therapistId === t.id);
        const calculatedHours = therapistAtts.reduce((acc, curr) => {
            const s = parseISO(curr.startTime).getTime();
            const e = curr.endTime ? parseISO(curr.endTime).getTime() : Date.now();
            return acc + Math.max(0, (e - s) / (1000 * 60 * 60));
        }, 0);

        const activeDaysCount = new Set(therapistAtts.map(a => format(parseISO(a.startTime), 'yyyy-MM-dd'))).size;
        const apptsCount = appointments.filter(a => a.therapistId === t.id && a.status !== 'Cancelada').length;

        if (existingSig) {
            return {
                id: existingSig.id,
                therapistId: t.id,
                month: effectiveMonth,
                totalHours: existingSig.totalHours,
                signedAt: existingSig.signedAt,
                declaration: existingSig.declaration,
                signatureImage: existingSig.signatureImage,
                therapistName: t.fullName,
                specialty: t.specialty,
                activeDays: activeDaysCount,
                apptsCount,
                status: 'signed',
                isPending: false,
                isInProgress: false
            };
        } else {
            return {
                id: `pending-${t.id}-${effectiveMonth}`,
                therapistId: t.id,
                month: effectiveMonth,
                totalHours: Number(calculatedHours.toFixed(1)),
                signedAt: '',
                declaration: '',
                signatureImage: '',
                therapistName: t.fullName,
                specialty: t.specialty,
                activeDays: activeDaysCount,
                apptsCount,
                status: isViewingCurrentMonth ? 'in_progress' : 'pending',
                isPending: !isViewingCurrentMonth,
                isInProgress: isViewingCurrentMonth
            };
        }
    });

    // Also include any signed report for this month from therapists who might not be in relevantTherapistsForMonth
    signedReports
        .filter(r => r.month === effectiveMonth && (selectedTherapistId === 'all' || r.therapistId === selectedTherapistId))
        .forEach(r => {
            if (!monthGeneratedReports.some(item => item.therapistId === r.therapistId)) {
                monthGeneratedReports.push({
                    id: r.id,
                    therapistId: r.therapistId,
                    month: r.month,
                    totalHours: r.totalHours,
                    signedAt: r.signedAt,
                    declaration: r.declaration,
                    signatureImage: r.signatureImage,
                    therapistName: r.therapistName || 'Terapeuta',
                    specialty: therapists.find(t => t.id === r.therapistId)?.specialty || '',
                    activeDays: 0,
                    apptsCount: 0,
                    status: 'signed',
                    isPending: false,
                    isInProgress: false
                });
            }
        });

    // Historical reports (all time)
    const historicalSignedReports: (MonthlyReportSignature & {
        therapistName?: string;
        specialty?: string;
        activeDays?: number;
        apptsCount?: number;
        isPending?: boolean;
        isInProgress?: boolean;
        status?: 'signed' | 'pending' | 'in_progress';
    })[] = signedReports
        .filter(r => selectedTherapistId === 'all' || r.therapistId === selectedTherapistId)
        .map(r => ({
            ...r,
            specialty: therapists.find(t => t.id === r.therapistId)?.specialty,
            activeDays: 0,
            apptsCount: 0,
            status: 'signed',
            isPending: false,
            isInProgress: false
        }));

    const activeReportList = showAllHistory ? historicalSignedReports : monthGeneratedReports;

    // KPI Metrics for the selected month
    const sigTotalReports = monthGeneratedReports.length;
    const sigSignedCount = monthGeneratedReports.filter(r => r.status === 'signed').length;
    const sigPendingCount = monthGeneratedReports.filter(r => r.status === 'pending').length;
    const sigInProgressCount = monthGeneratedReports.filter(r => r.status === 'in_progress').length;
    const sigTotalHours = Number(monthGeneratedReports.reduce((acc, r) => acc + (r.totalHours || 0), 0).toFixed(1));
    const sigCompliancePercent = sigTotalReports > 0 ? Math.round((sigSignedCount / sigTotalReports) * 100) : 0;

    // Filter by sigStatusFilter
    const filteredSignedReports = activeReportList.filter(r => {
        if (sigStatusFilter === 'all') return true;
        if (sigStatusFilter === 'signed') return r.status === 'signed';
        if (sigStatusFilter === 'pending') return r.status === 'pending' || r.status === 'in_progress';
        return true;
    });

    // Sorting: Pending first, then signed descending by date, or alphabetical
    filteredSignedReports.sort((a, b) => {
        if (showAllHistory) {
            return b.month.localeCompare(a.month) || (b.signedAt || '').localeCompare(a.signedAt || '');
        }
        if (a.isPending && !b.isPending) return -1;
        if (!a.isPending && b.isPending) return 1;
        return (a.therapistName || '').localeCompare(b.therapistName || '');
    });

    return (
        <>
        <div className="workforce-report">
            {/* ── Modern 2-Tier Header ── */}
            <div className="workforce-header-container">
                {/* Tier 1: Primary Navigation Tabs & Actions */}
                <div className="wf-tier1-bar">
                    <div className="wf-primary-tabs">
                        <button
                            type="button"
                            className={`wf-tab-btn ${activeTab === 'daily' ? 'active' : ''}`}
                            onClick={() => setActiveTab('daily')}
                        >
                            <Clock size={18} />
                            <span>Presencia</span>
                        </button>
                        <button
                            type="button"
                            className={`wf-tab-btn ${activeTab === 'absences' ? 'active' : ''}`}
                            onClick={() => setActiveTab('absences')}
                        >
                            <Calendar size={18} />
                            <span>Ausencias</span>
                        </button>
                        {currentUser?.role === 'ADMIN' && (
                            <button
                                type="button"
                                className={`wf-tab-btn ${activeTab === 'signatures' ? 'active' : ''}`}
                                onClick={() => setActiveTab('signatures')}
                            >
                                <ShieldCheck size={18} />
                                <span>Firmas</span>
                                {prevMonthPendingCount > 0 && (
                                    <span className="tab-pending-badge" title={`${prevMonthPendingCount} firmas pendientes de meses cerrados`}>
                                        {prevMonthPendingCount}
                                    </span>
                                )}
                            </button>
                        )}
                    </div>

                    <div className="wf-tier1-actions">
                        {currentUser?.role === 'ADMIN' && (
                            <button
                                type="button"
                                className="btn-time-tracking-config"
                                onClick={() => setIsTimeTrackingModalOpen(true)}
                                title="Configurar qué terapeutas están sujetas a registro horario obligatorio"
                            >
                                <Users size={16} />
                                <span>Configurar Registro Horario</span>
                            </button>
                        )}
                        <button
                            type="button"
                            className="btn-absence"
                            onClick={() => {
                                const now = new Date();
                                const currentMonthStr = format(now, 'yyyy-MM');
                                const defaultDate = (month && month !== currentMonthStr) 
                                    ? startOfDay(parseISO(`${month}-01`)) 
                                    : startOfDay(now);
                                setEditingRecord({ 
                                    type: 'vacation', 
                                    startTime: defaultDate.toISOString(), 
                                    endTime: endOfDay(defaultDate).toISOString(),
                                    therapistId: selectedTherapistId !== 'all' ? selectedTherapistId : undefined
                                });
                                setIsAbsenceModalOpen(true);
                            }}
                        >
                            <CalendarDays size={16} />
                            <span>Registrar Ausencia</span>
                        </button>
                    </div>
                </div>

                {/* Tier 2: Contextual Controls Bar */}
                <div className="wf-context-controls">
                    {activeTab === 'daily' && (
                        <>
                            {selectedTherapistId === 'all' ? (
                                <div className="wf-filter-date">
                                    <Calendar size={16} />
                                    <input
                                        type="date"
                                        value={filterDate}
                                        onChange={e => {
                                            setFilterDate(e.target.value);
                                            if (e.target.value) {
                                                try {
                                                    setMonth(format(parseISO(e.target.value), 'yyyy-MM'));
                                                } catch (_) {}
                                            }
                                        }}
                                        className="wf-date-input"
                                    />
                                </div>
                            ) : (
                                <div className="wf-filter-date">
                                    <Calendar size={16} />
                                    <input
                                        type="month"
                                        value={month}
                                        onChange={e => {
                                            setShowAllHistory(false);
                                            setMonth(e.target.value);
                                        }}
                                        className="wf-date-input"
                                    />
                                </div>
                            )}
                            <select
                                className="wf-select-therapist"
                                value={selectedTherapistId}
                                onChange={e => setSelectedTherapistId(e.target.value)}
                            >
                                <option value="all">Todas las terapeutas con registro ({timeTrackingTherapists.length})</option>
                                {timeTrackingTherapists.map(t => <option key={t.id} value={t.id}>{t.fullName}</option>)}
                            </select>
                        </>
                    )}

                    {activeTab === 'absences' && (
                        <>
                            <div className="wf-filter-date">
                                <Calendar size={16} />
                                <input
                                    type="month"
                                    value={month}
                                    onChange={e => {
                                        setShowAllHistory(false);
                                        setMonth(e.target.value);
                                    }}
                                    className="wf-date-input"
                                />
                            </div>
                            <select
                                className="wf-select-therapist"
                                value={selectedTherapistId}
                                onChange={e => setSelectedTherapistId(e.target.value)}
                            >
                                <option value="all">Todas las terapeutas activas ({activeTherapists.length})</option>
                                {activeTherapists.map(t => <option key={t.id} value={t.id}>{t.fullName}</option>)}
                            </select>
                            <button
                                type="button"
                                className="btn-absence"
                                style={{ background: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0' }}
                                onClick={handleShowVacations}
                            >
                                <History size={16} />
                                <span>Ver Historial Completo</span>
                            </button>
                        </>
                    )}

                    {activeTab === 'signatures' && (
                        <div className="wf-sig-filter-bar">
                            <span className="wf-filter-label">Filtrar terapeuta:</span>
                            <select
                                className="wf-select-therapist"
                                value={selectedTherapistId}
                                onChange={e => setSelectedTherapistId(e.target.value)}
                            >
                                <option value="all">Todas las terapeutas con registro ({timeTrackingTherapists.length})</option>
                                {timeTrackingTherapists.map(t => <option key={t.id} value={t.id}>{t.fullName}</option>)}
                            </select>
                        </div>
                    )}
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
                                <div className="summary-card-label">Vacaciones / Festivos / Bajas</div>
                                <div className="summary-card-value">{attendances.filter(a => a.type !== 'work').length}</div>
                                <div style={{ fontSize: '0.65rem', color: '#78350f', marginTop: '4px', opacity: 0.8 }}>Haga clic para ver historial</div>
                            </div>
                        </div>

                        {/* ── Professional Table ── */}
                        <div className="wf-table-wrapper">
                            <table className="wf-table">
                                <thead>
                                    <tr>
                                        <th>{selectedTherapistId === 'all' ? 'Terapeuta' : 'Fecha'}</th>
                                        <th>Estado</th>
                                        <th>Entrada</th>
                                        <th>Salida</th>
                                        <th>Total Horas</th>
                                        <th>Citas</th>
                                        <th style={{ textAlign: 'right' }}>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr>
                                            <td colSpan={7}>
                                                <div className="wf-loading">
                                                    <div className="wf-spinner"></div>
                                                    <span className="wf-loading-text">Cargando registros...</span>
                                                </div>
                                            </td>
                                        </tr>
                                    ) : (
                                        (selectedTherapistId === 'all' ? timeTrackingTherapists : daysInMonth).map(item => {
                                            const isAll = selectedTherapistId === 'all';
                                            const day = isAll ? parseISO(filterDate) : (item as Date);
                                            const therapist = isAll ? (item as Therapist) : therapists.find(t => t.id === selectedTherapistId);
                                            
                                            const { workAtts, absenceAtt, apptsCount, hasMissingClockIn } = getDailyData(day, isAll ? therapist?.id : undefined);
                                            
                                            const dayMinutes = workAtts.reduce((acc, att) => {
                                                if (att.startTime && att.endTime) {
                                                    try {
                                                        const m = differenceInMinutes(parseISO(att.endTime), parseISO(att.startTime));
                                                        return m > 0 ? acc + m : acc;
                                                    } catch (_) {
                                                        return acc;
                                                    }
                                                }
                                                return acc;
                                            }, 0);

                                            const dayHours = Math.floor(dayMinutes / 60);
                                            const dayRemMins = dayMinutes % 60;
                                            const dayHoursStr = dayMinutes > 0 ? (dayRemMins > 0 ? `${dayHours}h ${dayRemMins}m` : `${dayHours}h`) : '—';

                                            const isToday = isSameDay(day, new Date());
                                            const weekend = isWeekend(day);

                                            if (!isAll && workAtts.length === 0 && !absenceAtt && !hasMissingClockIn && weekend) return null;

                                            const rowClass = [
                                                hasMissingClockIn ? 'wf-row-missing' : '',
                                                isToday && !isAll ? 'wf-row-today' : ''
                                            ].filter(Boolean).join(' ');

                                            const key = isAll ? therapist?.id : day.toISOString();

                                            return (
                                                <tr key={key} className={rowClass}>
                                                    <td>
                                                        {isAll ? (
                                                            <span className="wf-date-name" style={{ fontWeight: 600 }}>{therapist?.fullName}</span>
                                                        ) : (
                                                            <span className="wf-date-name">{format(day, "EEEE d", { locale: es })}</span>
                                                        )}
                                                        {isToday && !isAll && <span className="wf-date-today">HOY</span>}
                                                    </td>
                                                    <td>
                                                        {absenceAtt ? (
                                                            <span className={`wf-badge ${absenceAtt.type === 'vacation' ? 'wf-badge-vacation' : absenceAtt.type === 'holiday' ? 'wf-badge-holiday' : 'wf-badge-sick'}`}>
                                                                {absenceAtt.type === 'vacation' ? 'Vacaciones' : absenceAtt.type === 'holiday' ? 'Festivo' : 'Baja'}
                                                            </span>
                                                        ) : workAtts.length > 0 ? (
                                                            <span className="wf-badge wf-badge-ok">
                                                                <CheckCircle2 size={10} /> {workAtts.length > 1 ? `${workAtts.length} Turnos` : 'Ok'}
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
                                                        <div className="wf-intervals-list">
                                                            {workAtts.map((att, idx) => (
                                                                <div key={att.id || idx} className="wf-time-entry">
                                                                    <ArrowDownRight size={14} className="wf-icon-in" />
                                                                    {format(parseISO(att.startTime), 'HH:mm')}
                                                                </div>
                                                            ))}
                                                            {workAtts.length === 0 && <span className="wf-time-dash">—</span>}
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <div className="wf-intervals-list">
                                                            {workAtts.map((att, idx) => (
                                                                <div key={att.id || idx} className="wf-time-entry">
                                                                    <ArrowUpRight size={14} className="wf-icon-out" />
                                                                    {att.endTime ? format(parseISO(att.endTime), 'HH:mm') : '—'}
                                                                </div>
                                                            ))}
                                                            {workAtts.length === 0 && <span className="wf-time-dash">—</span>}
                                                        </div>
                                                    </td>
                                                    <td>
                                                        {dayMinutes > 0 ? (
                                                            <span className="wf-hours-badge" title={`${(dayMinutes / 60).toFixed(2)} horas trabajadas`}>
                                                                <Clock size={12} className="wf-icon-clock" />
                                                                {dayHoursStr}
                                                            </span>
                                                        ) : (
                                                            <span className="wf-time-dash">—</span>
                                                        )}
                                                    </td>
                                                    <td>
                                                        {apptsCount > 0 ? (
                                                            <span className="wf-appts-pill">
                                                                <History size={12} /> {apptsCount}
                                                            </span>
                                                        ) : <span className="wf-time-dash">—</span>}
                                                    </td>
                                                    <td>
                                                        <div className="wf-row-actions">
                                                                                                      {workAtts.length > 0 ? (
                                                                <>
                                                                    <button 
                                                                        className="wf-action-btn wf-action-edit"
                                                                        onClick={() => {
                                                                            const sortedShifts = [...workAtts].sort((a, b) => a.startTime.localeCompare(b.startTime));
                                                                            setManualBlocks(sortedShifts.map(att => ({
                                                                                start: format(parseISO(att.startTime), 'HH:mm'),
                                                                                end: att.endTime ? format(parseISO(att.endTime), 'HH:mm') : '—'
                                                                            })));
                                                                            setEditingRecord({
                                                                                ...sortedShifts[0],
                                                                                type: 'work',
                                                                                therapistId: therapist?.id || sortedShifts[0].therapistId,
                                                                                endTime: sortedShifts[sortedShifts.length - 1].endTime || sortedShifts[0].startTime
                                                                            });
                                                                            setIsEditModalOpen(true);
                                                                        }}
                                                                        title="Editar jornada / Cambiar tipo"
                                                                    >
                                                                        <Edit2 size={15} />
                                                                    </button>
                                                                    <button 
                                                                        className="wf-action-btn wf-action-delete"
                                                                        onClick={() => handleDelete(workAtts[workAtts.length - 1].id!)}
                                                                        title="Eliminar último registro"
                                                                    >
                                                                        <Trash2 size={15} />
                                                                    </button>
                                                                </>
                                                            ) : absenceAtt ? (
                                                                <>
                                                                    <button 
                                                                        className="wf-action-btn wf-action-edit"
                                                                        onClick={() => {
                                                                            setEditingRecord({
                                                                                ...absenceAtt,
                                                                                therapistId: therapist?.id || absenceAtt.therapistId
                                                                            });
                                                                            setManualBlocks([{ start: '09:00', end: '14:00' }]);
                                                                            setIsEditModalOpen(true);
                                                                        }}
                                                                        title="Editar ausencia / Cambiar a jornada"
                                                                    >
                                                                        <Edit2 size={15} />
                                                                    </button>
                                                                    <button 
                                                                        className="wf-action-btn wf-action-delete"
                                                                        onClick={() => handleDelete(absenceAtt.id!)}
                                                                        title="Eliminar Ausencia"
                                                                    >
                                                                        <Trash2 size={15} />
                                                                    </button>
                                                                </>
                                                            ) : (
                                                                <button 
                                                                      className="wf-action-add"
                                                                      onClick={() => {
                                                                          const date = startOfDay(day);
                                                                          const dayIdx = day.getDay();
                                                                          let initialBlocks: WorkingHours[] = [];

                                                                          if (dayIdx !== 0 && therapist?.schedule) {
                                                                              const dayName = DAYS_OF_WEEK[dayIdx - 1];
                                                                              const daySched = therapist.schedule.find(s => 
                                                                                  s.day?.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") === 
                                                                                  dayName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                                                                              );
                                                                              if (daySched?.enabled && daySched.blocks.length > 0) {
                                                                                  initialBlocks = [...daySched.blocks];
                                                                              }
                                                                          }

                                                                          if (initialBlocks.length === 0) {
                                                                              initialBlocks = [{ start: '09:00', end: '14:00' }];
                                                                          }

                                                                          setManualBlocks(initialBlocks);
                                                                          setEditingRecord({ 
                                                                              startTime: date.toISOString(), 
                                                                              endTime: endOfDay(date).toISOString(),
                                                                              type: 'work',
                                                                              therapistId: therapist?.id
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
                                {!loading && (
                                    <tfoot>
                                        <tr className="wf-table-footer">
                                            <td>
                                                <div className="wf-footer-total-label">
                                                    <strong>Total {selectedTherapistId === 'all' ? 'del día' : 'del mes'}</strong>
                                                    <span className="wf-footer-subtext">
                                                        {selectedTherapistId === 'all' 
                                                            ? `${timeTrackingTherapists.length} profesionales` 
                                                            : `${daysInMonth.length} días naturales`}
                                                    </span>
                                                </div>
                                            </td>
                                            <td>
                                                <span className="wf-footer-stat">
                                                    {tableSummary.workedDaysCount} {tableSummary.workedDaysCount === 1 ? 'día trabajado' : 'días trabajados'}
                                                </span>
                                            </td>
                                            <td><span className="wf-time-dash">—</span></td>
                                            <td><span className="wf-time-dash">—</span></td>
                                            <td>
                                                <div className="wf-footer-hours" title={`${(tableSummary.totalMins / 60).toFixed(2)} horas acumuladas`}>
                                                    <Clock size={14} className="wf-icon-clock" />
                                                    <strong>{tableSummary.formattedHours}</strong>
                                                </div>
                                            </td>
                                            <td>
                                                <div className="wf-footer-appts">
                                                    <History size={13} />
                                                    <strong>{tableSummary.totalAppts} {tableSummary.totalAppts === 1 ? 'cita' : 'citas'}</strong>
                                                </div>
                                            </td>
                                            <td></td>
                                        </tr>
                                    </tfoot>
                                )}
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
                                            {selectedTherapistId === 'all' 
                                                ? `Resumen de ausencias en ${format(parseISO(month + '-01'), 'MMMM yyyy', { locale: es })}`
                                                : `Resumen mensual de ${therapists.find(t => t.id === selectedTherapistId)?.fullName}`
                                            }
                                        </p>
                                    </div>
                                </div>

                                <div className="holidays-grid">
                                    {['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'].map(d => (
                                        <div key={d} className="holidays-grid-day-label">{d}</div>
                                    ))}
                                    {daysInMonth.map(day => {
                                        const dDate = startOfDay(day);
                                        const dayAbsences = attendances.filter(a => {
                                            if (!a.startTime || a.type === 'work') return false;
                                            if (selectedTherapistId !== 'all' && a.therapistId !== selectedTherapistId) return false;
                                            const sDate = startOfDay(parseISO(a.startTime));
                                            const eDate = a.endTime ? endOfDay(parseISO(a.endTime)) : endOfDay(parseISO(a.startTime));
                                            return dDate >= sDate && dDate <= eDate;
                                        });

                                        const isVacation = dayAbsences.some(a => a.type === 'vacation');
                                        const isHoliday = dayAbsences.some(a => a.type === 'holiday');
                                        const isSick = dayAbsences.some(a => a.type === 'sick_leave');
                                        const isToday = isSameDay(day, new Date());

                                        const dayClass = [
                                            'holiday-day',
                                            isVacation ? 'holiday-day-vacation' : '',
                                            isHoliday ? 'holiday-day-holiday' : '',
                                            isSick ? 'holiday-day-sick' : '',
                                            dayAbsences.length === 0 && isWeekend(day) ? 'holiday-day-weekend' : '',
                                            isToday && dayAbsences.length === 0 ? 'holiday-day-today' : ''
                                        ].filter(Boolean).join(' ');

                                        return (
                                            <div 
                                                key={day.toISOString()} 
                                                className={dayClass}
                                                onClick={() => {
                                                    if (dayAbsences.length > 0) {
                                                        setSelectedDayAbsences({ 
                                                            day, 
                                                            absences: dayAbsences.map(abs => ({
                                                                ...abs,
                                                                therapistName: therapists.find(t => t.id === abs.therapistId)?.fullName
                                                            }))
                                                        });
                                                    }
                                                }}
                                                style={{ cursor: dayAbsences.length > 0 ? 'pointer' : 'default' }}
                                            >
                                                <span className="holiday-day-number">{format(day, 'd')}</span>
                                                {dayAbsences.length > 0 && <div className="holiday-day-dot" />}
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
                                        <div className="legend-dot legend-dot-holiday" />
                                        <span className="legend-label">Festivo</span>
                                    </div>
                                    <div className="legend-item">
                                        <div className="legend-dot legend-dot-sick" />
                                        <span className="legend-label">Baja Médica</span>
                                    </div>
                                </div>
                            </div>

                            {/* ── Absence Detail Card & History ── */}
                            <div className="absence-right-column">
                                <div className="absence-detail-card" style={{ marginBottom: '1.5rem' }}>
                                    {selectedDayAbsences ? (
                                        <div className="animate-in">
                                            <div className="detail-header">
                                                <Calendar size={18} />
                                                <span style={{ fontWeight: 600 }}>Ausencias del {format(selectedDayAbsences.day, 'd MMMM', { locale: es })}</span>
                                                <button 
                                                    className="btn-close-minimal"
                                                    onClick={() => setSelectedDayAbsences(null)}
                                                    style={{ marginLeft: 'auto', border: 'none', background: 'transparent', cursor: 'pointer', opacity: 0.5 }}
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                            <div className="detail-list" style={{ marginTop: '0.75rem' }}>
                                                {selectedDayAbsences.absences.map(abs => (
                                                    <div key={abs.id} className="detail-item" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0', borderBottom: '1px solid #f1f5f9' }}>
                                                        <div className={`detail-indicator`} style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: abs.type === 'vacation' ? '#0ea5e9' : '#ef4444' }} />
                                                        <div className="detail-info">
                                                            <div className="detail-name" style={{ fontWeight: 500, fontSize: '0.9rem' }}>{abs.therapistName}</div>
                                                            <div className="detail-type" style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                                                {abs.type === 'vacation' ? 'Vacaciones' : abs.type === 'holiday' ? 'Festivo' : 'Baja médica'}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="absence-empty-state" style={{ textAlign: 'center', padding: '1.5rem', color: '#94a3b8' }}>
                                            <Info size={32} style={{ margin: '0 auto 0.75rem', opacity: 0.5 }} />
                                            <p style={{ fontSize: '0.85rem' }}>Seleccione un día marcado en el calendario para ver detalles.</p>
                                        </div>
                                    )}
                                </div>

                                <div className="wf-table-wrapper" style={{ maxHeight: '350px', overflowY: 'auto' }}>
                                    <div className="wf-history-header">
                                        <h3 className="wf-history-title">
                                            Historial {selectedTherapistId === 'all' ? 'Mensual' : 'Anual'}
                                        </h3>
                                        <button 
                                            className="wf-btn-minimal" 
                                            onClick={handleShowVacations}
                                        >
                                            Ver Todo
                                        </button>
                                    </div>
                                    <table className="wf-table" style={{ fontSize: '0.85rem' }}>
                                        <thead style={{ position: 'sticky', top: 0, zIndex: 1, background: '#f8fafc' }}>
                                            <tr>
                                                <th>Terapeuta</th>
                                                <th>Fecha</th>
                                                <th>Tipo</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {allVacations.length === 0 ? (
                                                <tr>
                                                    <td colSpan={3} style={{ textAlign: 'center', padding: '1rem', color: '#64748b', fontSize: '0.8rem' }}>
                                                        Cargando historial...
                                                    </td>
                                                </tr>
                                            ) : (
                                                allVacations.map(v => (
                                                    <tr key={v.id}>
                                                        <td style={{ fontWeight: 500 }}>{therapists.find(t => t.id === v.therapistId)?.fullName || '—'}</td>
                                                        <td>
                                                            {v.startTime ? format(parseISO(v.startTime), 'dd/MM/yyyy') : '—'}
                                                        </td>
                                                        <td>
                                                            <span className={`wf-badge ${v.type === 'vacation' ? 'wf-badge-vacation' : v.type === 'holiday' ? 'wf-badge-holiday' : 'wf-badge-sick'}`} style={{ fontSize: '0.65rem', padding: '0px 4px' }}>
                                                                {v.type === 'vacation' ? 'VAC' : v.type === 'holiday' ? 'FEST' : 'BAJA'}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'signatures' && currentUser?.role === 'ADMIN' && (
                    <div className="animate-in">
                        {/* ── Period Selector Bar ── */}
                        <div className="wf-period-bar">
                            <div className="wf-period-left">
                                <div className="wf-month-nav-group">
                                    <button 
                                        type="button" 
                                        className="wf-nav-arrow-btn" 
                                        onClick={handlePrevMonth} 
                                        title="Mes anterior"
                                    >
                                        <ChevronLeft size={16} />
                                    </button>
                                    <input
                                        type="month"
                                        value={month}
                                        onChange={e => handleSelectMonth(e.target.value)}
                                        className="wf-month-input-direct"
                                    />
                                    <button 
                                        type="button" 
                                        className="wf-nav-arrow-btn" 
                                        onClick={handleNextMonth} 
                                        title="Mes siguiente"
                                    >
                                        <ChevronRight size={16} />
                                    </button>
                                </div>

                                <div className="wf-period-pills">
                                    <button
                                        type="button"
                                        className={`wf-period-pill ${!showAllHistory && month === previousMonthStr ? 'active' : ''}`}
                                        onClick={() => handleSelectMonth(previousMonthStr)}
                                    >
                                        <Calendar size={13} />
                                        <span>{format(parseISO(`${previousMonthStr}-01`), "MMMM yyyy", { locale: es })}</span>
                                        <span className="pill-tag">Mes cerrado</span>
                                    </button>
                                    <button
                                        type="button"
                                        className={`wf-period-pill ${!showAllHistory && month === currentMonthStr ? 'active' : ''}`}
                                        onClick={() => handleSelectMonth(currentMonthStr)}
                                    >
                                        <Clock size={13} />
                                        <span>{format(parseISO(`${currentMonthStr}-01`), "MMMM yyyy", { locale: es })}</span>
                                        <span className="pill-tag">En curso</span>
                                    </button>
                                    <button
                                        type="button"
                                        className={`wf-period-pill ${showAllHistory ? 'active' : ''}`}
                                        onClick={() => setShowAllHistory(true)}
                                    >
                                        <FileText size={13} />
                                        <span>Histórico General</span>
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* ── KPI Summary Cards ── */}
                        {!showAllHistory && (
                            <div className="wf-sig-kpis">
                                <div className="wf-sig-kpi-card wf-sig-kpi-blue">
                                    <div className="wf-sig-kpi-icon">
                                        <Users size={22} />
                                    </div>
                                    <div className="wf-sig-kpi-content">
                                        <span className="wf-sig-kpi-label">Plantilla / Informes</span>
                                        <span className="wf-sig-kpi-value">{sigTotalReports}</span>
                                        <span className="wf-sig-kpi-sub">Terapeutas en {format(parseISO(`${effectiveMonth}-01`), "MMMM", { locale: es })}</span>
                                    </div>
                                </div>

                                <div className="wf-sig-kpi-card wf-sig-kpi-green">
                                    <div className="wf-sig-kpi-icon">
                                        <CheckCircle2 size={22} />
                                    </div>
                                    <div className="wf-sig-kpi-content">
                                        <span className="wf-sig-kpi-label">Firmados</span>
                                        <span className="wf-sig-kpi-value">{sigSignedCount}</span>
                                        <span className="wf-sig-kpi-sub">{sigCompliancePercent}% completado</span>
                                    </div>
                                </div>

                                <div className="wf-sig-kpi-card wf-sig-kpi-amber">
                                    <div className="wf-sig-kpi-icon">
                                        <AlertCircle size={22} />
                                    </div>
                                    <div className="wf-sig-kpi-content">
                                        <span className="wf-sig-kpi-label">
                                            {isViewingCurrentMonth ? 'En Progreso' : 'Pendientes de Firma'}
                                        </span>
                                        <span className="wf-sig-kpi-value">
                                            {isViewingCurrentMonth ? sigInProgressCount : sigPendingCount}
                                        </span>
                                        <span className="wf-sig-kpi-sub">
                                            {isViewingCurrentMonth ? 'Cierre a fin de mes' : 'Requieren firma'}
                                        </span>
                                    </div>
                                </div>

                                <div className="wf-sig-kpi-card wf-sig-kpi-purple">
                                    <div className="wf-sig-kpi-icon">
                                        <Clock size={22} />
                                    </div>
                                    <div className="wf-sig-kpi-content">
                                        <span className="wf-sig-kpi-label">Horas Totales</span>
                                        <span className="wf-sig-kpi-value">{sigTotalHours}h</span>
                                        <span className="wf-sig-kpi-sub">Actividad registrada</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ── Pending Signatures Alert Banner (if past month with pending) ── */}
                        {isViewingPastMonth && sigPendingCount > 0 && !showAllHistory && (
                            <div className="mb-6 p-4 rounded-xl border bg-amber-50 border-amber-200">
                                <div className="flex items-center gap-2 font-semibold mb-2 text-amber-800">
                                    <AlertCircle size={20} />
                                    <span>Pendientes de Firma en {format(parseISO(`${effectiveMonth}-01`), "MMMM yyyy", { locale: es })} ({sigPendingCount})</span>
                                </div>
                                <p className="text-sm mb-3 text-amber-700">
                                    El mes ya ha finalizado. Los siguientes profesionales tienen jornada laboral computada pero aún no han firmado su reporte mensual:
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {monthGeneratedReports.filter(r => r.status === 'pending').map(t => (
                                        <span 
                                            key={t.id} 
                                            className="px-3 py-1 bg-white border border-amber-300 text-amber-800 text-xs rounded-full font-medium shadow-sm flex items-center gap-1.5"
                                        >
                                            <AlertCircle size={11} className="text-amber-500" />
                                            {t.therapistName} ({t.totalHours}h)
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* ── Toolbar: Filters & View Mode ── */}
                        <div className="wf-sig-toolbar">
                            <div className="wf-sig-filters">
                                <button
                                    type="button"
                                    className={`wf-sig-filter-btn ${sigStatusFilter === 'all' ? 'active' : ''}`}
                                    onClick={() => setSigStatusFilter('all')}
                                >
                                    <span>Todos</span>
                                    <span className="wf-sig-filter-count">{activeReportList.length}</span>
                                </button>
                                <button
                                    type="button"
                                    className={`wf-sig-filter-btn ${sigStatusFilter === 'signed' ? 'active' : ''}`}
                                    onClick={() => setSigStatusFilter('signed')}
                                >
                                    <span>Firmados</span>
                                    <span className="wf-sig-filter-count">
                                        {activeReportList.filter(r => r.status === 'signed').length}
                                    </span>
                                </button>
                                {!showAllHistory && (
                                    <button
                                        type="button"
                                        className={`wf-sig-filter-btn ${sigStatusFilter === 'pending' ? 'active' : ''}`}
                                        onClick={() => setSigStatusFilter('pending')}
                                    >
                                        <span>{isViewingCurrentMonth ? 'En Curso' : 'Pendientes'}</span>
                                        <span className="wf-sig-filter-count">
                                            {activeReportList.filter(r => r.status === 'pending' || r.status === 'in_progress').length}
                                        </span>
                                    </button>
                                )}
                            </div>

                            <div className="wf-view-toggle">
                                <button
                                    type="button"
                                    className={`wf-view-btn ${sigViewMode === 'cards' ? 'active' : ''}`}
                                    onClick={() => setSigViewMode('cards')}
                                    title="Vista Fichas Visuales"
                                >
                                    <LayoutGrid size={15} />
                                    <span>Fichas</span>
                                </button>
                                <button
                                    type="button"
                                    className={`wf-view-btn ${sigViewMode === 'table' ? 'active' : ''}`}
                                    onClick={() => setSigViewMode('table')}
                                    title="Vista Tabla"
                                >
                                    <List size={15} />
                                    <span>Tabla</span>
                                </button>
                            </div>
                        </div>

                        {/* ── Content View ── */}
                        {filteredSignedReports.length === 0 ? (
                            <div className="wf-sig-empty-state">
                                <div className="wf-sig-empty-icon">
                                    <FileText size={28} />
                                </div>
                                <h4 className="wf-sig-empty-title">No hay reportes para este criterio</h4>
                                <p className="wf-sig-empty-desc">
                                    {showAllHistory 
                                        ? 'No se encontraron reportes firmados en el historial general con los filtros seleccionados.'
                                        : `No hay actividad ni reportes registrados en ${format(parseISO(`${effectiveMonth}-01`), "MMMM 'de' yyyy", { locale: es })} para el filtro aplicado.`}
                                </p>
                            </div>
                        ) : sigViewMode === 'cards' ? (
                            /* ── Document Cards Grid ── */
                            <div className="wf-doc-grid">
                                {filteredSignedReports.map(report => (
                                    <div key={`${report.id}-${report.month}-${report.therapistId}`} className={`wf-doc-card ${report.status || (report.isPending ? 'pending' : report.isInProgress ? 'in_progress' : 'signed')}`}>
                                        {/* Card Header */}
                                        <div className="wf-doc-card-header">
                                            <div className="wf-doc-period">
                                                <Calendar size={14} />
                                                <span>{format(parseISO(`${report.month}-01`), "MMMM yyyy", { locale: es }).toUpperCase()}</span>
                                            </div>
                                            <div className="wf-doc-status-badge">
                                                {report.status === 'signed' || (!report.isPending && !report.isInProgress && report.signedAt) ? (
                                                    <span className="wf-badge wf-badge-ok">
                                                        <CheckCircle2 size={11} /> Firmado
                                                    </span>
                                                ) : report.status === 'pending' || report.isPending ? (
                                                    <span className="wf-badge wf-badge-missing" style={{ animation: 'none' }}>
                                                        <AlertCircle size={11} /> Pendiente
                                                    </span>
                                                ) : (
                                                    <span className="wf-badge wf-badge-in-progress">
                                                        <Clock size={11} /> En Curso
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Therapist Profile */}
                                        <div className="wf-doc-therapist">
                                            <div className="wf-doc-avatar">
                                                {(report.therapistName || 'T').substring(0, 2).toUpperCase()}
                                            </div>
                                            <div className="wf-doc-info">
                                                <h4 className="wf-doc-name">{report.therapistName}</h4>
                                                <span className="wf-doc-role">{report.specialty || 'Profesional'}</span>
                                            </div>
                                        </div>

                                        {/* Metrics Strip */}
                                        <div className="wf-doc-metrics">
                                            <div className="wf-doc-metric">
                                                <span className="wf-doc-metric-label">Horas</span>
                                                <span className="wf-doc-metric-val">{report.totalHours}h</span>
                                            </div>
                                            <div className="wf-doc-metric">
                                                <span className="wf-doc-metric-label">Días</span>
                                                <span className="wf-doc-metric-val">{report.activeDays || '—'}</span>
                                            </div>
                                            <div className="wf-doc-metric">
                                                <span className="wf-doc-metric-label">Citas</span>
                                                <span className="wf-doc-metric-val">{report.apptsCount || '—'}</span>
                                            </div>
                                        </div>

                                        {/* Signature Box */}
                                        <div className="wf-doc-signature-box">
                                            {report.status === 'signed' || (!report.isPending && !report.isInProgress && report.signedAt) ? (
                                                <div className="wf-doc-signature-content">
                                                    {report.signatureImage ? (
                                                        <img
                                                            src={report.signatureImage}
                                                            alt="Firma"
                                                            className="wf-doc-signature-img"
                                                        />
                                                    ) : (
                                                        <span className="wf-doc-signature-placeholder">Firma digital registrada</span>
                                                    )}
                                                    <div className="wf-doc-signature-footer">
                                                        <ShieldCheck size={13} />
                                                        <span>Firmado el {report.signedAt ? new Date(report.signedAt).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</span>
                                                    </div>
                                                </div>
                                            ) : report.status === 'pending' || report.isPending ? (
                                                <div className="wf-doc-signature-pending">
                                                    <AlertCircle size={18} className="text-amber-500 mb-1" />
                                                    <span className="pending-title">Firma Pendiente</span>
                                                    <span className="pending-desc">Mes cerrado. Requiere firma del trabajador.</span>
                                                </div>
                                            ) : (
                                                <div className="wf-doc-signature-in-progress">
                                                    <Clock size={18} className="text-sky-500 mb-1" />
                                                    <span className="in-progress-title">Periodo en curso</span>
                                                    <span className="in-progress-desc">La firma se generará al finalizar el mes.</span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Actions */}
                                        <div className="wf-doc-actions">
                                            <button
                                                type="button"
                                                className="btn-export wf-doc-btn-main"
                                                onClick={() => handleDownloadSignedReport(report)}
                                            >
                                                <Printer size={15} />
                                                <span>
                                                    {report.status === 'signed' || (!report.isPending && !report.isInProgress) 
                                                        ? 'Ver / Imprimir PDF' 
                                                        : 'Ver Borrador PDF'}
                                                </span>
                                            </button>
                                            <button
                                                type="button"
                                                className="btn-absence"
                                                style={{ padding: '0.45rem 0.75rem', fontSize: '0.78rem', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}
                                                onClick={() => setPreviewSigningTherapistId(report.therapistId)}
                                                title="Ver cómo le aparece la pantalla de firma a esta terapeuta"
                                            >
                                                <PenTool size={14} />
                                                <span>Pantalla de firma</span>
                                            </button>
                                            {(report.status === 'signed' || (!report.isPending && !report.isInProgress)) && (
                                                <button
                                                    type="button"
                                                    className="wf-doc-btn-sub"
                                                    onClick={() => handleDownloadSignedReport(report)}
                                                    title="Descargar documento"
                                                >
                                                    <Download size={15} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            /* ── Detailed Table View ── */
                            <div className="wf-table-wrapper">
                                <table className="wf-table">
                                    <thead>
                                        <tr>
                                            <th>Terapeuta</th>
                                            <th>Periodo</th>
                                            <th>Horas</th>
                                            <th>Fecha Firma</th>
                                            <th>Firma Digital</th>
                                            <th>Estado / Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredSignedReports.map(report => (
                                            <tr key={`${report.id}-${report.month}-${report.therapistId}`} style={report.isPending || report.isInProgress ? { backgroundColor: report.isInProgress ? '#f0f9ff' : '#fffbeb' } : {}}>
                                                <td>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                                        <div className="wf-doc-avatar" style={{ width: '32px', height: '32px', fontSize: '0.75rem', borderRadius: '10px' }}>
                                                            {(report.therapistName || 'T').substring(0, 2).toUpperCase()}
                                                        </div>
                                                        <div>
                                                            <div style={{ fontWeight: 600 }}>{report.therapistName}</div>
                                                            {report.specialty && <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{report.specialty}</div>}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td>
                                                    <span style={{ fontWeight: 600, color: '#334155' }}>
                                                        {format(parseISO(`${report.month}-01`), "MMMM yyyy", { locale: es })}
                                                    </span>
                                                </td>
                                                <td><strong>{report.totalHours}h</strong></td>
                                                <td style={{ fontSize: '0.85rem' }}>
                                                    {report.isInProgress ? (
                                                        <span className="text-sky-600 font-medium">En curso...</span>
                                                    ) : report.isPending ? (
                                                        <span className="text-amber-600 font-medium">No firmado</span>
                                                    ) : report.signedAt ? (
                                                        new Date(report.signedAt).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
                                                    ) : '—'}
                                                </td>
                                                <td>
                                                    {report.isInProgress ? (
                                                        <span className="wf-badge wf-badge-in-progress">EN CURSO</span>
                                                    ) : report.isPending ? (
                                                        <span className="wf-badge wf-badge-missing" style={{ animation: 'none' }}>PENDIENTE</span>
                                                    ) : report.signatureImage ? (
                                                        <img
                                                            src={report.signatureImage}
                                                            alt="Firma"
                                                            style={{ height: '30px', borderRadius: '4px', border: '1px solid #e5e7eb', background: '#fff' }}
                                                        />
                                                    ) : (
                                                        <span className="text-gray-400 text-xs">Sin imagen</span>
                                                    )}
                                                </td>
                                                <td>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        {report.isInProgress ? (
                                                            <span className="wf-badge wf-badge-in-progress" style={{ fontSize: '0.7rem' }}>EN CURSO</span>
                                                        ) : report.isPending ? (
                                                            <span className="wf-badge wf-badge-missing" style={{ fontSize: '0.7rem', animation: 'none' }}>PENDIENTE</span>
                                                        ) : (
                                                            <span className="wf-badge wf-badge-ok" style={{ fontSize: '0.7rem' }}>✓ Firmado</span>
                                                        )}
                                                        <button
                                                            className="btn-export"
                                                            style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', padding: '4px 10px' }}
                                                            onClick={() => handleDownloadSignedReport(report)}
                                                        >
                                                            <Printer size={14} /> Imprimir PDF
                                                        </button>
                                                        <button
                                                            className="btn-absence"
                                                            style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', padding: '4px 10px', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}
                                                            onClick={() => setPreviewSigningTherapistId(report.therapistId)}
                                                            title="Ver cómo le aparece la pantalla de firma a esta terapeuta"
                                                        >
                                                            <PenTool size={14} /> Pantalla Firma
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </div>
            
            {/* Espaciador final para asegurar margen inferior visual */}
            <div style={{ height: '250px', width: '100%', flexShrink: 0 }} aria-hidden="true" />

            {/* ── Edit Modal ── */}
            <Modal
                isOpen={isEditModalOpen}
                onClose={() => {
                    setIsEditModalOpen(false);
                    setEditingRecord(null);
                }}
                title={
                    editingRecord?.type === 'work' 
                        ? (editingRecord?.id ? "Editar Registro de Jornada" : "Fichaje Manual")
                        : (editingRecord?.type === 'vacation' ? "Registrar Vacaciones" : editingRecord?.type === 'holiday' ? "Registrar Festivo" : "Registrar Baja Médica")
                }
            >
                <form onSubmit={handleSaveAttendance} className="wf-form">
                    <div>
                        <label className="wf-form-label">Tipo de Registro</label>
                        <div className="wf-type-selector">
                            <button 
                                type="button"
                                onClick={() => setEditingRecord({ ...editingRecord, type: 'work' })}
                                className={`wf-type-btn ${editingRecord?.type === 'work' ? 'active-work' : ''}`}
                            >
                                <Clock size={16} /> Jornada
                            </button>
                            <button 
                                type="button"
                                onClick={() => {
                                    const base = editingRecord?.startTime ? parseISO(editingRecord.startTime) : new Date();
                                    setEditingRecord({ 
                                        ...editingRecord, 
                                        type: 'vacation', 
                                        startTime: startOfDay(base).toISOString(),
                                        endTime: endOfDay(base).toISOString(),
                                        isGlobal: false
                                    });
                                }}
                                className={`wf-type-btn ${editingRecord?.type === 'vacation' ? 'active-vacation' : ''}`}
                            >
                                <Calendar size={16} /> Vacaciones
                            </button>
                            <button 
                                type="button"
                                onClick={() => {
                                    const base = editingRecord?.startTime ? parseISO(editingRecord.startTime) : new Date();
                                    setEditingRecord({ 
                                        ...editingRecord, 
                                        type: 'sick_leave', 
                                        startTime: startOfDay(base).toISOString(),
                                        endTime: endOfDay(base).toISOString(),
                                        isGlobal: false
                                    });
                                }}
                                className={`wf-type-btn ${editingRecord?.type === 'sick_leave' ? 'active-sick' : ''}`}
                            >
                                <AlertCircle size={16} /> Baja Médica
                            </button>
                            <button 
                                type="button"
                                onClick={() => {
                                    const base = editingRecord?.startTime ? parseISO(editingRecord.startTime) : new Date();
                                    setEditingRecord({ 
                                        ...editingRecord, 
                                        type: 'holiday', 
                                        startTime: startOfDay(base).toISOString(),
                                        endTime: endOfDay(base).toISOString(),
                                        isGlobal: false
                                    });
                                }}
                                className={`wf-type-btn ${editingRecord?.type === 'holiday' ? 'active-holiday' : ''}`}
                            >
                                <Sun size={16} /> Festivo
                            </button>
                        </div>
                    </div>

                    {editingRecord?.type === 'work' ? (
                        <div className="wf-manual-blocks">
                            <div className="wf-form-row" style={{ marginBottom: '1rem' }}>
                                <div>
                                    <label className="wf-form-label">Fecha</label>
                                    <input
                                        type="date"
                                        value={editingRecord?.startTime ? format(parseISO(editingRecord.startTime), "yyyy-MM-dd") : ''}
                                        onChange={e => {
                                            if (!e.target.value) return;
                                            const [y, m, d] = e.target.value.split('-').map(Number);
                                            if (!y || !m || !d) return;
                                            const newDate = startOfDay(new Date(y, m - 1, d));
                                            if (isNaN(newDate.getTime())) return;
                                            setEditingRecord({ ...editingRecord, startTime: newDate.toISOString() });
                                        }}
                                        className="wf-form-input"
                                        required
                                        disabled={!!editingRecord?.id} // Only allow date change for new entries
                                    />
                                </div>
                            </div>
                            
                            <label className="wf-form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                Tramos Horarios
                                <button type="button" onClick={addManualBlock} className="wf-btn-add-row">
                                    <Plus size={14} /> Añadir Tramo
                                </button>
                            </label>

                            {manualBlocks.map((block, idx) => (
                                <div key={idx} className="wf-form-row wf-block-row" style={{ alignItems: 'flex-end', gap: '0.5rem', marginBottom: '0.75rem' }}>
                                    <div style={{ flex: 1 }}>
                                        <label className="wf-form-label-small">Entrada</label>
                                        <input
                                            type="time"
                                            value={block.start}
                                            onChange={e => updateManualBlock(idx, 'start', e.target.value)}
                                            className="wf-form-input"
                                            required
                                        />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <label className="wf-form-label-small">Salida</label>
                                        <input
                                            type="time"
                                            value={block.end === '—' ? '' : block.end}
                                            onChange={e => updateManualBlock(idx, 'end', e.target.value)}
                                            className="wf-form-input"
                                            required
                                        />
                                    </div>
                                    {manualBlocks.length > 1 && (
                                        <button 
                                            type="button" 
                                            onClick={() => removeManualBlock(idx)} 
                                            className="wf-btn-remove-row"
                                            style={{ padding: '0.5rem', color: '#ef4444', background: '#fef2f2', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="wf-form-row" style={{ marginBottom: '1rem' }}>
                            <div>
                                <label className="wf-form-label">Fecha Inicio</label>
                                <input
                                    type="date"
                                    value={editingRecord?.startTime ? format(parseISO(editingRecord.startTime), "yyyy-MM-dd") : ''}
                                    onChange={e => {
                                        if (!e.target.value) return;
                                        const [y, m, d] = e.target.value.split('-').map(Number);
                                        if (!y || !m || !d) return;
                                        const newDate = startOfDay(new Date(y, m - 1, d));
                                        if (isNaN(newDate.getTime())) return;
                                        const currentEnd = editingRecord?.endTime ? parseISO(editingRecord.endTime) : null;
                                        const shouldUpdateEnd = !currentEnd || currentEnd < newDate;
                                        setEditingRecord({ 
                                            ...editingRecord, 
                                            startTime: newDate.toISOString(),
                                            ...(shouldUpdateEnd ? { endTime: endOfDay(newDate).toISOString() } : {})
                                        });
                                    }}
                                    className="wf-form-input"
                                    required
                                />
                            </div>
                            <div>
                                <label className="wf-form-label">Fecha Fin</label>
                                <input
                                    type="date"
                                    value={editingRecord?.endTime ? format(parseISO(editingRecord.endTime), "yyyy-MM-dd") : (editingRecord?.startTime ? format(parseISO(editingRecord.startTime), "yyyy-MM-dd") : '')}
                                    onChange={e => {
                                        if (!e.target.value) return;
                                        const [y, m, d] = e.target.value.split('-').map(Number);
                                        if (!y || !m || !d) return;
                                        const newDate = endOfDay(new Date(y, m - 1, d));
                                        if (isNaN(newDate.getTime())) return;
                                        setEditingRecord({ ...editingRecord, endTime: newDate.toISOString() });
                                    }}
                                    className="wf-form-input"
                                    required
                                />
                            </div>
                        </div>
                    )}

                    <div>
                        <label className="wf-form-label">Notas y Observaciones</label>
                        <textarea
                            value={editingRecord?.notes || ''}
                            onChange={e => setEditingRecord({ ...editingRecord, notes: e.target.value })}
                            className="wf-form-textarea"
                            placeholder="Detalles adicionales..."
                        />
                    </div>
                    <div className="wf-form-footer">
                        <button type="button" className="wf-btn-cancel" onClick={() => setIsEditModalOpen(false)}>Cancelar</button>
                        <button type="submit" className="wf-btn-save">
                            {editingRecord?.type === 'work' 
                                ? (editingRecord?.id ? 'Guardar Cambios' : 'Registrar Jornada') 
                                : `Guardar ${editingRecord?.type === 'vacation' ? 'Vacaciones' : editingRecord?.type === 'holiday' ? 'Festivo' : 'Baja'}`}
                        </button>
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
                                onClick={() => setEditingRecord({ ...editingRecord, type: 'vacation', isGlobal: false })}
                                className={`wf-type-btn ${editingRecord?.type === 'vacation' ? 'active-vacation' : ''}`}
                            >
                                <Calendar size={18} /> Vacaciones
                            </button>
                            <button 
                                type="button"
                                onClick={() => setEditingRecord({ ...editingRecord, type: 'holiday', isGlobal: selectedTherapistId === 'all' })}
                                className={`wf-type-btn ${editingRecord?.type === 'holiday' ? 'active-holiday' : ''}`}
                            >
                                <Sun size={18} /> Festivo
                            </button>
                            <button 
                                type="button"
                                onClick={() => setEditingRecord({ ...editingRecord, type: 'sick_leave', isGlobal: false })}
                                className={`wf-type-btn ${editingRecord?.type === 'sick_leave' ? 'active-sick' : ''}`}
                            >
                                <AlertCircle size={18} /> Baja Médica
                            </button>
                        </div>
                    </div>

                    {selectedTherapistId === 'all' && !editingRecord?.isGlobal && (
                        <div style={{ marginBottom: '1.25rem' }}>
                            <label className="wf-form-label">Terapeuta</label>
                            <select 
                                className="wf-form-input"
                                value={editingRecord?.therapistId || ''}
                                onChange={e => setEditingRecord({ ...editingRecord, therapistId: e.target.value })}
                                required
                            >
                                <option value="">Seleccionar terapeuta...</option>
                                {activeTherapists.map(t => (
                                    <option key={t.id} value={t.id}>{t.fullName}</option>
                                ))}
                            </select>
                        </div>
                    )}
                    {editingRecord?.type === 'holiday' && (
                        <div style={{ marginBottom: '1.25rem', padding: '0 0.5rem' }}>
                            <label className="flex items-center gap-3 cursor-pointer p-4 bg-amber-50 rounded-xl border border-amber-200 shadow-sm transition-all hover:bg-amber-100">
                                <input 
                                    type="checkbox" 
                                    className="w-5 h-5 text-amber-600 rounded border-amber-300"
                                    checked={editingRecord?.isGlobal || false}
                                    onChange={e => setEditingRecord({ ...editingRecord, isGlobal: e.target.checked })}
                                />
                                <div>
                                    <span className="font-bold text-amber-900 text-sm">Festivo Global</span>
                                    <p className="text-xs text-amber-700">Registrar para todas las terapeutas del equipo</p>
                                </div>
                            </label>
                        </div>
                    )}
                    <div className="wf-form-row">
                        <div>
                            <label className="wf-form-label">Fecha Inicio</label>
                            <input
                                type="date"
                                value={editingRecord?.startTime ? format(parseISO(editingRecord.startTime), "yyyy-MM-dd") : ''}
                                onChange={e => {
                                    if (!e.target.value) return;
                                    const [y, m, d] = e.target.value.split('-').map(Number);
                                    if (!y || !m || !d) return;
                                    const date = startOfDay(new Date(y, m - 1, d));
                                    if (isNaN(date.getTime())) return;
                                    const currentEnd = editingRecord?.endTime ? parseISO(editingRecord.endTime) : null;
                                    const shouldUpdateEnd = !currentEnd || currentEnd < date;
                                    setEditingRecord({ 
                                        ...editingRecord, 
                                        startTime: date.toISOString(),
                                        ...(shouldUpdateEnd ? { endTime: endOfDay(date).toISOString() } : {})
                                    });
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
                                    if (!e.target.value) return;
                                    const [y, m, d] = e.target.value.split('-').map(Number);
                                    if (!y || !m || !d) return;
                                    const date = endOfDay(new Date(y, m - 1, d));
                                    if (isNaN(date.getTime())) return;
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

            <Modal
                isOpen={isAdherenceModalOpen}
                onClose={() => setIsAdherenceModalOpen(false)}
                title="Advertencia de Horario"
            >
                <div style={{ padding: '1rem 0', textAlign: 'center' }}>
                    <div style={{ 
                        margin: '0 auto 1.5rem',
                        width: '64px',
                        height: '64px',
                        borderRadius: '50%',
                        backgroundColor: '#fffbeb',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#f59e0b',
                        border: '4px solid #fef3c7'
                    }}>
                        <AlertCircle size={32} />
                    </div>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1A5F7A', marginBottom: '0.5rem' }}>Fuera de Horario</h3>
                    <p style={{ color: '#64748b', fontSize: '0.9rem', lineHeight: '1.5', marginBottom: '1.5rem' }}>
                        El horario de este fichaje no coincide con el horario programado del terapeuta.
                        ¿Deseas guardar el registro de todas formas?
                    </p>
                    <div className="wf-form-footer" style={{ justifyContent: 'center', gap: '1rem' }}>
                        <button 
                            type="button" 
                            className="wf-btn-cancel" 
                            onClick={() => setIsAdherenceModalOpen(false)}
                            style={{ padding: '0.75rem 1.5rem', borderRadius: '12px' }}
                        >
                            Cancelar
                        </button>
                        <button 
                            type="button" 
                            className="wf-btn-save" 
                            onClick={() => {
                                setIsAdherenceModalOpen(false);
                                handleSaveAttendance(undefined, true);
                            }}
                            style={{ padding: '0.75rem 2rem', borderRadius: '12px' }}
                        >
                            Guardar de todas formas
                        </button>
                    </div>
                </div>
            </Modal>

            {/* ── Vacation History Modal ── */}
        <Modal
            isOpen={isVacationListModalOpen}
            onClose={() => setIsVacationListModalOpen(false)}
            title={`Historial de Ausencias: ${selectedTherapistId === 'all' ? 'Todo el Equipo' : (therapists.find(t => t.id === selectedTherapistId)?.fullName || 'Terapeuta')}`}
        >
            <div className="wf-vacation-list" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                {vacationLoading ? (
                    <div className="wf-loading"><div className="wf-spinner"></div></div>
                ) : allVacations.length === 0 ? (
                    <p style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                        No se han registrado periodos de vacaciones o bajas {selectedTherapistId === 'all' ? 'para el equipo' : 'para este terapeuta'}.
                    </p>
                ) : (
                    <table className="wf-table" style={{ width: '100%' }}>
                        <thead style={{ position: 'sticky', top: 0, zIndex: 1, background: '#f8fafc' }}>
                            <tr>
                                {selectedTherapistId === 'all' && <th>Terapeuta</th>}
                                <th>Fecha</th>
                                <th>Tipo</th>
                                <th>Notas</th>
                                <th style={{ textAlign: 'right' }}>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {allVacations.map(v => (
                                <tr key={v.id}>
                                    {selectedTherapistId === 'all' && (
                                        <td style={{ fontSize: '0.85rem', fontWeight: 500 }}>
                                            {therapists.find(t => t.id === v.therapistId)?.fullName || '—'}
                                        </td>
                                    )}
                                    <td style={{ fontSize: '0.85rem' }}>
                                        {v.startTime ? format(parseISO(v.startTime), 'dd/MM/yyyy') : '—'}
                                        {v.endTime && isSameDay(parseISO(v.startTime), parseISO(v.endTime)) ? '' : v.endTime ? ` al ${format(parseISO(v.endTime), 'dd/MM/yyyy')}` : ''}
                                    </td>
                                    <td>
                                        <span className={`wf-badge ${v.type === 'vacation' ? 'wf-badge-vacation' : v.type === 'holiday' ? 'wf-badge-holiday' : 'wf-badge-sick'}`}>
                                            {v.type === 'vacation' ? 'Vacaciones' : v.type === 'holiday' ? 'Festivo' : 'Baja'}
                                        </span>
                                    </td>
                                    <td style={{ fontSize: '0.8rem', color: '#64748b', maxWidth: '160px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={v.notes || ''}>
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
        
        {/* ── Print Preview Modal ── */}
        {isPrinting && printData && (
            <div className="modal-overlay" style={{ zIndex: 1100 }}>
                <div className="modal-content flex-layout" style={{ maxWidth: '900px', padding: 0, height: '90vh', display: 'flex', flexDirection: 'column' }}>
                    <div className="modal-header no-print" style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
                        <div className="flex items-center gap-2">
                            <Printer size={20} className="text-secondary" />
                            <h3 style={{ margin: 0 }}>Vista Previa de Impresión</h3>
                        </div>
                        <button className="btn-icon-round" onClick={() => setIsPrinting(false)}>
                            <X size={20} />
                        </button>
                    </div>

                    <div className="modal-body" style={{ flex: 1, overflowY: 'auto', backgroundColor: '#f1f5f9', padding: '2rem' }}>
                        <div className="print-preview-container" style={{ 
                            backgroundColor: 'white', 
                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', 
                            margin: '0 auto',
                            width: '210mm', /* A4 Width */
                            minHeight: '297mm' /* A4 Height */
                        }}>
                            <WorkforcePrintDocument {...printData} centerSettings={centerSettings} />
                        </div>
                    </div>

                    {/* Dedicated Print Portal (Only visible during window.print()) */}
                    <PrintPortal>
                        <div className="printable-document">
                            <WorkforcePrintDocument {...printData} centerSettings={centerSettings} />
                        </div>
                    </PrintPortal>

                    <div className="modal-footer no-print" style={{ padding: '1rem 1.5rem', borderTop: '1px solid #e2e8f0', justifyContent: 'flex-end' }}>
                        <button className="btn-secondary" onClick={() => setIsPrinting(false)}>Cancelar</button>
                        <button className="btn-primary flex items-center gap-2" onClick={() => window.print()}>
                            <Printer size={18} />
                            <span>Imprimir / Guardar PDF</span>
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* Modal Configurar Registro Horario */}
        {isTimeTrackingModalOpen && (
            <Modal
                isOpen={isTimeTrackingModalOpen}
                onClose={() => setIsTimeTrackingModalOpen(false)}
                title="Configurar Personal con Registro Horario"
            >
                <div className="time-tracking-modal">
                    <div className="time-tracking-help-banner">
                        <Info size={20} style={{ flexShrink: 0, marginTop: '2px' }} />
                        <div>
                            <strong style={{ display: 'block', marginBottom: '2px', color: '#1e3a8a' }}>Registro Horario Obligatorio</strong>
                            <p style={{ margin: 0, opacity: 0.9 }}>
                                Marca qué profesionales deben fichar su jornada diaria y firmar los informes mensuales.
                                Las terapeutas desmarcadas (p. ej. Ruth Torres Vega y Marta Vigil Vázquez) no figurarán en la lista diaria de presencia ni generarán informes mensuales pendientes de firma.
                            </p>
                        </div>
                    </div>

                    <div className="time-tracking-list">
                        {activeTherapists.map(therapist => {
                            const isTracking = therapist.hasTimeTracking !== false;
                            return (
                                <div key={therapist.id} className={`time-tracking-item ${isTracking ? 'is-active' : 'is-inactive'}`}>
                                    <div className="time-tracking-therapist-info">
                                        <div className="time-tracking-avatar">
                                            {therapist.fullName.charAt(0).toUpperCase()}
                                        </div>
                                        <div>
                                            <div className="time-tracking-name">{therapist.fullName}</div>
                                            <div className="time-tracking-specialty">{therapist.specialty || 'Terapeuta'}</div>
                                        </div>
                                    </div>

                                    <label className="time-tracking-toggle-label">
                                        <span className={`time-tracking-status-badge ${isTracking ? 'badge-on' : 'badge-off'}`}>
                                            {isTracking ? 'Registro Activo' : 'Sin Registro'}
                                        </span>
                                        <input
                                            type="checkbox"
                                            className="time-tracking-checkbox"
                                            checked={isTracking}
                                            onChange={async (e) => {
                                                const newVal = e.target.checked;
                                                try {
                                                    await updateTherapistTimeTracking(therapist.id, newVal);
                                                    setTherapists(prev => prev.map(t => t.id === therapist.id ? { ...t, hasTimeTracking: newVal } : t));
                                                    showToast(`${newVal ? 'Activado' : 'Desactivado'} registro horario para ${therapist.fullName}`, 'success');
                                                } catch (err: any) {
                                                    console.error(err);
                                                    showToast('Error al actualizar el registro horario', 'error');
                                                }
                                            }}
                                        />
                                    </label>
                                </div>
                            );
                        })}
                    </div>

                    <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                            type="button"
                            className="btn-export"
                            onClick={() => setIsTimeTrackingModalOpen(false)}
                        >
                            Guardar y Cerrar
                        </button>
                    </div>
                </div>
            </Modal>
        )}

        {/* Modal Simulación / Vista de Firma como Terapeuta */}
        {previewSigningTherapistId && (
            <SigningModal
                onClose={() => setPreviewSigningTherapistId(null)}
                therapistId={previewSigningTherapistId}
                initialMonth={effectiveMonth}
            />
        )}

        </>
    );
};

export default WorkforceReport;
