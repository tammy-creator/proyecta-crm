import React, { useEffect, useState } from 'react';
import { getPatients, getPatientById, createPatient, updatePatient, uploadPatientFile, deletePatientFile } from './service';
import { supabase } from '../../lib/supabase';
import { getAppointmentsByPatient } from '../calendar/service';
import { type Patient, type PatientFile } from './types';
import { type Appointment } from '../calendar/types';
import { getUsers } from '../admin/service';
import { type UserAccount } from '../admin/types';
import Card from '../../components/ui/Card';
import { User, Phone, Mail, Search, UserPlus, X, Calendar, ClipboardList, FileText, Upload, Activity, Download, Send, ShieldCheck, ShieldAlert, Star, Trash2 } from 'lucide-react';
import { useToast } from '../../hooks/useToast';
import PrintPortal from '../../components/ui/PrintPortal';
import ConsentDocument from './ConsentDocument';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import './PatientList.css';

const PatientList: React.FC = () => {
    const { showToast } = useToast();
    const [patients, setPatients] = useState<Patient[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedPatient, setSelectedPatient] = useState<Partial<Patient> | null>(null);
    const [activeTab, setActiveTab] = useState<'general' | 'appointments' | 'files'>('general');
    const [patientAppointments, setPatientAppointments] = useState<Appointment[]>([]);
    const [isConsentModalOpen, setIsConsentModalOpen] = useState(false);
    const [isConsentViewMode, setIsConsentViewMode] = useState(false);
    const [isSigned, setIsSigned] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; file: PatientFile | null }>({ isOpen: false, file: null });
    const [therapists, setTherapists] = useState<UserAccount[]>([]);

    // Canvas signature state
    const [drawing, setDrawing] = useState(false);
    const [ctx, setCtx] = useState<CanvasRenderingContext2D | null>(null);

    const fetchData = () => {
        setLoading(true);
        getPatients().then((data) => {
            setPatients(data);
            setLoading(false);
        });
    };

    useEffect(() => {
        fetchData();
        getUsers().then(users => {
            const onlyTherapists = users.filter(u => u.role === 'Therapist' && u.status === 'Active');
            setTherapists(onlyTherapists);
        });
    }, []);

    useEffect(() => {
        if (isModalOpen && selectedPatient?.id && activeTab === 'appointments') {
            getAppointmentsByPatient(selectedPatient.id).then(setPatientAppointments);
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

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedPatient) return;

        try {
            let updatedPatient: Patient;
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

            setIsModalOpen(false);
            // Re-vincular para asegurar que todo esté en sync (opcional pero recomendado)
            fetchData();
        } catch (error) {
            console.error("Error saving patient:", error);
            showToast("No se pudo guardar la ficha. Por favor, revisa la conexión.", "error");
        }
    };

    const handleSimulateUpload = async () => {
        if (!selectedPatient?.id) return;
        const fileName = prompt('Nombre del archivo:', 'Informe_Evolucion.pdf');
        if (!fileName) return;

        try {
            await uploadPatientFile(selectedPatient.id, {
                name: fileName,
                type: 'application/pdf',
                size: '1.2 MB'
            });

            // Refresh total y el seleccionado
            const data = await getPatients();
            setPatients(data);
            const updated = data.find(p => p.id === selectedPatient.id);
            if (updated) setSelectedPatient(updated);
        } catch (error) {
            console.error("Error subiendo archivo:", error);
        }
    };

    const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        const canvas = e.currentTarget;
        canvas.setAttribute('data-signed', 'true');
        const context = canvas.getContext('2d');
        if (context) {
            context.beginPath();
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            
            const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
            const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

            context.moveTo(
                (clientX - rect.left) * scaleX, 
                (clientY - rect.top) * scaleY
            );
            setCtx(context);
            setDrawing(true);
        }
        if ('touches' in e) e.preventDefault(); // Prevent scrolling while signing
    };

    const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        if (!drawing || !ctx) return;
        const canvas = e.currentTarget;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

        ctx.lineTo(
            (clientX - rect.left) * scaleX, 
            (clientY - rect.top) * scaleY
        );
        ctx.strokeStyle = '#2c3e50';
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
        setIsSigned(true);
        if ('touches' in e) e.preventDefault();
    };

    const stopDrawing = () => {
        setDrawing(false);
    };

    const clearSignature = () => {
        const canvases = document.querySelectorAll('.signature-pad-canvas');
        canvases.forEach(c => {
            const canvas = c as HTMLCanvasElement;
            canvas.removeAttribute('data-signed');
            const context = canvas.getContext('2d');
            context?.clearRect(0, 0, canvas.width, canvas.height);
        });
        setIsSigned(false);
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

            const updatedPatientData = { 
                ...selectedPatient as Patient, 
                schooling: extraFields.school_stage || extraFields.school_name || (selectedPatient as Patient).schooling,
                allergies: extraFields.allergies_detail || (selectedPatient as Patient).allergies,
                referralSource: extraFields.referral_detail || (selectedPatient as Patient).referralSource
            };

            await updatePatient(updatedPatientData);
            showToast("Borrador guardado correctamente. Los cambios en los textos se han actualizado.", "success");
            
            // Refresh local data
            const data = await getPatients();
            setPatients(data);
            const updated = data.find(p => p.id === selectedPatient.id);
            if (updated) setSelectedPatient(updated);
        } catch (error) {
            console.error("Error guardando borrador:", error);
            showToast("Error al guardar el borrador.", "error");
        } finally {
            setIsSending(false);
        }
    };
    const generateAndSendPDF = async (updatedPatient: Patient, tutorSig: string | undefined, therapistSig: string | undefined, _extraFields: any) => {
        const modalBody = document.querySelector('.consent-form-modal .modal-body');
        const container = document.querySelector('.consent-document');
        if (!modalBody || !container) return;

        // Añadir clase temporal para optimizar la captura
        container.classList.add('capturing');
        
        showToast("Generando documento de alta calidad (8 páginas). Espere por favor...", "info");

        const pages = modalBody.querySelectorAll('.doc-page');
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();

        try {
            for (let i = 0; i < pages.length; i++) {
                const canvas = await html2canvas(pages[i] as HTMLElement, {
                    scale: 3, // Mayor resolución
                    useCORS: true,
                    logging: false,
                    backgroundColor: '#ffffff',
                    windowWidth: 794, // 210mm a 96dpi (aprox)
                    onclone: (clonedDoc) => {
                        // Asegurar que las fuentes y estilos se mantengan en el clon
                        const clonedPage = clonedDoc.querySelectorAll('.doc-page')[i] as HTMLElement;
                        if (clonedPage) {
                            clonedPage.style.margin = '0';
                            clonedPage.style.boxShadow = 'none';
                        }
                    }
                });
                
                const imgData = canvas.toDataURL('image/jpeg', 0.95);
                if (i > 0) pdf.addPage();
                pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
            }

            const pdfBase64 = pdf.output('datauristring');
            const recipientEmail = updatedPatient.tutor1?.email || updatedPatient.email;

            // Pruned patient for email body (no need for large base64 strings twice)
            const prunedPatient = {
                firstName: updatedPatient.firstName,
                lastName: updatedPatient.lastName,
                id: updatedPatient.id
            };

            const { data, error: invokeError } = await supabase.functions.invoke('send-consent-email', {
                body: {
                    email: recipientEmail,
                    patient: prunedPatient,
                    pdfBase64: pdfBase64,
                    message: `Se adjunta la documentación clínica completa de ${updatedPatient.firstName} ${updatedPatient.lastName} integrada en el sistema.`
                }
            });

            return { data, invokeError, recipientEmail };
        } finally {
            container.classList.remove('capturing');
        }
    };

    const handleSaveAndSendConsent = async (options: { isSilentResend?: boolean } = {}) => {
        if (!selectedPatient?.id) return;
        setIsSending(true);

        try {
            // Capturar todos los campos editables manuales del DOM
            const extraFields: Record<string, string> = {};
            document.querySelectorAll('[data-field-id]').forEach(el => {
                const fieldId = el.getAttribute('data-field-id');
                if (fieldId) {
                    extraFields[fieldId] = (el as HTMLElement).innerText || '';
                }
            });

            // Capturar firmas por rol
            const tutorCanvas = document.querySelector('.signature-pad-canvas[data-role="tutor"]') as HTMLCanvasElement;
            const isTutorSigned = tutorCanvas?.getAttribute('data-signed') === 'true';
            const tutorSignature = isTutorSigned ? tutorCanvas?.toDataURL('image/png') : (selectedPatient as Patient).consentSignature;

            const therapistCanvas = document.querySelector('.signature-pad-canvas[data-role="therapist"]') as HTMLCanvasElement;
            const isTherapistSigned = therapistCanvas?.getAttribute('data-signed') === 'true';
            const therapistSignature = isTherapistSigned ? therapistCanvas?.toDataURL('image/png') : (selectedPatient as Patient).therapistSignature;

            // Guardar y enviar si al menos hay una firma o ya existían
            if (tutorSignature || therapistSignature) {
                const now = new Date().toISOString();
                
                // Actualizar el objeto paciente con los cambios manuales y firmas
                const updatedPatientData = { 
                    ...selectedPatient as Patient, 
                    consentSignature: tutorSignature,
                    therapistSignature: therapistSignature,
                    consentLopd: true,
                    consentDate: (isTutorSigned || isTherapistSigned) ? now : (selectedPatient as Patient).consentDate || now,
                    // Mapear campos manuales a la ficha del paciente si existen
                    schooling: extraFields.school_stage || extraFields.school_name || (selectedPatient as Patient).schooling,
                    allergies: extraFields.allergies_detail || (selectedPatient as Patient).allergies,
                    referralSource: extraFields.referral_detail || (selectedPatient as Patient).referralSource
                };

                await updatePatient(updatedPatientData);

                // Generar PDF de Alta Fidelidad y enviar
                const result = await generateAndSendPDF(updatedPatientData, tutorSignature, therapistSignature, extraFields);
                
                if (result?.invokeError) {
                    console.error("Error invoking Edge Function:", result.invokeError);
                    showToast(`Error de conexión: ${result.invokeError.message}`, "error");
                } else if (result?.data && result.data.success === false) {
                    console.error("SMTP or Logic Error:", result.data.error);
                    showToast(`Error al enviar: ${result.data.error}`, "error");
                } else if (result?.data && result.data.success) {
                    showToast(`¡DOCUMENTO ENVIADO CON ÉXITO!`, "success");
                }

                // Simular subida de archivo para el historial solo si NO es un re-envío silencioso
                if (!options.isSilentResend) {
                    await uploadPatientFile((selectedPatient as Patient).id, {
                        name: 'Ficha_Inscripcion_Firmada.pdf',
                        type: 'application/pdf',
                        size: '1.4 MB'
                    });
                }
            } else {
                showToast("No se ha detectado ninguna firma en el panel.", "error");
            }
        } catch (error) {
            console.error("Error persistiendo firma o enviando email:", error);
            showToast("Error crítico al procesar el documento.", "error");
        } finally {
            setIsSending(false);
            setIsConsentModalOpen(false);
            setIsConsentViewMode(false);
            setIsSigned(false);

            // Refresh local data
            try {
                const data = await getPatients();
                setPatients(data);
                const updated = data.find(p => p.id === selectedPatient.id);
                if (updated) setSelectedPatient(updated);
            } catch (error) {
                console.error("Error refreshing after consent:", error);
            }
        }
    };

    const handleDeleteFile = async (file: PatientFile) => {
        if (!selectedPatient?.id) return;
        setDeleteConfirm({ isOpen: true, file });
    };

    const confirmDelete = async () => {
        if (!deleteConfirm.file || !selectedPatient?.id) return;
        const file = deleteConfirm.file;
        
        try {
            await deletePatientFile(file.id);
            showToast(`"${file.name}" eliminado correctamente`, "success");
            
            // Refrescar datos
            const data = await getPatients();
            setPatients(data);
            const updated = data.find(p => p.id === selectedPatient.id);
            if (updated) setSelectedPatient(updated);
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

    const handleViewFile = (file: PatientFile) => {
        if (file.name === 'Ficha_Inscripcion_Firmada.pdf') {
            setIsConsentViewMode(true);
            setIsConsentModalOpen(true);
            setIsSigned(true);
        } else {
            showToast(`Visualizando archivo: ${file.name}`, "info");
        }
    };

    const printConsentDocument = (patient?: Partial<Patient>) => {
        window.print();
        return;
        // Dead code below, preserved to avoid massive deletion heuristics
        const signatureUrl = patient?.consentSignature || '';
        const tutor1 = patient?.tutor1;
        const tutor2 = patient?.tutor2;
        const consentDate = patient?.consentDate
            ? new Date(patient.consentDate).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
            : new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });

        const fullName = `${patient?.firstName || ''} ${patient?.lastName || ''}`.trim();

        const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Ficha de Inscripci\u00f3n \u2014 ${fullName}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif;
      color: #1e293b;
      font-size: 13px;
      line-height: 1.65;
      background: #f1f5f9;
    }
    /* Print toolbar */
    .toolbar {
      position: sticky;
      top: 0;
      z-index: 100;
      background: #1e3a5f;
      color: white;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.75rem 2rem;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    }
    .toolbar-title { font-size: 0.9rem; font-weight: 600; opacity: 0.9; }
    .toolbar-patient { font-size: 0.85rem; opacity: 0.6; margin-left: 0.5rem; }
    .btn-print {
      background: #3b82f6;
      color: white;
      border: none;
      border-radius: 8px;
      padding: 0.5rem 1.25rem;
      font-size: 0.9rem;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      transition: background 0.2s;
    }
    .btn-print:hover { background: #2563eb; }
    /* Page */
    .page {
      max-width: 800px;
      margin: 2rem auto;
      background: white;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 24px rgba(0,0,0,0.1);
    }
    /* Document Header */
    .doc-header {
      background: linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%);
      color: white;
      padding: 2.5rem 2.5rem 1.5rem;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .clinic-brand { display: flex; flex-direction: column; gap: 0.25rem; }
    .clinic-name { font-size: 1.3rem; font-weight: 800; letter-spacing: -0.02em; }
    .clinic-sub { font-size: 0.8rem; opacity: 0.7; font-weight: 500; }
    .doc-title-block { text-align: right; }
    .doc-title { font-size: 1.5rem; font-weight: 800; letter-spacing: -0.03em; }
    .doc-number { font-size: 0.75rem; opacity: 0.6; margin-top: 0.25rem; }
    /* Accent bar */
    .accent-bar { height: 4px; background: linear-gradient(90deg, #3b82f6, #06b6d4); }
    /* Body */
    .doc-body { padding: 2rem 2.5rem; }
    /* Section */
    .section { margin-bottom: 1.75rem; }
    .section-header {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      margin-bottom: 1rem;
      padding-bottom: 0.4rem;
      border-bottom: 2px solid #e2e8f0;
    }
    .section-dot {
      width: 10px; height: 10px;
      border-radius: 50%;
      background: #3b82f6;
      flex-shrink: 0;
    }
    .section-title {
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #334155;
    }
    /* Data grid */
    .data-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem 2.5rem; }
    .data-item { display: flex; flex-direction: column; }
    .data-label { font-size: 0.7rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: #94a3b8; margin-bottom: 0.1rem; }
    .data-value { font-size: 0.9rem; font-weight: 500; color: #1e293b; }
    .data-item.full { grid-column: span 2; }
    /* Tutor card */
    .tutor-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 1rem 1.25rem;
      margin-bottom: 0.75rem;
    }
    .tutor-badge {
      display: inline-block;
      background: #dbeafe;
      color: #1d4ed8;
      font-size: 0.65rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      padding: 0.15rem 0.5rem;
      border-radius: 20px;
      margin-bottom: 0.75rem;
    }
    /* RGPD */
    .rgpd-box {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-left: 3px solid #3b82f6;
      border-radius: 8px;
      padding: 1.25rem;
    }
    .rgpd-title {
      font-size: 0.7rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #334155;
      margin-bottom: 0.75rem;
    }
    .rgpd-text {
      font-size: 0.72rem;
      color: #64748b;
      line-height: 1.6;
      margin-bottom: 0.5rem;
    }
    .rgpd-footer {
      font-size: 0.7rem;
      font-weight: 600;
      color: #475569;
      text-align: center;
      margin-top: 0.75rem;
      padding-top: 0.75rem;
      border-top: 1px solid #e2e8f0;
    }
    /* Signature */
    .sig-section {
      margin-top: 1.75rem;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1.5rem;
      align-items: start;
    }
    .sig-box {
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 1rem;
      background: #f8fafc;
    }
    .sig-box-label { font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #94a3b8; margin-bottom: 0.75rem; }
    .sig-img-container {
      height: 110px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: white;
      border: 1px dashed #cbd5e1;
      border-radius: 6px;
      margin-bottom: 0.75rem;
    }
    .sig-img-container img { max-height: 100px; max-width: 100%; object-fit: contain; }
    .sig-no-sig { color: #cbd5e1; font-size: 0.8rem; }
    .sig-date-label { font-size: 0.7rem; color: #94a3b8; font-weight: 500; }
    .sig-date-value { font-size: 0.85rem; font-weight: 600; color: #334155; }
    .sig-legal { font-size: 0.72rem; color: #64748b; line-height: 1.6; padding-top: 0.5rem; }
    /* Footer */
    .doc-footer {
      background: #f8fafc;
      border-top: 1px solid #e2e8f0;
      padding: 1rem 2.5rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .footer-left { font-size: 0.7rem; color: #94a3b8; }
    .footer-right { font-size: 0.7rem; color: #94a3b8; text-align: right; }
    /* Print overrides */
    @media print {
      body { background: white !important; }
      .toolbar { display: none !important; }
      .page { margin: 0 !important; border-radius: 0 !important; box-shadow: none !important; }
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    }
  </style>
</head>
<body>
  <!-- Toolbar (screen only) -->
  <div class="toolbar">
    <div style="display:flex;align-items:center; gap:0.5rem">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      <span class="toolbar-title">Ficha de Inscripci\u00f3n</span>
      <span class="toolbar-patient">\u2014 ${fullName}</span>
    </div>
    <button class="btn-print" onclick="window.print()">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
      Imprimir / Guardar PDF
    </button>
  </div>

  <!-- Document -->
  <div class="page">
    <!-- Header -->
    <div class="doc-header">
      <div class="clinic-brand">
        <div class="clinic-name">Centro Infantil Proyecta</div>
        <div class="clinic-sub">C/ Alonso Ojeda, 14, Bajo Izq. \u2014 33208 Gij\u00f3n, Asturias</div>
        <div class="clinic-sub">CIF: B01758515 \u2022 Tel: 647 257 447</div>
      </div>
      <div class="doc-title-block">
        <div class="doc-title">FICHA DE INSCRIPCI\u00d3N</div>
        <div class="doc-number">Generado el ${new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })}</div>
      </div>
    </div>
    <div class="accent-bar"></div>

    <div class="doc-body">
      <!-- Datos del alumno -->
      <div class="section">
        <div class="section-header">
          <div class="section-dot"></div>
          <span class="section-title">Datos del Alumno/A</span>
        </div>
        <div class="data-grid">
          <div class="data-item">
            <span class="data-label">Nombre</span>
            <span class="data-value">${patient.firstName || '---'}</span>
          </div>
          <div class="data-item">
            <span class="data-label">Apellidos</span>
            <span class="data-value">${patient.lastName || '---'}</span>
          </div>
          <div class="data-item">
            <span class="data-label">Fecha de Nacimiento</span>
            <span class="data-value">${patient.birthDate || '---'}</span>
          </div>
          <div class="data-item">
            <span class="data-label">Etapa de Escolarizaci\u00f3n</span>
            <span class="data-value">${patient.schooling || '---'}</span>
          </div>
          <div class="data-item full">
            <span class="data-label">Direcci\u00f3n</span>
            <span class="data-value">${patient.address || '---'}</span>
          </div>
        </div>
      </div>

      <!-- Datos familiares -->
      <div class="section">
        <div class="section-header">
          <div class="section-dot"></div>
          <span class="section-title">Datos Familiares</span>
        </div>
        ${tutor1 ? `
        <div class="tutor-card">
          <span class="tutor-badge">Tutor 1 / Representante Legal</span>
          <div class="data-grid">
            <div class="data-item">
              <span class="data-label">Nombre completo</span>
              <span class="data-value">${tutor1.firstName || ''} ${tutor1.lastName || ''}</span>
            </div>
            <div class="data-item">
              <span class="data-label">DNI / NIE</span>
              <span class="data-value">${tutor1.dni || '---'}</span>
            </div>
            <div class="data-item">
              <span class="data-label">Profesi\u00f3n</span>
              <span class="data-value">${tutor1.job || '---'}</span>
            </div>
            <div class="data-item">
              <span class="data-label">Tel\u00e9fono</span>
              <span class="data-value">${tutor1.phone || '---'}</span>
            </div>
          </div>
        </div>` : ''}
        ${tutor2?.firstName ? `
        <div class="tutor-card">
          <span class="tutor-badge">Tutor 2</span>
          <div class="data-grid">
            <div class="data-item">
              <span class="data-label">Nombre completo</span>
              <span class="data-value">${tutor2.firstName} ${tutor2.lastName || ''}</span>
            </div>
            <div class="data-item">
              <span class="data-label">DNI / NIE</span>
              <span class="data-value">${tutor2.dni || '---'}</span>
            </div>
            <div class="data-item">
              <span class="data-label">Profesi\u00f3n</span>
              <span class="data-value">${tutor2.job || '---'}</span>
            </div>
            <div class="data-item">
              <span class="data-label">Tel\u00e9fono</span>
              <span class="data-value">${tutor2.phone || '---'}</span>
            </div>
          </div>
        </div>` : ''}
      </div>

      <!-- Datos de interés -->
      <div class="section">
        <div class="section-header">
          <div class="section-dot"></div>
          <span class="section-title">Datos de Inter\u00e9s</span>
        </div>
        <div class="data-grid">
          <div class="data-item">
            <span class="data-label">Alergias o intolerancias</span>
            <span class="data-value">${patient.allergies || 'No consta'}</span>
          </div>
          <div class="data-item">
            <span class="data-label">\u00bfC\u00f3mo nos conociste?</span>
            <span class="data-value">${patient.referralSource || '---'}</span>
          </div>
        </div>
      </div>

      <!-- RGPD -->
      <div class="section">
        <div class="rgpd-box">
          <div class="rgpd-title">Cl\u00e1usulas de Protecci\u00f3n de Datos (RGPD)</div>
          <p class="rgpd-text">En cumplimiento de lo establecido en el Reglamento General de Protecci\u00f3n de Datos (RGPD) (UE) 2016/679 y a la Ley Org\u00e1nica 3/2018, de 5 de diciembre, de Protecci\u00f3n de Datos de Car\u00e1cter Personal y Garant\u00eda de los Derechos Digitales, le informamos de que los datos facilitados por usted, as\u00ed como los que se generen durante su relaci\u00f3n con nuestra entidad, ser\u00e1n objeto de tratamiento con la finalidad de prestarle el servicio solicitado, realizar la gesti\u00f3n administrativa derivada de nuestra relaci\u00f3n contractual, as\u00ed como enviarle comunicaciones comerciales sobre nuestros servicios.</p>
          <p class="rgpd-text">La legitimaci\u00f3n del tratamiento ser\u00e1 en base al v\u00ednculo contractual existente, consentimiento, o bien por inter\u00e9s leg\u00edtimo u obligaci\u00f3n legal. Los datos se conservar\u00e1n mientras se mantenga la relaci\u00f3n contractual o durante el tiempo necesario para cumplir con las obligaciones legales. No se ceder\u00e1n sus datos a terceros, salvo obligaci\u00f3n legal o necesidad para el servicio.</p>
          <p class="rgpd-text">El interesado puede ejercer sus derechos de acceso, rectificaci\u00f3n, supresi\u00f3n, limitaci\u00f3n, oposici\u00f3n, portabilidad y retirada del consentimiento enviando un email a: <strong>dpdcentroproyecta@gmail.com</strong>, adjuntando copia de su DNI.</p>
          <div class="rgpd-footer">Centro Infantil Proyecta, S.L. \u2022 CIF: B01758515 \u2022 C/ Alonso Ojeda, 14, Bajo Izq. \u2014 33208 Gij\u00f3n, Asturias \u2022 647 257 447</div>
        </div>
      </div>

      <!-- Firma -->
      <div class="sig-section">
        <div class="sig-box">
          <div class="sig-box-label">Firma del Tutor Legal</div>
          <div class="sig-img-container">
            ${signatureUrl
              ? `<img src="${signatureUrl}" alt="Firma electr\u00f3nica" />`
              : `<span class="sig-no-sig">Sin firma registrada</span>`}
          </div>
          <div class="sig-date-label">Fecha de firma</div>
          <div class="sig-date-value">${consentDate}</div>
        </div>
        <div class="sig-box">
          <div class="sig-box-label">Declaraci\u00f3n de consentimiento</div>
          <p class="sig-legal">
            D./D\u00aa <strong>${tutor1 ? `${tutor1.firstName || ''} ${tutor1.lastName || ''}` : '_______________'}</strong>, con DNI/NIE
            <strong>${tutor1?.dni || '_______________'}</strong>, en calidad de tutor/a legal
            de <strong>${fullName}</strong>, declara haber le\u00eddo y aceptado la presente ficha de
            inscripci\u00f3n y las cl\u00e1usulas de protecci\u00f3n de datos (RGPD),
            autoriza el uso de los datos facilitados para la prestaci\u00f3n de los
            servicios del Centro Infantil Proyecta, S.L.
          </p>
        </div>
      </div>
    </div><!-- /doc-body -->

    <!-- Footer -->
    <div class="doc-footer">
      <div class="footer-left">Documento generado electr\u00f3nicamente \u2022 Centro Infantil Proyecta, S.L.</div>
      <div class="footer-right">P\u00e1gina 1 de 1</div>
    </div>
  </div><!-- /page -->
</body>
</html>`;

        const printWindow = window.open('', '_blank', 'width=920,height=780');
        if (!printWindow) {
            showToast('El navegador bloque\u00f3 la ventana emergente. Permite las ventanas emergentes para este sitio.', 'error');
            return;
        }
        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.focus();
    };


    const filteredPatients = patients.filter(p =>
        `${p.firstName} ${p.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.tutorName?.toLowerCase().includes(searchTerm.toLowerCase())
    );

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
                    <Card key={patient.id} className="patient-card">
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
                    <div className="modal-content" style={{ maxWidth: '750px' }}>
                        <div className="modal-header">
                            <div className="flex items-center gap-3">
                                <div className="patient-avatar small" style={{ backgroundColor: 'var(--color-status-info-bg)' }}>
                                    {selectedPatient.firstName?.charAt(0) || '?'}
                                </div>
                                <h3>{selectedPatient.id ? `${selectedPatient.firstName} ${selectedPatient.lastName}` : 'Nuevo Paciente'}</h3>
                            </div>
                            <button className="btn-icon-round" title="Cerrar" onClick={() => setIsModalOpen(false)}><X size={20} /></button>
                        </div>

                        <div className="modal-tabs flex gap-4 mb-6 border-bottom">
                            <button className={`tab-btn ${activeTab === 'general' ? 'active' : ''}`} onClick={() => setActiveTab('general')}>Datos Generales</button>
                            {selectedPatient.id && (
                                <>
                                    <button className={`tab-btn ${activeTab === 'appointments' ? 'active' : ''}`} onClick={() => setActiveTab('appointments')}>Citas</button>
                                    <button className={`tab-btn ${activeTab === 'files' ? 'active' : ''}`} onClick={() => setActiveTab('files')}>Archivos</button>
                                </>
                            )}
                        </div>

                        <div className="tab-content">
                            {activeTab === 'general' && (
                                <form className="modal-form" onSubmit={handleSave} style={{ gap: '2rem' }}>
                                    <section className="form-section">
                                        <h4 className="section-title-small">1. DATOS DEL ALUMNO/A</h4>
                                        <div className="flex gap-4">
                                            <div className="form-group" style={{ flex: 2 }}>
                                                <label>Nombre</label>
                                                <input type="text" required value={selectedPatient.firstName} onChange={e => setSelectedPatient({ ...selectedPatient, firstName: e.target.value })} />
                                            </div>
                                            <div className="form-group" style={{ flex: 3 }}>
                                                <label>Apellidos</label>
                                                <input type="text" required value={selectedPatient.lastName} onChange={e => setSelectedPatient({ ...selectedPatient, lastName: e.target.value })} />
                                            </div>
                                        </div>

                                        <div className="flex gap-4">
                                            <div className="form-group" style={{ flex: 1 }}>
                                                <label><Calendar size={14} style={{ marginRight: 6 }} /> F. Nacimiento</label>
                                                <input type="date" required value={selectedPatient.birthDate} onChange={e => setSelectedPatient({ ...selectedPatient, birthDate: e.target.value })} />
                                            </div>
                                            <div className="form-group" style={{ flex: 1 }}>
                                                <label>Etapa Escolarización</label>
                                                <input type="text" value={selectedPatient.schooling} placeholder="Ej. 3º Primaria" onChange={e => setSelectedPatient({ ...selectedPatient, schooling: e.target.value })} />
                                            </div>
                                            <div className="form-group" style={{ flex: 1 }}>
                                                <label>Estado</label>
                                                <select value={selectedPatient.status} onChange={e => setSelectedPatient({ ...selectedPatient, status: e.target.value as any })}>
                                                    <option value="Activo">Activo</option>
                                                    <option value="En Pausa">En Pausa</option>
                                                    <option value="Alta">Alta</option>
                                                    <option value="Lista de espera">Lista de espera</option>
                                                </select>
                                            </div>
                                        </div>

                                        <div className="form-group">
                                            <label>Dirección Completa</label>
                                            <input type="text" value={selectedPatient.address} placeholder="Calle, Número, Piso, CP, Ciudad" onChange={e => setSelectedPatient({ ...selectedPatient, address: e.target.value })} />
                                        </div>
                                    </section>

                                    <section className="form-section">
                                        <h4 className="section-title-small">2. DATOS DEL TUTOR 1 (Principal)</h4>
                                        <div className="flex gap-4">
                                            <div className="form-group" style={{ flex: 1 }}>
                                                <label>Nombre</label>
                                                <input type="text" value={selectedPatient.tutor1?.firstName} onChange={e => setSelectedPatient({ ...selectedPatient, tutor1: { ...selectedPatient.tutor1!, firstName: e.target.value } })} />
                                            </div>
                                            <div className="form-group" style={{ flex: 1 }}>
                                                <label>Apellidos</label>
                                                <input type="text" value={selectedPatient.tutor1?.lastName} onChange={e => setSelectedPatient({ ...selectedPatient, tutor1: { ...selectedPatient.tutor1!, lastName: e.target.value } })} />
                                            </div>
                                            <div className="form-group" style={{ flex: 1 }}>
                                                <label>DNI/NIE</label>
                                                <input type="text" value={selectedPatient.tutor1?.dni} onChange={e => setSelectedPatient({ ...selectedPatient, tutor1: { ...selectedPatient.tutor1!, dni: e.target.value } })} />
                                            </div>
                                        </div>
                                        <div className="flex gap-4">
                                            <div className="form-group" style={{ flex: 1 }}>
                                                <label>Profesión</label>
                                                <input type="text" value={selectedPatient.tutor1?.job} onChange={e => setSelectedPatient({ ...selectedPatient, tutor1: { ...selectedPatient.tutor1!, job: e.target.value } })} />
                                            </div>
                                            <div className="form-group" style={{ flex: 1 }}>
                                                <label>Teléfono</label>
                                                <input type="tel" value={selectedPatient.tutor1?.phone} onChange={e => setSelectedPatient({ ...selectedPatient, tutor1: { ...selectedPatient.tutor1!, phone: e.target.value }, phone: e.target.value })} />
                                            </div>
                                            <div className="form-group" style={{ flex: 1 }}>
                                                <label>Email</label>
                                                <input type="email" value={selectedPatient.tutor1?.email} onChange={e => setSelectedPatient({ ...selectedPatient, tutor1: { ...selectedPatient.tutor1!, email: e.target.value }, email: e.target.value })} />
                                            </div>
                                        </div>
                                    </section>

                                    <section className="form-section">
                                        <h4 className="section-title-small">3. DATOS DEL TUTOR 2 (Opcional)</h4>
                                        <div className="flex gap-4">
                                            <div className="form-group" style={{ flex: 1 }}>
                                                <label>Nombre</label>
                                                <input type="text" value={selectedPatient.tutor2?.firstName} onChange={e => setSelectedPatient({ ...selectedPatient, tutor2: { ...selectedPatient.tutor2!, firstName: e.target.value } })} />
                                            </div>
                                            <div className="form-group" style={{ flex: 1 }}>
                                                <label>Apellidos</label>
                                                <input type="text" value={selectedPatient.tutor2?.lastName} onChange={e => setSelectedPatient({ ...selectedPatient, tutor2: { ...selectedPatient.tutor2!, lastName: e.target.value } })} />
                                            </div>
                                            <div className="form-group" style={{ flex: 1 }}>
                                                <label>DNI/NIE</label>
                                                <input type="text" value={selectedPatient.tutor2?.dni} onChange={e => setSelectedPatient({ ...selectedPatient, tutor2: { ...selectedPatient.tutor2!, dni: e.target.value } })} />
                                            </div>
                                        </div>
                                    </section>

                                    <section className="form-section">
                                        <h4 className="section-title-small">4. DATOS DE INTERÉS Y ORIGEN</h4>
                                        <div className="form-group">
                                            <label>¿Alergias o intolerancia alimenticia?</label>
                                            <input type="text" value={selectedPatient.allergies} placeholder="Describir o indicar 'No'" onChange={e => setSelectedPatient({ ...selectedPatient, allergies: e.target.value })} />
                                        </div>
                                        <div className="form-group">
                                            <label>¿Cómo nos conociste? (Origen/Referente)</label>
                                            <select value={selectedPatient.referralSource} onChange={e => setSelectedPatient({ ...selectedPatient, referralSource: e.target.value })}>
                                                <option value="">Seleccionar opción...</option>
                                                <option value="Instagram">Instagram / Redes Sociales</option>
                                                <option value="Google">Google / Web</option>
                                                <option value="Recomendación">Recomendación Personal</option>
                                                <option value="Colegio">Colegio / Orientador</option>
                                                <option value="Pediatra">Pediatra / Centro Salud</option>
                                                <option value="Seguro">Compañía de Seguros</option>
                                                <option value="Otro">Otro</option>
                                            </select>
                                        </div>
                                        <div className="form-group">
                                            <label>Terapeuta Asignado (Opcional)</label>
                                            <select 
                                                value={selectedPatient.therapistId || ''} 
                                                onChange={e => setSelectedPatient({ ...selectedPatient, therapistId: e.target.value })}
                                            >
                                                <option value="">Sin asignar / Rotatorio</option>
                                                {therapists.map(t => (
                                                    <option key={t.id} value={t.id}>{t.fullName}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="form-group">
                                            <label><ClipboardList size={14} style={{ marginRight: 6 }} /> Notas Médicas / Observaciones</label>
                                            <textarea rows={3} value={selectedPatient.notes} onChange={e => setSelectedPatient({ ...selectedPatient, notes: e.target.value })} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #ddd', fontFamily: 'inherit' }} />
                                        </div>

                                        <div className="consent-verification-check" style={{ 
                                            padding: '1rem', 
                                            borderRadius: '8px', 
                                            backgroundColor: selectedPatient.consentLopd ? 'rgba(5, 150, 105, 0.05)' : 'rgba(220, 38, 38, 0.05)',
                                            border: `1px solid ${selectedPatient.consentLopd ? '#05966933' : '#dc262633'}`,
                                            marginTop: '1.5rem'
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
                                    </section>

                                    <div className="modal-footer">
                                        {selectedPatient.id && (
                                            <button
                                                type="button"
                                                className="btn-link text-warning"
                                                style={{ marginRight: 'auto', fontSize: '0.85rem' }}
                                                onClick={() => handleMoveToWaitingList(selectedPatient as Patient)}
                                            >
                                                Mover a Lista de Espera
                                            </button>
                                        )}
                                        <button type="button" className="btn-secondary" onClick={() => setIsModalOpen(false)}>Cancelar</button>
                                        <button type="submit" className="btn-primary">Guardar Ficha Completa</button>
                                    </div>
                                </form>
                            )}

                            {activeTab === 'appointments' && (
                                <div className="appointments-tab">
                                    <div className="section-title flex justify-between items-center mb-4">
                                        <h4>Historial de Citas</h4>
                                    </div>
                                    {patientAppointments.length === 0 ? (
                                        <div className="empty-state">No hay citas registradas para este paciente.</div>
                                    ) : (
                                        <div className="table-container shadow-none border">
                                            <table className="data-table">
                                                <thead>
                                                    <tr>
                                                        <th>Fecha</th>
                                                        <th>Terapeuta</th>
                                                        <th>Tipo</th>
                                                        <th>Estado</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {patientAppointments.map(appt => (
                                                        <tr key={appt.id}>
                                                            <td>{new Date(appt.start).toLocaleDateString('es-ES')}</td>
                                                            <td className="flex items-center gap-2"><div className="avatar micro">{appt.therapistName.charAt(0)}</div>{appt.therapistName}</td>
                                                            <td>{appt.type}</td>
                                                            <td>
                                                                <span className={`badge ${appt.status === 'Finalizada' || appt.status === 'En Sesión' ? 'badge-warning' :
                                                                    appt.status === 'Cobrada' ? 'badge-success' :
                                                                        appt.status === 'Cancelada' ? 'badge-danger' :
                                                                            'badge-info'
                                                                    }`}>
                                                                    {appt.status}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            )}

                            {activeTab === 'files' && (
                                <div className="files-tab">
                                    <div className="section-title flex justify-between items-center mb-4">
                                        <h4>Documentos y Archivos</h4>
                                        <div className="flex gap-2">
                                            <button
                                                className="btn-link flex items-center gap-2"
                                                onClick={() => {
                                                    if (selectedPatient.consentSignature) {
                                                        setIsConsentViewMode(true);
                                                        setIsSigned(true);
                                                    } else {
                                                        setIsConsentViewMode(false);
                                                        setIsSigned(false);
                                                    }
                                                    setIsConsentModalOpen(true);
                                                }}
                                                style={{ color: 'var(--color-status-info)', textDecoration: 'none' }}
                                            >
                                                <FileText size={16} />
                                                {selectedPatient.consentSignature ? 'Ver Ficha Consentimiento' : 'Generar Ficha Consentimiento'}
                                            </button>
                                            <button className="btn-secondary flex items-center gap-2" onClick={handleSimulateUpload}>
                                                <Upload size={16} /> Subir Archivo
                                            </button>
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
                                {isConsentViewMode ? 'Visor de Documento Clínico' : 'Editor de Historia Clínica'}
                            </h3>
                            <button className="btn-icon-round" title="Cerrar" onClick={() => { setIsConsentModalOpen(false); setIsConsentViewMode(false); }}><X size={20} /></button>
                        </div>
 
                        {/* Body - Scrollable */}
                        <div className="modal-body" style={{ 
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
                                    therapistSignatureUrl={selectedPatient.therapistSignature}
                                    isSigned={isSigned}
                                    startDrawing={startDrawing}
                                    draw={draw}
                                    stopDrawing={stopDrawing}
                                    clearSignature={clearSignature}
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
                                <Activity size={16} /> {isSending ? 'Guardando...' : (isConsentViewMode ? 'Actualizar Ficha' : 'Guardar Borrador')}
                            </button>
                            
                            <button
                                type="button"
                                className="btn-primary flex items-center gap-2"
                                disabled={(isConsentViewMode ? false : !isSigned) || isSending}
                                onClick={() => handleSaveAndSendConsent()}
                                style={{ backgroundColor: '#3b82f6', color: 'white' }}
                            >
                                <Mail size={16} /> {isSending ? 'Enviando...' : (isConsentViewMode ? 'Firmar y Enviar de nuevo' : 'Firmar y Enviar')}
                            </button>

                            {isConsentViewMode && (
                                <>
                                    <button
                                        type="button"
                                        className="btn-primary flex items-center gap-2"
                                        onClick={() => printConsentDocument()}
                                    >
                                        <Download size={16} /> Descargar PDF
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
                                isSigned={isSigned}
                            />
                        </PrintPortal>
                    </div>
                </div>
            )}
            {/* Modal de Confirmación de Eliminación Custom */}
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

            {/* Espaciador final para asegurar margen inferior visual */}
            <div style={{ height: '250px', width: '100%', flexShrink: 0 }} aria-hidden="true" />
        </div>
    );
};

export default PatientList;
