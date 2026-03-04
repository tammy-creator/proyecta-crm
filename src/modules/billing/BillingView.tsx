import React, { useState, useEffect } from 'react';
import { getTransactions, recordPayment, updateTransaction, createTransaction } from './service';
import { type Transaction, type PaymentMethod } from './types';
import Card from '../../components/ui/Card';
import { DollarSign, Clock, CheckCircle, CreditCard, Wallet, Send, Download, Calendar as CalendarIcon, Edit2, X, FileText, Receipt, Filter } from 'lucide-react';
import { format, parseISO, startOfDay, endOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { getPatients } from '../patients/service';
import { type Patient } from '../patients/types';
import { getAppointments } from '../calendar/service';
import { markAppointmentPaid, setAppointmentPaidStatus } from '../calendar/service';
import { type Appointment } from '../calendar/types';
import './BillingView.css';
import { createInvoice, getNextInvoiceNumber } from '../invoices/service';
import type { Invoice } from '../invoices/types';
import InvoiceList from '../invoices/InvoiceList';
import InvoiceDocument from '../invoices/InvoiceDocument';


const BillingView: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'TRANSACTIONS' | 'INVOICES'>('TRANSACTIONS');
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [todayAppointments, setTodayAppointments] = useState<Appointment[]>([]);
    const [patients, setPatients] = useState<Patient[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
    const [statusFilter, setStatusFilter] = useState<'ALL' | 'Pendiente' | 'Pagado'>('ALL');
    const [methodFilter, setMethodFilter] = useState<'ALL' | 'Efectivo' | 'Tarjeta' | 'Transferencia'>('ALL');


    // Transaction Modals
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isClosingModalOpen, setIsClosingModalOpen] = useState(false);
    const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);

    // Invoice Generation
    const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
    const [invoiceNumber, setInvoiceNumber] = useState('');
    const [selectedInvoiceTx, setSelectedInvoiceTx] = useState<Transaction | null>(null);

    // Invoice Printing
    const [printingInvoice, setPrintingInvoice] = useState<Invoice | null>(null);

    // Breakdown Modal
    const [isBreakdownOpen, setIsBreakdownOpen] = useState(false);
    const [breakdownTitle, setBreakdownTitle] = useState('');
    const [breakdownFilter, setBreakdownFilter] = useState<'ALL' | 'PAID' | 'PENDING'>('ALL');

    useEffect(() => {
        fetchData();
    }, [selectedDate]);

    // Refrescar al volver a la pestaña / módulo para detectar cambios externos (ej: cita eliminada en calendario)
    useEffect(() => {
        const handleFocus = () => fetchData();
        window.addEventListener('focus', handleFocus);
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') fetchData();
        });
        return () => {
            window.removeEventListener('focus', handleFocus);
        };
    }, [selectedDate]);

    const fetchData = async () => {
        setLoading(true);
        const dateObj = parseISO(selectedDate);
        const [txData, pData, apptData] = await Promise.all([
            getTransactions(),
            getPatients(),
            getAppointments(startOfDay(dateObj), endOfDay(dateObj)),
        ]);
        setTransactions(txData);
        setPatients(pData);
        // Solo citas no canceladas del día seleccionado
        setTodayAppointments(apptData.filter(a => a.status !== 'Cancelada'));
        setLoading(false);
    };

    // Force refresh when invoice modal closes to ensure buttons update
    // Force refresh when invoice modal closes to ensure buttons update
    // REMOVED: Causing race conditions with explicit fetch in handlers
    // useEffect(() => {
    //     if (!isInvoiceModalOpen) {
    //         fetchData();
    //     }
    // }, [isInvoiceModalOpen]);

    const handlePayment = async (id: string, method: PaymentMethod) => {
        const success = await recordPayment(id, method);
        if (success) fetchData();
    };

    // Cobrar una cita que todavía no tiene transacción
    const handleChargeAppointment = async (appt: Appointment, method: PaymentMethod) => {
        const tx = await createTransaction({
            appointmentId: appt.id,
            patientId: appt.patientId,
            patientName: appt.patientName,
            therapistName: appt.therapistName,
            amount: appt.price ?? 0,
            date: appt.start, // Guardamos el timestamp completo para conservar la hora
            status: 'Pagado',
            method,
            category: appt.type,
            invoiceId: undefined,
        });
        if (tx) {
            // Marcar la cita como pagada para quitar el icono en calendario
            await markAppointmentPaid(appt.id);
            fetchData();
        }
    };

    const handleEditOpen = (t: Transaction) => {
        setEditingTransaction({ ...t });
        setIsEditModalOpen(true);
    };

    const handleSaveEdit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingTransaction) return;

        const success = await updateTransaction(editingTransaction);
        if (success) {
            // Sincronizar is_paid en la cita vinculada según el nuevo estado
            if (editingTransaction.appointmentId) {
                const isPaid = editingTransaction.status === 'Pagado';
                await setAppointmentPaidStatus(editingTransaction.appointmentId, isPaid);
            }
            setIsEditModalOpen(false);
            fetchData();
        }
    };

    const handleOpenGenerateInvoice = async (t: Transaction) => {
        const nextNum = await getNextInvoiceNumber();
        setInvoiceNumber(nextNum);
        setSelectedInvoiceTx(t);
        setIsInvoiceModalOpen(true);
    };

    const handleCreateAndPrintInvoice = async () => {
        if (!selectedInvoiceTx) return;

        const newInvoice = await createInvoice({
            date: new Date().toISOString(),
            patientId: selectedInvoiceTx.patientId,
            patientName: selectedInvoiceTx.patientName,
            amount: selectedInvoiceTx.amount,
            status: 'Issued',
            items: [{ description: selectedInvoiceTx.category, amount: selectedInvoiceTx.amount }],
            transactionId: selectedInvoiceTx.id
        });

        // Update transaction to link invoice
        const updatedTx = { ...selectedInvoiceTx, invoiceId: newInvoice.id };
        await updateTransaction(updatedTx);

        // Optimistic UI update
        setTransactions(prev => prev.map(t => t.id === updatedTx.id ? updatedTx : t));

        await fetchData();

        // Close generation modal
        setIsInvoiceModalOpen(false);
        setSelectedInvoiceTx(null); // Clear selection

        // Open print view
        handlePrintInvoice(newInvoice);
    };

    const handlePrintInvoice = (invoice: Invoice) => {
        setPrintingInvoice(invoice);
        // Small delay to allow render before printing
        setTimeout(() => {
            window.print();
            // Optional: clear printing invoice after print dialog closes? 
            // Usually keeping it allows user to reprint if needed or just close.
            // setPrintingInvoice(null);
        }, 500);
    };

    // ─── Listado diario: combina citas del día + transacciones ─────────────────
    // 1. IDs de citas que ya tienen transacción
    const txByApptId = new Map(transactions.filter(t => t.appointmentId).map(t => [t.appointmentId, t]));

    // 2. Citas del día que NO tienen transacción aún → aparecen como "Sin cobrar"
    const apptRowsWithoutTx = todayAppointments.filter(a => !txByApptId.has(a.id));

    // 3. Transacciones del día (directas o enlazadas a citas de hoy)
    const txForDay = transactions.filter((t: Transaction) => {
        const txDate = (t.date ?? '').slice(0, 10);
        return txDate === selectedDate;
    });

    // 4. Fusión: transacciones del día + rows de cita sin cobrar
    // Aplicar filtros de estado y método solo sobre las transacciones
    const filteredTx = txForDay.filter((t: Transaction) => {
        const matchesStatus = statusFilter === 'ALL' || t.status === statusFilter;
        const matchesMethod = methodFilter === 'ALL' || t.method === methodFilter;
        return matchesStatus && matchesMethod;
    });



    // Totals — all transactions (not filtered by date, to show global balance)
    const totalInvoiced = transactions.reduce((acc: number, t: Transaction) => acc + t.amount, 0);
    const totalCollected = transactions
        .filter((t: Transaction) => t.status === 'Pagado')
        .reduce((acc: number, t: Transaction) => acc + t.amount, 0);
    const pendingAmount = totalInvoiced - totalCollected;


    if (loading && transactions.length === 0) return <div className="loading">Cargando histórico financiero...</div>;

    const handleCardClick = (type: 'INVOICED' | 'COLLECTED' | 'PENDING') => {
        const filterMap: Record<string, 'ALL' | 'PAID' | 'PENDING'> = {
            'INVOICED': 'ALL',
            'COLLECTED': 'PAID',
            'PENDING': 'PENDING'
        };
        setBreakdownFilter(filterMap[type]);
        setBreakdownTitle(type === 'INVOICED' ? 'Total Facturado' : type === 'COLLECTED' ? 'Total Cobrado' : 'Total Pendiente');
        setIsBreakdownOpen(true);
    };

    const getBreakdownTransactions = () => {
        return transactions.filter(t => {
            if (breakdownFilter === 'ALL') return true;
            if (breakdownFilter === 'PAID') return t.status === 'Pagado';
            if (breakdownFilter === 'PENDING') return t.status !== 'Pagado'; // Matches logic: Total - Paid
            return true;
        });
    };

    return (
        <div className="billing-container">
            <div className="page-header">
                <div>
                    <h2 className="page-title">Finanzas y Facturación</h2>
                    <p className="page-subtitle">Control de ingresos, caja diaria y facturas legales</p>
                </div>
                <div className="flex items-center gap-4">
                    {activeTab === 'TRANSACTIONS' && (
                        <>
                            <div className="date-filter-modern">
                                <CalendarIcon size={18} className="text-secondary" />
                                <input
                                    type="date"
                                    className="date-input-clean"
                                    value={selectedDate}
                                    onChange={(e) => setSelectedDate(e.target.value)}
                                />
                            </div>

                            {/* Status Filter */}
                            <div className="date-filter-modern">
                                <Filter size={18} className="text-secondary" />
                                <select
                                    className="date-input-clean"
                                    value={statusFilter}
                                    onChange={(e) => setStatusFilter(e.target.value as any)}
                                    style={{ cursor: 'pointer' }}
                                >
                                    <option value="ALL">Todos los Estados</option>
                                    <option value="Pendiente">Pendiente</option>
                                    <option value="Pagado">Pagado</option>
                                </select>
                            </div>

                            {/* Method Filter */}
                            <div className="date-filter-modern">
                                <CreditCard size={18} className="text-secondary" />
                                <select
                                    className="date-input-clean"
                                    value={methodFilter}
                                    onChange={(e) => setMethodFilter(e.target.value as any)}
                                    style={{ cursor: 'pointer' }}
                                >
                                    <option value="ALL">Todos los Métodos</option>
                                    <option value="Efectivo">Efectivo</option>
                                    <option value="Tarjeta">Tarjeta</option>
                                    <option value="Transferencia">Transferencia</option>
                                </select>
                            </div>
                            <button className="btn-secondary flex items-center gap-2" onClick={() => setIsClosingModalOpen(true)}>
                                <Wallet size={18} />
                                Cierre de Caja
                            </button>
                        </>
                    )}
                </div>
            </div>

            <div className="finance-overview" style={{ marginTop: '2rem' }}>
                <Card className="overview-card cursor-pointer hover:shadow-md transition-all" onClick={() => handleCardClick('INVOICED')}>
                    <div className="overview-icon status-neutral">
                        <DollarSign size={24} />
                    </div>
                    <div className="overview-info">
                        <span className="overview-label">Total Facturado</span>
                        <span className="overview-value">{totalInvoiced.toFixed(2)}€</span>
                    </div>
                </Card>
                <Card className="overview-card cursor-pointer hover:shadow-md transition-all" onClick={() => handleCardClick('COLLECTED')}>
                    <div className="overview-icon status-positive">
                        <CheckCircle size={24} />
                    </div>
                    <div className="overview-info">
                        <span className="overview-label">Total Cobrado</span>
                        <span className="overview-value">{totalCollected.toFixed(2)}€</span>
                    </div>
                </Card>
                <Card className="overview-card cursor-pointer hover:shadow-md transition-all" onClick={() => handleCardClick('PENDING')}>
                    <div className="overview-icon status-attention">
                        <Clock size={24} />
                    </div>
                    <div className="overview-info">
                        <span className="overview-label">Pendiente</span>
                        <span className="overview-value" style={{ color: '#D97706' }}>{pendingAmount.toFixed(2)}€</span>
                    </div>
                </Card>
            </div>

            {/* Tabs */}
            <div className="billing-tabs-pill">
                <button
                    className={`tab-btn-pill ${activeTab === 'TRANSACTIONS' ? 'active' : ''}`}
                    onClick={() => setActiveTab('TRANSACTIONS')}
                >
                    <div className="flex items-center gap-2">
                        <Wallet size={18} />
                        Caja y Transacciones
                    </div>
                </button>
                <button
                    className={`tab-btn-pill ${activeTab === 'INVOICES' ? 'active' : ''}`}
                    onClick={() => setActiveTab('INVOICES')}
                >
                    <div className="flex items-center gap-2">
                        <Receipt size={18} />
                        Registro de Facturas
                    </div>
                </button>
            </div>

            {activeTab === 'INVOICES' ? (
                <InvoiceList onPrint={handlePrintInvoice} patients={patients} />
            ) : (
                <>
                    <div className="billing-list-header flex justify-between items-center mb-4 px-2">
                        <h3 className="text-lg font-bold text-primary">Listado del día: {format(parseISO(selectedDate), "dd 'de' MMMM", { locale: es })}</h3>
                    </div>

                    <div className="billing-table-wrapper">
                        {filteredTx.length === 0 && apptRowsWithoutTx.length === 0 ? (
                            <div className="empty-state">No hay citas ni transacciones para este día.</div>
                        ) : (
                            <table className="billing-table">
                                <thead>
                                    <tr>
                                        <th>Hora</th>
                                        <th>Paciente</th>
                                        <th>Concepto</th>
                                        <th>Importe</th>
                                        <th>Estado</th>
                                        <th>Método</th>
                                        <th>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {apptRowsWithoutTx.map((appt) => (
                                        <tr key={`appt-${appt.id}`} style={{ opacity: 0.85 }}>
                                            <td className="text-secondary text-sm">{format(new Date(appt.start), 'HH:mm')}</td>
                                            <td style={{ fontWeight: 600 }}>{appt.patientName}</td>
                                            <td>{appt.type}</td>
                                            <td className="amount-text text-secondary">
                                                {appt.price != null ? `${appt.price.toFixed(2)}€` : '—'}
                                            </td>
                                            <td><span className="badge badge-warning">Sin cobrar</span></td>
                                            <td>—</td>
                                            <td>
                                                <div className="payment-actions flex gap-1">
                                                    <button className="btn-payment-method" onClick={() => handleChargeAppointment(appt, 'Efectivo')} title="Cobrar Efectivo"><Wallet size={14} /></button>
                                                    <button className="btn-payment-method" onClick={() => handleChargeAppointment(appt, 'Tarjeta')} title="Cobrar Tarjeta"><CreditCard size={14} /></button>
                                                    <button className="btn-payment-method" onClick={() => handleChargeAppointment(appt, 'Transferencia')} title="Cobrar Transferencia"><Send size={14} /></button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {filteredTx.map((t: Transaction) => (
                                        <tr key={t.id}>
                                            <td className="text-secondary text-sm">
                                                {t.date && t.date.length > 10
                                                    ? format(new Date(t.date), 'HH:mm')
                                                    : '—'}
                                            </td>
                                            <td style={{ fontWeight: 600 }}>{t.patientName}</td>
                                            <td>{t.category}</td>
                                            <td className="amount-text">{t.amount.toFixed(2)}€</td>
                                            <td>
                                                <span className={`badge ${t.status === 'Pagado' ? 'badge-success' : 'badge-warning'}`}>
                                                    {t.status}
                                                </span>
                                            </td>
                                            <td>
                                                {t.method ? (
                                                    <span className="method-tag">
                                                        {t.method === 'Tarjeta' && <CreditCard size={12} style={{ marginRight: 4 }} />}
                                                        {t.method === 'Efectivo' && <Wallet size={12} style={{ marginRight: 4 }} />}
                                                        {t.method === 'Transferencia' && <Send size={12} style={{ marginRight: 4 }} />}
                                                        {t.method}
                                                    </span>
                                                ) : '—'}
                                            </td>
                                            <td>
                                                <div className="flex gap-2">
                                                    <button className="btn-icon micro" onClick={() => handleEditOpen(t)} title="Editar Transacción"><Edit2 size={14} /></button>
                                                    {t.status === 'Pagado' && !t.invoiceId && (
                                                        <button className="btn-icon micro text-secondary" onClick={() => handleOpenGenerateInvoice(t)} title="Generar Factura"><FileText size={14} /></button>
                                                    )}
                                                    {t.invoiceId && (
                                                        <span title="Factura Generada" className="text-secondary opacity-50 flex items-center justify-center" style={{ width: 24, height: 24 }}><CheckCircle size={14} /></span>
                                                    )}
                                                    {t.status === 'Pendiente' && (
                                                        <div className="payment-actions flex gap-1">
                                                            <button className="btn-payment-method" onClick={() => handlePayment(t.id, 'Efectivo')} title="Efectivo"><Wallet size={14} /></button>
                                                            <button className="btn-payment-method" onClick={() => handlePayment(t.id, 'Tarjeta')} title="Tarjeta"><CreditCard size={14} /></button>
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </>
            )}

            {isEditModalOpen && editingTransaction && (
                <div className="modal-overlay">
                    <div className="modal-content" style={{ maxWidth: '400px' }}>
                        <div className="modal-header">
                            <h3>Editar Transacción</h3>
                            <button className="btn-icon-round" onClick={() => setIsEditModalOpen(false)}><X size={20} /></button>
                        </div>
                        <form className="modal-form" onSubmit={handleSaveEdit}>
                            <div className="form-group">
                                <label>Paciente</label>
                                <input type="text" disabled value={editingTransaction.patientName} />
                            </div>
                            <div className="form-group">
                                <label>Concepto</label>
                                <input
                                    type="text"
                                    value={editingTransaction.category}
                                    onChange={e => setEditingTransaction({ ...editingTransaction, category: e.target.value })}
                                />
                            </div>
                            <div className="form-group">
                                <label>Importe (€)</label>
                                <input
                                    type="number"
                                    value={editingTransaction.amount}
                                    onChange={e => setEditingTransaction({ ...editingTransaction, amount: Number(e.target.value) })}
                                />
                            </div>
                            <div className="form-group">
                                <label>Estado</label>
                                <select
                                    value={editingTransaction.status}
                                    onChange={e => setEditingTransaction({ ...editingTransaction, status: e.target.value as any })}
                                >
                                    <option value="Pendiente">Pendiente</option>
                                    <option value="Pagado">Pagado</option>
                                </select>
                            </div>
                            {editingTransaction.status === 'Pagado' && (
                                <div className="form-group">
                                    <label>Método de Pago</label>
                                    <select
                                        value={editingTransaction.method || ''}
                                        onChange={e => setEditingTransaction({ ...editingTransaction, method: e.target.value as any })}
                                    >
                                        <option value="">Seleccionar...</option>
                                        <option value="Efectivo">Efectivo</option>
                                        <option value="Tarjeta">Tarjeta</option>
                                        <option value="Transferencia">Transferencia</option>
                                    </select>
                                </div>
                            )}
                            <div className="modal-footer">
                                <button type="button" className="btn-secondary" onClick={() => setIsEditModalOpen(false)}>Cancelar</button>
                                <button type="submit" className="btn-primary">Guardar Cambios</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {isClosingModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-content" style={{ maxWidth: '600px' }}>
                        <div className="modal-header">
                            <div className="flex items-center gap-2">
                                <Wallet size={20} className="text-secondary" />
                                <h3>Cierre de Caja Diario</h3>
                            </div>
                            <button className="btn-icon-round" onClick={() => setIsClosingModalOpen(false)}><X size={20} /></button>
                        </div>
                        <div className="closing-content p-4">
                            <p className="mb-4 text-secondary">Resumen de transacciones para el día <strong>{format(parseISO(selectedDate), "dd 'de' MMMM, yyyy", { locale: es })}</strong></p>

                            <div className="breakdown-section mb-6">
                                <h4 className="border-bottom pb-2 mb-3">Desglose por Terapeuta</h4>
                                <div className="grid grid-cols-2 gap-4">
                                    {Object.entries(
                                        txForDay.reduce((acc: Record<string, number>, t: Transaction) => {
                                            const name = t.therapistName || 'Sin asignar';
                                            acc[name] = (acc[name] || 0) + (t.status === 'Pagado' ? t.amount : 0);
                                            return acc;
                                        }, {} as Record<string, number>)
                                    ).map(([name, total]) => (
                                        <div key={name} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                                            <span className="font-medium">{name}</span>
                                            <span className="font-bold text-primary">{(total as number).toFixed(2)}€</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="breakdown-section mb-6">
                                <h4 className="border-bottom pb-2 mb-3">Desglose por Forma de Pago</h4>
                                <div className="grid grid-cols-3 gap-4">
                                    {['Efectivo', 'Tarjeta', 'Transferencia'].map(method => {
                                        const total = txForDay
                                            .filter((t: Transaction) => t.method === method && t.status === 'Pagado')
                                            .reduce((acc: number, t: Transaction) => acc + t.amount, 0);
                                        return (
                                            <div key={method} className="text-center p-3 bg-gray-50 rounded-lg">
                                                <div className="text-xs text-secondary mb-1">{method}</div>
                                                <div className="text-lg font-bold">{total.toFixed(2)}€</div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="total-summary p-4 bg-primary text-white rounded-xl flex justify-between items-center">
                                <div>
                                    <div className="text-sm opacity-80">Total Cobrado (Hoy)</div>
                                    <div className="text-3xl font-bold">
                                        {txForDay
                                            .filter((t: Transaction) => t.status === 'Pagado')
                                            .reduce((acc: number, t: Transaction) => acc + t.amount, 0).toFixed(2)}€
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-sm opacity-80">Sin cobrar (citas)</div>
                                    <div className="text-xl font-semibold text-warning">
                                        {apptRowsWithoutTx.length} citas
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn-secondary" onClick={() => setIsClosingModalOpen(false)}>Cerrar</button>
                            <button type="button" className="btn-primary flex items-center gap-2" onClick={() => window.print()}>
                                <Download size={18} /> Imprimir Reporte
                            </button>
                        </div>
                    </div>
                </div>
            )}


            {/* Breakdown Modal */}
            {isBreakdownOpen && (
                <div className="modal-overlay">
                    <div className="modal-content" style={{ maxWidth: '800px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
                        <div className="modal-header">
                            <h3>{breakdownTitle}</h3>
                            <button className="btn-icon-round" onClick={() => setIsBreakdownOpen(false)}><X size={20} /></button>
                        </div>
                        <div className="p-4 overflow-y-auto flex-1">
                            <table className="billing-table">
                                <thead>
                                    <tr>
                                        <th>Fecha</th>
                                        <th>Paciente</th>
                                        <th>Concepto</th>
                                        <th>Importe</th>
                                        <th>Estado</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {getBreakdownTransactions().map(t => (
                                        <tr key={t.id}>
                                            <td>{format(parseISO(t.date), 'dd/MM/yyyy')}</td>
                                            <td style={{ fontWeight: 600 }}>{t.patientName}</td>
                                            <td>{t.category}</td>
                                            <td className="amount-text">{t.amount}€</td>
                                            <td>
                                                <span className={`badge ${t.status === 'Pagado' ? 'badge-success' : 'badge-warning'}`}>
                                                    {t.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                    {getBreakdownTransactions().length === 0 && (
                                        <tr>
                                            <td colSpan={5} className="text-center py-8 text-secondary">
                                                No hay transacciones para mostrar
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        <div className="modal-footer">
                            <button className="btn-secondary" onClick={() => setIsBreakdownOpen(false)}>Cerrar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Generación de Factura */}
            {isInvoiceModalOpen && selectedInvoiceTx && (
                <div className="modal-overlay no-print">
                    <div className="modal-content" style={{ maxWidth: '400px' }}>
                        <div className="modal-header">
                            <h3>Generar Factura</h3>
                            <button className="btn-icon-round" onClick={() => setIsInvoiceModalOpen(false)}><X size={20} /></button>
                        </div>
                        <div className="p-4">
                            <p className="text-sm text-secondary mb-4">Se generará la factura para el paciente <strong>{selectedInvoiceTx.patientName}</strong>.</p>
                            <div className="form-group">
                                <label>Número de Factura (Sugerido)</label>
                                <input
                                    type="text"
                                    value={invoiceNumber}
                                    readOnly={true} // Auto-generated for safety now
                                    className="bg-gray-100 cursor-not-allowed"
                                />
                            </div>
                            <div className="form-group">
                                <label>Concepto</label>
                                <input
                                    type="text"
                                    defaultValue={selectedInvoiceTx.category}
                                    readOnly
                                    className="bg-gray-100"
                                />
                            </div>
                        </div>
                        <div className="modal-footer flex gap-2 justify-end">
                            <button className="btn-secondary flex items-center gap-2" onClick={async () => {
                                if (!selectedInvoiceTx) return;
                                const newInvoice = await createInvoice({
                                    date: new Date().toISOString(),
                                    patientId: selectedInvoiceTx.patientId,
                                    patientName: selectedInvoiceTx.patientName,
                                    amount: selectedInvoiceTx.amount,
                                    status: 'Issued',
                                    items: [{ description: selectedInvoiceTx.category, amount: selectedInvoiceTx.amount }],
                                    transactionId: selectedInvoiceTx.id
                                });
                                // Update transaction with invoiceId
                                const updatedTx = { ...selectedInvoiceTx, invoiceId: newInvoice.id };
                                console.log('Updating transaction with invoiceId:', updatedTx);
                                const success = await updateTransaction(updatedTx);
                                console.log('Update result:', success);

                                // Optimistic UI update
                                setTransactions(prev => {
                                    const newTx = prev.map(t => t.id === updatedTx.id ? updatedTx : t);
                                    console.log('Optimistic transactions:', newTx.find(t => t.id === updatedTx.id));
                                    return newTx;
                                });

                                // Force immediate fetch to ensure sync
                                await fetchData();

                                setIsInvoiceModalOpen(false);
                                setSelectedInvoiceTx(null); // Clear selection
                            }}>
                                <CheckCircle size={18} /> Crear y Guardar
                            </button>
                            <button className="btn-primary flex items-center gap-2" onClick={handleCreateAndPrintInvoice}>
                                <FileText size={18} /> Crear e Imprimir
                            </button>
                        </div>
                    </div>


                </div >
            )}

            {/* Hidden Printable Invoice */}
            {
                printingInvoice && (
                    <InvoiceDocument
                        invoice={printingInvoice}
                        patientDetails={{
                            dni: patients.find(p => p.id === printingInvoice.patientId)?.tutor1?.dni,
                            address: patients.find(p => p.id === printingInvoice.patientId)?.address,
                            tutorName: patients.find(p => p.id === printingInvoice.patientId)?.tutor1 ?
                                `${patients.find(p => p.id === printingInvoice.patientId)?.tutor1?.firstName} ${patients.find(p => p.id === printingInvoice.patientId)?.tutor1?.lastName}`
                                : printingInvoice.patientName
                        }}
                    />
                )
            }
        </div >
    );
};


export default BillingView;
