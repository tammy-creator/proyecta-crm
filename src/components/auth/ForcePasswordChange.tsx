import React, { useState } from 'react';
import { Lock, Save, Eye, EyeOff, ShieldAlert } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

const ForcePasswordChange: React.FC = () => {
    const { refreshUser, logout } = useAuth();
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showNew, setShowNew] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (newPassword !== confirmPassword) {
            setError('Las contraseñas no coinciden.');
            return;
        }

        if (newPassword.length < 6) {
            setError('La contraseña debe tener al menos 6 caracteres.');
            return;
        }

        setLoading(true);
        try {
            // 1. Update password and metadata in Supabase Auth
            const { error: authError } = await supabase.auth.updateUser({
                password: newPassword,
                data: { requires_password_change: false }
            });

            if (authError) throw authError;

            // 2. Update flag in public.user_accounts
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const { error: dbError } = await supabase
                    .from('user_accounts')
                    .update({ requires_password_change: false })
                    .eq('id', user.id);

                if (dbError) throw dbError;
            }

            // 3. Refresh user context to clear the flag
            await refreshUser();
        } catch (err: any) {
            setError(err.message || 'Error al actualizar la contraseña.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#f0f4f8',
            padding: '1rem'
        }}>
            <div className="card" style={{ maxWidth: '400px', width: '100%', padding: '2rem' }}>
                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <div style={{
                        width: '50px',
                        height: '50px',
                        background: 'rgba(26, 95, 122, 0.1)',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 1rem'
                    }}>
                        <ShieldAlert className="text-primary" size={28} />
                    </div>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1A5F7A' }}>Actualización Obligatoria</h2>
                    <p style={{ color: '#6b7280', marginTop: '0.5rem' }}>
                        Por seguridad, debes establecer una nueva contraseña en tu primer acceso.
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="modal-form">
                    {error && (
                        <div style={{
                            padding: '0.75rem',
                            background: '#fee2e2',
                            color: '#dc2626',
                            borderRadius: '8px',
                            fontSize: '0.85rem',
                            marginBottom: '1rem'
                        }}>
                            {error}
                        </div>
                    )}

                    <div className="form-group relative">
                        <label>Nueva Contraseña</label>
                        <div className="relative">
                            <input
                                type={showNew ? 'text' : 'password'}
                                required
                                value={newPassword}
                                onChange={e => setNewPassword(e.target.value)}
                                placeholder="Mínimo 6 caracteres"
                                style={{ paddingRight: '2.5rem', width: '100%' }}
                            />
                            <button
                                type="button"
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                onClick={() => setShowNew(!showNew)}
                            >
                                {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>
                    </div>

                    <div className="form-group relative" style={{ marginTop: '1rem' }}>
                        <label>Confirmar Nueva Contraseña</label>
                        <div className="relative">
                            <input
                                type={showConfirm ? 'text' : 'password'}
                                required
                                value={confirmPassword}
                                onChange={e => setConfirmPassword(e.target.value)}
                                placeholder="Repite la contraseña"
                                style={{ paddingRight: '2.5rem', width: '100%' }}
                            />
                            <button
                                type="button"
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                onClick={() => setShowConfirm(!showConfirm)}
                            >
                                {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>
                    </div>

                    <button
                        type="submit"
                        className="btn-primary"
                        disabled={loading}
                        style={{ width: '100%', marginTop: '2rem', height: '48px', justifyContent: 'center' }}
                    >
                        {loading ? 'Actualizando...' : (
                            <>
                                <Save size={18} style={{ marginRight: 8 }} />
                                Guardar y Continuar
                            </>
                        )}
                    </button>

                    <button
                        type="button"
                        className="btn-link"
                        onClick={() => logout()}
                        style={{ width: '100%', marginTop: '1rem', color: '#6b7280' }}
                    >
                        Cerrar sesión
                    </button>
                </form>
            </div>
        </div>
    );
};

export default ForcePasswordChange;
