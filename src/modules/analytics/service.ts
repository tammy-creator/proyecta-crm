import { startOfMonth, endOfMonth } from 'date-fns';
import { getAppointments } from '../calendar/service';
import { getTransactions } from '../billing/service';

export interface KPIStats {
    occupancyRate: number; // %
    totalRevenue: number;
    operatingMargin: number; // Mocked %
    cancellations: { reason: string; count: number }[];
    profitability: { therapist: string; workedHours: number; billedHours: number; revenue: number }[];
}

export const getAnalyticsData = async (month: Date): Promise<KPIStats> => {
    const start = startOfMonth(month);
    const end = endOfMonth(month);

    // Fetch data from all modules (Mocking range fetch efficiently)
    const [appointments, transactions, _workLogs] = await Promise.all([
        getAppointments(start, end),
        getTransactions(),
        // We need to fetch worklogs for all therapists. 
        // For this mock we will simulate it or fetch for a known list if possible.
        // Let's assume we get a consolidated report or fetch for 't1', 't2' manually for the demo.
        Promise.resolve([])
    ]);

    // Filter by month
    const monthAppts = appointments.filter(a => new Date(a.start) >= start && new Date(a.start) <= end);
    const monthTrans = transactions.filter(t => new Date(t.date) >= start && new Date(t.date) <= end);

    // 1. Occupancy Rate
    // Estimate total capacity: 8 hours * 5 days * 4 weeks * NumTherapists
    // For demo: Count 'Finalizada' or 'Completada' or 'Programada' vs (Total Slots in Month)
    // Simplify: Occupancy = (Completed + Scheduled) / (Total Appointments + Cancelled + FreeSlotsDraft)
    // Better approximation for this dashboard: 
    //   Total Potential Slots ~ 160 per therapist/month. 
    //   Occupied = Appts (excluding cancelled).
    const totalPotentialSlots = 160 * 2; // Assuming 2 therapists
    const occupiedSlots = monthAppts.filter(a => a.status !== 'Cancelada').length;
    const occupancyRate = Math.round((occupiedSlots / totalPotentialSlots) * 100);

    // 2. Cancellations
    const cancelledAppts = monthAppts.filter(a => a.status === 'Cancelada');
    const cancellationMap = new Map<string, number>();
    cancelledAppts.forEach(a => {
        const reason = a.cancellationReason || 'No especificado';
        cancellationMap.set(reason, (cancellationMap.get(reason) || 0) + 1);
    });
    const cancellations = Array.from(cancellationMap.entries()).map(([reason, count]) => ({ reason, count }));

    // 3. Profitability (Therapist Breakdown)
    // We need to fetch real WorkLogs to compare.
    // Let's mock the work logs for the demo visualization since we only have local storage for 'current user' usually.
    // We will generate believable data based on the appointments.

    const profitability = [
        { therapist: 'Ana García', id: 't1' },
        { therapist: 'Carlos Ruiz', id: 't2' }
    ].map(t => {
        const tAppts = monthAppts.filter(a => a.therapistName === t.therapist && a.status === 'Cobrada');
        const billedHours = tAppts.length; // Assuming 1h avg
        const revenue = monthTrans.filter(tr => tr.therapistName === t.therapist).reduce((sum, tr) => sum + tr.amount, 0);

        // Mock worked hours (usually slightly more than billed)
        const workedHours = billedHours * 1.25 + 10; // +10h admin/meetings

        return {
            therapist: t.therapist,
            workedHours: Math.round(workedHours),
            billedHours: billedHours,
            revenue: revenue
        };
    });

    const totalRevenue = monthTrans.reduce((sum, t) => sum + t.amount, 0);

    return {
        occupancyRate,
        totalRevenue,
        operatingMargin: 35, // Mocked 35% margin
        cancellations,
        profitability
    };
};
