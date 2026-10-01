-- Corregir foreign key de therapist_id en la tabla patients
-- Anteriormente apuntaba erróneamente a user_accounts(id), lo que causaba error 23503 al guardar pacientes con terapeuta asignado.
ALTER TABLE public.patients DROP CONSTRAINT IF EXISTS patients_therapist_id_fkey;

ALTER TABLE public.patients 
    ADD CONSTRAINT patients_therapist_id_fkey 
    FOREIGN KEY (therapist_id) 
    REFERENCES public.therapists(id) 
    ON DELETE SET NULL;
