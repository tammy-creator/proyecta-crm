import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method === 'GET') {
    return new Response(JSON.stringify({ status: 'ok' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const { therapistName, month, totalHours, signatureImage, totalDays, pdfBase64 } = await req.json();
    console.log(`Enviando reporte firmado para: ${therapistName}, mes: ${month}`);

    if (!pdfBase64) {
        throw new Error("No PDF base64 data provided in request");
    }

    // Extract base64 part if it contains the data URI prefix
    const pdfAttachmentBase64 = pdfBase64.includes(',') ? pdfBase64.split(',')[1] : pdfBase64;

    // @ts-ignore
    const nodemailer = await import('npm:nodemailer');

    const monthLabel = new Date(`${month}-15`).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

    // ── Send Email ──────────────────────────────────────────────────────────
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
      tls: { rejectUnauthorized: false }
    });

    let htmlBody = '<div style="font-family: \'Segoe UI\', sans-serif; color: #333; max-width: 700px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">';
    htmlBody += '<div style="background-color: #1A5F7A; padding: 25px; text-align: center;">';
    htmlBody += '<h1 style="margin: 0; color: white; font-size: 22px;">Reporte de Jornada Laboral Firmado</h1>';
    htmlBody += '</div>';
    htmlBody += '<div style="padding: 30px;">';
    htmlBody += `<p>Hola,</p>`;
    htmlBody += `<p><strong>${therapistName}</strong> ha firmado su reporte de jornada laboral correspondiente a <strong>${monthLabel}</strong>.</p>`;
    htmlBody += '<table style="width: 100%; border-collapse: collapse; margin: 20px 0;">';
    htmlBody += `<tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Total Horas</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${totalHours}h</td></tr>`;
    htmlBody += `<tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Días con Actividad</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${totalDays}</td></tr>`;
    htmlBody += `<tr><td style="padding: 8px; font-weight: bold;">Fecha de Firma</td><td style="padding: 8px;">${new Date().toLocaleDateString('es-ES')}</td></tr>`;
    htmlBody += '</table>';
    htmlBody += '<p>Se adjunta el reporte firmado en formato PDF.</p>';
    htmlBody += '<br><p>Atentamente,<br>Sistema Proyecta CRM</p>';
    htmlBody += '</div>';
    htmlBody += '<div style="background-color: #f8f9fa; padding: 15px; text-align: center; color: #95a5a6; font-size: 11px; border-top: 1px solid #eee;">';
    htmlBody += '<p style="margin: 0;">Mensaje automático — Centro Infantil Proyecta, S.L.</p></div></div>';

    const filename = `Reporte_Jornada_${therapistName.replace(/\s+/g, '_')}_${month}.pdf`;

    const info = await transporter.sendMail({
      from: `"Centro Proyecta" <${SMTP_USER}>`,
      to: 'info@centroproyecta.es',
      subject: `Reporte Firmado - ${therapistName} - ${monthLabel}`,
      html: htmlBody,
      attachments: [{
        filename,
        content: pdfAttachmentBase64,
        encoding: 'base64'
      }]
    });

    console.log("Email de reporte enviado:", info.messageId);

    return new Response(
      JSON.stringify({ success: true, messageId: info.messageId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error("Error en send-signed-report:", error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
