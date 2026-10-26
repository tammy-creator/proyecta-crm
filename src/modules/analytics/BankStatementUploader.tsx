import React, { useRef, useState } from 'react';
import { 
    UploadCloud, 
    FileSpreadsheet, 
    RefreshCw, 
    Trash2, 
    Eye, 
    Building2,
    ShieldCheck
} from 'lucide-react';
import { type MonthlyStatementData } from './types';
import { parseBankStatementFile, type ParseResult } from './bankStatementParser';
import { type Patient } from '../patients/types';
import { useToast } from '../../hooks/useToast';

interface BankStatementUploaderProps {
    monthKey: string; // YYYY-MM
    monthLabel: string;
    statement: MonthlyStatementData | null;
    patients: Patient[];
    onStatementLoaded: (result: ParseResult) => void;
    onDeleteStatement: () => void;
    onOpenMovements: () => void;
}

export const BankStatementUploader: React.FC<BankStatementUploaderProps> = ({
    monthKey,
    monthLabel,
    statement,
    patients,
    onStatementLoaded,
    onDeleteStatement,
    onOpenMovements
}) => {
    const { showToast } = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);

    const handleFile = async (file: File) => {
        if (!file) return;

        const validExts = ['.xlsx', '.xls', '.csv'];
        const fileName = file.name.toLowerCase();
        const isValid = validExts.some(ext => fileName.endsWith(ext));

        if (!isValid) {
            showToast('Formato no compatible. Por favor sube un archivo Excel (.xlsx, .xls) o .csv', 'error');
            return;
        }

        try {
            setIsProcessing(true);
            showToast(`Analizando extracto bancario...`, 'info');
            const result = await parseBankStatementFile(file, monthKey, patients);
            onStatementLoaded(result);

            if (result.monthsDetected.length > 1) {
                showToast(`¡Extracto cargado! Se han organizado movimientos para ${result.monthsDetected.join(', ')}.`, 'success');
            } else {
                showToast(`¡Extracto procesado con éxito! Se han analizado ${result.currentStatement.movements.length} movimientos.`, 'success');
            }
        } catch (err: any) {
            console.error('Error al procesar extracto bancario:', err);
            showToast(err.message || 'Error al procesar el archivo. Comprueba que el formato sea correcto.', 'error');
        } finally {
            setIsProcessing(false);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    const onDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFile(e.dataTransfer.files[0]);
        }
    };

    const onDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const onDragLeave = () => {
        setIsDragging(false);
    };

    // Caso 1: Ya existe un extracto cargado para este mes
    if (statement && statement.movements.length > 0) {
        return (
            <div 
                style={{ 
                    background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)', 
                    borderRadius: 16, 
                    border: '1px solid #e2e8f0', 
                    padding: '1.25rem 1.5rem',
                    marginBottom: '2rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '1rem',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
                }}
            >
                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                    accept=".xlsx,.xls,.csv"
                    style={{ display: 'none' }}
                />

                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ padding: 12, borderRadius: 14, background: '#ecfdf5', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <FileSpreadsheet size={26} />
                    </div>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: '0.95rem', fontWeight: 800, color: '#1e293b' }}>
                                Extracto bancario de {monthLabel} activo
                            </span>
                            <span style={{ background: '#dcfce7', color: '#15803d', fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 6 }}>
                                Verificado
                            </span>
                        </div>
                        <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                            <strong style={{ color: '#475569' }}>{statement.fileName}</strong> · {statement.movements.length} movimientos en este mes
                            {statement.accountIban && ` · IBAN: ${statement.accountIban}`}
                        </p>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                    <button
                        className="btn-secondary"
                        onClick={onOpenMovements}
                        style={{ padding: '0.55rem 1rem', fontSize: '0.8rem', gap: 6 }}
                    >
                        <Eye size={15} /> Ver Movimientos ({statement.movements.length})
                    </button>

                    <button
                        className="btn-secondary"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isProcessing}
                        style={{ padding: '0.55rem 0.9rem', fontSize: '0.8rem', gap: 6 }}
                        title="Cargar o actualizar extracto"
                    >
                        <RefreshCw size={14} className={isProcessing ? 'animate-spin' : ''} /> Actualizar Extracto
                    </button>

                    <button
                        onClick={() => {
                            if (window.confirm(`¿Estás seguro de eliminar el extracto bancario de ${monthLabel}?`)) {
                                onDeleteStatement();
                            }
                        }}
                        style={{ 
                            background: '#fee2e2', 
                            color: '#ef4444', 
                            border: 'none', 
                            borderRadius: 10, 
                            padding: '0.55rem 0.75rem', 
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            fontSize: '0.8rem',
                            fontWeight: 600
                        }}
                        title="Eliminar extracto de este mes"
                    >
                        <Trash2 size={15} />
                    </button>
                </div>
            </div>
        );
    }

    // Caso 2: No hay extracto subido para este mes (Zona de Subida)
    return (
        <div
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onClick={() => fileInputRef.current?.click()}
            style={{
                background: isDragging ? '#eff6ff' : '#ffffff',
                border: isDragging ? '2px dashed #3b82f6' : '2px dashed #cbd5e1',
                borderRadius: 16,
                padding: '2rem 1.5rem',
                marginBottom: '2rem',
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                position: 'relative'
            }}
        >
            <input
                type="file"
                ref={fileInputRef}
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                accept=".xlsx,.xls,.csv"
                style={{ display: 'none' }}
            />

            <div style={{ maxWidth: '560px', margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <div style={{ 
                    width: 52, 
                    height: 52, 
                    borderRadius: 16, 
                    background: isDragging ? '#dbeafe' : '#f1f5f9', 
                    color: '#3b82f6', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    marginBottom: 4
                }}>
                    <UploadCloud size={28} />
                </div>

                <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#1e293b', margin: 0 }}>
                    Subir extracto bancario de {monthLabel}
                </h3>

                <p style={{ fontSize: '0.82rem', color: '#64748b', margin: 0, lineHeight: 1.5 }}>
                    Arrastra aquí tu archivo Excel (<strong>.xlsx</strong>, <strong>.xls</strong>) o <strong>.csv</strong> descargado de tu banco (Abanca, BBVA, Santander, etc.), o haz clic para seleccionarlo.
                </p>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', color: '#10b981', fontWeight: 600 }}>
                        <ShieldCheck size={14} /> Análisis 100% privado en tu navegador
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>
                        <Building2 size={14} /> Detecta nóminas, alquiler, suministros y pacientes
                    </span>
                </div>
            </div>
        </div>
    );
};

export default BankStatementUploader;
