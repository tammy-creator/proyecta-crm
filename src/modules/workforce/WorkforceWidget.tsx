import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { clockIn, clockOut, getLiveWorkStats, getUpcomingAppointment, checkScheduleAdherence } from './service';
import type { WorkStatus } from './types';
import { Play, Square, Clock, PenTool, AlertCircle } from 'lucide-react';
import './WorkforceWidget.css';
import SigningModal from './SigningModal';
import { useToast } from '../../hooks/useToast';

const WorkforceWidget: React.FC = () => {
    const { user } = useAuth();
    const { showToast } = useToast();
    const [status, setStatus] = useState<WorkStatus>('offline');
    const [loading, setLoading] = useState(true);
    const [elapsed, setElapsed] = useState(0); 
    const [baseTotal, setBaseTotal] = useState(0); 
    const [fetchTime, setFetchTime] = useState<number>(Date.now());
    const [currentAttendanceId, setCurrentAttendanceId] = useState<string | null>(null);
    const [isSigningOpen, setIsSigningOpen] = useState(false);
    const [upcomingAppt, setUpcomingAppt] = useState<any>(null);

    useEffect(() => {
        if (user) {
            loadStatus();
            if (user.role === 'THERAPIST' && user.therapistId) {
                checkUpcoming();
            }
        }
    }, [user]);

    // Timer effect
    useEffect(() => {
        let interval: any;
        if (status === 'working') {
            updateElapsed();
            interval = setInterval(updateElapsed, 1000);
        } else {
            setElapsed(baseTotal);
        }
        return () => clearInterval(interval);
    }, [status, baseTotal, fetchTime]);

    const updateElapsed = () => {
        const now = Date.now();
        const diff = Math.floor((now - fetchTime) / 1000);
        setElapsed(baseTotal + diff);
    };

    const loadStatus = async () => {
        if (!user || (user.role === 'THERAPIST' && !user.therapistId)) {
            setLoading(false);
            return;
        }
        
        try {
            const stats = await getLiveWorkStats(user.therapistId || '');
            setStatus(stats.status);
            setBaseTotal(stats.totalSeconds);
            setFetchTime(Date.now());
            setCurrentAttendanceId(stats.currentAttendanceId || null);
        } catch (error) {
            console.error("Error loading workforce status:", error);
        } finally {
            setLoading(false);
        }
    };

    const checkUpcoming = async () => {
        if (user?.therapistId) {
            const appt = await getUpcomingAppointment(user.therapistId);
            setUpcomingAppt(appt);
        }
    };

    const handleClockIn = async () => {
        if (!user || !user.therapistId) return;
        setLoading(true);
        try {
            // Validation: Check if within schedule
            const { isAdherent } = await checkScheduleAdherence(user.therapistId);
            
            if (!isAdherent && user.role === 'THERAPIST') {
                showToast(
                    "No puedes iniciar jornada fuera de tu horario programado. Consulta tu agenda o contacta con administración.",
                    "error"
                );
                setLoading(false);
                return;
            }

            await clockIn(user.id, user.therapistId);
            await loadStatus();
            window.dispatchEvent(new CustomEvent('workforce-update'));
            showToast("Jornada iniciada correctamente", "success");
        } catch (error) {
            console.error("Error clocking in:", error);
            showToast("Error al iniciar jornada", "error");
        } finally {
            setLoading(false);
        }
    };

    const handleClockOut = async () => {
        if (!currentAttendanceId) return;
        setLoading(true);
        try {
            await clockOut(currentAttendanceId);
            await loadStatus();
            window.dispatchEvent(new CustomEvent('workforce-update'));
        } catch (error) {
            console.error("Error clocking out:", error);
        } finally {
            setLoading(false);
        }
    };

    const formatTime = (seconds: number) => {
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    if (!user) return null;

    return (
        <div className="workforce-widget animate-in">
            {/* ── Status Banner ── */}
            <div className={`workforce-status-banner ${status}`}>
                <div className="status-indicator">
                    <div className={`status-dot ${status} animate-pulse`}></div>
                    <span className="status-label">
                        {status === 'offline' ? 'Fuera de Servicio' : 'En Jornada'}
                    </span>
                </div>
                {status === 'working' && (
                    <div className="status-timer">
                        <Clock size={14} />
                        <span>{formatTime(elapsed)}</span>
                    </div>
                )}
            </div>

            <div className="workforce-content">
                {status === 'offline' && upcomingAppt && (
                    <div className="upcoming-appt-alert">
                        <div className="alert-icon">
                            <AlertCircle size={16} />
                        </div>
                        <div className="alert-text">
                            <p><strong>Cita próxima:</strong> {upcomingAppt.patient_name}</p>
                            <p className="text-xs opacity-80">No olvides fichar la entrada.</p>
                        </div>
                    </div>
                )}

                <div className="workforce-actions">
                    {status === 'offline' ? (
                        <button className="wf-main-btn start" onClick={handleClockIn} disabled={loading}>
                            <Play size={18} fill="currentColor" />
                            <span>Iniciar Jornada</span>
                        </button>
                    ) : (
                        <button className="wf-main-btn stop" onClick={handleClockOut} disabled={loading}>
                            <Square size={18} fill="currentColor" />
                            <span>Finalizar Jornada</span>
                        </button>
                    )}
                </div>

                <div className="workforce-secondary-actions">
                    <button
                        className="wf-secondary-btn"
                        onClick={() => setIsSigningOpen(true)}
                    >
                        <div className="btn-icon">
                            <PenTool size={16} />
                        </div>
                        <div className="btn-text">
                            <span className="title">Informes y Firmas</span>
                            <span className="subtitle">Gestión de documentos</span>
                        </div>
                    </button>
                </div>
            </div>

            {isSigningOpen && <SigningModal onClose={() => setIsSigningOpen(false)} />}
        </div>
    );
};

export default WorkforceWidget;
