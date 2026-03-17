import React, { useEffect, useState } from 'react';
import { getTherapists, createTherapist, updateTherapist } from './service';
import { type Therapist, type DaySchedule, SPECIALTIES, DAYS_OF_WEEK } from './types';
import Card from '../../components/ui/Card';
import { Mail, Phone, Calendar as CalendarIcon, Edit2, Plus, X, Trash2, Clock } from 'lucide-react';
import './TherapistList.css';

import { useAuth } from '../../context/AuthContext';
import CalendarView from '../calendar/CalendarView';

const TherapistList: React.FC = () => {
    const { isRole } = useAuth();
    const [therapists, setTherapists] = useState<Therapist[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isAgendaOpen, setIsAgendaOpen] = useState(false);
    const [selectedTherapist, setSelectedTherapist] = useState<Partial<Therapist> | null>(null);

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
            schedule: []
        });
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
        if (selectedTherapist?.schedule && selectedTherapist.schedule.length > 0) return selectedTherapist.schedule;
        return DAYS_OF_WEEK.map(day => ({ day, enabled: false, blocks: [] }));
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
                    <button className="btn-primary" onClick={() => handleOpenModal()}>
                        <Plus size={18} />
                        <span>Nuevo Terapeuta</span>
                    </button>
                )}
            </div>

            <div className="therapist-grid">
                {therapists.map((therapist) => (
                    <Card key={therapist.id} className="therapist-card">
                        <div className="therapist-header" style={{ borderTop: `4px solid ${therapist.color}` }}>
                            <div className="therapist-avatar" style={{ backgroundColor: therapist.color + '40' }}>
                                <span style={{ color: '#2C3E50' }}>
                                    {therapist.fullName.charAt(0)}
                                </span>
                            </div>
                            <div className="therapist-info">
                                <h3 className="therapist-name">{therapist.fullName}</h3>
                                <span className="therapist-specialty">{therapist.specialty}</span>
                                <span className="therapist-license">Col. {therapist.licenseNumber}</span>
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
                            <button className="btn-secondary full-width" onClick={() => handleOpenAgenda(therapist)}>
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
                            <div className="flex gap-4">
                                <div className="form-group" style={{ flex: 1 }}>
                                    <label>DNI</label>
                                    <input
                                        type="text"
                                        required
                                        value={selectedTherapist.dni}
                                        onChange={e => setSelectedTherapist({ ...selectedTherapist, dni: e.target.value })}
                                    />
                                </div>
                                <div className="form-group" style={{ flex: 1 }}>
                                    <label>Nº Colegiado</label>
                                    <input
                                        type="text"
                                        required
                                        value={selectedTherapist.licenseNumber}
                                        onChange={e => setSelectedTherapist({ ...selectedTherapist, licenseNumber: e.target.value })}
                                    />
                                </div>
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
                                <label>Desfase de Inicio de Sesión (Minutos)</label>
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
                                <p className="text-[10px] text-secondary mt-1">Este desfase se aplicará automáticamente al crear citas en el calendario.</p>
                            </div>
                            {/* ── Horario Semanal ── */}
                            <div className="form-group">
                                <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <Clock size={14} /> Horario Semanal de Trabajo
                                </label>
                                <div className="schedule-editor">
                                    {getSchedule().map((day, dayIndex) => (
                                        <div key={day.day} className={`schedule-day ${day.enabled ? 'enabled' : ''}`}>
                                            <div className="schedule-day-header">
                                                <button
                                                    type="button"
                                                    className={`day-toggle-btn ${day.enabled ? 'active' : ''}`}
                                                    onClick={() => handleToggleDay(dayIndex)}
                                                >
                                                    {day.day}
                                                </button>
                                                {day.enabled && (
                                                    <button
                                                        type="button"
                                                        className="btn-link text-xs"
                                                        onClick={() => handleAddBlock(dayIndex)}
                                                        title="Añadir bloque horario"
                                                    >
                                                        <Plus size={12} /> Añadir
                                                    </button>
                                                )}
                                            </div>
                                            {day.enabled && (
                                                <div className="schedule-blocks">
                                                    {day.blocks.map((block, blockIndex) => (
                                                        <div key={blockIndex} className="schedule-block">
                                                            <span className="block-label">De</span>
                                                            <input
                                                                type="time"
                                                                value={block.start}
                                                                onChange={e => handleUpdateBlock(dayIndex, blockIndex, 'start', e.target.value)}
                                                                className="time-input"
                                                            />
                                                            <span className="block-label">a</span>
                                                            <input
                                                                type="time"
                                                                value={block.end}
                                                                onChange={e => handleUpdateBlock(dayIndex, blockIndex, 'end', e.target.value)}
                                                                className="time-input"
                                                            />
                                                            <button
                                                                type="button"
                                                                className="btn-icon-sm"
                                                                onClick={() => handleRemoveBlock(dayIndex, blockIndex)}
                                                                title="Eliminar bloque"
                                                            >
                                                                <Trash2 size={12} />
                                                            </button>
                                                        </div>
                                                    ))}
                                                    {day.blocks.length === 0 && (
                                                        <span className="text-xs text-secondary" style={{ padding: '4px 0', display: 'block' }}>Sin bloques. Añade uno.</span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="modal-footer">
                                <button type="button" className="btn-secondary" onClick={() => setIsModalOpen(false)}>Cancelar</button>
                                <button type="submit" className="btn-primary">Guardar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Popup Agenda Individual */}
            {isAgendaOpen && selectedTherapist && (
                <div className="modal-overlay">
                    <div className="modal-content" style={{ maxWidth: '950px' }}>
                        <div className="modal-header">
                            <h3>Agenda Semanal: {selectedTherapist.fullName}</h3>
                            <button className="btn-icon-round" onClick={() => setIsAgendaOpen(false)}><X size={20} /></button>
                        </div>
                        <CalendarView mode="WEEKLY_SINGLE" therapistId={selectedTherapist.id} />
                    </div>
                </div>
            )}
        </div>
    );
};

export default TherapistList;
