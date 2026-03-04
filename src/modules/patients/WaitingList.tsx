import React, { useState, useEffect } from 'react';
import { getWaitingList, removeFromWaitingList, addToWaitingList, getPatients } from './service';
import { type WaitingListEntry, type Patient } from './types';
import { Clock, ClipboardList, Trash2, Calendar, Search, Plus, X as XIcon } from 'lucide-react';
import Card from '../../components/ui/Card';

const WaitingList: React.FC = () => {
    const [entries, setEntries] = useState<WaitingListEntry[]>([]);
    const [patients, setPatients] = useState<Patient[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [newEntry, setNewEntry] = useState<Partial<WaitingListEntry>>({
        patientId: '',
        patientName: '',
        specialty: '',
        urgency: 'Media',
        notes: ''
    });

    useEffect(() => {
        Promise.all([getWaitingList(), getPatients()]).then(([waitingData, patientsData]) => {
            setEntries(waitingData);
            setPatients(patientsData);
            setLoading(false);
        });
    }, []);

    const handleDelete = async (id: string) => {
        if (window.confirm('¿Eliminar a este paciente de la lista de espera?')) {
            const success = await removeFromWaitingList(id);
            if (success) {
                setEntries(entries.filter(e => e.id !== id));
            }
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newEntry.patientName || !newEntry.specialty) return;

        const entry = await addToWaitingList(newEntry as Omit<WaitingListEntry, 'id' | 'registrationDate'>);
        setEntries([entry, ...entries]);
        setIsModalOpen(false);
        setNewEntry({ patientId: '', patientName: '', specialty: '', urgency: 'Media', notes: '' });
    };

    const filteredEntries = entries.filter(e =>
        e.patientName.toLowerCase().includes(filter.toLowerCase()) ||
        e.specialty.toLowerCase().includes(filter.toLowerCase())
    );

    const getUrgencyClass = (level: string) => {
        switch (level) {
            case 'Alta': return 'text-danger bg-danger-light';
            case 'Media': return 'text-warning bg-warning-light';
            default: return 'text-secondary bg-gray-100';
        }
    };

    if (loading) return <div className="p-8 text-center text-secondary">Cargando lista de espera...</div>;

    return (
        <div className="waiting-list-container p-4">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-xl font-bold text-primary flex items-center gap-2">
                        <Clock className="text-secondary" /> Lista de Espera
                    </h2>
                    <p className="text-sm text-secondary">Pacientes pendientes de asignación de hueco</p>
                </div>
                <div className="flex gap-4">
                    <div className="search-bar" style={{ maxWidth: '250px' }}>
                        <Search size={16} />
                        <input
                            type="text"
                            placeholder="Buscar por nombre o especialidad..."
                            value={filter}
                            onChange={e => setFilter(e.target.value)}
                        />
                    </div>
                    <button className="btn-primary" onClick={() => setIsModalOpen(true)}>
                        <Plus size={18} />
                        <span>Añadir a lista</span>
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredEntries.length === 0 ? (
                    <div className="col-span-full py-12 text-center bg-gray-50 rounded-xl border border-dashed text-secondary">
                        No hay pacientes que coincidan con la búsqueda.
                    </div>
                ) : (
                    filteredEntries.map(entry => (
                        <Card key={entry.id} className="waiting-card hover-lift">
                            <div className="flex justify-between items-start mb-3">
                                <div className="flex items-center gap-3">
                                    <div className="avatar small bg-primary-light text-primary font-bold">
                                        {entry.patientName.charAt(0)}
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-gray-800">{entry.patientName}</h4>
                                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getUrgencyClass(entry.urgency)}`}>
                                            Urgencia {entry.urgency}
                                        </span>
                                    </div>
                                </div>
                                <button className="btn-icon micro text-danger" onClick={() => handleDelete(entry.id)}>
                                    <Trash2 size={14} />
                                </button>
                            </div>

                            <div className="waiting-details space-y-2 text-sm">
                                <div className="flex items-center gap-2 text-secondary">
                                    <ClipboardList size={14} />
                                    <span>{entry.specialty}</span>
                                </div>
                                <div className="flex items-center gap-2 text-secondary">
                                    <Calendar size={14} />
                                    <span>Registrado el {new Date(entry.registrationDate).toLocaleDateString()}</span>
                                </div>
                                {entry.notes && (
                                    <div className="mt-3 p-2 bg-gray-50 rounded text-xs border-l-2 border-secondary italic">
                                        "{entry.notes}"
                                    </div>
                                )}
                            </div>
                        </Card>
                    ))
                )}
            </div>

            {isModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-content" style={{ maxWidth: '500px' }}>
                        <div className="modal-header">
                            <h3>Registrar en Lista de Espera</h3>
                            <button className="btn-icon-round" onClick={() => setIsModalOpen(false)}><XIcon size={20} /></button>
                        </div>
                        <form onSubmit={handleSave} className="modal-form">
                            <div className="form-group">
                                <label>Paciente</label>
                                <select
                                    required
                                    value={newEntry.patientId}
                                    onChange={e => {
                                        const p = patients.find(p => p.id === e.target.value);
                                        setNewEntry({ ...newEntry, patientId: e.target.value, patientName: p ? `${p.firstName} ${p.lastName}` : '' });
                                    }}
                                >
                                    <option value="">Seleccionar paciente...</option>
                                    {patients.map(p => (
                                        <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>
                                    ))}
                                    <option value="nuevo">-- Paciente no registrado (Nuevo interno) --</option>
                                </select>
                            </div>

                            {newEntry.patientId === 'nuevo' && (
                                <div className="form-group animate-fade-in">
                                    <label>Nombre del Candidato</label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="Ej: Hugo Torres (Tutor: Ana)"
                                        value={newEntry.patientName}
                                        onChange={e => setNewEntry({ ...newEntry, patientName: e.target.value })}
                                    />
                                </div>
                            )}

                            <div className="form-group">
                                <label>Especialidad / Servicio</label>
                                <select
                                    required
                                    value={newEntry.specialty}
                                    onChange={e => setNewEntry({ ...newEntry, specialty: e.target.value })}
                                >
                                    <option value="">Seleccionar especialidad...</option>
                                    <option value="Psicología Infantil">Psicología Infantil</option>
                                    <option value="Logopedia">Logopedia</option>
                                    <option value="Neuropsicología">Neuropsicología</option>
                                    <option value="Terapia Ocupacional">Terapia Ocupacional</option>
                                    <option value="Atención Temprana">Atención Temprana</option>
                                </select>
                            </div>

                            <div className="form-group">
                                <label>Nivel de Urgencia</label>
                                <div className="flex gap-4 mt-2">
                                    {['Baja', 'Media', 'Alta'].map(level => (
                                        <label key={level} className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="radio"
                                                name="urgency"
                                                value={level}
                                                checked={newEntry.urgency === level}
                                                onChange={() => setNewEntry({ ...newEntry, urgency: level as any })}
                                            />
                                            <span className="text-sm">{level}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div className="form-group">
                                <label>Observaciones / Disponibilidad</label>
                                <textarea
                                    rows={3}
                                    value={newEntry.notes}
                                    placeholder="Ej: Solo tardes a partir de las 17:00..."
                                    onChange={e => setNewEntry({ ...newEntry, notes: e.target.value })}
                                    style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid #ddd' }}
                                />
                            </div>

                            <div className="modal-footer mt-6">
                                <button type="button" className="btn-secondary" onClick={() => setIsModalOpen(false)}>Cancelar</button>
                                <button type="submit" className="btn-primary">Añadir a lista</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default WaitingList;
