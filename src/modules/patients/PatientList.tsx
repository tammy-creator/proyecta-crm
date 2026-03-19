import React, { useEffect, useState } from 'react';
import { getPatients, getPatientById, createPatient, updatePatient, uploadPatientFile } from './service';
import { supabase } from '../../lib/supabase';
import { getAppointmentsByPatient } from '../calendar/service';
import { type Patient, type PatientFile } from './types';
import { type Appointment } from '../calendar/types';
import Card from '../../components/ui/Card';
import { User, Phone, Mail, Search, UserPlus, X, Calendar, ClipboardList, FileText, Upload, Activity, Download, Send } from 'lucide-react';
import './PatientList.css';

const PatientList: React.FC = () => {
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
    }, []);

    useEffect(() => {
        if (isModalOpen && selectedPatient?.id && activeTab === 'appointments') {
            getAppointmentsByPatient(selectedPatient.id).then(setPatientAppointments);
        }
    }, [isModalOpen, selectedPatient?.id, activeTab]);

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
            alert("No se pudo guardar la ficha. Por favor, revisa la conexión.");
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

    const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = e.currentTarget;
        const context = canvas.getContext('2d');
        if (context) {
            context.beginPath();
            const rect = canvas.getBoundingClientRect();
            context.moveTo(e.clientX - rect.left, e.clientY - rect.top);
            setCtx(context);
            setDrawing(true);
        }
    };

    const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!drawing || !ctx) return;
        const rect = e.currentTarget.getBoundingClientRect();
        ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.stroke();
        setIsSigned(true);
    };

    const stopDrawing = () => {
        setDrawing(false);
    };

    const clearSignature = () => {
        const canvas = document.getElementById('signature-pad') as HTMLCanvasElement;
        if (canvas) {
            const context = canvas.getContext('2d');
            context?.clearRect(0, 0, canvas.width, canvas.height);
            setIsSigned(false);
        }
    };

    const handleSaveAndSendConsent = async () => {
        if (!selectedPatient?.id) return;

        // Capturar firma si existe
        const canvas = document.getElementById('signature-pad') as HTMLCanvasElement;
        const signatureData = canvas?.toDataURL('image/png');

        // Guardar firma en el paciente (Persistir en BD)
        if (signatureData) {
            try {
                await updatePatient({ ...selectedPatient as Patient, consentSignature: signatureData });

                // Enviar Email vía Edge Function
                const recipientEmail = (selectedPatient as Patient).tutor1?.email || (selectedPatient as Patient).email;
                if (recipientEmail) {
                    const { data, error: invokeError } = await supabase.functions.invoke('send-consent-email', {
                        body: {
                            email: recipientEmail,
                            patient: selectedPatient,
                            message: `Se adjunta la ficha de inscripción y consentimiento de ${(selectedPatient as Patient).firstName} ${(selectedPatient as Patient).lastName} plenamente firmada.`,
                            signatureData: signatureData
                        }
                    });

                    if (invokeError) {
                        console.error("Error invoking Edge Function:", invokeError);
                        alert(`El documento se guardó pero hubo un problema al invocar el servicio de email: ${invokeError.message || 'Error de conexión'}`);
                    } else if (data && data.success === false) {
                        console.error("SMTP Error:", data.error);
                        alert(`Error del servidor de correo: ${data.error}`);
                    } else if (data && data.success) {
                        console.log("Email sent successfully:", data.messageId);
                        alert(`Ficha firmada y email enviado correctamente a: ${recipientEmail}. ID: ${data.messageId}`);
                    }
                }

                // Simular subida de archivo para el historial si no existe
                const hasConsentFile = (selectedPatient as Patient).files?.some(f => f.name === 'Ficha_Inscripcion_Firmada.pdf');
                if (!hasConsentFile) {
                    await uploadPatientFile((selectedPatient as Patient).id, {
                        name: 'Ficha_Inscripcion_Firmada.pdf',
                        type: 'application/pdf',
                        size: '1.4 MB'
                    });
                }
                // El alert de éxito ya se muestra dentro del bloque del email si es exitoso
            } catch (error) {
                console.error("Error persistiendo firma o enviando email:", error);
                alert("Error crítico al procesar la firma o el envío del email. Revisa la consola.");
            }
        } else {
            alert("No se ha detectado ninguna firma en el panel.");
        }

        setIsConsentModalOpen(false);
        setIsConsentViewMode(false);
        setIsSigned(false);

        // Refresh local data y el seleccionado
        try {
            const data = await getPatients();
            setPatients(data);
            const updated = data.find(p => p.id === selectedPatient.id);
            if (updated) setSelectedPatient(updated);
        } catch (error) {
            console.error("Error refreshing after consent:", error);
        }
    };

    const handleResendConsentEmail = async (patient: Patient) => {
        if (!patient.consentSignature) {
            alert("No hay una firma de consentimiento guardada para este paciente.");
            return;
        }

        const recipientEmail = patient.tutor1?.email || patient.email;
        if (!recipientEmail) {
            alert("El paciente no tiene un email configurado.");
            return;
        }

        try {
            const { data, error } = await supabase.functions.invoke('send-consent-email', {
                body: {
                    email: recipientEmail,
                    patient: patient,
                    message: `Re-envío: Se adjunta la ficha de inscripción y consentimiento de ${patient.firstName} plenamente firmada.`,
                    signatureData: patient.consentSignature
                }
            });

            if (error) throw error;
            if (data && data.success === false) throw new Error(data.error);

            alert(`Email re-enviado correctamente a: ${recipientEmail}`);
        } catch (error: any) {
            console.error("Error re-enviando email:", error);
            alert(`Error al re-enviar el email: ${error.message || 'Error desconocido'}`);
        }
    };

    const handleViewFile = (file: PatientFile) => {
        if (file.name === 'Ficha_Inscripcion_Firmada.pdf') {
            setIsConsentViewMode(true);
            setIsConsentModalOpen(true);
            setIsSigned(true);
        } else {
            alert(`Visualizando archivo: ${file.name}`);
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
            <div className="page-header">
                <div>
                    <h2 className="page-title">Gestión de Pacientes</h2>
                    <p className="page-subtitle">Listado de niños y adolescentes en seguimiento</p>
                </div>
                <button className="btn-primary" onClick={() => handleOpenModal()}>
                    <UserPlus size={18} />
                    <span>Nuevo Paciente</span>
                </button>
            </div>

            <div className="search-bar-wrapper" style={{ marginTop: '1.5rem', position: 'relative' }}>
                <Search size={18} className="search-icon" style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-secondary)' }} />
                <input
                    type="text"
                    placeholder="Buscar por nombre o tutor..."
                    className="search-input"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={{
                        width: '100%',
                        padding: '0.875rem 1rem 0.875rem 2.8rem',
                        borderRadius: 'var(--radius-button)',
                        border: '1px solid rgba(0,0,0,0.05)',
                        backgroundColor: 'var(--color-bg-secondary)',
                        fontSize: '0.95rem',
                        outline: 'none'
                    }}
                />
            </div>

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
                            <div className="detail-item" style={{ marginTop: '0.25rem', color: 'var(--color-primary)', fontSize: '0.8rem' }}>
                                <Activity size={12} />
                                <span className="detail-label">Origen:</span>
                                <span style={{ fontWeight: 600 }}>{patient.referralSource || 'No indicado'}</span>
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
                            <button className="btn-icon-round" onClick={() => setIsModalOpen(false)}><X size={20} /></button>
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
                                            <label><ClipboardList size={14} style={{ marginRight: 6 }} /> Notas Médicas / Observaciones</label>
                                            <textarea rows={3} value={selectedPatient.notes} onChange={e => setSelectedPatient({ ...selectedPatient, notes: e.target.value })} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #ddd', fontFamily: 'inherit' }} />
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
                <div className="modal-overlay">
                    <div className="modal-content consent-form-modal" style={{ maxWidth: '800px', padding: '0' }}>
                        <div className="modal-header sticky-header" style={{ padding: '1.5rem', position: 'sticky', top: 0, backgroundColor: 'white', zIndex: 10, borderBottom: '1px solid #eee' }}>
                            <div className="flex items-center gap-2">
                                <FileText size={20} className="text-secondary" />
                                <h3>Ficha de Inscripción y Consentimiento</h3>
                            </div>
                            <button className="btn-icon-round" onClick={() => { setIsConsentModalOpen(false); setIsConsentViewMode(false); }}><X size={20} /></button>
                        </div>

                        <div className="consent-document" style={{ padding: '3rem', color: '#333', lineHeight: '1.6', fontSize: '0.95rem' }}>
                            <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
                                <h1 style={{ fontSize: '1.8rem', fontWeight: 800, marginBottom: '0.5rem', color: '#2c3e50' }}>FICHA DE INSCRIPCIÓN</h1>
                                <p style={{ color: '#7f8c8d', fontSize: '0.9rem' }}>Centro Infantil Proyecta, S.L.</p>
                            </div>

                            <section style={{ marginBottom: '2rem' }}>
                                <h4 style={{ borderBottom: '2px solid #3498db', paddingBottom: '0.3rem', marginBottom: '1rem', color: '#2980b9' }}>DATOS DEL ALUMNO/A</h4>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem 2rem' }}>
                                    <p><strong>Nombre:</strong> {selectedPatient.firstName}</p>
                                    <p><strong>Apellidos:</strong> {selectedPatient.lastName}</p>
                                    <p><strong>Fecha de Nacimiento:</strong> {selectedPatient.birthDate}</p>
                                    <p><strong>Etapa Escolarización:</strong> {selectedPatient.schooling || '---'}</p>
                                    <p style={{ gridColumn: 'span 2' }}><strong>Dirección:</strong> {selectedPatient.address || '---'}</p>
                                </div>
                            </section>

                            <section style={{ marginBottom: '2rem' }}>
                                <h4 style={{ borderBottom: '2px solid #3498db', paddingBottom: '0.3rem', marginBottom: '1rem', color: '#2980b9' }}>DATOS FAMILIARES</h4>
                                <div style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: '#f9f9f9', borderRadius: '8px' }}>
                                    <p style={{ fontWeight: 600, fontStyle: 'italic', marginBottom: '0.5rem' }}>Tutor 1 / Representante Legal</p>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem 2rem' }}>
                                        <p><strong>Nombre:</strong> {selectedPatient.tutor1?.firstName} {selectedPatient.tutor1?.lastName}</p>
                                        <p><strong>DNI/NIE:</strong> {selectedPatient.tutor1?.dni}</p>
                                        <p><strong>Profesión:</strong> {selectedPatient.tutor1?.job || '---'}</p>
                                        <p><strong>Teléfonos:</strong> {selectedPatient.tutor1?.phone}</p>
                                    </div>
                                </div>

                                {selectedPatient.tutor2?.firstName && (
                                    <div style={{ padding: '1rem', backgroundColor: '#f9f9f9', borderRadius: '8px' }}>
                                        <p style={{ fontWeight: 600, fontStyle: 'italic', marginBottom: '0.5rem' }}>Tutor 2</p>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem 2rem' }}>
                                            <p><strong>Nombre:</strong> {selectedPatient.tutor2?.firstName} {selectedPatient.tutor2?.lastName}</p>
                                            <p><strong>DNI/NIE:</strong> {selectedPatient.tutor2?.dni}</p>
                                            <p><strong>Profesión:</strong> {selectedPatient.tutor2?.job || '---'}</p>
                                            <p><strong>Teléfonos:</strong> {selectedPatient.tutor2?.phone}</p>
                                        </div>
                                    </div>
                                )}
                            </section>

                            <section style={{ marginBottom: '2rem' }}>
                                <h4 style={{ borderBottom: '2px solid #3498db', paddingBottom: '0.3rem', marginBottom: '1rem', color: '#2980b9' }}>DATOS DE INTERÉS</h4>
                                <p><strong>¿Alergias o intolerancias?:</strong> {selectedPatient.allergies || 'No consta'}</p>
                                <p style={{ marginTop: '0.5rem' }}><strong>¿Cómo nos conociste?:</strong> {selectedPatient.referralSource || '---'}</p>
                            </section>

                            <section style={{ marginTop: '3rem', fontSize: '0.75rem', color: '#666', border: '1px solid #eee', padding: '1.5rem', borderRadius: '8px', backgroundColor: '#FAFAFA' }}>
                                <h4 style={{ fontSize: '0.85rem', marginBottom: '1rem', color: '#333', textAlign: 'center' }}>CLÁUSULAS DE PROTECCIÓN DE DATOS (RGPD)</h4>
                                <p style={{ marginBottom: '1rem' }}>En cumplimiento de lo establecido en el Reglamento General de Protección de Datos (RGPD) (UE) 2016/679 y a la Ley Orgánica 3/2018, de 5 de diciembre, de Protección de Datos de Carácter Personal y Garantía de los Derechos Digitales, le informamos de que los datos facilitados por usted, así como los que se generen durante su relación con nuestra entidad, serán objeto de tratamiento con la finalidad de prestarle el servicio solicitado, realizar la gestión administrativa derivada de nuestra relación contractual, así como enviarle comunicaciones comerciales sobre nuestros servicios.</p>
                                <p style={{ marginBottom: '1rem' }}>La legitimación del tratamiento será en base al vínculo contractual existente, consentimiento, o bien por interés legítimo (mercadotecnia directa) u obligación legal, en algunos casos. Los datos proporcionados se conservarán mientras se mantenga la relación contractual o durante el tiempo necesario para cumplir con las obligaciones legales. No se cederán sus datos a terceros, salvo que sea necesario para la prestación de servicios o haya una obligación legal.</p>
                                <p>Asimismo, le informamos de la posibilidad de ejercer los siguientes derechos sobre sus datos personales: derecho de acceso, rectificación, supresión u olvido, limitación, oposición, portabilidad y a retirar el consentimiento prestado. Para ello podrá enviar un email a: <strong>dpdcentroproyecta@gmail.com</strong>, adjuntando copia de su DNI.</p>
                                <p style={{ marginTop: '1rem', textAlign: 'center', fontWeight: 'bold' }}>Centro Infantil Proyecta, S.L., B01758515, C/ Alonso Ojeda, 14, Bajo Izq. - 33208 - Gijón - ASTURIAS, 647 257 447</p>
                            </section>

                            <div className="signature-area" style={{ border: '1px solid #eee', borderRadius: '12px', padding: '1.5rem', backgroundColor: '#fcfcfc', marginTop: '3rem' }}>
                                <p style={{ fontSize: '0.9rem', marginBottom: '1rem', fontWeight: 600 }}>Firma del Tutor Legal (Confirmación de lectura y aceptación):</p>
                                <div style={{ position: 'relative', border: '1px dashed #ccc', height: '150px', backgroundColor: 'white', cursor: isConsentViewMode ? 'default' : 'crosshair' }} id="signature-pad-container">
                                    {isConsentViewMode && selectedPatient.consentSignature ? (
                                        <img
                                            src={selectedPatient.consentSignature}
                                            alt="Firma"
                                            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                        />
                                    ) : (
                                        <canvas
                                            id="signature-pad"
                                            width="600"
                                            height="150"
                                            style={{ width: '100%', height: '100%' }}
                                            onMouseDown={startDrawing}
                                            onMouseMove={draw}
                                            onMouseUp={stopDrawing}
                                            onMouseLeave={stopDrawing}
                                        />
                                    )}
                                    {isSigned && !isConsentViewMode && (
                                        <button className="btn-icon micro" onClick={clearSignature} style={{ position: 'absolute', top: '5px', right: '5px' }} title="Borrar firma"><X size={14} /></button>
                                    )}
                                    {!isSigned && !isConsentViewMode && (
                                        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: '#999', pointerEvents: 'none', fontSize: '0.85rem' }}>Pulse aquí para firmar</div>
                                    )}
                                </div>
                                <div style={{ marginTop: '1rem', textAlign: 'right', fontSize: '0.85rem', color: '#666' }}>
                                    Fecha: {isConsentViewMode ? 'Documento firmado electrónicamente' : new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
                                </div>
                            </div>
                        </div>

                        <div className="modal-footer" style={{ padding: '1.5rem', borderTop: '1px solid #eee' }}>
                            <button type="button" className="btn-secondary" onClick={() => { setIsConsentModalOpen(false); setIsConsentViewMode(false); }}>Cerrar</button>
                            {!isConsentViewMode && (
                                <button
                                    type="button"
                                    className="btn-primary flex items-center gap-2"
                                    disabled={!isSigned}
                                    onClick={handleSaveAndSendConsent}
                                >
                                    <Mail size={16} /> Firmar y Enviar por Email
                                </button>
                            )}
                            {isConsentViewMode && (
                                <>
                                    {selectedPatient.consentSignature && (
                                        <button
                                            type="button"
                                            className="btn-secondary flex items-center gap-2"
                                            onClick={() => handleResendConsentEmail(selectedPatient as Patient)}
                                            style={{ marginRight: 'auto' }}
                                        >
                                            <Send size={16} /> Re-enviar por Email
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        className="btn-primary flex items-center gap-2"
                                        onClick={() => window.print()}
                                    >
                                        <Download size={16} /> Descargar PDF
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PatientList;
