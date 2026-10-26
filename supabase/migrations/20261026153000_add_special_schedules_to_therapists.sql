-- Add special_schedules column to therapists table
ALTER TABLE public.therapists 
ADD COLUMN IF NOT EXISTS special_schedules jsonb DEFAULT '[]'::jsonb;
