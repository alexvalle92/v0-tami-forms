-- Script SQL para criar as tabelas no Supabase
-- Execute este script no SQL Editor do seu projeto Supabase

-- Tabela de pacientes
CREATE TABLE IF NOT EXISTS patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  cpf TEXT,
  email TEXT UNIQUE NOT NULL,
  phone TEXT NOT NULL,
  asaas_customer_id TEXT,
  quiz_responses JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de pagamentos
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  asaas_id TEXT NOT NULL,
  asaas_customer_id TEXT,
  amount DECIMAL(10, 2) NOT NULL,
  status TEXT NOT NULL,
  payment_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para melhorar performance
CREATE INDEX IF NOT EXISTS idx_patients_email ON patients(email);
CREATE INDEX IF NOT EXISTS idx_payments_patient_id ON payments(patient_id);
CREATE INDEX IF NOT EXISTS idx_payments_asaas_id ON payments(asaas_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_patients_updated_at
  BEFORE UPDATE ON patients
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comentários nas tabelas
COMMENT ON TABLE patients IS 'Tabela de pacientes que respondem ao quiz';
COMMENT ON TABLE payments IS 'Tabela de pagamentos gerados via Asaas';

COMMENT ON COLUMN patients.quiz_responses IS 'Respostas completas do formulário em formato JSON';
COMMENT ON COLUMN patients.asaas_customer_id IS 'ID do cliente no Asaas armazenado no paciente para reuso';
COMMENT ON COLUMN payments.asaas_customer_id IS 'ID do cliente no Asaas para reuso em futuras cobranças';
COMMENT ON COLUMN payments.status IS 'Status do pagamento (PENDING, RECEIVED, CONFIRMED, etc)';
