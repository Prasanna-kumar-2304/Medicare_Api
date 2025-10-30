const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const http = require("http");
const socketIo = require("socket.io");
const app = express();
const server = http.createServer(app);

const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Simple request logger to help debug requests on Render logs
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// Connect to MongoDB Atlas
mongoose.connect("mongodb+srv://medicare:healthcareapp@cluster0.8t4xx.mongodb.net/Healthcarebot?retryWrites=true&w=majority&appName=Cluster0")
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// Define schema and model 
const userSchema = new mongoose.Schema({
  uname: String,
  umail: String,
  upassword: String,
  phone: { type: String, default: '' },
  address: { type: String, default: '' },
  pincode: { type: String, default: '' },
  userType: {
    type: String,
    enum: ['patient', 'doctor', 'admin'],
    default: 'patient'
  },
  online: {
    type: Boolean,
    default: false
  },
  lastActive: Date
}); 

const User = mongoose.model("User", userSchema);

// Define the appointment schema
const appointmentSchema = new mongoose.Schema({
  userId: String,
  userName: String,
  doctorId: String,
  doctorName: String,
  specialization: String,
  date: String,
  time: String,
  // times proposed by doctor for this appointment (patient can choose)
  proposedTimes: { type: [String], default: [] },
  status: {
    type: String,
    default: 'confirmed'
  },
  notes: [{ 
    userId: String, 
    userName: String, 
    text: String, 
    timestamp: { type: Date, default: Date.now } 
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const Appointment = mongoose.model('Appointment', appointmentSchema);

const doctorSchema = new mongoose.Schema({
  name: { type: String, required: true },
  specialization: { type: String, required: true },
  speciality: String,
  hospital: { type: String, default: '' },
  location: { type: String, default: '' },
  experience: { type: String, default: '' },
  rating: { type: Number, default: 4.5 },
  available: { type: Boolean, default: true },
  slots: [String],  // Keep default slots
  dateSlots: {      // Add date-specific slots
    type: Map,
    of: [String]
  },
  gender: { type: String, default: '' },
  dob: { type: String, default: '' },
  phone: { type: String, default: '' },
  email: { type: String, default: '' },
  qualification: { type: String, default: '' },
  college: { type: String, default: '' },
  graduationYear: { type: String, default: '' },
  registrationNumber: { type: String, default: '' },
  role: { type: String, default: '' },
  online: { type: Boolean, default: false }
});

const Doctor = mongoose.model('Doctor', doctorSchema);

// Define chat message schema
const messageSchema = new mongoose.Schema({
  senderId: String,
  senderName: String,
  receiverId: String,
  receiverName: String,
  message: String,
  read: {
    type: Boolean,
    default: false
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

const Message = mongoose.model('Message', messageSchema);

// Add user API
app.post("/api/add_user", async (req, res) => {
  try {
    const { uname, umail, upassword, userType } = req.body;
    const existing = await User.findOne({ umail });

    if (existing) {
      return res.status(400).send({ message: "User already exists" });
    }

    const newUser = new User({ 
      uname, 
      umail, 
      upassword,
      userType: userType || 'patient' 
    });
    await newUser.save();

    res.status(200).send({
      status_code: 200,
      message: "User added successfully",
      product: newUser,
    });
  } catch (err) {
    res.status(500).send({ message: "Server error", error: err });
  }
});

// Example Node.js route handler for updating doctor slots
// Example Node.js route handler for updating doctor slots
app.put('/api/doctors/:doctorId/slots', async (req, res) => {
  try {
    const { doctorId } = req.params;
    const { date, time, action } = req.body;
    
    console.log(`Updating doctor ${doctorId} slots: Date ${date}, Time ${time}, Action ${action}`);
    
    if (!date || !time || !action) {
      return res.status(400).json({ message: 'Missing required fields' });
    }
    
    // Find the doctor
    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found' });
    }
    
    // Make sure dateSlots exists
    if (!doctor.dateSlots) {
      doctor.dateSlots = {};
    }
    
    // Make sure the date entry exists
    if (!doctor.dateSlots[date]) {
      // Initialize from default slots if available
      doctor.dateSlots[date] = doctor.slots || ["10:00 AM", "11:30 AM", "2:00 PM"];
    }
    
    // Update the slots for the specific date only
    if (action === 'remove') {
      // Remove only from the specific date
      doctor.dateSlots[date] = doctor.dateSlots[date].filter(slot => slot !== time);
      console.log(`Removed time slot ${time} from date ${date}`);
      console.log(`Updated slots for ${date}:`, doctor.dateSlots[date]);
    } else if (action === 'add') {
      // Add the time slot if it doesn't exist
      if (!doctor.dateSlots[date].includes(time)) {
        doctor.dateSlots[date].push(time);
        // Sort slots for better display
        doctor.dateSlots[date].sort();
      }
      console.log(`Added time slot ${time} to date ${date}`);
    }
    
    // Save the updated doctor document
    await doctor.save();
    
    return res.status(200).json({
      message: 'Doctor slots updated successfully',
      dateSlots: doctor.dateSlots[date]
    });
    
  } catch (error) {
    console.error('Error updating doctor slots:', error);
    return res.status(500).json({ message: 'Server error updating slots', error: error.message });
  }
});

app.get('/api/doctors/search', async (req, res) => {
  try {
    const { name } = req.query;
    
    if (!name) {
      return res.status(400).json({ message: 'Name parameter is required' });
    }
    
    const db = client.db(DATABASE_NAME);
    const collection = db.collection('doctors');
    
    // Create a case-insensitive search pattern
    const searchPattern = new RegExp(name, 'i');
    
    // Find doctors whose name matches the search pattern
    const doctors = await collection.find({
      name: { $regex: searchPattern }
    }).toArray();
    
    res.status(200).json(doctors);
  } catch (error) {
    console.error('Error searching doctors:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create new appointment
app.post("/api/appointments", async (req, res) => {
  try {
    console.log("Creating appointment:", req.body);
    
    const { userId, userName, doctorId, doctorName, specialization, date, time } = req.body;
    
    // Validate required fields
    if (!userId || !doctorId || !date || !time) {
      return res.status(400).json({ 
        message: "Missing required appointment information" 
      });
    }
    
    // Create new appointment
    const appointment = new Appointment({
      userId,
      userName,
      doctorId,
      doctorName,
      specialization,
      date,
      time
    });
    
    // Save the appointment
    await appointment.save();
    
    // Find the doctor
    const doctor = await Doctor.findById(doctorId);
    if (doctor) {
      // Initialize dateSlots if it doesn't exist
      if (!doctor.dateSlots) {
        doctor.dateSlots = {};
      }
      
      // Initialize slots for this date if they don't exist
      if (!doctor.dateSlots[date]) {
        doctor.dateSlots[date] = [...(doctor.slots || ["10:00 AM", "11:30 AM", "2:00 PM"])];
      }
      
      // Remove the booked time slot from the specific date only
      doctor.dateSlots[date] = doctor.dateSlots[date].filter(slot => slot !== time);
      
      // Save the updated doctor document
      await doctor.save();
    }
    
    // Emit event that a new appointment was created
    io.emit('appointment:created', appointment);
    
    res.status(201).json({
      status: "success",
      message: "Appointment booked successfully",
      appointment: appointment
    });
  } catch (err) {
    console.error("Error booking appointment:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Corresponding updateDoctorSlot method for the booking service
const updateDoctorSlot = async (doctorId, date, time, action) => {
  try {
    const response = await axios.put(`/api/doctors/${doctorId}/slots`, {
      date,
      time,
      action
    });
    
    console.log(`Updated doctor slot: ${action} ${time} on ${date}`);
    return response.data;
  } catch (error) {
    console.error('Error in updateDoctorSlot:', error);
    throw new Error(`Failed to update doctor slot: ${error.message}`);
  }
};

// When booking an appointment
const bookAppointment = async (doctorId, date, time, patientInfo) => {
  try {
    // First remove the slot from availability
    await updateDoctorSlot(doctorId, date, time, 'remove');
    
    // Then create the appointment
    const appointment = await createAppointment({
      doctorId,
      date,
      time,
      patientInfo
    });
    
    return appointment;
  } catch (error) {
    console.error('Error booking appointment:', error);
    throw new Error(`Failed to book appointment: ${error.message}`);
  }
};

// Login user API
app.post("/api/login_user", async (req, res) => {
  try {
    const { umail, upassword } = req.body;
    const user = await User.findOne({ umail, upassword });

    if (user) {
      // Update user's online status
      await User.findByIdAndUpdate(user._id, { 
        online: true,
        lastActive: new Date()
      });
      
      console.log("Login successful:", user);
      res.status(200).json({
        status_code: 200,
        message: "Login successful",
        user: user,
      });
    } else {
      console.log("Invalid credentials");
      res.status(401).json({
        status_code: 401,
        message: "Invalid email or password",
      });
    }
  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ message: "Server error", error: err });
  }
});

// Get user by email (umail)
app.get('/api/user', async (req, res) => {
  try {
    const { umail } = req.query;
    if (!umail) {
      return res.status(400).json({ message: 'umail query parameter is required' });
    }

    const user = await User.findOne({ umail });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.status(200).json(user);
  } catch (err) {
    console.error('Error fetching user by email:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Root API endpoint - useful for checking if service is up
app.get('/api', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Medicare API is running' });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: Date.now(),
  });
});

// Logout user API
app.post("/api/logout", async (req, res) => {
  try {
    const { userId } = req.body;
    await User.findByIdAndUpdate(userId, { 
      online: false,
      lastActive: new Date()
    });
    
    res.status(200).json({
      status_code: 200,
      message: "Logout successful"
    });
  } catch (err) {
    console.error("Logout error:", err);
    res.status(500).json({ message: "Server error", error: err });
  }
});

// Add new doctor endpoint
app.post("/api/doctors", async (req, res) => {
  try {
    console.log("Received doctor data:", req.body);
    
    // Validate required fields
    const { name, specialization } = req.body;
    if (!name || !specialization) {
      return res.status(400).json({ 
        message: "Name and specialization are required fields" 
      });
    }
    
    const { hospital, location, experience, rating, available, slots } = req.body;
    
    // Create new doctor document with all fields
    const newDoctor = new Doctor({
      name,
      specialization,
      hospital: hospital || "",
      location: location || "",
      experience: experience || "",
      rating: rating || 4.5,
      available: available !== undefined ? available : true,
      slots: slots || ["10:00 AM", "11:30 AM", "2:00 PM"],
      gender: req.body.gender || "",
      dob: req.body.dob || "",
      phone: req.body.phone || "",
      email: req.body.email || "",
      qualification: req.body.qualification || "",
      college: req.body.college || "",
      graduationYear: req.body.graduationYear || "",
      registrationNumber: req.body.registrationNumber || "",
      role: req.body.role || "",
      dateSlots: req.body.dateSlots || {}
    });
    
    // Save to database
    await newDoctor.save();
    console.log("Doctor saved successfully:", newDoctor);
    
    // Return success response
    res.status(201).json({
      status: "success",
      message: "Doctor added successfully",
      doctor: newDoctor
    });
  } catch (err) {
    console.error("Error adding doctor:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Update existing doctor by id
app.put('/api/doctors/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const update = req.body || {};

    console.log(`Received request to update doctor ${id}:`, update);

    // Ensure we are not accidentally trying to change the _id
    if (update._id) delete update._id;

    const updatedDoctor = await Doctor.findByIdAndUpdate(id, update, { new: true, runValidators: true });

    if (!updatedDoctor) {
      console.warn(`Doctor with id ${id} not found for update`);
      return res.status(404).json({ message: `Doctor with id ${id} not found` });
    }

    console.log('Doctor updated successfully:', updatedDoctor);
    return res.status(200).json(updatedDoctor);
  } catch (err) {
    console.error('Error updating doctor:', err);
    return res.status(500).json({ message: 'Server error updating doctor', error: err.message });
  }
});

app.get("/api/doctors", async (req, res) => {
  try {
    console.log("Fetching all doctors");
    const doctors = await Doctor.find();
    res.status(200).json(doctors);
  } catch (err) {
    console.error("Error fetching doctors:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Get online doctors
app.get("/api/doctors/online", async (req, res) => {
  try {
    const onlineDoctors = await Doctor.find({ online: true });
    res.status(200).json(onlineDoctors);
  } catch (err) {
    console.error("Error fetching online doctors:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Update user by id (profile update)
app.put('/api/user/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const update = req.body || {};

    // Prevent changing _id
    if (update._id) delete update._id;

    // Validate email if present
    if (update.umail && typeof update.umail !== 'string') {
      return res.status(400).json({ message: 'Invalid umail' });
    }

    // Find and update
    const updatedUser = await User.findByIdAndUpdate(id, update, { new: true, runValidators: true });
    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.status(200).json(updatedUser);
  } catch (err) {
    console.error('Error updating user:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Create new appointment
app.post("/api/appointments", async (req, res) => {
  try {
    console.log("Creating appointment:", req.body);
    
    const { userId, userName, doctorId, doctorName, specialization, date, time } = req.body;
    
    // Validate required fields
    if (!userId || !doctorId || !date || !time) {
      return res.status(400).json({ 
        message: "Missing required appointment information" 
      });
    }
    
    // Create new appointment
    const appointment = new Appointment({
      userId,
      userName,
      doctorId,
      doctorName,
      specialization,
      date,
      time
    });
    
    // Save the appointment
    await appointment.save();
    
    // Update doctor to mark the slot as unavailable
    // Find the doctor and update their available slots
    const doctor = await Doctor.findById(doctorId);
    if (doctor) {
      // Remove the booked time slot
      const updatedSlots = doctor.slots.filter(slot => slot !== time);
      
      // Update the doctor with the new slots
      await Doctor.findByIdAndUpdate(doctorId, { slots: updatedSlots });
    }
    
    // Emit event that a new appointment was created
    io.emit('appointment:created', appointment);
    
    res.status(201).json({
      status: "success",
      message: "Appointment booked successfully",
      appointment: appointment
    });
  } catch (err) {
    console.error("Error booking appointment:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Get appointments for a user
app.get("/api/appointments/user/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;
    const appointments = await Appointment.find({ userId });
    res.status(200).json(appointments);
  } catch (err) {
    console.error("Error fetching appointments:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Get appointments for a doctor
app.get("/api/appointments/doctor/:doctorId", async (req, res) => {
  try {
    const doctorId = req.params.doctorId;
    const appointments = await Appointment.find({ doctorId });
    res.status(200).json(appointments);
  } catch (err) {
    console.error("Error fetching doctor appointments:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Get appointments by doctor name (case-insensitive) - useful when doctor id isn't available
app.get('/api/appointments/doctor-by-name', async (req, res) => {
  try {
    const { name } = req.query;
    if (!name) {
      return res.status(400).json({ message: 'name query parameter is required' });
    }

  // Normalize whitespace and perform a case-insensitive substring match on doctorName
  const normalized = name.trim().replace(/\s+/g, ' ');
  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Use substring match (no anchors) so partial/extra titles still match
  const regex = new RegExp(escaped, 'i');
  const appointments = await Appointment.find({ doctorName: { $regex: regex } });
    res.status(200).json(appointments); 
  } catch (err) {
    console.error('Error fetching appointments by doctor name:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Update appointment status
app.put("/api/appointments/:appointmentId", async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const { status } = req.body;
    
    const updatedAppointment = await Appointment.findByIdAndUpdate(
      appointmentId,
      { status },
      { new: true }
    );
    
    if (!updatedAppointment) {
      return res.status(404).json({ message: "Appointment not found" });
    }
    
    // Emit event that an appointment was updated
    io.emit('appointment:updated', updatedAppointment);
    
    res.status(200).json({
      status: "success",
      message: "Appointment updated successfully",
      appointment: updatedAppointment
    });
  } catch (err) {
    console.error("Error updating appointment:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Doctor proposes multiple times for an appointment (patient will pick one)
app.put('/api/appointments/:appointmentId/proposed-times', async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const { proposedTimes } = req.body;

    if (!Array.isArray(proposedTimes)) {
      return res.status(400).json({ message: 'proposedTimes must be an array of time strings' });
    }

    const updated = await Appointment.findByIdAndUpdate(
      appointmentId,
      { proposedTimes },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    // Notify patient and doctor
    io.to(updated.userId).emit('appointment:proposed-times', { appointmentId, proposedTimes });
    io.to(updated.doctorId).emit('appointment:proposed-times', { appointmentId, proposedTimes });

    res.status(200).json({ status: 'success', appointment: updated });
  } catch (err) {
    console.error('Error updating proposed times:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Patient (or doctor) finalizes a scheduled time for the appointment
app.put('/api/appointments/:appointmentId/schedule', async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const { time } = req.body;

    if (!time) {
      return res.status(400).json({ message: 'time is required' });
    }

    const updated = await Appointment.findByIdAndUpdate(
      appointmentId,
      { time, proposedTimes: [] },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    // Notify both parties that appointment has been scheduled
    io.to(updated.userId).emit('appointment:scheduled', updated);
    io.to(updated.doctorId).emit('appointment:scheduled', updated);

    res.status(200).json({ status: 'success', appointment: updated });
  } catch (err) {
    console.error('Error scheduling appointment:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Add note to appointment
app.post("/api/appointments/:appointmentId/notes", async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const { userId, userName, text } = req.body;
    
    if (!text || !userId || !userName) {
      return res.status(400).json({ message: "Missing required note information" });
    }
    
    const note = {
      userId,
      userName,
      text,
      timestamp: new Date()
    };
    
    const updatedAppointment = await Appointment.findByIdAndUpdate(
      appointmentId,
      { $push: { notes: note } },
      { new: true }
    );
    
    if (!updatedAppointment) {
      return res.status(404).json({ message: "Appointment not found" });
    }
    
    // Emit event that a note was added
    io.emit('appointment:note-added', {
      appointmentId,
      note,
      appointment: updatedAppointment
    });
    
    res.status(200).json({
      status: "success",
      message: "Note added successfully",
      appointment: updatedAppointment
    });
  } catch (err) {
    console.error("Error adding note:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Chat API endpoints
// Send a message
app.post("/api/messages", async (req, res) => {
  try {
    const { senderId, senderName, receiverId, receiverName, message } = req.body;
    
    if (!senderId || !receiverId || !message) {
      return res.status(400).json({ message: "Missing required message information" });
    }
    
    const newMessage = new Message({
      senderId,
      senderName,
      receiverId,
      receiverName,
      message
    });
    
    await newMessage.save();
    
    // Emit event that a new message was sent
    io.to(receiverId).emit('message:received', newMessage);
    
    res.status(201).json({
      status: "success",
      message: "Message sent successfully",
      data: newMessage
    });
  } catch (err) {
    console.error("Error sending message:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Get conversation between two users
app.get("/api/messages/:userId/:otherUserId", async (req, res) => {
  try {
    const { userId, otherUserId } = req.params;
    
    const messages = await Message.find({
      $or: [
        { senderId: userId, receiverId: otherUserId },
        { senderId: otherUserId, receiverId: userId }
      ]
    }).sort({ timestamp: 1 });
    
    // Mark messages as read
    await Message.updateMany(
      { senderId: otherUserId, receiverId: userId, read: false },
      { read: true }
    );
    
    res.status(200).json(messages);
  } catch (err) {
    console.error("Error fetching messages:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Get unread message count
app.get("/api/messages/unread/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    
    const unreadCount = await Message.countDocuments({
      receiverId: userId,
      read: false
    });
    
    res.status(200).json({ unreadCount });
  } catch (err) {
    console.error("Error counting unread messages:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Socket.IO connection handling
io.on("connection", (socket) => {
  console.log("New client connected:", socket.id);
  
  // Join a room with the user's ID
  socket.on("join", (userId) => {
    console.log(`User ${userId} joined their room`);
    socket.join(userId);
  });
  
  // Handle doctor/user going online
  socket.on("user:online", async ({ userId, userType }) => {
    try {
      if (userType === 'doctor') {
        await Doctor.findByIdAndUpdate(userId, { online: true });
        io.emit("doctor:status-changed", { doctorId: userId, online: true });
      } else {
        await User.findByIdAndUpdate(userId, { online: true, lastActive: new Date() });
      }
    } catch (err) {
      console.error("Error updating online status:", err);
    }
  });
  
  // Handle doctor/user going offline
  socket.on("user:offline", async ({ userId, userType }) => {
    try {
      if (userType === 'doctor') {
        await Doctor.findByIdAndUpdate(userId, { online: false });
        io.emit("doctor:status-changed", { doctorId: userId, online: false });
      } else {
        await User.findByIdAndUpdate(userId, { 
          online: false, 
          lastActive: new Date() 
        });
      }
    } catch (err) {
      console.error("Error updating offline status:", err);
    }
  });
  
  // Handle private messaging
  socket.on("private-message", async (data) => {
    try {
      const { senderId, senderName, receiverId, receiverName, message } = data;
      
      // Save message to database
      const newMessage = new Message({
        senderId,
        senderName,
        receiverId,
        receiverName,
        message
      });
      
      await newMessage.save();
      
      // Send to the recipient
      io.to(receiverId).emit("private-message", newMessage);
      
      // Confirm to sender
      socket.emit("message-sent", newMessage);
    } catch (err) {
      console.error("Error handling private message:", err);
      socket.emit("message-error", { error: "Failed to send message" });
    }
  });
  
  // Handle appointment updates
  socket.on("appointment:update", async (data) => {
    try {
      const { appointmentId, status } = data;
      
      const updatedAppointment = await Appointment.findByIdAndUpdate(
        appointmentId,
        { status },
        { new: true }
      );
      
      if (updatedAppointment) {
        // Broadcast update to relevant parties
        io.to(updatedAppointment.userId).emit("appointment:updated", updatedAppointment);
        io.to(updatedAppointment.doctorId).emit("appointment:updated", updatedAppointment);
      }
    } catch (err) {
      console.error("Error updating appointment via socket:", err);
    }
  });
  
  // Handle adding notes to appointment
  socket.on("appointment:add-note", async (data) => {
    try {
      const { appointmentId, userId, userName, text } = data;
      
      const note = {
        userId,
        userName,
        text,
        timestamp: new Date()
      };
      
      const updatedAppointment = await Appointment.findByIdAndUpdate(
        appointmentId,
        { $push: { notes: note } },
        { new: true }
      );
      
      if (updatedAppointment) {
        // Broadcast note addition to relevant parties
        io.to(updatedAppointment.userId).emit("appointment:note-added", {
          appointmentId,
          note,
          appointment: updatedAppointment
        });
        
        io.to(updatedAppointment.doctorId).emit("appointment:note-added", {
          appointmentId,
          note,
          appointment: updatedAppointment
        });
      }
    } catch (err) {
      console.error("Error adding note via socket:", err);
    }
  });
  
  // Handle disconnect
  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

// Start server
server.listen(2000, '0.0.0.0', () => {
  console.log("🚀 Server running on port 2000 with Socket.IO...");
});
