import React, { createContext, useContext, useState, type ReactNode } from 'react';

export type UserRole = 'ADMIN' | 'THERAPIST';

interface User {
    id: string;
    name: string;
    role: UserRole;
}

interface AuthContextType {
    user: User | null;
    login: (role: UserRole) => void;
    logout: () => void;
    isRole: (role: UserRole) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>({
        id: '1',
        name: 'Administrador',
        role: 'ADMIN'
    });

    const login = (role: UserRole) => {
        setUser({
            id: role === 'ADMIN' ? '1' : 't1',
            name: role === 'ADMIN' ? 'Administrador' : 'Terapeuta Ana',
            role: role
        });
    };

    const logout = () => setUser(null);

    const isRole = (role: UserRole) => user?.role === role;

    return (
        <AuthContext.Provider value={{ user, login, logout, isRole }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
