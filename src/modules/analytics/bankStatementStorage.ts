import { 
    type MonthlyStatementData, 
    type FinancialCategory,
    FINANCIAL_CATEGORIES 
} from './types';

const STORAGE_KEY_PREFIX = 'proyecta_bank_statement_';
const CUSTOM_RULES_KEY = 'proyecta_bank_custom_category_rules';

/**
 * Recalcula totales de ingresos, gastos, margen y desgloses por categoría.
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

    data.movements.forEach(m => {
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
        totalIncome,
        totalExpenses,
        netResult,
        realMargin,
        expensesByCategory,
        incomeByCategory
    };
};

/**
 * Obtiene los datos del extracto bancario de un mes específico (formato YYYY-MM).
 */
export const getStatementForMonth = (monthKey: string): MonthlyStatementData | null => {
    try {
        const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${monthKey}`);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return recalculateStatementTotals(parsed);
    } catch (err) {
        console.error('Error al cargar extracto bancario:', err);
        return null;
    }
};

/**
 * Guarda los datos de un extracto bancario para un mes determinado.
 */
export const saveStatementForMonth = (monthKey: string, data: MonthlyStatementData): void => {
    try {
        const calculated = recalculateStatementTotals(data);
        localStorage.setItem(`${STORAGE_KEY_PREFIX}${monthKey}`, JSON.stringify(calculated));
    } catch (err) {
        console.error('Error al guardar extracto bancario:', err);
    }
};

/**
 * Elimina el extracto bancario de un mes determinado.
 */
export const deleteStatementForMonth = (monthKey: string): void => {
    try {
        localStorage.removeItem(`${STORAGE_KEY_PREFIX}${monthKey}`);
    } catch (err) {
        console.error('Error al eliminar extracto bancario:', err);
    }
};

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
 * Guarda una regla de categorización personalizada (ej. 'INVERSIONES CABILDO' -> 'ALQUILER_LOCAL').
 */
export const saveCustomRule = (keyword: string, category: FinancialCategory): void => {
    try {
        const rules = getCustomRules();
        rules[keyword.trim().toUpperCase()] = category;
        localStorage.setItem(CUSTOM_RULES_KEY, JSON.stringify(rules));
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
