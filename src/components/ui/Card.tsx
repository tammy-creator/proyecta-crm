import React from 'react';
import classNames from 'classnames';
import './Card.css';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
    title?: string;
    subtitle?: string;
    action?: React.ReactNode;
    icon?: React.ReactNode;
}

const Card: React.FC<CardProps> = ({ children, className, title, subtitle, action, icon, ...props }) => {
    return (
        <div className={classNames('card', className)} {...props}>
            {(title || action || subtitle || icon) && (
                <div className="card-header">
                    <div className="flex items-center gap-2">
                        {icon && <div className="text-secondary">{icon}</div>}
                        <div>
                            {title && <h3 className="card-title">{title}</h3>}
                            {subtitle && <p className="card-subtitle text-xs text-secondary mt-1">{subtitle}</p>}
                        </div>
                    </div>
                    {action && <div className="card-action">{action}</div>}
                </div>
            )}
            <div className="card-content">
                {children}
            </div>
        </div>
    );
};

export default Card;
