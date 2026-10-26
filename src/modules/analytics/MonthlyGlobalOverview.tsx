import React, { useState } from 'react';
import { 
    Wallet, 
    CreditCard, 
    AlertCircle, 
    CheckCircle2, 
    ArrowUpRight, 
    ArrowDownRight, 
    ChevronDown, 
    ChevronUp, 
    Eye, 
    Users, 
    Clock,
    Scale,
    Receipt
} from 'lucide-react';
import { type MonthlyStatementData, type MonthlyCollectionSummary } from './types';
import Modal from '../../components/ui/Modal';

interface Props {
    monthLabel: string;
    statement: MonthlyStatementData | null;
    collection: MonthlyCollectionSummary;
    onOpenMovements: () => void;
}

export const MonthlyGlobalOverview: React.FC<Props> = ({
    monthLabel,
    statement,
    collection,
    onOpenMovements
}) => {
    const [showMethods, setShowMethods] = useState(false);
    const [showPendingModal, setShowPendingModal] = useState(false);

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('es-ES', {
            style: 'currency',
            currency: 'EUR'
        }).format(val);
    };

    const diffBankCrm = statement ? statement.totalIncome - collection.totalCollected : 0;
    const isPositiveNet = statement ? statement.netResult >= 0 : true;

    return (
        <div style={{
            background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
            border: '1px solid #e2e8f0',
            borderRadius: 20,
            padding: '1.75rem',
            marginBottom: '2rem',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.03)'
        }}>
            {/* Header del bloque */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '1rem',
                borderBottom: '1px solid #f1f5f9',
                paddingBottom: '1rem',
                marginBottom: '1.5rem'
            }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                            padding: 8,
                            borderRadius: 12,
                            background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                            color: '#fff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 2px 8px rgba(59, 130, 246, 0.3)'
                        }}>
                            <Scale size={20} />
                        </div>
                        <div>
                            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                                Visión Global del Mes · {monthLabel}
                            </h3>
                            <p style={{ fontSize: '0.8rem', color: '#64748b', margin: 0, marginTop: 2 }}>
                                Conciliación integral entre cobros efectivos del CRM y tesorería bancaria
                            </p>
                        </div>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                    {statement ? (
                        <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            background: '#ecfdf5',
                            color: '#059669',
                            border: '1px solid #a7f3d0',
                            padding: '4px 12px',
                            borderRadius: 20,
                            fontSize: '0.75rem',
                            fontWeight: 700
                        }}>
                            <CheckCircle2 size={14} /> Extracto Bancario Conciliado
                        </span>
                    ) : (
                        <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            background: '#fffbeb',
                            color: '#d97706',
                            border: '1px solid #fde68a',
                            padding: '4px 12px',
                            borderRadius: 20,
                            fontSize: '0.75rem',
                            fontWeight: 700
                        }}>
                            <Clock size={14} /> Solo Datos de CRM (Sin Extracto de Banco)
                        </span>
                    )}

                    {collection.totalPending > 0 && (
                        <button
                            onClick={() => setShowPendingModal(true)}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                                background: '#fef2f2',
                                color: '#b91c1c',
                                border: '1px solid #fecaca',
                                padding: '4px 12px',
                                borderRadius: 20,
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                cursor: 'pointer'
                            }}
                        >
                            <AlertCircle size={14} />
                            {formatCurrency(collection.totalPending)} pendientes ({collection.pendingPatients.length} familias)
                        </button>
                    )}
                </div>
            </div>

            {/* Grid 3 Columnas: Cobros CRM | Banco | Conciliación */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                gap: '1.25rem'
            }}>
                {/* 1. COBROS EFECTIVOS CRM */}
                <div style={{
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: 16,
                    padding: '1.25rem',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between'
                }}>
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{ padding: 6, borderRadius: 10, background: '#eff6ff', color: '#3b82f6' }}>
                                    <CreditCard size={18} />
                                </div>
                                <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#1e293b' }}>
                                    Cobros Efectivos (CRM)
                                </span>
                            </div>
                            <span style={{
                                fontSize: '0.75rem',
                                fontWeight: 800,
                                padding: '2px 8px',
                                borderRadius: 6,
                                background: collection.collectionRate >= 90 ? '#ecfdf5' : '#fef3c7',
                                color: collection.collectionRate >= 90 ? '#059669' : '#d97706'
                            }}>
                                {collection.collectionRate}% Cobrado
                            </span>
                        </div>

                        <div style={{ marginBottom: 14 }}>
                            <p style={{ fontSize: '0.7rem', color: '#64748b', margin: 0, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>
                                Recaudado en Sesiones
                            </p>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
                                <span style={{ fontSize: '1.75rem', fontWeight: 900, color: '#0f172a' }}>
                                    {formatCurrency(collection.totalCollected)}
                                </span>
                                <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>
                                    de {formatCurrency(collection.totalBilled)}
                                </span>
                            </div>
                        </div>

                        {/* Barra de progreso de cobro */}
                        <div style={{ height: 6, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden', marginBottom: 14 }}>
                            <div style={{
                                height: '100%',
                                width: `${collection.collectionRate}%`,
                                background: collection.collectionRate >= 90 ? '#10b981' : '#f59e0b',
                                borderRadius: 4,
                                transition: 'width 0.8s ease'
                            }} />
                        </div>

                        {/* Fila de desglose rápido */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: '0.75rem' }}>
                            <div style={{ padding: '8px 10px', background: '#f8fafc', borderRadius: 10, border: '1px solid #f1f5f9' }}>
                                <span style={{ color: '#64748b', display: 'block', marginBottom: 2 }}>Sesiones Cobradas</span>
                                <strong style={{ color: '#10b981', fontSize: '0.85rem' }}>
                                    {collection.paidSessionsCount} citas
                                </strong>
                            </div>
                            <div style={{ padding: '8px 10px', background: '#f8fafc', borderRadius: 10, border: '1px solid #f1f5f9' }}>
                                <span style={{ color: '#64748b', display: 'block', marginBottom: 2 }}>Sin Cobrar / Fin Mes</span>
                                <strong style={{ color: collection.totalPending > 0 ? '#ef4444' : '#10b981', fontSize: '0.85rem' }}>
                                    {collection.pendingSessionsCount} citas ({formatCurrency(collection.totalPending)})
                                </strong>
                            </div>
                        </div>
                    </div>

                    {/* Desplegable de Métodos de Pago */}
                    <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
                        <button
                            onClick={() => setShowMethods(!showMethods)}
                            style={{
                                background: 'none',
                                border: 'none',
                                padding: 0,
                                fontSize: '0.75rem',
                                color: '#3b82f6',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4,
                                width: '100%',
                                justifyContent: 'space-between'
                            }}
                        >
                            <span>Ver {collection.byMethod.length} métodos de cobro</span>
                            {showMethods ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>

                        {showMethods && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                                {collection.byMethod.map((m, idx) => (
                                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem', color: '#475569', padding: '4px 6px', background: '#f8fafc', borderRadius: 6 }}>
                                        <span style={{ fontWeight: 600 }}>{m.method} ({m.count})</span>
                                        <span style={{ fontWeight: 800 }}>{formatCurrency(m.amount)} ({m.percentage}%)</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* 2. FLUJO DE CAJA BANCO (Tesorería) */}
                <div style={{
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: 16,
                    padding: '1.25rem',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between'
                }}>
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{ padding: 6, borderRadius: 10, background: '#f0fdf4', color: '#16a34a' }}>
                                    <Wallet size={18} />
                                </div>
                                <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#1e293b' }}>
                                    Tesorería Real (Banco)
                                </span>
                            </div>
                            {statement && (
                                <span style={{
                                    fontSize: '0.75rem',
                                    fontWeight: 800,
                                    padding: '2px 8px',
                                    borderRadius: 6,
                                    background: isPositiveNet ? '#ecfdf5' : '#fef2f2',
                                    color: isPositiveNet ? '#059669' : '#dc2626'
                                }}>
                                    Margen {statement.realMargin}%
                                </span>
                            )}
                        </div>

                        {statement ? (
                            <>
                                <div style={{ marginBottom: 14 }}>
                                    <p style={{ fontSize: '0.7rem', color: '#64748b', margin: 0, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>
                                        Resultado Limpio de Caja
                                    </p>
                                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
                                        <span style={{
                                            fontSize: '1.75rem',
                                            fontWeight: 900,
                                            color: isPositiveNet ? '#059669' : '#dc2626'
                                        }}>
                                            {statement.netResult > 0 ? '+' : ''}{formatCurrency(statement.netResult)}
                                        </span>
                                        <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>
                                            {isPositiveNet ? 'Superávit' : 'Déficit'}
                                        </span>
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: '0.75rem', marginBottom: 10 }}>
                                    <div style={{ padding: '8px 10px', background: '#f0fdf4', borderRadius: 10, border: '1px solid #dcfce7' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#16a34a', marginBottom: 2 }}>
                                            <ArrowUpRight size={13} />
                                            <span>Ingresos Banco</span>
                                        </div>
                                        <strong style={{ color: '#15803d', fontSize: '0.85rem' }}>
                                            +{formatCurrency(statement.totalIncome)}
                                        </strong>
                                    </div>
                                    <div style={{ padding: '8px 10px', background: '#fef2f2', borderRadius: 10, border: '1px solid #fee2e2' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#dc2626', marginBottom: 2 }}>
                                            <ArrowDownRight size={13} />
                                            <span>Gastos Reales</span>
                                        </div>
                                        <strong style={{ color: '#b91c1c', fontSize: '0.85rem' }}>
                                            -{formatCurrency(statement.totalExpenses)}
                                        </strong>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div style={{ padding: '1.25rem 0.5rem', textAlign: 'center' }}>
                                <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: 12 }}>
                                    Aún no has subido el extracto bancario de este mes para ver los ingresos y gastos reales en cuenta.
                                </p>
                            </div>
                        )}
                    </div>

                    {statement && (
                        <button
                            onClick={onOpenMovements}
                            style={{
                                width: '100%',
                                marginTop: 10,
                                padding: '0.6rem 0.8rem',
                                background: '#f8fafc',
                                border: '1px solid #e2e8f0',
                                borderRadius: 10,
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                color: '#334155',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 6,
                                transition: 'all 0.15s'
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = '#f1f5f9')}
                            onMouseLeave={(e) => (e.currentTarget.style.background = '#f8fafc')}
                        >
                            <Eye size={14} /> Explorar {statement.movements.length} movimientos de banco
                        </button>
                    )}
                </div>

                {/* 3. CONCILIACIÓN Y BALANCE CLÍNICO-FINANCIERO */}
                <div style={{
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: 16,
                    padding: '1.25rem',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between'
                }}>
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{ padding: 6, borderRadius: 10, background: '#faf5ff', color: '#9333ea' }}>
                                    <Receipt size={18} />
                                </div>
                                <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#1e293b' }}>
                                    Conciliación y Desfase
                                </span>
                            </div>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8' }}>
                                Banco vs CRM
                            </span>
                        </div>

                        {statement ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                <div style={{
                                    padding: '10px 12px',
                                    borderRadius: 12,
                                    background: Math.abs(diffBankCrm) < 500 ? '#f0fdf4' : '#f8fafc',
                                    border: `1px solid ${Math.abs(diffBankCrm) < 500 ? '#bbf7d0' : '#e2e8f0'}`
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>
                                            Diferencia Banco - CRM
                                        </span>
                                        <span style={{
                                            fontSize: '0.9rem',
                                            fontWeight: 900,
                                            color: diffBankCrm >= 0 ? '#16a34a' : '#d97706'
                                        }}>
                                            {diffBankCrm > 0 ? '+' : ''}{formatCurrency(diffBankCrm)}
                                        </span>
                                    </div>
                                    <p style={{ fontSize: '0.7rem', color: '#64748b', margin: 0, lineHeight: 1.4 }}>
                                        {diffBankCrm > 0
                                            ? 'Las entradas del banco superan a los cobros del CRM (abonos TPV agrupados, cobros anticipados o becas).'
                                            : 'Lo cobrado en CRM supera las entradas del banco (pagos en efectivo o transferencias en tránsito).'
                                        }
                                    </p>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.75rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569' }}>
                                        <span>Facturación Citas (CRM):</span>
                                        <strong>{formatCurrency(collection.totalBilled)}</strong>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#059669' }}>
                                        <span>Cobrado efectivo en citas:</span>
                                        <strong>{formatCurrency(collection.totalCollected)}</strong>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#b91c1c' }}>
                                        <span>Saldo pendiente de cobro:</span>
                                        <strong>{formatCurrency(collection.totalPending)}</strong>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div style={{ padding: '1rem 0', fontSize: '0.8rem', color: '#64748b' }}>
                                <p style={{ margin: 0, marginBottom: 8 }}>
                                    El CRM registra <strong>{formatCurrency(collection.totalCollected)}</strong> cobrados en {collection.paidSessionsCount} citas.
                                </p>
                                <p style={{ margin: 0, fontSize: '0.75rem', color: '#94a3b8' }}>
                                    Al subir el extracto bancario, contrastaremos automáticamente las transferencias reales de las familias y liquidaciones de TPV con cada cita.
                                </p>
                            </div>
                        )}
                    </div>

                    {collection.pendingPatients.length > 0 && (
                        <button
                            onClick={() => setShowPendingModal(true)}
                            style={{
                                width: '100%',
                                marginTop: 10,
                                padding: '0.6rem 0.8rem',
                                background: '#fef2f2',
                                border: '1px solid #fecaca',
                                borderRadius: 10,
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                color: '#b91c1c',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 6
                            }}
                        >
                            <Users size={14} /> Ver {collection.pendingPatients.length} familias con saldo pendiente
                        </button>
                    )}
                </div>
            </div>

            {/* Modal de Pacientes Pendientes */}
            <Modal
                isOpen={showPendingModal}
                onClose={() => setShowPendingModal(false)}
                title={`Sesiones Pendientes de Cobro - ${monthLabel}`}
                maxWidth="650px"
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '70vh' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fef2f2', padding: '10px 14px', borderRadius: 10, border: '1px solid #fee2e2' }}>
                        <span style={{ fontSize: '0.8rem', color: '#991b1b', fontWeight: 600 }}>
                            Total pendiente en {collection.pendingSessionsCount} sesiones
                        </span>
                        <strong style={{ fontSize: '1rem', color: '#b91c1c' }}>
                            {formatCurrency(collection.totalPending)}
                        </strong>
                    </div>

                    <div style={{ overflowY: 'auto', maxHeight: '50vh', border: '1px solid #e2e8f0', borderRadius: 12 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
                            <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0 }}>
                                <tr>
                                    <th style={{ padding: '10px 12px', color: '#64748b' }}>Paciente / Familia</th>
                                    <th style={{ padding: '10px 12px', color: '#64748b', textAlign: 'center' }}>Sesiones</th>
                                    <th style={{ padding: '10px 12px', color: '#64748b', textAlign: 'right' }}>Importe</th>
                                    <th style={{ padding: '10px 12px', color: '#64748b', textAlign: 'center' }}>Última Cita</th>
                                </tr>
                            </thead>
                            <tbody>
                                {collection.pendingPatients.map((p, idx) => (
                                    <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <td style={{ padding: '10px 12px', fontWeight: 700, color: '#1e293b' }}>
                                            {p.patientName}
                                        </td>
                                        <td style={{ padding: '10px 12px', textAlign: 'center', color: '#64748b' }}>
                                            {p.count}
                                        </td>
                                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: '#b91c1c' }}>
                                            {formatCurrency(p.amount)}
                                        </td>
                                        <td style={{ padding: '10px 12px', textAlign: 'center', color: '#94a3b8', fontSize: '0.75rem' }}>
                                            {p.lastDate}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 8 }}>
                        <button className="btn-primary" onClick={() => setShowPendingModal(false)}>
                            Cerrar
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default MonthlyGlobalOverview;
