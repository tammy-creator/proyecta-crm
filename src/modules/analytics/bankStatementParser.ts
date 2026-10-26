import * as XLSX from 'xlsx';
import { 
    type BankStatementMovement, 
    type MonthlyStatementData, 
    type FinancialCategory
} from './types';
import { getCustomRules, recalculateStatementTotals } from './bankStatementStorage';
import { type Patient } from '../patients/types';

/**
 * Normaliza una cadena quitando tildes y caracteres especiales para comparaciones seguras.
 */
const normalizeText = (text: string): string => {
    return (text || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .trim();
};

/**
 * Parsea un importe en formato numérico o string español/inglés a número flotante.
 */
const parseAmount = (val: any): number => {
    if (typeof val === 'number') {
        return isNaN(val) ? 0 : val;
    }
    if (!val) return 0;

    let str = String(val).trim();
    // Quitar símbolo de moneda y espacios
    str = str.replace(/€|EUR|eur|\s/g, '');

    // Formato español: 1.250,50 o -1.130,23
    if (str.includes(',') && str.includes('.')) {
        // Asumimos punto para miles y coma para decimales
        str = str.replace(/\./g, '').replace(',', '.');
    } else if (str.includes(',')) {
        // Solo coma para decimales: 1250,50
        str = str.replace(',', '.');
    }

    const parsed = parseFloat(str);
    return isNaN(parsed) ? 0 : parsed;
};

/**
 * Convierte un valor de fecha (Excel serial number o string DD/MM/YYYY o YYYY-MM-DD) a string YYYY-MM-DD.
 */
const parseDateToISO = (val: any): string => {
    if (!val) return '';

    // Si es número de serie de Excel (días desde 1900)
    if (typeof val === 'number') {
        try {
            const dateObj = new Date(Math.round((val - 25569) * 86400 * 1000));
            if (!isNaN(dateObj.getTime())) {
                return dateObj.toISOString().split('T')[0];
            }
        } catch {
            // Continúa a parseo por string
        }
    }

    const str = String(val).trim();

    // Formato DD/MM/YYYY o DD-MM-YYYY
    const dmyMatch = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
    if (dmyMatch) {
        const day = dmyMatch[1].padStart(2, '0');
        const month = dmyMatch[2].padStart(2, '0');
        const year = dmyMatch[3];
        return `${year}-${month}-${day}`;
    }

    // Formato YYYY-MM-DD
    const ymdMatch = str.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
    if (ymdMatch) {
        const year = ymdMatch[1];
        const month = ymdMatch[2].padStart(2, '0');
        const day = ymdMatch[3].padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    return '';
};

/**
 * Categoriza automáticamente un movimiento según reglas, palabras clave y cruce con pacientes.
 */
export const categorizeMovement = (
    concept: string,
    operationType: string,
    amount: number,
    patients: Patient[] = [],
    customRules: Record<string, FinancialCategory> = {}
): { category: FinancialCategory; matchedPatientName?: string; matchedPatientId?: string } => {
    const normConcept = normalizeText(concept);
    const normOpType = normalizeText(operationType);
    const fullText = `${normConcept} ${normOpType}`;

    // 1. Reglas personalizadas memorizadas por el usuario
    for (const [kw, cat] of Object.entries(customRules)) {
        if (fullText.includes(normalizeText(kw))) {
            return { category: cat };
        }
    }

    // 2. Cruce con Pacientes del CRM (para ingresos y transferencias de familias)
    if (amount > 0 && patients.length > 0) {
        for (const p of patients) {
            const fullName = `${p.firstName || ''} ${p.lastName || ''}`.trim();
            const pNameNorm = normalizeText(fullName);
            // Si el nombre completo del paciente tiene al menos 4 caracteres y aparece en el concepto
            if (pNameNorm.length >= 4 && normConcept.includes(pNameNorm)) {
                return {
                    category: 'INGRESOS_PACIENTES',
                    matchedPatientName: fullName,
                    matchedPatientId: p.id
                };
            }
            // Si tiene nombre de tutor/contacto
            const tutorFullName = p.tutorName || (p.tutor1 ? `${p.tutor1.firstName || ''} ${p.tutor1.lastName || ''}`.trim() : '');
            if (tutorFullName) {
                const cNameNorm = normalizeText(tutorFullName);
                if (cNameNorm.length >= 4 && normConcept.includes(cNameNorm)) {
                    return {
                        category: 'INGRESOS_PACIENTES',
                        matchedPatientName: `${fullName} (Tutor: ${tutorFullName})`,
                        matchedPatientId: p.id
                    };
                }
            }
        }
    }

    // 3. Reglas de Ingresos
    if (amount > 0) {
        if (
            fullText.includes('LIQ') || 
            fullText.includes('TPV') || 
            fullText.includes('REDELCOM') || 
            fullText.includes('REDSYS') || 
            fullText.includes('SERVIRED') ||
            fullText.includes('ABONO TPV') ||
            fullText.includes('COMERCIOS')
        ) {
            return { category: 'LIQUIDACION_TPV' };
        }

        if (
            fullText.includes('BECA') || 
            fullText.includes('MINISTERIO DE EDUCACION') || 
            fullText.includes('CONSEJERIA') || 
            fullText.includes('NEAE') ||
            fullText.includes('SUBVENCION')
        ) {
            return { category: 'BECAS_SUBVENCIONES' };
        }

        if (
            fullText.includes('TRANSFERENCIA') || 
            fullText.includes('SESION') || 
            fullText.includes('TERAPIA') || 
            fullText.includes('BIZUM') || 
            fullText.includes('MENSUALIDAD') ||
            fullText.includes('CUOTA') ||
            normOpType.includes('TRANSFERENCIA')
        ) {
            return { category: 'INGRESOS_PACIENTES' };
        }

        return { category: 'OTROS_INGRESOS' };
    }

    // 4. Reglas de Gastos (amount < 0)
    // Nóminas y Terapeutas
    if (
        fullText.includes('NOMINA') || 
        fullText.includes('TGSS') || 
        fullText.includes('SEGURIDAD SOCIAL') || 
        fullText.includes('SEG. SOCIAL') || 
        fullText.includes('RETRIBUCION') || 
        fullText.includes('PAGA EXTRA') || 
        fullText.includes('LIQUIDACION HABERES') || 
        fullText.includes('SALARIO') ||
        fullText.includes('MUTUA')
    ) {
        return { category: 'NOMINAS_EQUIPO' };
    }

    // Alquiler y Local (ej. Inversiones Cabildo Principado, S.L.)
    if (
        fullText.includes('INVERSIONES CABILDO') || 
        fullText.includes('ALQUILER') || 
        fullText.includes('ARRENDAMIENTO') || 
        fullText.includes('COMUNIDAD PROPIETARIOS') || 
        fullText.includes('COMUNIDAD PROP') || 
        fullText.includes('RENTA LOCAL')
    ) {
        return { category: 'ALQUILER_LOCAL' };
    }

    // Suministros (Luz, Agua, Gas)
    if (
        fullText.includes('IBERDROLA') || 
        fullText.includes('ENDESA') || 
        fullText.includes('NATURGY') || 
        fullText.includes('TOTALENERGIES') || 
        fullText.includes('AGUAS') || 
        fullText.includes('CANAL DE ISABEL') || 
        fullText.includes('SUMINISTRO') || 
        fullText.includes('GAS NATURAL')
    ) {
        return { category: 'SUMINISTROS' };
    }

    // Comunicaciones
    if (
        fullText.includes('TELEFONICA') || 
        fullText.includes('MOVISTAR') || 
        fullText.includes('VODAFONE') || 
        fullText.includes('ORANGE') || 
        fullText.includes('MASMOVIL') || 
        fullText.includes('YOIGO') || 
        fullText.includes('DIGI') || 
        fullText.includes('TELEFONO') || 
        normOpType.includes('TELEFONO')
    ) {
        return { category: 'COMUNICACIONES' };
    }

    // Seguros
    if (
        fullText.includes('OCASO') || 
        fullText.includes('PREVISION MALLORQUINA') || 
        fullText.includes('PREVISION') || 
        fullText.includes('MAPFRE') || 
        fullText.includes('AXA') || 
        fullText.includes('ALLIANZ') || 
        fullText.includes('SANITAS') || 
        fullText.includes('ADESLAS') || 
        fullText.includes('SEGUROS') || 
        fullText.includes('REASEGUROS') ||
        normOpType.includes('SEGUROS')
    ) {
        return { category: 'SEGUROS' };
    }

    // Financiación / Amortizaciones
    if (
        fullText.includes('AMORTIZACION') || 
        fullText.includes('DEUDA') || 
        fullText.includes('PRESTAMO') || 
        fullText.includes('CREDITO') || 
        fullText.includes('LEASING') || 
        fullText.includes('RENTING') || 
        fullText.includes('HIPOTECA')
    ) {
        return { category: 'FINANCIERO_PRESTAMOS' };
    }

    // Comisiones Bancarias
    if (
        fullText.includes('COMISION') || 
        fullText.includes('MANTENIMIENTO CUENTA') || 
        fullText.includes('GASTOS CORREO') || 
        fullText.includes('GASTOS CUSTODIA') || 
        fullText.includes('TARIFA PLANA')
    ) {
        return { category: 'COMISIONES_BANCARIAS' };
    }

    // Software y Servicios
    if (
        fullText.includes('GOOGLE') || 
        fullText.includes('MICROSOFT') || 
        fullText.includes('OPENAI') || 
        fullText.includes('CHATGPT') || 
        fullText.includes('HOSTING') || 
        fullText.includes('VAPI') || 
        fullText.includes('CANVA') || 
        fullText.includes('ZOOM') || 
        fullText.includes('DROPBOX') || 
        fullText.includes('ASESORIA') || 
        fullText.includes('GESTORIA') || 
        fullText.includes('NOTARIA')
    ) {
        return { category: 'SOFTWARE_SERVICIOS' };
    }

    // Material y Mantenimiento
    if (
        fullText.includes('AMAZON') || 
        fullText.includes('IKEA') || 
        fullText.includes('LEROY') || 
        fullText.includes('BRICOMART') || 
        fullText.includes('PAPELERIA') || 
        fullText.includes('LIMPIEZA') || 
        fullText.includes('FARMACIA') || 
        fullText.includes('MATERIAL')
    ) {
        return { category: 'MATERIAL_MANTENIMIENTO' };
    }

    // Impuestos y Tasas
    if (
        fullText.includes('AGENCIA TRIBUTARIA') || 
        fullText.includes('AEAT') || 
        fullText.includes('MODELO 111') || 
        fullText.includes('MODELO 115') || 
        fullText.includes('MODELO 303') || 
        fullText.includes('MODELO 200') || 
        fullText.includes('TRIBUTOS') || 
        fullText.includes('AYUNTAMIENTO') || 
        fullText.includes('IBI')
    ) {
        return { category: 'IMPUESTOS_TASAS' };
    }

    return { category: 'OTROS_GASTOS' };
};

/**
 * Parsea un archivo Excel o CSV de extracto bancario y devuelve la estructura completa.
 */
export const parseBankStatementFile = async (
    file: File,
    monthKey: string,
    patients: Patient[] = []
): Promise<MonthlyStatementData> => {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });

    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
        throw new Error('El archivo no contiene ninguna hoja de cálculo.');
    }

    const worksheet = workbook.Sheets[firstSheetName];
    const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

    if (!rows || rows.length === 0) {
        throw new Error('El extracto bancario está vacío.');
    }

    // 1. Detectar metadatos en las primeras filas (IBAN, periodo)
    let accountIban: string | undefined;
    let detectedPeriod: string | undefined;

    for (let i = 0; i < Math.min(10, rows.length); i++) {
        const rowStr = rows[i].map(c => String(c)).join(' ');
        const ibanMatch = rowStr.match(/ES\d{2}[0-9A-Z\s]{18,24}/i);
        if (ibanMatch && !accountIban) {
            accountIban = ibanMatch[0].replace(/\s/g, '').toUpperCase();
        }
        if (rowStr.toUpperCase().includes('PERIODO') && !detectedPeriod) {
            detectedPeriod = rowStr.replace(/^.*PERIODO[:\s]*/i, '').trim();
        }
    }

    // 2. Encontrar la fila de cabeceras de la tabla
    let headerRowIdx = -1;
    let colMap: Record<string, number> = {};

    for (let r = 0; r < Math.min(15, rows.length); r++) {
        const row = rows[r].map(c => normalizeText(String(c)));
        
        const hasDate = row.some(c => c.includes('FECHA') || c.includes('F. VALOR') || c.includes('F. CONTABLE') || c.includes('F. OPERACION'));
        const hasConcept = row.some(c => c.includes('DESCRIPCION') || c.includes('CONCEPTO') || c.includes('MOVIMIENTO') || c.includes('DETALLE'));
        const hasAmount = row.some(c => c.includes('IMPORTE') || c.includes('CANTIDAD') || (c.includes('CARGO') && row.some(x => x.includes('ABONO'))));

        if ((hasDate && hasConcept) || (hasConcept && hasAmount)) {
            headerRowIdx = r;
            
            // Mapear columnas
            row.forEach((colName, cIdx) => {
                if (colName.includes('F. OPERACION') || colName.includes('F. OPERACIÓN')) colMap.opDate = cIdx;
                else if (colName.includes('F. CONTABLE')) colMap.accDate = cIdx;
                else if (colName.includes('F. VALOR')) colMap.valDate = cIdx;
                else if (colName.includes('FECHA')) {
                    if (colMap.opDate === undefined) colMap.opDate = cIdx;
                }

                if (colName.includes('DESCRIPCION') || colName.includes('CONCEPTO') || colName.includes('MOVIMIENTO') || colName.includes('DETALLE')) {
                    colMap.concept = cIdx;
                }

                if (colName.includes('TIPO OPERACION') || colName.includes('TIPO')) {
                    colMap.opType = cIdx;
                }

                if (colName.includes('REFERENCIA') || colName.includes('REF')) {
                    colMap.ref = cIdx;
                }

                if (colName.includes('IMPORTE') || colName.includes('CANTIDAD')) {
                    colMap.amount = cIdx;
                }

                if (colName.includes('CARGO') || colName.includes('DEBE')) {
                    colMap.debit = cIdx;
                }
                if (colName.includes('ABONO') || colName.includes('HABER')) {
                    colMap.credit = cIdx;
                }

                if (colName.includes('SALDO')) {
                    colMap.balance = cIdx;
                }

                if (colName.includes('DIVISA') || colName.includes('MONEDA')) {
                    colMap.currency = cIdx;
                }
            });

            break;
        }
    }

    if (headerRowIdx === -1 || (colMap.concept === undefined && colMap.amount === undefined)) {
        throw new Error('No se ha podido identificar la estructura de columnas del extracto. Comprueba que contenga cabeceras como Fecha, Descripción e Importe.');
    }

    const customRules = getCustomRules();
    const movements: BankStatementMovement[] = [];

    // 3. Procesar filas de movimientos
    for (let r = headerRowIdx + 1; r < rows.length; r++) {
        const row = rows[r];
        if (!row || row.length === 0) continue;

        const concept = colMap.concept !== undefined ? String(row[colMap.concept] || '').trim() : '';
        if (!concept) continue; // Fila vacía o sin concepto

        // Descartar posibles filas de pie de tabla / resumen
        const normC = normalizeText(concept);
        if (normC.startsWith('TOTAL') || normC.startsWith('SALDO FINAL') || normC.startsWith('RESUMEN')) {
            continue;
        }

        // Importe
        let amount = 0;
        if (colMap.amount !== undefined) {
            amount = parseAmount(row[colMap.amount]);
        } else if (colMap.debit !== undefined || colMap.credit !== undefined) {
            const debit = colMap.debit !== undefined ? parseAmount(row[colMap.debit]) : 0;
            const credit = colMap.credit !== undefined ? parseAmount(row[colMap.credit]) : 0;
            amount = credit > 0 ? credit : -Math.abs(debit);
        }

        if (amount === 0) continue; // Si no hay importe no es un movimiento válido

        // Fechas
        const opDateRaw = colMap.opDate !== undefined ? row[colMap.opDate] : undefined;
        const valDateRaw = colMap.valDate !== undefined ? row[colMap.valDate] : undefined;
        const accDateRaw = colMap.accDate !== undefined ? row[colMap.accDate] : undefined;

        const date = parseDateToISO(opDateRaw) || parseDateToISO(accDateRaw) || parseDateToISO(valDateRaw) || `${monthKey}-01`;
        const valueDate = parseDateToISO(valDateRaw);
        const operationDate = parseDateToISO(opDateRaw);

        // Tipo de operación y Referencia
        const operationType = colMap.opType !== undefined ? String(row[colMap.opType] || '').trim() : '';
        const reference = colMap.ref !== undefined ? String(row[colMap.ref] || '').trim() : '';
        const balance = colMap.balance !== undefined ? parseAmount(row[colMap.balance]) : undefined;
        const currency = colMap.currency !== undefined ? String(row[colMap.currency] || '').trim() : 'EUR';

        // Categorización
        const { category, matchedPatientName, matchedPatientId } = categorizeMovement(
            concept,
            operationType,
            amount,
            patients,
            customRules
        );

        movements.push({
            id: `mov_${r}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            date,
            valueDate,
            operationDate,
            operationType,
            concept,
            reference,
            amount,
            balance,
            currency,
            category,
            matchedPatientName,
            matchedPatientId
        });
    }

    if (movements.length === 0) {
        throw new Error('No se han encontrado transacciones válidas en el extracto.');
    }

    // 4. Estructurar datos mensuales y calcular métricas agregadas
    const rawData: MonthlyStatementData = {
        monthKey,
        fileName: file.name,
        uploadedAt: new Date().toISOString(),
        accountIban,
        period: detectedPeriod,
        movements,
        totalIncome: 0,
        totalExpenses: 0,
        netResult: 0,
        realMargin: 0,
        expensesByCategory: {} as any,
        incomeByCategory: {} as any
    };

    return recalculateStatementTotals(rawData);
};
