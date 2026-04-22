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
    const generateAndSendPDF = async (updatedPatient: Patient, _extraFields: any) => {
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
    
    const handleDownloadPDF = async () => {
        if (!selectedPatient) return;
        setIsSending(true);
        try {
            const modalBody = document.querySelector('.modal-body');
            const container = document.querySelector('.consent-document');
            if (!modalBody) {
                showToast("No se pudo encontrar el contenido del documento", "error");
                return;
            }

            showToast("Generando PDF de alta calidad. Espere por favor...", "info");
            
            const pages = modalBody.querySelectorAll('.doc-page');
            if (pages.length === 0) {
                // Fallback si no hay .doc-page (por ejemplo en el visor simple)
                window.print();
                return;
            }

            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();

            if (container) container.classList.add('capturing');

            for (let i = 0; i < pages.length; i++) {
                const canvas = await html2canvas(pages[i] as HTMLElement, {
                    scale: 2,
                    useCORS: true,
                    logging: false,
                    backgroundColor: '#ffffff'
                });
                const imgData = canvas.toDataURL('image/jpeg', 0.95);
                if (i > 0) pdf.addPage();
                pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
            }
            
            if (container) container.classList.remove('capturing');
            
            pdf.save(`Documentacion_${selectedPatient.lastName || 'Paciente'}_${selectedPatient.firstName || ''}.pdf`);
            showToast("PDF descargado correctamente", "success");
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
                const result = await generateAndSendPDF(updatedPatientData, extraFields);
                
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
        }
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
