import React, { useEffect, useState, useMemo } from 'react';
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
    Info,
    Scale,
    Eye,
    Receipt
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
import { getPatients } from '../patients/service';
import { type Patient } from '../patients/types';
import { 
    type MonthlyStatementData, 
    type FinancialCategory, 
    FINANCIAL_CATEGORIES 
} from './types';
import { 
    getStatementForMonth, 
    deleteStatementForMonth, 
    updateMovementCategory 
} from './bankStatementStorage';
import { type ParseResult } from './bankStatementParser';
import BankStatementUploader from './BankStatementUploader';
import BankMovementsModal from './BankMovementsModal';

const METRIC_DETAILS: Record<string, { title: string; definition: string; analysis: (s: KPIStats, statement?: MonthlyStatementData | null) => string; icon: any }> = {
    occupancy: {
        title: 'Ocupación del Centro',
        definition: 'Porcentaje de horas agendadas sobre la capacidad total del centro en el mes.',
        analysis: (s) => s.occupancyRate > 80 
            ? `Ocupación excelente (${s.occupancyRate}%). El centro trabaja a pleno rendimiento.`
            : `Margen de mejora. La ocupación del ${s.occupancyRate}% permite optimizar la agenda.`,
        icon: Activity
    },
    revenue: {
        title: 'Ingresos',
        definition: 'Entradas económicas. Con extracto bancario muestra las entradas reales a cuenta; sin él, las sesiones cobradas del CRM.',
        analysis: (s, stmt) => stmt 
            ? `Ingresos reales de ${stmt.totalIncome}€ en cuenta bancaria (vs ${s.totalRevenue}€ cobrados en citas del CRM).` 
            : `Has cobrado ${s.totalRevenue}€ según citas (con ${s.pendingRevenue}€ pendientes). Sube el extracto bancario para ver el ingreso real en cuenta.`,
        icon: DollarSign
    },
    expenses: {
        title: 'Gastos Operativos Reales',
        definition: 'Suma de todos los adeudos bancarios (nóminas, alquiler, suministros, seguros, etc.) registrados en el extracto.',
        analysis: (_, stmt) => stmt 
            ? `Total de gastos del mes: ${stmt.totalExpenses}€ en ${stmt.movements.filter(m => m.amount < 0).length} pagos.`
            : 'Sube el extracto bancario para calcular tus gastos reales.',
        icon: Receipt
    },
    margin: {
        title: 'Margen Operativo y Beneficio',
        definition: 'Porcentaje de beneficio neto tras restar todos los costes operativos reales a los ingresos.',
        analysis: (s, stmt) => stmt 
            ? `Margen real del ${stmt.realMargin}% con un resultado neto de ${stmt.netResult > 0 ? '+' : ''}${stmt.netResult}€. El centro es ${stmt.netResult >= 0 ? 'rentable' : 'deficitario'} este mes.`
            : `Margen estimado del ${s.operatingMargin}%. Sube el extracto bancario para calcular el margen y beneficio neto exacto.`,
        icon: Target
    },
    profitability: {
        title: 'Eficiencia por Profesional',
        definition: 'Comparación entre horas de presencia/trabajadas y horas facturadas por cada terapeuta.',
        analysis: () => 'Buen equilibrio entre horas trabajadas y facturadas en el equipo terapéutico.',
        icon: BarChart3
    },
    cancellations: {
        title: 'Análisis de Cancelaciones',
        definition: 'Distribución de motivos por los que se han perdido citas este mes.',
        analysis: () => 'Se recomienda reforzar recordatorios para reducir cancelaciones.',
        icon: Activity
    }
};

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

