-- Añadir columna payment_date a la tabla transactions para registrar la fecha real de cobro
ALTER TABLE public.transactions
ADD COLUMN IF NOT EXISTS payment_date timestamptz DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_payment_date ON public.transactions(payment_date);

-- Añadir columna payment_date a la tabla appointments para registrar la fecha real de cobro
ALTER TABLE public.appointments
ADD COLUMN IF NOT EXISTS payment_date timestamptz DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_payment_date ON public.appointments(payment_date);
