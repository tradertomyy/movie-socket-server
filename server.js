// server.js
const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
require("dotenv").config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // React runs on 5173 by default
    methods: ["GET", "POST"]
  }
});

// In-memory room tracking
const rooms = new Map();

io.on("connection", (socket) => {
  console.log("New client connected:", socket.id);

  socket.on("join-room", ({ roomId, passcode }) => {
    const existingRoom = rooms.get(roomId);

    if (existingRoom && existingRoom.passcode !== passcode) {
      socket.emit("error-message", "Incorrect passcode");
      return;
    }

    if (!existingRoom) {
      rooms.set(roomId, { 
        passcode, 
        users: [socket.id], // Add joining user
        currentTime: 0,
        isPlaying: false
      });
    } else {
      existingRoom.users.push(socket.id); // Add user to existing room
    }

    socket.join(roomId);
    socket.roomId = roomId;

    if (existingRoom) {
      socket.emit("force-seek", {
        timestamp: existingRoom.currentTime,
        shouldPlay: existingRoom.isPlaying,
        isInitial: true
      });
    }
    socket.emit("joined-room", roomId);
    console.log(`User ${socket.id} joined room ${roomId}`);
  });

  socket.on("playback-state", ({ isPlaying, timestamp }) => {
    const room = rooms.get(socket.roomId);
    if (!room || typeof timestamp !== 'number' || isNaN(timestamp)) return;
    
    room.currentTime = timestamp;
    room.isPlaying = isPlaying;
    socket.to(socket.roomId).emit("force-seek", {
      timestamp,
      shouldPlay: isPlaying
    });
  });
  
  socket.on("client-seek", ({ timestamp, shouldPlay }) => {
    const room = rooms.get(socket.roomId);
    console.log(`Seek request from ${socket.id}:`, { timestamp, shouldPlay });

    // Keep all existing validation
    if (typeof timestamp !== 'number' || isNaN(timestamp) || timestamp < 0) return;
    if (!room) return;
    
    // Keep threshold check (just increased from 0.1 to 0.5)
    if (Math.abs(timestamp - room.currentTime) < 0.3
  ) return;

    // Keep state updates
    room.currentTime = timestamp;
    room.isPlaying = Boolean(shouldPlay);
    
    // ONLY CHANGE IS WRAPPING THE EMIT IN setTimeout
    setTimeout(() => {
      socket.to(socket.roomId).emit("force-seek", { 
        timestamp,
        shouldPlay: shouldPlay
      });
    }, 50);
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
    const room = rooms.get(socket.roomId);
    if (room) {
      room.users = room.users.filter(id => id !== socket.id);
      if (room.users.length === 0) {
        rooms.delete(socket.roomId);
      }
    }
  });
}); // This is the closing brace for io.on("connection")

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});