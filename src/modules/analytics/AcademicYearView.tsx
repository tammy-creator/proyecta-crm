import React from 'react';
import { 
    GraduationCap, 
    TrendingUp, 
    Wallet, 
    CreditCard, 
    Receipt, 
    CheckCircle2, 
    ChevronLeft, 
    ChevronRight, 
    ExternalLink,
    Sparkles,
    BarChart3
} from 'lucide-react';
import { 
    ResponsiveContainer, 
    ComposedChart, 
    Bar, 
    Line, 
    XAxis, 
    YAxis, 
    CartesianGrid, 
    Tooltip
} from 'recharts';
import { type AcademicYearData } from './types';

interface Props {
    yearData: AcademicYearData;
    onSelectMonth: (monthKey: string) => void;
    onChangeStartYear: (newStartYear: number) => void;
}

export const AcademicYearView: React.FC<Props> = ({
    yearData,
    onSelectMonth,
    onChangeStartYear
}) => {
    const { accumulated, months, startYear, academicYearLabel } = yearData;

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('es-ES', {
            style: 'currency',
            currency: 'EUR'
        }).format(val);
    };

    // Datos para el gráfico evolutivo del curso
    const chartData = months.map(m => ({
        name: m.shortLabel,
        monthKey: m.monthKey,
        'Ingresos Banco': m.bankIncome,
        'Cobrado CRM': m.crmCollected,
        'Gastos Banco': m.bankExpenses,
        'Neto Caja': m.bankNet,
        hasStatement: m.hasBankStatement
    }));

    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            const dataMonth = months.find(m => m.shortLabel === label);
            return (
                <div style={{
                    background: 'rgba(255, 255, 255, 0.98)',
                    backdropFilter: 'blur(10px)',
                    padding: '14px 18px',
                    borderRadius: 14,
                    border: '1px solid #e2e8f0',
                    boxShadow: '0 10px 30px rgba(0,0,0,0.1)'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, borderBottom: '1px solid #f1f5f9', paddingBottom: 6 }}>
                        <strong style={{ fontSize: 13, color: '#0f172a' }}>{dataMonth?.monthLabel || label}</strong>
                        {dataMonth?.hasBankStatement ? (
                            <span style={{ fontSize: 10, color: '#059669', background: '#ecfdf5', padding: '2px 6px', borderRadius: 6, fontWeight: 700 }}>
                                Extracto OK
                            </span>
                        ) : (
                            <span style={{ fontSize: 10, color: '#94a3b8', background: '#f8fafc', padding: '2px 6px', borderRadius: 6 }}>
                                Sin extracto
                            </span>
                        )}
                    </div>
                    {payload.map((entry: any, i: number) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, fontSize: 11, marginBottom: 4 }}>
                            <span style={{ color: entry.color, fontWeight: 600 }}>{entry.name}:</span>
                            <span style={{ fontWeight: 800, color: '#0f172a' }}>{formatCurrency(entry.value)}</span>
                        </div>
                    ))}
                    {dataMonth && (
                        <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px dashed #e2e8f0', fontSize: 11, display: 'flex', justifyContent: 'space-between', color: '#64748b' }}>
                            <span>Sesiones CRM:</span>
                            <strong style={{ color: '#3b82f6' }}>{dataMonth.sessionsCount} citas</strong>
                        </div>
                    )}
                </div>
            );
        }
        return null;
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {/* Header del Curso Escolar */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '1rem',
                background: '#fff',
                border: '1px solid #e2e8f0',
                borderRadius: 18,
                padding: '1.25rem 1.5rem',
                boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                        padding: 10,
                        borderRadius: 14,
                        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
                    }}>
                        <GraduationCap size={24} />
                    </div>
                    <div>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                            {academicYearLabel}
                        </h3>
                        <p style={{ fontSize: '0.8rem', color: '#64748b', margin: 0, marginTop: 2 }}>
                            Ciclo anual completo adaptado al calendario clínico y escolar de Centro Proyecta
                        </p>
                    </div>
                </div>

                {/* Selector de Curso */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                        onClick={() => onChangeStartYear(startYear - 1)}
                        style={{
                            padding: '0.45rem 0.65rem',
                            background: '#f8fafc',
                            border: '1px solid #e2e8f0',
                            borderRadius: 10,
                            cursor: 'pointer',
                            color: '#64748b',
                            display: 'flex',
                            alignItems: 'center'
                        }}
                        title="Curso anterior"
                    >
                        <ChevronLeft size={16} />
                    </button>
                    <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#1e293b', padding: '0 0.5rem' }}>
                        Curso {startYear} - {startYear + 1}
                    </span>
                    <button
                        onClick={() => onChangeStartYear(startYear + 1)}
                        style={{
                            padding: '0.45rem 0.65rem',
                            background: '#f8fafc',
                            border: '1px solid #e2e8f0',
                            borderRadius: 10,
                            cursor: 'pointer',
                            color: '#64748b',
                            display: 'flex',
                            alignItems: 'center'
                        }}
                        title="Curso siguiente"
                    >
                        <ChevronRight size={16} />
                    </button>
                </div>
            </div>

            {/* KPIs Acumulados del Curso */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '1.25rem'
            }}>
                {/* 1. Cobrado CRM */}
                <div className="card" style={{ padding: '1.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <div style={{ padding: 8, borderRadius: 10, background: '#eff6ff', color: '#3b82f6' }}>
                            <CreditCard size={18} />
                        </div>
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Cobrado Efectivo CRM
                        </span>
                    </div>
                    <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#0f172a' }}>
                        {formatCurrency(accumulated.totalCrmCollected)}
                    </div>
                    <div style={{ marginTop: 6, fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>
                        {accumulated.overallCollectionRate}% de cobro ({formatCurrency(accumulated.totalCrmPending)} pendientes)
                    </div>
                </div>

                {/* 2. Ingresos Banco */}
                <div className="card" style={{ padding: '1.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <div style={{ padding: 8, borderRadius: 10, background: '#ecfdf5', color: '#10b981' }}>
                            <Wallet size={18} />
                        </div>
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Ingresos en Cuenta
                        </span>
                    </div>
                    <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#10b981' }}>
                        +{formatCurrency(accumulated.totalBankIncome)}
                    </div>
                    <div style={{ marginTop: 6, fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>
                        Media: ~{formatCurrency(accumulated.averageMonthlyIncome)}/mes
                    </div>
                </div>

                {/* 3. Gastos Reales */}
                <div className="card" style={{ padding: '1.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <div style={{ padding: 8, borderRadius: 10, background: '#fef2f2', color: '#ef4444' }}>
                            <Receipt size={18} />
                        </div>
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Gastos de Explotación
                        </span>
                    </div>
                    <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#ef4444' }}>
                        -{formatCurrency(accumulated.totalBankExpenses)}
                    </div>
                    <div style={{ marginTop: 6, fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>
                        Media: ~{formatCurrency(accumulated.averageMonthlyExpenses)}/mes
                    </div>
                </div>

                {/* 4. Beneficio Neto y Margen */}
                <div className="card" style={{ padding: '1.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <div style={{
                            padding: 8,
                            borderRadius: 10,
                            background: accumulated.totalBankNet >= 0 ? '#ecfdf5' : '#fef2f2',
                            color: accumulated.totalBankNet >= 0 ? '#059669' : '#dc2626'
                        }}>
                            <TrendingUp size={18} />
                        </div>
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Resultado Neto Curso
                        </span>
                    </div>
                    <div style={{
                        fontSize: '1.6rem',
                        fontWeight: 900,
                        color: accumulated.totalBankNet >= 0 ? '#059669' : '#dc2626'
                    }}>
                        {accumulated.totalBankNet > 0 ? '+' : ''}{formatCurrency(accumulated.totalBankNet)}
                    </div>
                    <div style={{ marginTop: 6, fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>
                        Margen acumulado: {accumulated.overallMarginPercent}%
                    </div>
                </div>

                {/* 5. Sesiones Totales */}
                <div className="card" style={{ padding: '1.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <div style={{ padding: 8, borderRadius: 10, background: '#faf5ff', color: '#9333ea' }}>
                            <BarChart3 size={18} />
                        </div>
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Sesiones Realizadas
                        </span>
                    </div>
                    <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#0f172a' }}>
                        {accumulated.totalSessions.toLocaleString('es-ES')}
                    </div>
                    <div style={{ marginTop: 6, fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>
                        En {accumulated.activeMonthsWithData} meses con actividad
                    </div>
                </div>
            </div>

            {/* Gráfico Evolutivo del Curso (13 meses: Sep a Sep) */}
            <div className="card" style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                    <div>
                        <h4 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#1e293b', margin: 0 }}>
                            Evolución Mensual del Curso ({startYear} - {startYear + 1})
                        </h4>
                        <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: 0, marginTop: 2 }}>
                            Comparación de ingresos bancarios, cobros de sesiones y gastos de septiembre a septiembre
                        </p>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '0.75rem' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#10b981', fontWeight: 700 }}>
                            <span style={{ width: 10, height: 10, background: '#10b981', borderRadius: 2 }} /> Ingresos Banco
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#3b82f6', fontWeight: 700 }}>
                            <span style={{ width: 10, height: 10, background: '#3b82f6', borderRadius: 2 }} /> Cobrado CRM
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#ef4444', fontWeight: 700 }}>
                            <span style={{ width: 10, height: 10, background: '#ef4444', borderRadius: 2 }} /> Gastos Banco
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#8b5cf6', fontWeight: 700 }}>
                            <span style={{ width: 10, height: 2, background: '#8b5cf6' }} /> Neto de Caja
                        </span>
                    </div>
                </div>

                <div style={{ height: 320, width: '100%' }}>
                    <ResponsiveContainer minWidth={0}>
                        <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b', fontWeight: 700 }} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                            <Tooltip content={<CustomTooltip />} />
                            <Bar dataKey="Ingresos Banco" fill="#10b981" radius={[4, 4, 0, 0]} barSize={12} />
                            <Bar dataKey="Cobrado CRM" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={12} />
                            <Bar dataKey="Gastos Banco" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={12} />
                            <Line type="monotone" dataKey="Neto Caja" stroke="#8b5cf6" strokeWidth={2.5} dot={{ r: 3, fill: '#8b5cf6' }} />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Tabla Detallada Mes a Mes del Curso */}
            <div className="card" style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                    <h4 style={{ fontSize: '1rem', fontWeight: 800, color: '#1e293b', margin: 0 }}>
                        Detalle Mes a Mes del Curso Escolar
                    </h4>
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                        13 periodos (Septiembre a Septiembre)
                    </span>
                </div>

                <div style={{ overflowX: 'auto', border: '1px solid #f1f5f9', borderRadius: 14 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem' }}>
                        <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                            <tr>
                                <th style={{ padding: '12px 14px', color: '#64748b', fontWeight: 700 }}>Mes</th>
                                <th style={{ padding: '12px 14px', color: '#64748b', fontWeight: 700, textAlign: 'center' }}>Extracto</th>
                                <th style={{ padding: '12px 14px', color: '#64748b', fontWeight: 700, textAlign: 'right' }}>Ingresos Banco</th>
                                <th style={{ padding: '12px 14px', color: '#64748b', fontWeight: 700, textAlign: 'right' }}>Gastos Banco</th>
                                <th style={{ padding: '12px 14px', color: '#64748b', fontWeight: 700, textAlign: 'right' }}>Neto Banco</th>
                                <th style={{ padding: '12px 14px', color: '#64748b', fontWeight: 700, textAlign: 'right' }}>Cobros CRM</th>
                                <th style={{ padding: '12px 14px', color: '#64748b', fontWeight: 700, textAlign: 'right' }}>Pte. CRM</th>
                                <th style={{ padding: '12px 14px', color: '#64748b', fontWeight: 700, textAlign: 'center' }}>Sesiones</th>
                                <th style={{ padding: '12px 14px', color: '#64748b', fontWeight: 700, textAlign: 'center' }}>Acción</th>
                            </tr>
                        </thead>
                        <tbody>
                            {months.map((m, idx) => (
                                <tr
                                    key={m.monthKey}
                                    style={{
                                        borderBottom: '1px solid #f8fafc',
                                        background: idx % 2 === 0 ? '#fff' : '#fafafa'
                                    }}
                                >
                                    <td style={{ padding: '12px 14px', fontWeight: 700, color: '#1e293b' }}>
                                        {m.monthLabel}
                                    </td>
                                    <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                                        {m.hasBankStatement ? (
                                            <span style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: 4,
                                                fontSize: '0.7rem',
                                                fontWeight: 700,
                                                color: '#059669',
                                                background: '#ecfdf5',
                                                padding: '2px 8px',
                                                borderRadius: 12
                                            }}>
                                                <CheckCircle2 size={12} /> Subido
                                            </span>
                                        ) : (
                                            <span style={{
                                                fontSize: '0.7rem',
                                                fontWeight: 600,
                                                color: '#94a3b8',
                                                background: '#f1f5f9',
                                                padding: '2px 8px',
                                                borderRadius: 12
                                            }}>
                                                Pendiente
                                            </span>
                                        )}
                                    </td>
                                    <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: m.bankIncome > 0 ? '#10b981' : '#94a3b8' }}>
                                        {m.bankIncome > 0 ? `+${formatCurrency(m.bankIncome)}` : '—'}
                                    </td>
                                    <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: m.bankExpenses > 0 ? '#ef4444' : '#94a3b8' }}>
                                        {m.bankExpenses > 0 ? `-${formatCurrency(m.bankExpenses)}` : '—'}
                                    </td>
                                    <td style={{
                                        padding: '12px 14px',
                                        textAlign: 'right',
                                        fontWeight: 800,
                                        color: m.hasBankStatement
                                            ? (m.bankNet >= 0 ? '#059669' : '#dc2626')
                                            : '#94a3b8'
                                    }}>
                                        {m.hasBankStatement
                                            ? `${m.bankNet > 0 ? '+' : ''}${formatCurrency(m.bankNet)}`
                                            : '—'
                                        }
                                    </td>
                                    <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: '#3b82f6' }}>
                                        {m.crmCollected > 0 ? formatCurrency(m.crmCollected) : '—'}
                                    </td>
                                    <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 600, color: m.crmPending > 0 ? '#ef4444' : '#94a3b8' }}>
                                        {m.crmPending > 0 ? formatCurrency(m.crmPending) : '0 €'}
                                    </td>
                                    <td style={{ padding: '12px 14px', textAlign: 'center', color: '#64748b', fontWeight: 600 }}>
                                        {m.sessionsCount}
                                    </td>
                                    <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                                        <button
                                            onClick={() => onSelectMonth(m.monthKey)}
                                            style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: 4,
                                                padding: '4px 8px',
                                                background: '#eff6ff',
                                                border: '1px solid #bfdbfe',
                                                borderRadius: 8,
                                                color: '#1d4ed8',
                                                fontSize: '0.72rem',
                                                fontWeight: 700,
                                                cursor: 'pointer'
                                            }}
                                        >
                                            Ver Mes <ExternalLink size={11} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Diagnóstico Estratégico y Estacionalidad del Curso (IA) */}
            <div style={{
                background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)',
                borderRadius: 18,
                padding: '1.75rem',
                color: '#fff',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
                boxShadow: '0 10px 30px rgba(30, 27, 75, 0.25)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ padding: 8, borderRadius: 12, background: 'rgba(255,255,255,0.1)', color: '#a5b4fc' }}>
                        <Sparkles size={20} />
                    </div>
                    <div>
                        <h4 style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0, color: '#fff' }}>
                            Visión Estratégica y Estacionalidad del Curso Escolar
                        </h4>
                        <p style={{ fontSize: '0.75rem', color: '#c7d2fe', margin: 0, marginTop: 2 }}>
                            Patrones y previsiones para optimizar la rentabilidad anual de Centro Proyecta
                        </p>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginTop: 4 }}>
                    <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: '12px 14px', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <strong style={{ color: '#818cf8', fontSize: '0.8rem', display: 'block', marginBottom: 4 }}>
                            1. Inicio de Curso (Sep - Oct):
                        </strong>
                        <p style={{ fontSize: '0.75rem', color: '#e0e7ff', margin: 0, lineHeight: 1.5 }}>
                            Periodo de alta demanda y formalización de horarios. Maximizar la ocupación fija desde octubre garantiza la estabilidad de ingresos durante los siguientes 8 meses.
                        </p>
                    </div>

                    <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: '12px 14px', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <strong style={{ color: '#818cf8', fontSize: '0.8rem', display: 'block', marginBottom: 4 }}>
                            2. Maduración y Pico (Nov - May):
                        </strong>
                        <p style={{ fontSize: '0.75rem', color: '#e0e7ff', margin: 0, lineHeight: 1.5 }}>
                            Meses de máxima productividad. Mantener el índice de cancelaciones por debajo del 8% mediante confirmaciones por WhatsApp protege hasta ~1.200 € mensuales de caja.
                        </p>
                    </div>

                    <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: '12px 14px', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <strong style={{ color: '#818cf8', fontSize: '0.8rem', display: 'block', marginBottom: 4 }}>
                            3. Cierre y Verano (Jun - Ago):
                        </strong>
                        <p style={{ fontSize: '0.75rem', color: '#e0e7ff', margin: 0, lineHeight: 1.5 }}>
                            Generar un colchón de tesorería del 20% en los meses fuertes compensa el descenso de actividad de julio/agosto sin comprometer nóminas ni gastos de estructura.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AcademicYearView;
