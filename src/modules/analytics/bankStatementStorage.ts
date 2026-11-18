import { 
    type MonthlyStatementData, 
    type FinancialCategory,
    FINANCIAL_CATEGORIES 
} from './types';
import { supabase } from '../../lib/supabase';

const STORAGE_KEY_PREFIX = 'proyecta_bank_statement_';
const CUSTOM_RULES_KEY = 'proyecta_bank_custom_category_rules';

/**
 * Recalcula totales de ingresos, gastos, margen y desgloses por categoría.
 * Incluye auto-recuperación si detecta datos guardados previamente con el error de escala x100 de CSV.
 */
export const recalculateStatementTotals = (data: MonthlyStatementData): MonthlyStatementData => {
    let totalIncome = 0;
    let totalExpenses = 0;

    const initialCategories = Object.keys(FINANCIAL_CATEGORIES) as FinancialCategory[];
    const expensesByCategory: Record<FinancialCategory, number> = {} as any;
    const incomeByCategory: Record<FinancialCategory, number> = {} as any;

    initialCategories.forEach(cat => {
        expensesByCategory[cat] = 0;
        incomeByCategory[cat] = 0;
    });

    // Auto-corrección si se detecta que los datos previos venían multiplicados por 100
    const hasUnscaledBug = data.movements.some(m => 
        Math.abs(m.amount) > 50000 && 
        (
            (m.concept || '').toUpperCase().includes('NOMINA') || 
            (m.concept || '').toUpperCase().includes('IBERDROLA') || 
            (m.concept || '').toUpperCase().includes('AMORTIZACION') ||
            (m.concept || '').toUpperCase().includes('SEGUROS') ||
            (m.concept || '').toUpperCase().includes('TELEFONICA')
        )
    );

    let movementsToProcess = data.movements;
    if (hasUnscaledBug) {
        movementsToProcess = data.movements.map(m => ({
            ...m,
            amount: Math.round((m.amount / 100) * 100) / 100,
            balance: m.balance !== undefined ? Math.round((m.balance / 100) * 100) / 100 : undefined
        }));
    }

    movementsToProcess.forEach(m => {
        if (m.amount >= 0) {
            totalIncome += m.amount;
            incomeByCategory[m.category] = (incomeByCategory[m.category] || 0) + m.amount;
        } else {
            const absExpense = Math.abs(m.amount);
            totalExpenses += absExpense;
            expensesByCategory[m.category] = (expensesByCategory[m.category] || 0) + absExpense;
        }
    });

    totalIncome = Math.round(totalIncome * 100) / 100;
    totalExpenses = Math.round(totalExpenses * 100) / 100;
    const netResult = Math.round((totalIncome - totalExpenses) * 100) / 100;
    const realMargin = totalIncome > 0 ? Math.round((netResult / totalIncome) * 100) : 0;

    return {
        ...data,
        movements: movementsToProcess,
        totalIncome,
        totalExpenses,
        netResult,
        realMargin,
        expensesByCategory,
        incomeByCategory
    };
};

/**
 * Obtiene los datos del extracto bancario de un mes específico desde localStorage.
 * Limpia automáticamente extractos fantasma causados por filtraciones de fin de mes.
 */
