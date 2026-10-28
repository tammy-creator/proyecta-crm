import React, { useState, useEffect } from 'react';
import type { ClaraCall, CallStatus } from './types';
import { saveCallTracking, formatPhoneDisplay } from './service';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../hooks/useToast';
import { X, Phone, User, MessageSquare, CheckCircle, Clock, AlertTriangle, Info, Copy, Check } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface CallModalProps {
    call: ClaraCall | null;
    isOpen: boolean;
    onClose: () => void;
    onSaved: () => void;
}

export const CallModal: React.FC<CallModalProps> = ({ call, isOpen, onClose, onSaved }) => {
    const { user } = useAuth();
    const { showToast } = useToast();

    const [status, setStatus] = useState<CallStatus>('PENDING');
    const [returnedAt, setReturnedAt] = useState<string>('');
    const [returnedBy, setReturnedBy] = useState<string>('');
    const [notes, setNotes] = useState<string>('');
    const [isSaving, setIsSaving] = useState(false);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (call) {
            const currentTracking = call.tracking;
            setStatus(currentTracking?.status || 'PENDING');
            setReturnedBy(currentTracking?.returnedBy || user?.name || 'Administración');
            setNotes(currentTracking?.notes || '');

            // Formatear fecha para input datetime-local
            if (currentTracking?.returnedAt) {
                const d = new Date(currentTracking.returnedAt);
                setReturnedAt(format(d, "yyyy-MM-dd'T'HH:mm"));
            } else {
                setReturnedAt(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
            }
        }
    }, [call, user]);

    if (!isOpen || !call) return null;

    const handleCopyPhone = () => {
        if (call.phone) {
            navigator.clipboard.writeText(call.phone);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            const success = await saveCallTracking(call.id, {
                status,
                returnedAt: returnedAt ? new Date(returnedAt).toISOString() : new Date().toISOString(),
                returnedBy: returnedBy.trim() || user?.name || 'Administración',
                notes: notes.trim()
            });

            if (success) {
                showToast('Reporte de llamada guardado correctamente', 'success');
                onSaved();
                onClose();
            } else {
                showToast('Error al guardar el reporte de la llamada', 'error');
            }
        } catch (error) {
            console.error('Error in handleSave:', error);
            showToast('Ocurrió un error inesperado al guardar', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                backgroundColor: 'rgba(15, 23, 42, 0.65)',
                backdropFilter: 'blur(4px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 99999,
                padding: '16px'
            }}
            onClick={onClose}
        >
            <div
                style={{
                    backgroundColor: '#ffffff',
                    borderRadius: '16px',
                    width: '100%',
                    maxWidth: '640px',
                    maxHeight: '90vh',
                    overflowY: 'auto',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                    display: 'flex',
                    flexDirection: 'column'
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div
                    style={{
                        padding: '20px 24px',
                        borderBottom: '1px solid #e2e8f0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: 'linear-gradient(to right, #f8fafc, #f1f5f9)'
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div
                            style={{
                                width: '40px',
                                height: '40px',
                                borderRadius: '10px',
                                backgroundColor: '#e0f2fe',
                                color: '#0284c7',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}
                        >
                            <Phone size={22} />
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>
                                Gestión de Llamada (Clara IA)
                            </h3>
                            <span style={{ fontSize: '12px', color: '#64748b' }}>
                                Recibida el {format(call.date, "d 'de' MMMM 'a las' HH:mm", { locale: es })}
                            </span>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            color: '#64748b',
                            padding: '6px',
                            borderRadius: '8px'
                        }}
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Resumen de la llamada original */}
                <div style={{ padding: '20px 24px', backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                        {/* Teléfono */}
                        <div style={{ backgroundColor: '#ffffff', padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                            <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, marginBottom: '4px' }}>TELÉFONO DE CONTACTO</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>
                                    {formatPhoneDisplay(call.phone)}
                                </span>
                                {call.phone && (
                                    <>
                                        <button
                                            type="button"
                                            onClick={handleCopyPhone}
                                            title="Copiar teléfono"
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied ? '#10b981' : '#64748b', padding: '2px' }}
                                        >
                                            {copied ? <Check size={16} /> : <Copy size={16} />}
                                        </button>
                                        <a
                                            href={`tel:${call.phone}`}
                                            title="Llamar directamente"
                                            style={{
                                                backgroundColor: '#0284c7',
                                                color: '#ffffff',
                                                borderRadius: '6px',
                                                padding: '3px 8px',
                                                fontSize: '11px',
                                                fontWeight: 600,
                                                textDecoration: 'none',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '4px'
                                            }}
                                        >
                                            <Phone size={12} /> Llamar
                                        </a>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Paciente asociado */}
                        <div style={{ backgroundColor: '#ffffff', padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                            <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, marginBottom: '4px' }}>PACIENTE EN CENTRO</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <User size={16} color={call.patientName ? '#0284c7' : '#94a3b8'} />
                                <span style={{ fontSize: '14px', fontWeight: call.patientName ? 700 : 500, color: call.patientName ? '#0369a1' : '#64748b' }}>
                                    {call.patientName || 'Contacto nuevo / No registrado'}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Resumen de la conversación con Clara */}
                    <div style={{ backgroundColor: '#ffffff', padding: '14px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                            <MessageSquare size={14} color="#0284c7" />
                            <span>Resumen de la llamada atendida por Clara:</span>
                        </div>
                        <p style={{ margin: 0, fontSize: '13px', lineHeight: '1.5', color: '#475569' }}>
                            {call.summary}
                        </p>
                    </div>
                </div>

                {/* Formulario de Seguimiento */}
                <form onSubmit={handleSave} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
                    {/* Selector de Estado */}
                    <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>
                            Estado de la llamada:
                        </label>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                            <button
                                type="button"
                                onClick={() => setStatus('PENDING')}
                                style={{
                                    padding: '10px',
                                    borderRadius: '8px',
                                    border: '2px solid',
                                    borderColor: status === 'PENDING' ? '#f59e0b' : '#e2e8f0',
                                    backgroundColor: status === 'PENDING' ? '#fef3c7' : '#ffffff',
                                    color: status === 'PENDING' ? '#92400e' : '#64748b',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    cursor: 'pointer',
                                    fontWeight: status === 'PENDING' ? 700 : 500,
                                    fontSize: '13px'
                                }}
                            >
                                <Clock size={16} /> Pendiente de devolver
                            </button>

                            <button
                                type="button"
                                onClick={() => setStatus('RETURNED')}
                                style={{
                                    padding: '10px',
                                    borderRadius: '8px',
                                    border: '2px solid',
                                    borderColor: status === 'RETURNED' ? '#10b981' : '#e2e8f0',
                                    backgroundColor: status === 'RETURNED' ? '#d1fae5' : '#ffffff',
                                    color: status === 'RETURNED' ? '#065f46' : '#64748b',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    cursor: 'pointer',
                                    fontWeight: status === 'RETURNED' ? 700 : 500,
                                    fontSize: '13px'
                                }}
                            >
                                <CheckCircle size={16} /> Llamada devuelta (Gestionada)
                            </button>

                            <button
                                type="button"
                                onClick={() => setStatus('NO_ANSWER')}
                                style={{
                                    padding: '10px',
                                    borderRadius: '8px',
                                    border: '2px solid',
                                    borderColor: status === 'NO_ANSWER' ? '#f97316' : '#e2e8f0',
                                    backgroundColor: status === 'NO_ANSWER' ? '#ffedd5' : '#ffffff',
                                    color: status === 'NO_ANSWER' ? '#9a3412' : '#64748b',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    cursor: 'pointer',
                                    fontWeight: status === 'NO_ANSWER' ? 700 : 500,
                                    fontSize: '13px'
                                }}
                            >
                                <AlertTriangle size={16} /> No contesta / Reintentar
                            </button>

                            <button
                                type="button"
                                onClick={() => setStatus('INFO_ONLY')}
                                style={{
                                    padding: '10px',
                                    borderRadius: '8px',
                                    border: '2px solid',
                                    borderColor: status === 'INFO_ONLY' ? '#64748b' : '#e2e8f0',
                                    backgroundColor: status === 'INFO_ONLY' ? '#f1f5f9' : '#ffffff',
                                    color: status === 'INFO_ONLY' ? '#334155' : '#64748b',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    cursor: 'pointer',
                                    fontWeight: status === 'INFO_ONLY' ? 700 : 500,
                                    fontSize: '13px'
                                }}
                            >
                                <Info size={16} /> Informativa / No requiere
                            </button>
                        </div>
                    </div>

                    {/* Fecha y Profesional que devolvió la llamada */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                                Fecha y hora de devolución:
                            </label>
                            <input
                                type="datetime-local"
                                value={returnedAt}
                                onChange={(e) => setReturnedAt(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '10px 12px',
                                    borderRadius: '8px',
                                    border: '1px solid #cbd5e1',
                                    fontSize: '13px',
                                    color: '#0f172a',
                                    outline: 'none',
                                    boxSizing: 'border-box'
                                }}
                            />
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                                Profesional que devuelve la llamada:
                            </label>
                            <input
                                type="text"
                                value={returnedBy}
                                onChange={(e) => setReturnedBy(e.target.value)}
                                placeholder="Ej: Seyla / Ruth / Tamara..."
                                style={{
                                    width: '100%',
                                    padding: '10px 12px',
                                    borderRadius: '8px',
                                    border: '1px solid #cbd5e1',
                                    fontSize: '13px',
                                    color: '#0f172a',
                                    outline: 'none',
                                    boxSizing: 'border-box'
                                }}
                            />
                        </div>
                    </div>

                    {/* Qué se habló / Notas */}
                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                            ¿Qué se habló? / Observaciones y acuerdos tomados:
                        </label>
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            rows={4}
                            placeholder="Detalla aquí lo hablado con el paciente/familiar, si se le dio cita (fecha y hora), si requiere valoración, si se le envió información por WhatsApp, etc."
                            style={{
                                width: '100%',
                                padding: '12px',
                                borderRadius: '8px',
                                border: '1px solid #cbd5e1',
                                fontSize: '13px',
                                lineHeight: '1.5',
                                color: '#0f172a',
                                outline: 'none',
                                resize: 'vertical',
                                boxSizing: 'border-box'
                            }}
                        />
                    </div>

                    {/* Footer buttons */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isSaving}
                            style={{
                                padding: '10px 18px',
                                borderRadius: '8px',
                                border: '1px solid #cbd5e1',
                                backgroundColor: '#ffffff',
                                color: '#475569',
                                fontWeight: 600,
                                fontSize: '13px',
                                cursor: 'pointer'
                            }}
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={isSaving}
                            style={{
                                padding: '10px 22px',
                                borderRadius: '8px',
                                border: 'none',
                                backgroundColor: '#0284c7',
                                color: '#ffffff',
                                fontWeight: 700,
                                fontSize: '13px',
                                cursor: isSaving ? 'not-allowed' : 'pointer',
                                opacity: isSaving ? 0.7 : 1,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '8px'
                            }}
                        >
                            {isSaving ? 'Guardando...' : 'Guardar Reporte'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
