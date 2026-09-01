# Appointment API foundation

## POST /appointments
Creates a patient appointment after validating the doctor, date, time slot and consultation mode.

### Request
```json
{
  "patientId": "patient_123",
  "doctorId": "doctor_001",
  "appointmentDate": "2026-09-02",
  "slot": "10:30 AM",
  "mode": "video"
}
```

### Response
```json
{
  "id": "appointment_001",
  "status": "confirmed",
  "patientId": "patient_123",
  "doctorId": "doctor_001",
  "appointmentDate": "2026-09-02",
  "slot": "10:30 AM",
  "mode": "video"
}
```

## GET /appointments?patientId=patient_123
Returns the patient's appointment history ordered by appointment date/time.

## GET /doctors/{doctorId}/availability?date=2026-09-02
Returns available slots for the selected doctor and date.

## POST /appointments/{id}/cancel
Cancels an appointment when cancellation rules permit it.

## Validation rules
- `patientId`, `doctorId`, date, slot and mode are required.
- Date cannot be in the past.
- Slot must be offered by the selected doctor for that date.
- Mode must be `video` or `in-clinic`.
- A confirmed slot cannot be double-booked.
- Server/database is the source of truth; the Flutter UI must not assume a slot is available without API confirmation.
