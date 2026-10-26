export type FinancialCategoryGroup = 'INCOME' | 'EXPENSE';

export type FinancialCategory =
    // Ingresos
    | 'INGRESOS_PACIENTES'
    | 'LIQUIDACION_TPV'
    | 'BECAS_SUBVENCIONES'
    | 'OTROS_INGRESOS'
    // Gastos
    | 'NOMINAS_EQUIPO'
    | 'ALQUILER_LOCAL'
    | 'SUMINISTROS'
    | 'COMUNICACIONES'
    | 'SEGUROS'
    | 'FINANCIERO_PRESTAMOS'
    | 'COMISIONES_BANCARIAS'
    | 'SOFTWARE_SERVICIOS'
    | 'MATERIAL_MANTENIMIENTO'
    | 'IMPUESTOS_TASAS'
    | 'OTROS_GASTOS';

export interface CategoryMeta {
    label: string;
    group: FinancialCategoryGroup;
    color: string;
    description: string;
}

export const FINANCIAL_CATEGORIES: Record<FinancialCategory, CategoryMeta> = {
    INGRESOS_PACIENTES: {
        label: 'Ingresos Pacientes',
        group: 'INCOME',
        color: '#10b981',
        description: 'Transferencias y cobros de sesiones de familias y pacientes'
    },
    LIQUIDACION_TPV: {
        label: 'Liquidación TPV / Datáfono',
        group: 'INCOME',
        color: '#06b6d4',
        description: 'Abonos periódicos de datáfono / tarjeta del banco'
    },
    BECAS_SUBVENCIONES: {
        label: 'Becas y Ayudas',
        group: 'INCOME',
        color: '#3b82f6',
        description: 'Becas MEC, ayudas públicas y subvenciones'
    },
    OTROS_INGRESOS: {
        label: 'Otros Ingresos',
        group: 'INCOME',
        color: '#84cc16',
        description: 'Intereses, devoluciones u otros abonos'
    },
    NOMINAS_EQUIPO: {
        label: 'Nóminas y Terapeutas',
        group: 'EXPENSE',
        color: '#6366f1',
        description: 'Transferencias a profesionales, nóminas y retribuciones'
    },
    ALQUILER_LOCAL: {
        label: 'Alquiler y Centro',
        group: 'EXPENSE',
        color: '#f59e0b',
        description: 'Renta del local, comunidad de propietarios e instalaciones'
    },
    SUMINISTROS: {
        label: 'Suministros (Luz, Agua, Gas)',
        group: 'EXPENSE',
        color: '#eab308',
        description: 'Facturas de electricidad, agua y gas del centro'
    },
    COMUNICACIONES: {
        label: 'Teléfono e Internet',
        group: 'EXPENSE',
        color: '#14b8a6',
        description: 'Telefonía fija, móvil y fibra óptica'
    },
    SEGUROS: {
        label: 'Seguros y Mutuas',
        group: 'EXPENSE',
        color: '#8b5cf6',
        description: 'Responsabilidad civil, seguros de salud y coberturas'
    },
    FINANCIERO_PRESTAMOS: {
        label: 'Préstamos y Amortizaciones',
        group: 'EXPENSE',
        color: '#ec4899',
        description: 'Amortización de deudas, créditos y préstamos'
    },
    COMISIONES_BANCARIAS: {
        label: 'Comisiones Bancarias',
        group: 'EXPENSE',
        color: '#64748b',
        description: 'Mantenimiento de cuenta, TPV y transferencias'
    },
    SOFTWARE_SERVICIOS: {
        label: 'Software y Suscripciones',
        group: 'EXPENSE',
        color: '#38bdf8',
        description: 'Google Workspace, telefonía VoIP, hosting, asesoría/gestoría'
    },
    MATERIAL_MANTENIMIENTO: {
        label: 'Material y Limpieza',
        group: 'EXPENSE',
        color: '#a855f7',
        description: 'Material terapéutico, papelería, compras clínica y limpieza'
    },
    IMPUESTOS_TASAS: {
        label: 'Impuestos y Tasas',
        group: 'EXPENSE',
        color: '#f43f5e',
        description: 'Hacienda (AEAT), modelos tributarios y tasas municipales'
    },
    OTROS_GASTOS: {
        label: 'Otros Gastos',
        group: 'EXPENSE',
        color: '#94a3b8',
        description: 'Gastos diversos no categorizados'
    }
};

export interface BankStatementMovement {
    id: string;
    date: string; // YYYY-MM-DD
    valueDate?: string; // YYYY-MM-DD
    operationDate?: string; // YYYY-MM-DD
    operationType?: string;
    concept: string;
    reference?: string;
    amount: number; // Positivo = Ingreso, Negativo = Gasto
    balance?: number;
    currency?: string;
    category: FinancialCategory;
    matchedPatientId?: string;
    matchedPatientName?: string;
    isManualReclassified?: boolean;
}

export interface MonthlyStatementData {
    monthKey: string; // YYYY-MM
    fileName: string;
    uploadedAt: string; // ISO date
    accountIban?: string;
    period?: string;
    movements: BankStatementMovement[];
    totalIncome: number;
    totalExpenses: number;
    netResult: number;
    realMargin: number; // Porcentaje de margen sobre ingresos (netResult / totalIncome * 100)
    expensesByCategory: Record<FinancialCategory, number>;
    incomeByCategory: Record<FinancialCategory, number>;
}
