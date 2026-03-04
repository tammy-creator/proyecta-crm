import React, { useState, useEffect } from 'react';
import {
    getCenterSettings,
    getAuditLogs,
    getUsers,
    createUser,
    updateUser,
    getServices,
    createService,
    updateService,
    deleteService,
    getReferralSourceStats
} from './service';
import { type CenterSettings, type AuditLog, type UserAccount, type ClinicalService } from './types';
import Card from '../../components/ui/Card';
import {
    Settings,
    Shield,
    Users,
    Activity,
    Save,
    Lock,
    UserPlus,
    DollarSign,
    History,
    X,
    Mail,
    User as UserIcon,
    ShieldCheck,
    Stethoscope,
    Plus,
    Trash2,
    Edit2,
    PieChart,
    BarChart3,
    TrendingUp,
    Clock
} from 'lucide-react';
import './AdminView.css';
import WorkforceReport from '../../modules/workforce/WorkforceReport';
import AnalyticsDashboard from '../../modules/analytics/AnalyticsDashboard';

const AdminView: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'center' | 'users' | 'services' | 'security' | 'reports' | 'workforce' | 'analytics'>('center');
    // ...
    const [settings, setSettings] = useState<CenterSettings | null>(null);
    const [users, setUsers] = useState<UserAccount[]>([]);
    const [services, setServices] = useState<ClinicalService[]>([]);
    const [referralStats, setReferralStats] = useState<{ source: string, count: number, percentage: number }[]>([]);
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [loading, setLoading] = useState(true);

    // User Modal state
    const [isUserModalOpen, setIsUserModalOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState<Partial<UserAccount> | null>(null);

    // Service Modal state
    const [isServiceModalOpen, setIsServiceModalOpen] = useState(false);
    const [selectedService, setSelectedService] = useState<Partial<ClinicalService> | null>(null);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        const [settingsData, usersData, logsData, servicesData, statsData] = await Promise.all([
            getCenterSettings(),
            getUsers(),
            getAuditLogs(),
            getServices(),
            getReferralSourceStats()
        ]);
        setSettings(settingsData);
        setUsers(usersData);
        setLogs(logsData);
        setServices(servicesData);
        setReferralStats(statsData);
        setLoading(false);
    };

    const handleOpenUserModal = (user?: UserAccount) => {
        if (user) {
            setSelectedUser({ ...user });
        } else {
            setSelectedUser({
                fullName: '',
                email: '',
                role: 'Therapist',
                status: 'Active'
            });
        }
        setIsUserModalOpen(true);
    };

    const handleSaveUser = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedUser) return;

        if (selectedUser.id) {
            await updateUser(selectedUser as UserAccount);
        } else {
            await createUser(selectedUser as Omit<UserAccount, 'id' | 'lastAccess'>);
        }

        setIsUserModalOpen(false);
        fetchData();
    };

    const handleOpenServiceModal = (service?: ClinicalService) => {
        if (service) {
            setSelectedService({ ...service });
        } else {
            setSelectedService({
                name: '',
                price: 0
            });
        }
        setIsServiceModalOpen(true);
    };

    const handleSaveService = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedService) return;

        if (selectedService.id) {
            await updateService(selectedService as ClinicalService);
        } else {
            await createService(selectedService as Omit<ClinicalService, 'id'>);
        }

        setIsServiceModalOpen(false);
        fetchData();
    };

    const handleDeleteService = async (id: string) => {
        if (window.confirm('¿Estás seguro de que quieres eliminar este servicio?')) {
            await deleteService(id);
            fetchData();
        }
    };

    if (loading) return <div className="loading">Cargando configuración del sistema...</div>;

    return (
        <div className="admin-container">
            <div className="page-header">
                <div>
                    <h2 className="page-title">Administración Central</h2>
                    <p className="page-subtitle">Configuración del centro, equipo y catálogo</p>
                </div>
            </div>

            <div className="admin-tabs" style={{ marginTop: '2rem' }}>
                <button
                    className={`tab-btn ${activeTab === 'center' ? 'active' : ''}`}
                    onClick={() => setActiveTab('center')}
                >
                    <Settings size={18} style={{ marginRight: 8, verticalAlign: 'middle' }} />
                    Datos del Centro
                </button>
                <button
                    className={`tab-btn ${activeTab === 'analytics' ? 'active' : ''}`}
                    onClick={() => setActiveTab('analytics')}
                >
                    <BarChart3 size={18} style={{ marginRight: 8, verticalAlign: 'middle' }} />
                    Analítica
                </button>
                <button
                    className={`tab-btn ${activeTab === 'workforce' ? 'active' : ''}`}
                    onClick={() => setActiveTab('workforce')}
                >
                    <Clock size={18} style={{ marginRight: 8, verticalAlign: 'middle' }} />
                    Control Horario
                </button>
                <button
                    className={`tab-btn ${activeTab === 'services' ? 'active' : ''}`}
                    onClick={() => setActiveTab('services')}
                >
                    <Stethoscope size={18} style={{ marginRight: 8, verticalAlign: 'middle' }} />
                    Catálogo de Servicios
                </button>
                <button
                    className={`tab-btn ${activeTab === 'users' ? 'active' : ''}`}
                    onClick={() => setActiveTab('users')}
                >
                    <Users size={18} style={{ marginRight: 8, verticalAlign: 'middle' }} />
                    Equipo y Roles
                </button>
                <button
                    className={`tab-btn ${activeTab === 'security' ? 'active' : ''}`}
                    onClick={() => setActiveTab('security')}
                >
                    <Shield size={18} style={{ marginRight: 8, verticalAlign: 'middle' }} />
                    Seguridad y Logs
                </button>
                <button
                    className={`tab-btn ${activeTab === 'reports' ? 'active' : ''}`}
                    onClick={() => setActiveTab('reports')}
                >
                    <BarChart3 size={18} style={{ marginRight: 8, verticalAlign: 'middle' }} />
                    Marketing
                </button>
            </div>

            <div className="admin-content">
                {activeTab === 'analytics' && <AnalyticsDashboard />}

                {activeTab === 'workforce' && (
                    <div className="admin-section">
                        <div className="flex justify-between items-center mb-4">
                            <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Registro de Jornada Laboral</h3>
                        </div>
                        <WorkforceReport />
                    </div>
                )}

                {activeTab === 'reports' && (
                    <div className="admin-section">
                        <div className="flex justify-between items-center mb-6">
                            <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Análisis de Origen de Pacientes</h3>
                            <button className="btn-secondary flex gap-2" onClick={() => fetchData()}>
                                <TrendingUp size={16} /> Actualizar Datos
                            </button>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
                            <Card title="Distribución por Canal">
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                    {referralStats.map((stat, idx) => (
                                        <div key={idx}>
                                            <div className="flex justify-between text-sm mb-1">
                                                <span style={{ fontWeight: 500 }}>{stat.source}</span>
                                                <span style={{ color: 'var(--color-text-secondary)' }}>{stat.count} pacientes ({stat.percentage}%)</span>
                                            </div>
                                            <div style={{ height: '8px', backgroundColor: '#f0f0f0', borderRadius: '4px', overflow: 'hidden' }}>
                                                <div
                                                    style={{
                                                        height: '100%',
                                                        width: `${stat.percentage}%`,
                                                        backgroundColor: `hsl(${200 + idx * 25}, 70%, 50%)`,
                                                        borderRadius: '4px'
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </Card>

                            <Card title="Resumen de Captación">
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '0.5rem 0' }}>
                                    <div className="flex items-center gap-4 p-4 rounded-xl" style={{ backgroundColor: '#EEF6FB' }}>
                                        <div className="p-3 rounded-lg" style={{ backgroundColor: 'white', color: '#1A5F7A' }}><PieChart size={24} /></div>
                                        <div>
                                            <div style={{ fontSize: '0.8rem', color: '#5C8DAB', fontWeight: 600 }}>CANAL PRINCIPAL</div>
                                            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#1A5F7A' }}>Instagram (35%)</div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4 p-4 rounded-xl" style={{ backgroundColor: '#F0F9F4' }}>
                                        <div className="p-3 rounded-lg" style={{ backgroundColor: 'white', color: '#2C7A7B' }}><TrendingUp size={24} /></div>
                                        <div>
                                            <div style={{ fontSize: '0.8rem', color: '#4FD1C5', fontWeight: 600 }}>TENDENCIA</div>
                                            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#2C7A7B' }}>+12% este mes</div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4 p-4 rounded-xl" style={{ backgroundColor: '#FFF5F5' }}>
                                        <div className="p-3 rounded-lg" style={{ backgroundColor: 'white', color: '#C53030' }}><Activity size={24} /></div>
                                        <div>
                                            <div style={{ fontSize: '0.8rem', color: '#E53E3E', fontWeight: 600 }}>FUENTES ACTIVAS</div>
                                            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#C53030' }}>6 Canales</div>
                                        </div>
                                    </div>
                                </div>
                            </Card>
                        </div>
                    </div>
                )}

                {activeTab === 'center' && settings && (
                    <div className="admin-section">
                        <Card title="Ajustes Generales" action={<button className="btn-primary"><Save size={16} /> Guardar</button>}>
                            <form className="settings-form">
                                <div className="form-group">
                                    <label>Nombre del Centro</label>
                                    <input type="text" defaultValue={settings.name} />
                                </div>
                                <div className="form-group">
                                    <label>CIF / NIF</label>
                                    <input type="text" defaultValue={settings.cif} />
                                </div>
                                <div className="form-group">
                                    <label>Teléfono de Contacto</label>
                                    <input type="text" defaultValue={settings.phone} />
                                </div>
                                <div className="form-group">
                                    <label>Email Corporativo</label>
                                    <input type="text" defaultValue={settings.email} />
                                </div>
                                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                                    <label>Dirección Física</label>
                                    <input type="text" defaultValue={settings.address} />
                                </div>
                            </form>
                        </Card>
                    </div>
                )}

                {activeTab === 'services' && (
                    <div className="admin-section">
                        <div className="flex justify-between items-center mb-4">
                            <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Servicios y Precios</h3>
                            <button className="btn-secondary flex gap-2" onClick={() => handleOpenServiceModal()}>
                                <Plus size={16} /> Nuevo Servicio
                            </button>
                        </div>
                        <div className="billing-table-wrapper">
                            <table className="billing-table">
                                <thead>
                                    <tr>
                                        <th>Nombre del Servicio</th>
                                        <th>Precio / Sesión</th>
                                        <th>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {services.map(service => (
                                        <tr key={service.id}>
                                            <td style={{ fontWeight: 600 }}>{service.name}</td>
                                            <td>{service.price}€</td>
                                            <td>
                                                <div className="flex gap-2">
                                                    <button className="btn-icon-round" onClick={() => handleOpenServiceModal(service)}><Edit2 size={16} /></button>
                                                    <button className="btn-icon-round" style={{ color: 'var(--color-error)' }} onClick={() => handleDeleteService(service.id)}><Trash2 size={16} /></button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeTab === 'users' && (
                    <div className="admin-section">
                        <div className="flex justify-between items-center mb-4">
                            <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Cuentas de Acceso</h3>
                            <button className="btn-secondary flex gap-2" onClick={() => handleOpenUserModal()}>
                                <UserPlus size={16} /> Añadir Usuario
                            </button>
                        </div>
                        <div className="billing-table-wrapper">
                            <table className="billing-table">
                                <thead>
                                    <tr>
                                        <th>Usuario</th>
                                        <th>Rol</th>
                                        <th>Estado</th>
                                        <th>Último Acceso</th>
                                        <th>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {users.map(user => (
                                        <tr key={user.id}>
                                            <td style={{ fontWeight: 600 }}>{user.fullName}</td>
                                            <td><span className={`badge ${user.role === 'Admin' ? 'badge-info' : 'badge-warning'}`}>{user.role}</span></td>
                                            <td><span className={`badge ${user.status === 'Active' ? 'badge-success' : 'badge-error'}`}>{user.status}</span></td>
                                            <td style={{ fontSize: '0.85rem' }}>{user.lastAccess ? new Date(user.lastAccess).toLocaleString('es-ES') : 'Nunca'}</td>
                                            <td><button className="btn-link" onClick={() => handleOpenUserModal(user)}>Gestionar</button></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeTab === 'security' && (
                    <div className="admin-section">
                        <div className="flex justify-between items-center mb-4">
                            <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Trazabilidad de Acciones</h3>
                            <div className="flex gap-2">
                                <button className="btn-icon-round" title="Filtrar"><History size={18} /></button>
                                <button className="btn-icon-round" title="Bloqueo Global"><Lock size={18} /></button>
                            </div>
                        </div>
                        <div className="audit-log-list">
                            {logs.map(log => (
                                <div key={log.id} className="log-item">
                                    <div className={`log-icon ${log.category === 'billing' ? 'status-positive' : log.category === 'auth' ? 'status-neutral' : 'status-attention'}`}>
                                        {log.category === 'billing' ? <DollarSign size={20} /> : log.category === 'auth' ? <Shield size={20} /> : <Activity size={20} />}
                                    </div>
                                    <div className="log-content">
                                        <div className="log-header">
                                            <span className="log-user">{log.userName}</span>
                                            <span className="log-time">{new Date(log.timestamp).toLocaleString('es-ES')}</span>
                                        </div>
                                        <div className="log-action">{log.action}</div>
                                        {log.details && <div className="log-details">{log.details}</div>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {isUserModalOpen && selectedUser && (
                <div className="modal-overlay">
                    <div className="modal-content" style={{ maxWidth: '450px' }}>
                        <div className="modal-header">
                            <div className="flex items-center gap-2">
                                <ShieldCheck size={20} className="text-secondary" />
                                <h3>{selectedUser.id ? 'Gestionar Cuenta' : 'Nueva Cuenta de Acceso'}</h3>
                            </div>
                            <button className="btn-icon-round" onClick={() => setIsUserModalOpen(false)}>
                                <X size={20} />
                            </button>
                        </div>
                        <form className="modal-form" onSubmit={handleSaveUser}>
                            <div className="form-group">
                                <label><UserIcon size={14} style={{ marginRight: 6 }} /> Nombre Completo</label>
                                <input
                                    type="text"
                                    required
                                    value={selectedUser.fullName || ''}
                                    onChange={e => setSelectedUser({ ...selectedUser, fullName: e.target.value })}
                                    placeholder="Ej. Juan Pérez"
                                />
                            </div>
                            <div className="form-group">
                                <label><Mail size={14} style={{ marginRight: 6 }} /> Email Corporativo</label>
                                <input
                                    type="email"
                                    required
                                    value={selectedUser.email || ''}
                                    onChange={e => setSelectedUser({ ...selectedUser, email: e.target.value })}
                                    placeholder="ejemplo@proyecta.com"
                                />
                            </div>
                            <div className="flex gap-4">
                                <div className="form-group" style={{ flex: 1 }}>
                                    <label>Rol asignado</label>
                                    <select
                                        value={selectedUser.role}
                                        onChange={e => setSelectedUser({ ...selectedUser, role: e.target.value as any })}
                                    >
                                        <option value="Admin">Admin</option>
                                        <option value="Therapist">Terapeuta</option>
                                    </select>
                                </div>
                                <div className="form-group" style={{ flex: 1 }}>
                                    <label>Estado de cuenta</label>
                                    <select
                                        value={selectedUser.status}
                                        onChange={e => setSelectedUser({ ...selectedUser, status: e.target.value as any })}
                                    >
                                        <option value="Active">Activo</option>
                                        <option value="Inactive">Inactivo</option>
                                    </select>
                                </div>
                            </div>
                            <div className="modal-footer" style={{ marginTop: '2rem' }}>
                                <button type="button" className="btn-secondary" onClick={() => setIsUserModalOpen(false)}>
                                    Cancelar
                                </button>
                                <button type="submit" className="btn-primary">
                                    {selectedUser.id ? 'Guardar Cambios' : 'Crear Usuario'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {isServiceModalOpen && selectedService && (
                <div className="modal-overlay">
                    <div className="modal-content" style={{ maxWidth: '400px' }}>
                        <div className="modal-header">
                            <div className="flex items-center gap-2">
                                <Stethoscope size={20} className="text-secondary" />
                                <h3>{selectedService.id ? 'Editar Servicio' : 'Nuevo Servicio'}</h3>
                            </div>
                            <button className="btn-icon-round" onClick={() => setIsServiceModalOpen(false)}>
                                <X size={20} />
                            </button>
                        </div>
                        <form className="modal-form" onSubmit={handleSaveService}>
                            <div className="form-group">
                                <label>Nombre del Servicio</label>
                                <input
                                    type="text"
                                    required
                                    value={selectedService.name || ''}
                                    onChange={e => setSelectedService({ ...selectedService, name: e.target.value })}
                                    placeholder="Ej. Terapia Ocupacional"
                                />
                            </div>
                            <div className="form-group">
                                <label>Precio por sesión (€)</label>
                                <input
                                    type="number"
                                    required
                                    value={selectedService.price || ''}
                                    onChange={e => setSelectedService({ ...selectedService, price: Number(e.target.value) })}
                                    placeholder="Ej. 60"
                                />
                            </div>
                            <div className="modal-footer" style={{ marginTop: '2rem' }}>
                                <button type="button" className="btn-secondary" onClick={() => setIsServiceModalOpen(false)}>
                                    Cancelar
                                </button>
                                <button type="submit" className="btn-primary">
                                    {selectedService.id ? 'Actualizar' : 'Crear Servicio'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminView;
