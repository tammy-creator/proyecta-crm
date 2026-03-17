import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Users, UserRound, Calendar, ShieldCheck, FileText, Clock } from 'lucide-react';
import './Sidebar.css';
import { useAuth } from '../../context/AuthContext';

import logo from '../../assets/logo.jpg';

const Sidebar: React.FC = () => {
    const { user } = useAuth();

    const navGroups = [
        {
            title: 'General',
            items: [
                { path: '/dashboard', icon: <LayoutDashboard size={20} />, label: 'Dashboard', roles: ['ADMIN'] },
                { path: '/calendar', icon: <Calendar size={20} />, label: 'Agenda', roles: ['ADMIN', 'THERAPIST'] },
            ]
        },
        {
            title: 'Gestión Clínica',
            items: [
                { path: '/patients', icon: <Users size={20} />, label: 'Pacientes', roles: ['ADMIN', 'THERAPIST'] },
                { path: '/waiting-list', icon: <Clock size={20} />, label: 'Lista de Espera', roles: ['ADMIN', 'THERAPIST'] },
            ]
        },
        {
            title: 'Administración',
            items: [
                { path: '/therapists', icon: <UserRound size={20} />, label: 'Terapeutas', roles: ['ADMIN'] },
                { path: '/billing', icon: <FileText size={20} />, label: 'Facturación', roles: ['ADMIN'] },
                { path: '/admin', icon: <ShieldCheck size={20} />, label: 'Configuración', roles: ['ADMIN'] },
            ]
        }
    ];

    return (
        <aside className="sidebar">
            <div className="sidebar-header">
                <img src={logo} alt="Proyecta Logo" className="sidebar-logo-img" />
            </div>

            <nav className="sidebar-nav">
                {navGroups.map((group, groupIndex) => {
                    const filteredItems = group.items.filter(item => item.roles.includes(user?.role || ''));
                    if (filteredItems.length === 0) return null;

                    return (
                        <div key={groupIndex} className="nav-group">
                            {group.title && <div className="nav-group-title">{group.title}</div>}
                            {filteredItems.map((item) => (
                                <NavLink
                                    key={item.path}
                                    to={item.path}
                                    className={({ isActive }) =>
                                        `nav-item ${isActive ? 'active' : ''}`
                                    }
                                >
                                    <span className="nav-icon">{item.icon}</span>
                                    <span className="nav-label">{item.label}</span>
                                </NavLink>
                            ))}
                        </div>
                    );
                })}
            </nav>
        </aside>
    );
};

export default Sidebar;
