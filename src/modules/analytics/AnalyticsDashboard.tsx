import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { 
    BarChart3, 
    TrendingUp, 
    PieChart as PieIcon, 
    Activity, 
    Download, 
    DollarSign,
    Target
} from 'lucide-react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell
} from 'recharts';
import Card from '../../components/ui/Card';
import Modal from '../../components/ui/Modal';
import { getAnalyticsData, type KPIStats } from './service';

const METRIC_DETAILS: Record<string, { title: string, definition: string, analysis: (stats: KPIStats) => string, icon: any }> = {
    occupancy: {
        title: '¿Qué es la Ocupación del Centro?',
        definition: 'Es el porcentaje de horas de terapia agendadas respecto a la capacidad total de la clínica en el mes seleccionado.',
        analysis: (stats) => stats.occupancyRate > 80 
            ? `Tu ocupación actual (${stats.occupancyRate}%) es excelente. Tu centro está trabajando a pleno rendimiento.` 
            : `Tienes margen de crecimiento. Una ocupación del ${stats.occupancyRate}% sugiere que podrías optimizar más los huecos de la agenda.`,
        icon: Activity
    },
    revenue: {
        title: '¿Qué son los Ingresos Totales?',
        definition: 'Estimación del valor económico de todas las sesiones realizadas en el periodo, independientemente de su estado de cobro.',
        analysis: (stats) => `Has generado un volumen de ${stats.totalRevenue}€. Recuerda revisar el apartado de Facturación para gestionar cobros pendientes.`,
        icon: DollarSign
    },
    margin: {
        title: '¿Qué es el Margen Operativo?',
        definition: 'Es el beneficio neto aproximado tras descontar los costes operativos fijos y variables del centro.',
        analysis: (stats) => `Tu margen del ${stats.operatingMargin}% indica que el centro es rentable tras cubrir sus gastos fundamentales.`,
        icon: Target
    },
    profitability: {
        title: 'Rentabilidad por Terapeuta',
        definition: 'Muestra la eficiencia comparando las horas de estancia en el centro frente a las horas reales de terapia facturadas.',
        analysis: () => 'Un alto grado de coincidencia entre horas trabajadas y facturadas indica una gestión óptima de la jornada laboral.',
        icon: BarChart3
    },
    cancellations: {
        title: 'Análisis de Cancelaciones',
        definition: 'Desglose de los motivos principales por los cuales se han perdido citas en el mes seleccionado.',
        analysis: () => 'Identificar los motivos recurrentes permite ajustar las políticas de cancelación o reforzar los recordatorios automáticos.',
        icon: Activity
    }
};

