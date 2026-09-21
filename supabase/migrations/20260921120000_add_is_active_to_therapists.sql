-- Añadir columna is_active a la tabla de terapeutas para permitir desactivarlas sin romper históricos
ALTER TABLE public.therapists ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- Comentario explicativo
COMMENT ON COLUMN public.therapists.is_active IS 'Indica si la terapeuta está en activo. Si es false, se oculta del calendario y no se le pueden asignar nuevas citas.';
