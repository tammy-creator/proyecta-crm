import jsPDF from 'jspdf';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Patient } from '../modules/patients/types';
import logoUrl from '../assets/logo.jpg';

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
                resolve(canvas.toDataURL('image/jpeg'));
            } else {
                reject(new Error("Could not get 2d context"));
            }
        };
        img.onerror = (error) => reject(error);
        img.src = imageUrl;
    });
};

const drawHeader = (doc: jsPDF, title: string, subtitle: string = '', logoBase64: string | null) => {
    const pageWidth = doc.internal.pageSize.getWidth();
    let currentY = 40;

    if (logoBase64) {
        doc.addImage(logoBase64, 'JPEG', (pageWidth - 80) / 2, currentY, 80, 26, 'logo', 'FAST');
        currentY += 40;
    }

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(44, 62, 80);
    doc.text(title, pageWidth / 2, currentY, { align: 'center' });
    currentY += 15;

    if (subtitle) {
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(100, 116, 139);
        doc.text(subtitle, pageWidth / 2, currentY, { align: 'center' });
        currentY += 15;
    }

    return currentY + 10;
};

// const drawFooter = (doc: jsPDF) => {
//     // Optional footer
// };

const calculateAge = (birthDate?: string | null): string => {
    if (!birthDate) return '';
    try {
        const today = new Date();
        const birth = parseISO(birthDate);
        let age = today.getFullYear() - birth.getFullYear();
        const m = today.getMonth() - birth.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
            age--;
        }
        return age.toString();
    } catch {
        return '';
    }
};

const formatDate = (dateStr?: string | null): string => {
    if (!dateStr) return '';
    try {
        return format(parseISO(dateStr), 'dd/MM/yyyy', { locale: es });
    } catch {
        return dateStr;
    }
};

const printJustifiedText = (doc: jsPDF, text: string, x: number, startY: number, maxWidth: number, lineHeight: number): number => {
    doc.setFont('helvetica', 'normal');
    const lines = doc.splitTextToSize(text, maxWidth);
    doc.text(lines, x, startY);
    return startY + (lines.length * lineHeight);
};

const ensureBase64 = async (signature: string | null): Promise<string | null> => {
    if (!signature) return null;
    if (signature.startsWith('data:image/')) {
        return signature;
    }
    try {
        return await getBase64ImageFromUrl(signature);
    } catch (e) {
        console.error("Error al convertir la URL de la firma a Base64:", e, signature);
        return null;
    }
};

