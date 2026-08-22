CREATE TABLE IF NOT EXISTS patients (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  phone VARCHAR(30) UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS doctors (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  specialty VARCHAR(120) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS appointments (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER REFERENCES patients(id),
  doctor_id INTEGER REFERENCES doctors(id),
  appointment_at TIMESTAMPTZ NOT NULL,
  mode VARCHAR(20) NOT NULL CHECK (mode IN ('Video','In-clinic')),
  status VARCHAR(30) DEFAULT 'confirmed',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS prescriptions (
  id SERIAL PRIMARY KEY,
  appointment_id INTEGER REFERENCES appointments(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lab_orders (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER REFERENCES patients(id),
  test_name VARCHAR(160) NOT NULL,
  status VARCHAR(30) DEFAULT 'booked',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
