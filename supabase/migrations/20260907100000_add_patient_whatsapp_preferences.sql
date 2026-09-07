-- ==============================================================================
-- Migración: Preferencias de Recordatorios WhatsApp y Estado Cláusula RGPD
-- Fecha: 2026-09-07
-- ==============================================================================

-- 1. Añadir columnas a la tabla patients
ALTER TABLE public.patients
ADD COLUMN IF NOT EXISTS recibir_recordatorios_whatsapp BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS whatsapp_rgpd_enviado BOOLEAN DEFAULT FALSE;

-- 2. Asegurar valores por defecto en registros existentes
UPDATE public.patients 
SET recibir_recordatorios_whatsapp = TRUE 
WHERE recibir_recordatorios_whatsapp IS NULL;

UPDATE public.patients 
SET whatsapp_rgpd_enviado = FALSE 
WHERE whatsapp_rgpd_enviado IS NULL;

-- 3. Comentarios explicativos
COMMENT ON COLUMN public.patients.recibir_recordatorios_whatsapp IS 'Indica si el paciente desea recibir recordatorios automáticos de citas por WhatsApp';
COMMENT ON COLUMN public.patients.whatsapp_rgpd_enviado IS 'Indica si ya se ha enviado la cláusula legal informativa inicial de RGPD por WhatsApp';
