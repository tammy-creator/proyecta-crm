import React, { useEffect, useState } from 'react';
import { getTherapists, createTherapist, updateTherapist } from './service';
import { type Therapist, type DaySchedule, SPECIALTIES, DAYS_OF_WEEK } from './types';
import { getIllustrativeAvatar } from './utils';
import Card from '../../components/ui/Card';
import { Mail, Phone, Calendar as CalendarIcon, Edit2, Plus, X, Trash2, Clock } from 'lucide-react';
import './TherapistList.css';

import { useAuth } from '../../context/AuthContext';
import CalendarView from '../calendar/CalendarView';

const AVATAR_OPTIONS = [
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Avery&mouth=smile&eyes=default&eyebrows=default&backgroundColor=transparent',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Borden&mouth=smile&eyes=happy&eyebrows=default&backgroundColor=transparent',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Caleb&mouth=smile&eyes=default&eyebrows=default&backgroundColor=transparent',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Dalia&mouth=smile&eyes=happy&eyebrows=default&backgroundColor=transparent',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Eden&mouth=smile&eyes=default&eyebrows=default&backgroundColor=transparent',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Flossie&mouth=smile&eyes=happy&eyebrows=default&backgroundColor=transparent',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=George&mouth=smile&eyes=default&eyebrows=default&backgroundColor=transparent',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Hadley&mouth=smile&eyes=happy&eyebrows=default&backgroundColor=transparent',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Ira&mouth=smile&eyes=default&eyebrows=default&backgroundColor=transparent',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Jocelyn&mouth=smile&eyes=happy&eyebrows=default&backgroundColor=transparent',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Kaya&mouth=smile&eyes=default&eyebrows=default&backgroundColor=transparent',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Lyle&mouth=smile&eyes=happy&eyebrows=default&backgroundColor=transparent'
];

const DEFAULT_AVATAR = AVATAR_OPTIONS[0];

const TherapistList: React.FC = () => {
    const { isRole } = useAuth();
    const [therapists, setTherapists] = useState<Therapist[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isAgendaOpen, setIsAgendaOpen] = useState(false);
    const [selectedTherapist, setSelectedTherapist] = useState<Partial<Therapist> | null>(null);
    const [activeScheduleDay, setActiveScheduleDay] = useState(0); // 0 = Lunes

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
            schedule: []
        });
        setActiveScheduleDay(0);
        setIsModalOpen(true);
    };

    const handleOpenAgenda = (therapist: Therapist) => {
        setSelectedTherapist(therapist);
        setIsAgendaOpen(true);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedTherapist) return;
        if (selectedTherapist.id) {
            await updateTherapist(selectedTherapist as Therapist);
        } else {
            await createTherapist(selectedTherapist as Omit<Therapist, 'id'>);
        }
        setIsModalOpen(false);
        fetchData();
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
                {isRole('ADMIN') && (
                    <button className="calendar-btn-pill calendar-btn-primary" onClick={() => handleOpenModal()}>
                        <Plus size={18} />
                        <span>Nuevo Terapeuta</span>
                    </button>
                )}
            </div>

            <div className="therapist-grid">
                {therapists.map((therapist) => (
                    <Card key={therapist.id} className="therapist-card">
                        <div className="therapist-header" style={{ borderTop: `4px solid ${therapist.color}` }}>
                            <div className="therapist-avatar" style={{ backgroundColor: therapist.color + '20' }}>
                                <img src={getIllustrativeAvatar(therapist)} alt={therapist.fullName} className="avatar-img" />
                            </div>
                            <div className="therapist-info">
                                <h3 className="therapist-name">{therapist.fullName}</h3>
                                <span className="therapist-specialty">{therapist.specialty}</span>
                                {therapist.licenseNumber && <span className="therapist-license">Col. {therapist.licenseNumber}</span>}
                            </div>
                            {isRole('ADMIN') && (
                                <button className="btn-icon" title="Editar" onClick={() => handleOpenModal(therapist)}>
                                    <Edit2 size={16} />
                                </button>
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
                ))}
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
                                        required
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
                                    <label>Seleccionar Avatar</label>
                                    <div className="avatar-selector-grid">
                                        {AVATAR_OPTIONS.map((url) => (
                                            <div
                                                key={url}
                                                className={`avatar-option ${selectedTherapist.avatarUrl === url ? 'selected' : ''}`}
                                                onClick={() => setSelectedTherapist({ ...selectedTherapist, avatarUrl: url })}
                                            >
                                                <img src={url} alt="Avatar" />
                                            </div>
                                        ))}
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
                                <button type="button" className="btn-secondary" onClick={() => setIsModalOpen(false)}>Cancelar</button>
                                <button type="submit" className="btn-primary">Guardar Terapeuta</button>
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
            {/* Espaciador final para asegurar margen inferior visual */}
            <div style={{ height: '250px', width: '100%', flexShrink: 0 }} aria-hidden="true" />
        </div>
    );
};

export default TherapistList;
