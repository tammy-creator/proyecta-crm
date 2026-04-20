import React, { useState, useEffect, useMemo } from 'react';
import { getInvoices, updateInvoice } from './service';
import type { Invoice } from './types';
import type { Patient } from '../patients/types';
import { Search, Printer, Calendar as CalendarIcon, Edit2, X, Eye, User, Receipt } from 'lucide-react';
import { format, isValid } from 'date-fns';
import { useToast } from '../../hooks/useToast';
import InvoiceDocument from './InvoiceDocument';

interface InvoiceListProps {
    onPrint?: (invoice: Invoice) => void;
    patients: Patient[];
}

const InvoiceList: React.FC<InvoiceListProps> = ({ onPrint, patients }) => {
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterDate, setFilterDate] = useState('');

    // Edit State
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);

    const [viewingInvoice, setViewingInvoice] = useState<Invoice | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const { showToast } = useToast();

    // Helper for safe date formatting
    const safeFormatDate = (dateStr: string | null | undefined, formatStr: string = 'dd/MM/yyyy') => {
        if (!dateStr) return 'N/A';
        const date = new Date(dateStr);
        if (!isValid(date)) return 'Fecha inválida';
        return format(date, formatStr);
    };
    
    // Helper to extract patient details
    const getPatientDetails = (id: string) => {
        const p = patients.find(pat => pat.id === id);
        if (!p) return undefined;
        return {
            dni: p.tutor1?.dni || '',
            address: p.address || '',
            tutorName: p.tutor1 ? `${p.tutor1.firstName} ${p.tutor1.lastName}` : ''
        };
    };

    useEffect(() => {
        loadInvoices();
    }, []);

    const loadInvoices = async () => {
        setIsLoading(true);
        try {
            const data = await getInvoices();
            setInvoices(data);
        } catch (error) {
            console.error("Error loading invoices:", error);
            showToast('No se pudieron cargar las facturas. Por favor, reintente.', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const handleEditOpen = (invoice: Invoice) => {
        setEditingInvoice({ ...invoice });
        setIsEditModalOpen(true);
    };

    const handleSaveEdit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingInvoice) return;

        // Update items explanation if single item (simplified for this view)
        // In a full implementation, we might need a dynamic list of items.
        // For now, we assume 1 item per invoice as per current simple model.

        await updateInvoice(editingInvoice);
        loadInvoices();
        setIsEditModalOpen(false);
    };

    const filteredInvoices = useMemo(() => {
        console.log("Rendering InvoiceList V2 - High Contrast Mode");
        const filtered = invoices.filter(inv => {
            const patientName = (inv.patientName || '').toLowerCase();
            const invNumber = (inv.number || '').toLowerCase();
            const searchLower = searchTerm.toLowerCase();

            const matchesSearch =
                patientName.includes(searchLower) ||
                invNumber.includes(searchLower);

            const matchesDate = filterDate ? inv.date.startsWith(filterDate) : true;

            return matchesSearch && matchesDate;
        });
        return filtered;
    }, [invoices, searchTerm, filterDate]);

    return (
        <>
            <div className="billing-table-wrapper">
                <div className="filter-container">
                    <div className="search-input-modern-wrapper" style={{ flex: 1 }}>
                        <Search
                            size={18}
                            className="search-icon"
                        />
                        <input
                            type="text"
                            placeholder="Buscar por paciente o nº factura..."
                            className="search-input-modern"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="date-filter-modern">
                        <CalendarIcon size={18} style={{ color: '#94a3b8' }} />
                        <input
                            type="date"
                            className="date-input-clean"
                            value={filterDate}
                            onChange={(e) => setFilterDate(e.target.value)}
                        />
                    </div>
                </div>

                {isLoading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem 0' }}>
                        <div className="spinner">Cargando facturas...</div>
                    </div>
                ) : filteredInvoices.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state-icon">
                            <Receipt size={32} />
                        </div>
                        <div className="empty-state-text">No se encontraron facturas en el registro.</div>
                    </div>
                ) : (
                    <div>
                        <table className="billing-table" style={{ minWidth: '950px' }}>
                            <thead>
                                <tr>
                                    <th style={{ width: '130px' }}>Nº Factura</th>
                                    <th style={{ width: '120px' }}>Fecha</th>
                                    <th style={{ width: '220px' }}>Paciente</th>
                                    <th style={{ minWidth: '200px' }}>Concepto</th>
                                    <th style={{ width: '110px' }}>Importe</th>
                                    <th style={{ width: '120px' }}>Estado</th>
                                    <th style={{ width: '150px', textAlign: 'right', paddingRight: '2rem' }}>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredInvoices.map(inv => (
                                    <tr key={inv.id}>
                                        <td>
                                            <span className="invoice-number-cell">{inv.number}</span>
                                        </td>
                                        <td style={{ color: '#64748b' }}>{safeFormatDate(inv.date)}</td>
                                        <td>
                                            <div className="invoice-patient-cell">
                                                <div className="invoice-avatar">
                                                    {inv.patientName?.charAt(0) || <User size={14} />}
                                                </div>
                                                <div style={{ fontWeight: 600, color: '#1e293b' }}>{inv.patientName}</div>
                                            </div>
                                        </td>
                                        <td>
                                            <div className="flex items-center gap-2" style={{ color: '#1A5F7A', fontSize: '0.875rem', fontWeight: 600 }}>
                                                <Receipt size={16} strokeWidth={2.5} style={{ color: '#3b82f6', opacity: 0.8 }} />
                                                {inv.items[0]?.description || 'Servicio clínico'}
                                            </div>
                                        </td>
                                        <td className="amount-text" style={{ fontSize: '1rem', color: '#1e293b' }}>{inv.amount.toFixed(2)}€</td>
                                        <td>
                                            <div className={`invoice-status-pill ${inv.status === 'Issued' ? 'invoice-status-issued' : 'invoice-status-cancelled'}`}>
                                                <span className="status-dot"></span>
                                                {inv.status === 'Issued' ? 'Emitida' : 'Anulada'}
                                            </div>
                                        </td>
                                        <td style={{ textAlign: 'right', paddingRight: '2rem' }}>
                                            <div className="action-buttons-group">
                                                <button
                                                    className="btn-action-modern view"
                                                    onClick={() => setViewingInvoice(inv)}
                                                    title="Ver Factura"
                                                >
                                                    <Eye size={20} strokeWidth={2.5} color="#2563eb" />
                                                </button>
                                                <button
                                                    className="btn-action-modern edit"
                                                    onClick={() => handleEditOpen(inv)}
                                                    title="Editar Factura"
                                                >
                                                    <Edit2 size={20} strokeWidth={2.5} color="#d97706" />
                                                </button>
                                                <button
                                                    className="btn-action-modern print"
                                                    onClick={() => onPrint?.(inv)}
                                                    title="Imprimir Factura"
                                                >
                                                    <Printer size={20} strokeWidth={2.5} color="#059669" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {viewingInvoice && (
                <div className="modal-overlay" style={{ zIndex: 9999 }}>
                    <div className="modal-content" style={{ maxWidth: '900px', width: '95%', height: '90vh', display: 'flex', flexDirection: 'column' }}>
                        <div className="modal-header">
                            <h3>Vista Previa Factura {viewingInvoice.number}</h3>
                            <button className="btn-icon-round" onClick={() => setViewingInvoice(null)}><X size={20} /></button>
                        </div>
                        <div className="flex-1 overflow-auto bg-gray-100 p-4 flex justify-center">
                            <div style={{ transform: 'scale(0.8)', transformOrigin: 'top center', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)' }}>
                                <InvoiceDocument
                                    invoice={viewingInvoice}
                                    patientDetails={getPatientDetails(viewingInvoice.patientId)}
                                />
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn-secondary" onClick={() => setViewingInvoice(null)}>Cerrar</button>
                            <button className="btn-primary flex items-center gap-2" onClick={() => onPrint?.(viewingInvoice)}>
                                <Printer size={16} /> Imprimir
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {isEditModalOpen && editingInvoice && (
                <div className="modal-overlay" style={{ zIndex: 9999 }}>
                    <div className="modal-content" style={{ maxWidth: '600px', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
                        <div className="modal-header" style={{ borderBottom: '1px solid #f1f5f9', padding: '1rem 1.5rem' }}>
                            <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#1A5F7A' }}>Editar Factura</h3>
                            <button className="btn-icon-round" onClick={() => setIsEditModalOpen(false)}><X size={20} /></button>
                        </div>
                        
                        <form className="modal-form" onSubmit={handleSaveEdit} style={{ flex: 1, padding: '1.25rem 1.5rem' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                                <div className="form-group">
                                    <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem', display: 'block' }}>
                                        Número Factura
                                    </label>
                                    <input
                                        type="text"
                                        className="input-modern"
                                        value={editingInvoice.number}
                                        onChange={e => setEditingInvoice({ ...editingInvoice, number: e.target.value })}
                                        style={{ width: '100%' }}
                                    />
                                </div>
                                
                                <div className="form-group">
                                    <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem', display: 'block' }}>
                                        Fecha de Emisión
                                    </label>
                                    <input
                                        type="date"
                                        className="input-modern"
                                        value={editingInvoice.date.split('T')[0]}
                                        onChange={e => setEditingInvoice({ ...editingInvoice, date: new Date(e.target.value).toISOString() })}
                                        style={{ width: '100%' }}
                                    />
                                </div>
                            </div>
                            
                            <div className="form-group" style={{ marginBottom: '1rem' }}>
                                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem', display: 'block' }}>
                                    Paciente / Razón Social
                                </label>
                                <input
                                    type="text"
                                    className="input-modern"
                                    value={editingInvoice.patientName}
                                    onChange={e => setEditingInvoice({ ...editingInvoice, patientName: e.target.value })}
                                    style={{ width: '100%' }}
                                />
                            </div>
                            
                            <div className="form-group" style={{ marginBottom: '1rem' }}>
                                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem', display: 'block' }}>
                                    Concepto (Servicio)
                                </label>
                                <input
                                    type="text"
                                    className="input-modern"
                                    value={editingInvoice.items[0].description}
                                    onChange={e => {
                                        const newItems = [...editingInvoice.items];
                                        newItems[0] = { ...newItems[0], description: e.target.value };
                                        setEditingInvoice({ ...editingInvoice, items: newItems });
                                    }}
                                    style={{ width: '100%' }}
                                />
                            </div>
                            
                            <div className="form-group" style={{ width: '50%' }}>
                                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem', display: 'block' }}>
                                    Importe Total (€)
                                </label>
                                <input
                                    type="number"
                                    step="0.01"
                                    className="input-modern"
                                    value={editingInvoice.amount}
                                    onChange={e => {
                                        const val = Number(e.target.value);
                                        const newItems = [...editingInvoice.items];
                                        newItems[0] = { ...newItems[0], amount: val };
                                        setEditingInvoice({ ...editingInvoice, amount: val, items: newItems });
                                    }}
                                    style={{ width: '100%' }}
                                />
                            </div>
                        </form>

                        <div className="modal-footer" style={{ borderTop: '1px solid #f1f5f9', padding: '1rem 1.5rem', background: '#f8fafc', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                            <button type="button" className="btn-secondary" onClick={() => setIsEditModalOpen(false)} style={{ margin: 0 }}>Cancelar</button>
                            <button type="button" className="btn-primary" onClick={handleSaveEdit} style={{ margin: 0 }}>Guardar Cambios</button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default InvoiceList;
