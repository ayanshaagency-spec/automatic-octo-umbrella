const express = require('express');
const router = express.Router();
const Appointment = require('../models/Appointment');

// Create New Appointment
router.post('/book', async (req, res) => {
  try {
    const { patientId, doctorId, date, timeSlot, type, notes } = req.body;

    // Check if slot is already booked
    const existing = await Appointment.findOne({ doctorId, date, timeSlot, status: 'scheduled' });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Time slot already booked' });
    }

    const newAppointment = new Appointment({ patientId, doctorId, date, timeSlot, type, notes });
    await newAppointment.save();

    res.status(201).json({ success: true, message: 'Appointment booked successfully', appointment: newAppointment });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get Patient Appointments
router.get('/patient/:patientId', async (req, res) => {
  try {
    const appointments = await Appointment.find({ patientId: req.params.patientId }).populate('doctorId');
    res.status(200).json({ success: true, appointments });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
