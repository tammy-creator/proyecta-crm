import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { getIllustrativeAvatar } from '../../modules/therapists/utils';
// import { ShieldCheck, UserRound } from 'lucide-react'; // Unused
import './IdentitySelector.css';

const IdentitySelector: React.FC = () => {
    const { user, selectIdentity } = useAuth();

    // Only show if user is logged in, is ADMIN, and has linked therapist identities
    // AND hasn't selected an identity yet in this session
    const needsSelection = 
        user?.role === 'ADMIN' && 
        user.identities && 
        user.identities.length > 0 && 
        !sessionStorage.getItem('active_identity');

    if (!needsSelection) return null;

    // Sort identities to put "Administración" first
    const sortedIdentities = [...(user.identities || [])].sort((a, b) => {
        if (a.specialty === 'Administración') return -1;
        if (b.specialty === 'Administración') return 1;
        return 0;
    });

    return (
        <div className="identity-selector-overlay">
            <div className="identity-selector-card animate-in">
                <div className="identity-selector-header">
                    <h2>¿Quién eres hoy?</h2>
                    <p>Selecciona tu perfil para personalizar tu experiencia</p>
                </div>

                <div className="identity-options">
                    {/* Sorted Options from Therapists (Staff) */}
                    {sortedIdentities.map(identity => (
                        <button 
                            key={identity.id}
                            className="identity-option-btn staff"
                            onClick={() => selectIdentity(identity.id)}
                        >
                            <div className="identity-avatar-wrapper">
                                <img 
                                    src={getIllustrativeAvatar({ fullName: identity.name, avatarUrl: identity.avatarUrl })} 
                                    alt={identity.name} 
                                    className="identity-avatar"
                                />
                            </div>
                            <div className="identity-info">
                                <span className="identity-name">{identity.name}</span>
                                <span className="identity-role">
                                    {identity.specialty === 'Administración' ? 'Personal de Administración' : 'Terapeuta / Especialista'}
                                </span>
                            </div>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default IdentitySelector;
