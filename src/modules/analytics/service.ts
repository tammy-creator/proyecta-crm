import { startOfMonth, endOfMonth, format } from 'date-fns';
import { es } from 'date-fns/locale';
import { getAppointments } from '../calendar/service';
import { getTransactions } from '../billing/service';
import { getTherapists } from '../therapists/service';
import { getAllAttendance } from '../workforce/service';
import { 
    type MonthlyCollectionSummary, 
    type AiHealthDiagnosis, 
    type AiInsight, 
    type AcademicYearData, 
    type AcademicYearMonth, 
    type MonthlyStatementData, 
    type FinancialCategory, 
    FINANCIAL_CATEGORIES 
} from './types';
import { getStatementForMonth } from './bankStatementStorage';

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

/**
 * Obtiene el desglose detallado de cobros efectivos del CRM para el mes:
 * pagados, pendientes, por método de pago y pacientes con deuda abierta.
 */
export const getMonthlyCollectionData = async (month: Date): Promise<MonthlyCollectionSummary> => {
    const start = startOfMonth(month);
    const end = endOfMonth(month);

    const transactions = await getTransactions().catch(() => []);
    const monthTrans = transactions.filter(t => {
        const d = new Date(t.date);
        return d >= start && d <= end;
    });

    let totalCollected = 0;
    let totalPending = 0;
    let paidSessionsCount = 0;
    let pendingSessionsCount = 0;

    const methodMap = new Map<string, { amount: number; count: number }>();
    const pendingPatientsMap = new Map<string, { patientId?: string; patientName: string; amount: number; count: number; lastDate: string }>();

    monthTrans.forEach(t => {
        const amt = Number(t.amount) || 0;
        if (t.status === 'Pagado') {
            totalCollected += amt;
            paidSessionsCount++;

            const rawMethod = (t.method || 'No especificado').trim();
            const methodKey = rawMethod.charAt(0).toUpperCase() + rawMethod.slice(1);
            const current = methodMap.get(methodKey) || { amount: 0, count: 0 };
            current.amount += amt;
            current.count++;
            methodMap.set(methodKey, current);
        } else {
            totalPending += amt;
            pendingSessionsCount++;

            const patName = (t.patientName || 'Paciente no identificado').trim();
            const existing = pendingPatientsMap.get(patName) || {
                patientId: t.patientId,
                patientName: patName,
                amount: 0,
                count: 0,
                lastDate: t.date || ''
            };
            existing.amount += amt;
            existing.count++;
            if (!existing.lastDate || t.date > existing.lastDate) {
                existing.lastDate = t.date;
            }
            pendingPatientsMap.set(patName, existing);
        }
    });

    totalCollected = Math.round(totalCollected * 100) / 100;
    totalPending = Math.round(totalPending * 100) / 100;
    const totalBilled = Math.round((totalCollected + totalPending) * 100) / 100;
    const collectionRate = totalBilled > 0 ? Math.round((totalCollected / totalBilled) * 100) : 100;

    const byMethod = Array.from(methodMap.entries())
        .map(([method, data]) => ({
            method,
            amount: Math.round(data.amount * 100) / 100,
            count: data.count,
            percentage: totalCollected > 0 ? Math.round((data.amount / totalCollected) * 100) : 0
        }))
        .sort((a, b) => b.amount - a.amount);

    const pendingPatients = Array.from(pendingPatientsMap.values())
        .map(p => ({
            ...p,
            amount: Math.round(p.amount * 100) / 100,
            lastDate: p.lastDate ? format(new Date(p.lastDate), 'dd/MM/yyyy') : '—'
        }))
        .sort((a, b) => b.amount - a.amount);

    return {
        totalBilled,
        totalCollected,
        totalPending,
        collectionRate,
        paidSessionsCount,
        pendingSessionsCount,
        byMethod,
        pendingPatients
    };
};

/**
 * Genera el ciclo escolar completo de Septiembre a Septiembre (13 meses)
 * agregando tanto la actividad de CRM como los extractos bancarios persistidos.
 */
