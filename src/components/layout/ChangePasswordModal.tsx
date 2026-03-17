import React, { useState } from 'react';
import { X, Lock, Eye, EyeOff, Save } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { changePassword } from '../../modules/therapists/service';

interface ChangePasswordModalProps {
    onClose: () => void;
}

const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({ onClose }) => {
    const { user } = useAuth();
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [loading, setLoading] = useState(false);

    const [showCurrent, setShowCurrent] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        if (newPassword !== confirmPassword) {
            setError('Las nuevas contraseñas no coinciden.');
            return;
        }

        if (newPassword.length < 6) {
            setError('La nueva contraseña debe tener al menos 6 caracteres.');
            return;
        }

        if (!user || user.role !== 'THERAPIST') {
            setError('Solo los terapeutas pueden cambiar su contraseña por esta vía.');
            return;
        }

        setLoading(true);
        try {
            await changePassword(user.id, currentPassword, newPassword);
            setSuccess('Contraseña actualizada correctamente.');
            setTimeout(() => {
                onClose();
            }, 1500);
        } catch (err: any) {
            setError(err.message || 'Error al cambiar la contraseña.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content" style={{ maxWidth: '400px' }}>
                <div className="modal-header">
                    <div className="flex items-center gap-2">
                        <Lock size={20} className="text-primary" />
                        <h3>Cambiar Contraseña</h3>
                    </div>
                    <button className="btn-icon-round" onClick={onClose}><X size={20} /></button>
                </div>

                <form className="modal-form" onSubmit={handleSubmit}>
                    {error && <div className="p-3 mb-4 rounded bg-red-50 text-red-600 text-sm">{error}</div>}
                    {success && <div className="p-3 mb-4 rounded bg-green-50 text-green-600 text-sm">{success}</div>}

                    <div className="form-group relative">
                        <label>Contraseña Actual</label>
                        <input
                            type={showCurrent ? "text" : "password"}
                            required
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            style={{ paddingRight: '2.5rem' }}
                        />
                        <button
                            type="button"
                            className="absolute right-3 top-[34px] text-gray-400 hover:text-gray-600"
                            onClick={() => setShowCurrent(!showCurrent)}
                        >
                            {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                    </div>

                    <div className="form-group relative">
                        <label>Nueva Contraseña</label>
                        <input
                            type={showNew ? "text" : "password"}
                            required
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
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
                        <label>Confirmar Nueva Contraseña</label>
                        <input
                            type={showConfirm ? "text" : "password"}
                            required
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
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
                            <Save size={16} /> {/* Replace with Spinner if preferred */}
                            {loading ? 'Guardando...' : 'Cambiar Contraseña'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ChangePasswordModal;
