import React, { useEffect, useState } from 'react';
import { format, addMonths, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { 
    BarChart3, 
    TrendingUp, 
    PieChart as PieIcon, 
    Activity, 
    Download, 
    DollarSign,
    Target,
    Clock,
    ChevronLeft,
    ChevronRight,
    BrainCircuit,
    Zap,
    Info
} from 'lucide-react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell
} from 'recharts';
import Modal from '../../components/ui/Modal';
import { getAnalyticsData, type KPIStats } from './service';
import { useToast } from '../../hooks/useToast';

const METRIC_DETAILS: Record<string, { title: string; definition: string; analysis: (s: KPIStats) => string; icon: any }> = {
    occupancy: {
        title: 'Ocupación del Centro',
        definition: 'Porcentaje de horas agendadas sobre la capacidad total del centro en el mes.',
        analysis: (s) => s.occupancyRate > 80 
            ? `Ocupación excelente (${s.occupancyRate}%). El centro trabaja a pleno rendimiento.`
            : `Margen de mejora. La ocupación del ${s.occupancyRate}% permite optimizar la agenda.`,
        icon: Activity
    },
    revenue: {
        title: 'Ingresos Proyectados',
        definition: 'Valor económico estimado de todas las sesiones realizadas en el periodo.',
        analysis: (s) => `Has generado ${s.totalRevenue}€. Revisa Facturación para cobros pendientes.`,
        icon: DollarSign
    },
    margin: {
        title: 'Margen Operativo',
        definition: 'Beneficio neto aproximado tras descontar costes operativos del centro.',
        analysis: (s) => `Margen del ${s.operatingMargin}%. El centro es rentable tras gastos.`,
        icon: Target
    },
    profitability: {
        title: 'Eficiencia por Profesional',
        definition: 'Comparación entre horas presenciales en el centro y horas facturadas.',
        analysis: () => 'Buen equilibrio entre horas trabajadas y facturadas en el equipo.',
        icon: BarChart3
    },
    cancellations: {
        title: 'Análisis de Cancelaciones',
        definition: 'Distribución de motivos por los que se han perdido citas este mes.',
        analysis: () => 'Se recomienda reforzar recordatorios para reducir cancelaciones.',
        icon: Activity
    }
};

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

