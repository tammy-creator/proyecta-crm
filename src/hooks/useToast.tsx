import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import Toast from '../components/ui/Toast';
import type { ToastType } from '../components/ui/Toast';

interface ToastItem {
    id: string;
    message: string;
    type: ToastType;
    duration?: number;
}

interface ToastContextType {
    showToast: (message: string, type: ToastType, duration?: number) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<ToastItem[]>([]);
    const lastToastRef = useRef<{ message: string; time: number }>({ message: '', time: 0 });

    const showToast = useCallback((message: string, type: ToastType, duration?: number) => {
        const now = Date.now();
        if (lastToastRef.current.message === message && now - lastToastRef.current.time < 1500) {
            return;
        }
        lastToastRef.current = { message, time: now };

        const id = Math.random().toString(36).substr(2, 9);
        setToasts(prev => [...prev, { id, message, type, duration }]);
    }, []);

    const removeToast = useCallback((id: string) => {
        setToasts(prev => prev.filter(toast => toast.id !== id));
    }, []);

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            <div className="toast-container">
                {toasts.map(toast => (
                    <Toast
                        key={toast.id}
                        message={toast.message}
                        type={toast.type}
                        duration={toast.duration}
                        onClose={() => removeToast(toast.id)}
                    />
                ))}
            </div>
        </ToastContext.Provider>
    );
};

export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
};