export const getAcademicYearData = async (startYear: number = 2026): Promise<AcademicYearData> => {
    const transactions = await getTransactions().catch(() => []);

    // Crear array de los 13 meses del ciclo escolar: Sep Y1 -> Sep Y2
    const monthConfigs: { year: number; monthIndex: number }[] = [
        { year: startYear, monthIndex: 8 },  // Sep
        { year: startYear, monthIndex: 9 },  // Oct
        { year: startYear, monthIndex: 10 }, // Nov
        { year: startYear, monthIndex: 11 }, // Dic
        { year: startYear + 1, monthIndex: 0 }, // Ene
        { year: startYear + 1, monthIndex: 1 }, // Feb
        { year: startYear + 1, monthIndex: 2 }, // Mar
        { year: startYear + 1, monthIndex: 3 }, // Abr
        { year: startYear + 1, monthIndex: 4 }, // May
        { year: startYear + 1, monthIndex: 5 }, // Jun
        { year: startYear + 1, monthIndex: 6 }, // Jul
        { year: startYear + 1, monthIndex: 7 }, // Ago
        { year: startYear + 1, monthIndex: 8 }, // Sep (cierre del ciclo)
    ];

    const months: AcademicYearMonth[] = monthConfigs.map(({ year, monthIndex }) => {
        const d = new Date(year, monthIndex, 1);
        const monthKey = format(d, 'yyyy-MM');
        const monthLabel = format(d, 'MMMM yyyy', { locale: es });
        const shortLabel = format(d, 'MMM yy', { locale: es });

        // Extracto bancario guardado
        const stmt = getStatementForMonth(monthKey);
        const hasBankStatement = !!stmt && (stmt.movements?.length || 0) > 0;
        const bankIncome = stmt ? stmt.totalIncome : 0;
        const bankExpenses = stmt ? stmt.totalExpenses : 0;
        const bankNet = stmt ? stmt.netResult : 0;
        const marginPercent = stmt ? stmt.realMargin : 0;

        // CRM Transacciones del mes
        const start = startOfMonth(d);
        const end = endOfMonth(d);
        const mTrans = transactions.filter(t => {
            const td = new Date(t.date);
            return td >= start && td <= end;
        });

        const crmCollected = Math.round(mTrans.filter(t => t.status === 'Pagado').reduce((s, t) => s + (Number(t.amount) || 0), 0) * 100) / 100;
        const crmPending = Math.round(mTrans.filter(t => t.status === 'Pendiente').reduce((s, t) => s + (Number(t.amount) || 0), 0) * 100) / 100;
        const crmBilled = Math.round((crmCollected + crmPending) * 100) / 100;
        const sessionsCount = mTrans.length;

        return {
            monthKey,
            monthLabel: monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1),
            shortLabel: shortLabel.charAt(0).toUpperCase() + shortLabel.slice(1),
            hasBankStatement,
            bankIncome,
            bankExpenses,
            bankNet,
            crmCollected,
            crmPending,
            crmBilled,
            sessionsCount,
            marginPercent
        };
    });

    let totalBankIncome = 0;
    let totalBankExpenses = 0;
    let totalCrmCollected = 0;
    let totalCrmPending = 0;
    let totalSessions = 0;
    let monthsWithActivity = 0;

    months.forEach(m => {
        totalBankIncome += m.bankIncome;
        totalBankExpenses += m.bankExpenses;
        totalCrmCollected += m.crmCollected;
        totalCrmPending += m.crmPending;
        totalSessions += m.sessionsCount;
        if (m.hasBankStatement || m.sessionsCount > 0) {
            monthsWithActivity++;
        }
    });

    totalBankIncome = Math.round(totalBankIncome * 100) / 100;
    totalBankExpenses = Math.round(totalBankExpenses * 100) / 100;
    totalCrmCollected = Math.round(totalCrmCollected * 100) / 100;
    totalCrmPending = Math.round(totalCrmPending * 100) / 100;
    const totalCrmBilled = Math.round((totalCrmCollected + totalCrmPending) * 100) / 100;
    const totalBankNet = Math.round((totalBankIncome - totalBankExpenses) * 100) / 100;
    const overallMarginPercent = totalBankIncome > 0 ? Math.round((totalBankNet / totalBankIncome) * 100) : 0;
    const overallCollectionRate = totalCrmBilled > 0 ? Math.round((totalCrmCollected / totalCrmBilled) * 100) : 100;

    const divisor = Math.max(1, monthsWithActivity);
    const averageMonthlyIncome = Math.round((totalBankIncome / divisor) * 100) / 100;
    const averageMonthlyExpenses = Math.round((totalBankExpenses / divisor) * 100) / 100;
    const averageMonthlyNet = Math.round((totalBankNet / divisor) * 100) / 100;

    return {
        academicYearKey: `${startYear}-${startYear + 1}`,
        academicYearLabel: `Curso ${startYear} / ${startYear + 1} (Septiembre - Septiembre)`,
        startYear,
        months,
        accumulated: {
            totalBankIncome,
            totalBankExpenses,
            totalBankNet,
            totalCrmCollected,
            totalCrmPending,
            totalCrmBilled,
            totalSessions,
            overallMarginPercent,
            overallCollectionRate,
            averageMonthlyIncome,
            averageMonthlyExpenses,
            averageMonthlyNet,
            activeMonthsWithData: monthsWithActivity
        }
    };
};

