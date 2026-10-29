import React, { useState, useEffect } from 'react';
import { getTransactions, recordPayment, updateTransaction, createTransaction, toggleReconciliation, isNonClinicalSession, batchPayAppointments, type BatchPaymentItem } from './service';
import { type Transaction, type PaymentMethod } from './types';
import Card from '../../components/ui/Card';
import { DollarSign, Clock, CheckCircle, CreditCard, Wallet, Send, Download, Calendar as CalendarIcon, Edit2, X, FileText, Receipt, Filter, TrendingUp, AlertTriangle, Banknote, User, CalendarClock, Search, ChevronLeft, ChevronRight, CheckCheck, ArrowUpDown, ArrowUp, ArrowDown, RotateCcw, Landmark, FileSpreadsheet, Layers } from 'lucide-react';
import * as XLSX from 'xlsx';
import { format, parseISO, startOfDay, endOfDay, isValid, isSameMonth, parse } from 'date-fns';
import { es } from 'date-fns/locale';
import { getPatients } from '../patients/service';
import { type Patient } from '../patients/types';
import { getAppointments, getUnpaidAppointments } from '../calendar/service';
import { markAppointmentPaid, setAppointmentPaidStatus } from '../calendar/service';
import { type Appointment } from '../calendar/types';
import { subscribeToCalendarSync } from '../calendar/calendarSync';
import './BillingView.css';
import { createInvoice, getNextInvoiceNumber, existsInvoiceNumber } from '../invoices/service';
import type { Invoice } from '../invoices/types';
import InvoiceList from '../invoices/InvoiceList';
import InvoiceDocument from '../invoices/InvoiceDocument';
import { useToast } from '../../hooks/useToast';
import PrintPortal from '../../components/ui/PrintPortal';

import { useAuth } from '../../context/AuthContext';


type CardSortField = 'date' | 'patient' | 'therapist' | 'amount' | 'status' | 'method' | 'reconciled';
type CardSortOrder = 'asc' | 'desc';

