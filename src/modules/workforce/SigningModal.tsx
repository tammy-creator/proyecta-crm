import React, { useState, useEffect, useRef } from 'react';
import { X, CheckCircle, AlertCircle, PenTool, Eraser, Send, Download, Printer, Clock, Calendar } from 'lucide-react';
import { format, subMonths, isSameDay, parseISO, eachDayOfInterval, startOfMonth, endOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import { getMonthlyReport, signMonthlyReport, getSignature, sendSignedReport, getAllAttendance } from './service';
import { getAppointments } from '../calendar/service';
import { getCenterSettings } from '../admin/service';
import type { MonthlyReportSignature } from './types';
import type { Therapist } from '../therapists/types';
import { useAuth } from '../../context/AuthContext';
import SignaturePad from 'signature_pad';
import { generateDetailedReportPDF } from '../../utils/pdfGenerator';

interface SigningModalProps {
    onClose: () => void;
}

const SigningModal: React.FC<SigningModalProps> = ({ onClose }) => {
    const { user } = useAuth();
    const [selectedMonth, setSelectedMonth] = useState(format(subMonths(new Date(), 1), 'yyyy-MM'));
    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(false);
    const [report, setReport] = useState<{ date: string; totalMinutes: number }[]>([]);
    const [totalHours, setTotalHours] = useState(0);
    const [signature, setSignature] = useState<MonthlyReportSignature | undefined>(undefined);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [step, setStep] = useState<'summary' | 'sign'>('summary');
    const [attendances, setAttendances] = useState<any[]>([]);
    const [appointments, setAppointments] = useState<any[]>([]);
    const [centerSettings, setCenterSettings] = useState<any>(null);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const sigPadRef = useRef<SignaturePad | null>(null);

    // Month selector options (last 12 months)
    const months = Array.from({ length: 12 }, (_, i) => {
        const d = subMonths(new Date(), i);
        return {
            value: format(d, 'yyyy-MM'),
            label: format(d, 'MMMM yyyy', { locale: es })
        };
    });

    useEffect(() => {
        getCenterSettings().then(setCenterSettings).catch(console.error);
    }, []);

    useEffect(() => {
        if (user && selectedMonth) {
            loadData();
            setStep('summary');
            setSuccess(null);
        }
    }, [user, selectedMonth]);

    // Initialize signature pad when step changes to 'sign'
    useEffect(() => {
        if (step === 'sign' && canvasRef.current && !sigPadRef.current) {
            const canvas = canvasRef.current;
            // Set canvas size to match its display size
            const rect = canvas.getBoundingClientRect();
            canvas.width = rect.width * window.devicePixelRatio;
            canvas.height = rect.height * window.devicePixelRatio;
            const ctx = canvas.getContext('2d');
            if (ctx) ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

            sigPadRef.current = new SignaturePad(canvas, {
                backgroundColor: 'rgb(255, 255, 255)',
                penColor: 'rgb(0, 0, 0)',
                minWidth: 1,
                maxWidth: 2.5
            });
        }
        // Cleanup when leaving sign step
        return () => {
            if (step !== 'sign' && sigPadRef.current) {
                sigPadRef.current = null;
            }
        };
    }, [step]);

    const loadData = async () => {
        if (!user || !user.therapistId) return;
        setLoading(true);
        setError(null);
        try {
            const reportData = await getMonthlyReport(user.therapistId, selectedMonth);
            setReport(reportData);

            const totalMinutes = reportData.reduce((acc, r) => acc + r.totalMinutes, 0);
            setTotalHours(Number((totalMinutes / 60).toFixed(2)));

            const sig = await getSignature(user.therapistId, selectedMonth);
            setSignature(sig);

            const attData = await getAllAttendance(selectedMonth, user.therapistId);
            const startDay = parseISO(`${selectedMonth}-01`);
            const endDay = endOfMonth(startDay);
            const appts = await getAppointments(startDay, endDay);
            const filteredAppts = appts.filter(a => a.therapistId === user.therapistId && a.status !== 'Cancelada');
            setAttendances(attData);
            setAppointments(filteredAppts);
        } catch (err) {
            console.error(err);
            setError("Error cargando el reporte.");
        } finally {
            setLoading(false);
        }
    };

    const handleClearPad = () => {
        sigPadRef.current?.clear();
    };

    const BlobToJSON = (blob: Blob) => new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
    });

    const generateLocalPDF = async (sig?: MonthlyReportSignature): Promise<Blob> => {
        if (!user || !user.therapistId) throw new Error("No user");
        
        const daysInMonthToPrint = eachDayOfInterval({
            start: startOfMonth(parseISO(selectedMonth + '-01')),
            end: endOfMonth(parseISO(selectedMonth + '-01'))
        });

        const getReportDailyData = (day: Date) => {
            const dayAtts = attendances.filter(a => a.startTime && isSameDay(parseISO(a.startTime), day));
            const dayAppts = appointments.filter(a => a.start && isSameDay(parseISO(a.start), day));
            const workAtt = dayAtts.find(a => a.type === 'work');
            const absenceAtt = dayAtts.find(a => a.type !== 'work');
            return { workAtt, absenceAtt, apptsCount: dayAppts.length };
        };

        const therapistObject = { id: user.therapistId, fullName: user.name || 'Terapeuta', email: '', phone: '', specialty: '' } as Therapist;

        return generateDetailedReportPDF({
            month: selectedMonth,
            therapist: therapistObject,
            daysInMonth: daysInMonthToPrint,
            getDailyData: getReportDailyData,
            centerSettings,
            signature: sig || signature
        });
    };

    const handleSign = async () => {
        if (!user || !user.therapistId) return;

        // Validate signature
        if (sigPadRef.current?.isEmpty()) {
            setError('Por favor, dibuja tu firma antes de enviar.');
            return;
        }

        const signatureImage = sigPadRef.current?.toDataURL('image/png');
        if (!signatureImage) return;

        try {
            setLoading(true);
            setSending(true);
            setError(null);

            // 1. Save signature to DB
            const newSig = await signMonthlyReport(
                user.therapistId,
                selectedMonth,
                totalHours,
                signatureImage
            );
            setSignature(newSig);

            // 2. Generate PDF and send via email
            try {
                const pdfBlob = await generateLocalPDF(newSig);
                const pdfBase64 = await BlobToJSON(pdfBlob);

                await sendSignedReport({
                    therapistName: user.name || 'Terapeuta',
                    month: selectedMonth,
                    totalHours,
                    signatureImage,
                    totalDays: report.length,
                    pdfBase64: pdfBase64 as string
                });
                setSuccess('✅ Reporte firmado y enviado por email correctamente.');
            } catch (emailErr: any) {
                console.error('Email error:', emailErr);
                setSuccess('✅ Reporte firmado correctamente. ⚠️ El email no se pudo enviar, pero la firma se ha guardado.');
            }

            setStep('summary');
        } catch (err: any) {
            setError(err.message || "Error al firmar.");
        } finally {
            setLoading(false);
            setSending(false);
        }
    };

    const handleDownloadPDF = async () => {
        try {
            const blob = await generateLocalPDF();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `Reporte_${(user?.name || 'Terapeuta').replace(/\s+/g, '_')}_${selectedMonth}.pdf`;
            link.click();
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error("Error generating local PDF:", err);
            setError("No se pudo generar el PDF.");
        }
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content" style={{ maxWidth: '520px' }}>
                <div className="modal-header">
                    <div className="flex items-center gap-2">
                        <PenTool size={20} className="text-secondary" />
                        <h3>Firma de Reporte Mensual</h3>
                    </div>
                    <button className="btn-icon-round" onClick={onClose}><X size={20} /></button>
                </div>

                <div className="p-4 space-y-4">
                    {/* Month selector */}
                    <div className="form-group">
                        <label className="text-sm font-medium">Seleccionar Mes</label>
                        <select
                            value={selectedMonth}
                            onChange={e => { setSelectedMonth(e.target.value); setStep('summary'); }}
                            className="w-full p-2 border rounded-md"
                            disabled={loading}
                        >
                            {months.map(m => (
                                <option key={m.value} value={m.value}>{m.label}</option>
                            ))}
                        </select>
                    </div>

                    {/* Stats Grid */}
                    <div className="signing-stats-grid">
                        <div className="signing-stat-card">
                            <Clock size={18} className="text-primary mb-1" />
                            <span className="stat-label">Horas Totales</span>
                            <span className="stat-value">{totalHours}h</span>
                        </div>
                        <div className="signing-stat-card">
                            <Calendar size={18} className="text-emerald-500 mb-1" />
                            <span className="stat-label">Días Activos</span>
                            <span className="stat-value">{report.length} d</span>
                        </div>
                    </div>

                    {/* Status Section */}
                    <div className={`signing-status-banner ${signature ? 'signed' : 'pending'}`}>
                        <div className="flex items-center gap-2">
                            {signature ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
                            <span className="status-title">
                                {signature ? 'Reporte Firmado' : 'Pendiente de Firma'}
                            </span>
                        </div>
                        {signature && (
                            <span className="status-date">
                                {format(new Date(signature.signedAt), "dd/MM/yyyy HH:mm")}
                            </span>
                        )}
                    </div>

                    {/* Step: Summary - show declaration */}
                    {step === 'summary' && (
                        <div className="signing-legal-box">
                            <p className="legal-title">Declaración de veracidad</p>
                            <p className="legal-text">
                                "Declaro bajo mi responsabilidad que las horas aquí reflejadas corresponden fielmente a mi actividad laboral efectiva durante el periodo seleccionado."
                            </p>
                        </div>
                    )}

                    {/* Step: Sign - show canvas */}
                    {step === 'sign' && (
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                <label className="text-sm font-medium">Dibuja tu firma:</label>
                                <button
                                    type="button"
                                    onClick={handleClearPad}
                                    className="btn-secondary"
                                    style={{ padding: '4px 12px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                                >
                                    <Eraser size={14} /> Limpiar
                                </button>
                            </div>
                            <canvas
                                ref={canvasRef}
                                style={{
                                    width: '100%',
                                    height: '160px',
                                    border: '2px dashed #cbd5e1',
                                    borderRadius: '12px',
                                    cursor: 'crosshair',
                                    backgroundColor: '#fff',
                                    touchAction: 'none'
                                }}
                            />
                            <p className="text-xs text-gray-400 mt-1 text-center">
                                Usa el ratón o el dedo para firmar
                            </p>
                        </div>
                    )}

                    {/* Error/Success messages */}
                    {error && (
                        <div className="text-red-500 text-sm bg-red-50 p-2 rounded flex items-center gap-2">
                            <AlertCircle size={14} /> {error}
                        </div>
                    )}
                    {success && (
                        <div className="text-green-600 text-sm bg-green-50 p-3 rounded flex items-center gap-2" style={{ fontWeight: 500 }}>
                            {success}
                        </div>
                    )}
                </div>

                <div className="modal-footer !bg-gray-50 !p-4 !rounded-b-2xl">
                    <button className="btn-secondary px-6" onClick={onClose}>Cerrar</button>

                    {step === 'summary' && !signature && (
                        <>
                            <button
                                className="btn-secondary !bg-white"
                                onClick={handleDownloadPDF}
                                disabled={loading}
                                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                            >
                                <Printer size={16} />
                                Vista Previa
                            </button>
                            <button
                                className="btn-primary !rounded-xl !px-6"
                                onClick={() => { setStep('sign'); setError(null); }}
                                disabled={loading}
                            >
                                <PenTool size={16} />
                                Firmar Reporte
                            </button>
                        </>
                    )}

                    {step === 'sign' && (
                        <button
                            className="btn-primary !rounded-xl !px-6"
                            onClick={handleSign}
                            disabled={loading || sending}
                            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                        >
                            {sending ? (
                                'Enviando...'
                            ) : (
                                <>
                                    <Send size={16} />
                                    Confirmar y Enviar
                                </>
                            )}
                        </button>
                    )}

                    {signature && step === 'summary' && (
                        <button 
                            className="btn-primary !rounded-xl !px-6" 
                            onClick={handleDownloadPDF}
                            disabled={loading}
                        >
                            <Download size={16} />
                            Descargar PDF Firmado
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SigningModal;
