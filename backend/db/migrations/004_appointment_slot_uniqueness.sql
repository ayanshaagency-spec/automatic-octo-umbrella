-- Appointment slot race protection.
-- Existing non-cancelled duplicates are checked before adding the constraint.
-- If duplicates exist, this migration raises and rolls back instead of modifying data.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM appointments
     WHERE status <> 'cancelled'
     GROUP BY doctor_id, appointment_at
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'appointment slot duplicates detected; resolve data safely before applying unique index';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS appointments_active_doctor_slot_unique
  ON appointments(doctor_id, appointment_at)
  WHERE status <> 'cancelled';
