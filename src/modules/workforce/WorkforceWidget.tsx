import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { addEvent, getLiveWorkStats } from './service';
import type { WorkStatus } from './types';
import { Play, Pause, Square, Clock, PenTool } from 'lucide-react';
import './WorkforceWidget.css';
import SigningModal from './SigningModal';
import { supabase } from '../../lib/supabase';

const WorkforceWidget: React.FC = () => {
    const { user } = useAuth();
    const [status, setStatus] = useState<WorkStatus>('offline');
    const [loading, setLoading] = useState(true);
    const [elapsed, setElapsed] = useState(0); // Total today
    const [baseTotal, setBaseTotal] = useState(0); // Total at moment of fetch
    const [fetchTime, setFetchTime] = useState<number>(Date.now());
    const [isSigningOpen, setIsSigningOpen] = useState(false);
    const [schedule, setSchedule] = useState<any[]>([]);
    const [shiftEnd, setShiftEnd] = useState<string | null>(null);
    const [isShiftEnded, setIsShiftEnded] = useState(false);

    useEffect(() => {
        if (user) {
            loadStatus();
            loadSchedule();
        }
    }, [user]);

    const loadSchedule = async () => {
        if (!user || user.role !== 'THERAPIST' || !user.therapistId) return;
        const { data } = await supabase.from('therapists').select('schedule').eq('id', user.therapistId).single();
        if (data?.schedule) setSchedule(data.schedule);
    };

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

        // Shift end check
        if (shiftEnd && status === 'working') {
            const [h, m] = shiftEnd.split(':').map(Number);
            const target = new Date();
            target.setHours(h, m, 0, 0);
            if (Date.now() > target.getTime()) {
                setIsShiftEnded(true);
            } else {
                setIsShiftEnded(false);
            }
        }
    };

    useEffect(() => {
        if (schedule.length > 0) {
            const dayName = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(new Date());
            const todaySchedule = schedule.find((s: any) => s.day === dayName);
            if (todaySchedule && todaySchedule.enabled) {
                setShiftEnd(todaySchedule.end);
            }
        }
    }, [schedule]);

    const loadStatus = async () => {
        if (!user || !user.therapistId) return;
        const stats = await getLiveWorkStats(user.therapistId);
        setStatus(stats.status);
        setBaseTotal(stats.totalSeconds);
        setFetchTime(Date.now());
        setLoading(false);
    };

    const handleAction = async (type: 'check-in' | 'break-start' | 'break-end' | 'check-out') => {
        if (!user || !user.therapistId) return;
        setLoading(true);
        try {
            await addEvent(user.therapistId, type);
            await loadStatus();
            window.dispatchEvent(new CustomEvent('workforce-update', { detail: { type, userId: user.therapistId } }));
        } catch (error) {
            console.error("Error updating workforce status:", error);
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
        <div className="workforce-widget">
            <div className="workforce-header">
                <div className={`status-dot ${status}`}></div>
                <div className="flex flex-col">
                    <span className="status-text">
                        {status === 'offline' && 'Fuera de Servicio'}
                        {status === 'working' && 'Trabajando'}
                        {status === 'break' && 'En Pausa'}
                    </span>
                    {status === 'working' && (
                        <div className="flex flex-col">
                            <div className="flex items-center gap-1 text-xs text-secondary mt-1">
                                <Clock size={10} />
                                <span>{formatTime(elapsed)}</span>
                            </div>
                            {isShiftEnded && (
                                <span className="text-[10px] text-red-500 font-bold animate-pulse">
                                    ⚠️ Horario finalizado
                                </span>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <div className="workforce-controls">
                {status === 'offline' && (
                    <button className="wf-btn start" onClick={() => handleAction('check-in')} disabled={loading}>
                        <Play size={16} fill="currentColor" /> Entrada
                    </button>
                )}

                {status === 'working' && (
                    <>
                        <button className="wf-btn pause" onClick={() => handleAction('break-start')} disabled={loading} title="Pausa">
                            <Pause size={16} fill="currentColor" />
                        </button>
                        <button className="wf-btn stop" onClick={() => handleAction('check-out')} disabled={loading} title="Salida">
                            <Square size={16} fill="currentColor" /> Salida
                        </button>
                    </>
                )}

                {status === 'break' && (
                    <>
                        <button className="wf-btn resume" onClick={() => handleAction('break-end')} disabled={loading}>
                            <Play size={16} fill="currentColor" /> Reanudar
                        </button>
                        <button className="wf-btn stop" onClick={() => handleAction('check-out')} disabled={loading} title="Salida">
                            <Square size={16} fill="currentColor" />
                        </button>
                    </>
                )}
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100">
                <button
                    className="w-full text-xs text-secondary hover:text-primary flex items-center justify-center gap-2 py-2 rounded hover:bg-gray-50 transition-colors"
                    onClick={() => setIsSigningOpen(true)}
                >
                    <PenTool size={14} /> Mis Informes y Firmas
                </button>
            </div>

            {isSigningOpen && <SigningModal onClose={() => setIsSigningOpen(false)} />}
        </div>
    );
};

export default WorkforceWidget;
