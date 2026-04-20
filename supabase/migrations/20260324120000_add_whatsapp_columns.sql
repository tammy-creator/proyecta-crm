-- Add whatsapp integration columns
ALTER TABLE public.patients
ADD COLUMN IF NOT EXISTS resena_clic BOOLEAN DEFAULT FALSE;

ALTER TABLE public.appointments
ADD COLUMN IF NOT EXISTS notificacion_recordatorio_enviada BOOLEAN DEFAULT FALSE;

-- Función disparadora para enviar a Make
CREATE OR REPLACE FUNCTION public.fn_notificar_make_resena()
RETURNS TRIGGER AS $$
BEGIN
  -- Usamos la extensión pg_net de Supabase (esquema 'net')
  -- Si no tienes activa la extensión, esta llamada fallará.
  -- Asegúrate de tener activa "Database Webhooks" (pg_net) en Supabase.
  PERFORM
    net.http_post(
      url := 'https://hook.eu1.make.com/xu7s16l2si8kamugdq082noco4msaeff',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := jsonb_build_object(
        'id', NEW.id,
        'patient_id', NEW.patient_id, 
        'patient_name', NEW.patient_name, 
        'status', NEW.status,
        'start_time', NEW.start_time
      )::jsonb
    );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS "make_webhook_reviews" ON public.appointments;
DROP TRIGGER IF EXISTS "make_webhook_appointments" ON public.appointments;

CREATE TRIGGER "make_webhook_reviews"
AFTER UPDATE ON public.appointments
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'Finalizada')
EXECUTE FUNCTION public.fn_notificar_make_resena();



-- ==============================================================================
-- PULL (Make.com Search Rows) -> RECORDATORIOS
-- ==============================================================================
-- Índice para acelerar la búsqueda por fecha de inicio
CREATE INDEX IF NOT EXISTS idx_appointments_start_time ON public.appointments (start_time);

-- Vista combinada para que Make obtenga todos los datos de una sola vez
DROP VIEW IF EXISTS public.proximas_citas_24h;
CREATE OR REPLACE VIEW public.proximas_citas_24h AS
SELECT 
    a.id AS cita_id,
    a.patient_id,
    a.start_time,
    a.patient_name,
    p.phone AS paciente_telefono,
    a.therapist_name,
    a.notificacion_recordatorio_enviada
FROM public.appointments a
JOIN public.patients p ON a.patient_id = p.id
WHERE a.status = 'Programada'
  AND a.notificacion_recordatorio_enviada = false
  -- Filtra las citas completas de mañana
  AND a.start_time >= CURRENT_DATE + INTERVAL '1 day'
  AND a.start_time < CURRENT_DATE + INTERVAL '2 days';

-- Asegurar permisos de acceso a la vista si tu API es anónima/autenticada
GRANT SELECT ON public.proximas_citas_24h TO anon, authenticated;