export const generateConsentSheetPDF = async (
    patient: Patient,
    extraFields: Record<string, string>,
    tutorSignature: string | null,
    tutor2Signature: string | null,
    _therapistSignature: string | null
): Promise<jsPDF> => {
    const doc = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4', compress: true });
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 50;
    const contentWidth = pageWidth - (margin * 2);

    let logoBase64 = null;
    try {
        logoBase64 = await getBase64ImageFromUrl(logoUrl);
    } catch (e) {
        console.warn("Could not load logo", e);
    }

    const tutor1SigBase64 = await ensureBase64(tutorSignature);
    const tutor2SigBase64 = await ensureBase64(tutor2Signature);

    const age = extraFields['age'] || calculateAge(patient.birthDate);
    const today = new Date();
    const day = extraFields['contract_day'] || today.getDate().toString();
    const monthNames = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
    const month = extraFields['contract_month'] || monthNames[today.getMonth()];
    const yearStr = today.getFullYear().toString();

    // ----------------------------------------------------
    // PAGE 1: FICHA DE INSCRIPCIÓN (DATOS)
    // ----------------------------------------------------
    let y = drawHeader(doc, 'FICHA DE INSCRIPCIÓN', '', logoBase64);

    doc.setFontSize(11);
    doc.setTextColor(41, 128, 185); // #2980b9
    doc.setFont('helvetica', 'bold');
    doc.text('DATOS DEL ALUMNO/A', margin, y);
    doc.setDrawColor(52, 152, 219);
    doc.line(margin, y + 2, margin + 140, y + 2);
    y += 20;

    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.text('NOMBRE:', margin, y); doc.setFont('helvetica', 'normal'); doc.text(patient.firstName || '', margin + 60, y);
    doc.setFont('helvetica', 'bold');
    doc.text('APELLIDOS:', margin + 200, y); doc.setFont('helvetica', 'normal'); doc.text(patient.lastName || '', margin + 270, y);
    y += 15;

    doc.setFont('helvetica', 'bold');
    doc.text('EDAD:', margin, y); doc.setFont('helvetica', 'normal'); doc.text(age, margin + 40, y);
    doc.setFont('helvetica', 'bold');
    doc.text('FECHA DE NACIMIENTO:', margin + 200, y); doc.setFont('helvetica', 'normal'); doc.text(formatDate(patient.birthDate), margin + 330, y);
    y += 15;

    doc.setFont('helvetica', 'bold');
    doc.text('DOMICILIO:', margin, y); doc.setFont('helvetica', 'normal'); doc.text(patient.address || '', margin + 65, y);
    y += 15;

    const colegio = extraFields['school_name'] || patient.schooling || '';
    doc.setFont('helvetica', 'bold');
    doc.text('COLEGIO:', margin, y); doc.setFont('helvetica', 'normal'); doc.text(colegio, margin + 60, y);
    y += 15;

    const etapa = extraFields['school_stage'] || patient.schooling || '';
    doc.setFont('helvetica', 'bold');
    doc.text('ETAPA DE ESCOLARIZACIÓN:', margin, y); doc.setFont('helvetica', 'normal'); doc.text(etapa, margin + 160, y);
    y += 30;

    // DATOS FAMILIARES
    doc.setFontSize(11);
    doc.setTextColor(41, 128, 185);
    doc.setFont('helvetica', 'bold');
    doc.text('DATOS FAMILIARES', margin, y);
    doc.setDrawColor(52, 152, 219);
    doc.line(margin, y + 2, margin + 120, y + 2);
    y += 20;

    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'italic');
    doc.text('Padre / Madre / Tutor 1', margin, y);
    y += 15;

    doc.setFont('helvetica', 'bold');
    doc.text('NOMBRE:', margin, y); doc.setFont('helvetica', 'normal'); doc.text(patient.tutor1?.firstName || '', margin + 60, y);
    doc.setFont('helvetica', 'bold');
    doc.text('APELLIDOS:', margin + 200, y); doc.setFont('helvetica', 'normal'); doc.text(patient.tutor1?.lastName || '', margin + 270, y);
    y += 15;

    doc.setFont('helvetica', 'bold');
    doc.text('DNI:', margin, y); doc.setFont('helvetica', 'normal'); doc.text(patient.tutor1?.dni || '', margin + 30, y);
    doc.setFont('helvetica', 'bold');
    doc.text('PROFESIÓN:', margin + 200, y); doc.setFont('helvetica', 'normal'); doc.text(patient.tutor1?.job || '', margin + 270, y);
    y += 15;

    doc.setFont('helvetica', 'bold');
    doc.text('TELÉFONOS DE CONTACTO:', margin, y); doc.setFont('helvetica', 'normal'); doc.text(patient.tutor1?.phone || '', margin + 160, y);
    y += 25;

    doc.setFont('helvetica', 'italic');
    doc.text('Padre / Madre / Tutor 2', margin, y);
    y += 15;

    doc.setFont('helvetica', 'bold');
    doc.text('NOMBRE:', margin, y); doc.setFont('helvetica', 'normal'); doc.text(patient.tutor2?.firstName || '', margin + 60, y);
    doc.setFont('helvetica', 'bold');
    doc.text('APELLIDOS:', margin + 200, y); doc.setFont('helvetica', 'normal'); doc.text(patient.tutor2?.lastName || '', margin + 270, y);
    y += 15;

    doc.setFont('helvetica', 'bold');
    doc.text('DNI:', margin, y); doc.setFont('helvetica', 'normal'); doc.text(patient.tutor2?.dni || '', margin + 30, y);
    doc.setFont('helvetica', 'bold');
    doc.text('PROFESIÓN:', margin + 200, y); doc.setFont('helvetica', 'normal'); doc.text(patient.tutor2?.job || '', margin + 270, y);
    y += 15;

    doc.setFont('helvetica', 'bold');
    doc.text('TELÉFONOS DE CONTACTO:', margin, y); doc.setFont('helvetica', 'normal'); doc.text(patient.tutor2?.phone || '', margin + 160, y);
    y += 30;

    // DATOS DE INTERÉS
    doc.setFontSize(11);
    doc.setTextColor(41, 128, 185);
    doc.setFont('helvetica', 'bold');
    doc.text('DATOS DE INTERÉS', margin, y);
    doc.setDrawColor(52, 152, 219);
    doc.line(margin, y + 2, margin + 115, y + 2);
    y += 20;

    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.text('¿Presenta alguna alergia y/o intolerancia alimenticia?', margin, y);
    y += 15;
    const alergias = extraFields['allergies_detail'] || patient.allergies || '';
    doc.setFont('helvetica', 'italic');
    y = printJustifiedText(doc, alergias, margin, y, contentWidth, 14);
    y += 10;

    doc.setFont('helvetica', 'bold');
    doc.text('¿CÓMO NOS CONOCISTE?', margin, y);
    y += 15;
    const referente = extraFields['referral_detail'] || patient.referralSource || '';
    doc.setFont('helvetica', 'italic');
    printJustifiedText(doc, referente, margin, y, contentWidth, 14);

    // ----------------------------------------------------
    // PAGE 2: RGPD Y FIRMAS
    // ----------------------------------------------------
    doc.addPage();
    y = 50;

    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);

    let text = "En cumplimiento de lo establecido en el Reglamento General de Protección de Datos (RGPD) (UE) 2016/679 y en la Ley Orgánica 3/2018, de 5 de diciembre, de Protección de Datos de Carácter Personal y Garantía de los Derechos Digitales (LOPD y GDD), le informamos de que los datos de carácter personal facilitados por usted, así como los que se generen durante su relación con nuestra entidad, serán objeto de tratamiento con la finalidad de prestarle el servicio solicitado, realizar la gestión administrativa derivada de nuestra relación contractual, así como enviarle a través de WhatsApp, avisos y recordatorios relacionados con las citas concertadas. Si prefiere no recibir estos avisos por WhatsApp, podrá comunicarlo al centro en cualquier momento y se utilizará otro medio de contacto. Solo serán solicitados aquellos datos estrictamente necesarios para gestionar las finalidades descritas, pudiendo ser necesario recoger datos de contacto de terceros, tales como representantes legales, tutores, o personas a cargo designadas por los mismos.";
    y = printJustifiedText(doc, text, margin, y, contentWidth, 12) + 10;

    text = "La legitimación del tratamiento de sus datos, con carácter general, será en base a un vínculo contractual, interés legítimo u obligación legal. Sin embargo, el RGPD obliga a obtener el consentimiento expreso en algunos casos, como los que se especifican en este documento. Los datos proporcionados se conservarán mientras se mantenga la relación contractual, o durante el tiempo necesario para cumplir con las obligaciones legales. Todos los datos recogidos cuentan con el compromiso de confidencialidad, con las medidas de seguridad establecidas legalmente, y bajo ningún concepto son cedidos o tratados por terceras personas, físicas o jurídicas, sin el previo consentimiento del cliente, tutor o representante legal, salvo en aquellos casos en que sea necesario para el desarrollo, cumplimiento y control de la relación entidad-cliente o en los supuestos en que lo autorice una norma con rango de ley.";
    y = printJustifiedText(doc, text, margin, y, contentWidth, 12) + 10;

    text = "Asimismo, le informamos de la posibilidad de ejercer los siguientes derechos sobre sus datos personales: derecho de acceso, rectificación, supresión u olvido, limitación, oposición, portabilidad y a retirar el consentimiento prestado. Para ello podrá enviar un email a centroproyectagijon@gmail.com, o bien dirigir un escrito a Centro Infantil Proyecta, S.L. en C/ Alonso Ojeda, 14, Bajo Izq. - 33208 - Gijón - ASTURIAS, identificándose adecuadamente. Además, puede dirigirse a la Autoridad de Control en materia de Protección de Datos (AEPD, en España) para obtener información adicional o presentar una reclamación y/o contactar con nuestro Delegado de Protección de datos (ExpertosLOPD S.L.), en Calle Juan Flórez, 146, 15005, A Coruña o email: dpdcentroproyecta@gmail.com.";
    y = printJustifiedText(doc, text, margin, y, contentWidth, 12) + 10;

    text = "En base a lo indicado en párrafos anteriores, el cliente autoriza expresamente a Centro Infantil Proyecta, S.L., a través de la firma de este documento, al tratamiento de sus datos teniendo en cuenta que algunos de los datos tratados están categorizados como de especial protección.";
    y = printJustifiedText(doc, text, margin, y, contentWidth, 12) + 15;

    doc.setFont('helvetica', 'bold');
    doc.text("Datos identificativos del responsable:", margin, y);
    y += 12;
    doc.setFont('helvetica', 'normal');
    doc.text("Centro Infantil Proyecta, S.L., B01758515, C/ Alonso Ojeda, 14, Bajo Izq. - 33208 - Gijón - ASTURIAS, 647 257 447", margin, y);
    y += 25;

    // Checkbox
    doc.setDrawColor(16, 185, 129); // #10b981
    doc.setFillColor(236, 253, 245);
    doc.rect(margin, y - 10, 12, 12, 'FD');
    doc.setTextColor(16, 185, 129);
    doc.setFont('helvetica', 'bold');
    doc.text("X", margin + 3, y - 1);
    doc.text("He leído y acepto las condiciones de tratamiento y protección de datos.", margin + 20, y);
    y += 40;

    // Signature boxes
    const sigBoxWidth = (contentWidth - 20) / 2;

    // Firma 1
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(margin, y, sigBoxWidth, 150, 8, 8, 'FD');

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text("Firma 1:", margin + 10, y + 20);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(`D./Dª.- ${patient.tutor1?.firstName || ''} ${patient.tutor1?.lastName || ''}`, margin + 10, y + 40);
    doc.text(`DNI.- ${patient.tutor1?.dni || '..........................'}`, margin + 10, y + 55);
    doc.text(`En Gijón, a ${day} de ${month} de ${yearStr}`, margin + 10, y + 70);

    if (tutor1SigBase64) {
        try {
            doc.addImage(tutor1SigBase64, 'PNG', margin + 20, y + 80, sigBoxWidth - 40, 60, 'tutor1Sig', 'FAST');
        } catch (e) {
            console.error(e);
        }
    }

    // Firma 2
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(margin + sigBoxWidth + 20, y, sigBoxWidth, 150, 8, 8, 'FD');

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text("Firma 2:", margin + sigBoxWidth + 30, y + 20);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(`D./Dª.- ${patient.tutor2?.firstName || '..........................'} ${patient.tutor2?.lastName || ''}`, margin + sigBoxWidth + 30, y + 40);
    doc.text(`DNI.- ${patient.tutor2?.dni || '..........................'}`, margin + sigBoxWidth + 30, y + 55);
    doc.text(`En Gijón, a ${day} de ${month} de ${yearStr}`, margin + sigBoxWidth + 30, y + 70);

    if (tutor2SigBase64) {
        try {
            doc.addImage(tutor2SigBase64, 'PNG', margin + sigBoxWidth + 50, y + 80, sigBoxWidth - 40, 60, 'tutor2Sig', 'FAST');
        } catch (e) {
            console.error(e);
        }
    }

    // ----------------------------------------------------
    // PAGE 3: CONSENTIMIENTO INFORMADO
    // ----------------------------------------------------
    doc.addPage();
    y = drawHeader(doc, 'CONSENTIMIENTO INFORMADO', '', logoBase64);

    doc.setFontSize(10);
    doc.setTextColor(51, 65, 85);

    text = "En cumplimiento de lo establecido en el Reglamento General de Protección de Datos (RGPD) (UE) 2016/679 y en la Ley Orgánica 3/2018, de 5 de diciembre, de Protección de Datos de Carácter Personal y Garantía de los Derechos Digitales (LOPD y GDD), le informamos de que los datos de carácter personal por usted facilitados, relativos a sus hijos o tutelados, así como los que se generen durante su relación o la de los menores con nuestra entidad, serán objeto de tratamiento con la finalidad de prestarle el servicio solicitado, realizar la gestión administrativa derivada de nuestra relación contractual así como enviarle a través de WhatsApp, avisos y recordatorios relacionados con las citas concertadas. Si prefiere no recibir estos avisos por WhatsApp, podrá comunicarlo al centro en cualquier momento y se utilizará otro medio de contacto. Solo serán solicitados aquellos datos estrictamente necesarios para gestionar las finalidades descritas, pudiendo ser necesario recoger datos de contacto de terceros, tales como representantes legales, tutores, o personas a cargo designadas por los mismos.";
    y = printJustifiedText(doc, text, margin, y, contentWidth, 14) + 10;

    text = "Como obliga el RGPD, la legitimación del tratamiento de los datos personales de menores será en base al consentimiento de sus padres o tutores. Los datos proporcionados se conservarán mientras se mantenga la relación comercial, o durante el tiempo necesario para cumplir con las obligaciones legales. Todos los datos recogidos cuentan con el compromiso de estricta confidencialidad, y con las medidas de seguridad establecidas legalmente. Bajo ningún concepto serán cedidos o tratados por terceras personas, físicas o jurídicas, sin el previo consentimiento del tutor o representante legal, salvo en aquellos casos en que sea necesario para el desarrollo, cumplimiento y control de la relación entidad-cliente y prestación de servicios derivada de la misma o en los supuestos en que lo autorice una norma con rango de ley. En este sentido, sus datos podrán ser cedidos, sin carácter limitativo o excluyente, a la Administración Tributaria, organismos de las Seguridad Social o entidades sanitarias, entidades financieras (para cobro de los servicios) o gestoría administrativa (para la realización de la contabilidad y declaración de impuestos).";
    y = printJustifiedText(doc, text, margin, y, contentWidth, 14) + 10;

    text = "Asimismo, le informamos de la posibilidad de ejercer los siguientes derechos sobre sus datos personales y/o los de sus hijos o tutelados: derecho de acceso, rectificación, supresión u olvido, limitación, oposición, portabilidad y a retirar el consentimiento prestado. Para ello podrá enviar un email a centroproyectagijon@gmail.com, o bien dirigir un escrito a Centro Infantil Proyecta, S.L., en C/ Alonso Ojeda, 14, Bajo Izq. - 33208 - Gijón - ASTURIAS, identificándose adecuadamente. Además, el interesado puede dirigirse a la Autoridad de Control en materia de Protección de Datos competente (AEPD, en España) para obtener información adicional o presentar una reclamación y/o contactar con nuestro Delegado de Protección de datos (ExpertosLOPD S.L.), en Calle Juan Flórez, 146, 15005, A Coruña o email: dpdcentroproyecta@gmail.com.";
    y = printJustifiedText(doc, text, margin, y, contentWidth, 14) + 10;

    text = "En base a lo indicado en párrafos anteriores, el padre, madre o tutor/a legal del menor autoriza expresamente a Centro Infantil Proyecta, S.L. al tratamiento de datos de sus hijos o tutelados teniendo en cuenta que algunos de los datos tratados están categorizados como de especial protección.";
    y = printJustifiedText(doc, text, margin, y, contentWidth, 14) + 30;

    // Signature box
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(margin, y, contentWidth, 150, 8, 8, 'FD');

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text("Firma del Padre, Madre o Tutor/a Legal:", margin + 15, y + 20);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(`D./Dª.- ${patient.tutor1?.firstName || ''} ${patient.tutor1?.lastName || ''}`, margin + 15, y + 40);
    doc.text(`DNI.- ${patient.tutor1?.dni || '..........................'}`, margin + 15, y + 55);
    doc.text(`En Gijón, a ${day} de ${month} de ${yearStr}`, margin + 15, y + 70);

    if (tutor1SigBase64) {
        try {
            doc.addImage(tutor1SigBase64, 'PNG', margin + 150, y + 30, 200, 100, 'tutor1Sig', 'FAST');
        } catch (e) { }
    }


    // ----------------------------------------------------
    // PAGE 4: DERECHO DE INFORMACIÓN
    // ----------------------------------------------------
    doc.addPage();
    y = drawHeader(doc, 'DERECHO DE INFORMACIÓN', '(COPIA PARA LA FAMILIA)', logoBase64);

    doc.setFillColor(241, 245, 249);
    doc.roundedRect(margin, y, contentWidth, 80, 4, 4, 'F');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.text("Datos del responsable del tratamiento:", margin + 15, y + 20);
    doc.setFont('helvetica', 'normal');
    doc.text("Centro Infantil Proyecta, S.L.\nB01758515\nC/ Alonso Ojeda, 14, Bajo Izq. - 33208 - Gijón - ASTURIAS\n647 257 447", margin + 15, y + 35);
    y += 100;

    doc.setTextColor(51, 65, 85);
    text = "En cumplimiento de lo establecido en el Reglamento General de Protección de Datos (RGPD) (UE) 2016/679 y en la Ley Orgánica 3/2018, de 5 de diciembre, de Protección de Datos de Carácter Personal y Garantía de los Derechos Digitales (LOPD y GDD), le informamos que sus datos serán incorporados en nuestro sistema de tratamiento con la finalidad de prestarle el servicio solicitado, realizar la gestión administrativa derivada de nuestra relación contractual, así como enviarle a través de WhatsApp, avisos y recordatorios relacionados con las citas concertadas. Si prefiere no recibir estos avisos por WhatsApp, podrá comunicarlo al centro en cualquier momento y se utilizará otro medio de contacto. Solo serán solicitados aquellos datos que sean pertinentes, necesarios, adecuados y no excesivos, pudiendo ser necesario recoger datos de contacto de terceros, tales como representantes legales, tutores, o personas a cargo designadas por los mismos.";
    y = printJustifiedText(doc, text, margin, y, contentWidth, 14) + 10;

    text = "La legitimación del tratamiento de sus datos, con carácter general, será en base a un vínculo contractual, consentimiento, interés legítimo u obligación legal. Los datos proporcionados se conservarán mientras se mantenga la relación contractual, o durante el tiempo necesario para cumplir con las obligaciones legales. Los datos no se cederán a terceros salvo en los casos en que exista una obligación legal, o sea necesario para la ejecución de un contrato.";
    y = printJustifiedText(doc, text, margin, y, contentWidth, 14) + 10;

    text = "Asimismo, le informamos de la posibilidad de ejercer los siguientes derechos sobre sus datos personales: derecho de acceso, rectificación, supresión u olvido, limitación, oposición, portabilidad y a retirar el consentimiento prestado. Para ello podrá enviar un email a centroproyectagijon@gmail.com, o bien dirigir un escrito a Centro Infantil Proyecta, S.L., en C/ Alonso Ojeda, 14, Bajo Izq. - 33208 - Gijón - ASTURIAS, identificándose adecuadamente. Además, puede dirigirse a la Autoridad de Control en materia de Protección de Datos competente (AEPD, en España) para obtener información adicional o presentar una reclamación y/o contactar con nuestro Delegado de Protección de datos (ExpertosLOPD S.L.), en Calle Juan Flórez, 146, 15005, A Coruña o email: dpdcentroproyecta@gmail.com";
    y = printJustifiedText(doc, text, margin, y, contentWidth, 14);

    // ----------------------------------------------------
    // PAGE 5: CIRCULAR INFORMATIVA
    // ----------------------------------------------------
    doc.addPage();
    y = drawHeader(doc, '', '', logoBase64);

    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    doc.text("Centro Infantil Proyecta, S.L.\nB01758515\nC/ Alonso Ojeda, 14, Bajo Izq. - 33208 - Gijón - ASTURIAS\n647 257 447", margin, y);
    y += 60;

    doc.setTextColor(51, 65, 85);
    doc.setFont('helvetica', 'bold');
    doc.text("Estimado cliente,", margin, y);
    y += 20;

    doc.setFont('helvetica', 'normal');
    text = "La presente circular tiene por objeto poner en su conocimiento que hemos implantado las medidas de seguridad técnicas y organizativas necesarias para garantizar la seguridad de los datos de carácter personal que almacenamos, de acuerdo con el Reglamento General de Protección de Datos (RGPD) (UE) 2016/679 y la Ley Orgánica 3/2018, de 5 de diciembre, de Protección de Datos de Carácter Personal y Garantía de los Derechos Digitales.";
    y = printJustifiedText(doc, text, margin, y, contentWidth, 14) + 10;

    doc.setFont('helvetica', 'bold');
    doc.text("Es nuestro deber informarle que, como consecuencia de la relación comercial que nos une:", margin, y);
    y += 20;

    doc.setFont('helvetica', 'normal');
    const points = [
        "Sus datos están incluidos en nuestro sistema de tratamiento, con la finalidad de realizar la gestión administrativa, contable, fiscal y realizar el envío de información comercial sobre nuestros productos o servicios.",
        "Los tratamos en base por ejecución de un contrato, si bien es cierto que, en algunos casos, la base jurídica será su consentimiento previo, la existencia de un interés legítimo, o por obligación legal.",
        "No tomaremos decisiones automatizadas con efectos jurídicos significativos en base a dichos tratamientos, salvo que se haya obtenido previamente el consentimiento.",
        "Los datos proporcionados se conservarán mientras se mantenga la relación comercial o durante los años necesarios para cumplir con las obligaciones legales y no se cederán a terceros salvo en los casos en que exista una obligación legal."
    ];

    points.forEach(point => {
        doc.text("•", margin + 10, y);
        y = printJustifiedText(doc, point, margin + 25, y, contentWidth - 25, 14) + 5;
    });

    y += 10;
    text = "Centro Infantil Proyecta, S.L. se compromete a cumplir con lo dispuesto por la normativa sobre protección de datos anteriormente mencionada, así como a hacer cumplir las medidas de seguridad técnicas y organizativas implantadas al personal a su servicio que trate datos de carácter personal, evitando de esta forma, la pérdida alteración y acceso no autorizado a los mismos. Dicho personal se halla sujeto al deber de secreto y confidencialidad respecto a los datos que trata en los mismos términos que Centro Infantil Proyecta, S.L.";
    y = printJustifiedText(doc, text, margin, y, contentWidth, 14) + 10;

    text = "Asimismo, le informamos de la posibilidad de ejercer los siguientes derechos sobre sus datos personales: derecho de acceso, rectificación, supresión u olvido, limitación, oposición, portabilidad y a retirar el consentimiento prestado.";
    y = printJustifiedText(doc, text, margin, y, contentWidth, 14) + 10;

    text = "Para ello podrá enviar un email, debidamente identificado, a: dpdcentroproyecta@gmail.com o dirigir un escrito a Centro Infantil Proyecta, S.L. C/ Alonso Ojeda, 14, Bajo Izq. - 33208 - Gijón - ASTURIAS";
    doc.setFont('helvetica', 'bold'); // "dpdcentroproyecta@gmail.com" part
    doc.setFont('helvetica', 'normal');
    y = printJustifiedText(doc, text, margin, y, contentWidth, 14) + 10;

    text = "Además, el interesado puede dirigirse a la Autoridad de Control en materia de Protección de Datos competente (la AEPD, en España) para obtener información adicional o presentar una reclamación.";
    y = printJustifiedText(doc, text, margin, y, contentWidth, 14) + 10;

    doc.text("Sin otro particular, reciba un cordial saludo.", margin, y);

    // ----------------------------------------------------
    // PAGE 6: CONTRATO TERAPÉUTICO
    // ----------------------------------------------------
    doc.addPage();
    y = drawHeader(doc, 'CONTRATO TERAPÉUTICO', '', logoBase64);

    doc.setFontSize(10);
    doc.setTextColor(51, 65, 85);

    const tutorName = extraFields['contract_tutor_name'] || `${patient.tutor1?.firstName} ${patient.tutor1?.lastName}`;
    const address = extraFields['contract_address'] || patient.address || '...........................................';
    const dni = extraFields['contract_dni'] || patient.tutor1?.dni || '.......................';
    const minorName = extraFields['contract_minor_name'] || `${patient.firstName} ${patient.lastName}`;

    text = `D./Dña ${tutorName} mayor de edad, con domicilio en ${address} con DNI ${dni} en condición de padre/madre/tutor legal del/la menor ${minorName}`;
    y = printJustifiedText(doc, text, margin, y, contentWidth, 16) + 20;

    doc.setFont('helvetica', 'bold');
    doc.text("MANIFIESTA", pageWidth / 2, y, { align: 'center' });
    y += 20;

    doc.setFont('helvetica', 'normal');
    doc.text("Que para garantizar el correcto desarrollo y eficacia de la terapia es importante obtener el compromiso de ambas partes y, por ello, acepta:", margin, y);
    y += 20;

    const rules = [
        "Que su hijo/a asista de manera regular a las sesiones programadas. En caso de que le sea imposible acudir, deberá notificarlo con un mínimo de 24 horas de antelación. Esa sesión podrá reagendarse bajo disponibilidad del terapeuta y en caso de no disfrutarse, no será abonada.\nSi avisa en un período inferior al mencionado sin causa justificada (*) o si no se presenta a su cita, se dará la sesión por disfrutada y deberá abonarse cuando acuda a la próxima cita.\n(*) Enfermedad justificada y/o urgencia familiar.",
        "Que su hijo/a acuda a las sesiones en el horario pactado con el terapeuta. En caso de no llegar puntual a la cita, la hora de finalización será la acordada.\nSi tiene cita a las 15:00 y llega al centro 15 minutos tarde, la sesión finalizará a las 16:00 ya que, a continuación, hay otro paciente.",
        "Que cualquier información, comentarios o dudas deberán ser en su hora de sesión y no en la recogida, ya que a continuación, el terapeuta tiene otro paciente.",
        "Que, en caso de necesitar un informe, éste deberá solicitarse mínimo con 1 semana de antelación a la fecha de entrega. De no ser así, la entrega en la fecha solicitada quedará a disposición de la disponibilidad de su terapeuta.\nEl precio de los informes será de 40 euros.\nSe puede solicitar un informe de seguimiento una vez al año que se incluye dentro del precio de la terapia.",
        "Que, para comunicarse con el terapeuta, deberá hacerlo a través de WhatsApp (por escrito) o correo electrónico ya que, durante nuestra jornada laboral, no tenemos disponibilidad para hablar por teléfono a no ser que se agende una cita telefónica que contará como una sesión de terapia.",
        "Que las sesiones deberán abonarse al inicio de la sesión o la mensualidad por adelantado (efectivo, tarjeta o transferencia bancaria) a no ser que se haya acordado otra modalidad de pago.",
        "Que, en caso de necesitar factura de las sesiones, éstas deberán solicitarse con antelación y se entregarán dentro de los primeros quince días del mes siguiente (*).\n*Alumnos que hayan solicitado beca NEAE se entregarán todas las facturas al finalizar el curso académico."
    ];

    rules.forEach(rule => {
        doc.text("•", margin + 10, y);
        y = printJustifiedText(doc, rule, margin + 25, y, contentWidth - 25, 14) + 10;
    });

    y += 20;
    const city = extraFields['contract_city'] || 'Gijón';
    doc.text(`En ${city}, a ${day} de ${month} de ${yearStr}`, pageWidth / 2, y, { align: 'center' });

    y += 40;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.text("Centro Infantil Proyecta S.L\nC/ Alonso Ojeda 14 bajo izq\n33208 Gijón, Asturias", margin, y);
    doc.text("Teléfono: 684653227\ne-mail: centroproyectagijon@gmail.com\nwww.centroproyecta.es", pageWidth - margin, y, { align: 'right' });

    y += 60;
    // Signature box
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(margin, y, contentWidth, 120, 8, 8, 'FD');

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text("Firma del Tutor/a (Aceptación de Contrato):", margin + 15, y + 20);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(`D./Dª.- ${patient.tutor1?.firstName || ''} ${patient.tutor1?.lastName || ''}`, margin + 15, y + 40);

    if (tutor1SigBase64) {
        try {
            doc.addImage(tutor1SigBase64, 'PNG', margin + 150, y + 20, 200, 80, 'tutor1Sig', 'FAST');
        } catch (e) { }
    }

    return doc;
};

