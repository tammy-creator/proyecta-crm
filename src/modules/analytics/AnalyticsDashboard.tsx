import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { BarChart3, TrendingUp, PieChart as PieIcon, Activity, Download, DollarSign } from 'lucide-react';
import Card from '../../components/ui/Card';
import { getAnalyticsData, type KPIStats } from './service';

const AnalyticsDashboard: React.FC = () => {
    const [stats, setStats] = useState<KPIStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [month] = useState(new Date());

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

    // --- Helpers for Charts ---

    // Simple SVG Pie Chart
    const renderPieChart = (data: { reason: string; count: number }[]) => {
        const total = data.reduce((acc, curr) => acc + curr.count, 0);
        if (total === 0) return <div className="text-center text-sm text-secondary p-4">No hay cancelaciones registradas este mes.</div>;

        let cumulativePercent = 0;
        const colors = ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF'];

        return (
            <div className="flex items-center gap-8 justify-center">
                <div style={{ position: 'relative', width: '150px', height: '150px' }}>
                    <svg viewBox="-1 -1 2 2" style={{ transform: 'rotate(-90deg)' }}>
                        {data.map((slice, i) => {
                            const percent = slice.count / total;
                            const startX = Math.cos(2 * Math.PI * cumulativePercent);
                            const startY = Math.sin(2 * Math.PI * cumulativePercent);
                            cumulativePercent += percent;
                            const endX = Math.cos(2 * Math.PI * cumulativePercent);
                            const endY = Math.sin(2 * Math.PI * cumulativePercent);
                            const largeArcFlag = percent > 0.5 ? 1 : 0;
                            const pathData = `M 0 0 L ${startX} ${startY} A 1 1 0 ${largeArcFlag} 1 ${endX} ${endY} Z`;
                            return (
                                <path key={i} d={pathData} fill={colors[i % colors.length]} />
                            );
                        })}
                    </svg>
                </div>
                <div className="flex flex-col gap-2 text-sm">
                    {data.map((slice, i) => (
                        <div key={i} className="flex items-center gap-2">
                            <span style={{ width: 10, height: 10, backgroundColor: colors[i % colors.length], borderRadius: '50%' }}></span>
                            <span className="font-medium text-gray-700">{slice.reason}</span>
                            <span className="text-secondary">({Math.round((slice.count / total) * 100)}%)</span>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    // Simple CSS Bar Chart for Profitability
    const renderBarChart = (data: KPIStats['profitability']) => {
        const rawMax = Math.max(...data.map(d => Math.max(d.workedHours, d.billedHours)));
        const maxVal = rawMax > 0 ? rawMax : 1;

        return (
            <div className="flex flex-col gap-6 w-full pt-4">
                {data.map((item, i) => (
                    <div key={i} className="flex flex-col gap-1">
                        <div className="flex justify-between text-sm font-semibold text-gray-700 mb-1">
                            <span>{item.therapist}</span>
                            <span className="text-green-600">{item.revenue}€ generados</span>
                        </div>

                        {/* Worked Hours Bar */}
                        <div className="flex items-center gap-2 text-xs text-secondary">
                            <div className="w-16">Trabajadas</div>
                            <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-blue-400 rounded-full"
                                    style={{ width: `${(item.workedHours / maxVal) * 100}%` }}
                                ></div>
                            </div>
                            <div className="w-8 text-right">{item.workedHours}h</div>
                        </div>

                        {/* Billed Hours Bar */}
                        <div className="flex items-center gap-2 text-xs text-secondary">
                            <div className="w-16 font-medium text-gray-700">Facturadas</div>
                            <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-green-500 rounded-full"
                                    style={{ width: `${(item.billedHours / maxVal) * 100}%` }}
                                ></div>
                            </div>
                            <div className="w-8 text-right font-medium text-gray-700">{item.billedHours}h</div>
                        </div>
                    </div>
                ))}
            </div>
        );
    };

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
                <Card>
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
                            className={`h-full rounded-full ${stats.occupancyRate > 80 ? 'bg-green-500' : stats.occupancyRate > 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                            style={{ width: `${stats.occupancyRate}%` }}
                        />
                    </div>
                </Card>

                <Card>
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

                <Card>
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
                <Card title="Rentabilidad por Terapeuta" icon={<BarChart3 size={18} />}>
                    <p className="text-xs text-secondary mb-4">
                        Comparativa de horas trabajadas (Workforce) vs horas facturadas (Agenda).
                    </p>
                    {renderBarChart(stats.profitability)}
                </Card>

                {/* Cancellations Chart */}
                <Card title="Análisis de Cancelaciones" icon={<Activity size={18} />}>
                    <p className="text-xs text-secondary mb-4">
                        Motivos principales de pérdida de citas.
                    </p>
                    {renderPieChart(stats.cancellations)}
                </Card>
            </div>
        </div>
    );
};

export default AnalyticsDashboard;
