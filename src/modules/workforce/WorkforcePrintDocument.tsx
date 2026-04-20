import React from 'react';
import { format, parseISO, differenceInMinutes } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Therapist } from '../therapists/types';
import type { Attendance, MonthlyReportSignature } from './types';
import type { CenterSettings } from '../admin/types';
import logoUrl from '../../assets/logo.jpg';
import './WorkforcePrintDocument.css';

interface WorkforcePrintDocumentProps {
    month: string;
    therapist: Therapist;
    daysInMonth: Date[];
    getDailyData: (day: Date) => {
        workAtts: Attendance[];
        absenceAtt: Attendance | undefined;
        apptsCount: number;
    };
    centerSettings: CenterSettings | null;
    signature?: MonthlyReportSignature | null;
}

const WorkforcePrintDocument: React.FC<WorkforcePrintDocumentProps> = ({
    month,
    therapist,
    daysInMonth,
    getDailyData,
    centerSettings,
    signature
}) => {
    const clinicName = centerSettings?.name || 'Centro Proyecta';
    const clinicCif = centerSettings?.cif || '';
    const clinicAddress = centerSettings?.address || '';

    const parsedMonth = parseISO(`${month}-01`);
    const monthText = isNaN(parsedMonth.getTime()) 
        ? month.toUpperCase() 
        : format(parsedMonth, "MMMM 'de' yyyy", { locale: es }).toUpperCase();

    let totalWorkedMinutes = 0;
    let totalAppointments = 0;

    const rows = daysInMonth.map(day => {
        const { workAtts, absenceAtt, apptsCount } = getDailyData(day);
        totalAppointments += apptsCount;

        let status = workAtts.length > 0 ? 'Trabajado' : '---';
        let statusClass = '';
        if (absenceAtt) {
            status = absenceAtt.type === 'vacation' ? 'Vacaciones' : 'Baja Médica';
            statusClass = absenceAtt.type === 'vacation' ? 'status-vacation' : 'status-sick';
        }

        const entries = workAtts.map(att => att.startTime ? format(parseISO(att.startTime), 'HH:mm') : '').filter(Boolean);
        const exits = workAtts.map(att => att.endTime ? format(parseISO(att.endTime), 'HH:mm') : '').filter(Boolean);

        let dailyTotalMinutes = 0;
        workAtts.forEach(att => {
            if (att.startTime && att.endTime) {
                try {
                    const diff = differenceInMinutes(parseISO(att.endTime), parseISO(att.startTime));
                    dailyTotalMinutes += Math.max(0, diff);
                } catch (_e) {
                    // ignore
                }
            }
        });
        totalWorkedMinutes += dailyTotalMinutes;

        const h = Math.floor(dailyTotalMinutes / 60);
        const m = dailyTotalMinutes % 60;
        const totalStr = dailyTotalMinutes > 0 ? `${h}:${m.toString().padStart(2, '0')}` : '-';

        return {
            date: format(day, 'dd/MM/yyyy'),
            isWeekend: day.getDay() === 0 || day.getDay() === 6,
            status,
            statusClass,
            entries,
            exits,
            total: totalStr,
            appts: apptsCount,
            notes: workAtts.map(a => a.notes).filter(Boolean).join('; ')
        };
    });

    const totalHours = Math.floor(totalWorkedMinutes / 60);
    const totalRemainingMins = totalWorkedMinutes % 60;
    const totalWorkedString = `${totalHours}h ${totalRemainingMins > 0 ? `${totalRemainingMins}m` : ''}`;

    return (
        <div className="printable-document workforce-report-print">
            {/* Header */}
            <div className="report-header">
                <div className="header-left">
                    <img src={logoUrl} alt="Logo" className="report-logo" />
                    <div className="clinic-info">
                        <h2>{clinicName}</h2>
                        <p>CIF/NIF: {clinicCif}</p>
                        <p>{clinicAddress}</p>
                    </div>
                </div>
                <div className="header-right">
                    <h1>REGISTRO DE JORNADA</h1>
                    <p className="period-text">{monthText}</p>
                </div>
            </div>

            <hr className="divider" />

            {/* Info Section */}
            <section className="info-section">
                <div className="worker-details">
                    <h3>Datos del Trabajador:</h3>
                    <p><strong>Nombre:</strong> {therapist.fullName}</p>
                    <p><strong>DNI/NIE:</strong> {therapist.dni || '---'}</p>
                    <p><strong>Puesto:</strong> {therapist.specialty || 'Especialista'}</p>
                </div>
                <div className="summary-box">
                    <p className="summary-label">Resumen del Mes</p>
                    <p className="summary-total">{totalWorkedString}</p>
                    <p className="summary-sub">{totalAppointments} Citas Atendidas</p>
                </div>
            </section>

            {/* Table */}
            <table className="report-table">
                <thead>
                    <tr>
                        <th>Fecha</th>
                        <th>Estado</th>
                        <th>Entrada</th>
                        <th>Salida</th>
                        <th>Total</th>
                        <th>Citas</th>
                        <th>Notas</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, idx) => (
                        <tr key={idx} className={`${row.isWeekend ? 'weekend-row' : ''} ${row.statusClass}`}>
                            <td>{row.date}</td>
                            <td>{row.status}</td>
                            <td className="center-text">{row.entries.join(' / ') || '-'}</td>
                            <td className="center-text">{row.exits.join(' / ') || '-'}</td>
                            <td className="center-text bold-text">{row.total}</td>
                            <td className="center-text">{row.appts || '-'}</td>
                            <td className="notes-cell">{row.notes}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {/* Legal / Signatures */}
            <div className="report-footer">
                <div className="legal-declaration">
                    <h4>DECLARACIÓN LEGAL:</h4>
                    <p>{signature?.declaration || "El trabajador y la empresa dan su conformidad al presente registro diario de jornada a efectos de lo previsto en el Art. 34.9 del Estatuto de los Trabajadores. Mediante su firma, ambas partes reconocen y validan la veracidad de los datos contenidos en este documento respecto a las horas de inicio y finalización de la jornada laboral durante el mes referenciado."}</p>
                </div>

                <div className="signature-container">
                    <div className="signature-box employee-sig">
                        <div className="sig-line"></div>
                        <p className="sig-label">Firma del Trabajador</p>
                        <p className="sig-name">Fdo: {therapist.fullName}</p>
                        {signature?.signatureImage && (
                            <div className="sig-image-wrapper">
                                <img src={signature.signatureImage} alt="Firma" className="sig-image" />
                                <p className="sig-timestamp">Firmado digitalmente: {format(parseISO(signature.signedAt), 'dd/MM/yyyy HH:mm')}</p>
                            </div>
                        )}
                    </div>
                    <div className="signature-box company-sig">
                        <div className="sig-line"></div>
                        <p className="sig-label">Sello y Firma de la Empresa</p>
                        <p className="sig-name">{clinicName}</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default WorkforcePrintDocument;