const AnalyticsDashboard: React.FC = () => {
    const { showToast } = useToast();
    const [stats, setStats] = useState<KPIStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [month, setMonth] = useState<Date>(new Date());
    const [explanationKey, setExplanationKey] = useState<string | null>(null);

    useEffect(() => { loadData(); }, [month]);

    const loadData = async () => {
        setLoading(true);
        const data = await getAnalyticsData(month);
        setStats(data);
        setLoading(false);
    };

    const handleExport = () => {
        showToast("Generando informe analítico...", "info");
    };

    /* ===== LOADING ===== */
    if (loading) return (
        <div style={{ width: '100%', padding: '2rem 0' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem', marginBottom: '1.5rem' }}>
                {[1,2,3].map(i => <div key={i} style={{ height: 120, background: '#f3f4f6', borderRadius: 16 }} />)}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem' }}>
                {[1,2,3].map(i => <div key={i} style={{ height: 380, background: '#f3f4f6', borderRadius: 16 }} />)}
            </div>
        </div>
    );

    if (!stats) return null;

    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            return (
                <div style={{ background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(10px)', padding: '12px 16px', borderRadius: 14, border: '1px solid #f1f5f9', boxShadow: '0 8px 30px rgba(0,0,0,0.08)' }}>
                    <p style={{ fontWeight: 700, fontSize: 12, color: '#1e293b', marginBottom: 8, borderBottom: '1px solid #f1f5f9', paddingBottom: 6 }}>{label}</p>
                    {payload.map((entry: any, i: number) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 4 }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#64748b', fontWeight: 600 }}>
                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: entry.color, display: 'inline-block' }} />
                                {entry.name}
                            </span>
                            <span style={{ fontWeight: 800, fontSize: 12, color: '#0f172a' }}>{entry.value}{entry.unit || ''}</span>
                        </div>
                    ))}
                </div>
            );
        }
        return null;
    };

    const activeMetric = explanationKey ? METRIC_DETAILS[explanationKey] : null;

    return (
        <div style={{ width: '100%', maxWidth: '1200px', margin: '0 auto', padding: '0 2rem 8rem 2rem' }}>
            {/* ===== HEADER ===== */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', paddingBottom: '2.5rem' }}>
                <div>
                    <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#1e293b', paddingBottom: 4 }}>Panel de Analítica</h2>
                    <p style={{ fontSize: '0.9rem', color: '#94a3b8', fontWeight: 500 }}>Inteligencia y rendimiento del centro</p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                    {/* Month Navigator */}
                    <div style={{ display: 'flex', alignItems: 'center', background: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 14, padding: '0.25rem', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                        <button 
                            onClick={() => setMonth((m: Date) => subMonths(m, 1))}
                            style={{ padding: '0.5rem 0.65rem', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 10, color: '#94a3b8', display: 'flex', alignItems: 'center' }}
                        >
                            <ChevronLeft size={18} />
                        </button>
                        <span style={{ padding: '0 1rem', fontSize: '0.8rem', fontWeight: 700, color: '#1e293b', minWidth: 130, textAlign: 'center', textTransform: 'capitalize' }}>
                            {format(month, 'MMMM yyyy', { locale: es })}
                        </span>
                        <button 
                            onClick={() => setMonth((m: Date) => addMonths(m, 1))}
                            style={{ padding: '0.5rem 0.65rem', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 10, color: '#94a3b8', display: 'flex', alignItems: 'center' }}
                        >
                            <ChevronRight size={18} />
                        </button>
                    </div>
                    
                    <button className="btn-secondary" onClick={() => loadData()} style={{ gap: '0.5rem' }}>
                        <Activity size={16} /> Actualizar
                    </button>
                    <button className="btn-primary" onClick={handleExport} style={{ gap: '0.5rem' }}>
                        <Download size={16} /> Informe
                    </button>
                </div>
            </div>

            {/* ===== FILA 1: 3 KPI CARDS ===== */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem', marginBottom: '2rem' }}>
                {/* KPI 1: Ocupación */}
                <div className="card" onClick={() => setExplanationKey('occupancy')} style={{ cursor: 'pointer', padding: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{ padding: 10, borderRadius: 14, background: '#eff6ff', color: '#3b82f6' }}>
                            <Activity size={22} />
                        </div>
                        <div style={{ flex: 1 }}>
                            <p style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Ocupación</p>
                            <span style={{ fontSize: '1.75rem', fontWeight: 800, color: '#1e293b' }}>{stats.occupancyRate}%</span>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); setExplanationKey('occupancy'); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', padding: 4 }}>
                            <Info size={16} />
                        </button>
                    </div>
                    <div style={{ marginTop: 14, height: 4, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${stats.occupancyRate}%`, background: '#3b82f6', borderRadius: 4, transition: 'width 1s ease' }} />
                    </div>
                </div>

                {/* KPI 2: Ingresos */}
                <div className="card" onClick={() => setExplanationKey('revenue')} style={{ cursor: 'pointer', padding: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{ padding: 10, borderRadius: 14, background: '#ecfdf5', color: '#10b981' }}>
                            <DollarSign size={22} />
                        </div>
                        <div style={{ flex: 1 }}>
                            <p style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Ingresos</p>
                            <span style={{ fontSize: '1.75rem', fontWeight: 800, color: '#1e293b' }}>{stats.totalRevenue}€</span>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); setExplanationKey('revenue'); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', padding: 4 }}>
                            <Info size={16} />
                        </button>
                    </div>
                    <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <TrendingUp size={14} style={{ color: '#10b981' }} />
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#10b981' }}>+12% vs mes anterior</span>
                    </div>
                </div>

                {/* KPI 3: Margen */}
                <div className="card" onClick={() => setExplanationKey('margin')} style={{ cursor: 'pointer', padding: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{ padding: 10, borderRadius: 14, background: '#fefce8', color: '#f59e0b' }}>
                            <Target size={22} />
                        </div>
                        <div style={{ flex: 1 }}>
                            <p style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Margen Operativo</p>
                            <span style={{ fontSize: '1.75rem', fontWeight: 800, color: '#1e293b' }}>{stats.operatingMargin}%</span>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); setExplanationKey('margin'); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', padding: 4 }}>
                            <Info size={16} />
                        </button>
                    </div>
                    <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Clock size={14} style={{ color: '#94a3b8' }} />
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8' }}>Estructura de costes estable</span>
                    </div>
                </div>
            </div>

            {/* ===== FILA 2: 3 PANELS (Gráfico barras, Pie, IA advice) ===== */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem' }}>
                {/* Panel 1: Productividad */}
                <div className="card" style={{ padding: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ padding: 8, borderRadius: 10, background: '#eff6ff', color: '#3b82f6' }}>
                                <BarChart3 size={18} />
                            </div>
                            <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>Productividad</h4>
                        </div>
                        <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Horas / Profesional</span>
                    </div>
                    
                    <div style={{ height: 280, width: '100%' }}>
                        <ResponsiveContainer minWidth={0}>
                            <BarChart data={stats.profitability} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis dataKey="therapist" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                                <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f8fafc' }} />
                                <Bar dataKey="workedHours" name="Presenciales" fill="#e2e8f0" radius={[4, 4, 0, 0]} barSize={18} />
                                <Bar dataKey="billedHours" name="Facturadas" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={18} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                    
                    <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: 12 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600 }}>
                            <span style={{ width: 8, height: 8, background: '#e2e8f0', borderRadius: 2, display: 'inline-block' }} /> Presenciales
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600 }}>
                            <span style={{ width: 8, height: 8, background: '#3b82f6', borderRadius: 2, display: 'inline-block' }} /> Facturadas
                        </span>
                    </div>
                </div>

                {/* Panel 2: Cancelaciones */}
                <div className="card" style={{ padding: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ padding: 8, borderRadius: 10, background: '#fef2f2', color: '#ef4444' }}>
                                <PieIcon size={18} />
                            </div>
                            <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>Cancelaciones</h4>
                        </div>
                    </div>

                    <div style={{ height: 200, width: '100%' }}>
                        <ResponsiveContainer minWidth={0}>
                            <PieChart>
                                <Pie
                                    data={stats.cancellations}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={55}
                                    outerRadius={80}
                                    paddingAngle={5}
                                    dataKey="count"
                                    nameKey="reason"
                                >
                                    {stats.cancellations.map((_: any, index: number) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
                        {stats.cancellations.slice(0, 4).map((c: any, i: number) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#f8fafc', borderRadius: 10, border: '1px solid #f1f5f9' }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>
                                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: COLORS[i % COLORS.length], display: 'inline-block' }} />
                                    {c.reason}
                                </span>
                                <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#1e293b' }}>{c.count}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Panel 3: Smart Advice */}
                <div style={{ background: '#0f172a', borderRadius: 'var(--radius-card, 16px)', padding: '1.75rem', display: 'flex', flexDirection: 'column', color: '#fff', position: 'relative', overflow: 'hidden', boxShadow: '0 10px 40px rgba(15, 23, 42, 0.2)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '1.5rem' }}>
                        <div style={{ padding: 8, borderRadius: 12, background: 'rgba(59,130,246,0.15)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.1)' }}>
                            <BrainCircuit size={20} />
                        </div>
                        <span style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#60a5fa' }}>Recomendación IA</span>
                    </div>
                    
                    <div style={{ flex: 1 }}>
                        <h4 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '1rem', lineHeight: 1.3, color: '#fff' }}>Plan de Acción</h4>
                        <p style={{ fontSize: '0.8rem', color: '#94a3b8', lineHeight: 1.7, fontWeight: 500 }}>
                            {stats.occupancyRate < 75 
                                ? 'Tu ocupación permite un 25% más de productividad. Activa campañas para llenar huecos detectados los jueves y viernes.' 
                                : 'Centro cerca del límite óptimo. Considera ampliar equipo terapéutico si la lista de espera supera 15 días.'}
                        </p>
                    </div>
                    
                    <button style={{ marginTop: '1.5rem', width: '100%', padding: '0.85rem', background: '#3b82f6', border: 'none', borderRadius: 14, color: '#fff', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'background 0.2s' }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = '#2563eb')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = '#3b82f6')}
                    >
                        <Zap size={14} /> Optimizar Agenda
                    </button>
                    
                    {/* Sutil glow decorativo */}
                    <div style={{ position: 'absolute', top: -40, right: -40, width: 120, height: 120, background: 'rgba(59,130,246,0.08)', borderRadius: '50%', filter: 'blur(40px)', pointerEvents: 'none' }} />
                </div>
            </div>

            {/* ===== MODAL ===== */}
            {activeMetric && (
                <Modal 
                    isOpen={!!explanationKey} 
                    onClose={() => setExplanationKey(null)} 
                    title={activeMetric.title}
                >
                    <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                            <div style={{ padding: 12, background: '#eff6ff', borderRadius: 16, color: '#3b82f6' }}>
                                <activeMetric.icon size={28} />
                            </div>
                            <div>
                                <p style={{ fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4, textAlign: 'left' }}>Definición</p>
                                <p style={{ color: '#334155', fontSize: '0.9rem', lineHeight: 1.6, fontWeight: 500, textAlign: 'left' }}>{activeMetric.definition}</p>
                            </div>
                        </div>
                        
                        <div style={{ background: '#f8fafc', borderRadius: 16, padding: '1.25rem', border: '1px solid #f1f5f9' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, color: '#3b82f6' }}>
                                <TrendingUp size={16} />
                                <span style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Análisis</span>
                            </div>
                            <p style={{ fontWeight: 700, fontStyle: 'italic', color: '#1e293b', fontSize: '0.9rem', lineHeight: 1.6, textAlign: 'left' }}>
                                "{activeMetric.analysis(stats)}"
                            </p>
                        </div>
                        
                        <button className="btn-primary" onClick={() => setExplanationKey(null)} style={{ width: '100%', marginTop: 8 }}>
                            Entendido
                        </button>
                    </div>
                </Modal>
            )}
        </div>
    );
};

export default AnalyticsDashboard;
