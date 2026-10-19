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
import { User, Users, Phone, Mail, Search, UserPlus, X, Calendar, ClipboardList, FileText, Upload, Activity, Download, Send, ShieldCheck, ShieldAlert, Star, Trash2, Heart, ChevronDown, ChevronUp, AlertCircle, MessageSquare, Repeat, CheckCheck } from 'lucide-react';
import { format, parseISO, isValid, isAfter } from 'date-fns';
import { es } from 'date-fns/locale';
import { useToast } from '../../hooks/useToast';
import PrintPortal from '../../components/ui/PrintPortal';
import ConsentDocument from './ConsentDocument';
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
    const [activeTab, setActiveTab] = useState<'general' | 'appointments' | 'files' | 'history'>('general');
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

    // Appointment management states
    const [selectedApptIds, setSelectedApptIds] = useState<Set<string>>(new Set());
    const [apptFilter, setApptFilter] = useState<'all' | 'future' | 'past'>('all');
    const [confirmDeleteApptsModal, setConfirmDeleteApptsModal] = useState<{ isOpen: boolean; appts: Appointment[] }>({ isOpen: false, appts: [] });
    const [isDeletingAppts, setIsDeletingAppts] = useState(false);

    const isFutureAppointment = (appt: Appointment) => {
        try {
            const d = parseISO(appt.start);
            return isValid(d) && isAfter(d, new Date());
        } catch {
            return false;
        }
    };

    const formatApptDate = (isoStr: string) => {
        try {
            const d = parseISO(isoStr);
            if (!isValid(d)) return isoStr;
            return format(d, 'dd/MM/yyyy', { locale: es });
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

    const sortedAppointments = useMemo(() => {
        return [...patientAppointments].sort((a, b) => {
            return (a.start || '').localeCompare(b.start || '');
        });
    }, [patientAppointments]);

    const futureApptsCount = useMemo(() => {
        return patientAppointments.filter(isFutureAppointment).length;
    }, [patientAppointments]);

    const pastApptsCount = useMemo(() => {
        return patientAppointments.length - futureApptsCount;
    }, [patientAppointments, futureApptsCount]);

    const displayedAppointments = useMemo(() => {
        return sortedAppointments.filter(appt => {
            if (apptFilter === 'future') return isFutureAppointment(appt);
            if (apptFilter === 'past') return !isFutureAppointment(appt);
            return true;
        });
    }, [sortedAppointments, apptFilter]);

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

    const fetchData = () => {
        setLoading(true);
        getPatients().then((data) => {
            setPatients(data);
            setLoading(false);
        });
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
                            <span className={`status-badge ${getStatusClass(patient.status)}`}>
                                {patient.status}
                            </span>
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
                    <div className="modal-content" style={{ maxWidth: '680px' }}>
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
                                    <button className={`tab-btn ${activeTab === 'appointments' ? 'active' : ''}`} onClick={() => setActiveTab('appointments')}>Citas</button>
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
                                    <div className="appt-tab-header mb-4">
                                        <div className="appt-tab-header-left">
                                            <h4 className="text-base font-bold text-gray-800 flex items-center gap-2 m-0">
                                                <Calendar size={18} className="text-primary" />
                                                Citas del Paciente
                                                <span className="text-xs font-normal text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                                                    {patientAppointments.length} total ({futureApptsCount} futuras)
                                                </span>
                                            </h4>

                                            {/* Filtros de Vista: Todas / Futuras / Pasadas */}
                                            <div className="appt-view-pills">
                                                <button
                                                    type="button"
                                                    className={`appt-pill-btn ${apptFilter === 'all' ? 'active' : ''}`}
                                                    onClick={() => setApptFilter('all')}
                                                >
                                                    Todas ({patientAppointments.length})
                                                </button>
                                                <button
                                                    type="button"
                                                    className={`appt-pill-btn ${apptFilter === 'future' ? 'active' : ''}`}
                                                    onClick={() => setApptFilter('future')}
                                                >
                                                    ⚡ Futuras ({futureApptsCount})
                                                </button>
                                                <button
                                                    type="button"
                                                    className={`appt-pill-btn ${apptFilter === 'past' ? 'active' : ''}`}
                                                    onClick={() => setApptFilter('past')}
                                                >
                                                    Pasadas ({pastApptsCount})
                                                </button>
                                            </div>
                                        </div>

                                        {/* Botones de Acción de Selección y Eliminación Masiva */}
                                        <div className="appt-tab-header-right flex items-center gap-2">
                                            {selectedApptIds.size === 0 ? (
                                                futureApptsCount > 0 && (
                                                    <button
                                                        type="button"
                                                        className="btn-secondary micro flex items-center gap-1.5"
                                                        onClick={handleSelectOnlyFuture}
                                                        title="Selecciona de golpe todas las citas futuras del paciente"
                                                    >
                                                        <CheckCheck size={14} className="text-primary" />
                                                        Marcar todas las futuras ({futureApptsCount})
                                                    </button>
                                                )
                                            ) : (
                                                <div className="flex items-center gap-2 bg-red-50 border border-red-200 px-3 py-1 rounded-xl animate-fadeIn">
                                                    <span className="text-xs font-bold text-red-800">
                                                        {selectedApptIds.size} seleccionada{selectedApptIds.size > 1 ? 's' : ''}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        className="btn-secondary micro text-xs py-0.5 px-2"
                                                        onClick={() => setSelectedApptIds(new Set())}
                                                    >
                                                        Deseleccionar
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="btn-danger micro flex items-center gap-1 text-xs py-1 px-3 shadow-sm"
                                                        onClick={handleDeleteSelectedClick}
                                                        style={{ backgroundColor: '#dc2626', color: 'white', fontWeight: 700 }}
                                                    >
                                                        <Trash2 size={13} />
                                                        Eliminar ({selectedApptIds.size})
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {patientAppointments.length === 0 ? (
                                        <div className="empty-state">No hay citas registradas para este paciente.</div>
                                    ) : displayedAppointments.length === 0 ? (
                                        <div className="empty-state">
                                            No hay citas en este filtro ({apptFilter === 'future' ? 'futuras' : 'pasadas'}).
                                            <button
                                                type="button"
                                                className="btn-link text-xs ml-2 underline text-primary cursor-pointer bg-transparent border-none"
                                                onClick={() => setApptFilter('all')}
                                            >
                                                Ver todas las citas
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="table-container shadow-none border rounded-xl overflow-hidden">
                                            <table className="data-table">
                                                <thead>
                                                    <tr>
                                                        <th style={{ width: '40px', textAlign: 'center' }}>
                                                            <input
                                                                type="checkbox"
                                                                className="cursor-pointer"
                                                                checked={allFilteredSelected}
                                                                onChange={toggleSelectAll}
                                                                title={allFilteredSelected ? 'Deseleccionar todas las mostradas' : 'Seleccionar todas las citas mostradas'}
                                                            />
                                                        </th>
                                                        <th style={{ minWidth: '130px' }}>Fecha y Hora</th>
                                                        <th>Terapeuta</th>
                                                        <th>Tipo</th>
                                                        <th>Recurrencia / Serie</th>
                                                        <th>Estado</th>
                                                        <th style={{ width: '60px', textAlign: 'right' }}>Acción</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {displayedAppointments.map(appt => {
                                                        const isSelected = selectedApptIds.has(appt.id);
                                                        const isFuture = isFutureAppointment(appt);
                                                        const isBiweekly = appt.recurrence?.frequency === 'biweekly';
                                                        const isWeekly = appt.recurrence?.frequency === 'weekly';

                                                        return (
                                                            <tr
                                                                key={appt.id}
                                                                className={isSelected ? 'bg-red-50/50' : ''}
                                                                style={{ transition: 'background-color 0.15s ease' }}
                                                            >
                                                                <td style={{ textAlign: 'center' }}>
                                                                    <input
                                                                        type="checkbox"
                                                                        className="cursor-pointer"
                                                                        checked={isSelected}
                                                                        onChange={() => toggleSelectAppt(appt.id)}
                                                                    />
                                                                </td>
                                                                <td>
                                                                    <div className="flex flex-col">
                                                                        <span className={`text-sm ${isFuture ? 'font-bold text-gray-900' : 'text-gray-600'}`}>
                                                                            {formatApptDate(appt.start)}
                                                                        </span>
                                                                        {appt.start && appt.start.includes('T') && (
                                                                            <span className="text-xs text-gray-500 font-mono">
                                                                                {formatApptTime(appt.start)}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                                <td>
                                                                    <div className="flex items-center gap-2">
                                                                        <div className="avatar micro">{appt.therapistName?.charAt(0) || 'T'}</div>
                                                                        <span className="text-sm font-medium text-gray-800">{appt.therapistName}</span>
                                                                    </div>
                                                                </td>
                                                                <td>
                                                                    <span className="text-sm text-gray-700">{appt.type || 'Sesión'}</span>
                                                                </td>
                                                                <td>
                                                                    {isBiweekly ? (
                                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 inline-flex items-center gap-1">
                                                                                <Repeat size={11} /> Quincenal (15 días)
                                                                            </span>
                                                                            <button
                                                                                type="button"
                                                                                className="text-[11px] text-indigo-600 hover:text-indigo-900 underline font-semibold bg-transparent border-none cursor-pointer p-0"
                                                                                onClick={() => handleSelectSeries(appt)}
                                                                                title="Marcar todas las citas de 15 días de esta serie"
                                                                            >
                                                                                Marcar serie
                                                                            </button>
                                                                        </div>
                                                                    ) : isWeekly ? (
                                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200 inline-flex items-center gap-1">
                                                                                <Repeat size={11} /> Semanal
                                                                            </span>
                                                                            <button
                                                                                type="button"
                                                                                className="text-[11px] text-purple-600 hover:text-purple-900 underline font-semibold bg-transparent border-none cursor-pointer p-0"
                                                                                onClick={() => handleSelectSeries(appt)}
                                                                                title="Marcar todas las citas semanales de esta serie"
                                                                            >
                                                                                Marcar serie
                                                                            </button>
                                                                        </div>
                                                                    ) : (
                                                                        <span className="text-xs text-gray-400">—</span>
                                                                    )}
                                                                </td>
                                                                <td>
                                                                    <span className={`badge ${
                                                                        appt.status === 'Finalizada' || appt.status === 'En Sesión' ? 'badge-warning' :
                                                                        appt.status === 'Cobrada' ? 'badge-success' :
                                                                        appt.status === 'Cancelada' ? 'badge-danger' :
                                                                        'badge-info'
                                                                    }`}>
                                                                        {appt.status}
                                                                    </span>
                                                                </td>
                                                                <td style={{ textAlign: 'right' }}>
                                                                    <button
                                                                        type="button"
                                                                        className="btn-icon-round text-gray-400 hover:text-red-600 hover:bg-red-50 p-1.5 transition-colors cursor-pointer"
                                                                        onClick={() => handleDeleteSingleClick(appt)}
                                                                        title="Eliminar esta cita"
                                                                    >
                                                                        <Trash2 size={15} />
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
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
                                                                        onClick={() => setActiveTab('appointments')}
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
