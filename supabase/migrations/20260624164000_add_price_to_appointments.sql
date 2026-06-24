-- Añadir columna de precio personalizado a la tabla de citas
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS price numeric;

-- Comentario para documentación
COMMENT ON COLUMN public.appointments.price IS 'Precio personalizado para esta sesión en particular, sobrescribe el precio del servicio clínico.';