export const generateConsentPDF = async (
    patient: Patient,
    extraFields: Record<string, string>,
    tutorSignature: string | null,
    tutor2Signature: string | null,
    therapistSignature: string | null
): Promise<jsPDF> => {
    const doc = await generateConsentSheetPDF(patient, extraFields, tutorSignature, tutor2Signature, therapistSignature);
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 50;
    const contentWidth = pageWidth - (margin * 2);

    let logoBase64 = null;
    try {
        logoBase64 = await getBase64ImageFromUrl(logoUrl);
    } catch (e) {
        console.warn("Could not load logo", e);
    }

    const therapistSigBase64 = await ensureBase64(therapistSignature);
    const age = extraFields['age'] || calculateAge(patient.birthDate);
    const today = new Date();

    // ----------------------------------------------------
    // PAGE 7: HISTORIA CLÍNICA (1)
    // ----------------------------------------------------
    doc.addPage();
    let y = drawHeader(doc, 'HISTORIA CLÍNICA', '', logoBase64);

    doc.setFontSize(10);
    doc.setTextColor(51, 65, 85);

    const interviewer = extraFields['interviewer'] || '';
    const firstConsultDate = extraFields['first_consult_date'] || today.toLocaleDateString('es-ES');

    doc.setFont('helvetica', 'bold');
    doc.text(`Entrevistador:`, margin, y); doc.setFont('helvetica', 'normal'); doc.text(interviewer, margin + 80, y);
    doc.setFont('helvetica', 'bold');
    doc.text(`Fecha 1ra Consulta:`, margin + 250, y); doc.setFont('helvetica', 'normal'); doc.text(firstConsultDate, margin + 360, y);
    y += 30;

    const sectionTitle = (title: string, startY: number) => {
        doc.setFontSize(11);
        doc.setTextColor(44, 62, 80);
        doc.setFont('helvetica', 'bold');
        doc.text(title, margin, startY);
        doc.setFontSize(10);
        doc.setTextColor(51, 65, 85);
        doc.setFont('helvetica', 'normal');
        return startY + 20;
    };

    y = sectionTitle('I. DATOS PERSONALES', y);
    doc.setFont('helvetica', 'bold');
    doc.text('Nombre:', margin, y); doc.setFont('helvetica', 'normal'); doc.text(`${patient.firstName} ${patient.lastName}`, margin + 50, y);
    doc.setFont('helvetica', 'bold');
    doc.text('Edad:', margin + 300, y); doc.setFont('helvetica', 'normal'); doc.text(age, margin + 340, y);
    y += 15;

    doc.setFont('helvetica', 'bold');
    doc.text('Fecha y lugar de nacimiento:', margin, y); doc.setFont('helvetica', 'normal'); doc.text(formatDate(patient.birthDate), margin + 160, y);
    y += 15;

    doc.setFont('helvetica', 'bold');
    doc.text('Telf de contacto:', margin, y); doc.setFont('helvetica', 'normal'); doc.text(patient.phone || '', margin + 100, y);
    y += 15;

    doc.setFont('helvetica', 'bold');
    doc.text('Etapa educativa:', margin, y); doc.setFont('helvetica', 'normal'); doc.text(patient.schooling || '', margin + 100, y);
    y += 15;

    const informant = extraFields['informant'] || '';
    doc.setFont('helvetica', 'bold');
    doc.text('Informante:', margin, y); doc.setFont('helvetica', 'normal'); doc.text(informant, margin + 70, y);
    y += 30;

    y = sectionTitle('II. MOTIVO DE CONSULTA', y);
    const consultReason = extraFields['consult_reason'] || '';
    y = printJustifiedText(doc, consultReason, margin, y, contentWidth, 14) + 20;

    y = sectionTitle('III. ANTECEDENTES FAMILIARES', y);
    const familyHistory = extraFields['family_history'] || '';
    y = printJustifiedText(doc, familyHistory, margin, y, contentWidth, 14) + 20;

    y = sectionTitle('IV. VALORACIÓN DEL DESARROLLO/MOMENTO ACTUAL', y);
    const devAssessment = extraFields['development_assessment'] || '';
    y = printJustifiedText(doc, devAssessment, margin, y, contentWidth, 14);


    // ----------------------------------------------------
    // PAGE 8: HISTORIA CLÍNICA (2)
    // ----------------------------------------------------
    doc.addPage();
    y = 50;

    y = sectionTitle('V. IMPRESIÓN DIAGNÓSTICA/DIAGNÓSTICO PROPUESTO', y);
    const diagImpression = extraFields['diagnostic_impression'] || '';
    y = printJustifiedText(doc, diagImpression, margin, y, contentWidth, 14) + 40;

    y = sectionTitle('VI. EVOLUCIÓN', y);
    const evolution = extraFields['evolution_followup'] || '';
    y = printJustifiedText(doc, evolution, margin, y, contentWidth, 14) + 40;

    y = sectionTitle('VII. ALTA', y);
    const discharge = extraFields['discharge_notes'] || '';
    y = printJustifiedText(doc, discharge, margin, y, contentWidth, 14) + 60;

    // Signature box Therapist
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(margin, y, contentWidth, 150, 8, 8, 'FD');

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text("Firma responsable del centro / Terapeuta:", margin + 15, y + 20);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text("Centro Infantil Proyecta", margin + 15, y + 40);
    doc.text("B01758515", margin + 15, y + 55);

    if (therapistSigBase64) {
        try {
            doc.addImage(therapistSigBase64, 'PNG', margin + 150, y + 30, 200, 100, 'therapistSig', 'FAST');
        } catch (e) { }
    }

    return doc;
};

