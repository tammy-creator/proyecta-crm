import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
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
    const body = await req.json();
    const { email, patient, message, pdfBase64 } = body;
    
    console.log(`Petición recibida para enviar email a: ${email}`);
    
    if (!email) {
      throw new Error("El email del destinatario es obligatorio");
    }

    if (!pdfBase64) {
      // Intentar ver si viene en signatureData por compatibilidad antigua, aunque ya no lo usamos para generar PDF en el servidor
      console.warn("Advertencia: No se recibió pdfBase64. El email se enviará sin adjunto.");
    }

    // Importación dinámica de nodemailer
    // @ts-expect-error dynamic import
    const nodemailer = await import('npm:nodemailer');

    const SMTP_HOST = Deno.env.get('SMTP_HOST') ?? "mail.centroproyecta.es";
    const SMTP_PORT = parseInt(Deno.env.get('SMTP_PORT') ?? "465");
    const SMTP_USER = Deno.env.get('SMTP_USER') ?? "info@centroproyecta.es";
    const SMTP_PASS = Deno.env.get('SMTP_PASS') ?? "";

    if (!SMTP_PASS) {
      console.error("Configuración SMTP incompleta: SMTP_PASS no definido en variables de entorno.");
    }

    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
      tls: { rejectUnauthorized: false }
    });

    const patientName = patient ? `${patient.firstName} ${patient.lastName}` : "Paciente";
    
    const htmlBody = `<div style="font-family: sans-serif; padding: 20px; line-height: 1.6; color: #333;">
      <h2 style="color: #1a5f7a;">Documentación Clínica</h2>
      <p>Hola,</p>
      <p>${message || `Se adjunta la documentación clínica de <strong>${patientName}</strong> debidamente firmada.`}</p>
      <div style="margin: 20px 0; padding: 15px; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
        <p style="margin: 0; font-size: 0.9rem;"><strong>Tipo de documento:</strong> Ficha de Inscripción y Consentimiento</p>
        <p style="margin: 5px 0 0; font-size: 0.9rem;"><strong>Fecha:</strong> ${new Date().toLocaleDateString('es-ES')}</p>
      </div>
      <p>Por favor, guarde este documento para sus registros.</p>
      <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
      <p style="font-size: 0.8rem; color: #666;">Este es un mensaje automático enviado desde el sistema CRM de Centro Infantil Proyecta.</p>
    </div>`;

    const attachments = [];
    if (pdfBase64) {
      const base64Data = pdfBase64.indexOf(',') > -1 ? pdfBase64.split(',')[1] : pdfBase64;
      attachments.push({
        filename: `Documentacion_${patientName.replace(/\s+/g, '_')}.pdf`,
        content: base64Data,
        encoding: 'base64'
      });
    }

    console.log(`Enviando email vía ${SMTP_HOST}:${SMTP_PORT}...`);

    const info = await transporter.sendMail({
      from: `"Centro Proyecta" <${SMTP_USER}>`,
      to: email,
      subject: `Documentación Clínica Firmada - ${patientName}`,
      text: message || `Documentación clínica de ${patientName}`,
      html: htmlBody,
      attachments: attachments
    });

    console.log("Email enviado con éxito:", info.messageId);

    return new Response(JSON.stringify({ success: true, messageId: info.messageId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error("Error en Edge Function send-consent-email:", error.message);
    // IMPORTANTE: Devolvemos 200 con success: false para que el cliente pueda leer el error descriptivo en 'data.error'
    // en lugar de recibir un 500 genérico de Supabase.
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200, 
    })
  }
})
