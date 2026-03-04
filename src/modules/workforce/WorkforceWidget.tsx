import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { addEvent, getLiveWorkStats } from './service';
import type { WorkStatus } from './types';
import { Play, Pause, Square, Clock, PenTool } from 'lucide-react';
import './WorkforceWidget.css';
import SigningModal from './SigningModal';

const WorkforceWidget: React.FC = () => {
    const { user } = useAuth();
    const [status, setStatus] = useState<WorkStatus>('offline');
    const [loading, setLoading] = useState(true);
    const [elapsed, setElapsed] = useState(0);
    const [initialSeconds, setInitialSeconds] = useState(0);
    const [isSigningOpen, setIsSigningOpen] = useState(false);
    const [lastStartTime] = useState<string | undefined>(undefined);

    useEffect(() => {
        if (user) {
            loadStatus();
        }
    }, [user]);

    // Timer effect - runs locally but syncs every minute with server time if needed (or just relying on local calc from start time)
    useEffect(() => {
        let interval: any;
        if (status === 'working' && lastStartTime) {
            // Update immediately
            updateElapsed();
            interval = setInterval(updateElapsed, 1000);
        } else {
            if (status !== 'working') setElapsed(0);
        }
        return () => clearInterval(interval);
    }, [status, lastStartTime]); // Depend on lastStartTime

    const updateElapsed = () => {
        if (!lastStartTime) return;
        const now = new Date();
        const start = new Date(lastStartTime);
        const diff = Math.floor((now.getTime() - start.getTime()) / 1000) + initialSeconds;
        setElapsed(diff);
    };

    const loadStatus = async () => {
        if (!user) return;
        const stats = await getLiveWorkStats(user.id);
        setStatus(stats.status);
        setInitialSeconds(stats.totalSeconds); // Total worked before current session (or total today)
        // Actually getLiveWorkStats returns totalSeconds including current session?
        // Let's adjust logic. The service calculateDailySeconds INCLUDES current session if working.
        // So totalSeconds IS the correct value to display? 
        // Yes, if we want "Total Worked Today". 
        // If we want "Time in this session", we need lastEventTime.
        // The widget currently shows just one timer. Usually "Total Worked Today" is better.
        // But the previous impl was "Elapsed in this session" (reset on status change).
        // Let's show TOTAL WORKED TODAY as it is more useful.
        // So `initialSeconds` is the total seconds at the moment of fetch.
        // The service calculateDailySeconds INCLUDES current session if working.
        // So `stats.totalSeconds` IS the live value at that moment.
        // So I just need to increment it locally?
        // Better: store `referenceTime` and `referenceTotal`.

        // Simpler approach for this widget:
        // We want to show "Current Session Duration" OR "Total Today"?
        // Let's show "Total Today" as it's more informative for "Control Horario".

        // If status is working:
        // elapsed = stats.totalSeconds + (diff since fetch)

        setInitialSeconds(stats.totalSeconds);
        setLoading(false);
    };

    const handleAction = async (type: 'check-in' | 'break-start' | 'break-end' | 'check-out') => {
        if (!user) return;
        setLoading(true);
        await addEvent(user.id, type);
        await loadStatus(); // This will refresh baseTotal and fetchTime
        setLoading(false);
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
                        <div className="flex items-center gap-1 text-xs text-secondary mt-1">
                            <Clock size={10} />
                            <span>{formatTime(elapsed)}</span>
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
