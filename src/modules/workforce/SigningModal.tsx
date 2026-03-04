import React, { useState, useEffect } from 'react';
import { X, CheckCircle, AlertCircle, PenTool } from 'lucide-react';
import { format, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { getMonthlyReport, signMonthlyReport, getSignature } from './service';
import type { MonthlyReportSignature, WorkLog } from './types';
import { useAuth } from '../../context/AuthContext';

interface SigningModalProps {
    onClose: () => void;
}

const SigningModal: React.FC<SigningModalProps> = ({ onClose }) => {
    const { user } = useAuth();
    const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
    const [loading, setLoading] = useState(false);
    const [logs, setLogs] = useState<WorkLog[]>([]);
    const [totalHours, setTotalHours] = useState(0);
    const [signature, setSignature] = useState<MonthlyReportSignature | undefined>(undefined);
    const [error, setError] = useState<string | null>(null);

    // Month selector options (Current year)
    const months = Array.from({ length: 12 }, (_, i) => {
        const d = subMonths(new Date(), i);
        return {
            value: format(d, 'yyyy-MM'),
            label: format(d, 'MMMM yyyy', { locale: es })
        };
    });

    useEffect(() => {
        if (user && selectedMonth) {
            loadData();
        }
    }, [user, selectedMonth]);

    const loadData = async () => {
        if (!user) return;
        setLoading(true);
        setError(null);
        try {
            // Load logs
            const report = await getMonthlyReport(user.id, selectedMonth);
            setLogs(report);

            // Calculate hours
            const totalMinutes = report.reduce((acc, log) => acc + log.totalWorkedMinutes, 0);
            setTotalHours(Number((totalMinutes / 60).toFixed(2)));

            // Check signature
            const sig = await getSignature(user.id, selectedMonth);
            setSignature(sig);

        } catch (err) {
            console.error(err);
            setError("Error cargando el reporte.");
        } finally {
            setLoading(false);
        }
    };

    const handleSign = async () => {
        if (!user) return;
        if (totalHours === 0) {
            if (!confirm("El total de horas es 0. ¿Deseas firmar un reporte vacío?")) return;
        }

        try {
            setLoading(true);
            const newSig = await signMonthlyReport(user.id, selectedMonth, totalHours);
            setSignature(newSig);
        } catch (err: any) {
            setError(err.message || "Error al firmar.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content" style={{ maxWidth: '500px' }}>
                <div className="modal-header">
                    <div className="flex items-center gap-2">
                        <PenTool size={20} className="text-secondary" />
                        <h3>Firma de Reporte Mensual</h3>
                    </div>
                    <button className="btn-icon-round" onClick={onClose}><X size={20} /></button>
                </div>

                <div className="p-4 space-y-4">
                    <div className="form-group">
                        <label className="text-sm font-medium">Seleccionar Mes</label>
                        <select
                            value={selectedMonth}
                            onChange={e => setSelectedMonth(e.target.value)}
                            className="w-full p-2 border rounded-md"
                        >
                            {months.map(m => (
                                <option key={m.value} value={m.value}>{m.label}</option>
                            ))}
                        </select>
                    </div>

                    <div className="summary-card bg-gray-50 p-4 rounded-xl border flex justify-between items-center">
                        <div>
                            <p className="text-secondary text-xs uppercase tracking-wide">Total Horas Registradas</p>
                            <p className="text-2xl font-bold text-primary">{totalHours}h</p>
                            <p className="text-xs text-gray-500">{logs.length} días de actividad</p>
                        </div>
                        {signature ? (
                            <div className="text-right">
                                <div className="inline-flex items-center gap-1 text-green-600 font-bold bg-green-100 px-3 py-1 rounded-full text-xs mb-1">
                                    <CheckCircle size={14} /> FIRMADO
                                </div>
                                <p className="text-[10px] text-gray-400">
                                    {format(new Date(signature.signedAt), "dd/MM/yyyy HH:mm")}
                                </p>
                            </div>
                        ) : (
                            <div className="text-right">
                                <span className="inline-flex items-center gap-1 text-amber-600 font-bold bg-amber-100 px-3 py-1 rounded-full text-xs">
                                    <AlertCircle size={14} /> PENDIENTE
                                </span>
                            </div>
                        )}
                    </div>

                    <div className="legal-text text-xs text-justify text-gray-500 p-3 border rounded bg-white">
                        <p className="font-bold mb-1">Declaración de veracidad:</p>
                        <p>"Declaro bajo mi responsabilidad que las horas aquí reflejadas corresponden fielmente a mi actividad laboral efectiva durante el periodo seleccionado."</p>
                    </div>

                    {error && (
                        <div className="text-red-500 text-sm bg-red-50 p-2 rounded flex items-center gap-2">
                            <AlertCircle size={14} /> {error}
                        </div>
                    )}
                </div>

                <div className="modal-footer">
                    <button className="btn-secondary" onClick={onClose}>Cerrar</button>
                    <button
                        className={`btn-primary ${signature ? 'opacity-50 cursor-not-allowed' : ''}`}
                        onClick={handleSign}
                        disabled={!!signature || loading}
                    >
                        {signature ? 'Documento Firmado' : 'Firmar y Enviar'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SigningModal;