/**
 * Genera un diagnóstico financiero y clínico integral estructurado por IA
 * analizando cobros efectivos, gastos de banco, desequilibrios en el equipo y cancelaciones.
 */
export const generateAiAdvisory = (
    stats: KPIStats,
    statement: MonthlyStatementData | null,
    collection: MonthlyCollectionSummary,
    academicYear?: AcademicYearData | null
): AiHealthDiagnosis => {
    const insights: AiInsight[] = [];
    const strengths: string[] = [];
    const criticalAlerts: string[] = [];

    // 1. ANÁLISIS DE COBROS EFECTIVOS
    const collectionRate = collection.collectionRate;
    const pendingAmount = collection.totalPending;

    if (collectionRate >= 95) {
        strengths.push(`Tasa de cobro impecable del ${collectionRate}% en el CRM. La recaudación de sesiones es prácticamente total.`);
    } else if (collectionRate < 85) {
        criticalAlerts.push(`Fuga de liquidez: el ${100 - collectionRate}% de la facturación (${pendingAmount.toLocaleString('es-ES')}€) sigue pendiente de cobro.`);
        insights.push({
            id: 'cobros-pendientes',
            category: 'COBROS',
            severity: 'HIGH',
            title: 'Riesgo de tesorería por sesiones sin cobrar',
            description: `Existen ${collection.pendingSessionsCount} sesiones pendientes por un total de ${pendingAmount.toLocaleString('es-ES')}€ (${collection.pendingPatients.length} familias afectadas).`,
            actionableRecommendation: 'Revisa el listado de familias con saldo abierto y programa un recordatorio de pago por WhatsApp antes de final de mes.',
            estimatedImpact: `+${pendingAmount.toLocaleString('es-ES')}€ de liquidez inmediata`
        });
    } else {
        insights.push({
            id: 'cobros-moderados',
            category: 'COBROS',
            severity: 'MEDIUM',
            title: 'Optimización de cobros diferidos ("Fin de mes")',
            description: `Se registran ${pendingAmount.toLocaleString('es-ES')}€ pendientes de liquidación habitual a cierre de mes.`,
            actionableRecommendation: 'Ofrece domiciliación bancaria SEPA o pasarela Bizum a pacientes recurrentes para asegurar el abono el día 1 de cada mes.',
            estimatedImpact: '+12% rapidez en flujo de caja'
        });
    }

    // Métodos de pago destacados
    const finDeMesMethod = collection.byMethod.find(m => m.method.toLowerCase().includes('fin de mes'));
    if (finDeMesMethod && finDeMesMethod.percentage > 30) {
        insights.push({
            id: 'metodo-fin-de-mes',
            category: 'COBROS',
            severity: 'LOW',
            title: 'Alta concentración en modalidad "Fin de Mes"',
            description: `Un ${finDeMesMethod.percentage}% de los ingresos depende del pago agrupado a fin de mes (${finDeMesMethod.amount.toLocaleString('es-ES')}€).`,
            actionableRecommendation: 'Revisa que las familias tengan tarjeta guardada o remesa programada para evitar acumulación de saldo vencido.',
            estimatedImpact: 'Reducción de impagos a <2%'
        });
    }

    // 2. ANÁLISIS DE EXTRACTO BANCARIO Y MARGEN
    let marginScore = 75;
    if (statement) {
        const netResult = statement.netResult;
        const margin = statement.realMargin;
        const totalExpenses = statement.totalExpenses;

        if (netResult > 2500 && margin >= 30) {
            strengths.push(`Excelente margen operativo real del ${margin}% (+${netResult.toLocaleString('es-ES')}€ de beneficio limpio en banco).`);
            marginScore = 95;
        } else if (netResult > 0) {
            strengths.push(`Resultado positivo (+${netResult.toLocaleString('es-ES')}€) con cobertura de costes fijos.`);
            marginScore = 80;
        } else {
            criticalAlerts.push(`Déficit mensual en cuenta: los gastos superaron los ingresos por ${Math.abs(netResult).toLocaleString('es-ES')}€.`);
            marginScore = 40;
            insights.push({
                id: 'deficit-banco',
                category: 'GASTOS',
                severity: 'HIGH',
                title: 'Alerta de cobertura de gastos operativos',
                description: `Los cargos en cuenta (${totalExpenses.toLocaleString('es-ES')}€) excedieron las entradas de este mes en ${Math.abs(netResult).toLocaleString('es-ES')}€.`,
                actionableRecommendation: 'Comprueba si hay liquidaciones de TPV o transferencias pendientes de entrar del mes anterior y controla gastos prescindibles.',
                estimatedImpact: 'Equilibrio de tesorería'
            });
        }

        // Mayor categoría de gasto
        const topExpenseEntry = Object.entries(statement.expensesByCategory)
            .sort(([, a], [, b]) => b - a)[0];
        if (topExpenseEntry && topExpenseEntry[1] > 0 && statement.totalExpenses > 0) {
            const topCategoryMeta = FINANCIAL_CATEGORIES[topExpenseEntry[0] as FinancialCategory] || FINANCIAL_CATEGORIES.OTROS_GASTOS;
            const topPercentage = Math.round((topExpenseEntry[1] / statement.totalExpenses) * 100);

            if (topPercentage > 45 && topExpenseEntry[0] !== 'NOMINAS_EQUIPO') {
                insights.push({
                    id: 'peso-gasto-elevado',
                    category: 'GASTOS',
                    severity: 'MEDIUM',
                    title: `Concentración de gasto en ${topCategoryMeta.label}`,
                    description: `El rubro '${topCategoryMeta.label}' absorbe el ${topPercentage}% del total de gastos del mes (${topExpenseEntry[1].toLocaleString('es-ES')}€).`,
                    actionableRecommendation: 'Revisa si existen cuotas duplicadas o margen de renegociación de tarifas y proveedores.',
                    estimatedImpact: `Ahorro potencial de ~${Math.round(topExpenseEntry[1] * 0.08)}€/mes`
                });
            }
        }

        // Conciliación Banco vs CRM
        const diffBankCrm = statement.totalIncome - collection.totalCollected;
        if (Math.abs(diffBankCrm) > 1500) {
            insights.push({
                id: 'desfase-conciliacion',
                category: 'ESTRATEGIA',
                severity: 'TIP',
                title: 'Desfase temporal entre ingresos de banco y cobros CRM',
                description: `Hay una diferencia de ${Math.abs(diffBankCrm).toLocaleString('es-ES')}€ entre lo recaudado en citas (${collection.totalCollected.toLocaleString('es-ES')}€) y las entradas de cuenta (${statement.totalIncome.toLocaleString('es-ES')}€).`,
                actionableRecommendation: 'Es habitual debido al decalaje de remesas de TPV (1-2 días hábiles) o anticipos de becas. Concilia las fechas valor de los cobros grandes.',
                estimatedImpact: 'Visión de caja exacta'
            });
        }
    } else {
        insights.push({
            id: 'subir-extracto',
            category: 'GASTOS',
            severity: 'MEDIUM',
            title: 'Sube el extracto bancario para auditar costes',
            description: 'Actualmente solo disponemos de la facturación del CRM. Con el extracto de Abanca/banco calcularemos el beneficio neto y costes fijos reales.',
            actionableRecommendation: 'Arrastra el archivo Excel o CSV del banco para activar el cálculo de margen real.',
            estimatedImpact: 'Visión financiera 360°'
        });
    }

    // 3. ANÁLISIS DE PRODUCTIVIDAD Y EQUIPO TERAPÉUTICO
    const occupancyRate = stats.occupancyRate;
    if (occupancyRate >= 80) {
        strengths.push(`Alta ocupación clínica global (${occupancyRate}%). El centro opera cerca de su capacidad óptima.`);
    } else if (occupancyRate < 60) {
        insights.push({
            id: 'baja-ocupacion',
            category: 'PRODUCTIVIDAD',
            severity: 'HIGH',
            title: 'Capacidad disponible en agenda clínica',
            description: `La ocupación se sitúa en el ${occupancyRate}%, lo que indica margen para atender hasta ~${Math.round((75 - occupancyRate) * 1.4)} sesiones adicionales semanales.`,
            actionableRecommendation: 'Activa pacientes en lista de espera y promociona horarios de menor demanda (mañanas o primeras horas de tarde).',
            estimatedImpact: `+${Math.round((75 - occupancyRate) * 35)}€/mes potenciales`
        });
    }

    // Desequilibrio entre terapeutas
    if (stats.profitability && stats.profitability.length > 2) {
        const sortedByBilled = [...stats.profitability].sort((a, b) => b.billedHours - a.billedHours);
        const topTherapist = sortedByBilled[0];
        const lowTherapist = sortedByBilled[sortedByBilled.length - 1];

        if (topTherapist && lowTherapist && topTherapist.billedHours > lowTherapist.billedHours * 2.5 && topTherapist.billedHours > 30) {
            insights.push({
                id: 'desequilibrio-terapeutas',
                category: 'PRODUCTIVIDAD',
                severity: 'MEDIUM',
                title: 'Desbalance en la carga de trabajo del equipo',
                description: `${topTherapist.therapistFullName} acumula ${topTherapist.billedHours}h de sesión frente a ${lowTherapist.billedHours}h de ${lowTherapist.therapistFullName}.`,
                actionableRecommendation: 'Deriva nuevas admisiones y valoraciones hacia las terapeutas con mayor disponibilidad horaria para equilibrar la productividad.',
                estimatedImpact: 'Mayor retención del equipo y menor sobrecarga'
            });
        }
    }

    // 4. ANÁLISIS DE CANCELACIONES
    const totalCancelled = stats.cancellations.reduce((sum, c) => sum + c.count, 0);
    if (totalCancelled > 10) {
        const topReason = stats.cancellations[0]?.reason || 'Motivo recurrente';
        const estimatedLostRevenue = totalCancelled * 40;
        insights.push({
            id: 'cancelaciones-impacto',
            category: 'CANCELACIONES',
            severity: 'MEDIUM',
            title: `Impacto económico de cancelaciones (${totalCancelled} citas perdidas)`,
            description: `Se cancelaron ${totalCancelled} citas este mes (~${estimatedLostRevenue.toLocaleString('es-ES')}€ de facturación no ejecutada). Motivo principal: "${topReason}".`,
            actionableRecommendation: 'Envía confirmaciones automáticas por WhatsApp con 24h de antelación y ofrece reubicación rápida en huecos liberados.',
            estimatedImpact: `Recuperar hasta ~${Math.round(estimatedLostRevenue * 0.45)}€/mes`
        });
    }

    // 5. CÁLCULO DE SCORE GLOBAL (0 - 100)
    let score = Math.round(
        (collectionRate * 0.3) +
        (marginScore * 0.35) +
        (Math.min(100, occupancyRate * 1.2) * 0.25) +
        (Math.max(40, 100 - totalCancelled * 3) * 0.1)
    );
    score = Math.max(25, Math.min(98, score));

    let level: 'EXCELLENT' | 'HEALTHY' | 'WARNING' | 'CRITICAL' = 'HEALTHY';
    let title = 'Salud Operativa Fuerte';
    let summary = 'Centro Proyecta mantiene un funcionamiento rentable y equilibrado este mes. Aplicar las recomendaciones optimizará la caja y balanceará las agendas.';

    if (score >= 85) {
        level = 'EXCELLENT';
        title = 'Rendimiento Excelente y Saludable';
        summary = 'Las métricas financieras y clínicas se encuentran en rango óptimo. La recaudación es sólida y los márgenes permiten consolidar reservas.';
    } else if (score >= 70) {
        level = 'HEALTHY';
        title = 'Salud Positiva con Margen de Optimización';
        summary = 'El centro es rentable y cubre su operativa con normalidad. Hay oportunidades claras para agilizar cobros pendientes y equilibrar la ocupación del equipo.';
    } else if (score >= 55) {
        level = 'WARNING';
        title = 'Atención Requerida en Cobros y Costes';
        summary = 'Se aprecian desajustes temporales: cobros pendientes acumulados o gastos elevados respecto a las entradas. Se recomienda acción correctiva prioritaria.';
    } else {
        level = 'CRITICAL';
        title = 'Alerta Financiera de Mes';
        summary = 'El flujo de caja de este mes presenta desviaciones relevantes. Es prioritario reclamar saldos pendientes y revisar adeudos extraordinarios.';
    }

    if (academicYear && academicYear.accumulated.activeMonthsWithData > 1) {
        strengths.push(`En lo que va de curso escolar (${academicYear.academicYearLabel}), el centro acumula un neto de +${academicYear.accumulated.totalBankNet.toLocaleString('es-ES')}€ con un margen medio del ${academicYear.accumulated.overallMarginPercent}%.`);
    }

    return {
        score,
        level,
        title,
        summary,
        strengths,
        criticalAlerts,
        insights,
        generatedAt: new Date().toISOString()
    };
};

