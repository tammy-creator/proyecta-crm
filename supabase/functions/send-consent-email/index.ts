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

    const SMTP_HOST = Deno.env.get('SMTP_HOST') ?? "smtp.gmail.com";
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

    const isOldBoilerplate = message && (
      message.includes("Se adjunta la documentación de inscripción y consentimiento") ||
      message.includes("Se adjunta la documentación clínica")
    );

    const displayMessageHtml = (message && !isOldBoilerplate)
      ? message
      : `Te adjuntamos en este correo la <strong>Ficha de Inscripción y el Consentimiento de Protección de Datos (LOPD)</strong> de <strong>${patientName}</strong>, que ya ha quedado registrado de forma segura en nuestro sistema tras tu firma. 📝✨`;

    const displayMessageText = (message && !isOldBoilerplate)
      ? message
      : `Te adjuntamos en este correo la Ficha de Inscripción y el Consentimiento de Protección de Datos (LOPD) de ${patientName}, que ya ha quedado registrado de forma segura en nuestro sistema tras tu firma. 📝✨`;

    const htmlBody = `<div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; line-height: 1.6; color: #334155; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h2 style="color: #1a5f7a; margin-top: 10px; font-size: 1.5rem;">Ficha y Consentimiento LOPD Firmados</h2>
      </div>
      <p>¡Hola! 😊</p>
      <p>Esperamos que te encuentres muy bien.</p>
      <p>${displayMessageHtml}</p>
      
      <div style="margin: 24px 0; padding: 16px; background-color: #f8fafc; border-radius: 8px; border-left: 4px solid #38bdf8;">
        <p style="margin: 0; font-size: 0.95rem; color: #1e3a8a;"><strong>Detalles del documento enviado:</strong></p>
        <p style="margin: 8px 0 0; font-size: 0.9rem; color: #475569;"><strong>Tipo de documento:</strong> Ficha de Inscripción y Consentimiento</p>
        <p style="margin: 5px 0 0; font-size: 0.9rem; color: #475569;"><strong>Fecha de registro:</strong> ${new Date().toLocaleDateString('es-ES')}</p>
      </div>
      
      <p>Te recomendamos descargar y guardar este archivo PDF adjunto para tus registros personales. Si en el futuro necesitas realizar algún cambio en los datos o tienes cualquier duda, estamos a tu entera disposición.</p>
      <p>¡Muchas gracias por tu colaboración y por depositar tu confianza en el equipo de Centro Proyecta! 💙</p>
      
      <p style="margin-top: 35px; font-weight: bold; color: #1a5f7a;">Un saludo cordial,<br>El equipo de Centro Proyecta 🧸</p>
      
      <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 25px 0 15px;" />
      <p style="font-size: 0.75rem; color: #94a3b8; text-align: center; margin: 0; font-style: italic;">Este es un mensaje seguro y automático enviado desde el sistema CRM de Centro Infantil Proyecta.</p>
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
      text: `${displayMessageText}\n\nDetalles del documento enviado:\n- Tipo de documento: Ficha de Inscripción y Consentimiento\n- Fecha de registro: ${new Date().toLocaleDateString('es-ES')}\n\nTe recomendamos descargar y guardar este archivo PDF adjunto para tus registros personales. Si en el futuro necesitas realizar algún cambio en los datos o tienes cualquier duda, estamos a tu entera disposición.\n\n¡Muchas gracias por tu colaboración y por depositar tu confianza en el equipo de Centro Proyecta! 💙\n\nUn saludo cordial,\nEl equipo de Centro Proyecta 🧸\n\n---\nEste es un mensaje seguro y automático enviado desde el sistema CRM de Centro Infantil Proyecta.`,
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