export const getStatementForMonth = (monthKey: string): MonthlyStatementData | null => {
    try {
        const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${monthKey}`);
        if (!raw) return null;
        const parsed = JSON.parse(raw);

        // Limpieza y auto-fusión si se detecta que noviembre contiene movimientos del extracto de octubre o residuos
        if (monthKey === '2026-11') {
            const isOctResidual = 
                (parsed.fileName && parsed.fileName.toLowerCase().includes('octubre')) ||
                (parsed.movements && parsed.movements.length <= 10 && parsed.movements.some((m: any) => (m.operationDate || m.date || '').includes('2026-10')));

            if (isOctResidual) {
                try {
                    const octRaw = localStorage.getItem(`${STORAGE_KEY_PREFIX}2026-10`);
                    if (octRaw) {
                        const octParsed = JSON.parse(octRaw);
                        const existingKeys = new Set((octParsed.movements || []).map((m: any) => `${m.concept}_${m.amount}`));
                        const missing = (parsed.movements || []).filter((m: any) => !existingKeys.has(`${m.concept}_${m.amount}`));
                        if (missing.length > 0) {
                            const fixedMovements = missing.map((m: any) => ({
                                ...m,
                                date: m.operationDate || '2026-10-31'
                            }));
                            octParsed.movements.push(...fixedMovements);
                            const octFinal = recalculateStatementTotals(octParsed);
                            localStorage.setItem(`${STORAGE_KEY_PREFIX}2026-10`, JSON.stringify(octFinal));
                        }
                    }
                } catch (err) {
                    console.warn('Error al auto-fusionar movimientos de fin de mes en octubre:', err);
                }
                localStorage.removeItem(`${STORAGE_KEY_PREFIX}${monthKey}`);
                return null;
            }
        }

        const calculated = recalculateStatementTotals(parsed);
        if (calculated.totalExpenses !== parsed.totalExpenses) {
            localStorage.setItem(`${STORAGE_KEY_PREFIX}${monthKey}`, JSON.stringify(calculated));
        }
        return calculated;
    } catch (err) {
        console.error('Error al cargar extracto bancario local:', err);
        return null;
    }
};

/**
 * Guarda los datos de un extracto bancario en localStorage y los sincroniza en la nube (Supabase).
 */
export const saveStatementForMonth = (monthKey: string, data: MonthlyStatementData): void => {
    try {
        const calculated = recalculateStatementTotals(data);
        localStorage.setItem(`${STORAGE_KEY_PREFIX}${monthKey}`, JSON.stringify(calculated));
        // Sincronizar en la nube en segundo plano para que todos los ordenadores y perfiles lo vean
        saveStatementToCloud(monthKey, calculated).catch(err => {
            console.warn('No se pudo sincronizar el extracto en Supabase:', err);
        });
    } catch (err) {
        console.error('Error al guardar extracto bancario:', err);
    }
};

/**
 * Elimina el extracto bancario local y lo elimina también de la nube.
 */
export const deleteStatementForMonth = (monthKey: string): void => {
    try {
        localStorage.removeItem(`${STORAGE_KEY_PREFIX}${monthKey}`);
        deleteStatementFromCloud(monthKey).catch(err => {
            console.warn('No se pudo eliminar el extracto en Supabase:', err);
        });
    } catch (err) {
        console.error('Error al eliminar extracto bancario:', err);
    }
};

// ============================================================================
// SINCRONIZACIÓN EN LA NUBE (SUPABASE) PARA COMPARTIR ENTRE TODOS LOS PERFILES
// ============================================================================

/**
 * Consulta y descarga el extracto bancario de un mes desde Supabase (si existe) y actualiza la caché local.
 */
export const fetchStatementFromCloud = async (monthKey: string): Promise<MonthlyStatementData | null> => {
    try {
        const { data, error } = await supabase
            .from('bank_statements')
            .select('*')
            .eq('month_key', monthKey)
            .maybeSingle();

        if (error || !data) return null;

        const statementData = data.data as MonthlyStatementData;
        if (statementData && statementData.movements) {
            const calculated = recalculateStatementTotals(statementData);
            localStorage.setItem(`${STORAGE_KEY_PREFIX}${monthKey}`, JSON.stringify(calculated));
            return calculated;
        }
        return null;
    } catch (err) {
        console.warn('Error al consultar extracto bancario en la nube:', err);
        return null;
    }
};

/**
 * Descarga todos los extractos bancarios del curso escolar desde Supabase y los sincroniza en localStorage.
 */
export const fetchAllStatementsFromCloud = async (_startYear?: number): Promise<Record<string, MonthlyStatementData>> => {
    const results: Record<string, MonthlyStatementData> = {};
    try {
        const { data, error } = await supabase
            .from('bank_statements')
            .select('*');

        if (error || !data) return results;

        data.forEach((row: any) => {
            if (row.month_key && row.data) {
                const calculated = recalculateStatementTotals(row.data);
                results[row.month_key] = calculated;
                localStorage.setItem(`${STORAGE_KEY_PREFIX}${row.month_key}`, JSON.stringify(calculated));
            }
        });
        return results;
    } catch (err) {
        console.warn('Error al cargar extractos bancarios desde la nube:', err);
        return results;
    }
};

/**
 * Guarda o actualiza un extracto bancario en Supabase para que sea visible por Ruth y todos los usuarios.
 */
export const saveStatementToCloud = async (monthKey: string, data: MonthlyStatementData): Promise<void> => {
    try {
        const calculated = recalculateStatementTotals(data);
        const { error } = await supabase
            .from('bank_statements')
            .upsert({
                month_key: monthKey,
                file_name: calculated.fileName,
                uploaded_at: calculated.uploadedAt || new Date().toISOString(),
                account_iban: calculated.accountIban || null,
                period: calculated.period || null,
                total_income: calculated.totalIncome,
                total_expenses: calculated.totalExpenses,
                net_result: calculated.netResult,
                real_margin: calculated.realMargin,
                data: calculated,
                updated_at: new Date().toISOString()
            }, { onConflict: 'month_key' });

        if (error) {
            console.warn('Error al hacer upsert de bank_statement en Supabase:', error.message);
        }
    } catch (err) {
        console.warn('Error en saveStatementToCloud:', err);
    }
};

/**
 * Elimina el extracto bancario de Supabase.
 */
export const deleteStatementFromCloud = async (monthKey: string): Promise<void> => {
    try {
        const { error } = await supabase
            .from('bank_statements')
            .delete()
            .eq('month_key', monthKey);

        if (error) {
            console.warn('Error al borrar bank_statement en Supabase:', error.message);
        }
    } catch (err) {
        console.warn('Error en deleteStatementFromCloud:', err);
    }
};

// ============================================================================
// REGLAS PERSONALIZADAS DE CATEGORIZACIÓN
// ============================================================================

/**
 * Obtiene las reglas personalizadas de categorización guardadas por el usuario.
 */
export const getCustomRules = (): Record<string, FinancialCategory> => {
    try {
        const raw = localStorage.getItem(CUSTOM_RULES_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
};

/**
 * Guarda una regla de categorización personalizada.
 */
export const saveCustomRule = (keyword: string, category: FinancialCategory): void => {
    try {
        const rules = getCustomRules();
        rules[keyword.trim().toUpperCase()] = category;
        localStorage.setItem(CUSTOM_RULES_KEY, JSON.stringify(rules));
        
        // Sincronizar en la nube
        supabase.from('bank_custom_rules').upsert({
            keyword: keyword.trim().toUpperCase(),
            category,
            updated_at: new Date().toISOString()
        }, { onConflict: 'keyword' }).then(({ error }) => {
            if (error) console.warn('Error al guardar regla en Supabase:', error.message);
        });
    } catch (err) {
        console.error('Error al guardar regla personalizada:', err);
    }
};

/**
 * Actualiza la categoría de un movimiento individual y recalcula los totales.
 */
export const updateMovementCategory = (
    monthKey: string, 
    movementId: string, 
    newCategory: FinancialCategory,
    rememberKeyword?: string
): MonthlyStatementData | null => {
    const statement = getStatementForMonth(monthKey);
    if (!statement) return null;

    let updatedConcept = '';
    const updatedMovements = statement.movements.map(m => {
        if (m.id === movementId) {
            updatedConcept = m.concept;
            return {
                ...m,
                category: newCategory,
                isManualReclassified: true
            };
        }
        return m;
    });

    const updatedStatement: MonthlyStatementData = {
        ...statement,
        movements: updatedMovements
    };

    const finalized = recalculateStatementTotals(updatedStatement);
    saveStatementForMonth(monthKey, finalized);

    if (rememberKeyword || updatedConcept) {
        const kw = (rememberKeyword || updatedConcept).slice(0, 30);
        saveCustomRule(kw, newCategory);
    }

    return finalized;
};
