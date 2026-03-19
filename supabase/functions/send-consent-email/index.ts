import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Health check
  if (req.method === 'GET') {
    return new Response(JSON.stringify({ status: 'ok' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const { email, patient, message, signatureData } = await req.json()
    console.log(`Intentando enviar email a: ${email} para el paciente: ${patient.firstName} ${patient.lastName}`);

    // Importación dinámica de nodemailer para evitar errores de booteo en Deno
    // @ts-ignore
    const nodemailer = await import('npm:nodemailer');

    const SMTP_HOST = Deno.env.get('SMTP_HOST') ?? "mail.centroproyecta.es";
    const SMTP_PORT = parseInt(Deno.env.get('SMTP_PORT') ?? "465");
    const SMTP_USER = Deno.env.get('SMTP_USER') ?? "info@centroproyecta.es";
    const SMTP_PASS = Deno.env.get('SMTP_PASS') ?? "";

    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
      tls: {
        rejectUnauthorized: false
      }
    });

    // Importación dinámica de pdf-lib
    // @ts-ignore
    const { PDFDocument, rgb, StandardFonts } = await import('npm:pdf-lib');

    // Generar PDF
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([600, 800]);
    const { width, height } = page.getSize();
    const fontPrimary = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Título y Cabecera
    page.drawText('FICHA DE INSCRIPCIÓN Y CONSENTIMIENTO', { x: 50, y: height - 50, size: 20, font: fontBold, color: rgb(0, 0.52, 1) });
    page.drawText('Centro Infantil Proyecta, S.L.', { x: 50, y: height - 70, size: 12, font: fontPrimary, color: rgb(0.5, 0.5, 0.5) });

    // Datos del Alumno
    let yPos = height - 120;
    page.drawText('DATOS DEL ALUMNO/A', { x: 50, y: yPos, size: 14, font: fontBold, color: rgb(0, 0.52, 1) });
    yPos -= 20;
    page.drawText('Nombre completo: ' + patient.firstName + ' ' + patient.lastName, { x: 50, y: yPos, size: 11, font: fontPrimary });
    yPos -= 15;
    page.drawText('Fecha de Nacimiento: ' + patient.birthDate, { x: 50, y: yPos, size: 11, font: fontPrimary });
    yPos -= 15;
    page.drawText('Escolarización: ' + (patient.schooling || '---'), { x: 50, y: yPos, size: 11, font: fontPrimary });
    yPos -= 15;
    page.drawText('Dirección: ' + (patient.address || '---'), { x: 50, y: yPos, size: 11, font: fontPrimary });

    // Datos Familiares
    yPos -= 40;
    page.drawText('DATOS FAMILIARES', { x: 50, y: yPos, size: 14, font: fontBold, color: rgb(0, 0.52, 1) });
    yPos -= 25;
    page.drawText('Tutor 1 / Representante Legal', { x: 50, y: yPos, size: 12, font: fontBold });
    yPos -= 15;
    page.drawText('Nombre: ' + (patient.tutor1?.firstName || '') + ' ' + (patient.tutor1?.lastName || ''), { x: 50, y: yPos, size: 11, font: fontPrimary });
    yPos -= 15;
    page.drawText('DNI/NIE: ' + (patient.tutor1?.dni || ''), { x: 50, y: yPos, size: 11, font: fontPrimary });
    yPos -= 15;
    page.drawText('Teléfono: ' + (patient.tutor1?.phone || '') + ' / Email: ' + (patient.tutor1?.email || ''), { x: 50, y: yPos, size: 11, font: fontPrimary });

    if (patient.tutor2?.firstName) {
      yPos -= 30;
      page.drawText('Tutor 2', { x: 50, y: yPos, size: 12, font: fontBold });
      yPos -= 15;
      page.drawText('Nombre: ' + patient.tutor2.firstName + ' ' + patient.tutor2.lastName, { x: 50, y: yPos, size: 11, font: fontPrimary });
      yPos -= 15;
      page.drawText('DNI/NIE: ' + patient.tutor2.dni, { x: 50, y: yPos, size: 11, font: fontPrimary });
      yPos -= 15;
      page.drawText('Teléfono: ' + patient.tutor2.phone, { x: 50, y: yPos, size: 11, font: fontPrimary });
    }

    // Datos de Interés
    yPos -= 40;
    page.drawText('DATOS DE INTERÉS', { x: 50, y: yPos, size: 14, font: fontBold, color: rgb(0, 0.52, 1) });
    yPos -= 15;
    page.drawText('¿Alergias o intolerancias?: ' + (patient.allergies || 'No consta'), { x: 50, y: yPos, size: 11, font: fontPrimary });
    yPos -= 15;
    page.drawText('¿Cómo nos conociste?: ' + (patient.referralSource || '---'), { x: 50, y: yPos, size: 11, font: fontPrimary });

    // Protección de Datos
    yPos -= 40;
    page.drawText('PROTECCIÓN DE DATOS (RGPD)', { x: 50, y: yPos, size: 10, font: fontBold });
    yPos -= 15;
    const rgpdText = 'En cumplimiento del RGPD (UE) 2016/679, le informamos que sus datos serán tratados por Centro Infantil Proyecta, S.L. para la prestación del servicio y gestión administrativa. Puede ejercer sus derechos de acceso, rectificación y supresión enviando un email a dpdcentroproyecta@gmail.com.';
    page.drawText(rgpdText, { x: 50, y: yPos, size: 8, font: fontPrimary, maxWidth: 500, lineHeight: 10 });

    // Firma
    yPos -= 60;
    page.drawText('Firma del Tutor Legal:', { x: 50, y: yPos, size: 11, font: fontBold });

    if (signatureData) {
      try {
        const signatureBytes = Uint8Array.from(atob(signatureData.split(',')[1]), c => c.charCodeAt(0));
        const signatureImage = await pdfDoc.embedPng(signatureBytes);
        const sigDims = signatureImage.scale(0.5);
        page.drawImage(signatureImage, {
          x: 100,
          y: yPos - 130,
          width: sigDims.width,
          height: sigDims.height,
        });
      } catch (e) {
        console.error("Error incrustando firma en PDF:", e);
      }
    }

    page.drawText('Documento firmado electrónicamente', { x: width - 250, y: yPos - 150, size: 8, font: fontPrimary, color: rgb(0.6, 0.6, 0.6) });

    const pdfBytes = await pdfDoc.save();

    let htmlBody = '<div style="font-family: \'Segoe UI\', Tahoma, Geneva, Verdana, sans-serif; color: #333; max-width: 700px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">';
    htmlBody += '<div style="background-color: #f8f9fa; padding: 25px; border-bottom: 2px solid #0084ff; text-align: center;">';
    htmlBody += '<h1 style="margin: 0; color: #2c3e50; font-size: 24px;">FICHA DE INSCRIPCIÓN Y CONSENTIMIENTO</h1>';
    htmlBody += '<p style="margin: 5px 0 0; color: #7f8c8d; font-size: 14px;">Centro Infantil Proyecta, S.L.</p></div>';
    htmlBody += '<div style="padding: 30px;"><p>Hola,</p>';
    htmlBody += '<p>Se adjunta la ficha de inscripción y consentimiento firmada para <strong>' + patient.firstName + ' ' + patient.lastName + '</strong> en formato PDF.</p>';
    htmlBody += '<p>Si tiene alguna pregunta, no dude en contactarnos.</p>';
    htmlBody += '<br><p>Atentamente,<br>El equipo de Centro Proyecta</p></div>';
    htmlBody += '<div style="background-color: #f8f9fa; padding: 20px; text-align: center; color: #95a5a6; font-size: 12px; border-top: 1px solid #eee;">';
    htmlBody += '<p style="margin: 0;">Este es un mensaje automático enviado desde el sistema de gestión de Centro Proyecta.</p></div></div>';

    const info = await transporter.sendMail({
      from: `"Centro Proyecta" <${SMTP_USER}>`,
      to: email,
      subject: `Ficha de Consentimiento Firmada - ${patient.firstName} ${patient.lastName}`,
      text: message,
      html: htmlBody,
      attachments: [
        {
          filename: 'Ficha_Registro_' + patient.firstName + '_' + patient.lastName + '.pdf',
          content: btoa(String.fromCharCode(...pdfBytes)),
          encoding: 'base64'
        }
      ]
    });

    console.log("Email enviado con éxito:", info.messageId);

    return new Response(
      JSON.stringify({ success: true, messageId: info.messageId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error("Error en Edge Function:", error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
