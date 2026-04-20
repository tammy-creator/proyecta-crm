import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format, differenceInMinutes, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Therapist } from '../modules/therapists/types';
import type { Attendance, MonthlyReportSignature } from '../modules/workforce/types';
import type { CenterSettings } from '../modules/admin/types';
import logoUrl from '../assets/logo.jpg';

// Helper for safe date formatting
const safeFormat = (dateStr: string | undefined | null, formatStr: string): string => {
    if (!dateStr) return '';
    try {
        const parsed = parseISO(dateStr);
        if (isNaN(parsed.getTime())) return '';
        return format(parsed, formatStr, { locale: es });
    } catch (e) {
        console.warn("Error formatting date in PDF [v1.8]:", dateStr, e);
        return '';
    }
};

const getBase64ImageFromUrl = async (imageUrl: string): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(img, 0, 0);
                const dataUrl = canvas.toDataURL('image/jpeg');
                resolve(dataUrl);
            } else {
                reject(new Error("Could not get 2d context"));
            }
        };
        img.onerror = (error) => reject(error);
        img.src = imageUrl;
    });
};

interface GeneratePDFParams {
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

export const generateDetailedReportPDF = async (params: GeneratePDFParams): Promise<jsPDF> => {
    const { month, therapist, daysInMonth, getDailyData, centerSettings, signature } = params;
    console.log("Generating FULL PDF [v1.8] for:", therapist.fullName, month);

    const doc = new jsPDF('p', 'pt', 'a4'); 
    const pageWidth = doc.internal.pageSize.getWidth();

    // 1. Load Logo
    let logoBase64 = null;
    try {
        logoBase64 = await getBase64ImageFromUrl(logoUrl);
    } catch (e) {
        console.warn("Could not load logo for PDF [v1.8]", e);
    }

    // Colors
    const primaryColor = '#333333';
    const secondaryColor = '#666666';

    let yPos = 40;

    // --- Header ---
    if (logoBase64) {
        doc.addImage(logoBase64, 'JPEG', 40, yPos, 120, 40);
    }
    
    const clinicName = centerSettings?.name || 'Centro Proyecta';
    const clinicCif = centerSettings?.cif || '';
    const clinicAddress = centerSettings?.address || '';

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(primaryColor);
    doc.text(clinicName, 40, yPos + 60);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(secondaryColor);
    if (clinicCif) doc.text(`CIF/NIF: ${clinicCif}`, 40, yPos + 75);
    if (clinicAddress) doc.text(`Dirección: ${clinicAddress}`, 40, yPos + 90);

    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(primaryColor);
    doc.text('REGISTRO DE JORNADA', pageWidth - 40, yPos + 20, { align: 'right' });
    
    doc.setFontSize(14);
    const parsedMonth = parseISO(`${month}-01`);
    const monthText = isNaN(parsedMonth.getTime()) ? month.toUpperCase() : format(parsedMonth, "MMMM 'de' yyyy", { locale: es }).toUpperCase();
    doc.text(monthText, pageWidth - 40, yPos + 40, { align: 'right' });
    
    yPos += 110;
    doc.setDrawColor(200, 200, 200);
    doc.line(40, yPos, pageWidth - 40, yPos);
    yPos += 20;

    // --- Therapist Info ---
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Datos del Trabajador:', 40, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(`Nombre: ${therapist.fullName}`, 40, yPos + 15);
    doc.text(`DNI/NIE: ${therapist.dni || 'No especificado'}`, 40, yPos + 30);
    doc.text(`Puesto: ${therapist.specialty || 'Especialista'}`, 40, yPos + 45);

    let totalWorkedMinutes = 0;
    let totalAppointments = 0;
    
    const tableData: any[][] = [];
    
    daysInMonth.forEach((day) => {
        const { workAtts, absenceAtt, apptsCount } = getDailyData(day);
        totalAppointments += apptsCount;
        
        let status = workAtts.length > 0 ? 'Trabajado' : '---';
        if (absenceAtt) {
            status = absenceAtt.type === 'vacation' ? 'Vacaciones' : 'Baja Médica';
        }

        const entries = workAtts.map(att => safeFormat(att.startTime, 'HH:mm')).filter(Boolean).join('\n');
        const exits = workAtts.map(att => att.endTime ? safeFormat(att.endTime, 'HH:mm') : '-').filter(Boolean).join('\n');

        let dailyTotalMinutes = 0;
        workAtts.forEach(att => {
            if (att.startTime && att.endTime) {
                try {
                    const diff = differenceInMinutes(parseISO(att.endTime), parseISO(att.startTime));
                    dailyTotalMinutes += Math.max(0, diff);
                } catch (_e) {
                    // ignore formatting errors
                }
            }
        });
        
        totalWorkedMinutes += dailyTotalMinutes;
        
        let dailyTotalStr = '-';
        if (dailyTotalMinutes > 0) {
            const h = Math.floor(dailyTotalMinutes / 60);
            const m = dailyTotalMinutes % 60;
            dailyTotalStr = `${h}:${m.toString().padStart(2, '0')}`;
        }

        tableData.push([
            format(day, 'dd/MM/yyyy'),
            status,
            entries || '-',
            exits || '-',
            dailyTotalStr,
            apptsCount > 0 ? apptsCount.toString() : '-',
            workAtts.map(a => a.notes).filter(Boolean).join('; ') || ''
        ]);
    });

    const totalHours = Math.floor(totalWorkedMinutes / 60);
    const totalRemainingMins = totalWorkedMinutes % 60;
    const totalWorkedString = `${totalHours}h ${totalRemainingMins > 0 ? `${totalRemainingMins}m` : ''}`;

    doc.setFillColor(245, 245, 245);
    doc.roundedRect(pageWidth - 200, yPos - 10, 160, 65, 4, 4, 'F');
    doc.setFontSize(10);
    doc.text('Resumen del Mes', pageWidth - 120, yPos + 5, { align: 'center' });
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(26, 95, 122);
    doc.text(totalWorkedString, pageWidth - 120, yPos + 25, { align: 'center' });
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(secondaryColor);
    doc.text(`${totalAppointments} Citas Atendidas`, pageWidth - 120, yPos + 40, { align: 'center' });

    yPos += 70;

    autoTable(doc, {
        startY: yPos,
        head: [['Fecha', 'Estado', 'Entrada', 'Salida', 'Total', 'Citas', 'Notas']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [26, 95, 122], fontSize: 9 },
        bodyStyles: { fontSize: 8, textColor: [31, 41, 55] },
        columnStyles: {
            0: { cellWidth: 55 },
            1: { cellWidth: 65 },
            2: { cellWidth: 45, halign: 'center' },
            3: { cellWidth: 45, halign: 'center' },
            4: { cellWidth: 45, halign: 'center', fontStyle: 'bold' },
            5: { cellWidth: 35, halign: 'center' },
            6: { cellWidth: 'auto' }
        },
        willDrawCell: function(data) {
            if (data.row.section === 'body') {
                const rawData = data.row.raw as any[];
                const dateParts = rawData[0].split('/');
                if (dateParts.length === 3) {
                    const dayDate = new Date(Number(dateParts[2]), Number(dateParts[1]) - 1, Number(dateParts[0]));
                    if (dayDate.getDay() === 0 || dayDate.getDay() === 6) {
                        doc.setFillColor(250, 250, 250);
                    }
                }
                const status = rawData[1];
                if (status === 'Vacaciones') {
                    doc.setFillColor(255, 243, 205);
                } else if (status === 'Baja Médica') {
                    doc.setFillColor(248, 215, 218);
                }
            }
        }
    });

    // @ts-expect-error the jspdf-autotable plugin adds this property
    yPos = (doc.lastAutoTable?.finalY || 400) + 30;

    if (yPos > 650) {
        doc.addPage();
        yPos = 40;
    }

    doc.setFontSize(8);
    doc.setTextColor(secondaryColor);
    const declText = signature?.declaration || "El trabajador y la empresa dan su conformidad al presente registro diario de jornada a efectos de lo previsto en el Art. 34.9 del Estatuto de los Trabajadores. Mediante su firma, ambas partes reconocen y validan la veracidad de los datos contenidos en este documento respecto a las horas de inicio y finalización de la jornada laboral durante el mes referenciado.";
    
    doc.text("DECLARACIÓN LEGAL:", 40, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(declText, 40, yPos + 15, { maxWidth: pageWidth - 80 });

    yPos += 50;

    const sigBoxesY = yPos;
    doc.setDrawColor(0);
    doc.line(80, sigBoxesY + 50, 250, sigBoxesY + 50);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(primaryColor);
    doc.text('Firma del Trabajador', 165, sigBoxesY + 65, { align: 'center' });
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`Fdo: ${therapist.fullName}`, 165, sigBoxesY + 75, { align: 'center' });

    if (signature && signature.signatureImage) {
        try {
            const sigDate = safeFormat(signature.signedAt, 'dd/MM/yyyy HH:mm');
            doc.addImage(signature.signatureImage, 'PNG', 115, sigBoxesY - 10, 100, 50);
            if (sigDate) {
                doc.setFontSize(6);
                doc.setTextColor(0, 128, 0);
                doc.text(`Firmado digitalmente: ${sigDate}`, 165, sigBoxesY + 85, { align: 'center' });
            }
        } catch (e) {
            console.error("Error drawing signature image in PDF:", e);
        }
    }

    doc.setDrawColor(0);
    doc.line(pageWidth - 250, sigBoxesY + 50, pageWidth - 80, sigBoxesY + 50);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(primaryColor);
    doc.text('Sello y Firma de la Empresa', pageWidth - 165, sigBoxesY + 65, { align: 'center' });
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(clinicName, pageWidth - 165, sigBoxesY + 75, { align: 'center' });

    console.log("PDF generated successfully [v1.8]");
    return doc;
};