const BillingView: React.FC = () => {
    const { user } = useAuth();
    const { showToast } = useToast();
    const isTherapist = user?.role === 'THERAPIST';
    
    // Si es terapeuta, siempre empezamos en TRANSACTIONS
    const [activeTab, setActiveTab] = useState<'TRANSACTIONS' | 'INVOICES' | 'RECONCILIATION'>('TRANSACTIONS');
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [todayAppointments, setTodayAppointments] = useState<Appointment[]>([]);
    const [historicalUnpaidAppointments, setHistoricalUnpaidAppointments] = useState<Appointment[]>([]);
    const [patients, setPatients] = useState<Patient[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
    const [statusFilter, setStatusFilter] = useState<'ALL' | 'Pendiente' | 'Pagado'>('ALL');
    const [methodFilter, setMethodFilter] = useState<'ALL' | 'Efectivo' | 'Tarjeta' | 'Transferencia' | 'Fin de mes'>('ALL');

    // Reconciliation Sub-states (Datáfono vs Transferencias vs Otras Formas)
    const [reconciliationType, setReconciliationType] = useState<'CARD' | 'TRANSFER' | 'OTHER'>('CARD');
    const [cardScope, setCardScope] = useState<'MONTH' | 'ALL_PENDING'>('MONTH');
    const [reconciliationMonth, setReconciliationMonth] = useState<string>(format(new Date(), 'yyyy-MM'));
    const [cardSearchChild, setCardSearchChild] = useState<string>('');
    const [cardReconciledFilter, setCardReconciledFilter] = useState<'ALL' | 'PENDING' | 'VERIFIED'>('ALL');
    const [cardMethodFilter, setCardMethodFilter] = useState<'CARD_ONLY' | 'ALL' | 'Efectivo' | 'Transferencia'>('CARD_ONLY');
    const [cardTherapistFilter, setCardTherapistFilter] = useState<string>('ALL');
    const [cardStatusFilter, setCardStatusFilter] = useState<'ALL' | 'Pagado' | 'Pendiente'>('ALL');
    const [cardSortField, setCardSortField] = useState<CardSortField>('date');
    const [cardSortOrder, setCardSortOrder] = useState<CardSortOrder>('desc');

    // Transfer Reconciliation States
    const [transferScope, setTransferScope] = useState<'MONTH' | 'ALL_PENDING'>('MONTH');
    const [transferSearchChild, setTransferSearchChild] = useState<string>('');
    const [transferReconciledFilter, setTransferReconciledFilter] = useState<'ALL' | 'PENDING' | 'VERIFIED'>('ALL');
    const [transferMethodFilter, setTransferMethodFilter] = useState<'TRANSFER_ONLY' | 'ALL' | 'Tarjeta' | 'Efectivo'>('TRANSFER_ONLY');
    const [transferTherapistFilter, setTransferTherapistFilter] = useState<string>('ALL');
    const [transferStatusFilter, setTransferStatusFilter] = useState<'ALL' | 'Pagado' | 'Pendiente'>('ALL');
    const [transferSortField, setTransferSortField] = useState<CardSortField>('date');
    const [transferSortOrder, setTransferSortOrder] = useState<CardSortOrder>('desc');

    // Other Methods Reconciliation States (Efectivo, Fin de mes, etc.)
    const [otherScope, setOtherScope] = useState<'MONTH' | 'ALL_PENDING'>('MONTH');
    const [otherSearchChild, setOtherSearchChild] = useState<string>('');
    const [otherReconciledFilter, setOtherReconciledFilter] = useState<'ALL' | 'PENDING' | 'VERIFIED'>('ALL');
    const [otherMethodFilter, setOtherMethodFilter] = useState<'ALL_OTHER' | 'Efectivo' | 'Fin de mes' | 'ALL'>('ALL_OTHER');
    const [otherTherapistFilter, setOtherTherapistFilter] = useState<string>('ALL');
    const [otherStatusFilter, setOtherStatusFilter] = useState<'ALL' | 'Pagado' | 'Pendiente'>('ALL');
    const [otherSortField, setOtherSortField] = useState<CardSortField>('date');
    const [otherSortOrder, setOtherSortOrder] = useState<CardSortOrder>('desc');

    // Transaction Modals
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isClosingModalOpen, setIsClosingModalOpen] = useState(false);
    const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);

    // Invoice Generation
    const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
    const [invoiceNumber, setInvoiceNumber] = useState('');
    const [selectedInvoiceTx, setSelectedInvoiceTx] = useState<Transaction | null>(null);
    const [isCreatingInvoice, setIsCreatingInvoice] = useState(false);

    // Invoice Printing
    const [printingInvoice, setPrintingInvoice] = useState<Invoice | null>(null);

    // Breakdown Modal
    const [isBreakdownOpen, setIsBreakdownOpen] = useState(false);
    const [breakdownTitle, setBreakdownTitle] = useState('');
    const [breakdownFilter, setBreakdownFilter] = useState<'ALL' | 'PAID' | 'PENDING'>('ALL');

    // Concurrency / Loading guards to prevent double clicking
    const [chargingApptIds, setChargingApptIds] = useState<Set<string>>(new Set());
    const [payingTxIds, setPayingTxIds] = useState<Set<string>>(new Set());

    // Batch Payment Modal States
    const [isBatchPayModalOpen, setIsBatchPayModalOpen] = useState(false);
    const [batchPayPatientId, setBatchPayPatientId] = useState<string>('');
    const [batchPayPatientName, setBatchPayPatientName] = useState<string>('');
    const [batchPayItems, setBatchPayItems] = useState<BatchPaymentItem[]>([]);
    const [batchPaySelectedIds, setBatchPaySelectedIds] = useState<Set<string>>(new Set());
    const [batchPayMethod, setBatchPayMethod] = useState<PaymentMethod>('Efectivo');
    const [batchPayDate, setBatchPayDate] = useState<string>(selectedDate);
    const [isBatchProcessing, setIsBatchProcessing] = useState(false);

    useEffect(() => {
        fetchData();
    }, [selectedDate, statusFilter, methodFilter, activeTab]);

    // Manage body class for printing
    useEffect(() => {
        if (printingInvoice) {
            document.body.classList.add('print-active');
        } else {
            document.body.classList.remove('print-active');
        }
        return () => document.body.classList.remove('print-active');
    }, [printingInvoice]);

    // Refrescar al volver a la pestaña o recibir eventos de sincronización en tiempo real (ej: cita creada, cobrada o eliminada)
    useEffect(() => {
        const handleFocus = () => fetchData();
        window.addEventListener('focus', handleFocus);
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') fetchData();
        });

        const unsubscribeSync = subscribeToCalendarSync(() => {
            fetchData();
        });

        return () => {
            window.removeEventListener('focus', handleFocus);
            unsubscribeSync();
        };
    }, [selectedDate]);

    const fetchData = async () => {
        if (!selectedDate) {
            setLoading(false);
            return;
        }

        const dateObj = parseISO(selectedDate);
        if (!isValid(dateObj)) {
            setLoading(false);
            return;
        }

        setLoading(true);
        
        // Parámetros de filtrado según rol
        const tName = isTherapist ? user?.name : undefined;
        const tId = isTherapist ? user?.therapistId : undefined;

        try {
            const [txData, pData, apptData, unpaidAppts] = await Promise.all([
                getTransactions(tName),
                getPatients(),
                getAppointments(startOfDay(dateObj), endOfDay(dateObj), tId),
                getUnpaidAppointments(tId)
            ]);
            setTransactions(txData);
            setPatients(pData);
            // Solo citas asistenciales reales no canceladas ni bloqueos del día seleccionado
            setTodayAppointments(apptData.filter(a => 
                a.status !== 'Cancelada' && 
                a.status !== 'Bloqueada' &&
                !isNonClinicalSession(a.patientName, a.type)
            ));
            // Todas las citas reales no pagadas hasta hoy (evitar contar citas futuras como deuda ni bloqueos no asistenciales)
            const now = new Date();
            setHistoricalUnpaidAppointments(unpaidAppts.filter(a =>
                a.status !== 'Cancelada' &&
                a.status !== 'Bloqueada' &&
                !isNonClinicalSession(a.patientName, a.type) &&
                new Date(a.start) <= now &&
                isSameMonth(new Date(a.start), now)
            ));
        } catch (error) {
            console.error("Error fetching billing data:", error);
            showToast("Error al cargar datos financieros", "error");
        } finally {
            setLoading(false);
        }
    };

    const handlePayment = async (id: string, method: PaymentMethod) => {
        if (payingTxIds.has(id)) return;
        setPayingTxIds(prev => new Set(prev).add(id));
        try {
            const tx = transactions.find(t => t.id === id);
            const isFinDeMes = method === 'Fin de mes';
            const nowIso = new Date().toISOString();
            const success = await recordPayment(id, method, isFinDeMes ? undefined : nowIso);
            if (success) {
                if (tx?.appointmentId) {
                    if (isFinDeMes) {
                        await setAppointmentPaidStatus(tx.appointmentId, false);
                    } else {
                        await markAppointmentPaid(tx.appointmentId);
                    }
                }
                await fetchData();
            }
        } catch (error) {
            console.error('Error recording payment:', error);
            showToast('Error al registrar el cobro', 'error');
        } finally {
            setPayingTxIds(prev => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
        }
    };

    // Cobrar o asignar una cita que todavía no tiene transacción
    const handleChargeAppointment = async (appt: Appointment, method: PaymentMethod) => {
        if (chargingApptIds.has(appt.id)) return;
        if (isNonClinicalSession(appt.patientName, appt.type)) {
            showToast('Esta cita es de trabajo no asistencial y no genera cobro', 'info');
            return;
        }
        setChargingApptIds(prev => new Set(prev).add(appt.id));
        try {
            const isFinDeMes = method === 'Fin de mes';
            const nowIso = new Date().toISOString();
            const effectivePrice = (appt.price != null && appt.price > 0) ? appt.price : 60;
            const tx = await createTransaction({
                appointmentId: appt.id,
                patientId: appt.patientId ?? '',
                patientName: appt.patientName,
                therapistName: appt.therapistName,
                amount: effectivePrice,
                date: appt.start, // Guardamos el timestamp completo para conservar la hora de la sesión
                paymentDate: isFinDeMes ? undefined : nowIso, // Fecha real del cobro en caja
                status: isFinDeMes ? 'Pendiente' : 'Pagado',
                method,
                category: appt.type,
                invoiceId: undefined,
            });
            if (tx) {
                if (isFinDeMes) {
                    // Fin de mes queda como Pendiente de cobro, la cita no está pagada aún
                    await setAppointmentPaidStatus(appt.id, false);
                } else {
                    await markAppointmentPaid(appt.id);
                }
                await fetchData();
            }
        } catch (error) {
            console.error('Error charging appointment:', error);
            showToast('Error al registrar cobro de la cita', 'error');
        } finally {
            setChargingApptIds(prev => {
                const next = new Set(prev);
                next.delete(appt.id);
                return next;
            });
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
        const newInvoice = await performCreateInvoice();
        if (newInvoice) {
            handlePrintInvoice(newInvoice);
        }
    };

    const performCreateInvoice = async (): Promise<Invoice | null> => {
        if (!selectedInvoiceTx || isCreatingInvoice) return null;
        
        const trimmedNumber = invoiceNumber.trim();
        if (!trimmedNumber) {
            showToast("El número de factura no puede estar vacío.", "error");
            return null;
        }

        setIsCreatingInvoice(true);

        try {
            // Validation: Unique invoice number
            const exists = await existsInvoiceNumber(trimmedNumber);
            
            if (exists) {
                showToast(`El número de factura "${trimmedNumber}" ya existe.`, "error");
                setIsCreatingInvoice(false);
                return null;
            }

            const newInvoice = await createInvoice({
                number: trimmedNumber,
                date: new Date().toISOString(),
                patientId: selectedInvoiceTx.patientId,
                patientName: selectedInvoiceTx.patientName,
                amount: selectedInvoiceTx.amount,
                status: 'Issued',
                items: [{ description: selectedInvoiceTx.category || 'Servicio Clínico', amount: selectedInvoiceTx.amount }],
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
            setSelectedInvoiceTx(null);
            setIsCreatingInvoice(false);

            return newInvoice;
        } catch (error: any) {
            setIsCreatingInvoice(false);
            console.error("Critical Error creating invoice:", error);
            showToast("No se pudo crear la factura.", "error");
            return null;
        }
    };

    const handlePrintInvoice = (invoice: any) => {
        setPrintingInvoice(invoice);
        document.body.classList.add('print-active');
        
        setTimeout(() => {
            window.print();
        }, 800);
        
        // Clear state after sufficient time for the print dialog to open
        setTimeout(() => {
            setPrintingInvoice(null);
            document.body.classList.remove('print-active');
        }, 3000);
    };

    const handleToggleReconciliation = async (txId: string, current: boolean) => {
        setTransactions(prev => prev.map(t => t.id === txId ? { ...t, isReconciled: !current } : t));
        try {
            const success = await toggleReconciliation(txId, !current);
            if (!success) {
                setTransactions(prev => prev.map(t => t.id === txId ? { ...t, isReconciled: current } : t));
                showToast("Error al actualizar cotejo", 'error');
            } else {
                showToast(!current ? "Ticket cotejado ✅" : "Cotejo desmarcado", 'info');
            }
        } catch (error) {
            setTransactions(prev => prev.map(t => t.id === txId ? { ...t, isReconciled: current } : t));
            showToast("Error al actualizar cotejo", 'error');
        }
    };

    const handlePrevMonth = () => {
        try {
            const [year, month] = reconciliationMonth.split('-').map(Number);
            const prev = new Date(year, month - 2, 1);
            setReconciliationMonth(format(prev, 'yyyy-MM'));
        } catch (e) {
            console.error(e);
        }
    };

    const handleNextMonth = () => {
        try {
            const [year, month] = reconciliationMonth.split('-').map(Number);
            const next = new Date(year, month, 1);
            setReconciliationMonth(format(next, 'yyyy-MM'));
        } catch (e) {
            console.error(e);
        }
    };

    const normalizeSearch = (str: string | null | undefined): string => {
        if (!str) return '';
        return str
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .trim();
    };

    // Todas las transacciones del mes seleccionado
    const allTransactionsMonth = transactions.filter(t => {
        const txDate = t.date || '';
        return txDate.startsWith(reconciliationMonth);
    });

    // Cobros con tarjeta del mes para las métricas de cuadre del Datáfono
    const cardTransactionsMonth = allTransactionsMonth.filter(t => t.method === 'Tarjeta');

    const cardMonthTotal = cardTransactionsMonth.reduce((acc, t) => acc + (t.amount || 0), 0);
    const cardMonthCount = cardTransactionsMonth.length;

    const cardMonthVerified = cardTransactionsMonth.filter(t => t.isReconciled);
    const cardMonthVerifiedTotal = cardMonthVerified.reduce((acc, t) => acc + (t.amount || 0), 0);
    const cardMonthVerifiedCount = cardMonthVerified.length;

    const cardMonthPending = cardTransactionsMonth.filter(t => !t.isReconciled);
    const cardMonthPendingTotal = cardMonthPending.reduce((acc, t) => acc + (t.amount || 0), 0);
    const cardMonthPendingCount = cardMonthPending.length;

    // Todas las citas cobradas con tarjeta pendientes de cotejo en todo el histórico
    const allPendingCardTransactions = transactions.filter(t => t.method === 'Tarjeta' && !t.isReconciled);
    const allPendingCardTotal = allPendingCardTransactions.reduce((acc, t) => acc + (t.amount || 0), 0);
    const allPendingCardCount = allPendingCardTransactions.length;

    // Fuente de datos según el ámbito (Mes seleccionado vs Todas las pendientes globales)
    const sourceTransactions = cardScope === 'ALL_PENDING'
        ? allPendingCardTransactions
        : allTransactionsMonth;

    // Lista de terapeutas únicos para el filtro de cabecera
    const uniqueTherapists = Array.from(
        new Set(sourceTransactions.map(t => t.therapistName).filter(Boolean))
    ).sort((a, b) => (a as string).localeCompare(b as string, 'es', { sensitivity: 'base' })) as string[];

    const hasActiveCardFilters = Boolean(
        cardSearchChild.trim() !== '' ||
        cardTherapistFilter !== 'ALL' ||
        cardStatusFilter !== 'ALL' ||
        (cardScope === 'MONTH' && cardMethodFilter !== 'CARD_ONLY') ||
        (cardScope === 'MONTH' && cardReconciledFilter !== 'ALL')
    );

    const handleResetCardFilters = () => {
        setCardSearchChild('');
        setCardTherapistFilter('ALL');
        setCardStatusFilter('ALL');
        setCardMethodFilter('CARD_ONLY');
        setCardReconciledFilter('ALL');
    };

    const handleToggleCardSort = (field: CardSortField) => {
        if (cardSortField === field) {
            setCardSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setCardSortField(field);
            if (field === 'patient' || field === 'therapist' || field === 'status' || field === 'method') {
                setCardSortOrder('asc');
            } else {
                setCardSortOrder('desc');
            }
        }
    };

    const renderSortIcon = (field: CardSortField) => {
        if (cardSortField !== field) {
            return <ArrowUpDown size={13} className="sort-icon-inactive" />;
        }
        return cardSortOrder === 'asc' 
            ? <ArrowUp size={13} className="sort-icon-active" /> 
            : <ArrowDown size={13} className="sort-icon-active" />;
    };

    // Transacciones filtradas según filtros integrados de cabecera y ordenadas según columna seleccionada
    const filteredCardTransactions = sourceTransactions
        .filter(t => {
            if (cardScope === 'ALL_PENDING') return true;
            if (cardMethodFilter === 'CARD_ONLY') return t.method === 'Tarjeta';
            if (cardMethodFilter === 'ALL') return true;
            return t.method === cardMethodFilter;
        })
        .filter(t => {
            if (cardScope === 'ALL_PENDING') return true;
            if (cardReconciledFilter === 'PENDING') return !t.isReconciled;
            if (cardReconciledFilter === 'VERIFIED') return t.isReconciled;
            return true;
        })
        .filter(t => {
            if (cardTherapistFilter === 'ALL') return true;
            return t.therapistName === cardTherapistFilter;
        })
        .filter(t => {
            if (cardStatusFilter === 'ALL') return true;
            return t.status === cardStatusFilter;
        })
        .filter(t => {
            if (!cardSearchChild.trim()) return true;
            const searchTokens = normalizeSearch(cardSearchChild).split(' ').filter(Boolean);
            const pNorm = normalizeSearch(t.patientName);
            return searchTokens.every(token => pNorm.includes(token));
        })
        .sort((a, b) => {
            let comp = 0;
            switch (cardSortField) {
                case 'date':
                    comp = (a.date || '').localeCompare(b.date || '');
                    break;
                case 'patient':
                    comp = (a.patientName || '').localeCompare(b.patientName || '', 'es', { sensitivity: 'base' });
                    break;
                case 'therapist':
                    comp = (a.therapistName || '').localeCompare(b.therapistName || '', 'es', { sensitivity: 'base' });
                    break;
                case 'amount':
                    comp = (a.amount || 0) - (b.amount || 0);
                    break;
                case 'status':
                    comp = (a.status || '').localeCompare(b.status || '');
                    break;
                case 'method':
                    comp = (a.method || '').localeCompare(b.method || '');
                    break;
                case 'reconciled': {
                    const recA = a.isReconciled ? 1 : 0;
                    const recB = b.isReconciled ? 1 : 0;
                    comp = recA - recB;
                    break;
                }
                default:
                    comp = (a.date || '').localeCompare(b.date || '');
            }
            return cardSortOrder === 'asc' ? comp : -comp;
        });

    // Cobros por transferencia bancaria del mes para las métricas de cuadre
    const transferTransactionsMonth = allTransactionsMonth.filter(t => t.method === 'Transferencia');

    const transferMonthTotal = transferTransactionsMonth.reduce((acc, t) => acc + (t.amount || 0), 0);
    const transferMonthCount = transferTransactionsMonth.length;

    const transferMonthVerified = transferTransactionsMonth.filter(t => t.isReconciled);
    const transferMonthVerifiedTotal = transferMonthVerified.reduce((acc, t) => acc + (t.amount || 0), 0);
    const transferMonthVerifiedCount = transferMonthVerified.length;

    const transferMonthPending = transferTransactionsMonth.filter(t => !t.isReconciled);
    const transferMonthPendingTotal = transferMonthPending.reduce((acc, t) => acc + (t.amount || 0), 0);
    const transferMonthPendingCount = transferMonthPending.length;

    // Todas las transferencias bancarias pendientes de cotejo en todo el histórico
    const allPendingTransferTransactions = transactions.filter(t => t.method === 'Transferencia' && !t.isReconciled);
    const allPendingTransferTotal = allPendingTransferTransactions.reduce((acc, t) => acc + (t.amount || 0), 0);
    const allPendingTransferCount = allPendingTransferTransactions.length;

    // Fuente de datos según el ámbito para transferencias
    const transferSourceTransactions = transferScope === 'ALL_PENDING'
        ? allPendingTransferTransactions
        : allTransactionsMonth;

    // Lista de terapeutas únicos para la tabla de transferencias
    const uniqueTransferTherapists = Array.from(
        new Set(transferSourceTransactions.map(t => t.therapistName).filter(Boolean))
    ).sort((a, b) => (a as string).localeCompare(b as string, 'es', { sensitivity: 'base' })) as string[];

    const hasActiveTransferFilters = Boolean(
        transferSearchChild.trim() !== '' ||
        transferTherapistFilter !== 'ALL' ||
        transferStatusFilter !== 'ALL' ||
        (transferScope === 'MONTH' && transferMethodFilter !== 'TRANSFER_ONLY') ||
        (transferScope === 'MONTH' && transferReconciledFilter !== 'ALL')
    );

    const handleResetTransferFilters = () => {
        setTransferSearchChild('');
        setTransferTherapistFilter('ALL');
        setTransferStatusFilter('ALL');
        setTransferMethodFilter('TRANSFER_ONLY');
        setTransferReconciledFilter('ALL');
    };

    const handleToggleTransferSort = (field: CardSortField) => {
        if (transferSortField === field) {
            setTransferSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setTransferSortField(field);
            if (field === 'patient' || field === 'therapist' || field === 'status' || field === 'method') {
                setTransferSortOrder('asc');
            } else {
                setTransferSortOrder('desc');
            }
        }
    };

    const renderTransferSortIcon = (field: CardSortField) => {
        if (transferSortField !== field) {
            return <ArrowUpDown size={13} className="sort-icon-inactive" />;
        }
        return transferSortOrder === 'asc' 
            ? <ArrowUp size={13} className="sort-icon-active" /> 
            : <ArrowDown size={13} className="sort-icon-active" />;
    };

    // Transacciones filtradas para el cotejo de transferencias
    const filteredTransferTransactions = transferSourceTransactions
        .filter(t => {
            if (transferScope === 'ALL_PENDING') return true;
            if (transferMethodFilter === 'TRANSFER_ONLY') return t.method === 'Transferencia';
            if (transferMethodFilter === 'ALL') return true;
            return t.method === transferMethodFilter;
        })
        .filter(t => {
            if (transferScope === 'ALL_PENDING') return true;
            if (transferReconciledFilter === 'PENDING') return !t.isReconciled;
            if (transferReconciledFilter === 'VERIFIED') return t.isReconciled;
            return true;
        })
        .filter(t => {
            if (transferTherapistFilter === 'ALL') return true;
            return t.therapistName === transferTherapistFilter;
        })
        .filter(t => {
            if (transferStatusFilter === 'ALL') return true;
            return t.status === transferStatusFilter;
        })
        .filter(t => {
            if (!transferSearchChild.trim()) return true;
            const searchTokens = normalizeSearch(transferSearchChild).split(' ').filter(Boolean);
            const pNorm = normalizeSearch(t.patientName);
            return searchTokens.every(token => pNorm.includes(token));
        })
        .sort((a, b) => {
            let comp = 0;
            switch (transferSortField) {
                case 'date':
                    comp = (a.date || '').localeCompare(b.date || '');
                    break;
                case 'patient':
                    comp = (a.patientName || '').localeCompare(b.patientName || '', 'es', { sensitivity: 'base' });
                    break;
                case 'therapist':
                    comp = (a.therapistName || '').localeCompare(b.therapistName || '', 'es', { sensitivity: 'base' });
                    break;
                case 'amount':
                    comp = (a.amount || 0) - (b.amount || 0);
                    break;
                case 'status':
                    comp = (a.status || '').localeCompare(b.status || '');
                    break;
                case 'method':
                    comp = (a.method || '').localeCompare(b.method || '');
                    break;
                case 'reconciled': {
                    const recA = a.isReconciled ? 1 : 0;
                    const recB = b.isReconciled ? 1 : 0;
                    comp = recA - recB;
                    break;
                }
                default:
                    comp = (a.date || '').localeCompare(b.date || '');
            }
            return transferSortOrder === 'asc' ? comp : -comp;
        });

    // Cobros por otros métodos (Efectivo, Fin de mes, etc.) que no son Tarjeta ni Transferencia
    const otherTransactionsMonth = allTransactionsMonth.filter(t => t.method !== 'Tarjeta' && t.method !== 'Transferencia');

    const otherMonthTotal = otherTransactionsMonth.reduce((acc, t) => acc + (t.amount || 0), 0);
    const otherMonthCount = otherTransactionsMonth.length;
    const otherMonthCashCount = otherTransactionsMonth.filter(t => t.method === 'Efectivo').length;
    const otherMonthFinDeMesCount = otherTransactionsMonth.filter(t => t.method === 'Fin de mes').length;

    const otherMonthVerified = otherTransactionsMonth.filter(t => t.isReconciled);
    const otherMonthVerifiedTotal = otherMonthVerified.reduce((acc, t) => acc + (t.amount || 0), 0);
    const otherMonthVerifiedCount = otherMonthVerified.length;

    const otherMonthPending = otherTransactionsMonth.filter(t => !t.isReconciled);
    const otherMonthPendingTotal = otherMonthPending.reduce((acc, t) => acc + (t.amount || 0), 0);
    const otherMonthPendingCount = otherMonthPending.length;

    // Todas las citas/cobros que no son tarjeta ni transferencia pendientes de cotejar en todo el histórico
    const allPendingOtherTransactions = transactions.filter(t => t.method !== 'Tarjeta' && t.method !== 'Transferencia' && !t.isReconciled);
    const allPendingOtherTotal = allPendingOtherTransactions.reduce((acc, t) => acc + (t.amount || 0), 0);
    const allPendingOtherCount = allPendingOtherTransactions.length;

    // Fuente de datos según el ámbito para otras formas
    const otherSourceTransactions = otherScope === 'ALL_PENDING'
        ? allPendingOtherTransactions
        : allTransactionsMonth;

    // Lista de terapeutas únicos para la tabla de otras formas
    const uniqueOtherTherapists = Array.from(
        new Set(otherSourceTransactions.map(t => t.therapistName).filter(Boolean))
    ).sort((a, b) => (a as string).localeCompare(b as string, 'es', { sensitivity: 'base' })) as string[];

    const hasActiveOtherFilters = Boolean(
        otherSearchChild.trim() !== '' ||
        otherTherapistFilter !== 'ALL' ||
        otherStatusFilter !== 'ALL' ||
        (otherScope === 'MONTH' && otherMethodFilter !== 'ALL_OTHER') ||
        (otherScope === 'MONTH' && otherReconciledFilter !== 'ALL')
    );

    const handleResetOtherFilters = () => {
        setOtherSearchChild('');
        setOtherTherapistFilter('ALL');
        setOtherStatusFilter('ALL');
        setOtherMethodFilter('ALL_OTHER');
        setOtherReconciledFilter('ALL');
    };

    const handleToggleOtherSort = (field: CardSortField) => {
        if (otherSortField === field) {
            setOtherSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setOtherSortField(field);
            if (field === 'patient' || field === 'therapist' || field === 'status' || field === 'method') {
                setOtherSortOrder('asc');
            } else {
                setOtherSortOrder('desc');
            }
        }
    };

    const renderOtherSortIcon = (field: CardSortField) => {
        if (otherSortField !== field) {
            return <ArrowUpDown size={13} className="sort-icon-inactive" />;
        }
        return otherSortOrder === 'asc' 
            ? <ArrowUp size={13} className="sort-icon-active" /> 
            : <ArrowDown size={13} className="sort-icon-active" />;
    };

    // Transacciones filtradas para el cotejo de otras formas
    const filteredOtherTransactions = otherSourceTransactions
        .filter(t => {
            if (otherScope === 'ALL_PENDING') return true;
            if (otherMethodFilter === 'ALL_OTHER') return t.method !== 'Tarjeta' && t.method !== 'Transferencia';
            if (otherMethodFilter === 'ALL') return true;
            return t.method === otherMethodFilter;
        })
        .filter(t => {
            if (otherScope === 'ALL_PENDING') return true;
            if (otherReconciledFilter === 'PENDING') return !t.isReconciled;
            if (otherReconciledFilter === 'VERIFIED') return t.isReconciled;
            return true;
        })
        .filter(t => {
            if (otherTherapistFilter === 'ALL') return true;
            return t.therapistName === otherTherapistFilter;
        })
        .filter(t => {
            if (otherStatusFilter === 'ALL') return true;
            return t.status === otherStatusFilter;
        })
        .filter(t => {
            if (!otherSearchChild.trim()) return true;
            const searchTokens = normalizeSearch(otherSearchChild).split(' ').filter(Boolean);
            const pNorm = normalizeSearch(t.patientName);
            return searchTokens.every(token => pNorm.includes(token));
        })
        .sort((a, b) => {
            let comp = 0;
            switch (otherSortField) {
                case 'date':
                    comp = (a.date || '').localeCompare(b.date || '');
                    break;
                case 'patient':
                    comp = (a.patientName || '').localeCompare(b.patientName || '', 'es', { sensitivity: 'base' });
                    break;
                case 'therapist':
                    comp = (a.therapistName || '').localeCompare(b.therapistName || '', 'es', { sensitivity: 'base' });
                    break;
                case 'amount':
                    comp = (a.amount || 0) - (b.amount || 0);
                    break;
                case 'status':
                    comp = (a.status || '').localeCompare(b.status || '');
                    break;
                case 'method':
                    comp = (a.method || '').localeCompare(b.method || '');
                    break;
                case 'reconciled': {
                    const recA = a.isReconciled ? 1 : 0;
                    const recB = b.isReconciled ? 1 : 0;
                    comp = recA - recB;
                    break;
                }
                default:
                    comp = (a.date || '').localeCompare(b.date || '');
            }
            return otherSortOrder === 'asc' ? comp : -comp;
        });

    const handleQuickChangeMethod = async (t: Transaction, newMethod: PaymentMethod) => {
        if (t.method === newMethod) return;

        const updatedTx: Transaction = {
            ...t,
            method: newMethod,
            // Si cambia la forma de pago, desmarcar el cotejo previo para que se coteje en su canal correspondiente
            isReconciled: false
        };

        // Actualización optimista inmediata
        setTransactions(prev => prev.map(item => item.id === t.id ? updatedTx : item));

        try {
            const success = await updateTransaction(updatedTx);
            if (!success) {
                setTransactions(prev => prev.map(item => item.id === t.id ? t : item));
                showToast("Error al actualizar la forma de pago", "error");
            } else {
                showToast(`Forma de pago de ${t.patientName || 'cita'} actualizada a ${newMethod}`, "success");
            }
        } catch (error) {
            console.error("Error updating payment method:", error);
            setTransactions(prev => prev.map(item => item.id === t.id ? t : item));
            showToast("Error al actualizar la forma de pago", "error");
        }
    };

    const handleQuickChangeAmount = async (t: Transaction, newAmount: number) => {
        if (Number(t.amount) === Number(newAmount) || isNaN(newAmount) || newAmount < 0) return;

        const updatedTx: Transaction = {
            ...t,
            amount: Number(newAmount)
        };

        setTransactions(prev => prev.map(item => item.id === t.id ? updatedTx : item));

        try {
            const success = await updateTransaction(updatedTx);
            if (!success) {
                setTransactions(prev => prev.map(item => item.id === t.id ? t : item));
                showToast("Error al actualizar el importe", "error");
            } else {
                showToast(`Importe actualizado a ${newAmount}€`, "success");
            }
        } catch (error) {
            console.error("Error updating amount:", error);
            setTransactions(prev => prev.map(item => item.id === t.id ? t : item));
            showToast("Error al actualizar el importe", "error");
        }
    };

    const handleBatchReconcileShown = async (txList: Transaction[]) => {
        const toReconcile = txList.filter(t => !t.isReconciled);
        if (toReconcile.length === 0) return;

        const ids = new Set(toReconcile.map(t => t.id));
        setTransactions(prev => prev.map(t => ids.has(t.id) ? { ...t, isReconciled: true } : t));

        try {
            await Promise.all(toReconcile.map(t => toggleReconciliation(t.id, true)));
            showToast(`${toReconcile.length} tickets cotejados correctamente`, 'success');
        } catch (error) {
            console.error("Error batch reconciling:", error);
            showToast("Error al cotejar algunos tickets", 'error');
            fetchData();
        }
    };

    const exportReconciliationToExcel = (
        txList: Transaction[],
        type: 'CARD' | 'TRANSFER' | 'OTHER',
        scope: 'MONTH' | 'ALL_PENDING',
        month: string,
        filterChildName?: string
    ) => {
        if (!txList || txList.length === 0) {
            showToast("No hay registros para exportar con los filtros seleccionados", "error");
            return;
        }

        const typeLabel = type === 'CARD' ? 'Datafono' : type === 'TRANSFER' ? 'Transferencias' : 'Efectivo_Otras';

        const rows: any[] = txList.map((t, idx) => {
            let dateFormatted = t.date;
            let timeFormatted = '';
            try {
                const d = parseISO(t.date);
                if (isValid(d)) {
                    dateFormatted = format(d, 'dd/MM/yyyy');
                    if (t.date && t.date.includes('T') && !t.date.includes('T00:00:00')) {
                        timeFormatted = format(d, 'HH:mm');
                    }
                }
            } catch {
                // Keep raw
            }

            return {
                'Nº': idx + 1,
                'Fecha': dateFormatted,
                'Hora': timeFormatted || '—',
                'Niño / Paciente': t.patientName || 'Sin asignar',
                'Terapeuta': t.therapistName || 'Sin asignar',
                'Importe (€)': Number((t.amount || 0).toFixed(2)),
                'Estado Cobro': t.status || 'Pagado',
                'Forma de Pago': t.method || (type === 'CARD' ? 'Tarjeta' : type === 'TRANSFER' ? 'Transferencia' : 'Efectivo'),
                'Estado Cotejo': t.isReconciled ? 'Cotejado' : 'Pendiente',
            };
        });

        // Fila de resumen total
        const totalAmount = txList.reduce((sum, t) => sum + (t.amount || 0), 0);
        const totalVerified = txList.filter(t => t.isReconciled).length;
        const totalPending = txList.filter(t => !t.isReconciled).length;

        rows.push({
            'Nº': '',
            'Fecha': 'TOTALES',
            'Hora': '',
            'Niño / Paciente': `${txList.length} registros`,
            'Terapeuta': '',
            'Importe (€)': Number(totalAmount.toFixed(2)),
            'Estado Cobro': '',
            'Forma de Pago': '',
            'Estado Cotejo': `${totalVerified} cotejados / ${totalPending} pendientes`,
        });

        const worksheet = XLSX.utils.json_to_sheet(rows);

        // Anchos de columna óptimos para Excel
        worksheet['!cols'] = [
            { wch: 6 },  // Nº
            { wch: 14 }, // Fecha
            { wch: 10 }, // Hora
            { wch: 32 }, // Niño / Paciente
            { wch: 24 }, // Terapeuta
            { wch: 14 }, // Importe (€)
            { wch: 16 }, // Estado Cobro
            { wch: 18 }, // Forma de Pago
            { wch: 28 }, // Estado Cotejo
        ];

        const workbook = XLSX.utils.book_new();
        const sheetName = type === 'CARD' ? 'Cotejo Datáfono' : type === 'TRANSFER' ? 'Cotejo Transferencias' : 'Cotejo Otras Formas';
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

        // Nombre de archivo descriptivo
        let childClean = filterChildName?.trim()
            ? `_${filterChildName.trim().replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ]/g, '_')}`
            : '';
        let scopeClean = scope === 'ALL_PENDING' ? '_Pendientes_Global' : `_${month}`;
        const fileName = `Cotejo_${typeLabel}${childClean}${scopeClean}.xlsx`;

        XLSX.writeFile(workbook, fileName);
        showToast(`Excel descargado con éxito (${txList.length} registros)`, 'success');
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

    // Cobros realizados en la fecha seleccionada (por fecha real de cobro en caja)
    const collectionsForDay = transactions.filter((t: Transaction) => {
        if (t.status !== 'Pagado') return false;
        const pDate = (t.paymentDate || t.date || '').slice(0, 10);
        return pDate === selectedDate;
    });

    // Cobros de sesiones anteriores recaudadas en la fecha seleccionada
    const pastSessionsCollectedToday = collectionsForDay.filter((t: Transaction) => {
        const sessionDate = (t.date || '').slice(0, 10);
        return sessionDate !== selectedDate;
    });

    // 4. Fusión: transacciones del día + rows de cita sin cobrar
    // Aplicar filtros de estado y método solo sobre las transacciones
    const filteredTx = txForDay.filter((t: Transaction) => {
        const matchesStatus = statusFilter === 'ALL' || t.status === statusFilter;
        const matchesMethod = methodFilter === 'ALL' || t.method === methodFilter;
        return matchesStatus && matchesMethod;
    });

    // Totals for the cards
    // 1. Total Facturado: Total de sesiones/citas del día seleccionado (cobradas + sin cobrar)
    const totalDayInvoiced = txForDay.reduce((acc: number, t: Transaction) => acc + Number(t.amount || 0), 0) +
        apptRowsWithoutTx.reduce((acc: number, a: Appointment) => acc + Number(a.price || 0), 0);

    // 2. Total Cobrado: Suma real de lo pagado e ingresado en caja HOY (por fecha real de cobro)
    const totalCollected = collectionsForDay
        .reduce((acc: number, t: Transaction) => acc + Number(t.amount || 0), 0);

    // Mapeo de deuda acumulada por paciente (para cobro agrupado en 1 clic)
    const patientPendingMap = React.useMemo(() => {
        const map = new Map<string, BatchPaymentItem[]>();
        // 1. Transacciones en estado Pendiente
        transactions.filter(t => t.status === 'Pendiente').forEach(t => {
            const pName = (t.patientName || '').trim();
            if (!pName) return;
            const key = t.patientId ? t.patientId.toLowerCase() : pName.toLowerCase();
            if (!map.has(key)) map.set(key, []);
            map.get(key)!.push({
                transactionId: t.id,
                appointmentId: t.appointmentId,
                amount: Number(t.amount || 0),
                patientId: t.patientId,
                patientName: pName,
                therapistName: t.therapistName,
                date: t.date,
                category: t.category,
            });
        });
        // 2. Citas pasadas no cobradas sin transacción
        historicalUnpaidAppointments
            .filter(a => !txByApptId.has(a.id) && !isNonClinicalSession(a.patientName, a.type))
            .forEach(a => {
                const pName = (a.patientName || '').trim();
                if (!pName) return;
                const key = a.patientId ? a.patientId.toLowerCase() : pName.toLowerCase();
                if (!map.has(key)) map.set(key, []);
                map.get(key)!.push({
                    appointmentId: a.id,
                    amount: (a.price != null && a.price > 0) ? a.price : 60,
                    patientId: a.patientId || '',
                    patientName: pName,
                    therapistName: a.therapistName,
                    date: a.start,
                    category: a.type,
                });
            });
        return map;
    }, [transactions, historicalUnpaidAppointments, txByApptId]);

    const openBatchPayModal = (patientId?: string, patientName?: string, includeAppt?: Appointment) => {
        let items: BatchPaymentItem[] = [];
        const pName = (patientName || includeAppt?.patientName || '').trim();
        const pId = (patientId || includeAppt?.patientId || '').trim();
        const key = pId ? pId.toLowerCase() : pName.toLowerCase();
        
        if (key && patientPendingMap.has(key)) {
            items = [...patientPendingMap.get(key)!];
        }

        // Si se abrió desde una cita de hoy sin cobrar y aún no está en la lista
        if (includeAppt && !items.some(i => i.appointmentId === includeAppt.id)) {
            items.unshift({
                appointmentId: includeAppt.id,
                amount: (includeAppt.price != null && includeAppt.price > 0) ? includeAppt.price : 60,
                patientId: includeAppt.patientId || '',
                patientName: pName,
                therapistName: includeAppt.therapistName,
                date: includeAppt.start,
                category: includeAppt.type,
            });
        }

        setBatchPayPatientId(pId);
        setBatchPayPatientName(pName);
        setBatchPayItems(items);
        setBatchPaySelectedIds(new Set(items.map(i => (i.appointmentId || i.transactionId)!)));
        setBatchPayMethod('Efectivo');
        setBatchPayDate(selectedDate);
        setIsBatchPayModalOpen(true);
    };

    const handleExecuteBatchPay = async () => {
        const selectedItems = batchPayItems.filter(i => batchPaySelectedIds.has((i.appointmentId || i.transactionId)!));
        if (selectedItems.length === 0) {
            showToast('Selecciona al menos una sesión para cobrar', 'info');
            return;
        }
        setIsBatchProcessing(true);
        try {
            const pDateIso = new Date(batchPayDate).toISOString();
            const res = await batchPayAppointments(selectedItems, batchPayMethod, pDateIso);
            showToast(`Cobro registrado: ${res.success} sesión(es) cobrada(s) con éxito`, 'success');
            setIsBatchPayModalOpen(false);
            await fetchData();
        } catch (err) {
            console.error("Error executing batch pay:", err);
            showToast("Error al procesar el cobro agrupado", "error");
        } finally {
            setIsBatchProcessing(false);
        }
    };

    // 3. Pendiente Histórico (todas las transacciones no pagadas + citas nunca cobradas)
    // IDs de citas con transacción
    const allTxApptIds = new Set(transactions.map(t => t.appointmentId).filter(Boolean));

    // Transacciones con estado Pendiente
    const pendingTransactionsAmount = transactions
        .filter(t => t.status === 'Pendiente' && isSameMonth(parseISO(t.date), new Date()))
        .reduce((acc, t) => acc + Number(t.amount || 0), 0);

    // Citas que no están pagadas Y no tienen transacción asociada
    const unchargedAppointmentsAmount = historicalUnpaidAppointments
        .filter(a => !allTxApptIds.has(a.id))
        .reduce((acc, a) => acc + Number(a.price || 0), 0);

    const pendingAmount = pendingTransactionsAmount + unchargedAppointmentsAmount;


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
        // IDs de citas con transacción (para evitar duplicados en el listado de pendientes)
        const allTxApptIds = new Set(transactions.map(t => t.appointmentId).filter(Boolean));

        if (breakdownFilter === 'PENDING') {
            // Histórico de Pendientes: Transacciones Pendientes + Citas no cobradas
            const pendingTxs = transactions.filter(t => t.status === 'Pendiente');
            const unchargedAppts = historicalUnpaidAppointments
                .filter(a => !allTxApptIds.has(a.id))
                .map(a => ({
                    id: `appt-pending-${a.id}`,
                    appointmentId: a.id,
                    patientId: a.patientId,
                    patientName: a.patientName,
                    therapistName: a.therapistName,
                    amount: a.price || 0,
                    date: a.start,
                    status: 'Pendiente' as const,
                    category: a.type,
                    _rawAppt: a // Store for later payment
                }));
            return [...pendingTxs, ...unchargedAppts].sort((a, b) => b.date.localeCompare(a.date));
        }

        // Para INVOICED (ALL) y COLLECTED (PAID), filtramos por la fecha seleccionada
        const dayTxs = transactions.filter(t => {
            const isSameDate = (t.date ?? '').slice(0, 10) === selectedDate;
            if (!isSameDate) return false;

            if (breakdownFilter === 'PAID') return t.status === 'Pagado';
            return true;
        });

        if (breakdownFilter === 'ALL') {
            // Incluir también las citas de hoy sin cobrar para que el desglose coincida con el Total Facturado
            const unchargedToday = apptRowsWithoutTx.map(a => ({
                id: `appt-day-${a.id}`,
                appointmentId: a.id,
                patientId: a.patientId,
                patientName: a.patientName,
                therapistName: a.therapistName,
                amount: a.price || 0,
                date: a.start,
                status: 'Pendiente' as const,
                category: a.type,
                _rawAppt: a
            }));
            return [...dayTxs, ...unchargedToday].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        }

        return dayTxs;
    };

    return (
        <div className="billing-container">
            <div className="page-header">
                <div>
                    <h1 className="page-title">
                        <Banknote size={28} style={{ color: '#1A5F7A' }} />
                        {isTherapist ? 'Mi Facturación' : 'Finanzas y Facturación'}
                    </h1>
                    <p className="page-subtitle">
                        {isTherapist 
                            ? 'Control de tus sesiones cobradas y pendientes' 
                            : 'Control de ingresos, caja diaria y facturas legales'}
                    </p>
                </div>
                <div className="flex items-center gap-3" style={{ flexWrap: 'wrap' }}>
                    {activeTab === 'TRANSACTIONS' && (
                        <>
                            <div className="date-filter-modern">
                                <CalendarIcon size={16} style={{ color: '#94a3b8' }} />
                                <input
                                    type="date"
                                    className="date-input-clean"
                                    value={selectedDate}
                                    onChange={(e) => setSelectedDate(e.target.value)}
                                />
                            </div>
                            <div className="date-filter-modern">
                                <Filter size={16} style={{ color: '#94a3b8' }} />
                                <select
                                    className="date-input-clean"
                                    value={statusFilter}
                                    onChange={(e) => setStatusFilter(e.target.value as any)}
                                >
                                    <option value="ALL">Todos</option>
                                    <option value="Pendiente">Pendiente</option>
                                    <option value="Pagado">Pagado</option>
                                </select>
                            </div>
                            <div className="date-filter-modern">
                                <CreditCard size={16} style={{ color: '#94a3b8' }} />
                                <select
                                    className="date-input-clean"
                                    value={methodFilter}
                                    onChange={(e) => setMethodFilter(e.target.value as any)}
                                >
                                    <option value="ALL">Método</option>
                                    <option value="Efectivo">Efectivo</option>
                                    <option value="Tarjeta">Tarjeta</option>
                                    <option value="Transferencia">Transferencia</option>
                                    <option value="Fin de mes">Fin de mes</option>
                                </select>
                            </div>
                            {!isTherapist && (
                                <>
                                    <button
                                        type="button"
                                        className="btn-secondary flex items-center gap-2"
                                        onClick={() => openBatchPayModal()}
                                        style={{ borderRadius: '12px', padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                                        title="Cobro conjunto de varias sesiones de un paciente"
                                    >
                                        <Layers size={16} />
                                        Cobro Agrupado
                                    </button>
                                    <button
                                        type="button"
                                        className="btn-secondary flex items-center gap-2"
                                        onClick={() => setIsClosingModalOpen(true)}
                                        style={{ borderRadius: '12px', padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                                    >
                                        <Wallet size={16} />
                                        Cierre de Caja
                                    </button>
                                </>
                            )}
                        </>
                    )}
                </div>
            </div>

            {!isTherapist && (
                <div className="finance-overview">
                    <Card className="overview-card" onClick={() => handleCardClick('INVOICED')}>
                        <div className="overview-icon status-neutral">
                            <DollarSign size={24} />
                        </div>
                        <div className="overview-info">
                            <span className="overview-label">Total Facturado</span>
                            <span className="overview-value">{totalDayInvoiced.toFixed(2)}€</span>
                        </div>
                    </Card>
                    <Card className="overview-card" onClick={() => handleCardClick('COLLECTED')}>
                        <div className="overview-icon status-positive">
                            <TrendingUp size={24} />
                        </div>
                        <div className="overview-info">
                            <span className="overview-label">Total Cobrado</span>
                            <span className="overview-value" style={{ color: '#059669' }}>{totalCollected.toFixed(2)}€</span>
                        </div>
                    </Card>
                    <Card className="overview-card" onClick={() => handleCardClick('PENDING')}>
                        <div className="overview-icon status-attention">
                            <AlertTriangle size={22} />
                        </div>
                        <div className="overview-info">
                            <span className="overview-label">Pendiente (Mes)</span>
                            <span className="overview-value" style={{ color: '#d97706' }}>{pendingAmount.toFixed(2)}€</span>
                        </div>
                    </Card>
                </div>
            )}

            {/* Tabs - Only show for ADMIN */}
            {!isTherapist && (
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
                    <button
                        className={`tab-btn-pill ${activeTab === 'RECONCILIATION' ? 'active' : ''}`}
                        onClick={() => setActiveTab('RECONCILIATION')}
                    >
                        <div className="flex items-center gap-2">
                            <CheckCircle size={18} />
                            Cotejo y Conciliación
                        </div>
                    </button>
                </div>
            )}

            {activeTab === 'INVOICES' ? (
                <InvoiceList onPrint={handlePrintInvoice} patients={patients} />
            ) : activeTab === 'RECONCILIATION' ? (
                <div className="reconciliation-view">
                    {/* Sub-pestañas: Datáfono / Tarjetas vs Transferencias vs Otras Formas */}
                    <div className="reconciliation-subtabs">
                        <button
                            className={`reconcile-subtab-btn ${reconciliationType === 'CARD' ? 'active' : ''}`}
                            onClick={() => setReconciliationType('CARD')}
                        >
                            <CreditCard size={18} />
                            Cotejo de Datáfono / Tarjetas
                            {cardMonthPendingCount > 0 && (
                                <span style={{ fontSize: '0.72rem', background: '#fef3c7', color: '#b45309', padding: '1px 6px', borderRadius: '10px', fontWeight: 700 }}>
                                    {cardMonthPendingCount}
                                </span>
                            )}
                        </button>
                        <button
                            className={`reconcile-subtab-btn ${reconciliationType === 'TRANSFER' ? 'active' : ''}`}
                            onClick={() => setReconciliationType('TRANSFER')}
                        >
                            <Landmark size={18} />
                            Cotejo de Transferencias
                            {transferMonthPendingCount > 0 && (
                                <span style={{ fontSize: '0.72rem', background: '#fef3c7', color: '#b45309', padding: '1px 6px', borderRadius: '10px', fontWeight: 700 }}>
                                    {transferMonthPendingCount}
                                </span>
                            )}
                        </button>
                        <button
                            className={`reconcile-subtab-btn ${reconciliationType === 'OTHER' ? 'active' : ''}`}
                            onClick={() => setReconciliationType('OTHER')}
                        >
                            <Banknote size={18} />
                            Otras Formas (Efectivo / Fin de mes)
                            {otherMonthPendingCount > 0 && (
                                <span style={{ fontSize: '0.72rem', background: '#fef3c7', color: '#b45309', padding: '1px 6px', borderRadius: '10px', fontWeight: 700 }}>
                                    {otherMonthPendingCount}
                                </span>
                            )}
                        </button>
                    </div>

                    {reconciliationType === 'CARD' ? (
                        <div className="card-reconciliation-view">
                            {/* Resumen del mes */}
                            <div className="reconcile-stats-grid">
                                <div
                                    className={`reconcile-stat-card clickable ${cardScope === 'MONTH' && cardReconciledFilter === 'ALL' ? 'active-filter' : ''}`}
                                    onClick={() => { setCardScope('MONTH'); setCardReconciledFilter('ALL'); }}
                                    title="Clic para ver todos los cobros con tarjeta de este mes"
                                >
                                    <div className="reconcile-stat-icon card-total">
                                        <CreditCard size={22} />
                                    </div>
                                    <div className="reconcile-stat-info">
                                        <div className="label">
                                            Total Tarjeta ({format(parse(reconciliationMonth, 'yyyy-MM', new Date()), "MMMM yyyy", { locale: es })})
                                        </div>
                                        <div className="value">{cardMonthTotal.toFixed(2)}€</div>
                                        <div className="sub">{cardMonthCount} cobros (clic para ver todos)</div>
                                    </div>
                                </div>

                                <div
                                    className={`reconcile-stat-card clickable ${cardScope === 'MONTH' && cardReconciledFilter === 'VERIFIED' ? 'active-filter verified' : ''}`}
                                    onClick={() => { setCardScope('MONTH'); setCardReconciledFilter('VERIFIED'); }}
                                    title="Clic para ver los tickets ya cotejados de este mes"
                                >
                                    <div className="reconcile-stat-icon card-verified">
                                        <CheckCircle size={22} />
                                    </div>
                                    <div className="reconcile-stat-info">
                                        <div className="label">Tickets Cotejados</div>
                                        <div className="value" style={{ color: '#059669' }}>{cardMonthVerifiedTotal.toFixed(2)}€</div>
                                        <div className="sub">{cardMonthVerifiedCount} tickets verificados (clic para ver)</div>
                                    </div>
                                </div>

                                <div
                                    className={`reconcile-stat-card clickable ${cardScope === 'MONTH' && cardReconciledFilter === 'PENDING' ? 'active-filter pending' : ''}`}
                                    onClick={() => { setCardScope('MONTH'); setCardReconciledFilter('PENDING'); }}
                                    title="Clic para ver el listado de tickets pendientes de cotejo de este mes"
                                >
                                    <div className="reconcile-stat-icon card-pending">
                                        <Clock size={22} />
                                    </div>
                                    <div className="reconcile-stat-info">
                                        <div className="label flex items-center justify-between">
                                            <span>Pendientes de Cotejo</span>
                                            {cardMonthPendingCount > 0 && <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded-full">¡Revisar!</span>}
                                        </div>
                                        <div className="value" style={{ color: '#d97706' }}>{cardMonthPendingTotal.toFixed(2)}€</div>
                                        <div className="sub font-semibold" style={{ color: '#b45309' }}>
                                            {cardMonthPendingCount} pendientes (👉 Clic para listar)
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Barra Superior de Periodo y Ámbito */}
                            <div className="reconcile-filter-bar">
                                {/* Selector de Ámbito */}
                                <div className="scope-toggle-pills">
                                    <button
                                        type="button"
                                        className={`scope-pill-btn ${cardScope === 'MONTH' ? 'active' : ''}`}
                                        onClick={() => setCardScope('MONTH')}
                                        title="Ver cobros del mes seleccionado"
                                    >
                                        📅 Por Mes
                                    </button>
                                    <button
                                        type="button"
                                        className={`scope-pill-btn ${cardScope === 'ALL_PENDING' ? 'active' : ''}`}
                                        onClick={() => setCardScope('ALL_PENDING')}
                                        title="Ver todas las citas con tarjeta pendientes de cotejar de todo el centro"
                                    >
                                        ⚡ Todas las Pendientes ({allPendingCardCount})
                                    </button>
                                </div>

                                {cardScope === 'MONTH' && (
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-bold uppercase text-secondary">Mes:</span>
                                        <div className="month-navigator">
                                            <button className="month-nav-btn" onClick={handlePrevMonth} title="Mes anterior">
                                                <ChevronLeft size={16} />
                                            </button>
                                            <input
                                                type="month"
                                                className="month-input-clean"
                                                value={reconciliationMonth}
                                                onChange={(e) => setReconciliationMonth(e.target.value)}
                                            />
                                            <button className="month-nav-btn" onClick={handleNextMonth} title="Mes siguiente">
                                                <ChevronRight size={16} />
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Resumen, Limpieza y Descarga Excel */}
                                <div className="reconcile-counter-badge ml-auto flex items-center gap-2">
                                    <span className="text-xs text-secondary font-medium">
                                        Mostrando <strong>{filteredCardTransactions.length}</strong> de {sourceTransactions.length} cobros
                                    </span>
                                    {hasActiveCardFilters && (
                                        <button
                                            type="button"
                                            className="th-clear-filters-btn active"
                                            onClick={handleResetCardFilters}
                                            title="Restablecer todos los filtros de la tabla"
                                        >
                                            <RotateCcw size={12} /> Limpiar filtros
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        className="btn-export-excel"
                                        onClick={() => exportReconciliationToExcel(filteredCardTransactions, 'CARD', cardScope, reconciliationMonth, cardSearchChild)}
                                        title={`Descargar ${filteredCardTransactions.length} cobros de datáfono a Excel (.xlsx)`}
                                    >
                                        <FileSpreadsheet size={15} />
                                        <span>Exportar Excel</span>
                                    </button>
                                </div>
                            </div>

                            {/* Banner cuando se visualizan Todas las pendientes globales */}
                            {cardScope === 'ALL_PENDING' && (
                                <div className="scope-all-pending-banner">
                                    <div className="flex items-center gap-2">
                                        <Clock size={18} className="text-amber-600 flex-shrink-0" />
                                        <div>
                                            <span className="font-bold text-amber-900 text-sm">
                                                Listado Global de Citas Pendientes de Cotejar:
                                            </span>
                                            <span className="text-amber-800 text-sm ml-2">
                                                {allPendingCardCount} tickets de datáfono sin verificar en todo el centro ({allPendingCardTotal.toFixed(2)}€).
                                            </span>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        className="btn-secondary micro"
                                        onClick={() => setCardScope('MONTH')}
                                    >
                                        Volver a vista por mes
                                    </button>
                                </div>
                            )}

                            {/* Banner cuando se filtra por un niño */}
                            {cardSearchChild.trim() && (
                                <div className="child-banner-info">
                                    <div className="text-sm">
                                        <span>Resultados para <strong>"{cardSearchChild}"</strong>: </span>
                                        <span className="font-bold text-primary">{filteredCardTransactions.length} pagos encontrados ({filteredCardTransactions.reduce((acc, t) => acc + t.amount, 0).toFixed(2)}€)</span>
                                        <span className="text-secondary ml-2">
                                            ({filteredCardTransactions.filter(t => t.method === 'Tarjeta' && t.isReconciled).length} cotejados, {filteredCardTransactions.filter(t => t.method === 'Tarjeta' && !t.isReconciled).length} pendientes de tarjeta
                                            {filteredCardTransactions.some(t => t.method !== 'Tarjeta') && `, ${filteredCardTransactions.filter(t => t.method !== 'Tarjeta').length} con otro método`}
                                            )
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {cardMethodFilter === 'CARD_ONLY' && allTransactionsMonth.some(t => t.method !== 'Tarjeta' && normalizeSearch(t.patientName).includes(normalizeSearch(cardSearchChild))) && (
                                            <button
                                                className="btn-secondary micro"
                                                onClick={() => setCardMethodFilter('ALL')}
                                            >
                                                🔍 Ver otros métodos de este niño
                                            </button>
                                        )}
                                        {filteredCardTransactions.some(t => t.method === 'Tarjeta' && !t.isReconciled) && (
                                            <button
                                                className="btn-primary micro flex items-center gap-1"
                                                onClick={() => handleBatchReconcileShown(filteredCardTransactions.filter(t => t.method === 'Tarjeta'))}
                                            >
                                                <CheckCheck size={14} />
                                                Cotejar tarjetas de este niño
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Tabla de cobros por tarjeta */}
                            <div className="billing-table-wrapper">
                                <table className="billing-table">
                                    <thead>
                                        {/* Fila 1: Cabeceras Ordenables con Clic */}
                                        <tr className="tr-header-sort">
                                            <th style={{ width: '125px' }} className="th-sortable" onClick={() => handleToggleCardSort('date')} title="Clic para ordenar por Fecha y Hora">
                                                <div className="th-sort-btn">
                                                    <span>Fecha y Hora</span>
                                                    {renderSortIcon('date')}
                                                </div>
                                            </th>
                                            <th className="th-sortable" onClick={() => handleToggleCardSort('patient')} title="Clic para ordenar alfabéticamente por Niño">
                                                <div className="th-sort-btn">
                                                    <span>Niño / Paciente</span>
                                                    {renderSortIcon('patient')}
                                                </div>
                                            </th>
                                            <th style={{ width: '150px' }} className="th-sortable" onClick={() => handleToggleCardSort('therapist')} title="Clic para ordenar por Terapeuta">
                                                <div className="th-sort-btn">
                                                    <span>Terapeuta</span>
                                                    {renderSortIcon('therapist')}
                                                </div>
                                            </th>
                                            <th style={{ width: '90px' }} className="th-sortable" onClick={() => handleToggleCardSort('amount')} title="Clic para ordenar por Importe">
                                                <div className="th-sort-btn">
                                                    <span>Importe</span>
                                                    {renderSortIcon('amount')}
                                                </div>
                                            </th>
                                            <th style={{ width: '105px' }} className="th-sortable" onClick={() => handleToggleCardSort('status')} title="Clic para ordenar por Estado">
                                                <div className="th-sort-btn">
                                                    <span>Estado</span>
                                                    {renderSortIcon('status')}
                                                </div>
                                            </th>
                                            <th style={{ width: '150px' }} className="th-sortable" onClick={() => handleToggleCardSort('method')} title="Clic para ordenar por Forma de Pago">
                                                <div className="th-sort-btn">
                                                    <span>Forma de Pago</span>
                                                    {renderSortIcon('method')}
                                                </div>
                                            </th>
                                            <th style={{ width: '160px' }} className="th-sortable" onClick={() => handleToggleCardSort('reconciled')} title="Clic para ordenar por Estado de Cotejo">
                                                <div className="th-sort-btn">
                                                    <span>Cotejo Datáfono</span>
                                                    {renderSortIcon('reconciled')}
                                                </div>
                                            </th>
                                            <th style={{ width: '125px', textAlign: 'right' }}>
                                                <span>Acción</span>
                                            </th>
                                        </tr>

                                        {/* Fila 2: Cabeceras con Filtros Integrados */}
                                        <tr className="tr-filter-header">
                                            {/* Filtro Fecha y Hora */}
                                            <th>
                                                <span className="th-filter-hint">Ordenar ↕</span>
                                            </th>

                                            {/* Filtro Niño / Paciente */}
                                            <th>
                                                <div className="th-filter-input-wrapper">
                                                    <Search size={13} className="th-filter-icon" />
                                                    <input
                                                        type="text"
                                                        className="th-filter-input"
                                                        placeholder="Filtrar por niño..."
                                                        value={cardSearchChild}
                                                        onChange={(e) => setCardSearchChild(e.target.value)}
                                                        title="Filtrar por nombre o apellido de niño"
                                                    />
                                                    {cardSearchChild && (
                                                        <button
                                                            type="button"
                                                            className="th-filter-clear-btn"
                                                            onClick={() => setCardSearchChild('')}
                                                            title="Borrar filtro de niño"
                                                        >
                                                            <X size={12} />
                                                        </button>
                                                    )}
                                                </div>
                                            </th>

                                            {/* Filtro Terapeuta */}
                                            <th>
                                                <select
                                                    className="th-filter-select"
                                                    value={cardTherapistFilter}
                                                    onChange={(e) => setCardTherapistFilter(e.target.value)}
                                                    title="Filtrar por terapeuta"
                                                >
                                                    <option value="ALL">Todos ({uniqueTherapists.length})</option>
                                                    {uniqueTherapists.map(name => (
                                                        <option key={name} value={name}>{name}</option>
                                                    ))}
                                                </select>
                                            </th>

                                            {/* Filtro Importe */}
                                            <th>
                                                <span className="th-filter-hint">—</span>
                                            </th>

                                            {/* Filtro Estado */}
                                            <th>
                                                <select
                                                    className="th-filter-select"
                                                    value={cardStatusFilter}
                                                    onChange={(e) => setCardStatusFilter(e.target.value as any)}
                                                    title="Filtrar por estado del cobro"
                                                >
                                                    <option value="ALL">Todos</option>
                                                    <option value="Pagado">Pagado</option>
                                                    <option value="Pendiente">Pendiente</option>
                                                </select>
                                            </th>

                                            {/* Filtro Forma de Pago */}
                                            <th>
                                                {cardScope === 'ALL_PENDING' ? (
                                                    <span className="th-filter-locked" title="En ámbito global solo se cotejan cobros por Tarjeta">
                                                        💳 Tarjeta
                                                    </span>
                                                ) : (
                                                    <select
                                                        className="th-filter-select"
                                                        value={cardMethodFilter}
                                                        onChange={(e) => setCardMethodFilter(e.target.value as any)}
                                                        title="Filtrar por forma de pago"
                                                    >
                                                        <option value="CARD_ONLY">💳 Solo Tarjetas</option>
                                                        <option value="ALL">🔍 Todas</option>
                                                        <option value="Efectivo">💵 Efectivo</option>
                                                        <option value="Transferencia">🏦 Transferencia</option>
                                                    </select>
                                                )}
                                            </th>

                                            {/* Filtro Cotejo Datáfono */}
                                            <th>
                                                {cardScope === 'ALL_PENDING' ? (
                                                    <span className="th-filter-locked" title="En ámbito global todas las citas mostradas están pendientes de cotejar">
                                                        ⚠️ Pendientes
                                                    </span>
                                                ) : (
                                                    <select
                                                        className="th-filter-select"
                                                        value={cardReconciledFilter}
                                                        onChange={(e) => setCardReconciledFilter(e.target.value as any)}
                                                        title="Filtrar por estado de cotejo"
                                                    >
                                                        <option value="ALL">Todos</option>
                                                        <option value="PENDING">⚠️ Pendientes</option>
                                                        <option value="VERIFIED">✅ Cotejados</option>
                                                    </select>
                                                )}
                                            </th>

                                            {/* Acción: Botón Limpiar filtros si hay alguno activo */}
                                            <th style={{ textAlign: 'right' }}>
                                                {hasActiveCardFilters ? (
                                                    <button
                                                        type="button"
                                                        className="th-clear-filters-btn active"
                                                        onClick={handleResetCardFilters}
                                                        title="Limpiar todos los filtros"
                                                    >
                                                        <RotateCcw size={12} /> Limpiar
                                                    </button>
                                                ) : (
                                                    <span className="th-filter-hint">Filtros</span>
                                                )}
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredCardTransactions.length === 0 ? (
                                            <tr>
                                                <td colSpan={8} className="text-center py-8 text-secondary">
                                                    {cardSearchChild
                                                        ? `No se encontraron cobros para "${cardSearchChild}" con los filtros seleccionados.`
                                                        : `No hay cobros registrados con los filtros seleccionados en este periodo.`}
                                                </td>
                                            </tr>
                                        ) : (
                                            filteredCardTransactions.map(t => (
                                                <tr key={t.id} style={{ opacity: t.isReconciled ? 0.75 : 1 }}>
                                                    <td>
                                                        <div style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.85rem' }}>
                                                            {(() => {
                                                                try {
                                                                    const d = parseISO(t.date);
                                                                    return isValid(d) ? format(d, 'dd/MM/yyyy') : t.date;
                                                                } catch {
                                                                    return t.date;
                                                                }
                                                            })()}
                                                        </div>
                                                        {t.date && t.date.includes('T') && !t.date.includes('T00:00:00') && (
                                                            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                                                {(() => {
                                                                    try {
                                                                        const d = parseISO(t.date);
                                                                        return isValid(d) ? format(d, 'HH:mm') : '';
                                                                    } catch {
                                                                        return '';
                                                                    }
                                                                })()}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td style={{ fontWeight: 600 }}>{t.patientName}</td>
                                                    <td className="text-secondary text-sm">{t.therapistName || '—'}</td>
                                                    <td className="amount-text">
                                                        <div className="flex items-center gap-1">
                                                            <input
                                                                key={`amt-${t.id}-${t.amount}`}
                                                                type="number"
                                                                className="reconcile-amount-input"
                                                                defaultValue={t.amount}
                                                                onBlur={(e) => handleQuickChangeAmount(t, Number(e.target.value))}
                                                                style={{ width: '56px', padding: '0.2rem 0.35rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontWeight: 700, fontSize: '0.85rem' }}
                                                                title="Modificar importe de la cita / cobro"
                                                            />
                                                            <span className="text-secondary text-xs">€</span>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <span className={`badge ${t.status === 'Pagado' ? 'badge-success' : 'badge-warning'}`} style={{ whiteSpace: 'nowrap' }}>
                                                            {t.status}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <select
                                                            className="reconcile-method-select"
                                                            value={t.method || 'Tarjeta'}
                                                            onChange={(e) => handleQuickChangeMethod(t, e.target.value as PaymentMethod)}
                                                            title="Cambiar forma de pago si hubo un error en admin"
                                                        >
                                                            <option value="Tarjeta">💳 Tarjeta</option>
                                                            <option value="Efectivo">💵 Efectivo</option>
                                                            <option value="Transferencia">🏦 Transferencia</option>
                                                            <option value="Fin de mes">📅 Fin de mes</option>
                                                        </select>
                                                    </td>
                                                    <td>
                                                        {t.method === 'Tarjeta' ? (
                                                            t.isReconciled ? (
                                                                <span className="flex items-center gap-1 text-success font-semibold text-xs bg-emerald-50 px-2 py-1 rounded-md border border-emerald-100" style={{ width: 'fit-content', whiteSpace: 'nowrap' }}>
                                                                    <CheckCircle size={14} /> Cotejado
                                                                </span>
                                                            ) : (
                                                                <span className="flex items-center gap-1 text-amber-600 font-semibold text-xs bg-amber-50 px-2 py-1 rounded-md border border-amber-100" style={{ width: 'fit-content', whiteSpace: 'nowrap' }}>
                                                                    <Clock size={14} /> Pendiente ticket
                                                                </span>
                                                            )
                                                        ) : (
                                                            <span className="text-secondary text-xs italic opacity-75" style={{ whiteSpace: 'nowrap' }}>
                                                                No aplica ({t.method})
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                        {t.method === 'Tarjeta' ? (
                                                            <button
                                                                className={`btn-reconcile-action ${t.isReconciled ? 'action-unverify' : 'action-verify'}`}
                                                                onClick={() => handleToggleReconciliation(t.id, t.isReconciled ?? false)}
                                                                style={{ whiteSpace: 'nowrap' }}
                                                            >
                                                                {t.isReconciled ? (
                                                                    <>Desmarcar</>
                                                                ) : (
                                                                    <><CheckCircle size={14} /> Cotejar</>
                                                                )}
                                                            </button>
                                                        ) : (
                                                            <button
                                                                className="btn-secondary micro"
                                                                onClick={() => handleQuickChangeMethod(t, 'Tarjeta')}
                                                                title="Cambiar a Tarjeta para poder cotejar el ticket de datáfono"
                                                                style={{ whiteSpace: 'nowrap' }}
                                                            >
                                                                Pasar a Tarjeta
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ) : reconciliationType === 'TRANSFER' ? (
                        <div className="transfer-reconciliation-view">
                            {/* Resumen del mes */}
                            <div className="reconcile-stats-grid">
                                <div
                                    className={`reconcile-stat-card clickable ${transferScope === 'MONTH' && transferReconciledFilter === 'ALL' ? 'active-filter' : ''}`}
                                    onClick={() => { setTransferScope('MONTH'); setTransferReconciledFilter('ALL'); }}
                                    title="Clic para ver todos los cobros por transferencia de este mes"
                                >
                                    <div className="reconcile-stat-icon transfer-total">
                                        <Landmark size={22} />
                                    </div>
                                    <div className="reconcile-stat-info">
                                        <div className="label">
                                            Total Transferencias ({format(parse(reconciliationMonth, 'yyyy-MM', new Date()), "MMMM yyyy", { locale: es })})
                                        </div>
                                        <div className="value">{transferMonthTotal.toFixed(2)}€</div>
                                        <div className="sub">{transferMonthCount} cobros (clic para ver todos)</div>
                                    </div>
                                </div>

                                <div
                                    className={`reconcile-stat-card clickable ${transferScope === 'MONTH' && transferReconciledFilter === 'VERIFIED' ? 'active-filter verified' : ''}`}
                                    onClick={() => { setTransferScope('MONTH'); setTransferReconciledFilter('VERIFIED'); }}
                                    title="Clic para ver las transferencias ya cotejadas con el banco"
                                >
                                    <div className="reconcile-stat-icon transfer-verified">
                                        <CheckCircle size={22} />
                                    </div>
                                    <div className="reconcile-stat-info">
                                        <div className="label">Transferencias Cotejadas</div>
                                        <div className="value" style={{ color: '#059669' }}>{transferMonthVerifiedTotal.toFixed(2)}€</div>
                                        <div className="sub">{transferMonthVerifiedCount} verificadas en banco (clic para ver)</div>
                                    </div>
                                </div>

                                <div
                                    className={`reconcile-stat-card clickable ${transferScope === 'MONTH' && transferReconciledFilter === 'PENDING' ? 'active-filter pending' : ''}`}
                                    onClick={() => { setTransferScope('MONTH'); setTransferReconciledFilter('PENDING'); }}
                                    title="Clic para ver las transferencias pendientes de cotejar en banco"
                                >
                                    <div className="reconcile-stat-icon transfer-pending">
                                        <Clock size={22} />
                                    </div>
                                    <div className="reconcile-stat-info">
                                        <div className="label flex items-center justify-between">
                                            <span>Pendientes de Cotejo</span>
                                            {transferMonthPendingCount > 0 && <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded-full">¡Revisar!</span>}
                                        </div>
                                        <div className="value" style={{ color: '#d97706' }}>{transferMonthPendingTotal.toFixed(2)}€</div>
                                        <div className="sub font-semibold" style={{ color: '#b45309' }}>
                                            {transferMonthPendingCount} pendientes (👉 Clic para listar)
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Barra Superior de Periodo y Ámbito */}
                            <div className="reconcile-filter-bar">
                                {/* Selector de Ámbito */}
                                <div className="scope-toggle-pills">
                                    <button
                                        type="button"
                                        className={`scope-pill-btn ${transferScope === 'MONTH' ? 'active' : ''}`}
                                        onClick={() => setTransferScope('MONTH')}
                                        title="Ver transferencias del mes seleccionado"
                                    >
                                        📅 Por Mes
                                    </button>
                                    <button
                                        type="button"
                                        className={`scope-pill-btn ${transferScope === 'ALL_PENDING' ? 'active' : ''}`}
                                        onClick={() => setTransferScope('ALL_PENDING')}
                                        title="Ver todas las transferencias pendientes de cotejar de todo el centro"
                                    >
                                        ⚡ Todas las Pendientes ({allPendingTransferCount})
                                    </button>
                                </div>

                                {transferScope === 'MONTH' && (
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-bold uppercase text-secondary">Mes:</span>
                                        <div className="month-navigator">
                                            <button className="month-nav-btn" onClick={handlePrevMonth} title="Mes anterior">
                                                <ChevronLeft size={16} />
                                            </button>
                                            <input
                                                type="month"
                                                className="month-input-clean"
                                                value={reconciliationMonth}
                                                onChange={(e) => setReconciliationMonth(e.target.value)}
                                            />
                                            <button className="month-nav-btn" onClick={handleNextMonth} title="Mes siguiente">
                                                <ChevronRight size={16} />
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Resumen, Limpieza y Descarga Excel */}
                                <div className="reconcile-counter-badge ml-auto flex items-center gap-2">
                                    <span className="text-xs text-secondary font-medium">
                                        Mostrando <strong>{filteredTransferTransactions.length}</strong> de {transferSourceTransactions.length} cobros
                                    </span>
                                    {hasActiveTransferFilters && (
                                        <button
                                            type="button"
                                            className="th-clear-filters-btn active"
                                            onClick={handleResetTransferFilters}
                                            title="Restablecer todos los filtros de la tabla"
                                        >
                                            <RotateCcw size={12} /> Limpiar filtros
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        className="btn-export-excel"
                                        onClick={() => exportReconciliationToExcel(filteredTransferTransactions, 'TRANSFER', transferScope, reconciliationMonth, transferSearchChild)}
                                        title={`Descargar ${filteredTransferTransactions.length} transferencias a Excel (.xlsx)`}
                                    >
                                        <FileSpreadsheet size={15} />
                                        <span>Exportar Excel</span>
                                    </button>
                                </div>
                            </div>

                            {/* Banner cuando se visualizan Todas las transferencias pendientes globales */}
                            {transferScope === 'ALL_PENDING' && (
                                <div className="scope-all-pending-banner">
                                    <div className="flex items-center gap-2">
                                        <Clock size={18} className="text-amber-600 flex-shrink-0" />
                                        <div>
                                            <span className="font-bold text-amber-900 text-sm">
                                                Listado Global de Transferencias Pendientes de Cotejar:
                                            </span>
                                            <span className="text-amber-800 text-sm ml-2">
                                                {allPendingTransferCount} transferencias bancarias sin verificar en todo el centro ({allPendingTransferTotal.toFixed(2)}€).
                                            </span>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        className="btn-secondary micro"
                                        onClick={() => setTransferScope('MONTH')}
                                    >
                                        Volver a vista por mes
                                    </button>
                                </div>
                            )}

                            {/* Banner cuando se filtra por un niño */}
                            {transferSearchChild.trim() && (
                                <div className="child-banner-info">
                                    <div className="text-sm">
                                        <span>Resultados para <strong>"{transferSearchChild}"</strong>: </span>
                                        <span className="font-bold text-primary">{filteredTransferTransactions.length} pagos encontrados ({filteredTransferTransactions.reduce((acc, t) => acc + t.amount, 0).toFixed(2)}€)</span>
                                        <span className="text-secondary ml-2">
                                            ({filteredTransferTransactions.filter(t => t.method === 'Transferencia' && t.isReconciled).length} cotejadas, {filteredTransferTransactions.filter(t => t.method === 'Transferencia' && !t.isReconciled).length} pendientes de transferencia
                                            {filteredTransferTransactions.some(t => t.method !== 'Transferencia') && `, ${filteredTransferTransactions.filter(t => t.method !== 'Transferencia').length} con otro método`}
                                            )
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {transferMethodFilter === 'TRANSFER_ONLY' && allTransactionsMonth.some(t => t.method !== 'Transferencia' && normalizeSearch(t.patientName).includes(normalizeSearch(transferSearchChild))) && (
                                            <button
                                                className="btn-secondary micro"
                                                onClick={() => setTransferMethodFilter('ALL')}
                                            >
                                                🔍 Ver otros métodos de este niño
                                            </button>
                                        )}
                                        {filteredTransferTransactions.some(t => t.method === 'Transferencia' && !t.isReconciled) && (
                                            <button
                                                className="btn-primary micro flex items-center gap-1"
                                                onClick={() => handleBatchReconcileShown(filteredTransferTransactions.filter(t => t.method === 'Transferencia'))}
                                            >
                                                <CheckCheck size={14} />
                                                Cotejar transferencias de este niño
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Tabla de cobros por transferencia */}
                            <div className="billing-table-wrapper">
                                <table className="billing-table">
                                    <thead>
                                        {/* Fila 1: Cabeceras Ordenables con Clic */}
                                        <tr className="tr-header-sort">
                                            <th style={{ width: '125px' }} className="th-sortable" onClick={() => handleToggleTransferSort('date')} title="Clic para ordenar por Fecha y Hora">
                                                <div className="th-sort-btn">
                                                    <span>Fecha y Hora</span>
                                                    {renderTransferSortIcon('date')}
                                                </div>
                                            </th>
                                            <th className="th-sortable" onClick={() => handleToggleTransferSort('patient')} title="Clic para ordenar alfabéticamente por Niño">
                                                <div className="th-sort-btn">
                                                    <span>Niño / Paciente</span>
                                                    {renderTransferSortIcon('patient')}
                                                </div>
                                            </th>
                                            <th style={{ width: '150px' }} className="th-sortable" onClick={() => handleToggleTransferSort('therapist')} title="Clic para ordenar por Terapeuta">
                                                <div className="th-sort-btn">
                                                    <span>Terapeuta</span>
                                                    {renderTransferSortIcon('therapist')}
                                                </div>
                                            </th>
                                            <th style={{ width: '90px' }} className="th-sortable" onClick={() => handleToggleTransferSort('amount')} title="Clic para ordenar por Importe">
                                                <div className="th-sort-btn">
                                                    <span>Importe</span>
                                                    {renderTransferSortIcon('amount')}
                                                </div>
                                            </th>
                                            <th style={{ width: '105px' }} className="th-sortable" onClick={() => handleToggleTransferSort('status')} title="Clic para ordenar por Estado">
                                                <div className="th-sort-btn">
                                                    <span>Estado</span>
                                                    {renderTransferSortIcon('status')}
                                                </div>
                                            </th>
                                            <th style={{ width: '150px' }} className="th-sortable" onClick={() => handleToggleTransferSort('method')} title="Clic para ordenar por Forma de Pago">
                                                <div className="th-sort-btn">
                                                    <span>Forma de Pago</span>
                                                    {renderTransferSortIcon('method')}
                                                </div>
                                            </th>
                                            <th style={{ width: '160px' }} className="th-sortable" onClick={() => handleToggleTransferSort('reconciled')} title="Clic para ordenar por Estado de Cotejo">
                                                <div className="th-sort-btn">
                                                    <span>Cotejo Bancario</span>
                                                    {renderTransferSortIcon('reconciled')}
                                                </div>
                                            </th>
                                            <th style={{ width: '125px', textAlign: 'right' }}>
                                                <span>Acción</span>
                                            </th>
                                        </tr>

                                        {/* Fila 2: Cabeceras con Filtros Integrados */}
                                        <tr className="tr-filter-header">
                                            {/* Filtro Fecha y Hora */}
                                            <th>
                                                <span className="th-filter-hint">Ordenar ↕</span>
                                            </th>

                                            {/* Filtro Niño / Paciente */}
                                            <th>
                                                <div className="th-filter-input-wrapper">
                                                    <Search size={13} className="th-filter-icon" />
                                                    <input
                                                        type="text"
                                                        className="th-filter-input"
                                                        placeholder="Filtrar por niño..."
                                                        value={transferSearchChild}
                                                        onChange={(e) => setTransferSearchChild(e.target.value)}
                                                        title="Filtrar por nombre o apellido de niño"
                                                    />
                                                    {transferSearchChild && (
                                                        <button
                                                            type="button"
                                                            className="th-filter-clear-btn"
                                                            onClick={() => setTransferSearchChild('')}
                                                            title="Borrar filtro de niño"
                                                        >
                                                            <X size={12} />
                                                        </button>
                                                    )}
                                                </div>
                                            </th>

                                            {/* Filtro Terapeuta */}
                                            <th>
                                                <select
                                                    className="th-filter-select"
                                                    value={transferTherapistFilter}
                                                    onChange={(e) => setTransferTherapistFilter(e.target.value)}
                                                    title="Filtrar por terapeuta"
                                                >
                                                    <option value="ALL">Todos ({uniqueTransferTherapists.length})</option>
                                                    {uniqueTransferTherapists.map(name => (
                                                        <option key={name} value={name}>{name}</option>
                                                    ))}
                                                </select>
                                            </th>

                                            {/* Filtro Importe */}
                                            <th>
                                                <span className="th-filter-hint">—</span>
                                            </th>

                                            {/* Filtro Estado */}
                                            <th>
                                                <select
                                                    className="th-filter-select"
                                                    value={transferStatusFilter}
                                                    onChange={(e) => setTransferStatusFilter(e.target.value as any)}
                                                    title="Filtrar por estado del cobro"
                                                >
                                                    <option value="ALL">Todos</option>
                                                    <option value="Pagado">Pagado</option>
                                                    <option value="Pendiente">Pendiente</option>
                                                </select>
                                            </th>

                                            {/* Filtro Forma de Pago */}
                                            <th>
                                                {transferScope === 'ALL_PENDING' ? (
                                                    <span className="th-filter-locked" title="En ámbito global solo se cotejan cobros por Transferencia">
                                                        🏦 Transferencia
                                                    </span>
                                                ) : (
                                                    <select
                                                        className="th-filter-select"
                                                        value={transferMethodFilter}
                                                        onChange={(e) => setTransferMethodFilter(e.target.value as any)}
                                                        title="Filtrar por forma de pago"
                                                    >
                                                        <option value="TRANSFER_ONLY">🏦 Solo Transferencias</option>
                                                        <option value="ALL">🔍 Todas</option>
                                                        <option value="Tarjeta">💳 Tarjeta</option>
                                                        <option value="Efectivo">💵 Efectivo</option>
                                                    </select>
                                                )}
                                            </th>

                                            {/* Filtro Cotejo Bancario */}
                                            <th>
                                                {transferScope === 'ALL_PENDING' ? (
                                                    <span className="th-filter-locked" title="En ámbito global todas las citas mostradas están pendientes de cotejar">
                                                        ⚠️ Pendientes
                                                    </span>
                                                ) : (
                                                    <select
                                                        className="th-filter-select"
                                                        value={transferReconciledFilter}
                                                        onChange={(e) => setTransferReconciledFilter(e.target.value as any)}
                                                        title="Filtrar por estado de cotejo"
                                                    >
                                                        <option value="ALL">Todos</option>
                                                        <option value="PENDING">⚠️ Pendientes</option>
                                                        <option value="VERIFIED">✅ Cotejadas</option>
                                                    </select>
                                                )}
                                            </th>

                                            {/* Acción: Botón Limpiar filtros si hay alguno activo */}
                                            <th style={{ textAlign: 'right' }}>
                                                {hasActiveTransferFilters ? (
                                                    <button
                                                        type="button"
                                                        className="th-clear-filters-btn active"
                                                        onClick={handleResetTransferFilters}
                                                        title="Limpiar todos los filtros"
                                                    >
                                                        <RotateCcw size={12} /> Limpiar
                                                    </button>
                                                ) : (
                                                    <span className="th-filter-hint">Filtros</span>
                                                )}
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredTransferTransactions.length === 0 ? (
                                            <tr>
                                                <td colSpan={8} className="text-center py-8 text-secondary">
                                                    {transferSearchChild
                                                        ? `No se encontraron transferencias para "${transferSearchChild}" con los filtros seleccionados.`
                                                        : `No hay transferencias registradas con los filtros seleccionados en este periodo.`}
                                                </td>
                                            </tr>
                                        ) : (
                                            filteredTransferTransactions.map(t => (
                                                <tr key={t.id} style={{ opacity: t.isReconciled ? 0.75 : 1 }}>
                                                    <td>
                                                        <div style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.85rem' }}>
                                                            {(() => {
                                                                try {
                                                                    const d = parseISO(t.date);
                                                                    return isValid(d) ? format(d, 'dd/MM/yyyy') : t.date;
                                                                } catch {
                                                                    return t.date;
                                                                }
                                                            })()}
                                                        </div>
                                                        {t.date && t.date.includes('T') && !t.date.includes('T00:00:00') && (
                                                            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                                                {(() => {
                                                                    try {
                                                                        const d = parseISO(t.date);
                                                                        return isValid(d) ? format(d, 'HH:mm') : '';
                                                                    } catch {
                                                                        return '';
                                                                    }
                                                                })()}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td style={{ fontWeight: 600 }}>{t.patientName}</td>
                                                    <td className="text-secondary text-sm">{t.therapistName || '—'}</td>
                                                    <td className="amount-text">
                                                        <div className="flex items-center gap-1">
                                                            <input
                                                                key={`amt-${t.id}-${t.amount}`}
                                                                type="number"
                                                                className="reconcile-amount-input"
                                                                defaultValue={t.amount}
                                                                onBlur={(e) => handleQuickChangeAmount(t, Number(e.target.value))}
                                                                style={{ width: '56px', padding: '0.2rem 0.35rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontWeight: 700, fontSize: '0.85rem' }}
                                                                title="Modificar importe de la cita / cobro"
                                                            />
                                                            <span className="text-secondary text-xs">€</span>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <span className={`badge ${t.status === 'Pagado' ? 'badge-success' : 'badge-warning'}`} style={{ whiteSpace: 'nowrap' }}>
                                                            {t.status}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <select
                                                            className="reconcile-method-select"
                                                            value={t.method || 'Transferencia'}
                                                            onChange={(e) => handleQuickChangeMethod(t, e.target.value as PaymentMethod)}
                                                            title="Cambiar forma de pago si hubo un error en admin"
                                                        >
                                                            <option value="Transferencia">🏦 Transferencia</option>
                                                            <option value="Tarjeta">💳 Tarjeta</option>
                                                            <option value="Efectivo">💵 Efectivo</option>
                                                            <option value="Fin de mes">📅 Fin de mes</option>
                                                        </select>
                                                    </td>
                                                    <td>
                                                        {t.method === 'Transferencia' ? (
                                                            t.isReconciled ? (
                                                                <span className="flex items-center gap-1 text-success font-semibold text-xs bg-emerald-50 px-2 py-1 rounded-md border border-emerald-100" style={{ width: 'fit-content', whiteSpace: 'nowrap' }}>
                                                                    <CheckCircle size={14} /> Cotejado
                                                                </span>
                                                            ) : (
                                                                <span className="flex items-center gap-1 text-amber-600 font-semibold text-xs bg-amber-50 px-2 py-1 rounded-md border border-amber-100" style={{ width: 'fit-content', whiteSpace: 'nowrap' }}>
                                                                    <Clock size={14} /> Pendiente banco
                                                                </span>
                                                            )
                                                        ) : (
                                                            <span className="text-secondary text-xs italic opacity-75" style={{ whiteSpace: 'nowrap' }}>
                                                                No aplica ({t.method})
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                        {t.method === 'Transferencia' ? (
                                                            <button
                                                                className={`btn-reconcile-action ${t.isReconciled ? 'action-unverify' : 'action-verify'}`}
                                                                onClick={() => handleToggleReconciliation(t.id, t.isReconciled ?? false)}
                                                                style={{ whiteSpace: 'nowrap' }}
                                                            >
                                                                {t.isReconciled ? (
                                                                    <>Desmarcar</>
                                                                ) : (
                                                                    <><CheckCircle size={14} /> Cotejar</>
                                                                )}
                                                            </button>
                                                        ) : (
                                                            <button
                                                                className="btn-secondary micro"
                                                                onClick={() => handleQuickChangeMethod(t, 'Transferencia')}
                                                                title="Cambiar a Transferencia para poder cotejarla en banco"
                                                                style={{ whiteSpace: 'nowrap' }}
                                                            >
                                                                Pasar a Transferencia
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ) : (
                        <div className="other-reconciliation-view">
                            {/* Resumen del mes */}
                            <div className="reconcile-stats-grid">
                                <div
                                    className={`reconcile-stat-card clickable ${otherScope === 'MONTH' && otherReconciledFilter === 'ALL' ? 'active-filter' : ''}`}
                                    onClick={() => { setOtherScope('MONTH'); setOtherReconciledFilter('ALL'); }}
                                    title="Clic para ver todos los cobros en efectivo o fin de mes de este mes"
                                >
                                    <div className="reconcile-stat-icon other-total">
                                        <Banknote size={22} />
                                    </div>
                                    <div className="reconcile-stat-info">
                                        <div className="label">
                                            Total Otras Formas ({format(parse(reconciliationMonth, 'yyyy-MM', new Date()), "MMMM yyyy", { locale: es })})
                                        </div>
                                        <div className="value">{otherMonthTotal.toFixed(2)}€</div>
                                        <div className="sub">{otherMonthCount} cobros ({otherMonthCashCount} efectivo, {otherMonthFinDeMesCount} fin de mes)</div>
                                    </div>
                                </div>

                                <div
                                    className={`reconcile-stat-card clickable ${otherScope === 'MONTH' && otherReconciledFilter === 'VERIFIED' ? 'active-filter verified' : ''}`}
                                    onClick={() => { setOtherScope('MONTH'); setOtherReconciledFilter('VERIFIED'); }}
                                    title="Clic para ver los cobros ya cotejados"
                                >
                                    <div className="reconcile-stat-icon other-verified">
                                        <CheckCircle size={22} />
                                    </div>
                                    <div className="reconcile-stat-info">
                                        <div className="label">Cobros Cotejados</div>
                                        <div className="value" style={{ color: '#059669' }}>{otherMonthVerifiedTotal.toFixed(2)}€</div>
                                        <div className="sub">{otherMonthVerifiedCount} verificados (clic para ver)</div>
                                    </div>
                                </div>

                                <div
                                    className={`reconcile-stat-card clickable ${otherScope === 'MONTH' && otherReconciledFilter === 'PENDING' ? 'active-filter pending' : ''}`}
                                    onClick={() => { setOtherScope('MONTH'); setOtherReconciledFilter('PENDING'); }}
                                    title="Clic para ver los cobros pendientes de cotejar"
                                >
                                    <div className="reconcile-stat-icon other-pending">
                                        <Clock size={22} />
                                    </div>
                                    <div className="reconcile-stat-info">
                                        <div className="label flex items-center justify-between">
                                            <span>Pendientes de Cotejo</span>
                                            {otherMonthPendingCount > 0 && <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded-full">¡Revisar!</span>}
                                        </div>
                                        <div className="value" style={{ color: '#d97706' }}>{otherMonthPendingTotal.toFixed(2)}€</div>
                                        <div className="sub font-semibold" style={{ color: '#b45309' }}>
                                            {otherMonthPendingCount} pendientes (👉 Clic para listar)
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Barra Superior de Periodo y Ámbito */}
                            <div className="reconcile-filter-bar">
                                {/* Selector de Ámbito */}
                                <div className="scope-toggle-pills">
                                    <button
                                        type="button"
                                        className={`scope-pill-btn ${otherScope === 'MONTH' ? 'active' : ''}`}
                                        onClick={() => setOtherScope('MONTH')}
                                        title="Ver cobros de efectivo y fin de mes del mes seleccionado"
                                    >
                                        📅 Por Mes
                                    </button>
                                    <button
                                        type="button"
                                        className={`scope-pill-btn ${otherScope === 'ALL_PENDING' ? 'active' : ''}`}
                                        onClick={() => setOtherScope('ALL_PENDING')}
                                        title="Ver todos los cobros pendientes de cotejar de todo el centro"
                                    >
                                        ⚡ Todas las Pendientes ({allPendingOtherCount})
                                    </button>
                                </div>

                                {otherScope === 'MONTH' && (
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-bold uppercase text-secondary">Mes:</span>
                                        <div className="month-navigator">
                                            <button className="month-nav-btn" onClick={handlePrevMonth} title="Mes anterior">
                                                <ChevronLeft size={16} />
                                            </button>
                                            <input
                                                type="month"
                                                className="month-input-clean"
                                                value={reconciliationMonth}
                                                onChange={(e) => setReconciliationMonth(e.target.value)}
                                            />
                                            <button className="month-nav-btn" onClick={handleNextMonth} title="Mes siguiente">
                                                <ChevronRight size={16} />
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Resumen, Limpieza y Descarga Excel */}
                                <div className="reconcile-counter-badge ml-auto flex items-center gap-2">
                                    <span className="text-xs text-secondary font-medium">
                                        Mostrando <strong>{filteredOtherTransactions.length}</strong> de {otherSourceTransactions.length} cobros
                                    </span>
                                    {hasActiveOtherFilters && (
                                        <button
                                            type="button"
                                            className="th-clear-filters-btn active"
                                            onClick={handleResetOtherFilters}
                                            title="Restablecer todos los filtros de la tabla"
                                        >
                                            <RotateCcw size={12} /> Limpiar filtros
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        className="btn-export-excel"
                                        onClick={() => exportReconciliationToExcel(filteredOtherTransactions, 'OTHER', otherScope, reconciliationMonth, otherSearchChild)}
                                        title={`Descargar ${filteredOtherTransactions.length} cobros a Excel (.xlsx)`}
                                    >
                                        <FileSpreadsheet size={15} />
                                        <span>Exportar Excel</span>
                                    </button>
                                </div>
                            </div>

                            {/* Banner cuando se visualizan Todas las pendientes globales */}
                            {otherScope === 'ALL_PENDING' && (
                                <div className="scope-all-pending-banner">
                                    <div className="flex items-center gap-2">
                                        <Clock size={18} className="text-amber-600 flex-shrink-0" />
                                        <div>
                                            <span className="font-bold text-amber-900 text-sm">
                                                Listado Global de Cobros Pendientes de Cotejar:
                                            </span>
                                            <span className="text-amber-800 text-sm ml-2">
                                                {allPendingOtherCount} cobros (efectivo/fin de mes) sin verificar en todo el centro ({allPendingOtherTotal.toFixed(2)}€).
                                            </span>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        className="btn-secondary micro"
                                        onClick={() => setOtherScope('MONTH')}
                                    >
                                        Volver a vista por mes
                                    </button>
                                </div>
                            )}

                            {/* Banner cuando se filtra por un niño */}
                            {otherSearchChild.trim() && (
                                <div className="child-banner-info">
                                    <div className="text-sm">
                                        <span>Resultados para <strong>"{otherSearchChild}"</strong>: </span>
                                        <span className="font-bold text-primary">{filteredOtherTransactions.length} pagos encontrados ({filteredOtherTransactions.reduce((acc, t) => acc + (t.amount || 0), 0).toFixed(2)}€)</span>
                                        <span className="text-secondary ml-2">
                                            ({filteredOtherTransactions.filter(t => t.isReconciled).length} cotejadas, {filteredOtherTransactions.filter(t => !t.isReconciled).length} pendientes)
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {otherMethodFilter === 'ALL_OTHER' && allTransactionsMonth.some(t => (t.method === 'Tarjeta' || t.method === 'Transferencia') && normalizeSearch(t.patientName).includes(normalizeSearch(otherSearchChild))) && (
                                            <button
                                                className="btn-secondary micro"
                                                onClick={() => setOtherMethodFilter('ALL')}
                                            >
                                                🔍 Ver otros métodos de este niño
                                            </button>
                                        )}
                                        {filteredOtherTransactions.some(t => !t.isReconciled) && (
                                            <button
                                                className="btn-primary micro flex items-center gap-1"
                                                onClick={() => handleBatchReconcileShown(filteredOtherTransactions)}
                                            >
                                                <CheckCheck size={14} />
                                                Cotejar cobros de este niño
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Tabla de cobros por otras formas */}
                            <div className="billing-table-wrapper">
                                <table className="billing-table">
                                    <thead>
                                        {/* Fila 1: Cabeceras Ordenables con Clic */}
                                        <tr className="tr-header-sort">
                                            <th style={{ width: '125px' }} className="th-sortable" onClick={() => handleToggleOtherSort('date')} title="Clic para ordenar por Fecha y Hora">
                                                <div className="th-sort-btn">
                                                    <span>Fecha y Hora</span>
                                                    {renderOtherSortIcon('date')}
                                                </div>
                                            </th>
                                            <th className="th-sortable" onClick={() => handleToggleOtherSort('patient')} title="Clic para ordenar alfabéticamente por Niño">
                                                <div className="th-sort-btn">
                                                    <span>Niño / Paciente</span>
                                                    {renderOtherSortIcon('patient')}
                                                </div>
                                            </th>
                                            <th style={{ width: '150px' }} className="th-sortable" onClick={() => handleToggleOtherSort('therapist')} title="Clic para ordenar por Terapeuta">
                                                <div className="th-sort-btn">
                                                    <span>Terapeuta</span>
                                                    {renderOtherSortIcon('therapist')}
                                                </div>
                                            </th>
                                            <th style={{ width: '90px' }} className="th-sortable" onClick={() => handleToggleOtherSort('amount')} title="Clic para ordenar por Importe">
                                                <div className="th-sort-btn">
                                                    <span>Importe</span>
                                                    {renderOtherSortIcon('amount')}
                                                </div>
                                            </th>
                                            <th style={{ width: '105px' }} className="th-sortable" onClick={() => handleToggleOtherSort('status')} title="Clic para ordenar por Estado">
                                                <div className="th-sort-btn">
                                                    <span>Estado</span>
                                                    {renderOtherSortIcon('status')}
                                                </div>
                                            </th>
                                            <th style={{ width: '150px' }} className="th-sortable" onClick={() => handleToggleOtherSort('method')} title="Clic para ordenar por Forma de Pago">
                                                <div className="th-sort-btn">
                                                    <span>Forma de Pago</span>
                                                    {renderOtherSortIcon('method')}
                                                </div>
                                            </th>
                                            <th style={{ width: '160px' }} className="th-sortable" onClick={() => handleToggleOtherSort('reconciled')} title="Clic para ordenar por Estado de Cotejo">
                                                <div className="th-sort-btn">
                                                    <span>Estado Cotejo</span>
                                                    {renderOtherSortIcon('reconciled')}
                                                </div>
                                            </th>
                                            <th style={{ width: '125px', textAlign: 'right' }}>
                                                <span>Acción</span>
                                            </th>
                                        </tr>

                                        {/* Fila 2: Cabeceras con Filtros Integrados */}
                                        <tr className="tr-filter-header">
                                            {/* Filtro Fecha y Hora */}
                                            <th>
                                                <span className="th-filter-hint">Ordenar ↕</span>
                                            </th>

                                            {/* Filtro Niño / Paciente */}
                                            <th>
                                                <div className="th-filter-input-wrapper">
                                                    <Search size={13} className="th-filter-icon" />
                                                    <input
                                                        type="text"
                                                        className="th-filter-input"
                                                        placeholder="Filtrar por niño..."
                                                        value={otherSearchChild}
                                                        onChange={(e) => setOtherSearchChild(e.target.value)}
                                                        title="Filtrar por nombre o apellido de niño"
                                                    />
                                                    {otherSearchChild && (
                                                        <button
                                                            type="button"
                                                            className="th-filter-clear-btn"
                                                            onClick={() => setOtherSearchChild('')}
                                                            title="Borrar filtro de niño"
                                                        >
                                                            <X size={12} />
                                                        </button>
                                                    )}
                                                </div>
                                            </th>

                                            {/* Filtro Terapeuta */}
                                            <th>
                                                <select
                                                    className="th-filter-select"
                                                    value={otherTherapistFilter}
                                                    onChange={(e) => setOtherTherapistFilter(e.target.value)}
                                                    title="Filtrar por terapeuta"
                                                >
                                                    <option value="ALL">Todos ({uniqueOtherTherapists.length})</option>
                                                    {uniqueOtherTherapists.map(name => (
                                                        <option key={name} value={name}>{name}</option>
                                                    ))}
                                                </select>
                                            </th>

                                            {/* Filtro Importe */}
                                            <th>
                                                <span className="th-filter-hint">—</span>
                                            </th>

                                            {/* Filtro Estado */}
                                            <th>
                                                <select
                                                    className="th-filter-select"
                                                    value={otherStatusFilter}
                                                    onChange={(e) => setOtherStatusFilter(e.target.value as any)}
                                                    title="Filtrar por estado del cobro"
                                                >
                                                    <option value="ALL">Todos</option>
                                                    <option value="Pagado">Pagado</option>
                                                    <option value="Pendiente">Pendiente</option>
                                                </select>
                                            </th>

                                            {/* Filtro Forma de Pago */}
                                            <th>
                                                {otherScope === 'ALL_PENDING' ? (
                                                    <span className="th-filter-locked" title="En ámbito global se listan las formas pendientes no bancarias">
                                                        💵/📅 Efectivo/Fin mes
                                                    </span>
                                                ) : (
                                                    <select
                                                        className="th-filter-select"
                                                        value={otherMethodFilter}
                                                        onChange={(e) => setOtherMethodFilter(e.target.value as any)}
                                                        title="Filtrar por forma de pago"
                                                    >
                                                        <option value="ALL_OTHER">💵/📅 Efectivo y Fin de mes</option>
                                                        <option value="Efectivo">💵 Solo Efectivo</option>
                                                        <option value="Fin de mes">📅 Solo Fin de mes</option>
                                                        <option value="ALL">🔍 Todas (incl. Tarjeta/Transf.)</option>
                                                    </select>
                                                )}
                                            </th>

                                            {/* Filtro Estado Cotejo */}
                                            <th>
                                                {otherScope === 'ALL_PENDING' ? (
                                                    <span className="th-filter-locked" title="En ámbito global todas las citas mostradas están pendientes de cotejar">
                                                        ⚠️ Pendientes
                                                    </span>
                                                ) : (
                                                    <select
                                                        className="th-filter-select"
                                                        value={otherReconciledFilter}
                                                        onChange={(e) => setOtherReconciledFilter(e.target.value as any)}
                                                        title="Filtrar por estado de cotejo"
                                                    >
                                                        <option value="ALL">Todos</option>
                                                        <option value="PENDING">⚠️ Pendientes</option>
                                                        <option value="VERIFIED">✅ Cotejadas</option>
                                                    </select>
                                                )}
                                            </th>

                                            {/* Acción: Botón Limpiar filtros si hay alguno activo */}
                                            <th style={{ textAlign: 'right' }}>
                                                {hasActiveOtherFilters ? (
                                                    <button
                                                        type="button"
                                                        className="th-clear-filters-btn active"
                                                        onClick={handleResetOtherFilters}
                                                        title="Limpiar todos los filtros"
                                                    >
                                                        <RotateCcw size={12} /> Limpiar
                                                    </button>
                                                ) : (
                                                    <span className="th-filter-hint">Filtros</span>
                                                )}
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredOtherTransactions.length === 0 ? (
                                            <tr>
                                                <td colSpan={8} className="text-center py-8 text-secondary">
                                                    {otherSearchChild
                                                        ? `No se encontraron cobros para "${otherSearchChild}" con los filtros seleccionados.`
                                                        : `No hay cobros registrados con los filtros seleccionados en este periodo.`}
                                                </td>
                                            </tr>
                                        ) : (
                                            filteredOtherTransactions.map(t => (
                                                <tr key={t.id} style={{ opacity: t.isReconciled ? 0.75 : 1 }}>
                                                    <td>
                                                        <div style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.85rem' }}>
                                                            {(() => {
                                                                try {
                                                                    const d = parseISO(t.date);
                                                                    return isValid(d) ? format(d, 'dd/MM/yyyy') : t.date;
                                                                } catch {
                                                                    return t.date;
                                                                }
                                                            })()}
                                                        </div>
                                                        {t.date && t.date.includes('T') && !t.date.includes('T00:00:00') && (
                                                            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                                                {(() => {
                                                                    try {
                                                                        const d = parseISO(t.date);
                                                                        return isValid(d) ? format(d, 'HH:mm') : '';
                                                                    } catch {
                                                                        return '';
                                                                    }
                                                                })()}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td style={{ fontWeight: 600 }}>{t.patientName}</td>
                                                    <td className="text-secondary text-sm">{t.therapistName || '—'}</td>
                                                    <td className="amount-text">
                                                        <div className="flex items-center gap-1">
                                                            <input
                                                                key={`amt-${t.id}-${t.amount}`}
                                                                type="number"
                                                                className="reconcile-amount-input"
                                                                defaultValue={t.amount}
                                                                onBlur={(e) => handleQuickChangeAmount(t, Number(e.target.value))}
                                                                style={{ width: '56px', padding: '0.2rem 0.35rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontWeight: 700, fontSize: '0.85rem' }}
                                                                title="Modificar importe de la cita / cobro"
                                                            />
                                                            <span className="text-secondary text-xs">€</span>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <span className={`badge ${t.status === 'Pagado' ? 'badge-success' : 'badge-warning'}`} style={{ whiteSpace: 'nowrap' }}>
                                                            {t.status}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <select
                                                            className="reconcile-method-select"
                                                            value={t.method || 'Efectivo'}
                                                            onChange={(e) => handleQuickChangeMethod(t, e.target.value as PaymentMethod)}
                                                            title="Cambiar forma de pago si hubo un error en admin"
                                                        >
                                                            <option value="Efectivo">💵 Efectivo</option>
                                                            <option value="Fin de mes">📅 Fin de mes</option>
                                                            <option value="Tarjeta">💳 Tarjeta</option>
                                                            <option value="Transferencia">🏦 Transferencia</option>
                                                        </select>
                                                    </td>
                                                    <td>
                                                        {t.isReconciled ? (
                                                            <span className="flex items-center gap-1 text-success font-semibold text-xs bg-emerald-50 px-2 py-1 rounded-md border border-emerald-100" style={{ width: 'fit-content', whiteSpace: 'nowrap' }}>
                                                                <CheckCircle size={14} /> Cotejado
                                                            </span>
                                                        ) : (
                                                            <span className="flex items-center gap-1 text-amber-600 font-semibold text-xs bg-amber-50 px-2 py-1 rounded-md border border-amber-100" style={{ width: 'fit-content', whiteSpace: 'nowrap' }}>
                                                                <Clock size={14} /> Pendiente
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                        <button
                                                            className={`btn-reconcile-action ${t.isReconciled ? 'action-unverify' : 'action-verify'}`}
                                                            onClick={() => handleToggleReconciliation(t.id, t.isReconciled ?? false)}
                                                            style={{ whiteSpace: 'nowrap' }}
                                                        >
                                                            {t.isReconciled ? (
                                                                <>Desmarcar</>
                                                            ) : (
                                                                <><CheckCircle size={14} /> Cotejar</>
                                                            )}
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                <div id="BILLING-CONTENT">
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
                                        <th style={{ minWidth: '200px' }}>Paciente</th>
                                        <th>Concepto</th>
                                        <th>Importe</th>
                                        <th>Estado</th>
                                        <th>Método</th>
                                        <th style={{ textAlign: 'right' }}>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {apptRowsWithoutTx.map((appt) => {
                                        const isCharging = chargingApptIds.has(appt.id);
                                        const pKey = (appt.patientId || appt.patientName || '').toLowerCase().trim();
                                        const pendingItems = (patientPendingMap.get(pKey) || []).filter(item => item.appointmentId !== appt.id);
                                        const hasPending = pendingItems.length > 0;
                                        const pendingTotal = pendingItems.reduce((acc, i) => acc + i.amount, 0);

                                        return (
                                        <tr key={`appt-${appt.id}`} className="row-pending">
                                            <td className="text-secondary text-sm">
                                                {appt.start ? format(new Date(appt.start), 'HH:mm') : '—'}
                                            </td>
                                            <td style={{ fontWeight: 600 }}>
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <div className="flex items-center justify-center bg-gray-100 rounded-full" style={{ width: 28, height: 28 }}>
                                                        <User size={14} className="text-secondary" />
                                                    </div>
                                                    <span>{appt.patientName}</span>
                                                    {hasPending && (
                                                        <button
                                                            type="button"
                                                            className="badge-debt-tag"
                                                            onClick={() => openBatchPayModal(appt.patientId, appt.patientName, appt)}
                                                            title="Cobrar conjuntamente esta cita y las pendientes"
                                                        >
                                                            <Layers size={11} /> {pendingItems.length} pendiente{pendingItems.length > 1 ? 's' : ''} ({pendingTotal.toFixed(2)}€)
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                            <td>
                                                <div className="flex items-center gap-2">
                                                    <Receipt size={14} className="text-secondary opacity-60" />
                                                    {appt.type}
                                                </div>
                                            </td>
                                            <td className="amount-text text-secondary">
                                                {appt.price != null ? `${Number(appt.price).toFixed(2)}€` : '—'}
                                            </td>
                                            <td><span className="badge badge-warning">Sin cobrar</span></td>
                                            <td>—</td>
                                            <td style={{ textAlign: 'right' }}>
                                                <div className="payment-actions flex gap-1 justify-end">
                                                    {hasPending && (
                                                        <button
                                                            disabled={isCharging}
                                                            className="btn-payment-method"
                                                            style={{ background: '#fef3c7', borderColor: '#fde68a', color: '#92400e' }}
                                                            onClick={() => openBatchPayModal(appt.patientId, appt.patientName, appt)}
                                                            title="Cobro agrupado de hoy y sesiones pendientes"
                                                        >
                                                            <Layers size={14} />
                                                        </button>
                                                    )}
                                                    <button disabled={isCharging} style={isCharging ? { opacity: 0.5, cursor: 'not-allowed' } : undefined} className="btn-payment-method" onClick={() => handleChargeAppointment(appt, 'Efectivo')} title="Cobrar Efectivo"><Wallet size={14} /></button>
                                                    <button disabled={isCharging} style={isCharging ? { opacity: 0.5, cursor: 'not-allowed' } : undefined} className="btn-payment-method" onClick={() => handleChargeAppointment(appt, 'Tarjeta')} title="Cobrar Tarjeta"><CreditCard size={14} /></button>
                                                    <button disabled={isCharging} style={isCharging ? { opacity: 0.5, cursor: 'not-allowed' } : undefined} className="btn-payment-method" onClick={() => handleChargeAppointment(appt, 'Transferencia')} title="Cobrar Transferencia"><Send size={14} /></button>
                                                    <button disabled={isCharging} style={isCharging ? { opacity: 0.5, cursor: 'not-allowed' } : undefined} className="btn-payment-method" onClick={() => handleChargeAppointment(appt, 'Fin de mes')} title="Asignar Fin de Mes (Pendiente)"><CalendarClock size={14} /></button>
                                                </div>
                                            </td>
                                        </tr>
                                    );})}
                                    {filteredTx.map((t: Transaction) => {
                                        const pKey = (t.patientId || t.patientName || '').toLowerCase().trim();
                                        const pendingItems = (patientPendingMap.get(pKey) || []).filter(item => item.transactionId !== t.id && item.appointmentId !== t.appointmentId);
                                        const hasPending = pendingItems.length > 0;
                                        const pendingTotal = pendingItems.reduce((acc, i) => acc + i.amount, 0);

                                        return (
                                        <tr key={t.id} className={t.status === 'Pendiente' ? 'row-pending' : ''}>
                                            <td className="text-secondary text-sm">
                                                {t.date && t.date.length > 10
                                                    ? format(new Date(t.date), 'HH:mm')
                                                    : '—'}
                                            </td>
                                            <td style={{ fontWeight: 600 }}>
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <div className="flex items-center justify-center bg-gray-100 rounded-full" style={{ width: 28, height: 28 }}>
                                                        <User size={14} className="text-secondary" />
                                                    </div>
                                                    <span>{t.patientName}</span>
                                                    {hasPending && (
                                                        <button
                                                            type="button"
                                                            className="badge-debt-tag"
                                                            onClick={() => openBatchPayModal(t.patientId, t.patientName)}
                                                            title="Ver o cobrar deuda acumulada del paciente"
                                                        >
                                                            <Layers size={11} /> {pendingItems.length} pendiente{pendingItems.length > 1 ? 's' : ''} ({pendingTotal.toFixed(2)}€)
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                            <td>
                                                <div className="flex items-center gap-2">
                                                    <Receipt size={14} className="text-secondary opacity-60" />
                                                    {t.category}
                                                </div>
                                            </td>
                                            <td className="amount-text">{t.amount.toFixed(2)}€</td>
                                            <td>
                                                <span className={`badge ${t.status === 'Pagado' ? 'badge-success' : 'badge-warning'}`}>
                                                    {t.status}
                                                </span>
                                            </td>
                                            <td>
                                                {t.method ? (
                                                    <span className="method-tag">
                                                        {t.method === 'Tarjeta' && <CreditCard size={12} />}
                                                        {t.method === 'Efectivo' && <Wallet size={12} />}
                                                        {t.method === 'Transferencia' && <Send size={12} />}
                                                        {t.method === 'Fin de mes' && <CalendarClock size={12} />}
                                                        {t.method}
                                                    </span>
                                                ) : '—'}
                                            </td>
                                            <td style={{ textAlign: 'right' }}>
                                                <div className="flex gap-2 justify-end">
                                                    <button className="btn-icon micro" onClick={() => handleEditOpen(t)} title="Editar Transacción"><Edit2 size={14} /></button>
                                                    {t.status === 'Pagado' && !t.invoiceId && (
                                                        <button className="btn-icon micro text-secondary" onClick={() => handleOpenGenerateInvoice(t)} title="Generar Factura"><FileText size={14} /></button>
                                                    )}
                                                    {t.invoiceId && (
                                                        <span title="Factura Generada" className="text-secondary opacity-50 flex items-center justify-center" style={{ width: 24, height: 24 }}><CheckCircle size={14} /></span>
                                                    )}
                                                    {t.status === 'Pendiente' && (
                                                        <div className="payment-actions flex gap-1">
                                                            {hasPending && (
                                                                <button
                                                                    disabled={payingTxIds.has(t.id)}
                                                                    className="btn-payment-method"
                                                                    style={{ background: '#fef3c7', borderColor: '#fde68a', color: '#92400e' }}
                                                                    onClick={() => openBatchPayModal(t.patientId, t.patientName)}
                                                                    title="Cobro agrupado con sesiones pendientes"
                                                                >
                                                                    <Layers size={14} />
                                                                </button>
                                                            )}
                                                            <button disabled={payingTxIds.has(t.id)} style={payingTxIds.has(t.id) ? { opacity: 0.5, cursor: 'not-allowed' } : undefined} className="btn-payment-method" onClick={() => handlePayment(t.id, 'Efectivo')} title="Cobrar Efectivo"><Wallet size={14} /></button>
                                                            <button disabled={payingTxIds.has(t.id)} style={payingTxIds.has(t.id) ? { opacity: 0.5, cursor: 'not-allowed' } : undefined} className="btn-payment-method" onClick={() => handlePayment(t.id, 'Tarjeta')} title="Cobrar Tarjeta"><CreditCard size={14} /></button>
                                                            <button disabled={payingTxIds.has(t.id)} style={payingTxIds.has(t.id) ? { opacity: 0.5, cursor: 'not-allowed' } : undefined} className="btn-payment-method" onClick={() => handlePayment(t.id, 'Transferencia')} title="Cobrar Transferencia"><Send size={14} /></button>
                                                            {t.method !== 'Fin de mes' && (
                                                                <button disabled={payingTxIds.has(t.id)} style={payingTxIds.has(t.id) ? { opacity: 0.5, cursor: 'not-allowed' } : undefined} className="btn-payment-method" onClick={() => handlePayment(t.id, 'Fin de mes')} title="Asignar Fin de Mes (Pendiente)"><CalendarClock size={14} /></button>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );})}
                                </tbody>
                            </table>
                        )}
                    </div>

                    {/* Cobros de sesiones atrasadas recaudadas en este día */}
                    {pastSessionsCollectedToday.length > 0 && (
                        <div className="past-collections-box">
                            <div className="flex items-center justify-between mb-3">
                                <h4 className="text-sm font-bold text-success flex items-center gap-2 m-0">
                                    <Layers size={16} /> Cobros de sesiones anteriores recaudados hoy ({pastSessionsCollectedToday.length})
                                </h4>
                                <span className="text-xs font-semibold text-secondary">
                                    Total atrasado recaudado hoy: <strong className="text-primary">{pastSessionsCollectedToday.reduce((acc, t) => acc + t.amount, 0).toFixed(2)}€</strong>
                                </span>
                            </div>
                            <div className="billing-table-wrapper">
                                <table className="billing-table">
                                    <thead>
                                        <tr>
                                            <th>Fecha Sesión</th>
                                            <th>Paciente</th>
                                            <th>Terapeuta</th>
                                            <th>Concepto</th>
                                            <th>Importe</th>
                                            <th>Método</th>
                                            <th>Estado</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {pastSessionsCollectedToday.map((pt) => (
                                            <tr key={`past-${pt.id}`}>
                                                <td className="text-secondary text-sm">
                                                    {format(parseISO(pt.date), 'dd/MM/yyyy')}
                                                </td>
                                                <td style={{ fontWeight: 600 }}>{pt.patientName}</td>
                                                <td className="text-secondary text-sm">{pt.therapistName || '—'}</td>
                                                <td>{pt.category}</td>
                                                <td className="amount-text">{pt.amount.toFixed(2)}€</td>
                                                <td>
                                                    <span className="method-tag">
                                                        {pt.method === 'Tarjeta' && <CreditCard size={12} />}
                                                        {pt.method === 'Efectivo' && <Wallet size={12} />}
                                                        {pt.method === 'Transferencia' && <Send size={12} />}
                                                        {pt.method}
                                                    </span>
                                                </td>
                                                <td><span className="badge badge-success">Cobrado hoy</span></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Espaciador final para asegurar margen inferior visual */}
            <div className="billing-bottom-spacer" />


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
                                        <option value="Fin de mes">Fin de mes</option>
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
                                <h4 className="border-bottom pb-2 mb-3">Desglose por Terapeuta (Recaudado Hoy)</h4>
                                <div className="grid grid-cols-2 gap-4">
                                    {Object.entries(
                                        collectionsForDay.reduce((acc: Record<string, number>, t: Transaction) => {
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
                                    {['Efectivo', 'Tarjeta', 'Transferencia', 'Fin de mes'].map(method => {
                                        const total = collectionsForDay
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
                                    <div className="text-sm opacity-80">Total Cobrado Real (Hoy)</div>
                                    <div className="text-3xl font-bold">
                                        {totalCollected.toFixed(2)}€
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-sm opacity-80">Sin cobrar (citas de hoy)</div>
                                    <div className="text-xl font-semibold text-warning">
                                        {apptRowsWithoutTx.length} citas
                                    </div>
                                </div>
                            </div>

                            {pastSessionsCollectedToday.length > 0 && (
                                <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-900">
                                    <div className="font-bold flex items-center gap-1 mb-1">
                                        <Layers size={14} /> Incluye {pastSessionsCollectedToday.length} cobro(s) de sesiones atrasadas recaudadas hoy:
                                    </div>
                                    <ul className="list-disc pl-4 space-y-0.5">
                                        {pastSessionsCollectedToday.map(pt => (
                                            <li key={pt.id}>
                                                <strong>{pt.patientName}</strong> — Sesión del {format(parseISO(pt.date), 'dd/MM/yyyy')} ({pt.amount.toFixed(2)}€ en {pt.method})
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
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

            {/* Modal de Cobro Agrupado de Sesiones Pendientes */}
            {isBatchPayModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-content" style={{ maxWidth: '650px' }}>
                        <div className="modal-header">
                            <div className="flex items-center gap-2">
                                <Layers size={22} className="text-primary" />
                                <div>
                                    <h3 className="m-0 text-lg font-bold">Cobro Agrupado de Sesiones</h3>
                                    <p className="text-xs text-secondary m-0">
                                        {batchPayPatientName ? `Paciente: ${batchPayPatientName}` : 'Selecciona paciente y sesiones a liquidar'}
                                    </p>
                                </div>
                            </div>
                            <button className="btn-icon-round" onClick={() => setIsBatchPayModalOpen(false)}>
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-4 batch-pay-container">
                            {!batchPayPatientName && (
                                <div className="form-group mb-3">
                                    <label className="text-sm font-semibold">Seleccionar Paciente con Sesiones Pendientes</label>
                                    <select
                                        className="w-full p-2 border rounded-lg bg-white mt-1"
                                        value={batchPayPatientId}
                                        onChange={(e) => {
                                            const selectedKey = e.target.value;
                                            const items = patientPendingMap.get(selectedKey) || [];
                                            const pName = items[0]?.patientName || '';
                                            setBatchPayPatientId(selectedKey);
                                            setBatchPayPatientName(pName);
                                            setBatchPayItems(items);
                                            setBatchPaySelectedIds(new Set(items.map(i => (i.appointmentId || i.transactionId)!)));
                                        }}
                                    >
                                        <option value="">-- Elige un paciente --</option>
                                        {Array.from(patientPendingMap.entries()).map(([key, items]) => {
                                            const total = items.reduce((s, i) => s + i.amount, 0);
                                            return (
                                                <option key={key} value={key}>
                                                    {items[0]?.patientName || key} ({items.length} pendientes - {total.toFixed(2)}€)
                                                </option>
                                            );
                                        })}
                                    </select>
                                </div>
                            )}

                            <div>
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-sm font-semibold text-secondary">
                                        Sesiones a cobrar ({batchPaySelectedIds.size} de {batchPayItems.length} seleccionadas):
                                    </span>
                                    {batchPayItems.length > 0 && (
                                        <button
                                            type="button"
                                            className="text-xs text-primary font-bold hover:underline"
                                            onClick={() => {
                                                if (batchPaySelectedIds.size === batchPayItems.length) {
                                                    setBatchPaySelectedIds(new Set());
                                                } else {
                                                    setBatchPaySelectedIds(new Set(batchPayItems.map(i => (i.appointmentId || i.transactionId)!)));
                                                }
                                            }}
                                        >
                                            {batchPaySelectedIds.size === batchPayItems.length ? 'Deseleccionar todas' : 'Seleccionar todas'}
                                        </button>
                                    )}
                                </div>

                                <div className="batch-pay-list">
                                    {batchPayItems.length === 0 ? (
                                        <div className="p-6 text-center text-sm text-secondary">
                                            {batchPayPatientName ? 'No tiene sesiones pendientes adicionales.' : 'Selecciona un paciente para ver sus sesiones pendientes.'}
                                        </div>
                                    ) : (
                                        batchPayItems.map((item) => {
                                            const itemId = (item.appointmentId || item.transactionId)!;
                                            const isChecked = batchPaySelectedIds.has(itemId);
                                            const isToday = item.date.slice(0, 10) === selectedDate;
                                            return (
                                                <div
                                                    key={itemId}
                                                    className={`batch-pay-item ${isChecked ? 'selected' : ''}`}
                                                    onClick={() => {
                                                        setBatchPaySelectedIds(prev => {
                                                            const next = new Set(prev);
                                                            if (next.has(itemId)) next.delete(itemId);
                                                            else next.add(itemId);
                                                            return next;
                                                        });
                                                    }}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <input
                                                            type="checkbox"
                                                            checked={isChecked}
                                                            onChange={() => {}}
                                                        />
                                                        <div>
                                                            <div className="font-semibold text-sm flex items-center gap-2">
                                                                <span>{format(parseISO(item.date), "dd 'de' MMMM, yyyy", { locale: es })}</span>
                                                                {isToday && <span className="badge badge-info" style={{ fontSize: '0.65rem' }}>Hoy</span>}
                                                            </div>
                                                            <div className="text-xs text-secondary">
                                                                {item.category || 'Sesión'} • {item.therapistName || 'Terapeuta'}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="font-bold text-sm text-primary">
                                                        {item.amount.toFixed(2)}€
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 mt-2">
                                <div>
                                    <label className="text-xs font-semibold text-secondary block mb-1">Método de Cobro</label>
                                    <select
                                        className="w-full p-2 border rounded-lg text-sm bg-white"
                                        value={batchPayMethod}
                                        onChange={(e) => setBatchPayMethod(e.target.value as PaymentMethod)}
                                    >
                                        <option value="Efectivo">Efectivo</option>
                                        <option value="Tarjeta">Tarjeta (Datáfono)</option>
                                        <option value="Transferencia">Transferencia</option>
                                        <option value="Fin de mes">Fin de mes</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-secondary block mb-1">Fecha de Ingreso en Caja</label>
                                    <input
                                        type="date"
                                        className="w-full p-2 border rounded-lg text-sm bg-white"
                                        value={batchPayDate}
                                        onChange={(e) => setBatchPayDate(e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="batch-pay-total-box mt-3">
                                <div>
                                    <div className="text-xs opacity-75">Importe Total a Cobrar</div>
                                    <div className="text-2xl font-bold">
                                        {batchPayItems
                                            .filter(i => batchPaySelectedIds.has((i.appointmentId || i.transactionId)!))
                                            .reduce((acc, i) => acc + i.amount, 0).toFixed(2)}€
                                    </div>
                                </div>
                                <div className="text-right text-xs opacity-75">
                                    {batchPaySelectedIds.size} sesión(es) seleccionada(s)
                                </div>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => setIsBatchPayModalOpen(false)}
                                disabled={isBatchProcessing}
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                className="btn-primary flex items-center gap-2"
                                onClick={handleExecuteBatchPay}
                                disabled={isBatchProcessing || batchPaySelectedIds.size === 0}
                            >
                                <Wallet size={16} />
                                {isBatchProcessing ? 'Procesando...' : `Confirmar Cobro (${batchPayItems
                                    .filter(i => batchPaySelectedIds.has((i.appointmentId || i.transactionId)!))
                                    .reduce((acc, i) => acc + i.amount, 0).toFixed(2)}€)`}
                            </button>
                        </div>
                    </div>
                </div>
            )}


            {/* Breakdown Modal */}
            {isBreakdownOpen && (
                <div className="modal-overlay">
                    <div className="modal-content" style={{ maxWidth: '1000px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
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
                                        {breakdownFilter === 'PENDING' && <th>Acciones</th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    {getBreakdownTransactions().map((t: any) => {
                                        const isBusy = t._rawAppt ? chargingApptIds.has(t._rawAppt.id) : payingTxIds.has(t.id);
                                        return (
                                        <tr key={t.id} className={t.status === 'Pendiente' ? 'row-pending' : ''}>
                                            <td>{format(parseISO(t.date), 'dd/MM/yyyy')}</td>
                                            <td style={{ fontWeight: 600 }}>{t.patientName}</td>
                                            <td>{t.category}</td>
                                            <td className="amount-text">{t.amount}€</td>
                                            <td>
                                                <span className={`badge ${t.status === 'Pagado' ? 'badge-success' : 'badge-warning'}`}>
                                                    {t.status}
                                                </span>
                                            </td>
                                            {breakdownFilter === 'PENDING' && (
                                                <td>
                                                    <div className="payment-actions flex gap-1">
                                                        <button
                                                            disabled={isBusy}
                                                            style={isBusy ? { opacity: 0.5, cursor: 'not-allowed' } : { background: '#fef3c7', borderColor: '#fde68a', color: '#92400e' }}
                                                            className="btn-payment-method"
                                                            onClick={() => {
                                                                setIsBreakdownOpen(false);
                                                                openBatchPayModal(t.patientId, t.patientName, t._rawAppt);
                                                            }}
                                                            title="Cobro agrupado de este paciente"
                                                        >
                                                            <Layers size={14} />
                                                        </button>
                                                        <button
                                                            disabled={isBusy}
                                                            style={isBusy ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
                                                            className="btn-payment-method"
                                                            onClick={() => t._rawAppt ? handleChargeAppointment(t._rawAppt, 'Efectivo') : handlePayment(t.id, 'Efectivo')}
                                                            title="Cobrar Efectivo"
                                                        >
                                                            <Wallet size={14} />
                                                        </button>
                                                        <button
                                                            disabled={isBusy}
                                                            style={isBusy ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
                                                            className="btn-payment-method"
                                                            onClick={() => t._rawAppt ? handleChargeAppointment(t._rawAppt, 'Tarjeta') : handlePayment(t.id, 'Tarjeta')}
                                                            title="Cobrar Tarjeta"
                                                        >
                                                            <CreditCard size={14} />
                                                        </button>
                                                        <button
                                                            disabled={isBusy}
                                                            style={isBusy ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
                                                            className="btn-payment-method"
                                                            onClick={() => t._rawAppt ? handleChargeAppointment(t._rawAppt, 'Transferencia') : handlePayment(t.id, 'Transferencia')}
                                                            title="Cobrar Transferencia"
                                                        >
                                                            <Send size={14} />
                                                        </button>
                                                        <button
                                                            disabled={isBusy}
                                                            style={isBusy ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
                                                            className="btn-payment-method"
                                                            onClick={() => t._rawAppt ? handleChargeAppointment(t._rawAppt, 'Fin de mes') : handlePayment(t.id, 'Fin de mes')}
                                                            title="Cobrar Fin de Mes"
                                                        >
                                                            <CalendarClock size={14} />
                                                        </button>
                                                    </div>
                                                </td>
                                            )}
                                        </tr>
                                    );})}
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
                                <label>Número de Factura</label>
                                <input
                                    type="text"
                                    value={invoiceNumber}
                                    onChange={(e) => setInvoiceNumber(e.target.value)}
                                    className="bg-white"
                                    placeholder="AAAA/XXX"
                                />
                            </div>
                            <div className="form-group">
                                <label>Concepto</label>
                                <input
                                    type="text"
                                    value={selectedInvoiceTx.category || ''}
                                    readOnly
                                    className="bg-gray-100"
                                />
                            </div>
                        </div>
                        <div className="modal-footer flex gap-2 justify-end">
                            <button 
                                className="btn-secondary flex items-center gap-2" 
                                onClick={performCreateInvoice}
                                disabled={isCreatingInvoice}
                            >
                                <CheckCircle size={18} /> {isCreatingInvoice ? 'Procesando...' : 'Crear y Guardar'}
                            </button>
                            <button 
                                className="btn-primary flex items-center gap-2" 
                                onClick={handleCreateAndPrintInvoice}
                                disabled={isCreatingInvoice}
                            >
                                <FileText size={18} /> {isCreatingInvoice ? 'Procesando...' : 'Crear e Imprimir'}
                            </button>
                        </div>
                    </div>


                </div >
            )}

            {/* Hidden Printable Invoice */}
            {
                printingInvoice && (
                    <PrintPortal>
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
                    </PrintPortal>
                )
            }
        </div >
    );
};


export default BillingView;