const AnalyticsDashboard: React.FC = () => {
    const [stats, setStats] = useState<KPIStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [month] = useState(new Date());
    const [explanationKey, setExplanationKey] = useState<string | null>(null);

    useEffect(() => {
        loadData();
    }, [month]);

    const loadData = async () => {
        setLoading(true);
        const data = await getAnalyticsData(month);
        setStats(data);
        setLoading(false);
    };

    const handleExport = () => {
        alert("Generando informe PDF para gerencia...\n(Simulación)");
    };

    if (loading) return <div className="p-8 text-center text-secondary">Calculando métricas de negocio...</div>;
    if (!stats) return null;

    const COLORS = ['#A8D5BA', '#BCE4EA', '#FFD6A5', '#A0C4FF', '#FFADAD'];

    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            return (
                <div className="bg-white p-3 shadow-lg rounded-xl border border-gray-50">
                    <p className="font-bold text-gray-800 mb-1">{label}</p>
                    {payload.map((entry: any, index: number) => (
                        <p key={index} className="text-sm" style={{ color: entry.color }}>
                            {entry.name}: <span className="font-semibold">{entry.value}{entry.unit || ''}</span>
                        </p>
                    ))}
                </div>
            );
        }
        return null;
    };

    const activeMetric = explanationKey ? METRIC_DETAILS[explanationKey] : null;

    return (
        <div className="analytics-dashboard">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h3 className="text-xl font-bold text-gray-800">Analítica de Negocio</h3>
                    <p className="text-sm text-secondary">
                        Datos del mes: <span className="font-medium text-primary capitalize">{format(month, 'MMMM yyyy', { locale: es })}</span>
                    </p>
                </div>
                <button className="btn-primary flex gap-2" onClick={handleExport}>
                    <Download size={18} /> Resumen Ejecutivo
                </button>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <Card 
                    showInfo 
                    onInfoClick={() => setExplanationKey('occupancy')}
                    className="cursor-pointer hover:border-blue-200 transition-colors"
                    onClick={() => setExplanationKey('occupancy')}
                >
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
                            <Activity size={24} />
                        </div>
                        <div>
                            <p className="text-sm text-secondary font-medium">Ocupación del Centro</p>
                            <h4 className="text-2xl font-bold text-gray-800">{stats.occupancyRate}%</h4>
                        </div>
                    </div>
                    <div className="mt-4 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                            className={`h-full rounded-full transition-all duration-1000 ${stats.occupancyRate > 80 ? 'bg-green-400' : stats.occupancyRate > 50 ? 'bg-orange-300' : 'bg-red-300'}`}
                            style={{ width: `${stats.occupancyRate}%` }}
                        />
                    </div>
                </Card>

                <Card 
                    showInfo 
                    onInfoClick={() => setExplanationKey('revenue')}
                    className="cursor-pointer hover:border-green-200 transition-colors"
                    onClick={() => setExplanationKey('revenue')}
                >
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-green-50 text-green-600 rounded-xl">
                            <DollarSign size={24} />
                        </div>
                        <div>
                            <p className="text-sm text-secondary font-medium">Ingresos Totales (Est.)</p>
                            <h4 className="text-2xl font-bold text-gray-800">{stats.totalRevenue}€</h4>
                        </div>
                    </div>
                    <div className="mt-2 text-xs text-green-600 font-medium flex items-center gap-1">
                        <TrendingUp size={12} /> +12% vs mes anterior
                    </div>
                </Card>

                <Card 
                    showInfo 
                    onInfoClick={() => setExplanationKey('margin')}
                    className="cursor-pointer hover:border-purple-200 transition-colors"
                    onClick={() => setExplanationKey('margin')}
                >
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-purple-50 text-purple-600 rounded-xl">
                            <PieIcon size={24} />
                        </div>
                        <div>
                            <p className="text-sm text-secondary font-medium">Margen Operativo</p>
                            <h4 className="text-2xl font-bold text-gray-800">{stats.operatingMargin}%</h4>
                        </div>
                    </div>
                    <p className="mt-2 text-xs text-secondary">
                        Basado en costes fijos configurados
                    </p>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Profitability Chart */}
                <Card 
                    title="Rentabilidad por Terapeuta" 
                    icon={<BarChart3 size={18} />}
                    showInfo
                    onInfoClick={() => setExplanationKey('profitability')}
                >
                    <p className="text-xs text-secondary mb-4">
                        Comparación de horas de trabajo frente a horas facturadas en terapia.
                    </p>
                    <div style={{ height: 300, width: '100%' }}>
                        <ResponsiveContainer>
                            <BarChart data={stats.profitability} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                <XAxis dataKey="therapist" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} />
                                <Tooltip content={<CustomTooltip />} />
                                <Legend wrapperStyle={{ paddingTop: 20 }} />
                                <Bar dataKey="workedHours" name="Horas Trabajadas" fill="#BCE4EA" radius={[4, 4, 0, 0]} unit="h" />
                                <Bar dataKey="billedHours" name="Horas Facturadas" fill="#A8D5BA" radius={[4, 4, 0, 0]} unit="h" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </Card>

                {/* Cancellations Chart */}
                <Card 
                    title="Análisis de Cancelaciones" 
                    icon={<Activity size={18} />}
                    showInfo
                    onInfoClick={() => setExplanationKey('cancellations')}
                >
                    <p className="text-xs text-secondary mb-4">
                        Motivos principales de citas no realizadas este mes.
                    </p>
                    <div style={{ height: 300, width: '100%' }}>
                        <ResponsiveContainer>
                            <PieChart>
                                <Pie
                                    data={stats.cancellations}
                                    cx="50%"
                                    cy="45%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    paddingAngle={5}
                                    dataKey="count"
                                    nameKey="reason"
                                >
                                    {stats.cancellations.map((_, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="rgba(255,255,255,0.2)" />
                                    ))}
                                </Pie>
                                <Tooltip />
                                <Legend layout="vertical" align="right" verticalAlign="middle" iconType="circle" />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </Card>
            </div>

            {/* Explanation Modal */}
            <Modal
                isOpen={!!explanationKey}
                onClose={() => setExplanationKey(null)}
                title={activeMetric?.title || ''}
            >
                {activeMetric && (
                    <div className="flex flex-col gap-6">
                        <div className="flex items-start gap-4 p-4 rounded-2xl bg-blue-50/50">
                            <div className="p-3 bg-white text-blue-500 rounded-xl shadow-sm">
                                <activeMetric.icon size={24} />
                            </div>
                            <div>
                                <h4 className="font-bold text-gray-800 mb-1">Definición</h4>
                                <p className="text-gray-600 text-sm leading-relaxed">{activeMetric.definition}</p>
                            </div>
                        </div>

                        <div className="p-4 rounded-2xl border border-dashed border-blue-200 bg-white">
                            <div className="flex items-center gap-2 mb-2 text-blue-600">
                                <TrendingUp size={16} />
                                <span className="font-bold text-sm">Análisis del Dato</span>
                            </div>
                            <p className="text-gray-700 text-sm italic">
                                "{activeMetric.analysis(stats)}"
                            </p>
                        </div>

                        <div className="flex justify-end">
                            <button className="btn-primary w-full sm:w-auto" onClick={() => setExplanationKey(null)}>
                                Entendido
                            </button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default AnalyticsDashboard;
