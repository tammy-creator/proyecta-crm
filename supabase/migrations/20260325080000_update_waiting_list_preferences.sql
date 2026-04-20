-- Añadir columnas para preferencias horarias en la lista de espera
ALTER TABLE waiting_list 
ADD COLUMN IF NOT EXISTS preferred_days int[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS preferred_hours text[] DEFAULT '{}';

-- Comentario para documentación
COMMENT ON COLUMN waiting_list.preferred_days IS 'Array de IDs de días (1=Lunes, 2=Martes... 6=Sábado)';
COMMENT ON COLUMN waiting_list.preferred_hours IS 'Array de horas de inicio preferidas (HH:mm)';
