import React, { useState } from 'react';
import { X, Lock, Eye, EyeOff, Save } from 'lucide-react';
import { adminResetPassword } from '../../modules/therapists/service';

interface AdminChangePasswordModalProps {
    therapistId: string;
    therapistName: string;
    onClose: () => void;
}

const AdminChangePasswordModal: React.FC<AdminChangePasswordModalProps> = ({ therapistId, therapistName, onClose }) => {
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [loading, setLoading] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');

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
            await adminResetPassword(therapistId, newPassword);
            setSuccess(`Contraseña de ${therapistName} actualizada correctamente.`);
            setTimeout(() => onClose(), 1500);
        } catch (err: any) {
            console.error('Password change error:', err);
            
            // Extract status from different possible formats in Supabase SDK errors
            const status = err.status || (err as any).context?.status || (err as any).statusCode;
            const message = err.message || 'Error al cambiar la contraseña.';

            if (status === 401 || message.includes('401')) {
                setError('Error 401: Sesión no autorizada o expirada. Intenta cerrar sesión y volver a entrar.');
            } else if (status === 403 || message.includes('403')) {
                setError('Error 403: No tienes permisos de administrador para realizar esta acción.');
            } else if (status === 404 || message.includes('404')) {
                setError('Error 404: La función no se encuentra en el servidor. Verifica el despliegue.');
            } else {
                setError(message);
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content" style={{ maxWidth: '420px' }}>
                <div className="modal-header">
                    <div className="flex items-center gap-2">
                        <Lock size={20} className="text-primary" />
                        <h3>Cambiar Contraseña</h3>
                    </div>
                    <button className="btn-icon-round" onClick={onClose}><X size={20} /></button>
                </div>

                <div style={{ padding: '0.5rem 0 1rem', color: '#6b7280', fontSize: '0.9rem' }}>
                    Establecer nueva contraseña para <strong>{therapistName}</strong>
                </div>

                <form className="modal-form" onSubmit={handleSubmit}>
                    {error && <div className="p-3 mb-4 rounded bg-red-50 text-red-600 text-sm">{error}</div>}
                    {success && <div className="p-3 mb-4 rounded bg-green-50 text-green-600 text-sm">{success}</div>}

                    <div className="form-group relative">
                        <label>Nueva Contraseña</label>
                        <input
                            type={showNew ? 'text' : 'password'}
                            required
                            value={newPassword}
                            onChange={e => setNewPassword(e.target.value)}
                            placeholder="Mínimo 6 caracteres"
                            style={{ paddingRight: '2.5rem' }}
                        />
                        <button
                            type="button"
                            className="absolute right-3 top-[34px] text-gray-400 hover:text-gray-600"
                            onClick={() => setShowNew(!showNew)}
                        >
                            {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                    </div>

                    <div className="form-group relative">
                        <label>Confirmar Contraseña</label>
                        <input
                            type={showConfirm ? 'text' : 'password'}
                            required
                            value={confirmPassword}
                            onChange={e => setConfirmPassword(e.target.value)}
                            placeholder="Repite la contraseña"
                            style={{ paddingRight: '2.5rem' }}
                        />
                        <button
                            type="button"
                            className="absolute right-3 top-[34px] text-gray-400 hover:text-gray-600"
                            onClick={() => setShowConfirm(!showConfirm)}
                        >
                            {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                    </div>

                    <div className="modal-footer mt-6">
                        <button type="button" className="btn-secondary" onClick={onClose} disabled={loading}>
                            Cancelar
                        </button>
                        <button type="submit" className="btn-primary" disabled={loading}>
                            <Save size={16} />
                            {loading ? 'Guardando...' : 'Establecer Contraseña'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default AdminChangePasswordModal;
