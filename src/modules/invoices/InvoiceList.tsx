import React, { useState, useEffect } from 'react';
import { getInvoices, updateInvoice } from './service';
import type { Invoice } from './types';
import type { Patient } from '../patients/types';
import { Search, Printer, Calendar as CalendarIcon, Edit2, X, Eye } from 'lucide-react';
import { format } from 'date-fns';
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

    // View State
    const [viewingInvoice, setViewingInvoice] = useState<Invoice | null>(null);

    useEffect(() => {
        loadInvoices();
    }, []);

    const loadInvoices = () => {
        getInvoices().then(setInvoices);
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

    const filteredInvoices = invoices.filter(inv => {
        const matchesSearch =
            inv.patientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            inv.number.toLowerCase().includes(searchTerm.toLowerCase());

        const matchesDate = filterDate ? inv.date.startsWith(filterDate) : true;

        return matchesSearch && matchesDate;
    });

    return (
        <div className="billing-table-wrapper">
            <div className="filter-container mb-4">
                <div className="search-input-modern-wrapper">
                    <Search
                        size={18}
                        className="search-icon"
                        style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', zIndex: 10, color: '#9ca3af' }}
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
                    <CalendarIcon size={18} className="text-secondary" />
                    <input
                        type="date"
                        className="date-input-clean"
                        value={filterDate}
                        onChange={(e) => setFilterDate(e.target.value)}
                    />
                </div>
            </div>

            {filteredInvoices.length === 0 ? (
                <div className="empty-state">No se encontraron facturas.</div>
            ) : (
                <table className="billing-table">
                    <thead>
                        <tr>
                            <th>Nº Factura</th>
                            <th>Fecha</th>
                            <th>Paciente</th>
                            <th>Concepto</th>
                            <th>Importe</th>
                            <th>Estado</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredInvoices.map(inv => (
                            <tr key={inv.id}>
                                <td className="font-bold text-primary">{inv.number}</td>
                                <td>{format(new Date(inv.date), 'dd/MM/yyyy')}</td>
                                <td>{inv.patientName}</td>
                                <td>{inv.items[0]?.description}</td>
                                <td className="font-bold">{inv.amount.toFixed(2)}€</td>
                                <td>
                                    <span className={`badge ${inv.status === 'Issued' ? 'badge-success' : 'badge-error'}`}>
                                        {inv.status === 'Issued' ? 'Emitida' : 'Anulada'}
                                    </span>
                                </td>
                                <td>
                                    <div className="flex gap-2">
                                        <button
                                            className="btn-icon micro text-secondary"
                                            onClick={() => setViewingInvoice(inv)}
                                            title="Ver Factura"
                                        >
                                            <Eye size={14} />
                                        </button>
                                        <button
                                            className="btn-icon micro"
                                            onClick={() => handleEditOpen(inv)}
                                            title="Editar Factura"
                                        >
                                            <Edit2 size={14} />
                                        </button>
                                        <button
                                            className="btn-icon micro text-secondary"
                                            onClick={() => onPrint?.(inv)}
                                            title="Imprimir Factura"
                                        >
                                            <Printer size={16} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}

            {viewingInvoice && (
                <div className="modal-overlay" style={{ zIndex: 60 }}>
                    <div className="modal-content" style={{ maxWidth: '900px', width: '95%', height: '90vh', display: 'flex', flexDirection: 'column' }}>
                        <div className="modal-header">
                            <h3>Vista Previa Factura {viewingInvoice.number}</h3>
                            <button className="btn-icon-round" onClick={() => setViewingInvoice(null)}><X size={20} /></button>
                        </div>
                        <div className="flex-1 overflow-auto bg-gray-100 p-4 flex justify-center">
                            <div style={{ transform: 'scale(0.8)', transformOrigin: 'top center', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)' }}>
                                <InvoiceDocument
                                    invoice={viewingInvoice}
                                    patientDetails={{
                                        dni: patients.find(p => p.id === viewingInvoice.patientId)?.tutor1?.dni || '',
                                        address: patients.find(p => p.id === viewingInvoice.patientId)?.address || '',
                                        tutorName: patients.find(p => p.id === viewingInvoice.patientId)?.tutor1 ?
                                            `${patients.find(p => p.id === viewingInvoice.patientId)?.tutor1.firstName} ${patients.find(p => p.id === viewingInvoice.patientId)?.tutor1.lastName}`
                                            : viewingInvoice.patientName
                                    }}
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
                <div className="modal-overlay">
                    <div className="modal-content" style={{ maxWidth: '400px' }}>
                        <div className="modal-header">
                            <h3>Editar Factura</h3>
                            <button className="btn-icon-round" onClick={() => setIsEditModalOpen(false)}><X size={20} /></button>
                        </div>
                        <form className="modal-form" onSubmit={handleSaveEdit}>
                            <div className="form-group">
                                <label>Número Factura</label>
                                <input
                                    type="text"
                                    value={editingInvoice.number}
                                    onChange={e => setEditingInvoice({ ...editingInvoice, number: e.target.value })}
                                />
                            </div>
                            <div className="form-group">
                                <label>Fecha de Emisión</label>
                                <input
                                    type="date"
                                    value={editingInvoice.date.split('T')[0]}
                                    onChange={e => setEditingInvoice({ ...editingInvoice, date: new Date(e.target.value).toISOString() })}
                                />
                            </div>
                            <div className="form-group">
                                <label>Paciente / Razón Social</label>
                                <input
                                    type="text"
                                    value={editingInvoice.patientName}
                                    onChange={e => setEditingInvoice({ ...editingInvoice, patientName: e.target.value })}
                                />
                            </div>
                            <div className="form-group">
                                <label>Concepto (Servicio)</label>
                                <input
                                    type="text"
                                    value={editingInvoice.items[0].description}
                                    onChange={e => {
                                        const newItems = [...editingInvoice.items];
                                        newItems[0] = { ...newItems[0], description: e.target.value };
                                        setEditingInvoice({ ...editingInvoice, items: newItems });
                                    }}
                                />
                            </div>
                            <div className="form-group">
                                <label>Importe Total (€)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={editingInvoice.amount}
                                    onChange={e => {
                                        const val = Number(e.target.value);
                                        const newItems = [...editingInvoice.items];
                                        newItems[0] = { ...newItems[0], amount: val };
                                        setEditingInvoice({ ...editingInvoice, amount: val, items: newItems });
                                    }}
                                />
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn-secondary" onClick={() => setIsEditModalOpen(false)}>Cancelar</button>
                                <button type="submit" className="btn-primary">Guardar Cambios</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default InvoiceList;
