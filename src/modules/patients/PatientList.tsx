import React, { useEffect, useState, useRef, useMemo } from 'react';
import { getPatients, getPatientById, createPatient, updatePatient, deletePatient, deletePatientFile, uploadPatientFileContent, getPatientFileUrl } from './service';
import { supabase } from '../../lib/supabase';
import { generateConsentSheetPDF, generateClinicalHistoryPDF } from '../../utils/consentPdfGenerator';
import { getAppointmentsByPatient, deleteAppointmentsBatch } from '../calendar/service';
import { type Patient, type PatientFile } from './types';
import { type Appointment } from '../calendar/types';
import { getTherapists } from '../therapists/service';
import { type Therapist } from '../therapists/types';
import Card from '../../components/ui/Card';
import { User, Users, Phone, Mail, Search, UserPlus, X, Calendar, ClipboardList, FileText, Upload, Activity, Download, Send, ShieldCheck, ShieldAlert, Star, Trash2, Heart, ChevronDown, ChevronUp, AlertCircle, MessageSquare, Repeat, CheckCheck, Clock, Wallet, Coins, PlusCircle, ArrowDown, ArrowUp } from 'lucide-react';
import { format, parseISO, isValid, isAfter } from 'date-fns';
import { es } from 'date-fns/locale';
import { useToast } from '../../hooks/useToast';
import PrintPortal from '../../components/ui/PrintPortal';
import ConsentDocument from './ConsentDocument';
import { getTransactions, addPatientCredit, deletePatientCredit, computePatientBalances, isAdvanceDeposit, isSaldoConsumption } from '../billing/service';
import { type Transaction, type PatientBalanceInfo } from '../billing/types';
// import html2canvas from 'html2canvas'; // Unused
// import jsPDF from 'jspdf'; // Unused
import './PatientList.css';

