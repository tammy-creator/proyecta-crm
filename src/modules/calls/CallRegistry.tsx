import React, { useState, useEffect, useMemo } from 'react';
import type { ClaraCall, CallStatus } from './types';
import { getClaraCalls, formatPhoneDisplay } from './service';
import { CallModal } from './CallModal';
import {
    Phone,
    PhoneCall,
    PhoneForwarded,
    CheckCircle,
    Clock,
    AlertTriangle,
    Info,
    Search,
    RefreshCw,
    User,
    Calendar,
    MessageSquare,
    Copy,
    Check,
    FileEdit
} from 'lucide-react';
import { format, isToday, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import './CallRegistry.css';

export const CallRegistry: React.FC = () => {
    const [calls, setCalls] = useState<ClaraCall[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedCall, setSelectedCall] = useState<ClaraCall | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [copiedId, setCopiedId] = useState<string | null>(null);

    // Filtros
    const [filterStatus, setFilterStatus] = useState<string>('ALL');
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [dateRange, setDateRange] = useState<'ALL' | 'TODAY' | 'WEEK' | 'MONTH'>('ALL');

    const loadCalls = async () => {
        setLoading(true);
        try {
            const data = await getClaraCalls();
            setCalls(data);
        } catch (error) {
            console.error('Error loading calls:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadCalls();

        const handleCallsUpdated = () => {
            loadCalls();
        };

        window.addEventListener('calls-updated', handleCallsUpdated);
        return () => window.removeEventListener('calls-updated', handleCallsUpdated);
    }, []);

    // KPIs
    const stats = useMemo(() => {
        const total = calls.length;
        const pending = calls.filter(c => c.tracking?.status === 'PENDING').length;
        const returned = calls.filter(c => c.tracking?.status === 'RETURNED').length;
        const todayCount = calls.filter(c => isToday(new Date(c.date))).length;

        return { total, pending, returned, todayCount };
    }, [calls]);

    // Filtrado
    const filteredCalls = useMemo(() => {
        return calls.filter(call => {
            // 1. Filtro por estado
            if (filterStatus !== 'ALL') {
                if (call.tracking?.status !== filterStatus) return false;
            }

            // 2. Filtro temporal
            if (dateRange === 'TODAY' && !isToday(new Date(call.date))) {
                return false;
            }
            if (dateRange === 'WEEK') {
                const weekAgo = subDays(new Date(), 7);
                if (new Date(call.date) < weekAgo) return false;
            }
            if (dateRange === 'MONTH') {
                const monthAgo = subDays(new Date(), 30);
                if (new Date(call.date) < monthAgo) return false;
            }

            // 3. Búsqueda por texto
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase().trim();
                const phone = (call.phone || '').toLowerCase();
                const patient = (call.patientName || '').toLowerCase();
                const summary = (call.summary || '').toLowerCase();
                const notes = (call.tracking?.notes || '').toLowerCase();
                const returnedBy = (call.tracking?.returnedBy || '').toLowerCase();

                if (!phone.includes(q) && !patient.includes(q) && !summary.includes(q) && !notes.includes(q) && !returnedBy.includes(q)) {
                    return false;
                }
            }

            return true;
        });
    }, [calls, filterStatus, dateRange, searchQuery]);

    const handleCopy = (id: string, text: string) => {
        navigator.clipboard.writeText(text);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const handleOpenModal = (call: ClaraCall) => {
        setSelectedCall(call);
        setIsModalOpen(true);
    };

    const renderStatusBadge = (status?: CallStatus) => {
        switch (status) {
            case 'PENDING':
                return (
                    <span className="call-status-badge pending">
                        <Clock size={12} /> Pendiente de devolver
                    </span>
                );
            case 'RETURNED':
                return (
                    <span className="call-status-badge returned">
                        <CheckCircle size={12} /> Llamada devuelta
                    </span>
                );
            case 'NO_ANSWER':
                return (
                    <span className="call-status-badge no-answer">
                        <AlertTriangle size={12} /> No contesta / Reintentar
                    </span>
                );
            case 'INFO_ONLY':
            default:
                return (
                    <span className="call-status-badge info">
                        <Info size={12} /> Informativa / No requiere
                    </span>
                );
        }
    };

    return (
        <div className="call-registry-container">
            {/* Header */}
            <div className="call-registry-header">
                <div>
                    <h2>Registro de Llamadas (Clara IA)</h2>
                    <p>Historial completo de llamadas atendidas por el bot de voz y seguimiento de devoluciones.</p>
                </div>
                <button
                    onClick={loadCalls}
                    disabled={loading}
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '8px 16px',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        backgroundColor: '#ffffff',
                        color: '#0f172a',
                        fontWeight: 600,
                        fontSize: '13px',
                        cursor: loading ? 'not-allowed' : 'pointer'
                    }}
                >
                    <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                    Actualizar
                </button>
            </div>

            {/* KPI Cards */}
            <div className="call-kpi-grid">
                <div className="call-kpi-card">
                    <div className="call-kpi-icon" style={{ backgroundColor: '#e0f2fe', color: '#0284c7' }}>
                        <PhoneCall size={24} />
                    </div>
                    <div>
                        <div className="call-kpi-title">Total Llamadas</div>
                        <div className="call-kpi-value">{stats.total}</div>
                    </div>
                </div>

                <div className="call-kpi-card" style={{ borderLeft: '4px solid #f59e0b' }}>
                    <div className="call-kpi-icon" style={{ backgroundColor: '#fef3c7', color: '#d97706' }}>
                        <Clock size={24} />
                    </div>
                    <div>
                        <div className="call-kpi-title">Pendientes de Devolver</div>
                        <div className="call-kpi-value" style={{ color: stats.pending > 0 ? '#b45309' : '#0f172a' }}>
                            {stats.pending}
                        </div>
                    </div>
                </div>

                <div className="call-kpi-card" style={{ borderLeft: '4px solid #10b981' }}>
                    <div className="call-kpi-icon" style={{ backgroundColor: '#d1fae5', color: '#059669' }}>
                        <CheckCircle size={24} />
                    </div>
                    <div>
                        <div className="call-kpi-title">Llamadas Devueltas</div>
                        <div className="call-kpi-value">{stats.returned}</div>
                    </div>
                </div>

                <div className="call-kpi-card">
                    <div className="call-kpi-icon" style={{ backgroundColor: '#f3e8ff', color: '#7e22ce' }}>
                        <Calendar size={24} />
                    </div>
                    <div>
                        <div className="call-kpi-title">Recibidas Hoy</div>
                        <div className="call-kpi-value">{stats.todayCount}</div>
                    </div>
                </div>
            </div>

            {/* Filter Bar */}
            <div className="call-filter-bar">
                {/* Search */}
                <div className="call-filter-search">
                    <Search size={16} className="call-filter-search-icon" />
                    <input
                        type="text"
                        placeholder="Buscar por teléfono, paciente o palabra clave..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>

                {/* Status Pills */}
                <div className="call-status-pills">
                    <button
                        className={`call-status-pill ${filterStatus === 'ALL' ? 'active' : ''}`}
                        onClick={() => setFilterStatus('ALL')}
                    >
                        Todas ({calls.length})
                    </button>
                    <button
                        className={`call-status-pill ${filterStatus === 'PENDING' ? 'active' : ''}`}
                        onClick={() => setFilterStatus('PENDING')}
                    >
                        ⏳ Pendientes ({stats.pending})
                    </button>
                    <button
                        className={`call-status-pill ${filterStatus === 'RETURNED' ? 'active' : ''}`}
                        onClick={() => setFilterStatus('RETURNED')}
                    >
                        ✅ Devueltas ({stats.returned})
                    </button>
                    <button
                        className={`call-status-pill ${filterStatus === 'NO_ANSWER' ? 'active' : ''}`}
                        onClick={() => setFilterStatus('NO_ANSWER')}
                    >
                        🟠 No contesta
                    </button>
                    <button
                        className={`call-status-pill ${filterStatus === 'INFO_ONLY' ? 'active' : ''}`}
                        onClick={() => setFilterStatus('INFO_ONLY')}
                    >
                        ⚪ Informativas
                    </button>
                </div>

                {/* Date range */}
                <div style={{ display: 'flex', gap: '6px' }}>
                    <select
                        value={dateRange}
                        onChange={(e) => setDateRange(e.target.value as any)}
                        style={{
                            padding: '6px 12px',
                            borderRadius: '8px',
                            border: '1px solid #cbd5e1',
                            backgroundColor: '#ffffff',
                            color: '#0f172a',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer'
                        }}
                    >
                        <option value="ALL">Todo el histórico</option>
                        <option value="TODAY">Recibidas hoy</option>
                        <option value="WEEK">Últimos 7 días</option>
                        <option value="MONTH">Últimos 30 días</option>
                    </select>
                </div>
            </div>

            {/* Call List */}
            {loading ? (
                <div style={{ padding: '48px', textAlign: 'center', color: '#64748b' }}>
                    <RefreshCw size={28} className="animate-spin mx-auto mb-3 text-sky-600" />
                    <p style={{ fontWeight: 600 }}>Cargando registro de llamadas...</p>
                </div>
            ) : filteredCalls.length === 0 ? (
                <div style={{ background: '#ffffff', borderRadius: '12px', padding: '48px', textAlign: 'center', border: '1px solid #e2e8f0' }}>
                    <Phone size={36} color="#94a3b8" style={{ margin: '0 auto 12px auto' }} />
                    <h4 style={{ margin: '0 0 6px 0', fontSize: '16px', fontWeight: 700, color: '#334155' }}>
                        No se encontraron llamadas
                    </h4>
                    <p style={{ margin: 0, color: '#64748b', fontSize: '13px' }}>
                        Prueba ajustando los filtros de búsqueda o el rango temporal.
                    </p>
                </div>
            ) : (
                <div className="call-list">
                    {filteredCalls.map((call) => {
                        const isPending = call.tracking?.status === 'PENDING';
                        const isReturned = call.tracking?.status === 'RETURNED';
                        const isNoAnswer = call.tracking?.status === 'NO_ANSWER';

                        return (
                            <div key={call.id} className="call-card">
                                {/* Left: Meta */}
                                <div className="call-card-meta">
                                    <div className="call-card-date">
                                        <Calendar size={14} color="#64748b" />
                                        <span>{format(new Date(call.date), "dd/MM/yyyy HH:mm", { locale: es })}</span>
                                    </div>
                                    <div>{renderStatusBadge(call.tracking?.status)}</div>
                                </div>

                                {/* Middle: Details & Notes */}
                                <div className="call-card-content">
                                    <div className="call-card-header-info">
                                        {/* Phone */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <a href={`tel:${call.phone}`} className="call-phone-link">
                                                <Phone size={15} color="#0284c7" />
                                                <span>{formatPhoneDisplay(call.phone)}</span>
                                            </a>
                                            {call.phone && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleCopy(call.id, call.phone)}
                                                    title="Copiar teléfono"
                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: copiedId === call.id ? '#10b981' : '#94a3b8', padding: '2px' }}
                                                >
                                                    {copiedId === call.id ? <Check size={14} /> : <Copy size={14} />}
                                                </button>
                                            )}
                                        </div>

                                        {/* Patient Tag */}
                                        {call.patientName && (
                                            <span className="call-patient-tag">
                                                <User size={13} />
                                                <span>{call.patientName}</span>
                                            </span>
                                        )}
                                    </div>

                                    {/* Summary from Clara */}
                                    <div className="call-summary-box">
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, fontSize: '11px', color: '#64748b', marginBottom: '4px', textTransform: 'uppercase' }}>
                                            <MessageSquare size={13} color="#0284c7" />
                                            <span>Resumen de la llamada (Clara IA)</span>
                                        </div>
                                        <div>{call.summary}</div>
                                    </div>

                                    {/* Tracking Report Box (If returned or answered) */}
                                    {(isReturned || isNoAnswer || (call.tracking?.notes && call.tracking.notes.length > 0)) && (
                                        <div className={`call-tracking-report ${isNoAnswer ? 'no-answer' : ''}`}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', fontWeight: 700, fontSize: '12px' }}>
                                                <span>
                                                    {isReturned ? '✅ Gestión realizada' : isNoAnswer ? '⚠️ Intento de contacto (No contesta)' : '📝 Reporte de llamada'}
                                                    {call.tracking?.returnedBy ? ` por ${call.tracking.returnedBy}` : ''}
                                                    {call.tracking?.returnedAt ? ` el ${format(new Date(call.tracking.returnedAt), "dd/MM HH:mm", { locale: es })}` : ''}
                                                </span>
                                            </div>
                                            {call.tracking?.notes && (
                                                <p style={{ margin: '4px 0 0 0', fontSize: '13px', lineHeight: '1.4' }}>
                                                    {call.tracking.notes}
                                                </p>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Right: Action button */}
                                <div className="call-card-actions">
                                    <button
                                        type="button"
                                        onClick={() => handleOpenModal(call)}
                                        style={{
                                            padding: '8px 16px',
                                            borderRadius: '8px',
                                            border: isPending ? 'none' : '1px solid #cbd5e1',
                                            backgroundColor: isPending ? '#0284c7' : '#ffffff',
                                            color: isPending ? '#ffffff' : '#334155',
                                            fontWeight: 700,
                                            fontSize: '12px',
                                            cursor: 'pointer',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            boxShadow: isPending ? '0 2px 4px rgba(2, 132, 199, 0.25)' : 'none'
                                        }}
                                    >
                                        {isPending ? (
                                            <>
                                                <PhoneForwarded size={14} /> Registrar Devolución
                                            </>
                                        ) : (
                                            <>
                                                <FileEdit size={14} /> Editar Reporte
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Modal de Devolución / Seguimiento */}
            <CallModal
                call={selectedCall}
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSaved={loadCalls}
            />
        </div>
    );
};

export default CallRegistry;