const AnalyticsDashboard: React.FC = () => {
    const { showToast } = useToast();
    const [stats, setStats] = useState<KPIStats | null>(null);
    const [statement, setStatement] = useState<MonthlyStatementData | null>(null);
    const [patients, setPatients] = useState<Patient[]>([]);
    const [loading, setLoading] = useState(true);
    const [month, setMonth] = useState<Date>(new Date());
    const [explanationKey, setExplanationKey] = useState<string | null>(null);
    const [isMovementsModalOpen, setIsMovementsModalOpen] = useState(false);

    const monthKey = useMemo(() => format(month, 'yyyy-MM'), [month]);
    const monthLabel = useMemo(() => format(month, 'MMMM yyyy', { locale: es }), [month]);

    // Cargar pacientes para cruce bancario al montar
    useEffect(() => {
        getPatients().then(setPatients).catch(console.error);
    }, []);

    // Cargar datos de CRM y extracto bancario guardado del mes
    useEffect(() => {
        loadData();
        const savedStmt = getStatementForMonth(monthKey);
        setStatement(savedStmt);
    }, [month, monthKey]);

    const loadData = async () => {
        setLoading(true);
        const data = await getAnalyticsData(month);
        setStats(data);
        setLoading(false);
    };

    const handleStatementLoaded = (result: ParseResult) => {
        if (result.suggestedMonthKey && result.suggestedMonthKey !== monthKey) {
            const [y, m] = result.suggestedMonthKey.split('-').map(Number);
            setMonth(new Date(y, m - 1, 1));
            const newStmt = result.allStatements[result.suggestedMonthKey] || result.currentStatement;
            setStatement(newStmt);
        } else {
            setStatement(result.currentStatement);
        }
    };

    const handleDeleteStatement = () => {
        deleteStatementForMonth(monthKey);
        setStatement(null);
        showToast(`Extracto bancario de ${monthLabel} eliminado.`, 'info');
    };

    const handleUpdateCategory = (movementId: string, newCategory: FinancialCategory, remember: boolean) => {
        const updated = updateMovementCategory(monthKey, movementId, newCategory, remember ? undefined : '');
        if (updated) {
            setStatement(updated);
            showToast('Categoría actualizada.', 'success');
        }
    };

    const handleExport = () => {
        showToast("Generando informe analítico...", "info");
    };

    // Datos para el gráfico de desglose de gastos
    const expensesChartData = useMemo(() => {
        if (!statement) return [];
        return Object.entries(statement.expensesByCategory)
            .filter(([_, val]) => val > 0)
            .map(([catKey, amount]) => {
                const meta = FINANCIAL_CATEGORIES[catKey as FinancialCategory] || FINANCIAL_CATEGORIES.OTROS_GASTOS;
                const percentage = statement.totalExpenses > 0 
                    ? Math.round((amount / statement.totalExpenses) * 100) 
                    : 0;
                return {
                    name: meta.label,
                    value: amount,
                    percentage,
                    color: meta.color
                };
            })
            .sort((a, b) => b.value - a.value);
    }, [statement]);

    /* ===== LOADING ===== */
    if (loading) return (
        <div style={{ width: '100%', padding: '2rem 0' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem', marginBottom: '1.5rem' }}>
                {[1,2,3,4].map(i => <div key={i} style={{ height: 120, background: '#f3f4f6', borderRadius: 16 }} />)}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem' }}>
                {[1,2,3].map(i => <div key={i} style={{ height: 380, background: '#f3f4f6', borderRadius: 16 }} />)}
            </div>
        </div>
    );

    if (!stats) return null;

    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            const therapistFullName = payload[0]?.payload?.therapistFullName;
            return (
                <div style={{ background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(10px)', padding: '12px 16px', borderRadius: 14, border: '1px solid #f1f5f9', boxShadow: '0 8px 30px rgba(0,0,0,0.08)' }}>
                    <p style={{ fontWeight: 700, fontSize: 12, color: '#1e293b', marginBottom: 8, borderBottom: '1px solid #f1f5f9', paddingBottom: 6 }}>
                        {therapistFullName || label}
                    </p>
                    {payload.map((entry: any, i: number) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 4 }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#64748b', fontWeight: 600 }}>
                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: entry.color, display: 'inline-block' }} />
                                {entry.name}
                            </span>
                            <span style={{ fontWeight: 800, fontSize: 12, color: '#0f172a' }}>{entry.value}h</span>
                        </div>
                    ))}
                    {payload[0]?.payload?.revenue !== undefined && (
                        <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px dashed #e2e8f0', display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                            <span style={{ color: '#64748b', fontWeight: 600 }}>Facturado cobrado:</span>
                            <span style={{ fontWeight: 800, color: '#10b981' }}>{payload[0].payload.revenue.toLocaleString('es-ES')}€</span>
                        </div>
                    )}
                </div>
            );
        }
        return null;
    };

    const activeMetric = explanationKey ? METRIC_DETAILS[explanationKey] : null;

    return (
        <div style={{ width: '100%', maxWidth: '1200px', margin: '0 auto', padding: '0 2rem 8rem 2rem' }}>
            {/* ===== HEADER ===== */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', paddingBottom: '2rem' }}>
                <div>
                    <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#1e293b', paddingBottom: 4 }}>Panel de Analítica</h2>
                    <p style={{ fontSize: '0.9rem', color: '#94a3b8', fontWeight: 500 }}>Inteligencia financiera y rendimiento de Centro Proyecta</p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                    {/* Month Navigator */}
                    <div style={{ display: 'flex', alignItems: 'center', background: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 14, padding: '0.25rem', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                        <button 
                            onClick={() => setMonth((m: Date) => subMonths(m, 1))}
                            style={{ padding: '0.5rem 0.65rem', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 10, color: '#94a3b8', display: 'flex', alignItems: 'center' }}
                            title="Mes anterior"
                        >
                            <ChevronLeft size={18} />
                        </button>
                        <span style={{ padding: '0 1rem', fontSize: '0.8rem', fontWeight: 700, color: '#1e293b', minWidth: 140, textAlign: 'center', textTransform: 'capitalize' }}>
                            {monthLabel}
                        </span>
                        <button 
                            onClick={() => setMonth((m: Date) => addMonths(m, 1))}
                            style={{ padding: '0.5rem 0.65rem', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 10, color: '#94a3b8', display: 'flex', alignItems: 'center' }}
                            title="Mes siguiente"
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

            {/* ===== UPLOADER / ESTADO DEL EXTRACTO BANCARIO ===== */}
            <BankStatementUploader
                monthKey={monthKey}
                monthLabel={monthLabel}
                statement={statement}
                patients={patients}
                onStatementLoaded={handleStatementLoaded}
                onDeleteStatement={handleDeleteStatement}
                onOpenMovements={() => setIsMovementsModalOpen(true)}
            />

            {/* ===== FILA 1: KPI CARDS (Adaptables con extracto real) ===== */}
            <div style={{ 
                display: 'grid', 
                gridTemplateColumns: statement ? 'repeat(4, 1fr)' : 'repeat(3, 1fr)', 
                gap: '1.5rem', 
                marginBottom: '2rem' 
            }}>
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

                {/* KPI 2: Ingresos Reales vs CRM */}
                <div className="card" onClick={() => setExplanationKey('revenue')} style={{ cursor: 'pointer', padding: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{ padding: 10, borderRadius: 14, background: '#ecfdf5', color: '#10b981' }}>
                            <DollarSign size={22} />
                        </div>
                        <div style={{ flex: 1 }}>
                            <p style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>
                                {statement ? 'Ingresos Banco' : 'Ingresos Citas CRM'}
                            </p>
                            <span style={{ fontSize: '1.75rem', fontWeight: 800, color: '#1e293b' }}>
                                {statement ? statement.totalIncome.toLocaleString('es-ES') : stats.totalRevenue.toLocaleString('es-ES')}€
                            </span>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); setExplanationKey('revenue'); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', padding: 4 }}>
                            <Info size={16} />
                        </button>
                    </div>
                    <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                        {statement ? (
                            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: statement.totalIncome >= stats.totalRevenue ? '#10b981' : '#f59e0b' }}>
                                CRM Cobrado: {stats.totalRevenue.toLocaleString('es-ES')}€ {stats.pendingRevenue > 0 ? `· Ptes: ${stats.pendingRevenue}€` : ''}
                            </span>
                        ) : (
                            <>
                                <TrendingUp size={14} style={{ color: '#10b981' }} />
                                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#10b981' }}>
                                    Cobrado: {stats.totalRevenue.toLocaleString('es-ES')}€ {stats.pendingRevenue > 0 ? `(${stats.pendingRevenue}€ ptes)` : ''}
                                </span>
                            </>
                        )}
                    </div>
                </div>

                {/* KPI 3: Gastos Reales (solo con extracto) */}
                {statement && (
                    <div className="card" onClick={() => setExplanationKey('expenses')} style={{ cursor: 'pointer', padding: '1.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <div style={{ padding: 10, borderRadius: 14, background: '#fef2f2', color: '#ef4444' }}>
                                <Receipt size={22} />
                            </div>
                            <div style={{ flex: 1 }}>
                                <p style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Gastos Reales</p>
                                <span style={{ fontSize: '1.75rem', fontWeight: 800, color: '#1e293b' }}>{statement.totalExpenses.toLocaleString('es-ES')}€</span>
                            </div>
                            <button onClick={(e) => { e.stopPropagation(); setExplanationKey('expenses'); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', padding: 4 }}>
                                <Info size={16} />
                            </button>
                        </div>
                        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#ef4444' }}>
                                {statement.movements.filter(m => m.amount < 0).length} pagos y adeudos bancarios
                            </span>
                        </div>
                    </div>
                )}

                {/* KPI 4: Margen Operativo & Beneficio Neto */}
                <div className="card" onClick={() => setExplanationKey('margin')} style={{ cursor: 'pointer', padding: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{ 
                            padding: 10, 
                            borderRadius: 14, 
                            background: statement ? (statement.netResult >= 0 ? '#ecfdf5' : '#fef2f2') : '#fefce8', 
                            color: statement ? (statement.netResult >= 0 ? '#10b981' : '#ef4444') : '#f59e0b' 
                        }}>
                            <Target size={22} />
                        </div>
                        <div style={{ flex: 1 }}>
                            <p style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>
                                {statement ? 'Resultado Neto' : 'Margen Operativo'}
                            </p>
                            <span style={{ 
                                fontSize: '1.75rem', 
                                fontWeight: 800, 
                                color: statement ? (statement.netResult >= 0 ? '#10b981' : '#ef4444') : '#1e293b' 
                            }}>
                                {statement 
                                    ? `${statement.netResult > 0 ? '+' : ''}${statement.netResult.toLocaleString('es-ES')}€` 
                                    : `${stats.operatingMargin}%`
                                }
                            </span>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); setExplanationKey('margin'); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', padding: 4 }}>
                            <Info size={16} />
                        </button>
                    </div>
                    <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                        {statement ? (
                            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: statement.realMargin >= 0 ? '#10b981' : '#ef4444' }}>
                                Margen real: {statement.realMargin}% ({statement.netResult >= 0 ? 'Superávit' : 'Déficit'})
                            </span>
                        ) : (
                            <>
                                <Clock size={14} style={{ color: '#94a3b8' }} />
                                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8' }}>Estimado (35%) · Sube extracto para datos reales</span>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* ===== FILA 2: ANÁLISIS FINANCIERO DETALLADO (Si hay extracto) ===== */}
            {statement && (
                <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '1.5rem', marginBottom: '2rem' }}>
                    {/* Desglose de Gastos por Categoría */}
                    <div className="card" style={{ padding: '1.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{ padding: 8, borderRadius: 10, background: '#fef2f2', color: '#ef4444' }}>
                                    <Receipt size={18} />
                                </div>
                                <h4 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#1e293b', margin: 0 }}>Desglose de Costes Operativos</h4>
                            </div>
                            <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                                Total: {statement.totalExpenses.toLocaleString('es-ES')}€
                            </span>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: '1rem', alignItems: 'center' }}>
                            {/* Gráfico Donut */}
                            <div style={{ height: 180, width: 180, margin: '0 auto' }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={expensesChartData}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={50}
                                            outerRadius={75}
                                            paddingAngle={4}
                                            dataKey="value"
                                        >
                                            {expensesChartData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.color} />
                                            ))}
                                        </Pie>
                                        <Tooltip 
                                            formatter={(value: any) => [`${value}€`, 'Gasto']}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>

                            {/* Lista / Leyenda con importes y porcentajes */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 220, overflowY: 'auto', paddingRight: 4 }}>
                                {expensesChartData.length === 0 ? (
                                    <p style={{ fontSize: '0.8rem', color: '#94a3b8' }}>No se han detectado cargos de gastos en el extracto de este mes.</p>
                                ) : (
                                    expensesChartData.map((item, idx) => (
                                        <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: '#f8fafc', borderRadius: 8, border: '1px solid #f1f5f9' }}>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.75rem', fontWeight: 600, color: '#334155' }}>
                                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: item.color, flexShrink: 0 }} />
                                                {item.name}
                                            </span>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#0f172a' }}>
                                                    {item.value.toLocaleString('es-ES')}€
                                                </span>
                                                <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600, minWidth: 32, textAlign: 'right' }}>
                                                    {item.percentage}%
                                                </span>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Conciliación Banco vs CRM y Flujo de Caja */}
                    <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1.25rem' }}>
                                <div style={{ padding: 8, borderRadius: 10, background: '#eff6ff', color: '#3b82f6' }}>
                                    <Scale size={18} />
                                </div>
                                <h4 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#1e293b', margin: 0 }}>Conciliación Banco vs CRM</h4>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#f8fafc', borderRadius: 10 }}>
                                    <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>Cobros facturados en citas CRM</span>
                                    <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#1e293b' }}>{stats.totalRevenue.toLocaleString('es-ES')}€</span>
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#f8fafc', borderRadius: 10 }}>
                                    <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>Ingresos detectados en cuenta</span>
                                    <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#10b981' }}>+ {statement.totalIncome.toLocaleString('es-ES')}€</span>
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#f8fafc', borderRadius: 10 }}>
                                    <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>Diferencia / Desviación</span>
                                    <span style={{ 
                                        fontSize: '0.85rem', 
                                        fontWeight: 800, 
                                        color: (statement.totalIncome - stats.totalRevenue) >= 0 ? '#10b981' : '#f59e0b' 
                                    }}>
                                        {(statement.totalIncome - stats.totalRevenue) > 0 ? '+' : ''}{(statement.totalIncome - stats.totalRevenue).toLocaleString('es-ES')}€
                                    </span>
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: statement.netResult >= 0 ? '#ecfdf5' : '#fef2f2', borderRadius: 10, border: `1px solid ${statement.netResult >= 0 ? '#a7f3d0' : '#fecaca'}` }}>
                                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: statement.netResult >= 0 ? '#065f46' : '#991b1b' }}>Beneficio Limpio de Caja</span>
                                    <span style={{ fontSize: '0.95rem', fontWeight: 900, color: statement.netResult >= 0 ? '#047857' : '#b91c1c' }}>
                                        {statement.netResult > 0 ? '+' : ''}{statement.netResult.toLocaleString('es-ES')}€
                                    </span>
                                </div>
                            </div>
                        </div>

                        <button 
                            className="btn-secondary"
                            onClick={() => setIsMovementsModalOpen(true)}
                            style={{ width: '100%', marginTop: '1.25rem', justifyContent: 'center', gap: 8, padding: '0.75rem' }}
                        >
                            <Eye size={16} /> Explorar los {statement.movements.length} movimientos de {monthLabel}
                        </button>
                    </div>
                </div>
            )}

            {/* ===== FILA 3: 3 PANELS (Productividad Terapeutas Reales, Cancelaciones, Recomendación IA) ===== */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem' }}>
                {/* Panel 1: Productividad de Terapeutas Reales */}
                <div className="card" style={{ padding: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ padding: 8, borderRadius: 10, background: '#eff6ff', color: '#3b82f6' }}>
                                <BarChart3 size={18} />
                            </div>
                            <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>Productividad</h4>
                        </div>
                        <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                            {stats.profitability.length} Profesionales
                        </span>
                    </div>
                    
                    <div style={{ height: 280, width: '100%' }}>
                        <ResponsiveContainer minWidth={0}>
                            <BarChart data={stats.profitability} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis dataKey="therapist" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b', fontWeight: 700 }} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                                <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f8fafc' }} />
                                <Bar dataKey="workedHours" name="Presenciales" fill="#e2e8f0" radius={[4, 4, 0, 0]} barSize={16} />
                                <Bar dataKey="billedHours" name="Facturadas" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={16} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                    
                    <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: 12 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>
                            <span style={{ width: 8, height: 8, background: '#e2e8f0', borderRadius: 2, display: 'inline-block' }} /> Presenciales
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.7rem', color: '#3b82f6', fontWeight: 700 }}>
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
                        <span style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#60a5fa' }}>Recomendación Financiera</span>
                    </div>
                    
                    <div style={{ flex: 1 }}>
                        <h4 style={{ fontSize: '1.15rem', fontWeight: 800, marginBottom: '0.75rem', lineHeight: 1.3, color: '#fff' }}>
                            {statement 
                                ? (statement.netResult >= 0 ? 'Salud Financiera Positiva' : 'Alerta de Rentabilidad') 
                                : 'Diagnóstico del Mes'
                            }
                        </h4>
                        <p style={{ fontSize: '0.8rem', color: '#94a3b8', lineHeight: 1.6, fontWeight: 500 }}>
                            {statement ? (
                                statement.netResult >= 0
                                    ? `Con un margen neto real del ${statement.realMargin}% (${statement.netResult}€ de beneficio limpio), el centro cubre holgadamente su estructura de costes fijos. Revisa los cobros pendientes para maximizar caja.`
                                    : `Los gastos operativos (${statement.totalExpenses}€) superaron las entradas de este mes por ${Math.abs(statement.netResult)}€. Comprueba si quedan transferencias de pacientes o liquidaciones TPV pendientes de abonar.`
                            ) : (
                                stats.occupancyRate < 75 
                                    ? 'Tu ocupación permite un 25% más de productividad. Activa campañas para llenar huecos detectados los jueves y viernes.' 
                                    : 'Centro cerca del límite óptimo. Considera ampliar equipo terapéutico si la lista de espera supera 15 días.'
                            )}
                        </p>
                    </div>
                    
                    <button style={{ marginTop: '1.5rem', width: '100%', padding: '0.85rem', background: '#3b82f6', border: 'none', borderRadius: 14, color: '#fff', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'background 0.2s' }}
                        onClick={() => {
                            if (statement) {
                                setIsMovementsModalOpen(true);
                            } else {
                                showToast('Sube el extracto bancario para obtener el plan de acción detallado.', 'info');
                            }
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = '#2563eb')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = '#3b82f6')}
                    >
                        <Zap size={14} /> {statement ? 'Ver Movimientos del Mes' : 'Subir Extracto Bancario'}
                    </button>
                    
                    {/* Sutil glow decorativo */}
                    <div style={{ position: 'absolute', top: -40, right: -40, width: 120, height: 120, background: 'rgba(59,130,246,0.08)', borderRadius: '50%', filter: 'blur(40px)', pointerEvents: 'none' }} />
                </div>
            </div>

            {/* ===== MODAL DE EXPLICACIÓN DE KPI ===== */}
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
                                "{activeMetric.analysis(stats, statement)}"
                            </p>
                        </div>
                        
                        <button className="btn-primary" onClick={() => setExplanationKey(null)} style={{ width: '100%', marginTop: 8 }}>
                            Entendido
                        </button>
                    </div>
                </Modal>
            )}

            {/* ===== MODAL DE MOVIMIENTOS BANCARIOS ===== */}
            {statement && (
                <BankMovementsModal
                    isOpen={isMovementsModalOpen}
                    onClose={() => setIsMovementsModalOpen(false)}
                    movements={statement.movements}
                    monthLabel={monthLabel}
                    accountIban={statement.accountIban}
                    onUpdateCategory={handleUpdateCategory}
                />
            )}
        </div>
    );
};

export default AnalyticsDashboard;