export const generateClinicalHistoryPDF = async (
    patient: Omit<Patient, 'createdAt'>,
    extraFields: Record<string, string>,
    therapistSignature: string | null
): Promise<jsPDF> => {
    const doc = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4', compress: true });
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 50;
    const contentWidth = pageWidth - (margin * 2);

    let logoBase64 = null;
    try {
        logoBase64 = await getBase64ImageFromUrl(logoUrl);
    } catch (e) {
        console.warn("Could not load logo", e);
    }

    const therapistSigBase64 = await ensureBase64(therapistSignature);
    const age = extraFields['age'] || calculateAge(patient.birthDate);
    const today = new Date();

    // ----------------------------------------------------
    // PAGE 7: HISTORIA CLÍNICA (1)
    // ----------------------------------------------------
    let y = drawHeader(doc, 'HISTORIA CLÍNICA', '', logoBase64);

    doc.setFontSize(10);
    doc.setTextColor(51, 65, 85);

    const interviewer = extraFields['interviewer'] || '';
    const firstConsultDate = extraFields['first_consult_date'] || today.toLocaleDateString('es-ES');

    doc.setFont('helvetica', 'bold');
    doc.text(`Entrevistador:`, margin, y); doc.setFont('helvetica', 'normal'); doc.text(interviewer, margin + 80, y);
    doc.setFont('helvetica', 'bold');
    doc.text(`Fecha 1ra Consulta:`, margin + 250, y); doc.setFont('helvetica', 'normal'); doc.text(firstConsultDate, margin + 360, y);
    y += 30;

    const sectionTitle = (title: string, startY: number) => {
        doc.setFontSize(11);
        doc.setTextColor(44, 62, 80);
        doc.setFont('helvetica', 'bold');
        doc.text(title, margin, startY);
        doc.setFontSize(10);
        doc.setTextColor(51, 65, 85);
        doc.setFont('helvetica', 'normal');
        return startY + 20;
    };

    y = sectionTitle('I. DATOS PERSONALES', y);
    doc.setFont('helvetica', 'bold');
    doc.text('Nombre:', margin, y); doc.setFont('helvetica', 'normal'); doc.text(`${patient.firstName} ${patient.lastName}`, margin + 50, y);
    doc.setFont('helvetica', 'bold');
    doc.text('Edad:', margin + 300, y); doc.setFont('helvetica', 'normal'); doc.text(age, margin + 340, y);
    y += 15;

    doc.setFont('helvetica', 'bold');
    doc.text('Fecha y lugar de nacimiento:', margin, y); doc.setFont('helvetica', 'normal'); doc.text(formatDate(patient.birthDate), margin + 160, y);
    y += 15;

    doc.setFont('helvetica', 'bold');
    doc.text('Telf de contacto:', margin, y); doc.setFont('helvetica', 'normal'); doc.text(patient.phone || '', margin + 100, y);
    y += 15;

    doc.setFont('helvetica', 'bold');
    doc.text('Etapa educativa:', margin, y); doc.setFont('helvetica', 'normal'); doc.text(patient.schooling || '', margin + 100, y);
    y += 15;

    const informant = extraFields['informant'] || '';
    doc.setFont('helvetica', 'bold');
    doc.text('Informante:', margin, y); doc.setFont('helvetica', 'normal'); doc.text(informant, margin + 70, y);
    y += 30;

    y = sectionTitle('II. MOTIVO DE CONSULTA', y);
    const consultReason = extraFields['consult_reason'] || '';
    y = printJustifiedText(doc, consultReason, margin, y, contentWidth, 14) + 20;

    y = sectionTitle('III. ANTECEDENTES FAMILIARES', y);
    const familyHistory = extraFields['family_history'] || '';
    y = printJustifiedText(doc, familyHistory, margin, y, contentWidth, 14) + 20;

    y = sectionTitle('IV. VALORACIÓN DEL DESARROLLO/MOMENTO ACTUAL', y);
    const devAssessment = extraFields['development_assessment'] || '';
    y = printJustifiedText(doc, devAssessment, margin, y, contentWidth, 14);


    // ----------------------------------------------------
    // PAGE 8: HISTORIA CLÍNICA (2)
    // ----------------------------------------------------
    doc.addPage();
    y = 50;

    y = sectionTitle('V. IMPRESIÓN DIAGNÓSTICA/DIAGNÓSTICO PROPUESTO', y);
    const diagImpression = extraFields['diagnostic_impression'] || '';
    y = printJustifiedText(doc, diagImpression, margin, y, contentWidth, 14) + 40;

    y = sectionTitle('VI. EVOLUCIÓN', y);
    const evolution = extraFields['evolution_followup'] || '';
    y = printJustifiedText(doc, evolution, margin, y, contentWidth, 14) + 40;

    y = sectionTitle('VII. ALTA', y);
    const discharge = extraFields['discharge_notes'] || '';
    y = printJustifiedText(doc, discharge, margin, y, contentWidth, 14) + 60;

    // Signature box Therapist
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(margin, y, contentWidth, 150, 8, 8, 'FD');

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text("Firma responsable del centro / Terapeuta:", margin + 15, y + 20);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text("Centro Infantil Proyecta", margin + 15, y + 40);
    doc.text("B01758515", margin + 15, y + 55);

    if (therapistSigBase64) {
        try {
            doc.addImage(therapistSigBase64, 'PNG', margin + 150, y + 30, 200, 100, 'therapistSig', 'FAST');
        } catch (e) { }
    }

    return doc;
};
