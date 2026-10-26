import { startOfMonth, endOfMonth, format } from 'date-fns';
import { getAppointments } from '../calendar/service';
import { getTransactions } from '../billing/service';
import { getTherapists } from '../therapists/service';
import { getAllAttendance } from '../workforce/service';

export interface KPIStats {
    occupancyRate: number; // %
    totalRevenue: number;
    pendingRevenue: number;
    operatingMargin: number; // %
    cancellations: { reason: string; count: number }[];
    profitability: { 
        therapist: string; 
        therapistFullName: string;
        workedHours: number; 
        billedHours: number; 
        revenue: number 
    }[];
}

const normalizeName = (name: string): string => {
    return (name || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
};

export const getAnalyticsData = async (month: Date): Promise<KPIStats> => {
    const start = startOfMonth(month);
    const end = endOfMonth(month);
    const monthKey = format(month, 'yyyy-MM');

    // Cargar datos en paralelo desde todos los módulos
    const [appointments, transactions, therapists, attendances] = await Promise.all([
        getAppointments(start, end).catch(() => []),
        getTransactions().catch(() => []),
        getTherapists().catch(() => []),
        getAllAttendance(monthKey).catch(() => [])
    ]);

    // Filtrar citas y transacciones correspondientes al mes seleccionado
    const monthAppts = appointments.filter(a => {
        const d = new Date(a.start);
        return d >= start && d <= end;
    });

    const monthTrans = transactions.filter(t => {
        const d = new Date(t.date);
        return d >= start && d <= end;
    });

    // 1. Terapeutas reales activas del centro (excluyendo solo administración si procede)
    const activeTherapists = therapists.filter(t => 
        t.isActive !== false && 
        (t.specialty || '').toLowerCase() !== 'administración' &&
        (t.specialty || '').toLowerCase() !== 'administracion'
    );

    // 2. Tasa de Ocupación Real del Centro
    // Capacidad estimada: ~140 horas potenciales por terapeuta al mes
    const totalPotentialSlots = Math.max(1, (activeTherapists.length || 1) * 140);
    const occupiedSlots = monthAppts.filter(a => a.status !== 'Cancelada' && a.status !== 'Bloqueada').length;
    const occupancyRate = Math.min(100, Math.round((occupiedSlots / totalPotentialSlots) * 100));

    // 3. Análisis de Cancelaciones
    const cancelledAppts = monthAppts.filter(a => a.status === 'Cancelada');
    const cancellationMap = new Map<string, number>();
    cancelledAppts.forEach(a => {
        const reason = a.cancellationReason || 'No especificado';
        cancellationMap.set(reason, (cancellationMap.get(reason) || 0) + 1);
    });
    const cancellations = Array.from(cancellationMap.entries())
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count);

    // 4. Productividad y Eficiencia por Profesional Real
    const profitability = activeTherapists.map(t => {
        const tNorm = normalizeName(t.fullName);

        // Citas realizadas o cobradas por esta terapeuta en el mes
        const tAppts = monthAppts.filter(a => {
            if (a.status === 'Cancelada' || a.status === 'Bloqueada') return false;
            if (a.therapistId && a.therapistId === t.id) return true;
            if (a.therapistName) {
                const aNorm = normalizeName(a.therapistName);
                return aNorm.includes(tNorm) || tNorm.includes(aNorm);
            }
            return false;
        });

        // Horas facturadas (calculadas a partir de la duración de cada cita o 45 min por defecto)
        let billedMinutes = 0;
        tAppts.forEach(a => {
            if (a.start && a.end) {
                const s = new Date(a.start).getTime();
                const e = new Date(a.end).getTime();
                const diff = (e - s) / (1000 * 60);
                billedMinutes += (diff > 0 && diff < 300) ? diff : 45;
            } else {
                billedMinutes += 45;
            }
        });
        const billedHours = Math.round(billedMinutes / 60);

        // Horas trabajadas (a partir de fichajes de attendance si existen)
        const tAtt = attendances.filter(att => att.therapistId === t.id);
        let workedMinutes = 0;
        if (tAtt.length > 0) {
            tAtt.forEach(att => {
                if (att.startTime && att.endTime) {
                    const s = new Date(att.startTime).getTime();
                    const e = new Date(att.endTime).getTime();
                    const diff = (e - s) / (1000 * 60);
                    if (diff > 0 && diff < 800) workedMinutes += diff;
                }
            });
        }

        // Si no hay fichajes registrados (autónomos o profesionales sin fichaje estricto),
        // se estima en 1.25x las horas de sesión (incluyendo coordinación y preparación)
        const workedHours = workedMinutes > 0 
            ? Math.round(workedMinutes / 60) 
            : Math.round(billedHours * 1.25);

        // Ingresos facturados y cobrados atribuidos a la terapeuta
        const revenue = monthTrans
            .filter(tr => tr.status === 'Pagado' && tr.therapistName && (
                normalizeName(tr.therapistName).includes(tNorm) ||
                tNorm.includes(normalizeName(tr.therapistName))
            ))
            .reduce((sum, tr) => sum + tr.amount, 0);

        // Nombre corto legible para los gráficos (ej. 'Sofía R.', 'Ruth T.')
        const parts = t.fullName.trim().split(/\s+/);
        const shortName = parts.length > 1 ? `${parts[0]} ${parts[1][0]}.` : parts[0];

        return {
            therapist: shortName,
            therapistFullName: t.fullName,
            workedHours,
            billedHours,
            revenue
        };
    });

    // 5. Ingresos del CRM (Cobrados y Pendientes)
    const paidTrans = monthTrans.filter(t => t.status === 'Pagado');
    const totalRevenue = paidTrans.reduce((sum, t) => sum + t.amount, 0);

    const pendingTrans = monthTrans.filter(t => t.status === 'Pendiente');
    const pendingRevenue = pendingTrans.reduce((sum, t) => sum + t.amount, 0);

    return {
        occupancyRate,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        pendingRevenue: Math.round(pendingRevenue * 100) / 100,
        operatingMargin: 35, // Margen estimado si no hay extracto bancario
        cancellations,
        profitability
    };
};
