-- Añadir 'TPV Virtual' al enum payment_method para registrar enlaces de pago (Paygold / WhatsApp)
ALTER TYPE public.payment_method ADD VALUE IF NOT EXISTS 'TPV Virtual';
