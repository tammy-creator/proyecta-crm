import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"

serve(async (_req) => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const makeWebhookUrl = Deno.env.get('MAKE_WEBHOOK_URL_REMINDERS')

    if (!supabaseUrl || !supabaseKey || !makeWebhookUrl) {
      throw new Error("Missing environment variables")
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    // Calculamos las fechas para buscar citas en las próximas 24 horas
    const now = new Date()
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)

    const { data: appointments, error } = await supabase
      .from('appointments')
      .select(`
        id,
        patient_id,
        patient_name,
        start_time,
        notificacion_recordatorio_enviada,
        status,
        patients ( phone )
      `)
      .gte('start_time', now.toISOString())
      .lte('start_time', tomorrow.toISOString())
      .eq('notificacion_recordatorio_enviada', false)
      .eq('status', 'Programada')

    if (error) throw error

    console.log(`Found ${appointments?.length || 0} appointments to send reminders for.`)

    const results = []

    for (const appt of appointments || []) {
      const phone = appt.patients?.phone

      if (!phone) {
        console.warn(`No phone number for patient ${appt.patient_name} (${appt.patient_id}). Skipping.`)
        continue
      }

      // Enviar a Make.com
      const payload = {
        id_cita: appt.id,
        nombre_paciente: appt.patient_name,
        telefono: phone,
        fecha_hora_cita: appt.start_time
      }

      const response = await fetch(makeWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (response.ok) {
        // Actualizar en BBDD
        const { error: updateError } = await supabase
          .from('appointments')
          .update({ notificacion_recordatorio_enviada: true })
          .eq('id', appt.id)
        
        if (updateError) {
          console.error(`Error updating DB for appointment ${appt.id}:`, updateError)
        } else {
          results.push({ id: appt.id, status: 'sent' })
        }
      } else {
        console.error(`Error sending to Make for appointment ${appt.id}: HTTP ${response.status}`)
        results.push({ id: appt.id, status: 'error' })
      }
    }

    return new Response(JSON.stringify({ success: true, processed: results.length, results }), {
      headers: { "Content-Type": "application/json" }
    })
  } catch (error: any) {
    console.error("Error in send-reminders function:", error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    })
  }
})
