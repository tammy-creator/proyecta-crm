import React from 'react';
import { format, differenceInMinutes, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Therapist } from '../therapists/types';
import type { Attendance } from './types';
import type { CenterSettings } from '../admin/types';
import logo from '../../assets/logo.jpg';

interface PrintableWorkforceReportProps {
    month: string;
    therapist: Therapist | undefined;
    daysInMonth: Date[];
    getDailyData: (day: Date) => {
        workAtt: Attendance | undefined;
        absenceAtt: Attendance | undefined;
        apptsCount: number;
    };
    centerSettings: CenterSettings | null;
}

const PrintableWorkforceReport: React.FC<PrintableWorkforceReportProps> = ({
    month,
    therapist,
    daysInMonth,
    getDailyData,
    centerSettings
}) => {
    if (!therapist) return null;

    // Calculamos los totales del mes para mostrar en el resumen
    let totalWorkedMinutes = 0;
    let totalAppointments = 0;
    
    daysInMonth.forEach(day => {
        const { workAtt, apptsCount } = getDailyData(day);
        totalAppointments += apptsCount;
        
        if (workAtt?.startTime && workAtt?.endTime) {
            const mins = differenceInMinutes(parseISO(workAtt.endTime), parseISO(workAtt.startTime));
            totalWorkedMinutes += mins;
        }
    });

    const totalHours = Math.floor(totalWorkedMinutes / 60);
    const totalRemainingMins = totalWorkedMinutes % 60;
    const totalWorkedString = `${totalHours} horas ${totalRemainingMins > 0 ? `y ${totalRemainingMins} min` : ''}`;

    const parsedMonth = parseISO(`${month}-01`);

    const clinicName = centerSettings?.name || 'Centro Proyecta';
    const clinicCif = centerSettings?.cif || '';
    const clinicAddress = centerSettings?.address || '';

    return (
        <div className="printable-workforce-report" style={{ 
            fontFamily: 'Arial, sans-serif',
            color: '#000',
            maxWidth: '1000px',
            margin: '0 auto',
            padding: '30px 20px 20px 20px'
        }}>
            {/* Cabecera con Logo y Datos de Empresa */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '30px', borderBottom: '2px solid #333', paddingBottom: '15px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '60%' }}>
                    <div style={{ width: '180px', height: 'auto', display: 'flex', alignItems: 'center' }}>
                        <img src={logo} alt="Proyecta Logo" style={{ width: '100%', height: 'auto', objectFit: 'contain' }} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', paddingLeft: '5px' }}>
                        <h1 style={{ fontSize: '18px', fontWeight: 'bold', margin: '0 0 2px 0', color: '#333' }}>{clinicName}</h1>
                        {clinicCif && <p style={{ margin: '0', fontSize: '11px', color: '#555' }}><strong>CIF/NIF:</strong> {clinicCif}</p>}
                        {clinicAddress && <p style={{ margin: '0', fontSize: '11px', color: '#555' }}><strong>Dirección:</strong> {clinicAddress}</p>}
                    </div>
                </div>
                <div style={{ textAlign: 'right', marginTop: '10px' }}>
                    <h2 style={{ fontSize: '24px', fontWeight: '900', margin: '0 0 5px 0', color: '#000', textTransform: 'uppercase', letterSpacing: '1px' }}>Registro de Jornada</h2>
                    <h3 style={{ fontSize: '18px', color: '#666', margin: '0', fontWeight: 'bold' }}>{format(parsedMonth, "MMMM 'de' yyyy", { locale: es }).toUpperCase()}</h3>
                </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '25px', padding: '0 5px' }}>
                <div>
                    <p style={{ margin: '4px 0', fontSize: '14px' }}><strong>Trabajador:</strong> {therapist.fullName}</p>
                    <p style={{ margin: '4px 0', fontSize: '14px' }}><strong>DNI/NIE:</strong> {therapist.dni || 'No especificado'}</p>
                    <p style={{ margin: '4px 0', fontSize: '14px' }}><strong>Puesto:</strong> {therapist.specialty || 'Especialista'}</p>
                </div>
                <div style={{ textAlign: 'right', backgroundColor: '#f9f9f9', padding: '15px', borderRadius: '8px', border: '1px solid #eee' }}>
                    <p style={{ margin: '0 0 5px 0', fontSize: '14px', color: '#666' }}>Resumen del Mes</p>
                    <p style={{ margin: '5px 0', fontSize: '18px', fontWeight: 'bold' }}>{totalWorkedString}</p>
                    <p style={{ margin: '0', fontSize: '14px' }}>{totalAppointments} Citas Atendidas</p>
                </div>
            </div>

            <table style={{ 
                width: '100%', 
                borderCollapse: 'collapse', 
                marginBottom: '40px',
                fontSize: '12px'
            }}>
                <thead>
                    <tr style={{ backgroundColor: '#f0f0f0', borderBottom: '2px solid #333' }}>
                        <th style={{ padding: '10px 5px', textAlign: 'left', border: '1px solid #ddd' }}>Fecha</th>
                        <th style={{ padding: '10px 5px', textAlign: 'left', border: '1px solid #ddd' }}>Estado</th>
                        <th style={{ padding: '10px 5px', textAlign: 'center', border: '1px solid #ddd' }}>Entrada</th>
                        <th style={{ padding: '10px 5px', textAlign: 'center', border: '1px solid #ddd' }}>Salida</th>
                        <th style={{ padding: '10px 5px', textAlign: 'center', border: '1px solid #ddd' }}>Total Horas</th>
                        <th style={{ padding: '10px 5px', textAlign: 'center', border: '1px solid #ddd' }}>Citas</th>
                        <th style={{ padding: '10px 5px', textAlign: 'left', border: '1px solid #ddd', width: '25%' }}>Notas</th>
                    </tr>
                </thead>
                <tbody>
                    {daysInMonth.map((day, idx) => {
                        const { workAtt, absenceAtt, apptsCount } = getDailyData(day);
                        const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                        
                        let status = workAtt ? 'Trabajado' : '---';
                        let rowBg = isWeekend ? '#fafafa' : '#fff';
                        
                        if (absenceAtt) {
                            status = absenceAtt.type === 'vacation' ? 'Vacaciones' : 'Baja Médica';
                            rowBg = absenceAtt.type === 'vacation' ? '#fff3cd' : '#f8d7da';
                        }

                        const start = workAtt ? format(parseISO(workAtt.startTime), 'HH:mm') : '-';
                        const end = workAtt?.endTime ? format(parseISO(workAtt.endTime), 'HH:mm') : '-';
                        
                        let dailyTotal = '-';
                        if (workAtt?.startTime && workAtt?.endTime) {
                            const mins = differenceInMinutes(parseISO(workAtt.endTime), parseISO(workAtt.startTime));
                            const hours = Math.floor(mins / 60);
                            const remainingMins = mins % 60;
                            dailyTotal = `${hours}:${remainingMins.toString().padStart(2, '0')}`;
                        }

                        // Alternate row styling for readability if not weekend/holiday
                        if (!isWeekend && !absenceAtt && idx % 2 === 0) {
                            rowBg = '#fcfcfc';
                        }

                        return (
                            <tr key={day.toISOString()} style={{ backgroundColor: rowBg, borderBottom: '1px solid #eee' }}>
                                <td style={{ padding: '8px 5px', border: '1px solid #ddd' }}>{format(day, 'dd/MM/yyyy')}</td>
                                <td style={{ padding: '8px 5px', border: '1px solid #ddd', fontWeight: absenceAtt ? 'bold' : 'normal' }}>{status}</td>
                                <td style={{ padding: '8px 5px', border: '1px solid #ddd', textAlign: 'center' }}>{start}</td>
                                <td style={{ padding: '8px 5px', border: '1px solid #ddd', textAlign: 'center' }}>{end}</td>
                                <td style={{ padding: '8px 5px', border: '1px solid #ddd', textAlign: 'center', fontWeight: 'bold' }}>{dailyTotal}</td>
                                <td style={{ padding: '8px 5px', border: '1px solid #ddd', textAlign: 'center', color: apptsCount === 0 ? '#aaa' : '#000' }}>
                                    {apptsCount > 0 ? apptsCount : '-'}
                                </td>
                                <td style={{ padding: '8px 5px', border: '1px solid #ddd', fontStyle: 'italic', color: '#555' }}>{workAtt?.notes || ''}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>

            <div style={{ marginTop: '40px', fontSize: '11px', color: '#555', textAlign: 'justify', lineHeight: '1.4' }}>
                <p><strong>DECLARACIÓN LEGAL:</strong> El trabajador y la empresa dan su conformidad al presente registro diario de jornada a efectos de lo previsto en el Art. 34.9 del Estatuto de los Trabajadores. Mediante su firma, ambas partes reconocen y validan la veracidad de los datos contenidos en este documento respecto a las horas de inicio y finalización de la jornada laboral durante el mes referenciado.</p>
                <p>El presente documento se conservará a disposición del empleado, de la representación legal de los trabajadores y de la Inspección de Trabajo y Seguridad Social durante un periodo mínimo de cuatro años, cumpliendo con las exigencias legales vigentes en materia de registro horario.</p>
            </div>

            <div style={{ 
                display: 'flex', 
                justifyContent: 'space-around', 
                marginTop: '80px',
                pageBreakInside: 'avoid'
            }}>
                <div style={{ width: '40%', textAlign: 'center' }}>
                    <div style={{ borderBottom: '1px solid #000', marginBottom: '10px', height: '50px' }}></div>
                    <p style={{ margin: '0', fontWeight: 'bold' }}>Firma del Trabajador</p>
                    <p style={{ margin: '5px 0 0 0', fontSize: '12px' }}>Fdo: {therapist.fullName}</p>
                </div>
                <div style={{ width: '40%', textAlign: 'center' }}>
                    <div style={{ borderBottom: '1px solid #000', marginBottom: '10px', height: '50px' }}></div>
                    <p style={{ margin: '0', fontWeight: 'bold' }}>Sello y Firma de la Empresa</p>
                    <p style={{ margin: '5px 0 0 0', fontSize: '12px' }}>Centro Médico Proyecta</p>
                </div>
            </div>
        </div>
    );
};

export default PrintableWorkforceReport;
