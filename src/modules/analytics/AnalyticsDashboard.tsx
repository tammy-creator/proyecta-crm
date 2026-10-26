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
    ChevronLeft, 
    ChevronRight, 
    Receipt,
    Calendar,
    GraduationCap
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
import { 
    getAnalyticsData, 
    getMonthlyCollectionData, 
    getAcademicYearData, 
    generateAiAdvisory, 
    type KPIStats 
} from './service';
import { useToast } from '../../hooks/useToast';
import { getPatients } from '../patients/service';
import { type Patient } from '../patients/types';
import { 
    type MonthlyStatementData, 
    type FinancialCategory, 
    FINANCIAL_CATEGORIES,
    type MonthlyCollectionSummary,
    type AiHealthDiagnosis,
    type AcademicYearData
} from './types';
import { 
    getStatementForMonth, 
    deleteStatementForMonth, 
    updateMovementCategory 
} from './bankStatementStorage';
import { type ParseResult } from './bankStatementParser';
import BankStatementUploader from './BankStatementUploader';
import BankMovementsModal from './BankMovementsModal';
import MonthlyGlobalOverview from './MonthlyGlobalOverview';
import AiAdvisoryPanel from './AiAdvisoryPanel';
import AcademicYearView from './AcademicYearView';

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
    const [viewMode, setViewMode] = useState<'MONTHLY' | 'ACADEMIC_YEAR'>('MONTHLY');
    const [stats, setStats] = useState<KPIStats | null>(null);
    const [collectionSummary, setCollectionSummary] = useState<MonthlyCollectionSummary | null>(null);
    const [aiDiagnosis, setAiDiagnosis] = useState<AiHealthDiagnosis | null>(null);
    const [academicYearData, setAcademicYearData] = useState<AcademicYearData | null>(null);
    const [academicStartYear, setAcademicStartYear] = useState<number>(2026);
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

    // Cargar datos de CRM, cobros efectivos, extracto y curso escolar
    useEffect(() => {
        loadData();
    }, [month, monthKey, academicStartYear]);

    const loadData = async () => {
        setLoading(true);
        try {
            const savedStmt = getStatementForMonth(monthKey);
            setStatement(savedStmt);

            const [dataStats, dataCol, dataYear] = await Promise.all([
                getAnalyticsData(month),
                getMonthlyCollectionData(month),
                getAcademicYearData(academicStartYear)
            ]);

            setStats(dataStats);
            setCollectionSummary(dataCol);
            setAcademicYearData(dataYear);

            const diagnosis = generateAiAdvisory(dataStats, savedStmt, dataCol, dataYear);
            setAiDiagnosis(diagnosis);
        } catch (err) {
            console.error('Error al cargar analítica:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleStatementLoaded = (result: ParseResult) => {
        let newStmt: MonthlyStatementData | null = null;
        if (result.suggestedMonthKey && result.suggestedMonthKey !== monthKey) {
            const [y, m] = result.suggestedMonthKey.split('-').map(Number);
            setMonth(new Date(y, m - 1, 1));
            newStmt = result.allStatements[result.suggestedMonthKey] || result.currentStatement;
            setStatement(newStmt);
        } else {
            newStmt = result.currentStatement;
            setStatement(newStmt);
        }

        // Recalcular diagnóstico y datos del curso con el nuevo extracto
        if (stats && collectionSummary) {
            setAiDiagnosis(generateAiAdvisory(stats, newStmt, collectionSummary, academicYearData));
        }
        getAcademicYearData(academicStartYear).then(setAcademicYearData).catch(console.error);
    };

    const handleDeleteStatement = () => {
        deleteStatementForMonth(monthKey);
        setStatement(null);
        showToast(`Extracto bancario de ${monthLabel} eliminado.`, 'info');
        if (stats && collectionSummary) {
            setAiDiagnosis(generateAiAdvisory(stats, null, collectionSummary, academicYearData));
        }
        getAcademicYearData(academicStartYear).then(setAcademicYearData).catch(console.error);
    };

    const handleUpdateCategory = (movementId: string, newCategory: FinancialCategory, remember: boolean) => {
        const updated = updateMovementCategory(monthKey, movementId, newCategory, remember ? undefined : '');
        if (updated) {
            setStatement(updated);
            showToast('Categoría actualizada.', 'success');
            if (stats && collectionSummary) {
                setAiDiagnosis(generateAiAdvisory(stats, updated, collectionSummary, academicYearData));
            }
            getAcademicYearData(academicStartYear).then(setAcademicYearData).catch(console.error);
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

    const handleSelectMonthFromYear = (targetMonthKey: string) => {
        const [y, m] = targetMonthKey.split('-').map(Number);
        setMonth(new Date(y, m - 1, 1));
        setViewMode('MONTHLY');
    };

    return (
        <div style={{ width: '100%', maxWidth: '1200px', margin: '0 auto', padding: '0 2rem 8rem 2rem' }}>
            {/* ===== HEADER ===== */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', paddingBottom: '2rem' }}>
                <div>
                    <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#1e293b', paddingBottom: 4 }}>Panel de Analítica</h2>
                    <p style={{ fontSize: '0.9rem', color: '#94a3b8', fontWeight: 500 }}>Inteligencia financiera y rendimiento de Centro Proyecta</p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                    {/* Selector de Modo: Mensual vs Curso Escolar */}
                    <div style={{ display: 'flex', background: '#f1f5f9', padding: '3px', borderRadius: 14, border: '1px solid #e2e8f0' }}>
                        <button
                            onClick={() => setViewMode('MONTHLY')}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                padding: '6px 14px',
                                borderRadius: 11,
                                border: 'none',
                                background: viewMode === 'MONTHLY' ? '#fff' : 'transparent',
                                color: viewMode === 'MONTHLY' ? '#1e293b' : '#64748b',
                                fontWeight: 700,
                                fontSize: '0.78rem',
                                cursor: 'pointer',
                                boxShadow: viewMode === 'MONTHLY' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                                transition: 'all 0.15s'
                            }}
                        >
                            <Calendar size={15} /> Vista Mensual
                        </button>
                        <button
                            onClick={() => setViewMode('ACADEMIC_YEAR')}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                padding: '6px 14px',
                                borderRadius: 11,
                                border: 'none',
                                background: viewMode === 'ACADEMIC_YEAR' ? '#fff' : 'transparent',
                                color: viewMode === 'ACADEMIC_YEAR' ? '#1e293b' : '#64748b',
                                fontWeight: 700,
                                fontSize: '0.78rem',
                                cursor: 'pointer',
                                boxShadow: viewMode === 'ACADEMIC_YEAR' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                                transition: 'all 0.15s'
                            }}
                        >
                            <GraduationCap size={15} /> Curso ({academicStartYear} - {academicStartYear + 1})
                        </button>
                    </div>

                    {/* Month Navigator (solo en vista mensual) */}
                    {viewMode === 'MONTHLY' && (
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
                    )}
                    
                    <button className="btn-secondary" onClick={() => loadData()} style={{ gap: '0.5rem' }}>
                        <Activity size={16} /> Actualizar
                    </button>
                    <button className="btn-primary" onClick={handleExport} style={{ gap: '0.5rem' }}>
                        <Download size={16} /> Informe
                    </button>
                </div>
            </div>

            {/* ===== MODO 1: CURSO ESCOLAR (Septiembre a Septiembre) ===== */}
            {viewMode === 'ACADEMIC_YEAR' && academicYearData ? (
                <AcademicYearView
                    yearData={academicYearData}
                    onSelectMonth={handleSelectMonthFromYear}
                    onChangeStartYear={(yr) => setAcademicStartYear(yr)}
                />
            ) : (
                /* ===== MODO 2: VISTA MENSUAL ===== */
                <>
                    {/* Uploader de Extracto Bancario */}
                    <BankStatementUploader
                        monthKey={monthKey}
                        monthLabel={monthLabel}
                        statement={statement}
                        patients={patients}
                        onStatementLoaded={handleStatementLoaded}
                        onDeleteStatement={handleDeleteStatement}
                        onOpenMovements={() => setIsMovementsModalOpen(true)}
                    />

                    {/* Visión Global: Conciliación Cobros CRM vs Tesorería Banco */}
                    {collectionSummary && (
                        <MonthlyGlobalOverview
                            monthLabel={monthLabel}
                            statement={statement}
                            collection={collectionSummary}
                            onOpenMovements={() => setIsMovementsModalOpen(true)}
                        />
                    )}

                    {/* Asesor Clínico & Financiero IA */}
                    {aiDiagnosis && (
                        <AiAdvisoryPanel
                            diagnosis={aiDiagnosis}
                            monthLabel={monthLabel}
                            onRefresh={loadData}
                        />
                    )}

                    {/* Desglose de Gastos por Categoría (si hay extracto) */}
                    {statement && expensesChartData.length > 0 && (
                        <div className="card" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <div style={{ padding: 8, borderRadius: 10, background: '#fef2f2', color: '#ef4444' }}>
                                        <Receipt size={18} />
                                    </div>
                                    <div>
                                        <h4 style={{ fontSize: '1rem', fontWeight: 800, color: '#1e293b', margin: 0 }}>Desglose de Costes Operativos del Extracto</h4>
                                        <p style={{ fontSize: '0.75rem', color: '#64748b', margin: 0, marginTop: 2 }}>Distribución de los {statement.totalExpenses.toLocaleString('es-ES')}€ de adeudos y pagos del mes</p>
                                    </div>
                                </div>
                                <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#ef4444', background: '#fef2f2', padding: '4px 12px', borderRadius: 20 }}>
                                    Total: {statement.totalExpenses.toLocaleString('es-ES')}€
                                </span>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.5rem', alignItems: 'center' }}>
                                {/* Donut Chart */}
                                <div style={{ height: 190, width: '100%', maxWidth: 220, margin: '0 auto' }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={expensesChartData}
                                                cx="50%"
                                                cy="50%"
                                                innerRadius={50}
                                                outerRadius={80}
                                                paddingAngle={4}
                                                dataKey="value"
                                            >
                                                {expensesChartData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                                ))}
                                            </Pie>
                                            <Tooltip formatter={(value: any) => [`${value}€`, 'Gasto']} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>

                                {/* Lista de categorías */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8, maxHeight: 240, overflowY: 'auto' }}>
                                    {expensesChartData.map((item, idx) => (
                                        <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#f8fafc', borderRadius: 10, border: '1px solid #f1f5f9' }}>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.75rem', fontWeight: 600, color: '#334155' }}>
                                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: item.color, flexShrink: 0 }} />
                                                {item.name}
                                            </span>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#0f172a' }}>
                                                    {item.value.toLocaleString('es-ES')}€
                                                </span>
                                                <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600, minWidth: 32, textAlign: 'right' }}>
                                                    {item.percentage}%
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Productividad de Terapeutas Reales y Cancelaciones (2 Columnas amplias) */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
                        {/* Panel 1: Productividad de Terapeutas Reales */}
                        <div className="card" style={{ padding: '1.5rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <div style={{ padding: 8, borderRadius: 10, background: '#eff6ff', color: '#3b82f6' }}>
                                        <BarChart3 size={18} />
                                    </div>
                                    <div>
                                        <h4 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#1e293b', margin: 0 }}>Productividad por Profesional</h4>
                                        <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: 0, marginTop: 2 }}>Horas presenciales vs horas de sesión facturadas</p>
                                    </div>
                                </div>
                                <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#3b82f6', background: '#eff6ff', padding: '3px 8px', borderRadius: 8 }}>
                                    {stats.profitability.length} Profesionales
                                </span>
                            </div>
                            
                            <div style={{ height: 260, width: '100%' }}>
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
                            
                            <div style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center', marginTop: 12 }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>
                                    <span style={{ width: 8, height: 8, background: '#e2e8f0', borderRadius: 2, display: 'inline-block' }} /> Horas Presenciales
                                </span>
                                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', color: '#3b82f6', fontWeight: 700 }}>
                                    <span style={{ width: 8, height: 8, background: '#3b82f6', borderRadius: 2, display: 'inline-block' }} /> Horas Facturadas
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
                                    <div>
                                        <h4 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#1e293b', margin: 0 }}>Motivos de Cancelación</h4>
                                        <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: 0, marginTop: 2 }}>Distribución de citas perdidas este mes</p>
                                    </div>
                                </div>
                            </div>

                            <div style={{ height: 180, width: '100%' }}>
                                <ResponsiveContainer minWidth={0}>
                                    <PieChart>
                                        <Pie
                                            data={stats.cancellations}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={50}
                                            outerRadius={75}
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
                            
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                                {stats.cancellations.slice(0, 4).map((c: any, i: number) => (
                                    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: '#f8fafc', borderRadius: 8, border: '1px solid #f1f5f9' }}>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.72rem', fontWeight: 600, color: '#64748b' }}>
                                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: COLORS[i % COLORS.length], display: 'inline-block' }} />
                                            {c.reason}
                                        </span>
                                        <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#1e293b' }}>{c.count} citas</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </>
            )}

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
