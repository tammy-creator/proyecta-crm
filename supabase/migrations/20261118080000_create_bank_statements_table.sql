-- Tabla para almacenar los extractos bancarios mensuales y sus movimientos de forma compartida en la nube
CREATE TABLE IF NOT EXISTS public.bank_statements (
    month_key text PRIMARY KEY, -- Formato 'YYYY-MM'
    file_name text NOT NULL,
    uploaded_at timestamptz DEFAULT now(),
    account_iban text,
    period text,
    total_income numeric(12, 2) DEFAULT 0,
    total_expenses numeric(12, 2) DEFAULT 0,
    net_result numeric(12, 2) DEFAULT 0,
    real_margin numeric(5, 2) DEFAULT 0,
    data jsonb NOT NULL, -- Objeto completo MonthlyStatementData (movimientos, desgloses por categoría, etc.)
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Habilitar Row Level Security (RLS)
ALTER TABLE public.bank_statements ENABLE ROW LEVEL SECURITY;

-- Permitir lectura y escritura compartida para los extractos bancarios del centro
CREATE POLICY "Permitir lectura y escritura de bank_statements"
ON public.bank_statements
FOR ALL
USING (true)
WITH CHECK (true);

-- Tabla para reglas personalizadas de categorización bancaria compartidas
CREATE TABLE IF NOT EXISTS public.bank_custom_rules (
    keyword text PRIMARY KEY,
    category text NOT NULL,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.bank_custom_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir lectura y escritura de bank_custom_rules"
ON public.bank_custom_rules
FOR ALL
USING (true)
WITH CHECK (true);
