import React, { useState, useEffect } from 'react';
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';
import { es } from 'date-fns/locale';
import { Download, Calendar as CalendarIcon, User } from 'lucide-react';
import { getMonthlyReport } from './service';
import { getTherapists } from '../therapists/service';
import type { WorkLog } from './types';
import type { Therapist } from '../therapists/types';

const WorkforceReport: React.FC = () => {
    const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'));
    const [selectedTherapistId, setSelectedTherapistId] = useState<string>('t1');
    const [therapists, setTherapists] = useState<Therapist[]>([]);
    const [logs, setLogs] = useState<WorkLog[]>([]);

    useEffect(() => {
        getTherapists().then(setTherapists);
    }, []);

    useEffect(() => {
        fetchLogs();
    }, [month, selectedTherapistId]);

    const fetchLogs = async () => {
        const data = await getMonthlyReport(selectedTherapistId, month);
        setLogs(data);
    };

    const calculateDailyStats = (log: WorkLog) => {
        const events = log.events;
        const checkIn = events.find(e => e.type === 'check-in');
        const checkOut = events.find(e => e.type === 'check-out');
        const breaks = events.filter(e => e.type === 'break-start');

        // Simple break calculation logic (mock for display)
        events.forEach((e, i) => {
            if (e.type === 'break-start' && events[i + 1]?.type === 'break-end') {
                // diff logic
            }
        });

        return {
            start: checkIn ? format(parseISO(checkIn.timestamp), 'HH:mm') : '-',
            end: checkOut ? format(parseISO(checkOut.timestamp), 'HH:mm') : (checkIn ? 'En curso' : '-'),
            breaks: breaks.length,
            total: log.totalWorkedMinutes
        };
    };

    const daysInMonth = eachDayOfInterval({
        start: startOfMonth(parseISO(month + '-01')),
        end: endOfMonth(parseISO(month + '-01'))
    });

    const handleExport = () => {
        // Mock CSV Export
        let csv = 'Fecha,Terapeuta,Entrada,Salida,Total Minutos\n';
        daysInMonth.forEach(day => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const log = logs.find(l => l.date === dateStr);
            const stats = log ? calculateDailyStats(log) : { start: '-', end: '-', total: 0 };
            const tName = therapists.find(t => t.id === selectedTherapistId)?.fullName || 'Desconocido';
            csv += `${dateStr},${tName},${stats.start},${stats.end},${stats.total}\n`;
        });

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `reporte_${selectedTherapistId}_${month}.csv`;
        a.click();
    };

    return (
        <div className="workforce-report">
            <div className="report-controls flex gap-4 mb-6 p-4 bg-gray-50 rounded-lg border border-gray-100 items-end">
                <div className="form-group flex-1">
                    <label className="flex items-center gap-2 text-sm font-semibold text-gray-600 mb-1">
                        <CalendarIcon size={14} /> Mes
                    </label>
                    <input
                        type="month"
                        value={month}
                        onChange={e => setMonth(e.target.value)}
                        className="w-full p-2 border rounded-md"
                    />
                </div>
                <div className="form-group flex-1">
                    <label className="flex items-center gap-2 text-sm font-semibold text-gray-600 mb-1">
                        <User size={14} /> Terapeuta
                    </label>
                    <select
                        value={selectedTherapistId}
                        onChange={e => setSelectedTherapistId(e.target.value)}
                        className="w-full p-2 border rounded-md"
                    >
                        {therapists.map(t => <option key={t.id} value={t.id}>{t.fullName}</option>)}
                    </select>
                </div>
                <button className="btn-primary flex items-center gap-2 h-[42px]" onClick={handleExport}>
                    <Download size={16} /> Exportar CSV
                </button>
            </div>

            <div className="billing-table-wrapper">
                <table className="billing-table">
                    <thead>
                        <tr>
                            <th>Fecha</th>
                            <th>Entrada</th>
                            <th>Salida</th>
                            <th>Pausas</th>
                            <th>Total Horas</th>
                            <th>Estado</th>
                        </tr>
                    </thead>
                    <tbody>
                        {daysInMonth.map(day => {
                            const dateStr = format(day, 'yyyy-MM-dd');
                            const log = logs.find(l => l.date === dateStr);
                            const stats = log ? calculateDailyStats(log) : null;
                            const isWeekend = day.getDay() === 0 || day.getDay() === 6;

                            if (!log && isWeekend) return null; // Hide weekends if no work

                            return (
                                <tr key={dateStr} className={!log ? 'opacity-50' : ''}>
                                    <td className="font-medium">{format(day, "EEEE d", { locale: es })}</td>
                                    <td>{stats?.start || '-'}</td>
                                    <td>{stats?.end || '-'}</td>
                                    <td>{stats?.breaks ? `${stats.breaks} pausas` : '-'}</td>
                                    <td className="font-bold text-primary">
                                        {stats ? `${Math.floor(stats.total / 60)}h ${stats.total % 60}m` : '-'}
                                    </td>
                                    <td>
                                        {log ? (
                                            <span className="badge badge-success">Registrado</span>
                                        ) : (
                                            <span className="text-xs text-gray-400">Sin actividad</span>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default WorkforceReport;
