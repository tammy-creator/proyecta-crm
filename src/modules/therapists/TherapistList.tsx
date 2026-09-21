import React, { useEffect, useState, useRef } from 'react';
import { getTherapists, createTherapist, updateTherapist, uploadTherapistAvatar, deleteTherapist, setTherapistActiveStatus, countTherapistAppointments } from './service';
import { type Therapist, type DaySchedule, SPECIALTIES, DAYS_OF_WEEK } from './types';
import { getIllustrativeAvatar } from './utils';
import Card from '../../components/ui/Card';
import { Mail, Phone, Calendar as CalendarIcon, Edit2, Plus, X, Trash2, Clock, Upload, AlertTriangle } from 'lucide-react';
import './TherapistList.css';

import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../hooks/useToast';
import CalendarView from '../calendar/CalendarView';

const DEFAULT_AVATAR = '';

const TherapistList: React.FC = () => {
    const { isRole } = useAuth();
    const { showToast } = useToast();
    const [therapists, setTherapists] = useState<Therapist[]>([]);
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isAgendaOpen, setIsAgendaOpen] = useState(false);
    const [selectedTherapist, setSelectedTherapist] = useState<Partial<Therapist> | null>(null);
    const [activeScheduleDay, setActiveScheduleDay] = useState(0); // 0 = Lunes
    const [avatarFile, setAvatarFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Estado para filtro y modal de eliminación / desactivación
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
    const [deleteTarget, setDeleteTarget] = useState<Therapist | null>(null);
    const [deleteAppointmentCount, setDeleteAppointmentCount] = useState<number | null>(null);
    const [isCheckingDelete, setIsCheckingDelete] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const fetchData = () => {
        setLoading(true);
        getTherapists().then((data) => {
            setTherapists(data);
            setLoading(false);
        });
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleOpenDeleteModal = async (therapist: Therapist) => {
        if (!isRole('ADMIN')) return;
        setDeleteTarget(therapist);
        setIsCheckingDelete(true);
        setDeleteAppointmentCount(null);
        try {
            const count = await countTherapistAppointments(therapist.id);
            setDeleteAppointmentCount(count);
        } catch (e) {
            console.error("Error checking appointments count:", e);
            setDeleteAppointmentCount(0);
        } finally {
            setIsCheckingDelete(false);
        }
    };

    const handleConfirmDelete = async () => {
        if (!deleteTarget) return;
        setIsDeleting(true);
        try {
            await deleteTherapist(deleteTarget.id);
            showToast(`Terapeuta ${deleteTarget.fullName} eliminada correctamente`, 'success');
            setDeleteTarget(null);
            fetchData();
        } catch (err: any) {
            console.error("Error deleting therapist:", err);
            showToast(err.message || 'Error al eliminar terapeuta', 'error');
        } finally {
            setIsDeleting(false);
        }
    };

    const handleToggleActive = async (therapist: Therapist, newStatus: boolean) => {
        try {
            await setTherapistActiveStatus(therapist, newStatus);
            showToast(`${therapist.fullName} marcada como ${newStatus ? 'activa' : 'inactiva'}`, 'success');
            setDeleteTarget(null);
            fetchData();
        } catch (err: any) {
            console.error("Error toggling therapist active status:", err);
            showToast(err.message || 'Error al actualizar estado', 'error');
        }
    };

    const handleOpenModal = (therapist?: Therapist) => {
        if (!isRole('ADMIN')) return;
        setSelectedTherapist(therapist || {
            fullName: '',
            specialty: SPECIALTIES[0],
            licenseNumber: '',
            dni: '',
            email: '',
            phone: '',
            color: '#BCE4EA',
            avatarUrl: DEFAULT_AVATAR,
            schedule: [],
            isActive: true
        });
        setActiveScheduleDay(0);
        setAvatarFile(null);
        setPreviewUrl(null);
        setIsModalOpen(true);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setAvatarFile(file);
            const url = URL.createObjectURL(file);
            setPreviewUrl(url);
            // Clear predefined selection if we're uploading a new one
            setSelectedTherapist(prev => prev ? { ...prev, avatarUrl: '' } : null);
        }
    };

    const handleOpenAgenda = (therapist: Therapist) => {
        setSelectedTherapist(therapist);
        setIsAgendaOpen(true);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedTherapist) return;
        
        setIsSaving(true);
        try {
            let avatarUrl = selectedTherapist.avatarUrl;

            // If we have a file, upload it first
            if (avatarFile) {
                // We need a temp ID for new therapists if we want to use it in path, 
                // but service.ts uses Date.now() so it's fine.
                const tempId = selectedTherapist.id || 'new_therapist';
                avatarUrl = await uploadTherapistAvatar(tempId, avatarFile);
            }

            const therapistToSave = { ...selectedTherapist, avatarUrl } as Therapist;

            if (selectedTherapist.id) {
                await updateTherapist(therapistToSave);
                showToast('Terapeuta actualizado correctamente', 'success');
            } else {
                await createTherapist(therapistToSave as Omit<Therapist, 'id'>);
                showToast('Terapeuta creado correctamente', 'success');
            }
            setIsModalOpen(false);
            fetchData();
        } catch (error: any) {
            console.error("Error saving therapist:", error);
            showToast(error.message || 'Error al guardar terapeuta', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const getSchedule = (): DaySchedule[] => {
        const sched = selectedTherapist?.schedule || [];
        return DAYS_OF_WEEK.map((dayName, idx) => {
            // Try to find matching day by name or fallback to index
            const existing = sched.find(s => s.day === dayName) || (sched[idx] && (!sched[idx].day || sched[idx].day === dayName) ? sched[idx] : null);
            if (existing) {
                return { ...existing, day: dayName, blocks: existing.blocks || [] };
            }
            return { day: dayName, enabled: false, blocks: [] };
        });
    };

    const handleToggleDay = (dayIndex: number) => {
        const sched = getSchedule();
        const updated = sched.map((d, i) =>
            i === dayIndex ? { ...d, enabled: !d.enabled, blocks: !d.enabled && d.blocks.length === 0 ? [{ start: '09:00', end: '14:00' }] : d.blocks } : d
        );
        setSelectedTherapist({ ...selectedTherapist, schedule: updated });
    };

    const handleAddBlock = (dayIndex: number) => {
        const sched = getSchedule();
        const updated = sched.map((d, i) =>
            i === dayIndex ? { ...d, blocks: [...d.blocks, { start: '16:00', end: '20:00' }] } : d
        );
        setSelectedTherapist({ ...selectedTherapist, schedule: updated });
    };

    const handleRemoveBlock = (dayIndex: number, blockIndex: number) => {
        const sched = getSchedule();
        const updated = sched.map((d, i) =>
            i === dayIndex ? { ...d, blocks: d.blocks.filter((_, bi) => bi !== blockIndex) } : d
        );
        setSelectedTherapist({ ...selectedTherapist, schedule: updated });
    };

    const handleUpdateBlock = (dayIndex: number, blockIndex: number, field: 'start' | 'end', value: string) => {
        const sched = getSchedule();
        const updated = sched.map((d, i) =>
            i === dayIndex ? {
                ...d, blocks: d.blocks.map((b, bi) =>
                    bi === blockIndex ? { ...b, [field]: value } : b
                )
            } : d
        );
        setSelectedTherapist({ ...selectedTherapist, schedule: updated });
    };

    if (loading && therapists.length === 0) {
        return <div className="loading">Cargando equipo...</div>;
    }

    return (
        <div className="therapist-list-container">
            <div className="page-header">
                <div>
                    <h2 className="page-title">Equipo Terapéutico</h2>
                    <p className="page-subtitle">Gestión de profesionales y horarios</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                    <div className="therapist-filter-tabs">
                        <button
                            type="button"
                            className={`therapist-filter-btn ${statusFilter === 'all' ? 'active' : ''}`}
                            onClick={() => setStatusFilter('all')}
                        >
                            Todas ({therapists.length})
                        </button>
                        <button
                            type="button"
                            className={`therapist-filter-btn ${statusFilter === 'active' ? 'active' : ''}`}
                            onClick={() => setStatusFilter('active')}
                        >
                            Activas ({therapists.filter(t => t.isActive !== false).length})
                        </button>
                        <button
                            type="button"
                            className={`therapist-filter-btn ${statusFilter === 'inactive' ? 'active' : ''}`}
                            onClick={() => setStatusFilter('inactive')}
                        >
                            Inactivas ({therapists.filter(t => t.isActive === false).length})
                        </button>
                    </div>

                    {isRole('ADMIN') && (
                        <button className="calendar-btn-pill calendar-btn-primary" onClick={() => handleOpenModal()}>
                            <Plus size={18} />
                            <span>Nuevo Terapeuta</span>
                        </button>
                    )}
                </div>
            </div>

            <div className="therapist-grid">
                {therapists
                    .filter((therapist) => {
                        if (statusFilter === 'active') return therapist.isActive !== false;
                        if (statusFilter === 'inactive') return therapist.isActive === false;
                        return true;
                    })
                    .map((therapist) => {
                        const isInactive = therapist.isActive === false;
                        return (
                            <Card key={therapist.id} className={`therapist-card ${isInactive ? 'therapist-card-inactive' : ''}`}>
                                <div className="therapist-header" style={{ borderTop: `4px solid ${isInactive ? '#94a3b8' : therapist.color}` }}>
                                    <div className="therapist-avatar" style={{ backgroundColor: (isInactive ? '#94a3b8' : therapist.color) + '20' }}>
                                        <img 
                                            src={getIllustrativeAvatar(therapist)} 
                                            alt={therapist.fullName} 
                                            className="avatar-img" 
                                            style={isInactive ? { filter: 'grayscale(100%)', opacity: 0.6 } : {}}
                                        />
                                    </div>
                                    <div className="therapist-info">
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                            <h3 className="therapist-name">{therapist.fullName}</h3>
                                            <span className={`therapist-status-pill ${isInactive ? 'status-pill-inactive' : 'status-pill-active'}`}>
                                                {isInactive ? 'Inactiva' : 'Activa'}
                                            </span>
                                        </div>
                                        <span className="therapist-specialty">{therapist.specialty}</span>
                                        {therapist.licenseNumber && <span className="therapist-license">Col. {therapist.licenseNumber}</span>}
                                    </div>
                                    {isRole('ADMIN') && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <button className="btn-icon" title="Editar" onClick={() => handleOpenModal(therapist)}>
                                                <Edit2 size={16} />
                                            </button>
                                            <button 
                                                className="btn-icon btn-icon-danger-hover" 
                                                title="Eliminar o Desactivar" 
                                                onClick={() => handleOpenDeleteModal(therapist)}
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    )}
                                </div>

                                <div className="therapist-contact">
                                    <div className="contact-item">
                                        <Mail size={14} />
                                        <span>{therapist.email}</span>
                                    </div>
                                    <div className="contact-item">
                                        <Phone size={14} />
                                        <span>{therapist.phone}</span>
                                    </div>
                                </div>

                                <div className="therapist-footer">
                                    <button className="calendar-btn-pill calendar-btn-secondary full-width" onClick={() => handleOpenAgenda(therapist)}>
                                        <CalendarIcon size={16} />
                                        <span>Ver Agenda</span>
                                    </button>
                                </div>
                            </Card>
                        );
                    })}
            </div>

            {/* Modal Editar/Nuevo */}
            {isModalOpen && selectedTherapist && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <div className="modal-header">
                            <h3>{selectedTherapist.id ? 'Editar Terapeuta' : 'Nuevo Terapeuta'}</h3>
                            <button className="btn-icon-round" onClick={() => setIsModalOpen(false)}><X size={20} /></button>
                        </div>
                        <form className="modal-form" onSubmit={handleSave}>
                            <div className="form-grid">
                                <div className="form-group" style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', gap: '0.75rem', background: selectedTherapist.isActive !== false ? '#ecfdf5' : '#f8fafc', padding: '0.75rem 1rem', borderRadius: '10px', border: `1px solid ${selectedTherapist.isActive !== false ? '#a7f3d0' : '#e2e8f0'}` }}>
                                    <input
                                        type="checkbox"
                                        id="therapist-is-active"
                                        checked={selectedTherapist.isActive !== false}
                                        onChange={e => setSelectedTherapist({ ...selectedTherapist, isActive: e.target.checked })}
                                        style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#10b981' }}
                                    />
                                    <label htmlFor="therapist-is-active" style={{ cursor: 'pointer', margin: 0, fontWeight: 600, fontSize: '0.9rem', color: selectedTherapist.isActive !== false ? '#065f46' : '#64748b' }}>
                                        {selectedTherapist.isActive !== false ? '● Terapeuta Activa (visible en el calendario)' : '○ Terapeuta Inactiva (oculta en el calendario)'}
                                    </label>
                                </div>
                                <div className="form-group">
                                    <label>Nombre Completo</label>
                                    <input
                                        type="text"
                                        required
                                        value={selectedTherapist.fullName}
                                        onChange={e => setSelectedTherapist({ ...selectedTherapist, fullName: e.target.value })}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Especialidad</label>
                                    <select
                                        value={selectedTherapist.specialty}
                                        onChange={e => setSelectedTherapist({ ...selectedTherapist, specialty: e.target.value })}
                                        style={{ padding: '0.75rem', borderRadius: '8px', border: '1px solid #ddd' }}
                                    >
                                        {SPECIALTIES.map(s => (
                                            <option key={s} value={s}>{s}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="form-group">
                                    <label>Email</label>
                                    <input
                                        type="email"
                                        required
                                        value={selectedTherapist.email}
                                        onChange={e => setSelectedTherapist({ ...selectedTherapist, email: e.target.value })}
                                    />
                                </div>

                                <div className="form-group">
                                    <label>Teléfono</label>
                                    <input
                                        type="tel"
                                        required
                                        value={selectedTherapist.phone}
                                        onChange={e => setSelectedTherapist({ ...selectedTherapist, phone: e.target.value })}
                                    />
                                </div>

                                <div className="form-group">
                                    <label>DNI</label>
                                    <input
                                        type="text"
                                        value={selectedTherapist.dni}
                                        onChange={e => setSelectedTherapist({ ...selectedTherapist, dni: e.target.value })}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Nº Colegiado</label>
                                    <input
                                        type="text"
                                        value={selectedTherapist.licenseNumber}
                                        onChange={e => setSelectedTherapist({ ...selectedTherapist, licenseNumber: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="form-grid" style={{ gridTemplateColumns: '1fr 1.5fr', alignItems: 'start' }}>
                                <div className="form-group">
                                    <label>Desfase de Inicio (Min)</label>
                                    <select
                                        value={selectedTherapist.sessionStartOffset || 0}
                                        onChange={e => setSelectedTherapist({ ...selectedTherapist, sessionStartOffset: parseInt(e.target.value) })}
                                        style={{ padding: '0.75rem', borderRadius: '8px', border: '1px solid #ddd' }}
                                    >
                                        <option value={0}>En punto (:00)</option>
                                        <option value={5}>y cinco (:05)</option>
                                        <option value={10}>y diez (:10)</option>
                                        <option value={15}>y cuarto (:15)</option>
                                        <option value={45}>menos cuarto (:45 / -15)</option>
                                        <option value={50}>menos diez (:50 / -10)</option>
                                        <option value={55}>menos cinco (:55 / -05)</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Avatar del Profesional</label>
                                    <div className="avatar-upload-section">
                                        <div className="avatar-current-preview" onClick={() => fileInputRef.current?.click()}>
                                            <img 
                                                src={previewUrl || selectedTherapist.avatarUrl || getIllustrativeAvatar(selectedTherapist)} 
                                                alt="Preview" 
                                            />
                                            <button 
                                                type="button" 
                                                className="btn-upload-overlay"
                                                title="Cambiar imagen"
                                            >
                                                <Upload size={18} />
                                            </button>
                                        </div>
                                        
                                        <div className="avatar-options-container">
                                            <input 
                                                type="file" 
                                                ref={fileInputRef} 
                                                style={{ display: 'none' }} 
                                                accept="image/*"
                                                onChange={handleFileChange}
                                            />
                                            <p className="text-xs text-secondary mt-2 opacity-70 italic">Haz click en la imagen para cambiarla</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="form-group">
                                <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <Clock size={14} /> Horario Semanal de Trabajo
                                </label>
                                <div className="schedule-editor-tabs">
                                    <div className="schedule-tabs-header">
                                        {DAYS_OF_WEEK.map((day, idx) => {
                                            const daySched = getSchedule()[idx];
                                            return (
                                                <button
                                                    key={day}
                                                    type="button"
                                                    className={`tab-day-btn ${activeScheduleDay === idx ? 'active' : ''} ${daySched?.enabled ? 'enabled' : ''}`}
                                                    onClick={() => setActiveScheduleDay(idx)}
                                                >
                                                    {day.charAt(0)}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    <div className="schedule-tab-content">
                                        {DAYS_OF_WEEK.map((_, dayIndex) => {
                                            const day = getSchedule()[dayIndex];
                                            if (!day || dayIndex !== activeScheduleDay) return null;
                                            
                                            return (
                                                <div key={day.day || dayIndex} className={`schedule-day-detail ${day.enabled ? 'enabled' : ''}`}>
                                                    <div className="schedule-day-toggle">
                                                        <span className="font-bold text-sm">{day.day || DAYS_OF_WEEK[dayIndex]}</span>
                                                        <button
                                                            type="button"
                                                            className={`day-toggle-switch ${day.enabled ? 'active' : ''}`}
                                                            onClick={() => handleToggleDay(dayIndex)}
                                                        >
                                                            {day.enabled ? 'Activo' : 'Inactivo'}
                                                        </button>
                                                        {day.enabled && (
                                                            <button
                                                                type="button"
                                                                className="btn-link text-xs ml-auto"
                                                                onClick={() => handleAddBlock(dayIndex)}
                                                            >
                                                                <Plus size={12} /> Añadir Bloque
                                                            </button>
                                                        )}
                                                    </div>
                                                    {day.enabled && (
                                                        <div className="schedule-blocks-compact">
                                                            {day.blocks.map((block, blockIndex) => (
                                                                <div key={blockIndex} className="schedule-block-compact">
                                                                    <div className="flex items-center gap-2">
                                                                        <input
                                                                            type="time"
                                                                            value={block.start}
                                                                            onChange={e => handleUpdateBlock(dayIndex, blockIndex, 'start', e.target.value)}
                                                                            className="time-input-compact"
                                                                        />
                                                                        <span className="text-xs text-gray-400">a</span>
                                                                        <input
                                                                            type="time"
                                                                            value={block.end}
                                                                            onChange={e => handleUpdateBlock(dayIndex, blockIndex, 'end', e.target.value)}
                                                                            className="time-input-compact"
                                                                        />
                                                                        <button
                                                                            type="button"
                                                                            className="btn-icon-xs"
                                                                            onClick={() => handleRemoveBlock(dayIndex, blockIndex)}
                                                                        >
                                                                            <Trash2 size={12} />
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                            {day.blocks.length === 0 && (
                                                                <p className="text-xs text-secondary italic py-2">Sin bloques asignados.</p>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>

                            <div className="modal-footer">
                                <button type="button" className="btn-secondary" onClick={() => setIsModalOpen(false)} disabled={isSaving}>Cancelar</button>
                                <button type="submit" className="btn-primary" disabled={isSaving}>
                                    {isSaving ? 'Guardando...' : 'Guardar Terapeuta'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Popup Agenda Individual */}
            {isAgendaOpen && selectedTherapist && (
                <div className="modal-overlay">
                    <div className="modal-content" style={{ maxWidth: '1200px', width: '95%', height: '90vh', display: 'flex', flexDirection: 'column', padding: '0', overflow: 'hidden' }}>
                        <div className="modal-header" style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #eee', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fcfcfc' }}>
                            <div className="flex items-center gap-3 cursor-pointer group" onClick={() => { setIsAgendaOpen(false); handleOpenModal(selectedTherapist as Therapist); }} title="Click para editar ficha/horario">
                                <div style={{
                                    width: '44px',
                                    height: '44px',
                                    borderRadius: '50%',
                                    overflow: 'hidden',
                                    backgroundColor: 'white',
                                    boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
                                    border: '2px solid #3b82f6',
                                    flexShrink: 0
                                }}>
                                    <img 
                                        src={getIllustrativeAvatar(selectedTherapist as Therapist)} 
                                        alt="Avatar" 
                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    />
                                </div>
                                <div className="flex flex-col">
                                    <span style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>Agenda Semanal</span>
                                    <h3 style={{ margin: 0, color: '#1e293b', fontSize: '1.2rem', fontWeight: 800 }} className="group-hover:text-primary transition-colors hover:underline">
                                        {(selectedTherapist as Therapist).fullName}
                                    </h3>
                                </div>
                            </div>
                            <button 
                                className="btn-icon-round" 
                                onClick={() => setIsAgendaOpen(false)}
                                title="Cerrar"
                            >
                                <X size={20} />
                            </button>
                        </div>
                        <div className="flex-1 overflow-hidden" style={{ display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0, padding: '0 2rem 2rem 2rem' }}>
                            <CalendarView 
                                mode="WEEKLY_SINGLE" 
                                therapistId={selectedTherapist.id} 
                                onEditTherapist={(therapist) => {
                                    setIsAgendaOpen(false);
                                    handleOpenModal(therapist);
                                }}
                            />
                        </div>
                    </div>
                </div>
            )}
            {/* Modal de Eliminación / Desactivación */}
            {deleteTarget && (
                <div className="modal-overlay">
                    <div className="modal-content" style={{ maxWidth: '480px', padding: '1.75rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
                            <div style={{
                                width: '42px',
                                height: '42px',
                                borderRadius: '50%',
                                backgroundColor: isCheckingDelete ? '#f1f5f9' : deleteAppointmentCount === 0 ? '#fee2e2' : '#fef3c7',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: isCheckingDelete ? '#64748b' : deleteAppointmentCount === 0 ? '#ef4444' : '#d97706',
                                flexShrink: 0
                            }}>
                                {isCheckingDelete ? <Clock size={20} /> : deleteAppointmentCount === 0 ? <Trash2 size={20} /> : <AlertTriangle size={20} />}
                            </div>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#1e293b', fontWeight: 700 }}>
                                    {isCheckingDelete 
                                        ? 'Verificando citas...' 
                                        : deleteAppointmentCount === 0 
                                            ? 'Eliminar Terapeuta' 
                                            : 'Historial de citas detectado'}
                                </h3>
                                <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
                                    {deleteTarget.fullName}
                                </p>
                            </div>
                        </div>

                        {isCheckingDelete ? (
                            <div style={{ padding: '2rem 0', textAlign: 'center', color: '#64748b' }}>
                                <p>Comprobando historial de citas en la base de datos...</p>
                            </div>
                        ) : deleteAppointmentCount === 0 ? (
                            <div>
                                <p style={{ fontSize: '0.92rem', color: '#475569', lineHeight: '1.5', margin: '0 0 1.25rem 0' }}>
                                    Esta terapeuta <strong>no tiene citas registradas</strong> en el sistema. Puedes eliminar su ficha definitivamente o marcarla como inactiva si deseas conservarla.
                                </p>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', marginTop: '1.25rem' }}>
                                    <button 
                                        type="button" 
                                        className="btn-danger full-width" 
                                        onClick={handleConfirmDelete} 
                                        disabled={isDeleting}
                                    >
                                        <Trash2 size={16} />
                                        {isDeleting ? 'Eliminando...' : 'Eliminar Definitivamente'}
                                    </button>
                                    <button 
                                        type="button" 
                                        className="calendar-btn-pill calendar-btn-secondary full-width"
                                        onClick={() => handleToggleActive(deleteTarget, false)}
                                    >
                                        Marcar como Inactiva
                                    </button>
                                    <button 
                                        type="button" 
                                        style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', padding: '0.5rem', fontSize: '0.85rem' }}
                                        onClick={() => setDeleteTarget(null)}
                                        disabled={isDeleting}
                                    >
                                        Cancelar
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div>
                                <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '0.85rem', marginBottom: '1rem' }}>
                                    <p style={{ margin: 0, fontSize: '0.88rem', color: '#92400e', lineHeight: '1.4' }}>
                                        <strong>{deleteTarget.fullName}</strong> tiene <strong>{deleteAppointmentCount} cita(s)</strong> en su historial. Por integridad de los registros clínicos, no se puede eliminar de la base de datos.
                                    </p>
                                </div>
                                <p style={{ fontSize: '0.88rem', color: '#475569', lineHeight: '1.5', margin: '0 0 1.25rem 0' }}>
                                    {deleteTarget.isActive === false
                                        ? 'Actualmente ya está inactiva y oculta del calendario. ¿Deseas volver a activarla?'
                                        : 'Para que no aparezca en el calendario y no se le asignen nuevas citas, márcala como Inactiva.'}
                                </p>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                                    {deleteTarget.isActive === false ? (
                                        <button 
                                            type="button" 
                                            className="calendar-btn-pill calendar-btn-primary full-width"
                                            onClick={() => handleToggleActive(deleteTarget, true)}
                                        >
                                            Reactivar Terapeuta
                                        </button>
                                    ) : (
                                        <button 
                                            type="button" 
                                            className="btn-danger full-width"
                                            onClick={() => handleToggleActive(deleteTarget, false)}
                                        >
                                            Marcar como Inactiva (Ocultar del calendario)
                                        </button>
                                    )}
                                    <button 
                                        type="button" 
                                        style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', padding: '0.5rem', fontSize: '0.85rem' }}
                                        onClick={() => setDeleteTarget(null)}
                                    >
                                        Cancelar
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
            {/* Espaciador final para asegurar margen inferior visual */}
            <div style={{ height: '250px', width: '100%', flexShrink: 0 }} aria-hidden="true" />
        </div>
    );
};

export default TherapistList;
