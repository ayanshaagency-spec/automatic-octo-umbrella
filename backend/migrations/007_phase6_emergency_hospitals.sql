CREATE TABLE IF NOT EXISTS hospitals (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(180) NOT NULL,
  address TEXT NOT NULL,
  city VARCHAR(100),
  state VARCHAR(100),
  latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  phone VARCHAR(40),
  emergency_available BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hospitals_active ON hospitals(active);
CREATE INDEX IF NOT EXISTS idx_hospitals_coordinates ON hospitals(latitude, longitude);