const PatientList: React.FC = () => {
    const { showToast } = useToast();
    const [patients, setPatients] = useState<Patient[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedPatient, setSelectedPatient] = useState<Partial<Patient> | null>(null);
    const [activeTab, setActiveTab] = useState<'general' | 'appointments' | 'files' | 'history' | 'wallet'>('general');
    const [patientAppointments, setPatientAppointments] = useState<Appointment[]>([]);
    const [isPendingHistoryExpanded, setIsPendingHistoryExpanded] = useState(false);
    const [isConsentModalOpen, setIsConsentModalOpen] = useState(false);
    const [isConsentViewMode, setIsConsentViewMode] = useState(false);
    const [consentModalMode, setConsentModalMode] = useState<'consent' | 'history'>('consent');
    const [isSigned, setIsSigned] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; file: PatientFile | null }>({ isOpen: false, file: null });
    const [therapists, setTherapists] = useState<Therapist[]>([]);
    const [processingStep, setProcessingStep] = useState<string>('');
    const [patientDeleteConfirm, setPatientDeleteConfirm] = useState<{ isOpen: boolean; patient: Patient | null }>({ isOpen: false, patient: null });

    // Patient Wallet / Monedero / Becas states
    const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
    const [patientBalances, setPatientBalances] = useState<Map<string, PatientBalanceInfo>>(new Map());
    const [isAddCreditModalOpen, setIsAddCreditModalOpen] = useState(false);
    const [newCreditAmount, setNewCreditAmount] = useState<string>('');
    const [newCreditMethod, setNewCreditMethod] = useState<'Transferencia' | 'Tarjeta' | 'Efectivo'>('Transferencia');
    const [newCreditCategory, setNewCreditCategory] = useState<string>('Ingreso Beca MEC');
    const [newCreditDate, setNewCreditDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
    const [newCreditNotes, setNewCreditNotes] = useState<string>('');
    const [isSavingCredit, setIsSavingCredit] = useState(false);

    // Appointment management states
    const [selectedApptIds, setSelectedApptIds] = useState<Set<string>>(new Set());
    const [apptFilter, setApptFilter] = useState<'future' | 'past' | 'all'>('future');
    const [confirmDeleteApptsModal, setConfirmDeleteApptsModal] = useState<{ isOpen: boolean; appts: Appointment[] }>({ isOpen: false, appts: [] });
    const [isDeletingAppts, setIsDeletingAppts] = useState(false);

    const isFutureAppointment = (appt: Appointment) => {
        try {
            const dateStr = appt.end || appt.start;
            const d = parseISO(dateStr);
            if (!isValid(d)) return false;
            // Si la cita termina en el futuro, es futura/activa
            if (isAfter(d, new Date())) return true;

            // Si es hoy y su estado sigue en Programada o En Sesión, mantenerla en próximas/pendientes
            const todayStr = format(new Date(), 'yyyy-MM-dd');
            const apptDateStr = format(parseISO(appt.start), 'yyyy-MM-dd');
            if (apptDateStr === todayStr && (appt.status === 'Programada' || appt.status === 'En Sesión')) {
                return true;
            }
            return false;
        } catch {
            return false;
        }
    };

    const getApptRelativeLabel = (isoStr: string) => {
        try {
            const d = parseISO(isoStr);
            if (!isValid(d)) return null;
            const now = new Date();
            const todayStr = format(now, 'yyyy-MM-dd');
            const tomorrow = new Date(now);
            tomorrow.setDate(tomorrow.getDate() + 1);
            const tomorrowStr = format(tomorrow, 'yyyy-MM-dd');
            const dateStr = format(d, 'yyyy-MM-dd');

            if (dateStr === todayStr) return 'Hoy';
            if (dateStr === tomorrowStr) return 'Mañana';
            return null;
        } catch {
            return null;
        }
    };

    const formatApptDate = (isoStr: string) => {
        try {
            const d = parseISO(isoStr);
            if (!isValid(d)) return isoStr;
            const shortDay = format(d, 'EEE', { locale: es }).replace('.', '');
            const capDay = shortDay.charAt(0).toUpperCase() + shortDay.slice(1);
            return `${capDay}, ${format(d, 'dd/MM/yyyy')}`;
        } catch {
            return isoStr;
        }
    };

    const formatApptTime = (isoStr: string) => {
        try {
            const d = parseISO(isoStr);
            if (!isValid(d)) return '';
            return format(d, 'HH:mm');
        } catch {
            return '';
        }
    };

    const futureApptsCount = useMemo(() => {
        return patientAppointments.filter(isFutureAppointment).length;
    }, [patientAppointments]);

    const pastApptsCount = useMemo(() => {
        return patientAppointments.length - futureApptsCount;
    }, [patientAppointments, futureApptsCount]);

    const displayedAppointments = useMemo(() => {
        const filtered = patientAppointments.filter(appt => {
            if (apptFilter === 'future') return isFutureAppointment(appt);
            if (apptFilter === 'past') return !isFutureAppointment(appt);
            return true;
        });

        return [...filtered].sort((a, b) => {
            if (apptFilter === 'future') {
                // Próximas citas pendientes: de más cercana a hoy en adelante (ascendente)
                return (a.start || '').localeCompare(b.start || '');
            } else {
                // Citas pasadas o Todas: de más recientes a más antiguas (descendente)
                return (b.start || '').localeCompare(a.start || '');
            }
        });
    }, [patientAppointments, apptFilter]);

    const allFilteredSelected = displayedAppointments.length > 0 &&
        displayedAppointments.every(a => selectedApptIds.has(a.id));

    const toggleSelectAll = () => {
        if (allFilteredSelected) {
            setSelectedApptIds(prev => {
                const next = new Set(prev);
                displayedAppointments.forEach(a => next.delete(a.id));
                return next;
            });
        } else {
            setSelectedApptIds(prev => {
                const next = new Set(prev);
                displayedAppointments.forEach(a => next.add(a.id));
                return next;
            });
        }
    };

    const toggleSelectAppt = (id: string) => {
        setSelectedApptIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const handleSelectOnlyFuture = () => {
        const futureIds = patientAppointments.filter(isFutureAppointment).map(a => a.id);
        setSelectedApptIds(new Set(futureIds));
        if (futureIds.length === 0) {
            showToast("No hay citas futuras programadas para este paciente", "info");
        } else {
            showToast(`${futureIds.length} citas futuras seleccionadas`, "info");
        }
    };

    const handleSelectSeries = (targetAppt: Appointment) => {
        if (!targetAppt.recurrence) {
            setSelectedApptIds(prev => new Set([...prev, targetAppt.id]));
            return;
        }

        const freq = targetAppt.recurrence.frequency || 'weekly';
        const seriesMatches = patientAppointments.filter(a => {
            if (!a.recurrence) return false;
            if (targetAppt.recurrence?.originalId && a.recurrence?.originalId && targetAppt.recurrence.originalId === a.recurrence.originalId) {
                if (targetAppt.recurrence.originalId !== 'SERIE') return true;
            }
            return a.therapistId === targetAppt.therapistId && (a.recurrence.frequency || 'weekly') === freq;
        });

        const seriesIds = seriesMatches.map(a => a.id);
        setSelectedApptIds(prev => {
            const next = new Set(prev);
            seriesIds.forEach(id => next.add(id));
            return next;
        });

        showToast(`Se han marcado las ${seriesIds.length} citas de la serie ${freq === 'biweekly' ? 'quincenal' : 'semanal'}`, 'info');
    };

    const handleDeleteSelectedClick = () => {
        const appts = patientAppointments.filter(a => selectedApptIds.has(a.id));
        if (appts.length === 0) return;
        setConfirmDeleteApptsModal({ isOpen: true, appts });
    };

    const handleDeleteSingleClick = (appt: Appointment) => {
        setConfirmDeleteApptsModal({ isOpen: true, appts: [appt] });
    };

    const confirmDeleteSelectedAppts = async () => {
        if (!confirmDeleteApptsModal.appts || confirmDeleteApptsModal.appts.length === 0) return;

        setIsDeletingAppts(true);
        const idsToDelete = confirmDeleteApptsModal.appts.map(a => a.id);

        try {
            await deleteAppointmentsBatch(idsToDelete);

            setPatientAppointments(prev => prev.filter(a => !idsToDelete.includes(a.id)));

            setSelectedApptIds(prev => {
                const next = new Set(prev);
                idsToDelete.forEach(id => next.delete(id));
                return next;
            });

            showToast(
                idsToDelete.length === 1
                    ? "Cita eliminada correctamente"
                    : `${idsToDelete.length} citas eliminadas correctamente`,
                "success"
            );
            setConfirmDeleteApptsModal({ isOpen: false, appts: [] });
        } catch (err: any) {
            console.error("Error deleting appointments:", err);
            showToast(`Error al eliminar: ${err.message || 'Error desconocido'}`, "error");
        } finally {
            setIsDeletingAppts(false);
        }
    };

    // Canvas signature state
    const [drawing, setDrawing] = useState(false);

    const loadTransactions = async () => {
        try {
            const txs = await getTransactions();
            setAllTransactions(txs);
            setPatientBalances(computePatientBalances(txs));
        } catch (e) {
            console.error("Error loading transactions for wallet:", e);
        }
    };

    const fetchData = () => {
        setLoading(true);
        getPatients().then((data) => {
            setPatients(data);
            setLoading(false);
        });
        loadTransactions();
    };

    const handleSavePatientCredit = async () => {
        if (!selectedPatient?.id || !newCreditAmount || Number(newCreditAmount) <= 0) {
            showToast("Introduce un importe válido", "error");
            return;
        }

        setIsSavingCredit(true);
        try {
            await addPatientCredit({
                patientId: selectedPatient.id,
                patientName: `${selectedPatient.firstName || ''} ${selectedPatient.lastName || ''}`.trim(),
                amount: Number(newCreditAmount),
                method: newCreditMethod,
                category: newCreditCategory,
                paymentDate: newCreditDate ? new Date(newCreditDate).toISOString() : new Date().toISOString(),
                notes: newCreditNotes.trim() || undefined
            });

            showToast("¡Ingreso de beca/saldo guardado correctamente!", "success");
            setIsAddCreditModalOpen(false);
            setNewCreditAmount('');
            setNewCreditNotes('');
            await loadTransactions();
        } catch (error) {
            console.error("Error adding credit:", error);
            showToast("No se pudo guardar el ingreso. Inténtalo de nuevo.", "error");
        } finally {
            setIsSavingCredit(false);
        }
    };

    const handleDeleteCreditMovement = async (txId: string) => {
        if (!window.confirm("¿Seguro que deseas eliminar este ingreso de saldo/beca? Esta acción revertirá el saldo del paciente.")) {
            return;
        }

        try {
            await deletePatientCredit(txId);
            showToast("Ingreso eliminado correctamente", "info");
            await loadTransactions();
        } catch (error) {
            console.error("Error deleting credit tx:", error);
            showToast("Error al eliminar el movimiento de saldo", "error");
        }
    };

    useEffect(() => {
        fetchData();
        getTherapists().then(data => {
            const onlyTherapists = data.filter(t => t.specialty !== 'Administración');
            setTherapists(onlyTherapists);
        });
    }, []);

    useEffect(() => {
        if (isModalOpen && selectedPatient?.id && (activeTab === 'appointments' || activeTab === 'history')) {
            getAppointmentsByPatient(selectedPatient.id).then(setPatientAppointments);
        }
        if (!isModalOpen || activeTab !== 'appointments') {
            setSelectedApptIds(new Set());
        }
    }, [isModalOpen, selectedPatient?.id, activeTab]);

    // Manage body class for printing
    useEffect(() => {
        if (isConsentModalOpen && isConsentViewMode) {
            document.body.classList.add('print-active');
        } else {
            document.body.classList.remove('print-active');
        }
        return () => document.body.classList.remove('print-active');
    }, [isConsentModalOpen, isConsentViewMode]);

    const calculateAge = (birthDate: string) => {
        if (!birthDate) return 0;
        const today = new Date();
        const birth = new Date(birthDate);
        let age = today.getFullYear() - birth.getFullYear();
        const m = today.getMonth() - birth.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
            age--;
        }
        return age;
    };

    const getStatusClass = (status: string) => {
        switch (status) {
            case 'Activo': return 'status-activo';
            case 'En Pausa': return 'status-pausa';
            case 'Alta': return 'status-alta';
            case 'Lista de espera': return 'status-espera';
            default: return '';
        }
    };

    const handleOpenModal = async (patient?: Patient) => {
        setActiveTab('general');
        setApptFilter('future');
        if (patient?.id) {
            // Recuperar siempre de la BD para asegurar datos frescos
            try {
                const freshPatient = await getPatientById(patient.id);
                if (freshPatient) {
                    setSelectedPatient(freshPatient);
                } else {
                    setSelectedPatient(patient);
                }
            } catch (error) {
                console.error("Error fetching fresh patient data:", error);
                setSelectedPatient(patient);
            }
        } else if (patient) {
            setSelectedPatient(patient);
        } else {
            setSelectedPatient({
                firstName: '',
                lastName: '',
                birthDate: '',
                schooling: '',
                address: '',
                tutor1: {
                    firstName: '',
                    lastName: '',
                    dni: '',
                    job: '',
                    phone: '',
                    email: ''
                },
                tutor2: {
                    firstName: '',
                    lastName: '',
                    dni: '',
                    job: '',
                    phone: ''
                },
                allergies: '',
                referralSource: '',
                tutorName: '',
                email: '',
                phone: '',
                status: 'Activo',
                notes: '',
                therapistId: '',
                recibirRecordatoriosWhatsapp: true,
                whatsappRgpdEnviado: false,
                files: []
            });
        }
        setIsModalOpen(true);
    };

    const handleMoveToWaitingList = async (patient: Patient) => {
        if (window.confirm(`¿Mover a ${patient.firstName} a la lista de espera?`)) {
            await updatePatient({ ...patient, status: 'Lista de espera' });
            setIsModalOpen(false);
            fetchData();
        }
    };

    const handleDelete = () => {
        if (!selectedPatient?.id) return;
        setPatientDeleteConfirm({ isOpen: true, patient: selectedPatient as Patient });
    };

    const confirmPatientDelete = async () => {
        if (!patientDeleteConfirm.patient?.id) return;
        const patientId = patientDeleteConfirm.patient.id;

        try {
            await deletePatient(patientId);
            showToast('Paciente eliminado correctamente', 'success');
            setPatientDeleteConfirm({ isOpen: false, patient: null });
            setIsModalOpen(false);
            setPatients(prev => prev.filter(p => p.id !== patientId));
        } catch (error: any) {
            console.error("Error eliminando paciente:", error);
            showToast(`Error al eliminar: ${error.message || 'Error de servidor'}`, 'error');
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedPatient) return;

        try {
            let updatedPatient: Patient;
            const isNew = !selectedPatient.id;
            if (selectedPatient.id) {
                updatedPatient = await updatePatient(selectedPatient as Patient);
            } else {
                updatedPatient = await createPatient(selectedPatient as Omit<Patient, 'id' | 'createdAt'>);
            }

            // Actualizar estado local inmediatamente para evitar condiciones de carrera
            setPatients(prev => {
                const index = prev.findIndex(p => p.id === updatedPatient.id);
                if (index !== -1) {
                    const next = [...prev];
                    next[index] = updatedPatient;
                    return next;
                }
                return [updatedPatient, ...prev];
            });

            if (isNew) {
                setSelectedPatient(updatedPatient);
                setActiveTab('files');
                showToast("Paciente creado. Genera su documentación en la pestaña de Archivos.", "info");
            } else {
                setIsModalOpen(false);
            }
            // Re-vincular para asegurar que todo esté en sync (opcional pero recomendado)
            fetchData();
        } catch (error) {
            console.error("Error saving patient:", error);
            showToast("No se pudo guardar la ficha. Por favor, revisa la conexión.", "error");
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !selectedPatient?.id) return;

        try {
            showToast(`Subiendo "${file.name}"...`, "info");
            setIsSending(true);

            await uploadPatientFileContent(
                selectedPatient.id,
                file.name,
                file,
                file.type
            );

            showToast("Archivo subido correctamente", "success");

            // Refrescar datos
            const updated = await getPatientById(selectedPatient.id);
            if (updated) {
                setSelectedPatient(updated);
                setPatients(prev => prev.map(p => p.id === updated.id ? updated : p));
            }
        } catch (error: any) {
            console.error("Error subiendo archivo:", error);
            showToast(`Error al subir: ${error.message || 'Error de conexión'}`, "error");
        } finally {
            setIsSending(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        const canvas = e.currentTarget;
        const role = canvas.getAttribute('data-role') || 'tutor';

        // Target only canvases inside the active modal
        const modalBody = document.getElementById('consent-modal-body');
        const canvases = modalBody
            ? Array.from(modalBody.querySelectorAll(`.signature-pad-canvas[data-role="${role}"]`)) as HTMLCanvasElement[]
            : [canvas];

        const rect = canvas.getBoundingClientRect();
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

        canvases.forEach(c => {
            c.setAttribute('data-signed', 'true');
            const context = c.getContext('2d');
            if (context) {
                const scaleX = c.width / rect.width;
                const scaleY = c.height / rect.height;
                context.beginPath();
                context.moveTo(
                    (clientX - rect.left) * scaleX,
                    (clientY - rect.top) * scaleY
                );
            }
        });

        setDrawing(true);
        if ('touches' in e) e.preventDefault(); // Prevent scrolling while signing
    };

    const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        if (!drawing) return;
        const canvas = e.currentTarget;
        const role = canvas.getAttribute('data-role') || 'tutor';

        const modalBody = document.getElementById('consent-modal-body');
        const canvases = modalBody
            ? Array.from(modalBody.querySelectorAll(`.signature-pad-canvas[data-role="${role}"]`)) as HTMLCanvasElement[]
            : [canvas];

        const rect = canvas.getBoundingClientRect();
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

        canvases.forEach(c => {
            const context = c.getContext('2d');
            if (context) {
                const scaleX = c.width / rect.width;
                const scaleY = c.height / rect.height;
                context.lineTo(
                    (clientX - rect.left) * scaleX,
                    (clientY - rect.top) * scaleY
                );
                context.strokeStyle = '#2c3e50';
                context.lineWidth = 2.5;
                context.lineCap = 'round';
                context.lineJoin = 'round';
                context.stroke();
            }
        });

        setIsSigned(true);
        if ('touches' in e) e.preventDefault();
    };

    const stopDrawing = () => {
        setDrawing(false);
    };

    const clearSignature = (role?: 'tutor' | 'tutor2' | 'therapist') => {
        const modalBody = document.getElementById('consent-modal-body');
        if (!modalBody) return;

        const selector = role ? `.signature-pad-canvas[data-role="${role}"]` : '.signature-pad-canvas';
        const canvases = modalBody.querySelectorAll(selector);
        canvases.forEach(c => {
            const canvas = c as HTMLCanvasElement;
            canvas.removeAttribute('data-signed');
            const context = canvas.getContext('2d');
            context?.clearRect(0, 0, canvas.width, canvas.height);
        });

        // Recalcular isSigned
        const allCanvases = Array.from(modalBody.querySelectorAll('.signature-pad-canvas')) as HTMLCanvasElement[];
        const anySigned = allCanvases.some(c => c.getAttribute('data-signed') === 'true');
        setIsSigned(anySigned);
    };
    const handleSaveDraftConsent = async () => {
        if (!selectedPatient?.id) return;
        setIsSending(true);
        try {
            const extraFields: Record<string, string> = {};
            document.querySelectorAll('[data-field-id]').forEach(el => {
                const fieldId = el.getAttribute('data-field-id');
                if (fieldId) {
                    extraFields[fieldId] = (el as HTMLElement).innerText || '';
                }
            });

            const modalBody = document.getElementById('consent-modal-body');
            console.log("[Save Draft] modalBody found:", !!modalBody);

            // Tutor 1
            const tutorCanvases = modalBody ? Array.from(modalBody.querySelectorAll('.signature-pad-canvas[data-role="tutor"]')) as HTMLCanvasElement[] : [];
            const signedTutorCanvas = tutorCanvases.find(c => c.getAttribute('data-signed') === 'true');
            const isTutorSigned = !!signedTutorCanvas;
            const tutorSignature = isTutorSigned ? signedTutorCanvas?.toDataURL('image/png') : selectedPatient.consentSignature;
            console.log("[Save Draft] Tutor 1 signed:", isTutorSigned, "signature length:", tutorSignature?.length);

            // Tutor 2
            const tutor2Canvas = modalBody?.querySelector('.signature-pad-canvas[data-role="tutor2"]') as HTMLCanvasElement;
            const isTutor2Signed = tutor2Canvas?.getAttribute('data-signed') === 'true';
            const tutor2Signature = isTutor2Signed ? tutor2Canvas?.toDataURL('image/png') : selectedPatient.tutor2Signature;
            console.log("[Save Draft] Tutor 2 canvas found:", !!tutor2Canvas, "signed:", isTutor2Signed, "signature length:", tutor2Signature?.length);

            // Therapist
            const therapistCanvas = modalBody?.querySelector('.signature-pad-canvas[data-role="therapist"]') as HTMLCanvasElement;
            const isTherapistSigned = therapistCanvas?.getAttribute('data-signed') === 'true';
            const therapistSignature = isTherapistSigned ? therapistCanvas?.toDataURL('image/png') : selectedPatient.therapistSignature;
            console.log("[Save Draft] Therapist canvas found:", !!therapistCanvas, "signed:", isTherapistSigned, "signature length:", therapistSignature?.length);

            const updatedPatientData = {
                ...selectedPatient as Patient,
                consentSignature: tutorSignature,
                tutor2Signature: tutor2Signature,
                therapistSignature: therapistSignature,
                schooling: extraFields.school_stage || extraFields.school_name || (selectedPatient as Patient).schooling,
                allergies: extraFields.allergies_detail || (selectedPatient as Patient).allergies,
                referralSource: extraFields.referral_detail || (selectedPatient as Patient).referralSource
            };

            await updatePatient(updatedPatientData);
            showToast("Borrador guardado correctamente. Los cambios se han actualizado.", "success");

            // Refresh local data efficiently
            const updated = await getPatientById(selectedPatient.id);
            if (updated) {
                setSelectedPatient(updated);
                setPatients(prev => prev.map(p => p.id === updated.id ? updated : p));
            }
        } catch (error) {
            console.error("Error guardando borrador:", error);
            showToast("Error al guardar el borrador.", "error");
        } finally {
            setIsSending(false);
        }
    };
    const handleDownloadPDF = async () => {
        if (!selectedPatient) return;
        setIsSending(true);
        try {
            showToast("Generando PDF de alta calidad. Espere por favor...", "info");

            const modalBody = document.getElementById('consent-modal-body');
            console.log("[PDF Download] modalBody found:", !!modalBody);

            // Tutor 1
            const tutorCanvases = modalBody ? Array.from(modalBody.querySelectorAll('.signature-pad-canvas[data-role="tutor"]')) as HTMLCanvasElement[] : [];
            const signedTutorCanvas = tutorCanvases.find(c => c.getAttribute('data-signed') === 'true');
            const tutorSignature = signedTutorCanvas ? signedTutorCanvas.toDataURL('image/png') : selectedPatient.consentSignature;
            console.log("[PDF Download] Tutor 1 signed:", !!signedTutorCanvas, "signature length:", tutorSignature?.length);

            // Tutor 2
            const tutor2Canvas = modalBody?.querySelector('.signature-pad-canvas[data-role="tutor2"]') as HTMLCanvasElement;
            const tutor2Signature = tutor2Canvas?.getAttribute('data-signed') === 'true' ? tutor2Canvas.toDataURL('image/png') : selectedPatient.tutor2Signature;
            console.log("[PDF Download] Tutor 2 canvas found:", !!tutor2Canvas, "signed:", tutor2Canvas?.getAttribute('data-signed') === 'true', "signature length:", tutor2Signature?.length);

            // Therapist
            const therapistCanvas = modalBody?.querySelector('.signature-pad-canvas[data-role="therapist"]') as HTMLCanvasElement;
            const therapistSignature = therapistCanvas?.getAttribute('data-signed') === 'true' ? therapistCanvas.toDataURL('image/png') : selectedPatient.therapistSignature;
            console.log("[PDF Download] Therapist canvas found:", !!therapistCanvas, "signed:", therapistCanvas?.getAttribute('data-signed') === 'true', "signature length:", therapistSignature?.length);

            const extraFields: Record<string, string> = {};
            document.querySelectorAll('[data-field-id]').forEach(el => {
                const fieldId = el.getAttribute('data-field-id');
                if (fieldId) {
                    extraFields[fieldId] = (el as HTMLElement).innerText || '';
                }
            });

            // Generar documento dependiendo del modo
            let pdf;
            if (consentModalMode === 'consent') {
                pdf = await generateConsentSheetPDF(
                    selectedPatient as Patient,
                    extraFields,
                    tutorSignature || null,
                    tutor2Signature || null,
                    therapistSignature || null
                );
                pdf.save(`Consentimiento_${selectedPatient.firstName}_${selectedPatient.lastName}.pdf`);
            } else {
                pdf = await generateClinicalHistoryPDF(
                    selectedPatient as Patient,
                    extraFields,
                    therapistSignature || null
                );
                pdf.save(`Historial_Clinico_${selectedPatient.firstName}_${selectedPatient.lastName}.pdf`);
            }
            showToast('PDF descargado con éxito', 'success');
        } catch (error) {
            console.error("Error generating download:", error);
            showToast("Error al generar el PDF", "error");
        } finally {
            setIsSending(false);
        }
    };

    const handleSaveAndSendConsent = async (options: { isSilentResend?: boolean } = {}) => {
        if (!selectedPatient?.id) return;
        setIsSending(true);
        setProcessingStep('Preparando documento...');

        try {
            const extraFields: Record<string, string> = {};
            document.querySelectorAll('[data-field-id]').forEach(el => {
                const fieldId = el.getAttribute('data-field-id');
                if (fieldId) {
                    extraFields[fieldId] = (el as HTMLElement).innerText || '';
                }
            });

            const modalBody = document.getElementById('consent-modal-body');
            console.log("[Save Consent] modalBody found:", !!modalBody);

            // Tutor 1
            const tutorCanvases = modalBody ? Array.from(modalBody.querySelectorAll('.signature-pad-canvas[data-role="tutor"]')) as HTMLCanvasElement[] : [];
            console.log("[Save Consent] Tutor canvases found count:", tutorCanvases.length);
            const signedTutorCanvas = tutorCanvases.find(c => c.getAttribute('data-signed') === 'true');
            const isTutorSigned = !!signedTutorCanvas;
            const tutorSignature = isTutorSigned ? signedTutorCanvas?.toDataURL('image/png') : selectedPatient.consentSignature;
            console.log("[Save Consent] Tutor 1 signed:", isTutorSigned, "signature length:", tutorSignature?.length);

            // Tutor 2
            const tutor2Canvas = modalBody?.querySelector('.signature-pad-canvas[data-role="tutor2"]') as HTMLCanvasElement;
            const isTutor2Signed = tutor2Canvas?.getAttribute('data-signed') === 'true';
            const tutor2Signature = isTutor2Signed ? tutor2Canvas?.toDataURL('image/png') : selectedPatient.tutor2Signature;
            console.log("[Save Consent] Tutor 2 canvas found:", !!tutor2Canvas, "signed:", isTutor2Signed, "signature length:", tutor2Signature?.length);

            // Therapist
            const therapistCanvas = modalBody?.querySelector('.signature-pad-canvas[data-role="therapist"]') as HTMLCanvasElement;
            const isTherapistSigned = therapistCanvas?.getAttribute('data-signed') === 'true';
            const therapistSignature = isTherapistSigned ? therapistCanvas?.toDataURL('image/png') : selectedPatient.therapistSignature;
            console.log("[Save Consent] Therapist canvas found:", !!therapistCanvas, "signed:", isTherapistSigned, "signature length:", therapistSignature?.length);

            if (tutorSignature || tutor2Signature || therapistSignature) {
                const now = new Date().toISOString();

                const updatedPatientData = {
                    ...selectedPatient as Patient,
                    consentSignature: tutorSignature,
                    tutor2Signature: tutor2Signature,
                    therapistSignature: therapistSignature,
                    consentLopd: true,
                    consentDate: (isTutorSigned || isTutor2Signed || isTherapistSigned) ? now : selectedPatient.consentDate || now,
                    schooling: extraFields.school_stage || extraFields.school_name || selectedPatient.schooling,
                    allergies: extraFields.allergies_detail || selectedPatient.allergies,
                    referralSource: extraFields.referral_detail || selectedPatient.referralSource
                };

                await updatePatient(updatedPatientData);

                setProcessingStep('Generando documentación...');
                let consentSheetBlob: Blob | null = null;
                let consentSheetBase64: string | null = null;
                let clinicalHistoryBlob: Blob | null = null;

                if (consentModalMode === 'consent') {
                    const consentSheetPdf = await generateConsentSheetPDF(
                        updatedPatientData,
                        extraFields,
                        tutorSignature || null,
                        tutor2Signature || null,
                        therapistSignature || null
                    );
                    consentSheetBase64 = consentSheetPdf.output('datauristring');
                    consentSheetBlob = consentSheetPdf.output('blob');
                } else {
                    const clinicalHistoryPdf = await generateClinicalHistoryPDF(
                        updatedPatientData,
                        extraFields,
                        therapistSignature || null
                    );
                    clinicalHistoryBlob = clinicalHistoryPdf.output('blob');
                }
                const recipientEmail = updatedPatientData.tutor1?.email || updatedPatientData.email;

                setProcessingStep('Guardando en archivos...');

                // Guardar registro de archivo en el historial solo si NO es un re-envío silencioso
                if (!options.isSilentResend) {
                    try {
                        const existingFiles = (selectedPatient as Patient).files || [];

                        if (consentModalMode === 'consent' && consentSheetBlob) {
                            // Limpiar archivo de consentimiento anterior
                            const oldConsentFiles = existingFiles.filter(f => f.name === 'Ficha_Inscripcion_Firmada.pdf');
                            for (const oldFile of oldConsentFiles) {
                                await deletePatientFile(oldFile.id, selectedPatient.id, oldFile.name);
                            }

                            await uploadPatientFileContent(
                                selectedPatient.id,
                                'Ficha_Inscripcion_Firmada.pdf',
                                consentSheetBlob,
                                'application/pdf'
                            );
                        } else if (consentModalMode === 'history' && clinicalHistoryBlob) {
                            // Limpiar archivo de historia anterior
                            const oldHistoryFiles = existingFiles.filter(f => f.name === 'Historia_Clinica.pdf');
                            for (const oldFile of oldHistoryFiles) {
                                await deletePatientFile(oldFile.id, selectedPatient.id, oldFile.name);
                            }

                            await uploadPatientFileContent(
                                selectedPatient.id,
                                'Historia_Clinica.pdf',
                                clinicalHistoryBlob,
                                'application/pdf'
                            );
                        }
                    } catch (uploadError) {
                        console.warn("Fallo al gestionar registro de archivo, pero se ignora:", uploadError);
                    }
                }

                // Enviar email en segundo plano (solo en modo consentimiento o si se fuerza por re-envío)
                if (consentModalMode === 'consent' && consentSheetBase64) {
                    if (options.isSilentResend) {
                        showToast(`Enviando ficha de consentimiento a ${recipientEmail}...`, "info");
                    }

                    supabase.functions.invoke('send-consent-email', {
                        body: {
                            email: recipientEmail,
                            patient: { firstName: updatedPatientData.firstName, lastName: updatedPatientData.lastName, id: updatedPatientData.id },
                            pdfBase64: consentSheetBase64
                        }
                    }).then(({ data, error: invokeError }) => {
                        if (invokeError) {
                            console.error("Error enviando email en 2do plano:", invokeError);
                            showToast(`No se pudo enviar el email: ${invokeError.message}`, "error");
                        } else if (data && data.success === false) {
                            console.error("Fallo SMTP en Edge Function:", data.error);
                            showToast(`Error al enviar el correo: ${data.error}`, "error");
                        } else {
                            showToast(`¡Email enviado correctamente a ${recipientEmail}!`, "success");
                        }
                    });

                    if (!options.isSilentResend) {
                        showToast('¡Ficha de Consentimiento guardada! El email se está enviando en segundo plano.', 'success');
                    }
                } else if (consentModalMode === 'history') {
                    if (!options.isSilentResend) {
                        showToast('¡Historial Clínico guardado correctamente!', 'success');
                    }
                }

                setIsConsentModalOpen(false);
                setIsConsentViewMode(false);
                setIsSigned(false);

                // Refresh local data efficiently
                const refreshed = await getPatientById(selectedPatient.id);
                if (refreshed) {
                    setSelectedPatient(refreshed);
                    setPatients(prev => prev.map(p => p.id === refreshed.id ? refreshed : p));
                }
            } else {
                showToast("No se ha detectado ninguna firma en el panel.", "error");
            }
        } catch (error) {
            console.error("Error persistiendo firma o enviando email:", error);
            showToast("Error crítico al procesar el documento.", "error");
        } finally {
            setIsSending(false);
            setProcessingStep('');
        }
    };

    const handleDeleteFile = async (file: PatientFile) => {
        if (!selectedPatient?.id) return;
        setDeleteConfirm({ isOpen: true, file });
    };

    const confirmDelete = async () => {
        if (!deleteConfirm.file || !selectedPatient?.id) return;
        try {
            await deletePatientFile(deleteConfirm.file.id, selectedPatient.id, deleteConfirm.file.name);
            showToast("Archivo eliminado correctamente", "success");
            // Actualizar estado local del paciente
            if (selectedPatient.files) {
                const isConsent = deleteConfirm.file.name === 'Ficha_Inscripcion_Firmada.pdf';
                const isHistory = deleteConfirm.file.name === 'Historia_Clinica.pdf';
                const updatedFiles = selectedPatient.files.filter(f => f.id !== deleteConfirm.file!.id);
                const updated = {
                    ...selectedPatient as Patient,
                    files: updatedFiles,
                    ...(isConsent ? { consentSignature: '', consentDate: undefined, consentLopd: false } : {}),
                    ...(isHistory ? { therapistSignature: '' } : {})
                };
                if (isConsent || isHistory) {
                    await updatePatient(updated);
                }
                setSelectedPatient(updated);
                setPatients(prev => prev.map(p => p.id === updated.id ? updated : p));
            }
        } catch (error) {
            console.error("Error eliminando archivo:", error);
            showToast("No se pudo eliminar el archivo. Revisa los permisos.", "error");
        } finally {
            setDeleteConfirm({ isOpen: false, file: null });
        }
    };

    const handleResendConsentEmail = async (patient: Patient) => {
        if (!patient.consentSignature) {
            showToast("No hay una firma de consentimiento guardada para este paciente.", "error");
            return;
        }

        const recipientEmail = patient.tutor1?.email || patient.email;
        if (!recipientEmail) {
            showToast("El paciente no tiene un email configurado.", "error");
            return;
        }

        try {
            // Para re-enviar con el formato de alta fidelidad, necesitamos que el modal esté abierto
            // para capturar el contenido actual (especialmente las firmas).
            setSelectedPatient(patient);
            setIsConsentViewMode(true);
            setIsConsentModalOpen(true);
            setIsSigned(true);

            showToast("Preparando re-envío del documento...", "info");

            // Pequeño delay para asegurar que el modal se renderice y se monten las imágenes
            setTimeout(() => {
                handleSaveAndSendConsent({ isSilentResend: true });
            }, 1200);
        } catch (error: any) {
            console.error("Error re-enviando email:", error);
            showToast(`Error al re-enviar el email: ${error.message || 'Error desconocido'}`, "error");
        }
    };

    const handleViewFile = async (file: PatientFile) => {
        if (file.name === 'Ficha_Inscripcion_Firmada.pdf') {
            setConsentModalMode('consent');
            setIsConsentViewMode(true);
            setIsSigned(true);
            setIsConsentModalOpen(true);
        } else if (file.name === 'Historia_Clinica.pdf') {
            setConsentModalMode('history');
            setIsConsentViewMode(true);
            setIsSigned(true);
            setIsConsentModalOpen(true);
        } else if (selectedPatient?.id) {
            try {
                const url = await getPatientFileUrl(selectedPatient.id, file.name);
                window.open(url, '_blank');
            } catch (error) {
                console.error("Error getting file URL:", error);
                showToast("No se pudo obtener la URL del archivo", "error");
            }
        }
    };

    const normalizeString = (str: string) => {
        return str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, ' ').trim() : "";
    };

    const filteredPatients = patients.filter(p => {
        const searchTarget = normalizeString(`${p.firstName} ${p.lastName} ${p.tutorName || ''}`);
        const normalizedSearch = normalizeString(searchTerm);
        return searchTarget.includes(normalizedSearch);
    });

    if (loading && patients.length === 0) {
        return <div className="loading">Cargando pacientes...</div>;
    }

    return (
        <div className="patient-list-container">
            <header className="page-header">
                <div className="header-info">
                    <h1 className="page-title">
                        <Activity className="title-icon" size={32} />
                        Gestión de Pacientes
                    </h1>
                    <p className="page-subtitle">Listado de niños y adolescentes en seguimiento</p>
                </div>

                <div className="header-actions">
                    <div className="search-pill">
                        <Search size={18} />
                        <input
                            type="text"
                            placeholder="Buscar por nombre o tutor..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <button className="calendar-btn-pill calendar-btn-primary" onClick={() => handleOpenModal()}>
                        <UserPlus size={18} />
                        <span>Nuevo Paciente</span>
                    </button>
                </div>
            </header>

            <div className="patient-grid">
                {filteredPatients.map((patient) => (
                    <Card key={patient.id} className="patient-card" onClick={() => handleOpenModal(patient)}>
                        <div className="patient-card-header">
                            <div className="patient-avatar" style={{ backgroundColor: 'var(--color-status-info-bg)' }}>
                                {patient.firstName.charAt(0)}
                            </div>
                            <div className="patient-main-info">
                                <span className="patient-name">{patient.firstName} {patient.lastName}</span>
                                <span className="patient-age">{calculateAge(patient.birthDate)} años</span>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                                <span className={`status-badge ${getStatusClass(patient.status)}`}>
                                    {patient.status}
                                </span>
                                {(patientBalances.get(patient.id)?.balance || 0) > 0 && (
                                    <span className="patient-balance-pill" title={`Saldo a favor disponible: ${patientBalances.get(patient.id)!.balance.toFixed(2)}€`}>
                                        <Wallet size={12} />
                                        {patientBalances.get(patient.id)!.balance.toFixed(0)}€ Saldo
                                    </span>
                                )}
                            </div>
                        </div>

                        <div className="patient-details">
                            <div className="detail-item">
                                <User size={14} />
                                <span className="detail-label">Tutor:</span>
                                <span>{patient.tutorName || '-'}</span>
                            </div>
                            <div className="detail-item">
                                <Phone size={14} />
                                <span className="detail-label">Teléfono:</span>
                                <span>{patient.phone}</span>
                            </div>
                            <div className="detail-item">
                                <Mail size={14} />
                                <span className="detail-label">Email:</span>
                                <span>{patient.email}</span>
                            </div>
                            <div className="detail-item">
                                <Activity size={14} />
                                <span className="detail-label">Terapeuta:</span>
                                <span>{therapists.find(t => t.id === patient.therapistId)?.fullName || 'No asignado'}</span>
                            </div>
                            <div className="detail-item" style={{ marginTop: '0.5rem' }}>
                                {patient.consentLopd ? (
                                    <div className="flex items-center gap-1" style={{ color: '#059669', fontSize: '0.8rem', fontWeight: 600 }}>
                                        <ShieldCheck size={14} />
                                        <span>Consentimiento LOPD Firmado</span>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-1" style={{ color: '#dc2626', fontSize: '0.8rem', fontWeight: 600 }}>
                                        <ShieldAlert size={14} />
                                        <span>LOPD Pendiente de Firma</span>
                                    </div>
                                )}
                            </div>
                            <div className="detail-item" style={{ marginTop: '0.25rem', color: 'var(--color-primary)', fontSize: '0.8rem' }}>
                                <Activity size={12} />
                                <span className="detail-label">Origen:</span>
                                <span style={{ fontWeight: 600 }}>{patient.referralSource || 'No indicado'}</span>
                            </div>
                            <div className="detail-item" style={{ marginTop: '0.25rem', color: patient.resenaClic ? '#eab308' : '#9ca3af', fontSize: '0.8rem' }}>
                                <Star size={12} fill={patient.resenaClic ? '#eab308' : 'none'} />
                                <span className="detail-label">Reseña Google:</span>
                                <span style={{ fontWeight: 600 }}>{patient.resenaClic ? 'Clic registrado' : 'Pendiente'}</span>
                            </div>
                            <div className="detail-item" style={{ marginTop: '0.25rem', color: patient.recibirRecordatoriosWhatsapp !== false ? '#0284c7' : '#94a3b8', fontSize: '0.8rem' }}>
                                <MessageSquare size={12} />
                                <span className="detail-label">WhatsApp Citas:</span>
                                <span style={{ fontWeight: 600 }}>{patient.recibirRecordatoriosWhatsapp !== false ? 'Activo' : 'Desactivado'}</span>
                            </div>
                        </div>

                        <div className="patient-card-footer">
                            <span className="last-visit">
                                {patient.lastVisit ? `Última visita: ${new Date(patient.lastVisit).toLocaleDateString('es-ES')}` : 'Sin visitas registradas'}
                            </span>
                            <button
                                className="btn-link"
                                onClick={() => handleOpenModal(patient)}
                                style={{ border: 'none', background: 'none', color: '#1A5F7A', fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem' }}
                            >
                                Ver ficha
                            </button>
                        </div>
                    </Card>
                ))}
            </div>

            {isModalOpen && selectedPatient && (
                <div className="modal-overlay">
                    <div
                        className="modal-content large patient-detail-modal"
                    >
                        <div className="modal-header">
                            <div className="flex items-center gap-5">
                                <div className="patient-avatar small" style={{ backgroundColor: 'var(--color-status-info-bg)' }}>
                                    {selectedPatient.firstName?.charAt(0) || '?'}
                                </div>
                                <h3>{selectedPatient.id ? `${selectedPatient.firstName} ${selectedPatient.lastName}` : 'Nuevo Paciente'}</h3>
                            </div>
                            <button className="btn-icon-round" title="Cerrar" onClick={() => setIsModalOpen(false)}><X size={20} /></button>
                        </div>

                        <div className="modal-tabs flex gap-4 mb-3 border-bottom">
                            <button className={`tab-btn ${activeTab === 'general' ? 'active' : ''}`} onClick={() => setActiveTab('general')}>Datos Generales</button>
                            {selectedPatient.id && (
                                <>
                                    <button
                                        className={`tab-btn ${activeTab === 'appointments' ? 'active' : ''}`}
                                        onClick={() => {
                                            setActiveTab('appointments');
                                            setApptFilter('future');
                                        }}
                                    >
                                        Citas
                                    </button>
                                    <button
                                        className={`tab-btn flex items-center gap-1.5 ${activeTab === 'wallet' ? 'active' : ''}`}
                                        onClick={() => setActiveTab('wallet')}
                                    >
                                        <Wallet size={15} />
                                        <span>Beca / Monedero</span>
                                        {selectedPatient.id && (patientBalances.get(selectedPatient.id)?.balance || 0) > 0 && (
                                            <span style={{ fontSize: '0.72rem', padding: '1px 6px', borderRadius: '9999px', backgroundColor: '#dcfce7', color: '#166534', fontWeight: 700, marginLeft: '4px' }}>
                                                {patientBalances.get(selectedPatient.id)!.balance.toFixed(0)}€
                                            </span>
                                        )}
                                    </button>
                                    <button className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>Historia Clínica</button>
                                    <button className={`tab-btn ${activeTab === 'files' ? 'active' : ''}`} onClick={() => setActiveTab('files')}>Archivos</button>
                                </>
                            )}
                        </div>

                        <div className="tab-content">
                            {activeTab === 'general' && (
                                <form className="modal-form" onSubmit={handleSave}>
                                    <section className="form-section">
                                        <h4 className="section-title-small">
                                            <User size={16} color="#fff" /> 1. DATOS DEL ALUMNO/A
                                        </h4>
                                        <div className="form-row-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                                            <div className="form-group">
                                                <label>Nombre</label>
                                                <input type="text" required value={selectedPatient.firstName} onChange={e => setSelectedPatient({ ...selectedPatient, firstName: e.target.value })} />
                                            </div>
                                            <div className="form-group">
                                                <label>Apellidos</label>
                                                <input type="text" required value={selectedPatient.lastName} onChange={e => setSelectedPatient({ ...selectedPatient, lastName: e.target.value })} />
                                            </div>
                                        </div>

                                        <div className="form-row-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                                            <div className="form-group">
                                                <label>Estado</label>
                                                <select value={selectedPatient.status} onChange={e => setSelectedPatient({ ...selectedPatient, status: e.target.value as any })}>
                                                    <option value="Activo">Activo</option>
                                                    <option value="En Pausa">En Pausa</option>
                                                    <option value="Alta">Alta</option>
                                                    <option value="Lista de espera">Lista de espera</option>
                                                </select>
                                            </div>
                                            <div className="form-group">
                                                <label><Calendar size={14} style={{ marginRight: 6 }} /> F. Nacimiento</label>
                                                <input type="date" value={selectedPatient.birthDate} onChange={e => setSelectedPatient({ ...selectedPatient, birthDate: e.target.value })} />
                                            </div>
                                            <div className="form-group">
                                                <label>Etapa Escolarización</label>
                                                <input type="text" value={selectedPatient.schooling} placeholder="Ej. 3º Primaria" onChange={e => setSelectedPatient({ ...selectedPatient, schooling: e.target.value })} />
                                            </div>
                                        </div>

                                        <div className="form-group">
                                            <label>Dirección Completa</label>
                                            <input type="text" value={selectedPatient.address} placeholder="Calle, Número, CP, Ciudad" onChange={e => setSelectedPatient({ ...selectedPatient, address: e.target.value })} />
                                        </div>
                                    </section>

                                    <section className="form-section">
                                        <h4 className="section-title-small">
                                            <Users size={16} color="#fff" /> 2. DATOS DEL TUTOR 1 (Principal)
                                        </h4>
                                        <div className="form-row-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                                            <div className="form-group">
                                                <label>Nombre</label>
                                                <input type="text" value={selectedPatient.tutor1?.firstName} onChange={e => setSelectedPatient({ ...selectedPatient, tutor1: { ...selectedPatient.tutor1!, firstName: e.target.value } })} />
                                            </div>
                                            <div className="form-group">
                                                <label>Apellidos</label>
                                                <input type="text" value={selectedPatient.tutor1?.lastName} onChange={e => setSelectedPatient({ ...selectedPatient, tutor1: { ...selectedPatient.tutor1!, lastName: e.target.value } })} />
                                            </div>
                                            <div className="form-group">
                                                <label>DNI/NIE</label>
                                                <input type="text" value={selectedPatient.tutor1?.dni} onChange={e => setSelectedPatient({ ...selectedPatient, tutor1: { ...selectedPatient.tutor1!, dni: e.target.value } })} />
                                            </div>
                                        </div>
                                        <div className="form-row-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                                            <div className="form-group">
                                                <label>Profesión</label>
                                                <input type="text" value={selectedPatient.tutor1?.job} onChange={e => setSelectedPatient({ ...selectedPatient, tutor1: { ...selectedPatient.tutor1!, job: e.target.value } })} />
                                            </div>
                                            <div className="form-group">
                                                <label>Teléfono</label>
                                                <input type="tel" value={selectedPatient.tutor1?.phone} onChange={e => setSelectedPatient({ ...selectedPatient, tutor1: { ...selectedPatient.tutor1!, phone: e.target.value }, phone: e.target.value })} />
                                            </div>
                                            <div className="form-group">
                                                <label>Email {!selectedPatient.id && <span style={{ color: '#ef4444' }}>*</span>}</label>
                                                <input
                                                    type="email"
                                                    required={!selectedPatient.id}
                                                    value={selectedPatient.tutor1?.email}
                                                    onChange={e => setSelectedPatient({ ...selectedPatient, tutor1: { ...selectedPatient.tutor1!, email: e.target.value }, email: e.target.value })}
                                                />
                                            </div>
                                        </div>
                                    </section>

                                    <section className="form-section">
                                        <h4 className="section-title-small">
                                            <UserPlus size={16} color="#fff" /> 3. DATOS DEL TUTOR 2 (Opcional)
                                        </h4>
                                        <div className="form-row-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr' }}>
                                            <div className="form-group">
                                                <label>Nombre</label>
                                                <input type="text" value={selectedPatient.tutor2?.firstName} onChange={e => setSelectedPatient({ ...selectedPatient, tutor2: { ...selectedPatient.tutor2!, firstName: e.target.value } })} />
                                            </div>
                                            <div className="form-group">
                                                <label>Apellidos</label>
                                                <input type="text" value={selectedPatient.tutor2?.lastName} onChange={e => setSelectedPatient({ ...selectedPatient, tutor2: { ...selectedPatient.tutor2!, lastName: e.target.value } })} />
                                            </div>
                                            <div className="form-group">
                                                <label>DNI/NIE</label>
                                                <input type="text" value={selectedPatient.tutor2?.dni} onChange={e => setSelectedPatient({ ...selectedPatient, tutor2: { ...selectedPatient.tutor2!, dni: e.target.value } })} />
                                            </div>
                                            <div className="form-group">
                                                <label>Teléfono</label>
                                                <input type="tel" value={selectedPatient.tutor2?.phone} onChange={e => setSelectedPatient({ ...selectedPatient, tutor2: { ...selectedPatient.tutor2!, phone: e.target.value } })} />
                                            </div>
                                        </div>
                                    </section>

                                    <section className="form-section">
                                        <h4 className="section-title-small">
                                            <Heart size={16} color="#fff" /> 4. DATOS DE INTERÉS Y ORIGEN
                                        </h4>
                                        <div className="form-row-grid" style={{ gridTemplateColumns: '1.5fr 1fr 1fr' }}>
                                            <div className="form-group">
                                                <label>Alergias o intolerancia alimenticia</label>
                                                <input type="text" value={selectedPatient.allergies} placeholder="Describir o indicar 'No'" onChange={e => setSelectedPatient({ ...selectedPatient, allergies: e.target.value })} />
                                            </div>
                                            <div className="form-group">
                                                <label>¿Cómo nos conociste? (Origen)</label>
                                                <select value={selectedPatient.referralSource} onChange={e => setSelectedPatient({ ...selectedPatient, referralSource: e.target.value })}>
                                                    <option value="">Seleccionar...</option>
                                                    <option value="Instagram">Instagram/Redes</option>
                                                    <option value="Google">Google/Web</option>
                                                    <option value="Recomendación">Recomendación</option>
                                                    <option value="Colegio">Colegio/Orientador</option>
                                                    <option value="Pediatra">Pediatra/C.Salud</option>
                                                    <option value="Seguro">Seguros</option>
                                                    <option value="Otro">Otro</option>
                                                </select>
                                            </div>
                                            <div className="form-group">
                                                <label>Terapeuta Asignado</label>
                                                <select
                                                    value={selectedPatient.therapistId || ''}
                                                    onChange={e => setSelectedPatient({ ...selectedPatient, therapistId: e.target.value })}
                                                >
                                                    <option value="">Sin asignar</option>
                                                    {therapists.map(t => (
                                                        <option key={t.id} value={t.id}>{t.fullName}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                        <div className="form-group">
                                            <label><ClipboardList size={14} style={{ marginRight: 6 }} /> Notas Médicas / Observaciones</label>
                                            <textarea rows={2} value={selectedPatient.notes} onChange={e => setSelectedPatient({ ...selectedPatient, notes: e.target.value })} style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid #ddd', fontFamily: 'inherit' }} />
                                        </div>

                                        <div className="consent-verification-check" style={{
                                            padding: '0.6rem 0.8rem',
                                            borderRadius: '8px',
                                            backgroundColor: selectedPatient.consentLopd ? 'rgba(5, 150, 105, 0.08)' : 'rgba(220, 38, 38, 0.08)',
                                            border: `1px solid ${selectedPatient.consentLopd ? '#05966944' : '#dc262644'}`,
                                            marginTop: '0.75rem',
                                            boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.01)'
                                        }}>
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    {selectedPatient.consentLopd ? (
                                                        <ShieldCheck size={20} style={{ color: '#059669' }} />
                                                    ) : (
                                                        <ShieldAlert size={20} style={{ color: '#dc2626' }} />
                                                    )}
                                                    <div>
                                                        <p style={{ fontWeight: 600, fontSize: '0.9rem', margin: 0 }}>Firma LOPD y Tratamiento de Datos</p>
                                                        <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', margin: 0 }}>
                                                            {selectedPatient.consentLopd
                                                                ? `Verificado el ${new Date(selectedPatient.consentDate!).toLocaleDateString('es-ES')}`
                                                                : 'Pendiente de firma por parte de los tutores'
                                                            }
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="checkbox"
                                                        id="consentLopd"
                                                        checked={selectedPatient.consentLopd || false}
                                                        onChange={e => {
                                                            const isChecked = e.target.checked;
                                                            setSelectedPatient({
                                                                ...selectedPatient,
                                                                consentLopd: isChecked,
                                                                consentDate: isChecked ? (selectedPatient.consentDate || new Date().toISOString()) : selectedPatient.consentDate
                                                            });
                                                        }}
                                                        style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                                                    />
                                                    <label htmlFor="consentLopd" style={{ fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer' }}>Marcar como Verificado</label>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Control de Recordatorios de Citas por WhatsApp */}
                                        <div className="whatsapp-reminders-card" style={{
                                            padding: '0.6rem 0.8rem',
                                            borderRadius: '8px',
                                            backgroundColor: (selectedPatient.recibirRecordatoriosWhatsapp !== false) ? 'rgba(37, 99, 235, 0.06)' : 'rgba(100, 116, 139, 0.08)',
                                            border: `1px solid ${(selectedPatient.recibirRecordatoriosWhatsapp !== false) ? '#2563eb33' : '#94a3b833'}`,
                                            marginTop: '0.6rem',
                                            boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.01)'
                                        }}>
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <div style={{
                                                        width: '32px',
                                                        height: '32px',
                                                        borderRadius: '8px',
                                                        backgroundColor: (selectedPatient.recibirRecordatoriosWhatsapp !== false) ? '#eff6ff' : '#f1f5f9',
                                                        color: (selectedPatient.recibirRecordatoriosWhatsapp !== false) ? '#2563eb' : '#64748b',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center'
                                                    }}>
                                                        <MessageSquare size={16} />
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <p style={{ fontWeight: 600, fontSize: '0.9rem', margin: 0 }}>Recordatorios de Citas por WhatsApp</p>
                                                            {selectedPatient.whatsappRgpdEnviado ? (
                                                                <span style={{ fontSize: '0.7rem', color: '#059669', backgroundColor: '#d1fae5', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>
                                                                    RGPD Enviado
                                                                </span>
                                                            ) : (
                                                                <span style={{ fontSize: '0.7rem', color: '#64748b', backgroundColor: '#f1f5f9', padding: '1px 6px', borderRadius: '4px' }}>
                                                                    RGPD Pendiente
                                                                </span>
                                                            )}
                                                        </div>
                                                        <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', margin: 0 }}>
                                                            {selectedPatient.recibirRecordatoriosWhatsapp !== false
                                                                ? 'Envío automático activo a las 10:00 AM el día previo (o viernes para el lunes).'
                                                                : 'Recordatorios desactivados para este paciente (no recibirá WhatsApps automáticos).'
                                                            }
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="checkbox"
                                                        id="recibirRecordatoriosWhatsapp"
                                                        checked={selectedPatient.recibirRecordatoriosWhatsapp !== false}
                                                        onChange={e => {
                                                            setSelectedPatient({
                                                                ...selectedPatient,
                                                                recibirRecordatoriosWhatsapp: e.target.checked
                                                            });
                                                        }}
                                                        style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                                                    />
                                                    <label htmlFor="recibirRecordatoriosWhatsapp" style={{ fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer' }}>
                                                        {selectedPatient.recibirRecordatoriosWhatsapp !== false ? 'Activado' : 'Desactivado'}
                                                    </label>
                                                </div>
                                            </div>
                                        </div>
                                    </section>

                                    <div className="modal-footer">
                                        {selectedPatient.id && (
                                            <div className="flex gap-2" style={{ marginRight: 'auto' }}>
                                                <button
                                                    type="button"
                                                    className="btn-warning-soft"
                                                    onClick={() => handleMoveToWaitingList(selectedPatient as Patient)}
                                                >
                                                    <ClipboardList size={14} /> Mover a Lista de Espera
                                                </button>
                                                <button
                                                    type="button"
                                                    className="btn-danger-soft"
                                                    onClick={handleDelete}
                                                >
                                                    <Trash2 size={14} /> Eliminar Paciente
                                                </button>
                                            </div>
                                        )}
                                        <button type="button" className="btn-secondary" onClick={() => setIsModalOpen(false)}>Cancelar</button>
                                        <button type="submit" className="btn-primary">Guardar Ficha Completa</button>
                                    </div>
                                </form>
                            )}

                            {activeTab === 'appointments' && (
                                <div className="appointments-tab">
                                    {/* Cabecera y Controles de la Pestaña Citas */}
                                    <div className="appt-tab-header">
                                        <div className="appt-tab-title-group">
                                            <h4 className="appt-tab-title">
                                                <Calendar size={18} className="text-primary" />
                                                Citas del Paciente
                                            </h4>
                                            <p className="appt-tab-subtitle">
                                                {apptFilter === 'future'
                                                    ? '⚡ Próximas citas pendientes, ordenadas de más cercana a más lejana'
                                                    : apptFilter === 'past'
                                                    ? '🕒 Historial de citas anteriores, ordenadas de más recientes a más antiguas'
                                                    : `Historial completo de citas (${patientAppointments.length})`}
                                            </p>
                                        </div>

                                        <div className="appt-tab-actions">
                                            {/* Filtros de Vista: Próximas Citas / Citas Pasadas / Todas */}
                                            <div className="appt-view-pills">
                                                <button
                                                    type="button"
                                                    className={`appt-pill-btn ${apptFilter === 'future' ? 'active' : ''}`}
                                                    onClick={() => setApptFilter('future')}
                                                    title="Ver próximas citas pendientes del paciente"
                                                >
                                                    <Calendar size={13} />
                                                    <span>Próximas citas</span>
                                                    <span className="pill-badge">
                                                        {futureApptsCount}
                                                    </span>
                                                </button>
                                                <button
                                                    type="button"
                                                    className={`appt-pill-btn ${apptFilter === 'past' ? 'active' : ''}`}
                                                    onClick={() => setApptFilter('past')}
                                                    title="Ver historial de citas finalizadas y pasadas"
                                                >
                                                    <Clock size={13} />
                                                    <span>Citas pasadas</span>
                                                    <span className="pill-badge">
                                                        {pastApptsCount}
                                                    </span>
                                                </button>
                                                <button
                                                    type="button"
                                                    className={`appt-pill-btn ${apptFilter === 'all' ? 'active' : ''}`}
                                                    onClick={() => setApptFilter('all')}
                                                    title="Ver todas las citas"
                                                >
                                                    <span>Todas</span>
                                                    <span className="pill-badge">
                                                        {patientAppointments.length}
                                                    </span>
                                                </button>
                                            </div>

                                            {/* Botones de Acción de Selección y Eliminación Masiva */}
                                            {selectedApptIds.size === 0 ? (
                                                apptFilter === 'future' && futureApptsCount > 0 && (
                                                    <button
                                                        type="button"
                                                        className="appt-bulk-future-btn"
                                                        onClick={handleSelectOnlyFuture}
                                                        title="Selecciona de golpe todas las citas futuras del paciente"
                                                    >
                                                        <CheckCheck size={14} />
                                                        <span>Marcar futuras ({futureApptsCount})</span>
                                                    </button>
                                                )
                                            ) : (
                                                <div className="appt-bulk-selected-box">
                                                    <span className="appt-bulk-selected-count">
                                                        {selectedApptIds.size} seleccionada{selectedApptIds.size > 1 ? 's' : ''}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        className="appt-bulk-desel-btn"
                                                        onClick={() => setSelectedApptIds(new Set())}
                                                    >
                                                        Deseleccionar
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="appt-bulk-del-btn"
                                                        onClick={handleDeleteSelectedClick}
                                                    >
                                                        <Trash2 size={13} />
                                                        Eliminar ({selectedApptIds.size})
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {patientAppointments.length === 0 ? (
                                        <div className="empty-state py-8 text-center bg-gray-50/70 border border-dashed border-gray-200 rounded-xl my-4">
                                            No hay citas registradas para este paciente.
                                        </div>
                                    ) : displayedAppointments.length === 0 ? (
                                        <div className="empty-state py-8 text-center bg-gray-50/70 border border-dashed border-gray-200 rounded-xl my-4">
                                            <p className="text-sm text-gray-600 font-medium mb-3">
                                                {apptFilter === 'future'
                                                    ? 'No hay próximas citas programadas para este paciente.'
                                                    : apptFilter === 'past'
                                                    ? 'No hay citas pasadas registradas para este paciente.'
                                                    : 'No hay citas en este filtro.'}
                                            </p>
                                            {apptFilter === 'future' && pastApptsCount > 0 && (
                                                <button
                                                    type="button"
                                                    className="appt-bulk-future-btn"
                                                    onClick={() => setApptFilter('past')}
                                                >
                                                    <Clock size={14} />
                                                    Ver historial de citas pasadas ({pastApptsCount})
                                                </button>
                                            )}
                                            {apptFilter === 'past' && futureApptsCount > 0 && (
                                                <button
                                                    type="button"
                                                    className="appt-bulk-future-btn"
                                                    onClick={() => setApptFilter('future')}
                                                >
                                                    <Calendar size={14} />
                                                    Ver próximas citas programadas ({futureApptsCount})
                                                </button>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="patient-appt-table-container">
                                            <table className="patient-appt-table">
                                                <thead>
                                                    <tr>
                                                        <th style={{ width: '38px', textAlign: 'center', padding: '0.65rem 0.25rem' }}>
                                                            <input
                                                                type="checkbox"
                                                                className="appt-checkbox"
                                                                checked={allFilteredSelected}
                                                                onChange={toggleSelectAll}
                                                                title={allFilteredSelected ? 'Deseleccionar todas las mostradas' : 'Seleccionar todas las citas mostradas'}
                                                            />
                                                        </th>
                                                        <th style={{ minWidth: '135px' }}>Fecha y Horario</th>
                                                        <th style={{ minWidth: '140px' }}>Terapeuta</th>
                                                        <th style={{ minWidth: '120px' }}>Tipo de Sesión</th>
                                                        <th style={{ minWidth: '135px' }}>Recurrencia / Serie</th>
                                                        <th style={{ minWidth: '95px' }}>Estado</th>
                                                        <th style={{ width: '40px', textAlign: 'center', padding: '0.65rem 0.25rem' }}>Acción</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {displayedAppointments.map(appt => {
                                                        const isSelected = selectedApptIds.has(appt.id);
                                                        const isFuture = isFutureAppointment(appt);
                                                        const relLabel = getApptRelativeLabel(appt.start);
                                                        const isBiweekly = appt.recurrence?.frequency === 'biweekly';
                                                        const isWeekly = appt.recurrence?.frequency === 'weekly';

                                                        return (
                                                            <tr
                                                                key={appt.id}
                                                                className={isSelected ? 'row-selected' : ''}
                                                            >
                                                                <td style={{ textAlign: 'center', padding: '0.65rem 0.25rem' }}>
                                                                    <input
                                                                        type="checkbox"
                                                                        className="appt-checkbox"
                                                                        checked={isSelected}
                                                                        onChange={() => toggleSelectAppt(appt.id)}
                                                                    />
                                                                </td>
                                                                <td>
                                                                    <div className="appt-date-cell">
                                                                        <div className="appt-date-main">
                                                                            <span className={`appt-date-day ${isFuture ? 'future' : ''}`}>
                                                                                {formatApptDate(appt.start)}
                                                                            </span>
                                                                            {relLabel && (
                                                                                <span className={`appt-rel-tag ${relLabel === 'Hoy' ? 'tag-today' : 'tag-tomorrow'}`}>
                                                                                    {relLabel}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                        {appt.start && appt.start.includes('T') && (
                                                                            <span className="appt-time-sub">
                                                                                <Clock size={11} />
                                                                                {formatApptTime(appt.start)}
                                                                                {appt.end && appt.end.includes('T') ? ` – ${formatApptTime(appt.end)}` : ''}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                                <td>
                                                                    <div className="appt-therapist-cell">
                                                                        <div className="appt-therapist-avatar">
                                                                            {appt.therapistName?.charAt(0) || 'T'}
                                                                        </div>
                                                                        <span className="appt-therapist-name" title={appt.therapistName}>
                                                                            {appt.therapistName || 'Sin asignar'}
                                                                        </span>
                                                                    </div>
                                                                </td>
                                                                <td>
                                                                    <span className="appt-type-label">
                                                                        {appt.type || 'Sesión'}
                                                                    </span>
                                                                </td>
                                                                <td>
                                                                    {isBiweekly ? (
                                                                        <div className="appt-recurrence-cell">
                                                                            <span className="appt-badge-recurrence biweekly">
                                                                                <Repeat size={11} /> Quincenal (15d)
                                                                            </span>
                                                                            <button
                                                                                type="button"
                                                                                className="appt-series-action"
                                                                                onClick={() => handleSelectSeries(appt)}
                                                                                title="Marcar todas las citas de 15 días de esta serie"
                                                                            >
                                                                                Marcar serie
                                                                            </button>
                                                                        </div>
                                                                    ) : isWeekly ? (
                                                                        <div className="appt-recurrence-cell">
                                                                            <span className="appt-badge-recurrence weekly">
                                                                                <Repeat size={11} /> Semanal
                                                                            </span>
                                                                            <button
                                                                                type="button"
                                                                                className="appt-series-action"
                                                                                onClick={() => handleSelectSeries(appt)}
                                                                                title="Marcar todas las citas semanales de esta serie"
                                                                            >
                                                                                Marcar serie
                                                                            </button>
                                                                        </div>
                                                                    ) : (
                                                                        <span className="appt-punctual-label">Puntual</span>
                                                                    )}
                                                                </td>
                                                                <td>
                                                                    <span className={`appt-status-pill status-${(appt.status || '').toLowerCase().replace(/\s+/g, '-')}`}>
                                                                        {appt.status}
                                                                    </span>
                                                                </td>
                                                                <td style={{ textAlign: 'center', padding: '0.65rem 0.25rem' }}>
                                                                    <button
                                                                        type="button"
                                                                        className="appt-action-delete"
                                                                        onClick={() => handleDeleteSingleClick(appt)}
                                                                        title="Eliminar esta cita"
                                                                    >
                                                                        <Trash2 size={14} />
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}

                                    {/* Pie de navegación rápida entre próximas y pasadas */}
                                    {patientAppointments.length > 0 && displayedAppointments.length > 0 && (
                                        <div className="appt-table-footer">
                                            <span className="appt-footer-count">
                                                {apptFilter === 'future'
                                                    ? `Mostrando ${displayedAppointments.length} próxima(s) cita(s) ordenada(s) por fecha más cercana.`
                                                    : apptFilter === 'past'
                                                    ? `Mostrando ${displayedAppointments.length} cita(s) pasada(s) ordenada(s) de más recientes a más antiguas.`
                                                    : `Mostrando las ${displayedAppointments.length} citas registradas.`}
                                            </span>
                                            {apptFilter === 'future' && pastApptsCount > 0 && (
                                                <button
                                                    type="button"
                                                    className="appt-footer-link"
                                                    onClick={() => setApptFilter('past')}
                                                >
                                                    Ver historial de {pastApptsCount} citas pasadas ➔
                                                </button>
                                            )}
                                            {apptFilter === 'past' && futureApptsCount > 0 && (
                                                <button
                                                    type="button"
                                                    className="appt-footer-link"
                                                    onClick={() => setApptFilter('future')}
                                                >
                                                    Ver {futureApptsCount} próximas citas programadas ➔
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}

                            {activeTab === 'history' && (
                                <div className="history-tab">
                                    <div className="section-title-small mb-4">
                                        <Activity size={18} />
                                        Historia Clínica (Evolución)
                                    </div>

                                    {/* Control de Registros Pendientes (Desplegable) */}
                                    {(() => {
                                        const pendingAppts = patientAppointments.filter(a => a.status === 'Finalizada' && !a.sessionDiary && !a.notes);
                                        if (pendingAppts.length === 0) return null;

                                        return (
                                            <div className="history-pending-accordion mb-6">
                                                <button
                                                    type="button"
                                                    className="history-pending-header"
                                                    onClick={() => setIsPendingHistoryExpanded(!isPendingHistoryExpanded)}
                                                >
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="history-pending-badge">
                                                            <AlertCircle size={14} />
                                                            {pendingAppts.length} {pendingAppts.length === 1 ? 'sesión pendiente' : 'sesiones pendientes'}
                                                        </span>
                                                        <span className="history-pending-subtitle">
                                                            Citas finalizadas sin informe o diario registrado
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-1 history-pending-toggle-text">
                                                        <span>{isPendingHistoryExpanded ? 'Ocultar' : 'Ver sesiones'}</span>
                                                        {isPendingHistoryExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                                    </div>
                                                </button>

                                                {isPendingHistoryExpanded && (
                                                    <div className="history-pending-body">
                                                        <div className="history-pending-list">
                                                            {pendingAppts.map(appt => (
                                                                <div key={appt.id} className="history-pending-item">
                                                                    <div className="history-pending-info">
                                                                        <span className="history-pending-date">
                                                                            {new Date(appt.start).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })} · {appt.type}
                                                                        </span>
                                                                        <span className="history-pending-therapist">
                                                                            Terapeuta: {appt.therapistName || 'Sin asignar'}
                                                                        </span>
                                                                    </div>
                                                                    <button
                                                                        className="btn-fix-history"
                                                                        onClick={() => {
                                                                            setActiveTab('appointments');
                                                                            setApptFilter('past');
                                                                        }}
                                                                    >
                                                                        Ver Cita
                                                                    </button>
                                                                </div>
                                                            ))}
                                                        </div>
                                                        <p className="text-[11px] text-slate-500 mt-2 italic font-normal">
                                                            * Estas citas han finalizado pero aún no se ha redactado su diario de sesión en el calendario.
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })()}

                                    {patientAppointments.filter(a => a.sessionDiary || a.notes).length === 0 ? (
                                        <div className="empty-state">No hay registros clínicos en la historia para este paciente.</div>
                                    ) : (
                                        <div className="history-timeline">
                                            {patientAppointments
                                                .filter(a => a.sessionDiary || a.notes)
                                                .sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime()) // Sort descending (newest first)
                                                .map((appt) => (
                                                    <div key={appt.id} className="history-item">
                                                        <div className="history-marker"></div>
                                                        <div className="history-header">
                                                            <div className="history-date">
                                                                <Calendar size={16} style={{ color: 'var(--color-accent-blue)' }} />
                                                                {new Date(appt.start).toLocaleDateString('es-ES', {
                                                                    day: '2-digit',
                                                                    month: 'long',
                                                                    year: 'numeric'
                                                                })}
                                                            </div>
                                                            <div className="history-therapist">
                                                                {appt.therapistName || 'Terapeuta'}
                                                            </div>
                                                        </div>
                                                        <div className="history-content">
                                                            {appt.sessionDiary && (
                                                                <div
                                                                    className="history-diary-text mb-2"
                                                                    dangerouslySetInnerHTML={{ __html: appt.sessionDiary }}
                                                                />
                                                            )}
                                                            {appt.notes && (
                                                                <div className="history-notes-text">
                                                                    <div className="flex items-center gap-2 mb-1.5 opacity-75 text-amber-700">
                                                                        <ClipboardList size={14} />
                                                                        <span className="text-xs font-bold uppercase tracking-wider">Notas / Estado de Terapia</span>
                                                                    </div>
                                                                    <div className="p-2.5 bg-amber-50/70 border border-amber-200 rounded-lg text-sm text-amber-950 italic whitespace-pre-wrap">
                                                                        {appt.notes}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {activeTab === 'files' && (
                                <div className="files-tab">
                                    <div className="section-title flex justify-between items-center mb-4">
                                        <h4>Documentos y Archivos</h4>
                                        <div className="flex gap-2">
                                            {(() => {
                                                const hasConsentFile = selectedPatient.files?.some(f => f.name === 'Ficha_Inscripcion_Firmada.pdf');
                                                const hasHistoryFile = selectedPatient.files?.some(f => f.name === 'Historia_Clinica.pdf');
                                                return (
                                                    <>
                                                        <button
                                                            className="btn-link flex items-center gap-2"
                                                            onClick={() => {
                                                                setConsentModalMode('consent');
                                                                setIsConsentViewMode(!!hasConsentFile);
                                                                setIsSigned(!!hasConsentFile);
                                                                setIsConsentModalOpen(true);
                                                            }}
                                                            style={{ color: 'var(--color-status-info)', textDecoration: 'none' }}
                                                        >
                                                            <FileText size={16} />
                                                            {hasConsentFile ? 'Ver Ficha Consentimiento' : 'Generar Ficha Consentimiento'}
                                                        </button>
                                                        <button
                                                            className="btn-link flex items-center gap-2"
                                                            onClick={() => {
                                                                setConsentModalMode('history');
                                                                setIsConsentViewMode(!!hasHistoryFile);
                                                                setIsSigned(!!hasHistoryFile);
                                                                setIsConsentModalOpen(true);
                                                            }}
                                                            style={{ color: 'var(--color-accent-blue)', textDecoration: 'none' }}
                                                        >
                                                            <Activity size={16} />
                                                            {hasHistoryFile ? 'Ver Historial Clínico' : 'Generar Historial Clínico'}
                                                        </button>
                                                    </>
                                                );
                                            })()}
                                            <button
                                                className="btn-secondary flex items-center gap-2"
                                                onClick={() => fileInputRef.current?.click()}
                                                disabled={isSending}
                                            >
                                                <Upload size={16} /> {isSending ? 'Subiendo...' : 'Subir Archivo'}
                                            </button>
                                            <input
                                                type="file"
                                                ref={fileInputRef}
                                                style={{ display: 'none' }}
                                                onChange={handleFileUpload}
                                            />
                                        </div>
                                    </div>

                                    {!selectedPatient.files || selectedPatient.files.length === 0 ? (
                                        <div className="empty-state">No hay archivos adjuntos.</div>
                                    ) : (
                                        <div className="files-grid">
                                            {selectedPatient.files.map(file => (
                                                <div
                                                    key={file.id}
                                                    className="file-item flex items-center justify-between p-3 border rounded-lg mb-2"
                                                    onClick={() => handleViewFile(file)}
                                                    style={{ cursor: 'pointer' }}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className="file-icon"><FileText size={20} color="var(--color-text-secondary)" /></div>
                                                        <div className="file-info">
                                                            <div className="file-name font-semibold text-sm">{file.name}</div>
                                                            <div className="file-meta text-xs text-secondary flex gap-2">
                                                                <span>{file.size}</span>
                                                                <span>•</span>
                                                                <span>{file.uploadDate}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        {selectedPatient.consentSignature && (
                                                            <button
                                                                className="btn-icon micro"
                                                                title="Re-enviar por email"
                                                                style={{ backgroundColor: 'rgba(0, 132, 255, 0.1)', border: '1px solid rgba(0, 132, 255, 0.2)' }}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleResendConsentEmail(selectedPatient as Patient);
                                                                }}
                                                            >
                                                                <Send size={14} style={{ color: '#0084ff' }} />
                                                            </button>
                                                        )}
                                                        <button className="btn-icon micro" title="Ver archivo"><Search size={14} /></button>
                                                        <button
                                                            className="btn-icon micro"
                                                            title="Eliminar archivo"
                                                            style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)' }}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleDeleteFile(file);
                                                            }}
                                                        >
                                                            <Trash2 size={14} style={{ color: '#ef4444' }} />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {activeTab === 'wallet' && selectedPatient?.id && (() => {
                                const pBalance = patientBalances.get(selectedPatient.id) || { balance: 0, totalDeposited: 0, totalConsumed: 0 };
                                const pFullName = `${selectedPatient.firstName || ''} ${selectedPatient.lastName || ''}`.toLowerCase().trim();
                                const movements = allTransactions
                                    .filter(t => (t.patientId && t.patientId === selectedPatient.id) || (t.patientName && t.patientName.toLowerCase().trim() === pFullName))
                                    .filter(t => isAdvanceDeposit(t.category, t.status) || isSaldoConsumption(t.method, t.category, t.status))
                                    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

                                return (
                                    <div className="wallet-tab-content">
                                        {/* Summary Cards */}
                                        <div className="wallet-summary-grid">
                                            <div className="wallet-card primary">
                                                <div className="wallet-card-header">
                                                    <Wallet size={20} />
                                                    <span>Saldo Disponible</span>
                                                </div>
                                                <div className="wallet-card-amount">
                                                    {pBalance.balance.toFixed(2)}€
                                                </div>
                                                <div className="wallet-card-subtitle">
                                                    {pBalance.balance > 0 ? 'Fondos a favor para sesiones de este paciente' : 'Sin saldo a favor'}
                                                </div>
                                            </div>

                                            <div className="wallet-card secondary">
                                                <div className="wallet-card-header">
                                                    <ArrowDown size={18} className="text-emerald-600" />
                                                    <span>Total Becas / Anticipos</span>
                                                </div>
                                                <div className="wallet-card-amount" style={{ color: '#047857' }}>
                                                    +{pBalance.totalDeposited.toFixed(2)}€
                                                </div>
                                                <div className="wallet-card-subtitle">
                                                    Ingresos registrados por la familia o becas
                                                </div>
                                            </div>

                                            <div className="wallet-card secondary">
                                                <div className="wallet-card-header">
                                                    <ArrowUp size={18} className="text-blue-600" />
                                                    <span>Total Consumido</span>
                                                </div>
                                                <div className="wallet-card-amount" style={{ color: '#2563eb' }}>
                                                    -{pBalance.totalConsumed.toFixed(2)}€
                                                </div>
                                                <div className="wallet-card-subtitle">
                                                    Sesiones clínicas pagadas con su saldo
                                                </div>
                                            </div>
                                        </div>

                                        {/* Action Bar */}
                                        <div className="wallet-action-bar flex justify-between items-center my-4">
                                            <h4 className="font-bold text-gray-800 flex items-center gap-2 m-0" style={{ fontSize: '0.95rem' }}>
                                                <Coins size={18} className="text-amber-500" />
                                                Historial de Movimientos del Monedero
                                            </h4>
                                            <button
                                                type="button"
                                                className="calendar-btn-pill calendar-btn-primary"
                                                style={{ padding: '0.45rem 1rem', fontSize: '0.85rem' }}
                                                onClick={() => {
                                                    setNewCreditAmount('');
                                                    setNewCreditMethod('Transferencia');
                                                    setNewCreditCategory('Ingreso Beca MEC');
                                                    setNewCreditDate(format(new Date(), 'yyyy-MM-dd'));
                                                    setNewCreditNotes('');
                                                    setIsAddCreditModalOpen(true);
                                                }}
                                            >
                                                <PlusCircle size={16} />
                                                <span>+ Ingresar Beca / Saldo</span>
                                            </button>
                                        </div>

                                        {/* Movements Table */}
                                        {movements.length === 0 ? (
                                            <div className="empty-state p-8 text-center bg-gray-50 rounded-xl border border-dashed border-gray-200">
                                                <Wallet size={36} className="mx-auto text-gray-300 mb-2" />
                                                <p className="text-gray-500 font-medium">Este paciente aún no tiene movimientos de saldo o beca.</p>
                                                <p className="text-xs text-gray-400 mt-1">Pulsa en <strong>"+ Ingresar Beca / Saldo"</strong> para añadir un anticipo o beca recibida.</p>
                                            </div>
                                        ) : (
                                            <div className="table-responsive rounded-xl border border-gray-100 overflow-hidden shadow-sm">
                                                <table className="wallet-table w-full text-sm" style={{ borderCollapse: 'collapse', width: '100%' }}>
                                                    <thead className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-600 uppercase">
                                                        <tr>
                                                            <th className="p-3 text-left">Fecha</th>
                                                            <th className="p-3 text-left">Concepto</th>
                                                            <th className="p-3 text-left">Forma de Pago</th>
                                                            <th className="p-3 text-right">Importe</th>
                                                            <th className="p-3 text-center">Acciones</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-100 bg-white">
                                                        {movements.map(m => {
                                                            const isDeposit = isAdvanceDeposit(m.category, m.status);
                                                            return (
                                                                <tr key={m.id} className="hover:bg-gray-50/80 transition-colors">
                                                                    <td className="p-3 font-medium text-gray-700">
                                                                        {m.date ? format(parseISO(m.date), 'dd/MM/yyyy') : '-'}
                                                                    </td>
                                                                    <td className="p-3">
                                                                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${isDeposit ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-blue-50 text-blue-700 border border-blue-200'}`}>
                                                                            {isDeposit ? '🟢 ' : '🔵 '}
                                                                            {m.category || (isDeposit ? 'Ingreso Beca' : 'Sesión Terapia')}
                                                                        </span>
                                                                    </td>
                                                                    <td className="p-3 text-gray-600">
                                                                        {m.method || (isDeposit ? 'Transferencia' : 'Saldo a favor')}
                                                                    </td>
                                                                    <td className={`p-3 text-right font-bold ${isDeposit ? 'text-emerald-600' : 'text-blue-600'}`} style={{ color: isDeposit ? '#047857' : '#2563eb' }}>
                                                                        {isDeposit ? `+${m.amount.toFixed(2)}€` : `-${m.amount.toFixed(2)}€`}
                                                                    </td>
                                                                    <td className="p-3 text-center">
                                                                        {isDeposit ? (
                                                                            <button
                                                                                type="button"
                                                                                className="btn-icon text-red-500 hover:text-red-700 p-1"
                                                                                style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#ef4444' }}
                                                                                title="Eliminar ingreso"
                                                                                onClick={() => handleDeleteCreditMovement(m.id)}
                                                                            >
                                                                                <Trash2 size={16} />
                                                                            </button>
                                                                        ) : (
                                                                            <span className="text-xs text-gray-400">Sesión cita</span>
                                                                        )}
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                </div>
            )}

            {/* Modal para ingresar saldo o beca */}
            {isAddCreditModalOpen && selectedPatient && (
                <div className="modal-overlay" style={{ zIndex: 25000, backgroundColor: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(4px)' }}>
                    <div className="modal-content" style={{ maxWidth: '480px', width: '90%', borderRadius: '16px' }}>
                        <div className="modal-header">
                            <div className="flex items-center gap-2">
                                <Wallet size={20} style={{ color: '#047857' }} />
                                <h3>Ingresar Saldo / Beca en Monedero</h3>
                            </div>
                            <button className="btn-icon-round" onClick={() => setIsAddCreditModalOpen(false)}>
                                <X size={20} />
                            </button>
                        </div>
                        <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div style={{ padding: '0.75rem', backgroundColor: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '10px', fontSize: '0.8rem', color: '#065f46' }}>
                                Ingreso a favor de <strong>{selectedPatient.firstName} {selectedPatient.lastName}</strong>.
                                Este importe computará en caja hoy como cobrado real por la forma de pago elegida, y permitirá pagar futuras sesiones descontando de este saldo.
                            </div>

                            <div className="form-group">
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                                    Importe a Ingresar (€) *
                                </label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="1"
                                    required
                                    style={{ width: '100%', padding: '0.6rem 0.8rem', fontSize: '1.2rem', fontWeight: 700, color: '#047857', border: '2px solid #cbd5e1', borderRadius: '8px' }}
                                    placeholder="Ej: 300.00"
                                    value={newCreditAmount}
                                    onChange={e => setNewCreditAmount(e.target.value)}
                                />
                            </div>

                            <div className="form-group">
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                                    Concepto / Tipo de Ingreso *
                                </label>
                                <select
                                    style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                                    value={newCreditCategory}
                                    onChange={e => setNewCreditCategory(e.target.value)}
                                >
                                    <option value="Ingreso Beca MEC">Beca MEC / NEAE</option>
                                    <option value="Anticipo mensualidad">Anticipo Mensualidad (Varias sesiones)</option>
                                    <option value="Bono sesiones">Bono de Sesiones por adelantado</option>
                                    <option value="Ingreso Beca">Otro Ingreso de Beca</option>
                                    <option value="Anticipo">Otro Anticipo a cuenta</option>
                                </select>
                            </div>

                            <div className="form-group">
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                                    Forma de Pago Recibida *
                                </label>
                                <select
                                    style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                                    value={newCreditMethod}
                                    onChange={e => setNewCreditMethod(e.target.value as any)}
                                >
                                    <option value="Transferencia">🏦 Transferencia Bancaria</option>
                                    <option value="Tarjeta">💳 Tarjeta (Datáfono)</option>
                                    <option value="Efectivo">💵 Efectivo</option>
                                </select>
                            </div>

                            <div className="form-group">
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                                    Fecha del Ingreso *
                                </label>
                                <input
                                    type="date"
                                    required
                                    style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                                    value={newCreditDate}
                                    onChange={e => setNewCreditDate(e.target.value)}
                                />
                            </div>

                            <div className="form-group">
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                                    Observaciones / Notas (Opcional)
                                </label>
                                <input
                                    type="text"
                                    style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                                    placeholder="Ej: Beca concedida curso 2026-27"
                                    value={newCreditNotes}
                                    onChange={e => setNewCreditNotes(e.target.value)}
                                />
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #e2e8f0' }}>
                                <button
                                    type="button"
                                    className="btn-secondary"
                                    onClick={() => setIsAddCreditModalOpen(false)}
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="button"
                                    className="calendar-btn-pill calendar-btn-primary"
                                    disabled={isSavingCredit || !newCreditAmount || Number(newCreditAmount) <= 0}
                                    onClick={handleSavePatientCredit}
                                >
                                    <CheckCheck size={16} />
                                    <span>{isSavingCredit ? 'Guardando...' : 'Confirmar Ingreso en Monedero'}</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {isConsentModalOpen && selectedPatient && (
                <div className="modal-overlay consent-modal-overlay" style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 20000, // Higher than global 10001
                    backgroundColor: 'rgba(0, 0, 0, 0.6)',
                    backdropFilter: 'blur(8px)' // More blur to isolate
                }}>
                    <div className="modal-content consent-form-modal" style={{
                        maxWidth: '1100px',
                        width: '95%',
                        height: '92vh',
                        display: 'flex',
                        flexDirection: 'column',
                        padding: '0',
                        borderRadius: '16px',
                        overflow: 'hidden',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6)',
                        border: '1px solid rgba(255, 255, 255, 0.1)'
                    }}>
                        {/* Header - Fixed at top */}
                        <div className="modal-header no-print" style={{
                            padding: '1.25rem 2rem',
                            backgroundColor: 'white',
                            borderBottom: '1px solid #e2e8f0',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexShrink: 0
                        }}>
                            <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, color: '#1e293b' }}>
                                {consentModalMode === 'consent'
                                    ? (isConsentViewMode ? 'Visor de Ficha de Consentimiento' : 'Ficha de Inscripción y Consentimiento')
                                    : (isConsentViewMode ? 'Visor de Historial Clínico' : 'Historial Clínico de Paciente')}
                            </h3>
                            <button className="btn-icon-round" title="Cerrar" onClick={() => { setIsConsentModalOpen(false); setIsConsentViewMode(false); }}><X size={20} /></button>
                        </div>

                        {/* Body - Scrollable */}
                        <div id="consent-modal-body" className="modal-body" style={{
                            flex: 1,
                            padding: '3rem 1rem',
                            backgroundColor: '#64748b',
                            overflowY: 'auto',
                            textAlign: 'center',
                            display: 'block' // Ensure block layout for scrolling children
                        }}>
                            <div style={{
                                backgroundColor: 'white',
                                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)',
                                width: '850px',
                                maxWidth: '100%',
                                borderRadius: '4px',
                                margin: '0 auto',
                                textAlign: 'left',
                                minHeight: 'min-content',
                                padding: '1rem' // Internal spacing
                            }}>
                                <ConsentDocument
                                    patient={selectedPatient as Patient}
                                    isViewMode={isConsentViewMode}
                                    signatureUrl={selectedPatient.consentSignature}
                                    tutor2SignatureUrl={selectedPatient.tutor2Signature}
                                    therapistSignatureUrl={selectedPatient.therapistSignature}
                                    isSigned={isSigned}
                                    startDrawing={startDrawing}
                                    draw={draw}
                                    stopDrawing={stopDrawing}
                                    clearSignature={clearSignature}
                                    mode={consentModalMode}
                                />
                            </div>
                        </div>

                        {/* Footer - Fixed at bottom */}
                        <div className="modal-footer" style={{
                            padding: '1.5rem 2rem',
                            borderTop: '1px solid #e2e8f0',
                            display: 'flex',
                            justifyContent: 'flex-end',
                            gap: '1rem',
                            backgroundColor: 'white',
                            flexShrink: 0,
                            zIndex: 20
                        }}>
                            <button type="button" className="btn-secondary" onClick={() => { setIsConsentModalOpen(false); setIsConsentViewMode(false); }}>Cerrar</button>

                            {/* Mostrar siempre los botones de edición si el usuario quiere que sea editable */}
                            <button
                                type="button"
                                className="btn-secondary flex items-center gap-2"
                                onClick={handleSaveDraftConsent}
                                disabled={isSending}
                                style={{ backgroundColor: '#f1f5f9', border: '1px solid #cbd5e1' }}
                            >
                                <Activity size={16} /> {isSending ? 'Guardando...' : (isConsentViewMode ? (consentModalMode === 'consent' ? 'Actualizar Ficha' : 'Actualizar Historial') : 'Guardar Borrador')}
                            </button>

                            {(() => {
                                const hasAnySignature = consentModalMode === 'consent'
                                    ? !!(selectedPatient.consentSignature || selectedPatient.tutor2Signature || isSigned)
                                    : !!(selectedPatient.therapistSignature || isSigned);
                                return (
                                    <button
                                        type="button"
                                        className="btn-primary flex items-center gap-2"
                                        disabled={!hasAnySignature || isSending}
                                        onClick={() => handleSaveAndSendConsent()}
                                        style={{ backgroundColor: '#3b82f6', color: 'white' }}
                                    >
                                        <Mail size={16} /> {isSending ? (processingStep || 'Procesando...') : (
                                            consentModalMode === 'consent'
                                                ? (isConsentViewMode ? 'Firmar y Enviar de nuevo' : 'Firmar y Enviar')
                                                : (isConsentViewMode ? 'Firmar y Guardar de nuevo' : 'Firmar y Guardar')
                                        )}
                                    </button>
                                );
                            })()}

                            {isConsentViewMode && (
                                <>
                                    <button
                                        type="button"
                                        className="btn-primary flex items-center gap-2"
                                        onClick={handleDownloadPDF}
                                        disabled={isSending}
                                        style={{ backgroundColor: '#a5f3fc', color: '#0891b2', border: 'none' }}
                                    >
                                        <Download size={16} /> {isSending ? 'Generando...' : 'Descargar PDF'}
                                    </button>
                                </>
                            )}
                        </div>

                        {/* Print Portal - Dedicated isolation for printing */}
                        <PrintPortal>
                            <ConsentDocument
                                patient={selectedPatient as Patient}
                                isViewMode={isConsentViewMode}
                                signatureUrl={selectedPatient.consentSignature}
                                tutor2SignatureUrl={selectedPatient.tutor2Signature}
                                therapistSignatureUrl={selectedPatient.therapistSignature}
                                isSigned={isSigned}
                                mode={consentModalMode}
                            />
                        </PrintPortal>
                    </div>
                </div>
            )}
            {/* Modal de Confirmación de Eliminación Custom de Archivo */}
            {deleteConfirm.isOpen && (
                <div className="modal-overlay" style={{ zIndex: 40000, backgroundColor: 'rgba(0,0,0,0.5)' }}>
                    <div className="modal-container" style={{ maxWidth: '400px', padding: '2rem', textAlign: 'center' }}>
                        <div style={{ color: '#ef4444', marginBottom: '1rem' }}><Trash2 size={48} /></div>
                        <h3 style={{ marginBottom: '0.5rem' }}>¿Eliminar archivo?</h3>
                        <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '2rem' }}>
                            Estás a punto de eliminar <strong>{deleteConfirm.file?.name}</strong>. Esta acción no se puede deshacer.
                        </p>
                        <div className="flex gap-3 justify-center">
                            <button className="btn-secondary" onClick={() => setDeleteConfirm({ isOpen: false, file: null })}>Cancelar</button>
                            <button className="btn-primary" style={{ backgroundColor: '#ef4444', border: 'none' }} onClick={confirmDelete}>Eliminar ahora</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Confirmación de Eliminación de Citas */}
            {confirmDeleteApptsModal.isOpen && (
                <div className="modal-overlay" style={{ zIndex: 45000, backgroundColor: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="modal-content" style={{ maxWidth: '520px', width: '90%', borderRadius: '16px', padding: '1.75rem', backgroundColor: 'white', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                            <div style={{ width: '42px', height: '42px', borderRadius: '50%', backgroundColor: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <Trash2 size={22} style={{ color: '#dc2626' }} />
                            </div>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#991b1b' }}>
                                    {confirmDeleteApptsModal.appts.length === 1 ? '¿Eliminar esta cita?' : `¿Eliminar ${confirmDeleteApptsModal.appts.length} citas?`}
                                </h3>
                                <p style={{ margin: '2px 0 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                                    {confirmDeleteApptsModal.appts.length === 1
                                        ? 'Esta cita se eliminará permanentemente de la agenda.'
                                        : `Se eliminarán permanentemente las ${confirmDeleteApptsModal.appts.length} citas seleccionadas de la agenda.`}
                                </p>
                            </div>
                        </div>

                        <div style={{ maxHeight: '220px', overflowY: 'auto', margin: '1rem 0', padding: '0.75rem', backgroundColor: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                                Resumen de citas a eliminar:
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                {confirmDeleteApptsModal.appts.map(a => (
                                    <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.82rem', padding: '0.4rem 0.6rem', backgroundColor: 'white', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                        <div>
                                            <span style={{ fontWeight: 700, color: '#1e293b' }}>{formatApptDate(a.start)}</span>
                                            {a.start && a.start.includes('T') && (
                                                <span style={{ color: '#64748b', marginLeft: '6px', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                                                    {formatApptTime(a.start)}
                                                </span>
                                            )}
                                            {a.recurrence?.frequency === 'biweekly' && (
                                                <span style={{ fontSize: '0.7rem', backgroundColor: '#e0e7ff', color: '#4338ca', padding: '1px 5px', borderRadius: '4px', marginLeft: '6px', fontWeight: 600 }}>
                                                    15 días
                                                </span>
                                            )}
                                            {a.recurrence?.frequency === 'weekly' && (
                                                <span style={{ fontSize: '0.7rem', backgroundColor: '#ede9fe', color: '#6d28d9', padding: '1px 5px', borderRadius: '4px', marginLeft: '6px', fontWeight: 600 }}>
                                                    Semanal
                                                </span>
                                            )}
                                        </div>
                                        <span style={{ fontSize: '0.78rem', color: '#64748b' }}>{a.therapistName}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid #f1f5f9' }}>
                            <button
                                type="button"
                                className="btn-secondary"
                                disabled={isDeletingAppts}
                                onClick={() => setConfirmDeleteApptsModal({ isOpen: false, appts: [] })}
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                className="btn-danger"
                                disabled={isDeletingAppts}
                                onClick={confirmDeleteSelectedAppts}
                                style={{ minWidth: '160px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', backgroundColor: '#dc2626', color: 'white', fontWeight: 700 }}
                            >
                                {isDeletingAppts ? (
                                    <>
                                        <span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full" />
                                        <span>Eliminando...</span>
                                    </>
                                ) : (
                                    <>
                                        <Trash2 size={16} />
                                        <span>Sí, eliminar {confirmDeleteApptsModal.appts.length === 1 ? 'cita' : `${confirmDeleteApptsModal.appts.length} citas`}</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Espaciador final para asegurar margen inferior visual */}
            <div style={{ height: '250px', width: '100%', flexShrink: 0 }} aria-hidden="true" />
            {/* Modal de Confirmación de Eliminación de Paciente */}
            {patientDeleteConfirm.isOpen && (
                <div className="modal-overlay" style={{ zIndex: 30000 }}>
                    <div className="modal-content delete-confirm-modal" style={{ maxWidth: '400px' }}>
                        <div className="modal-header">
                            <h3 className="text-danger flex items-center gap-2">
                                <Trash2 size={20} /> Confirmar Eliminación
                            </h3>
                            <button className="btn-icon-round" onClick={() => setPatientDeleteConfirm({ isOpen: false, patient: null })}><X size={20} /></button>
                        </div>
                        <div className="modal-body" style={{ padding: '1.5rem' }}>
                            <p>¿Estás completamente seguro de que deseas eliminar a <strong>{patientDeleteConfirm.patient?.firstName} {patientDeleteConfirm.patient?.lastName}</strong>?</p>
                            <p style={{ color: '#ef4444', fontSize: '0.85rem', marginTop: '1rem', fontWeight: 600 }}>
                                <ShieldAlert size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                                Esta acción es irreversible y eliminará todo su historial, archivos y citas.
                            </p>
                        </div>
                        <div className="modal-footer" style={{ justifyContent: 'flex-end', gap: '1rem' }}>
                            <button className="btn-secondary" onClick={() => setPatientDeleteConfirm({ isOpen: false, patient: null })}>Cancelar</button>
                            <button className="btn-primary" style={{ backgroundColor: '#ef4444', border: 'none' }} onClick={confirmPatientDelete}>Sí, Eliminar Definitivamente</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PatientList;
