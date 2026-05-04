import React, { useState, useEffect } from 'react';
import { X, UserPlus, Phone, Mail, Calendar as CalendarIcon, ClipboardList } from 'lucide-react';
import { type Patient } from './types';
import { createPatient } from './service';
import { useToast } from '../../hooks/useToast';

interface QuickPatientModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: (patient: Patient) => void;
    initialName?: string;
}

const QuickPatientModal: React.FC<QuickPatientModalProps> = ({ isOpen, onClose, onSuccess, initialName = '' }) => {
    const { showToast } = useToast();
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');
    const [birthDate, setBirthDate] = useState('');
    const [notes, setNotes] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen && initialName) {
            const parts = initialName.trim().split(/\s+/);
            setFirstName(parts[0] || '');
            setLastName(parts.slice(1).join(' ') || '');
        } else if (isOpen) {
            setFirstName('');
            setLastName('');
            setPhone('');
            setEmail('');
            setBirthDate('');
            setNotes('');
        }
    }, [isOpen, initialName]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const newPatient = await createPatient({
                firstName,
                lastName,
                phone,
                email,
                birthDate,
                status: 'Activo',
                schooling: '',
                address: '',
                dni: '',
                allergies: '',
                referralSource: '',
                notes: notes || 'Creado desde calendario',
                consentLopd: false,
                consentMarketing: false,
                resenaClic: false,
                tutor1: { firstName: '', lastName: '', dni: '', job: '', phone: '', email: '' }
            });
            showToast('Paciente creado correctamente', 'success');
            onSuccess(newPatient);
            onClose();
        } catch (error: any) {
            console.error("Error creating patient:", error);
            showToast(`Error al crear: ${error.message || 'Error de servidor'}`, 'error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 20000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(15, 23, 42, 0.4)',
            backdropFilter: 'blur(8px)',
            padding: '1rem',
            animation: 'fadeInQuick 0.2s ease-out'
        }}>
            <div style={{
                backgroundColor: 'white',
                borderRadius: '24px',
                width: '100%',
                maxWidth: '500px',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                overflow: 'hidden',
                animation: 'modalSlideUpQuick 0.3s ease-out'
            }}>
                <div style={{
                    padding: '1.5rem',
                    borderBottom: '1px solid #f1f5f9',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: 'linear-gradient(to right, #f8fafc, #fff)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '12px',
                            backgroundColor: '#eff6ff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#2563eb'
                        }}>
                            <UserPlus size={20} />
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#1e293b' }}>Nuevo Paciente</h3>
                            <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b' }}>Alta rápida desde calendario</p>
                        </div>
                    </div>
                    <button onClick={onClose} style={{
                        padding: '8px',
                        borderRadius: '50%',
                        border: 'none',
                        background: 'none',
                        cursor: 'pointer',
                        color: '#94a3b8',
                        transition: 'all 0.2s'
                    }} onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f1f5f9'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} style={{ padding: '1.5rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Nombre *</label>
                            <input 
                                required
                                type="text"
                                value={firstName}
                                onChange={e => setFirstName(e.target.value)}
                                placeholder="Ej: Alejandro"
                                style={{
                                    padding: '10px 12px',
                                    borderRadius: '10px',
                                    border: '1px solid #e2e8f0',
                                    fontSize: '0.9rem',
                                    outline: 'none',
                                    backgroundColor: '#f8fafc',
                                    transition: 'all 0.2s'
                                }}
                            />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Apellidos</label>
                            <input 
                                type="text"
                                value={lastName}
                                onChange={e => setLastName(e.target.value)}
                                placeholder="Ej: Fernández"
                                style={{
                                    padding: '10px 12px',
                                    borderRadius: '10px',
                                    border: '1px solid #e2e8f0',
                                    fontSize: '0.9rem',
                                    outline: 'none',
                                    backgroundColor: '#f8fafc',
                                    transition: 'all 0.2s'
                                }}
                            />
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Teléfono</label>
                            <div style={{ position: 'relative' }}>
                                <Phone size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                                <input 
                                    type="tel"
                                    value={phone}
                                    onChange={e => setPhone(e.target.value)}
                                    placeholder="600 000 000"
                                    style={{
                                        width: '100%',
                                        padding: '10px 12px 10px 36px',
                                        borderRadius: '10px',
                                        border: '1px solid #e2e8f0',
                                        fontSize: '0.9rem',
                                        outline: 'none',
                                        backgroundColor: '#f8fafc',
                                        boxSizing: 'border-box'
                                    }}
                                />
                            </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Email</label>
                            <div style={{ position: 'relative' }}>
                                <Mail size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                                <input 
                                    type="email"
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    placeholder="correo@ejemplo.com"
                                    style={{
                                        width: '100%',
                                        padding: '10px 12px 10px 36px',
                                        borderRadius: '10px',
                                        border: '1px solid #e2e8f0',
                                        fontSize: '0.9rem',
                                        outline: 'none',
                                        backgroundColor: '#f8fafc',
                                        boxSizing: 'border-box'
                                    }}
                                />
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                         <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Fecha de Nacimiento</label>
                            <div style={{ position: 'relative' }}>
                                <CalendarIcon size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                                <input 
                                    type="date"
                                    value={birthDate}
                                    onChange={e => setBirthDate(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '10px 12px 10px 36px',
                                        borderRadius: '10px',
                                        border: '1px solid #e2e8f0',
                                        fontSize: '0.9rem',
                                        outline: 'none',
                                        backgroundColor: '#f8fafc',
                                        boxSizing: 'border-box'
                                    }}
                                />
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '1.5rem' }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Notas / Motivo</label>
                        <div style={{ position: 'relative' }}>
                            <ClipboardList size={14} style={{ position: 'absolute', left: '12px', top: '14px', color: '#94a3b8' }} />
                            <textarea 
                                value={notes}
                                onChange={e => setNotes(e.target.value)}
                                placeholder="Añade notas adicionales..."
                                style={{
                                    width: '100%',
                                    padding: '10px 12px 10px 36px',
                                    borderRadius: '10px',
                                    border: '1px solid #e2e8f0',
                                    fontSize: '0.9rem',
                                    outline: 'none',
                                    backgroundColor: '#f8fafc',
                                    minHeight: '80px',
                                    resize: 'none',
                                    boxSizing: 'border-box'
                                }}
                            />
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '12px' }}>
                        <button 
                            type="button"
                            onClick={onClose}
                            style={{
                                flex: 1,
                                padding: '12px',
                                borderRadius: '12px',
                                border: '1px solid #e2e8f0',
                                backgroundColor: 'white',
                                color: '#64748b',
                                fontWeight: 700,
                                fontSize: '0.9rem',
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                            }}
                        >
                            Cancelar
                        </button>
                        <button 
                            type="submit"
                            disabled={loading || !firstName}
                            style={{
                                flex: 2,
                                padding: '12px',
                                borderRadius: '12px',
                                border: 'none',
                                backgroundColor: '#2563eb',
                                color: 'white',
                                fontWeight: 700,
                                fontSize: '0.9rem',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                opacity: (loading || !firstName) ? 0.5 : 1,
                                boxShadow: '0 4px 12px rgba(37, 99, 235, 0.2)'
                            }}
                        >
                            {loading ? 'Creando...' : 'Crear y Seleccionar'}
                        </button>
                    </div>
                </form>
            </div>
            <style dangerouslySetInnerHTML={{ __html: `
                @keyframes modalSlideUpQuick {
                    from { opacity: 0; transform: translateY(20px) scale(0.95); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }
                @keyframes fadeInQuick {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
            `}} />
        </div>
    );
};

export default QuickPatientModal;
