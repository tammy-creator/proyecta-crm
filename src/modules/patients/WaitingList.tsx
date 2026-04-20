import React, { useState, useEffect } from 'react';
import { getWaitingList, removeFromWaitingList, addToWaitingList, updateWaitingList, getPatients } from './service';
import { type WaitingListEntry, type Patient } from './types';
import { Plus, Trash2, Calendar, Clock, Edit2, Search, X as XIcon, Star, Timer, ClipboardList } from 'lucide-react';
import Card from '../../components/ui/Card';
import './WaitingList.css';
import { toast } from 'react-hot-toast';

const DAYS_ABBR = ['L', 'M', 'X', 'J', 'V', 'S'];
const COMMON_HOURS = ['09:00', '10:00', '11:00', '12:00', '13:00', '16:00', '17:00', '18:00', '19:00', '20:00'];

const WaitingList: React.FC = () => {
    const [entries, setEntries] = useState<WaitingListEntry[]>([]);
    const [patients, setPatients] = useState<Patient[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingEntry, setEditingEntry] = useState<WaitingListEntry | null>(null);
    const [newEntry, setNewEntry] = useState<Partial<WaitingListEntry>>({
        patientId: '',
        patientName: '',
        specialty: '',
        urgency: 'Media',
        notes: '',
        preferredDays: [],
        preferredHours: []
    });
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        fetchEntries();
    }, []);

    const fetchEntries = async () => {
        setLoading(true);
        try {
            const [waitingData, patientsData] = await Promise.all([getWaitingList(), getPatients()]);
            setEntries(waitingData);
            setPatients(patientsData);
        } catch (error) {
            console.error("Error fetching data:", error);
            toast.error('Error al cargar la lista');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (window.confirm('¿Eliminar a este paciente de la lista de espera?')) {
            try {
                const success = await removeFromWaitingList(id);
                if (success) {
                    setEntries(entries.filter(e => e.id !== id));
                    toast.success('Eliminado de la lista');
                }
            } catch (_error) {
                toast.error('Error al eliminar');
            }
        }
    };

    const handleEdit = (entry: WaitingListEntry) => {
        setEditingEntry(entry);
        // If patientId is empty but name exists, it's likely a manual 'nuevo' entry
        const pid = entry.patientId ? entry.patientId : 'nuevo';
        setNewEntry({
            patientId: pid,
            patientName: entry.patientName,
            specialty: entry.specialty,
            urgency: entry.urgency,
            notes: entry.notes || '',
            preferredDays: entry.preferredDays || [],
            preferredHours: entry.preferredHours || []
        });
        setIsModalOpen(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newEntry.patientName || !newEntry.specialty) {
            toast.error('Nombre y especialidad son campos obligatorios');
            return;
        }

        setSaving(true);
        try {
            if (editingEntry) {
                const updated = await updateWaitingList(editingEntry.id, newEntry as Omit<WaitingListEntry, 'id' | 'registrationDate'>);
                setEntries(entries.map(e => e.id === updated.id ? updated : e));
                toast.success('Registro actualizado');
            } else {
                const added = await addToWaitingList(newEntry as Omit<WaitingListEntry, 'id' | 'registrationDate'>);
                setEntries([added, ...entries]);
                toast.success('Añadido a la lista');
            }
            
            closeModal();
        } catch (error: any) {
            console.error('Error saving entry:', error);
            const msg = error.message || 'Error al guardar el registro';
            toast.error(msg);
            
            if (msg.includes('column') || msg.includes('does not exist')) {
                toast.error('Parece que faltan columnas en la base de datos. ¿Has ejecutado el SQL del último paso?', { duration: 6000 });
            }
        } finally {
            setSaving(false);
        }
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingEntry(null);
        setNewEntry({ 
            patientId: '', 
            patientName: '', 
            specialty: '', 
            urgency: 'Media', 
            notes: '',
            preferredDays: [],
            preferredHours: []
        });
    };

    const toggleDay = (dayIndex: number) => {
        const current = newEntry.preferredDays || [];
        if (current.includes(dayIndex)) {
            setNewEntry({ ...newEntry, preferredDays: current.filter(d => d !== dayIndex) });
        } else {
            setNewEntry({ ...newEntry, preferredDays: [...current, dayIndex].sort() });
        }
    };

    const toggleHour = (hour: string) => {
        const current = newEntry.preferredHours || [];
        if (current.includes(hour)) {
            setNewEntry({ ...newEntry, preferredHours: current.filter(h => h !== hour) });
        } else {
            setNewEntry({ ...newEntry, preferredHours: [...current, hour].sort() });
        }
    };

    const filteredEntries = entries.filter(e =>
        e.patientName.toLowerCase().includes(filter.toLowerCase()) ||
        e.specialty.toLowerCase().includes(filter.toLowerCase())
    );

    const getUrgencyBadge = (level: string) => {
        switch (level) {
            case 'Alta': return { class: 'badge-alta', label: 'Alta Prioridad' };
            case 'Media': return { class: 'badge-media', label: 'Prioridad Media' };
            default: return { class: 'badge-normal', label: 'Normal' };
        }
    };

    const getDayName = (idx: number) => ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'][idx - 1];

    if (loading) return (
        <div className="loading-container">
            <div className="spinner"></div>
            <p>Sincronizando lista de espera...</p>
        </div>
    );

    return (
        <div className="waiting-list-page animate-fade-in">
            <header className="page-header">
                <div className="header-info">
                    <h1 className="page-title">
                        <Timer className="title-icon" size={32} /> 
                        Lista de Espera
                    </h1>
                    <p className="page-subtitle">Gestiona pacientes pendientes de asignación y sus preferencias horarias.</p>
                </div>
                
                <div className="header-actions">
                    <div className="search-pill">
                        <Search size={18} />
                        <input
                            type="text"
                            placeholder="Buscar paciente..."
                            value={filter}
                            onChange={e => setFilter(e.target.value)}
                        />
                    </div>
                    <button 
                        className="calendar-btn-pill calendar-btn-primary"
                        onClick={() => {
                            setEditingEntry(null);
                            setNewEntry({ 
                                patientId: '', 
                                patientName: '', 
                                specialty: '', 
                                urgency: 'Media', 
                                notes: '',
                                preferredDays: [],
                                preferredHours: []
                            });
                            setIsModalOpen(true);
                        }}
                    >
                        <Plus size={18} />
                        <span>Añadir Registro</span>
                    </button>
                </div>
            </header>

            <div className="waiting-grid">
                {filteredEntries.length === 0 ? (
                    <div className="empty-list">
                        <ClipboardList size={48} />
                        <h3>Sin pacientes en espera</h3>
                        <p>No se encontraron registros que coincidan con tu búsqueda.</p>
                    </div>
                ) : (
                    filteredEntries.map(entry => {
                        const badge = getUrgencyBadge(entry.urgency);
                        return (
                            <Card 
                                key={entry.id} 
                                className="waiting-card premium-card animate-fade-in"
                                onClick={() => handleEdit(entry)}
                            >
                                <div className="waiting-card-header">
                                    <div className="waiting-avatar">
                                        {entry.patientName.charAt(0)}
                                    </div>
                                    <div className="waiting-info">
                                        <h3 className="waiting-name">{entry.patientName}</h3>
                                        <span className="waiting-specialty">{entry.specialty}</span>
                                    </div>
                                    <div className="waiting-actions">
                                        <button 
                                            className="btn-edit-discreet"
                                            title="Editar registro"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleEdit(entry);
                                            }}
                                        >
                                            <Edit2 size={16} />
                                        </button>
                                        <button 
                                            className="btn-delete-discreet"
                                            title="Eliminar registro"
                                            onClick={(e) => handleDelete(entry.id, e)}
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>

                                <div className="waiting-card-body">
                                    <div className="badge-row">
                                        <span className={`urgency-badge ${badge.class}`}>{badge.label}</span>
                                        <span className="date-badge">
                                            <Calendar size={12} />
                                            {new Date(entry.registrationDate).toLocaleDateString()}
                                        </span>
                                    </div>

                                    <div className="preferences-section">
                                        <p className="section-label">Disponibilidad:</p>
                                        <div className="tag-cloud">
                                            {(entry.preferredDays?.length || 0) > 0 ? (
                                                entry.preferredDays?.map(d => (
                                                    <span key={d} className="prefer-day-tag">{getDayName(d)}</span>
                                                ))
                                            ) : (
                                                <span className="no-pref-tag">Cualquier día</span>
                                            )}
                                            
                                            {(entry.preferredHours?.length || 0) > 0 ? (
                                                entry.preferredHours?.map(h => (
                                                    <span key={h} className="prefer-hour-tag">{h}</span>
                                                ))
                                            ) : (
                                                <span className="no-pref-tag">Cualquier hora</span>
                                            )}
                                        </div>
                                    </div>

                                    {entry.notes && (
                                        <div className="notes-box">
                                            <Star size={12} className="star-icon" />
                                            <p>{entry.notes}</p>
                                        </div>
                                    )}
                                </div>
                            </Card>
                        );
                    })
                )}
            </div>

            {isModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-inner animate-scale-up">
                        <div className="modal-header-premium">
                            <div className="header-titles">
                                <h3>{editingEntry ? 'Editar Registro' : 'Nuevo Alta'}</h3>
                                <p>{editingEntry ? 'Modifica los datos del paciente en espera' : 'Completa los datos del paciente en espera'}</p>
                            </div>
                            <button className="btn-icon-round" onClick={closeModal} title="Cerrar">
                                <XIcon size={20} />
                            </button>
                        </div>
                        
                        <form onSubmit={handleSubmit} className="modal-form-premium">
                            <div className="form-sections-wrapper">
                                <div className="form-group-p">
                                    <label>Paciente</label>
                                    <select
                                        required
                                        value={newEntry.patientId}
                                        onChange={e => {
                                            const p = patients.find(p => p.id === e.target.value);
                                            setNewEntry({ ...newEntry, patientId: e.target.value, patientName: p ? `${p.firstName} ${p.lastName}` : '' });
                                        }}
                                    >
                                        <option value="">Seleccionar paciente existente...</option>
                                        {patients.map(p => (
                                            <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>
                                        ))}
                                        <option value="nuevo">-- Paciente no registrado --</option>
                                    </select>
                                </div>

                                {newEntry.patientId === 'nuevo' && (
                                    <div className="form-group-p animate-fade-in">
                                        <label>Nombre del Candidato</label>
                                        <input
                                            type="text"
                                            required
                                            placeholder="Nombre completo..."
                                            value={newEntry.patientName}
                                            onChange={e => setNewEntry({ ...newEntry, patientName: e.target.value })}
                                        />
                                    </div>
                                )}

                                <div className="form-row-p">
                                    <div className="form-group-p flex-1">
                                        <label>Especialidad</label>
                                        <select
                                            required
                                            value={newEntry.specialty}
                                            onChange={e => setNewEntry({ ...newEntry, specialty: e.target.value })}
                                        >
                                            <option value="">Seleccionar...</option>
                                            <option value="Psicología Infantil">Psicología Infantil</option>
                                            <option value="Logopedia">Logopedia</option>
                                            <option value="Neuropsicología">Neuropsicología</option>
                                            <option value="Terapia Ocupacional">Terapia Ocupacional</option>
                                            <option value="Atención Temprana">Atención Temprana</option>
                                        </select>
                                    </div>

                                    <div className="form-group-p flex-1">
                                        <label>Prioridad</label>
                                        <div className="priority-switch">
                                            {['Baja', 'Media', 'Alta'].map(level => (
                                                <button 
                                                    key={level}
                                                    type="button"
                                                    className={`priority-btn ${newEntry.urgency === level ? 'active' : ''}`}
                                                    onClick={() => setNewEntry({ ...newEntry, urgency: level as any })}
                                                >
                                                    {level}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                <div className="preferences-editor">
                                    <label className="editor-label">
                                        <Clock size={16} /> Preferencias del Paciente
                                    </label>
                                    
                                    <div className="day-picker-row">
                                        {DAYS_ABBR.map((day, i) => {
                                            const dayIdx = i + 1;
                                            const isSelected = newEntry.preferredDays?.includes(dayIdx);
                                            return (
                                                <button
                                                    key={day}
                                                    type="button"
                                                    title={['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][i]}
                                                    onClick={() => toggleDay(dayIdx)}
                                                    className={`day-selector-btn ${isSelected ? 'active' : ''}`}
                                                >
                                                    {day}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    <div className="hour-picker-grid">
                                        {COMMON_HOURS.map(h => {
                                            const isSelected = newEntry.preferredHours?.includes(h);
                                            return (
                                                <button
                                                    key={h}
                                                    type="button"
                                                    onClick={() => toggleHour(h)}
                                                    className={`hour-selector-btn ${isSelected ? 'active' : ''}`}
                                                >
                                                    {h}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="form-group-p">
                                    <label>Observaciones</label>
                                    <textarea
                                        rows={2}
                                        value={newEntry.notes}
                                        placeholder="Alguna nota adicional..."
                                        onChange={e => setNewEntry({ ...newEntry, notes: e.target.value })}
                                    />
                                </div>
                            </div>

                            <footer className="modal-footer-p">
                                <button type="button" className="calendar-btn-pill calendar-btn-secondary" onClick={closeModal}>Cancelar</button>
                                <button type="submit" disabled={saving} className="calendar-btn-pill calendar-btn-primary">
                                    {saving ? 'Guardando...' : (editingEntry ? 'Guardar Cambios' : 'Guardar Registro')}
                                </button>
                            </footer>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default WaitingList;
