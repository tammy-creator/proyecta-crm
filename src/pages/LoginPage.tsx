import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Eye, EyeOff, LogIn, AlertCircle } from 'lucide-react';
import logo from '../assets/logo.jpg';
import './LoginPage.css';

const LoginPage: React.FC = () => {
    const { login } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const from = (location.state as any)?.from?.pathname || '/calendar';

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const user = await login(email, password);
            // Si es terapeuta y el destino es la raíz, forzar agenda.
            // En cualquier otro caso (si pidió una URL específica), respetar 'from'.
            const destination = (user.role === 'THERAPIST' && from === '/') ? '/calendar' : from;
            navigate(destination, { replace: true });
        } catch (err: any) {
            // Translate common Supabase errors to Spanish
            const msg = err.message || '';
            if (msg.includes('Invalid login credentials') || msg.includes('invalid_grant')) {
                setError('Email o contraseña incorrectos. Inténtalo de nuevo.');
            } else if (msg.includes('Email not confirmed')) {
                setError('Debes confirmar tu email antes de acceder.');
            } else if (msg.includes('Too many requests')) {
                setError('Demasiados intentos. Espera unos minutos antes de volver a intentarlo.');
            } else {
                setError(msg || 'Error al iniciar sesión. Contacta con el administrador.');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-page">
            {/* Background gradient */}
            <div className="login-bg" />

            <div className="login-card">
                {/* Logo / Brand */}
                <div className="login-brand" style={{ justifyContent: 'center' }}>
                    <div className="login-logo text-center w-full flex justify-center">
                        <img src={logo} alt="Proyecta Logo" className="login-logo-img" style={{ height: '80px', width: 'auto' }} />
                    </div>
                </div>

                <div className="login-divider" />

                <h2 className="login-heading">Bienvenido de nuevo</h2>
                <p className="login-desc">Accede con tu cuenta corporativa</p>

                {error && (
                    <div className="login-error">
                        <AlertCircle size={16} />
                        <span>{error}</span>
                    </div>
                )}

                <form className="login-form" onSubmit={handleSubmit}>
                    <div className="login-field">
                        <label htmlFor="email">Email</label>
                        <input
                            id="email"
                            type="email"
                            required
                            autoComplete="email"
                            placeholder="tu@proyecta.com"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            disabled={loading}
                        />
                    </div>

                    <div className="login-field">
                        <label htmlFor="password">Contraseña</label>
                        <div className="password-wrapper">
                            <input
                                id="password"
                                type={showPassword ? 'text' : 'password'}
                                required
                                autoComplete="current-password"
                                placeholder="••••••••"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                disabled={loading}
                            />
                            <button
                                type="button"
                                className="password-toggle"
                                onClick={() => setShowPassword(v => !v)}
                                tabIndex={-1}
                            >
                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                    </div>

                    <button
                        type="submit"
                        className="login-btn"
                        disabled={loading}
                    >
                        {loading ? (
                            <span className="login-spinner" />
                        ) : (
                            <LogIn size={18} />
                        )}
                        {loading ? 'Iniciando sesión...' : 'Entrar'}
                    </button>
                </form>

                <p className="login-footer">
                    ¿Problemas para acceder? Contacta con el administrador del sistema.
                </p>
            </div>
        </div>
    );
};

export default LoginPage;
