import React from 'react';
import classNames from 'classnames';
import { Info } from 'lucide-react';
import './Card.css';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
    title?: string;
    subtitle?: string;
    action?: React.ReactNode;
    icon?: React.ReactNode;
    showInfo?: boolean;
    onInfoClick?: (e: React.MouseEvent) => void;
}

const Card: React.FC<CardProps> = ({ children, className, title, subtitle, action, icon, showInfo, onInfoClick, ...props }) => {
    return (
        <div className={classNames('card', className)} {...props}>
            {(title || action || subtitle || icon || showInfo) && (
                <div className="modal-header-container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {icon && <div className="text-secondary">{icon}</div>}
                        <div>
                            {title && <h3 className="card-title">{title}</h3>}
                            {subtitle && <p className="card-subtitle text-xs text-secondary mt-1">{subtitle}</p>}
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {showInfo && (
                            <button 
                                className="card-info-btn" 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onInfoClick?.(e);
                                }}
                                title="Más información"
                            >
                                <Info size={16} />
                            </button>
                        )}
                        {action && <div className="card-action">{action}</div>}
                    </div>
                </div>
            )}
            <div className="card-content">
                {children}
            </div>
        </div>
    );
};

export default Card;
