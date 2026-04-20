import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"

serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const makeWebhookUrl = Deno.env.get('MAKE_WEBHOOK_URL_REVIEWS')

    if (!supabaseUrl || !supabaseKey || !makeWebhookUrl) {
      throw new Error("Missing environment variables")
    }

    // El body viene del Database Webhook de Supabase
    const payload = await req.json()
    console.log("Webhook payload received:", payload)

    // Solo nos importa si es un UPDATE en appointments
    if (payload.type !== 'UPDATE' || payload.table !== 'appointments') {
      return new Response(JSON.stringify({ message: "Ignored: Not an appointment update" }), { status: 200 })
    }

    const newRecord = payload.record
    const oldRecord = payload.old_record

    // Si cambió a 'Finalizada' y antes NO lo era
    if (newRecord.status === 'Finalizada' && oldRecord.status !== 'Finalizada') {
      const supabase = createClient(supabaseUrl, supabaseKey)
      
      // Obtener el teléfono del paciente
      const { data: patient, error } = await supabase
        .from('patients')
        .select('phone')
        .eq('id', newRecord.patient_id)
        .single()
        
      if (error) throw error

      if (!patient?.phone) {
        console.warn(`Patient ${newRecord.patient_id} has no phone. Skipping review request.`)
        return new Response(JSON.stringify({ message: "Ignored: No phone number" }), { status: 200 })
      }

      // Enviar a Make.com
      const makePayload = {
        id_paciente: newRecord.patient_id,
        nombre_paciente: newRecord.patient_name,
        telefono: patient.phone
      }

      console.log("Sending review request to Make:", makePayload)

      const response = await fetch(makeWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(makePayload)
      })

      if (!response.ok) {
        throw new Error(`Make.com responded with status ${response.status}`)
      }

      return new Response(JSON.stringify({ success: true, sent: true }), { status: 200 })
    }

    return new Response(JSON.stringify({ message: "Ignored: Status is not Finalizada or hasn't changed" }), { status: 200 })

  } catch (error: any) {
    console.error("Error processing review webhook:", error)
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
})
