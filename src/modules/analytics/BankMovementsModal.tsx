import React, { useState, useMemo } from 'react';
import { 
    Search, 
    Filter, 
    ArrowUpRight, 
    ArrowDownRight, 
    User, 
    AlertCircle,
    X,
    BookmarkCheck
} from 'lucide-react';
import Modal from '../../components/ui/Modal';
import { 
    type BankStatementMovement, 
    type FinancialCategory, 
    FINANCIAL_CATEGORIES 
} from './types';

interface BankMovementsModalProps {
    isOpen: boolean;
    onClose: () => void;
    movements: BankStatementMovement[];
    monthLabel: string;
    accountIban?: string;
    onUpdateCategory: (movementId: string, newCategory: FinancialCategory, remember: boolean) => void;
}

export const BankMovementsModal: React.FC<BankMovementsModalProps> = ({
    isOpen,
    onClose,
    movements,
    monthLabel,
    accountIban,
    onUpdateCategory
}) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [typeFilter, setTypeFilter] = useState<'ALL' | 'INCOME' | 'EXPENSE'>('ALL');
    const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
    const [rememberRule, setRememberRule] = useState<boolean>(true);

    // Filtrado de movimientos
    const filteredMovements = useMemo(() => {
        return movements.filter(m => {
            // Filtro por tipo (Ingreso / Gasto)
            if (typeFilter === 'INCOME' && m.amount < 0) return false;
            if (typeFilter === 'EXPENSE' && m.amount >= 0) return false;

            // Filtro por categoría específica
            if (categoryFilter !== 'ALL' && m.category !== categoryFilter) return false;

            // Filtro por texto
            if (searchTerm.trim()) {
                const term = searchTerm.toLowerCase();
                const inConcept = m.concept.toLowerCase().includes(term);
                const inOpType = (m.operationType || '').toLowerCase().includes(term);
                const inRef = (m.reference || '').toLowerCase().includes(term);
                const inPatient = (m.matchedPatientName || '').toLowerCase().includes(term);
                const inAmount = m.amount.toString().includes(term);
                return inConcept || inOpType || inRef || inPatient || inAmount;
            }

            return true;
        });
    }, [movements, typeFilter, categoryFilter, searchTerm]);

    // Totales del conjunto filtrado
    const { filteredIncome, filteredExpenses } = useMemo(() => {
        let inc = 0;
        let exp = 0;
        filteredMovements.forEach(m => {
            if (m.amount >= 0) inc += m.amount;
            else exp += Math.abs(m.amount);
        });
        return {
            filteredIncome: Math.round(inc * 100) / 100,
            filteredExpenses: Math.round(exp * 100) / 100
        };
    }, [filteredMovements]);

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('es-ES', {
            style: 'currency',
            currency: 'EUR'
        }).format(val);
    };

    return (
        <Modal 
            isOpen={isOpen} 
            onClose={onClose} 
            title={`Extracto Bancario - ${monthLabel}`}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', width: '100%', maxWidth: '1050px', maxHeight: '82vh' }}>
                
                {/* Cabecera / Subtítulo */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem' }}>
                    <div>
                        <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
                            {movements.length} movimientos procesados
                            {accountIban && <span style={{ marginLeft: 8, fontWeight: 600, color: '#334155' }}>· IBAN: {accountIban}</span>}
                        </p>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '0.85rem' }}>
                        <span style={{ color: '#10b981', fontWeight: 700 }}>
                            + {formatCurrency(filteredIncome)}
                        </span>
                        <span style={{ color: '#ef4444', fontWeight: 700 }}>
                            - {formatCurrency(filteredExpenses)}
                        </span>
                        <span style={{ color: '#1e293b', fontWeight: 800, background: '#f8fafc', padding: '4px 10px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                            Neto: {formatCurrency(filteredIncome - filteredExpenses)}
                        </span>
                    </div>
                </div>

                {/* Barra de Filtros y Búsqueda */}
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    {/* Buscador */}
                    <div style={{ position: 'relative', flex: '1 1 240px', minWidth: '220px' }}>
                        <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                        <input
                            type="text"
                            placeholder="Buscar por concepto, importe o paciente..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '0.6rem 0.75rem 0.6rem 2.25rem',
                                borderRadius: 10,
                                border: '1px solid #e2e8f0',
                                fontSize: '0.85rem',
                                outline: 'none',
                                background: '#fff'
                            }}
                        />
                        {searchTerm && (
                            <button
                                onClick={() => setSearchTerm('')}
                                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>

                    {/* Selector de Tipo (Todos / Ingresos / Gastos) */}
                    <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: 10, padding: 3 }}>
                        <button
                            onClick={() => setTypeFilter('ALL')}
                            style={{
                                padding: '6px 12px',
                                border: 'none',
                                borderRadius: 8,
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                background: typeFilter === 'ALL' ? '#fff' : 'transparent',
                                color: typeFilter === 'ALL' ? '#1e293b' : '#64748b',
                                boxShadow: typeFilter === 'ALL' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none'
                            }}
                        >
                            Todos ({movements.length})
                        </button>
                        <button
                            onClick={() => setTypeFilter('INCOME')}
                            style={{
                                padding: '6px 12px',
                                border: 'none',
                                borderRadius: 8,
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                background: typeFilter === 'INCOME' ? '#fff' : 'transparent',
                                color: typeFilter === 'INCOME' ? '#10b981' : '#64748b',
                                boxShadow: typeFilter === 'INCOME' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none'
                            }}
                        >
                            Ingresos ({movements.filter(m => m.amount >= 0).length})
                        </button>
                        <button
                            onClick={() => setTypeFilter('EXPENSE')}
                            style={{
                                padding: '6px 12px',
                                border: 'none',
                                borderRadius: 8,
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                background: typeFilter === 'EXPENSE' ? '#fff' : 'transparent',
                                color: typeFilter === 'EXPENSE' ? '#ef4444' : '#64748b',
                                boxShadow: typeFilter === 'EXPENSE' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none'
                            }}
                        >
                            Gastos ({movements.filter(m => m.amount < 0).length})
                        </button>
                    </div>

                    {/* Filtro por Categoría */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Filter size={15} style={{ color: '#94a3b8' }} />
                        <select
                            value={categoryFilter}
                            onChange={(e) => setCategoryFilter(e.target.value)}
                            style={{
                                padding: '0.6rem 0.85rem',
                                borderRadius: 10,
                                border: '1px solid #e2e8f0',
                                fontSize: '0.8rem',
                                background: '#fff',
                                color: '#1e293b',
                                fontWeight: 600
                            }}
                        >
                            <option value="ALL">Todas las Categorías</option>
                            <optgroup label="Ingresos">
                                {Object.entries(FINANCIAL_CATEGORIES)
                                    .filter(([_, meta]) => meta.group === 'INCOME')
                                    .map(([key, meta]) => (
                                        <option key={key} value={key}>{meta.label}</option>
                                    ))}
                            </optgroup>
                            <optgroup label="Gastos">
                                {Object.entries(FINANCIAL_CATEGORIES)
                                    .filter(([_, meta]) => meta.group === 'EXPENSE')
                                    .map(([key, meta]) => (
                                        <option key={key} value={key}>{meta.label}</option>
                                    ))}
                            </optgroup>
                        </select>
                    </div>

                    {/* Checkbox recordar regla */}
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: '#64748b', cursor: 'pointer', marginLeft: 'auto' }}>
                        <input 
                            type="checkbox" 
                            checked={rememberRule} 
                            onChange={(e) => setRememberRule(e.target.checked)} 
                            style={{ accentColor: '#3b82f6' }}
                        />
                        Recordar cambios para siguientes meses
                    </label>
                </div>

                {/* Tabla de Movimientos */}
                <div style={{ overflowX: 'auto', maxHeight: '52vh', overflowY: 'auto', border: '1px solid #f1f5f9', borderRadius: 12 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem' }}>
                        <thead style={{ position: 'sticky', top: 0, background: '#f8fafc', borderBottom: '1px solid #e2e8f0', zIndex: 1 }}>
                            <tr>
                                <th style={{ padding: '10px 14px', color: '#64748b', fontWeight: 700, width: '100px' }}>Fecha</th>
                                <th style={{ padding: '10px 14px', color: '#64748b', fontWeight: 700 }}>Descripción / Concepto</th>
                                <th style={{ padding: '10px 14px', color: '#64748b', fontWeight: 700, width: '150px' }}>Tipo Op.</th>
                                <th style={{ padding: '10px 14px', color: '#64748b', fontWeight: 700, width: '220px' }}>Categoría</th>
                                <th style={{ padding: '10px 14px', color: '#64748b', fontWeight: 700, textAlign: 'right', width: '120px' }}>Importe</th>
                                <th style={{ padding: '10px 14px', color: '#64748b', fontWeight: 700, textAlign: 'right', width: '110px' }}>Saldo</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredMovements.length === 0 ? (
                                <tr>
                                    <td colSpan={6} style={{ textAlign: 'center', padding: '3rem 1rem', color: '#94a3b8' }}>
                                        <AlertCircle size={28} style={{ margin: '0 auto 8px', opacity: 0.5, display: 'block' }} />
                                        No se han encontrado movimientos con los filtros aplicados.
                                    </td>
                                </tr>
                            ) : (
                                filteredMovements.map((m, idx) => {
                                    const meta = FINANCIAL_CATEGORIES[m.category] || FINANCIAL_CATEGORIES.OTROS_GASTOS;
                                    const isPositive = m.amount >= 0;

                                    return (
                                        <tr 
                                            key={m.id || idx} 
                                            style={{ 
                                                borderBottom: '1px solid #f8fafc',
                                                background: idx % 2 === 0 ? '#fff' : '#fafafa',
                                                transition: 'background 0.15s'
                                            }}
                                            onMouseEnter={(e) => (e.currentTarget.style.background = '#f1f5f9')}
                                            onMouseLeave={(e) => (e.currentTarget.style.background = idx % 2 === 0 ? '#fff' : '#fafafa')}
                                        >
                                            {/* Fecha */}
                                            <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', color: '#475569', fontWeight: 600 }}>
                                                {m.date}
                                            </td>

                                            {/* Concepto y Paciente vinculado */}
                                            <td style={{ padding: '10px 14px' }}>
                                                <div style={{ fontWeight: 600, color: '#1e293b', marginBottom: 2 }}>
                                                    {m.concept}
                                                </div>
                                                {m.matchedPatientName && (
                                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#ecfdf5', color: '#059669', padding: '2px 8px', borderRadius: 6, fontSize: '0.7rem', fontWeight: 700 }}>
                                                        <User size={11} />
                                                        Paciente CRM: {m.matchedPatientName}
                                                    </div>
                                                )}
                                                {m.reference && (
                                                    <span style={{ fontSize: '0.7rem', color: '#94a3b8', marginLeft: 6 }}>
                                                        Ref: {m.reference}
                                                    </span>
                                                )}
                                            </td>

                                            {/* Tipo de Operación */}
                                            <td style={{ padding: '10px 14px', color: '#64748b', fontSize: '0.75rem' }}>
                                                {m.operationType || '—'}
                                            </td>

                                            {/* Categoría con Dropdown interactivo */}
                                            <td style={{ padding: '10px 14px' }}>
                                                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <span 
                                                        style={{ 
                                                            width: 8, 
                                                            height: 8, 
                                                            borderRadius: '50%', 
                                                            background: meta.color, 
                                                            flexShrink: 0 
                                                        }} 
                                                    />
                                                    <select
                                                        value={m.category}
                                                        onChange={(e) => {
                                                            const newCat = e.target.value as FinancialCategory;
                                                            onUpdateCategory(m.id, newCat, rememberRule);
                                                        }}
                                                        style={{
                                                            width: '100%',
                                                            padding: '4px 8px',
                                                            borderRadius: 8,
                                                            border: '1px solid #e2e8f0',
                                                            fontSize: '0.75rem',
                                                            background: '#fff',
                                                            color: '#1e293b',
                                                            fontWeight: 600,
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        <optgroup label="Ingresos">
                                                            {Object.entries(FINANCIAL_CATEGORIES)
                                                                .filter(([_, c]) => c.group === 'INCOME')
                                                                .map(([k, c]) => (
                                                                    <option key={k} value={k}>{c.label}</option>
                                                                ))}
                                                        </optgroup>
                                                        <optgroup label="Gastos">
                                                            {Object.entries(FINANCIAL_CATEGORIES)
                                                                .filter(([_, c]) => c.group === 'EXPENSE')
                                                                .map(([k, c]) => (
                                                                    <option key={k} value={k}>{c.label}</option>
                                                                ))}
                                                        </optgroup>
                                                    </select>
                                                    {m.isManualReclassified && (
                                                        <span title="Reclasificado manualmente" style={{ display: 'inline-flex', alignItems: 'center' }}>
                                                            <BookmarkCheck size={14} style={{ color: '#3b82f6', flexShrink: 0 }} />
                                                        </span>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Importe */}
                                            <td style={{ padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                <div style={{ 
                                                    display: 'inline-flex', 
                                                    alignItems: 'center', 
                                                    gap: 4, 
                                                    fontWeight: 800, 
                                                    fontSize: '0.85rem',
                                                    color: isPositive ? '#10b981' : '#ef4444' 
                                                }}>
                                                    {isPositive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                                                    {formatCurrency(m.amount)}
                                                </div>
                                            </td>

                                            {/* Saldo */}
                                            <td style={{ padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap', color: '#64748b', fontSize: '0.75rem', fontWeight: 600 }}>
                                                {m.balance !== undefined ? formatCurrency(m.balance) : '—'}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pie del modal */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8 }}>
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                        Mostrando {filteredMovements.length} de {movements.length} movimientos
                    </span>
                    <button className="btn-primary" onClick={onClose} style={{ padding: '0.5rem 1.5rem' }}>
                        Listo
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default BankMovementsModal;
