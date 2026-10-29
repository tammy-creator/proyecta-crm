-- Añadir columna payment_date a la tabla transactions para registrar la fecha real en que se efectúa el cobro en caja
ALTER TABLE public.transactions
ADD COLUMN IF NOT EXISTS payment_date timestamptz DEFAULT NULL;

-- Índice para optimizar consultas de caja diaria por fecha real de cobro
CREATE INDEX IF NOT EXISTS idx_transactions_payment_date ON public.transactions(payment_date);
