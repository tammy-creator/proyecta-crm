import React, { useState, useMemo } from 'react';
import Modal from '../../components/ui/Modal';
import { type Therapist, type WorkingHours } from './types';
import { saveSpecialSchedulesForTherapists, removeSpecialScheduleForTherapists } from './service';
import { useToast } from '../../hooks/useToast';
import { Calendar as CalendarIcon, Clock, Plus, Trash2, Check, Sparkles, Users } from 'lucide-react';
import { format, parseISO, isValid } from 'date-fns';
import { es } from 'date-fns/locale';

interface SpecialScheduleModalProps {
    isOpen: boolean;
    onClose: () => void;
    therapists: Therapist[];
    onSaveSuccess: () => void;
}

const DEFAULT_BLOCKS: WorkingHours[] = [{ start: '09:00', end: '14:00' }];

export const SpecialScheduleModal: React.FC<SpecialScheduleModalProps> = ({
    isOpen,
    onClose,
    therapists,
    onSaveSuccess
}) => {
    const { showToast } = useToast();
    const activeTherapists = useMemo(() => therapists.filter(t => t.isActive !== false), [therapists]);

    const [activeTab, setActiveTab] = useState<'create' | 'list'>('create');
    const [selectedDates, setSelectedDates] = useState<string[]>(['2026-10-30', '2026-11-02', '2026-11-03']);
    const [newDateInput, setNewDateInput] = useState<string>('');
    const [blocks, setBlocks] = useState<WorkingHours[]>(DEFAULT_BLOCKS);
    const [isWorkingDay, setIsWorkingDay] = useState<boolean>(true);
    const [note, setNote] = useState<string>('Día no lectivo');
    const [applyToAll, setApplyToAll] = useState<boolean>(true);
    const [selectedTherapistIds, setSelectedTherapistIds] = useState<string[]>(() => activeTherapists.map(t => t.id));
    const [isSaving, setIsSaving] = useState<boolean>(false);
    const [deletingDate, setDeletingDate] = useState<string | null>(null);

    // Group all existing special schedules by date
    const existingSpecialSchedules = useMemo(() => {
        const map = new Map<string, {
            date: string;
            note?: string;
            enabled: boolean;
            blocks: WorkingHours[];
            therapists: { id: string; fullName: string; color: string }[];
        }>();

        therapists.forEach(t => {
            (t.specialSchedules || []).forEach(sp => {
                const existing = map.get(sp.date);
                if (existing) {
                    if (!existing.therapists.some(item => item.id === t.id)) {
                        existing.therapists.push({ id: t.id, fullName: t.fullName, color: t.color });
                    }
                } else {
                    map.set(sp.date, {
                        date: sp.date,
                        note: sp.note,
                        enabled: sp.enabled,
                        blocks: sp.blocks || [],
                        therapists: [{ id: t.id, fullName: t.fullName, color: t.color }]
                    });
                }
            });
        });

        // Convert to array sorted by date
        return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
    }, [therapists]);

    // Handlers for dates
    const handleAddDate = (dateStr: string) => {
        if (!dateStr) return;
        if (!selectedDates.includes(dateStr)) {
            setSelectedDates(prev => [...prev, dateStr].sort());
        }
        setNewDateInput('');
    };

    const handleRemoveDate = (dateStr: string) => {
        setSelectedDates(prev => prev.filter(d => d !== dateStr));
    };

    // Handlers for blocks
    const handleAddBlock = () => {
        setBlocks(prev => [...prev, { start: '16:00', end: '20:00' }]);
    };

    const handleRemoveBlock = (idx: number) => {
        setBlocks(prev => prev.filter((_, i) => i !== idx));
    };

    const handleUpdateBlock = (idx: number, field: 'start' | 'end', val: string) => {
        setBlocks(prev => prev.map((b, i) => i === idx ? { ...b, [field]: val } : b));
    };

    // Toggle therapist selection
    const handleToggleTherapist = (id: string) => {
        setSelectedTherapistIds(prev => 
            prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
        );
    };

    const handleSelectAllTherapists = (checked: boolean) => {
        setApplyToAll(checked);
        if (checked) {
            setSelectedTherapistIds(activeTherapists.map(t => t.id));
        }
    };

    // Save special schedule
    const handleSave = async () => {
        if (selectedDates.length === 0) {
            showToast('Selecciona al menos una fecha para aplicar el horario especial', 'error');
            return;
        }

        const targetIds = applyToAll ? activeTherapists.map(t => t.id) : selectedTherapistIds;
        if (targetIds.length === 0) {
            showToast('Selecciona al menos una terapeuta', 'error');
            return;
        }

        if (isWorkingDay && blocks.length === 0) {
            showToast('Añade al menos un tramo horario o marca el día como no laborable', 'error');
            return;
        }

        // Validate block hours
        for (const b of blocks) {
            if (b.start >= b.end) {
                showToast(`La hora de inicio (${b.start}) debe ser anterior a la hora de fin (${b.end})`, 'error');
                return;
            }
        }

        setIsSaving(true);
        try {
            await saveSpecialSchedulesForTherapists(
                targetIds,
                selectedDates,
                isWorkingDay ? blocks : [],
                isWorkingDay,
                note.trim()
            );

            showToast(
                `Horario especial guardado con éxito para ${selectedDates.length} fecha(s) y ${targetIds.length} terapeuta(s)`,
                'success'
            );
            onSaveSuccess();
            onClose();
        } catch (err: any) {
            console.error('Error saving special schedules:', err);
            showToast(`Error al guardar: ${err.message || 'Error desconocido'}`, 'error');
        } finally {
            setIsSaving(false);
        }
    };

    // Delete existing special schedule
    const handleDeleteExisting = async (dateStr: string, affectedTherapistIds: string[]) => {
        if (!confirm(`¿Eliminar el horario especial del día ${dateStr}? Las terapeutas volverán a su horario semanal habitual.`)) {
            return;
        }

        setDeletingDate(dateStr);
        try {
            await removeSpecialScheduleForTherapists(affectedTherapistIds, dateStr);
            showToast(`Horario especial de ${dateStr} eliminado`, 'success');
            onSaveSuccess();
        } catch (err: any) {
            console.error('Error removing special schedule:', err);
            showToast(`Error al eliminar: ${err.message || 'Error desconocido'}`, 'error');
        } finally {
            setDeletingDate(null);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Horarios Especiales / Excepciones por Fecha"
            maxWidth="650px"
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {/* Tabs */}
                <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', gap: '0.5rem' }}>
                    <button
                        type="button"
                        onClick={() => setActiveTab('create')}
                        style={{
                            padding: '0.5rem 1rem',
                            fontWeight: activeTab === 'create' ? 'bold' : 'normal',
                            color: activeTab === 'create' ? '#2563eb' : '#64748b',
                            borderBottom: activeTab === 'create' ? '2px solid #2563eb' : '2px solid transparent',
                            background: 'none',
                            borderTop: 'none',
                            borderLeft: 'none',
                            borderRight: 'none',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        <Plus size={16} /> Crear / Aplicar Horario
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('list')}
                        style={{
                            padding: '0.5rem 1rem',
                            fontWeight: activeTab === 'list' ? 'bold' : 'normal',
                            color: activeTab === 'list' ? '#2563eb' : '#64748b',
                            borderBottom: activeTab === 'list' ? '2px solid #2563eb' : '2px solid transparent',
                            background: 'none',
                            borderTop: 'none',
                            borderLeft: 'none',
                            borderRight: 'none',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        <CalendarIcon size={16} /> Excepciones Activas ({existingSpecialSchedules.length})
                    </button>
                </div>

                {activeTab === 'create' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                        {/* Notice banner */}
                        <div style={{
                            backgroundColor: '#f0fdf4',
                            border: '1px solid #bbf7d0',
                            borderRadius: '8px',
                            padding: '0.75rem',
                            fontSize: '12px',
                            color: '#166534',
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '8px'
                        }}>
                            <Sparkles size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                            <div>
                                <strong>Horario puntual por fecha:</strong> Las fechas configuradas aquí sustituyen el horario habitual únicamente en esos días. Las semanas anteriores y posteriores no se verán afectadas.
                            </div>
                        </div>

                        {/* Dates Selection */}
                        <div>
                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '0.4rem' }}>
                                Fechas a las que aplicar el horario:
                            </label>
                            
                            {/* Selected dates chips */}
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '0.5rem' }}>
                                {selectedDates.length === 0 ? (
                                    <span style={{ fontSize: '12px', color: '#94a3b8', fontStyle: 'italic' }}>
                                        Ninguna fecha seleccionada. Añade una fecha abajo.
                                    </span>
                                ) : (
                                    selectedDates.map(dateStr => {
                                        const parsed = parseISO(dateStr);
                                        const formatted = isValid(parsed) ? format(parsed, "EEE d 'de' MMM", { locale: es }) : dateStr;
                                        return (
                                            <span
                                                key={dateStr}
                                                style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '6px',
                                                    backgroundColor: '#eff6ff',
                                                    border: '1px solid #bfdbfe',
                                                    color: '#1e40af',
                                                    padding: '3px 8px',
                                                    borderRadius: '16px',
                                                    fontSize: '12px',
                                                    fontWeight: 500
                                                }}
                                            >
                                                <CalendarIcon size={13} />
                                                <span style={{ textTransform: 'capitalize' }}>{formatted}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveDate(dateStr)}
                                                    style={{
                                                        background: 'none',
                                                        border: 'none',
                                                        color: '#dc2626',
                                                        cursor: 'pointer',
                                                        padding: 0,
                                                        display: 'flex',
                                                        alignItems: 'center'
                                                    }}
                                                    title="Quitar fecha"
                                                >
                                                    &times;
                                                </button>
                                            </span>
                                        );
                                    })
                                )}
                            </div>

                            {/* Add date input + quick presets */}
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <input
                                    type="date"
                                    value={newDateInput}
                                    onChange={e => setNewDateInput(e.target.value)}
                                    style={{
                                        padding: '0.4rem 0.6rem',
                                        border: '1px solid #cbd5e1',
                                        borderRadius: '6px',
                                        fontSize: '13px'
                                    }}
                                />
                                <button
                                    type="button"
                                    onClick={() => handleAddDate(newDateInput)}
                                    disabled={!newDateInput}
                                    style={{
                                        padding: '0.4rem 0.8rem',
                                        backgroundColor: newDateInput ? '#2563eb' : '#94a3b8',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '6px',
                                        fontSize: '12px',
                                        fontWeight: 500,
                                        cursor: newDateInput ? 'pointer' : 'default',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                    }}
                                >
                                    <Plus size={14} /> Añadir fecha
                                </button>

                                <span style={{ fontSize: '11px', color: '#94a3b8', marginLeft: 'auto' }}>
                                    Accesos rápidos:
                                </span>
                                <button
                                    type="button"
                                    onClick={() => handleAddDate('2026-10-30')}
                                    style={{ fontSize: '11px', padding: '2px 6px', border: '1px solid #e2e8f0', borderRadius: '4px', background: '#f8fafc', cursor: 'pointer' }}
                                >
                                    Vie 30/10
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleAddDate('2026-11-02')}
                                    style={{ fontSize: '11px', padding: '2px 6px', border: '1px solid #e2e8f0', borderRadius: '4px', background: '#f8fafc', cursor: 'pointer' }}
                                >
                                    Lun 02/11
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleAddDate('2026-11-03')}
                                    style={{ fontSize: '11px', padding: '2px 6px', border: '1px solid #e2e8f0', borderRadius: '4px', background: '#f8fafc', cursor: 'pointer' }}
                                >
                                    Mar 03/11
                                </button>
                            </div>
                        </div>

                        {/* Motivo / Etiqueta */}
                        <div>
                            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '0.4rem' }}>
                                Motivo / Etiqueta:
                            </label>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <input
                                    type="text"
                                    value={note}
                                    onChange={e => setNote(e.target.value)}
                                    placeholder="Ej: Día no lectivo, Jornada intensiva..."
                                    style={{
                                        flex: 1,
                                        padding: '0.4rem 0.6rem',
                                        border: '1px solid #cbd5e1',
                                        borderRadius: '6px',
                                        fontSize: '13px'
                                    }}
                                />
                                <div style={{ display: 'flex', gap: '4px' }}>
                                    {['Día no lectivo', 'Jornada mañanas', 'Festivo especial'].map(preset => (
                                        <button
                                            key={preset}
                                            type="button"
                                            onClick={() => setNote(preset)}
                                            style={{
                                                fontSize: '11px',
                                                padding: '2px 6px',
                                                border: '1px solid #e2e8f0',
                                                borderRadius: '4px',
                                                background: '#f8fafc',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            {preset}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Working schedule vs Non-working day */}
                        <div style={{
                            border: '1px solid #e2e8f0',
                            borderRadius: '8px',
                            padding: '0.75rem',
                            backgroundColor: '#f8fafc'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: isWorkingDay ? '0.75rem' : 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <input
                                        type="checkbox"
                                        id="isWorkingDayCheck"
                                        checked={isWorkingDay}
                                        onChange={e => setIsWorkingDay(e.target.checked)}
                                        style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                                    />
                                    <label htmlFor="isWorkingDayCheck" style={{ fontSize: '13px', fontWeight: 600, color: '#334155', cursor: 'pointer' }}>
                                        Día laborable con horario especial
                                    </label>
                                </div>
                                {!isWorkingDay && (
                                    <span style={{ fontSize: '12px', color: '#dc2626', fontWeight: 500 }}>
                                        (Se marcará como día libre / sin horario)
                                    </span>
                                )}
                            </div>

                            {/* Blocks configuration */}
                            {isWorkingDay && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 500 }}>
                                        Tramos de sesiones:
                                    </div>
                                    {blocks.map((block, idx) => (
                                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <span style={{ fontSize: '12px', color: '#64748b' }}>De:</span>
                                                <input
                                                    type="time"
                                                    value={block.start}
                                                    onChange={e => handleUpdateBlock(idx, 'start', e.target.value)}
                                                    style={{
                                                        padding: '0.3rem 0.5rem',
                                                        border: '1px solid #cbd5e1',
                                                        borderRadius: '6px',
                                                        fontSize: '13px'
                                                    }}
                                                />
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <span style={{ fontSize: '12px', color: '#64748b' }}>A:</span>
                                                <input
                                                    type="time"
                                                    value={block.end}
                                                    onChange={e => handleUpdateBlock(idx, 'end', e.target.value)}
                                                    style={{
                                                        padding: '0.3rem 0.5rem',
                                                        border: '1px solid #cbd5e1',
                                                        borderRadius: '6px',
                                                        fontSize: '13px'
                                                    }}
                                                />
                                            </div>
                                            {blocks.length > 1 && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveBlock(idx)}
                                                    style={{
                                                        background: 'none',
                                                        border: 'none',
                                                        color: '#ef4444',
                                                        cursor: 'pointer',
                                                        padding: '4px',
                                                        display: 'flex',
                                                        alignItems: 'center'
                                                    }}
                                                    title="Eliminar tramo"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            )}
                                        </div>
                                    ))}

                                    <button
                                        type="button"
                                        onClick={handleAddBlock}
                                        style={{
                                            alignSelf: 'flex-start',
                                            background: 'none',
                                            border: 'none',
                                            color: '#2563eb',
                                            fontSize: '12px',
                                            fontWeight: 500,
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            padding: '4px 0',
                                            marginTop: '4px'
                                        }}
                                    >
                                        <Plus size={14} /> Añadir otro tramo (ej. tarde)
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Therapist selection */}
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                                <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>
                                    Terapeutas afectadas:
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#2563eb', fontWeight: 600, cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={applyToAll}
                                        onChange={e => handleSelectAllTherapists(e.target.checked)}
                                        style={{ cursor: 'pointer' }}
                                    />
                                    Todas las terapeutas activas ({activeTherapists.length})
                                </label>
                            </div>

                            {!applyToAll && (
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(2, 1fr)',
                                    gap: '6px',
                                    maxHeight: '120px',
                                    overflowY: 'auto',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: '6px',
                                    padding: '0.5rem',
                                    backgroundColor: '#ffffff'
                                }}>
                                    {activeTherapists.map(t => (
                                        <label
                                            key={t.id}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                fontSize: '12px',
                                                cursor: 'pointer',
                                                padding: '2px 4px',
                                                borderRadius: '4px',
                                                backgroundColor: selectedTherapistIds.includes(t.id) ? '#f1f5f9' : 'transparent'
                                            }}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={selectedTherapistIds.includes(t.id)}
                                                onChange={() => handleToggleTherapist(t.id)}
                                            />
                                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: t.color || '#3b82f6', display: 'inline-block' }} />
                                            <span style={{ fontWeight: 500, color: '#1e293b' }}>{t.fullName}</span>
                                        </label>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Modal Actions */}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '0.5rem', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={isSaving}
                                style={{
                                    padding: '0.5rem 1rem',
                                    backgroundColor: '#f1f5f9',
                                    border: '1px solid #cbd5e1',
                                    borderRadius: '6px',
                                    fontSize: '13px',
                                    fontWeight: 500,
                                    cursor: 'pointer',
                                    color: '#475569'
                                }}
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={handleSave}
                                disabled={isSaving || selectedDates.length === 0}
                                style={{
                                    padding: '0.5rem 1.2rem',
                                    backgroundColor: isSaving || selectedDates.length === 0 ? '#94a3b8' : '#2563eb',
                                    border: 'none',
                                    borderRadius: '6px',
                                    fontSize: '13px',
                                    fontWeight: 600,
                                    cursor: isSaving || selectedDates.length === 0 ? 'default' : 'pointer',
                                    color: 'white',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                }}
                            >
                                <Check size={16} />
                                {isSaving ? 'Guardando...' : `Aplicar Horario Especial (${selectedDates.length} días)`}
                            </button>
                        </div>
                    </div>
                ) : (
                    /* Existing Exceptions List */
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '420px', overflowY: 'auto' }}>
                        {existingSpecialSchedules.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8', fontSize: '13px' }}>
                                No hay ningún horario especial registrado actualmente.
                            </div>
                        ) : (
                            existingSpecialSchedules.map(item => {
                                const parsed = parseISO(item.date);
                                const dateFormatted = isValid(parsed)
                                    ? format(parsed, "EEEE, d 'de' MMMM yyyy", { locale: es })
                                    : item.date;

                                return (
                                    <div
                                        key={item.date}
                                        style={{
                                            border: '1px solid #e2e8f0',
                                            borderRadius: '8px',
                                            padding: '0.75rem',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            backgroundColor: '#ffffff'
                                        }}
                                    >
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span style={{ fontWeight: 700, fontSize: '13px', textTransform: 'capitalize', color: '#1e293b' }}>
                                                    {dateFormatted}
                                                </span>
                                                {item.note && (
                                                    <span style={{
                                                        fontSize: '11px',
                                                        fontWeight: 600,
                                                        backgroundColor: '#fef3c7',
                                                        color: '#92400e',
                                                        padding: '1px 6px',
                                                        borderRadius: '4px',
                                                        border: '1px solid #fde68a'
                                                    }}>
                                                        {item.note}
                                                    </span>
                                                )}
                                            </div>

                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px', color: '#64748b' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <Clock size={13} />
                                                    {item.enabled ? (
                                                        <span>
                                                            {item.blocks.map(b => `${b.start} - ${b.end}`).join(', ')}
                                                        </span>
                                                    ) : (
                                                        <span style={{ color: '#ef4444', fontWeight: 500 }}>No laborable</span>
                                                    )}
                                                </div>

                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <Users size={13} />
                                                    <span>
                                                        {item.therapists.length >= activeTherapists.length
                                                            ? 'Todo el equipo'
                                                            : `${item.therapists.length} terapeuta(s)`}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() => handleDeleteExisting(item.date, item.therapists.map(t => t.id))}
                                            disabled={deletingDate === item.date}
                                            style={{
                                                background: 'none',
                                                border: '1px solid #fee2e2',
                                                borderRadius: '6px',
                                                padding: '6px 8px',
                                                color: '#dc2626',
                                                cursor: deletingDate === item.date ? 'default' : 'pointer',
                                                fontSize: '12px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '4px',
                                                backgroundColor: '#fff1f2'
                                            }}
                                            title="Eliminar este horario especial"
                                        >
                                            <Trash2 size={14} />
                                            {deletingDate === item.date ? 'Borrando...' : 'Eliminar'}
                                        </button>
                                    </div>
                                );
                            })
                        )}
                    </div>
                )}
            </div>
        </Modal>
    );
};

export default SpecialScheduleModal;
