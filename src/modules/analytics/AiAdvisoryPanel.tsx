import React, { useState } from 'react';
import { 
    BrainCircuit, 
    Sparkles, 
    TrendingUp, 
    AlertTriangle, 
    CheckCircle2, 
    RefreshCw, 
    ArrowRight, 
    DollarSign, 
    Users, 
    CalendarX, 
    Zap
} from 'lucide-react';
import { type AiHealthDiagnosis, type AiInsight } from './types';
import { useToast } from '../../hooks/useToast';

interface Props {
    diagnosis: AiHealthDiagnosis;
    monthLabel: string;
    onRefresh: () => void;
}

export const AiAdvisoryPanel: React.FC<Props> = ({
    diagnosis,
    monthLabel,
    onRefresh
}) => {
    const { showToast } = useToast();
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

    const handleRefresh = () => {
        setIsRefreshing(true);
        setTimeout(() => {
            onRefresh();
            setIsRefreshing(false);
            showToast('Diagnóstico IA actualizado con los últimos datos.', 'success');
        }, 600);
    };

    const getScoreColor = (score: number) => {
        if (score >= 85) return '#10b981';
        if (score >= 70) return '#3b82f6';
        if (score >= 50) return '#f59e0b';
        return '#ef4444';
    };

    const getCategoryIcon = (category: string) => {
        switch (category) {
            case 'COBROS': return <DollarSign size={14} />;
            case 'GASTOS': return <TrendingUp size={14} />;
            case 'PRODUCTIVIDAD': return <Users size={14} />;
            case 'CANCELACIONES': return <CalendarX size={14} />;
            default: return <Zap size={14} />;
        }
    };

    const getSeverityBadge = (severity: string) => {
        switch (severity) {
            case 'HIGH':
                return { label: 'Prioridad Alta', bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' };
            case 'MEDIUM':
                return { label: 'Impacto Medio', bg: '#fffbeb', color: '#b45309', border: '#fde68a' };
            case 'TIP':
                return { label: 'Consejo Proyecta', bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' };
            default:
                return { label: 'Optimización', bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' };
        }
    };

    const filteredInsights = selectedCategory === 'ALL'
        ? diagnosis.insights
        : diagnosis.insights.filter(i => i.category === selectedCategory);

    const scoreColor = getScoreColor(diagnosis.score);

    return (
        <div style={{
            background: 'linear-gradient(135deg, #0b1329 0%, #111d42 100%)',
            borderRadius: 20,
            padding: '2rem',
            color: '#fff',
            position: 'relative',
            overflow: 'hidden',
            boxShadow: '0 20px 50px rgba(11, 19, 41, 0.4)',
            marginBottom: '2rem',
            border: '1px solid rgba(255, 255, 255, 0.08)'
        }}>
            {/* Glows decorativos de fondo */}
            <div style={{ position: 'absolute', top: -80, right: -80, width: 260, height: 260, background: 'radial-gradient(circle, rgba(59, 130, 246, 0.25) 0%, transparent 70%)', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', bottom: -60, left: -60, width: 220, height: 220, background: 'radial-gradient(circle, rgba(16, 185, 129, 0.15) 0%, transparent 70%)', pointerEvents: 'none' }} />

            {/* Cabecera del Asesor */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '1rem',
                borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                paddingBottom: '1.25rem',
                marginBottom: '1.75rem',
                position: 'relative',
                zIndex: 1
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                        padding: 10,
                        borderRadius: 14,
                        background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 4px 14px rgba(59, 130, 246, 0.4)'
                    }}>
                        <BrainCircuit size={24} />
                    </div>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: '#fff', letterSpacing: '-0.01em' }}>
                                Consejero Clínico & Financiero IA
                            </h3>
                            <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                background: 'rgba(59, 130, 246, 0.2)',
                                border: '1px solid rgba(59, 130, 246, 0.4)',
                                color: '#93c5fd',
                                fontSize: '0.65rem',
                                fontWeight: 800,
                                padding: '2px 8px',
                                borderRadius: 20,
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em'
                            }}>
                                <Sparkles size={11} /> Auditoría Proyecta
                            </span>
                        </div>
                        <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: 0, marginTop: 4 }}>
                            Diagnóstico integral de salud operativa, fugas de liquidez y oportunidades de mejora para {monthLabel}
                        </p>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <button
                        onClick={handleRefresh}
                        disabled={isRefreshing}
                        style={{
                            background: 'rgba(255, 255, 255, 0.08)',
                            border: '1px solid rgba(255, 255, 255, 0.15)',
                            borderRadius: 12,
                            padding: '0.5rem 0.9rem',
                            color: '#e2e8f0',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            transition: 'all 0.2s'
                        }}
                    >
                        <RefreshCw size={13} style={{ animation: isRefreshing ? 'spin 1s linear infinite' : 'none' }} />
                        {isRefreshing ? 'Auditando...' : 'Re-analizar Mes'}
                    </button>
                </div>
            </div>

            {/* Score y Diagnóstico Ejecutivo */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'auto 1fr',
                gap: '1.75rem',
                alignItems: 'center',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                borderRadius: 16,
                padding: '1.5rem',
                marginBottom: '1.75rem',
                position: 'relative',
                zIndex: 1
            }}>
                {/* Circular Score Badge */}
                <div style={{
                    width: 110,
                    height: 110,
                    borderRadius: '50%',
                    background: `radial-gradient(circle, rgba(15, 23, 42, 0.8) 0%, rgba(15, 23, 42, 0.4) 100%)`,
                    border: `4px solid ${scoreColor}`,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: `0 0 30px ${scoreColor}40`,
                    flexShrink: 0
                }}>
                    <span style={{ fontSize: '1.9rem', fontWeight: 900, color: '#fff', lineHeight: 1 }}>
                        {diagnosis.score}
                    </span>
                    <span style={{ fontSize: '0.65rem', fontWeight: 700, color: scoreColor, marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Puntos / 100
                    </span>
                </div>

                {/* Resumen Ejecutivo */}
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <span style={{
                            padding: '3px 10px',
                            borderRadius: 12,
                            fontSize: '0.7rem',
                            fontWeight: 800,
                            background: `${scoreColor}25`,
                            color: scoreColor,
                            border: `1px solid ${scoreColor}50`,
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em'
                        }}>
                            {diagnosis.title}
                        </span>
                    </div>
                    <p style={{ fontSize: '0.9rem', color: '#e2e8f0', lineHeight: 1.6, margin: 0, fontWeight: 500 }}>
                        {diagnosis.summary}
                    </p>

                    {/* Bullets de fortalezas y alertas críticas */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.75rem', marginTop: 14 }}>
                        {diagnosis.strengths.slice(0, 2).map((s, idx) => (
                            <div key={`str-${idx}`} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: '0.75rem', color: '#a7f3d0' }}>
                                <CheckCircle2 size={15} style={{ flexShrink: 0, marginTop: 2, color: '#34d399' }} />
                                <span>{s}</span>
                            </div>
                        ))}
                        {diagnosis.criticalAlerts.slice(0, 2).map((a, idx) => (
                            <div key={`alt-${idx}`} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: '0.75rem', color: '#fca5a5' }}>
                                <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 2, color: '#f87171' }} />
                                <span>{a}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Filtros de Categoría de Consejos */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1.25rem', flexWrap: 'wrap', position: 'relative', zIndex: 1 }}>
                <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Filtrar Consejos:
                </span>
                {[
                    { id: 'ALL', label: `Todos (${diagnosis.insights.length})` },
                    { id: 'COBROS', label: 'Cobros y Pagos' },
                    { id: 'GASTOS', label: 'Costes y Banco' },
                    { id: 'PRODUCTIVIDAD', label: 'Terapeutas y Agenda' },
                    { id: 'CANCELACIONES', label: 'Cancelaciones' }
                ].map(cat => (
                    <button
                        key={cat.id}
                        onClick={() => setSelectedCategory(cat.id)}
                        style={{
                            padding: '4px 12px',
                            borderRadius: 14,
                            border: '1px solid',
                            borderColor: selectedCategory === cat.id ? '#3b82f6' : 'rgba(255,255,255,0.1)',
                            background: selectedCategory === cat.id ? '#3b82f6' : 'rgba(255,255,255,0.04)',
                            color: selectedCategory === cat.id ? '#fff' : '#cbd5e1',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            transition: 'all 0.15s'
                        }}
                    >
                        {cat.label}
                    </button>
                ))}
            </div>

            {/* Listado de Consejos Accionables */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                gap: '1rem',
                position: 'relative',
                zIndex: 1
            }}>
                {filteredInsights.length === 0 ? (
                    <div style={{ gridColumn: '1 / -1', padding: '2rem', textAlign: 'center', color: '#94a3b8', background: 'rgba(255,255,255,0.02)', borderRadius: 14 }}>
                        <CheckCircle2 size={24} style={{ margin: '0 auto 8px', color: '#34d399' }} />
                        <p style={{ margin: 0, fontSize: '0.85rem' }}>No hay alertas activas en esta categoría para {monthLabel}.</p>
                    </div>
                ) : (
                    filteredInsights.map((insight: AiInsight) => {
                        const sev = getSeverityBadge(insight.severity);
                        return (
                            <div
                                key={insight.id}
                                style={{
                                    background: 'rgba(255, 255, 255, 0.04)',
                                    border: '1px solid rgba(255, 255, 255, 0.08)',
                                    borderRadius: 14,
                                    padding: '1.25rem',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'space-between',
                                    transition: 'transform 0.2s, border-color 0.2s'
                                }}
                            >
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                        <span style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 4,
                                            fontSize: '0.65rem',
                                            fontWeight: 800,
                                            color: '#93c5fd',
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.05em'
                                        }}>
                                            {getCategoryIcon(insight.category)} {insight.category}
                                        </span>
                                        <span style={{
                                            fontSize: '0.65rem',
                                            fontWeight: 800,
                                            padding: '2px 8px',
                                            borderRadius: 10,
                                            background: sev.bg,
                                            color: sev.color,
                                            border: `1px solid ${sev.border}`
                                        }}>
                                            {sev.label}
                                        </span>
                                    </div>

                                    <h4 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#fff', margin: 0, marginBottom: 6, lineHeight: 1.3 }}>
                                        {insight.title}
                                    </h4>

                                    <p style={{ fontSize: '0.78rem', color: '#94a3b8', lineHeight: 1.5, margin: 0, marginBottom: 12 }}>
                                        {insight.description}
                                    </p>
                                </div>

                                <div>
                                    <div style={{
                                        background: 'rgba(59, 130, 246, 0.1)',
                                        border: '1px solid rgba(59, 130, 246, 0.25)',
                                        borderRadius: 10,
                                        padding: '8px 10px',
                                        fontSize: '0.74rem',
                                        color: '#bfdbfe',
                                        display: 'flex',
                                        alignItems: 'flex-start',
                                        gap: 6,
                                        lineHeight: 1.4
                                    }}>
                                        <ArrowRight size={13} style={{ flexShrink: 0, marginTop: 2, color: '#60a5fa' }} />
                                        <div>
                                            <strong style={{ color: '#fff' }}>Acción sugerida: </strong>
                                            {insight.actionableRecommendation}
                                        </div>
                                    </div>

                                    {insight.estimatedImpact && (
                                        <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
                                            <span style={{
                                                fontSize: '0.68rem',
                                                fontWeight: 800,
                                                color: '#34d399',
                                                background: 'rgba(16, 185, 129, 0.15)',
                                                padding: '2px 8px',
                                                borderRadius: 6,
                                                border: '1px solid rgba(52, 211, 153, 0.25)'
                                            }}>
                                                Impacto: {insight.estimatedImpact}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
};

export default AiAdvisoryPanel;
