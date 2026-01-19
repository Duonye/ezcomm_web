/* server.js */

import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors"; // Import cors
import * as data from "./data.js";
import * as colors from "./colors.js";

// Reads PORT from the OS, the --env-file flag, or defaults to 9000
const PORT = process.env.PORT || 9000;

// The express server (configured, then passed to httpServer)
const app = express();

// Enable CORS
app.use(cors());

// Allows static hosting content of the public/ folder
// https://expressjs.com/en/api.html#express.static
app.use(express.static('public'));

// Parses incoming requests with JSON payloads
// https://expressjs.com/en/api.html#express.json
app.use(express.json());

// Custom application-level middleware for logging all requests
app.use((req, _res, next) => {
    const timestamp = new Date(Date.now());
    console.log(`[${timestamp.toDateString()} ${timestamp.toTimeString()}] / ${timestamp.toISOString()}`);
    console.log(req.method, req.hostname, req.path);
    console.log('headers:', req.headers);
    console.log('body:', req.body);
    next();
});

// Creating an httpServer using the express configuration
// https://nodejs.org/api/http.html#httpcreateserveroptions-requestlistener
const httpServer = http.createServer(app);

// New socket server
const io = new Server(httpServer, {
  cors: {
      origin: "http://localhost:5173", // Vite client URL
      methods: ["GET", "POST"]
  }
});

io.on("connect", socket => {
    console.log("New connection", socket.id);
  
    const updateRoomUsers = async (roomName) => {
      try {
        const sockets = await io.in(roomName).fetchSockets();
        const users = sockets.map(s => ({
          name: s.data.userName,
          color: s.data.color
        }));
        io.to(roomName).emit("room-users", users);
      } catch (error) {
        console.error("Error updating room users:", error);
      }
    };
  
    socket.on("join", joinInfo => {
      const { roomName, userName } = joinInfo;
  
      if (data.isUserNameTaken(userName)) {
        joinInfo.error = `The name ${userName} is already taken`;
        socket.emit("join-response", joinInfo);
        return;
      }

      socket.on("typing", (typingInfo) => {
        const { roomName, userName, isTyping } = typingInfo;
        data.updateTypingStatus(roomName, userName, isTyping);
        
        // Get updated list and broadcast
        const typingUsers = data.getTypingUsers(roomName);
        io.to(roomName).emit("typing", typingUsers);
    });
  
      // Assign color and register user
      joinInfo.color = colors.getRandomColor();
      socket.data = joinInfo;
      data.registerUser(userName);
      socket.join(roomName);
  
      // Single disconnect handler
      const disconnectHandler = async () => {
        try {
            // Clear typing status first
            if (socket.data?.userName && socket.data?.roomName) {
                data.updateTypingStatus(socket.data.roomName, socket.data.userName, false);
                const typingUsers = data.getTypingUsers(socket.data.roomName);
                io.to(socket.data.roomName).emit("typing", typingUsers);
            }
    
            // Then proceed with normal disconnect cleanup
            data.unregisterUser(userName);
            colors.releaseColor(socket.data.color);
            
            const leaveMessage = { 
                sender: '', 
                text: `${userName} has left the room`,
                timestamp: Date.now(),
                color: socket.data.color  // Make sure to include color
            };
            
            data.addMessage(roomName, leaveMessage);
            await updateRoomUsers(roomName);
            io.to(roomName).emit("chat update", data.roomLog(roomName));
        } catch (error) {
            console.error("Error during disconnect:", error);
        }
    };
  
      
      socket.on("disconnect", disconnectHandler);
  
      // Welcome message
      const welcomeMessage = { 
        sender: '', 
        text: `${userName} has joined the room`, // Removed room name
        timestamp: Date.now()
      };
      data.addMessage(roomName, welcomeMessage);
      
      // Update room users first, then send chat update
      updateRoomUsers(roomName).then(() => {
        io.to(roomName).emit("chat update", data.roomLog(roomName));
      });
  
      // Message handler
      socket.on("message", text => {
        const { roomName, userName, color } = socket.data;
        const messageInfo = { 
          sender: userName, 
          text,
          color,
          timestamp: Date.now()
        };
        data.addMessage(roomName, messageInfo);
        io.to(roomName).emit("chat update", data.roomLog(roomName));
      });

      // Edit message handler
socket.on("edit", (editInfo) => {
  const { roomName, userName } = socket.data;
  const roomMessages = data.roomLog(roomName);
  
  // Find the user's last non-deleted message
  const userMessages = roomMessages.filter(
      msg => msg.sender === userName && !msg.deletedAt
  );
  
  if (userMessages.length > 0) {
      const lastMessage = userMessages[userMessages.length - 1];
      lastMessage.text = editInfo.newText.trim();
      lastMessage.editedAt = Date.now();
      io.to(roomName).emit("chat update", data.roomLog(roomName));
  }
});

// Delete message handler
socket.on("delete", () => {
  const { roomName, userName } = socket.data;
  const roomMessages = data.roomLog(roomName);
  
  // Find the user's last non-deleted message
  const userMessages = roomMessages.filter(
      msg => msg.sender === userName && !msg.deletedAt
  );
  
  if (userMessages.length > 0) {
      const lastMessage = userMessages[userMessages.length - 1];
      lastMessage.deletedAt = Date.now();
      io.to(roomName).emit("chat update", data.roomLog(roomName));
  }
});
  
      console.log(joinInfo);
      socket.emit("join-response", joinInfo);
    });
  });

  // Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    connections: io.engine?.clientsCount || 0
  });
});

// Metrics endpoint for Prometheus
app.get('/metrics', (req, res) => {
  const metrics = {
    active_connections: io.engine?.clientsCount || 0,
    total_messages: Object.values(data.roomLogs || {}).reduce((acc, room) => acc + (room?.length || 0), 0),
    active_rooms: Object.keys(data.roomLogs || {}).length,
    active_users: data.users?.size || 0
  };
  
  res.set('Content-Type', 'text/plain');
  res.send(`# HELP ezcomm_active_connections Current WebSocket connections
# TYPE ezcomm_active_connections gauge
ezcomm_active_connections ${metrics.active_connections}

# HELP ezcomm_total_messages Total messages sent
# TYPE ezcomm_total_messages counter
ezcomm_total_messages ${metrics.total_messages}

# HELP ezcomm_active_rooms Active chat rooms
# TYPE ezcomm_active_rooms gauge
ezcomm_active_rooms ${metrics.active_rooms}

# HELP ezcomm_active_users Active users
# TYPE ezcomm_active_users gauge
ezcomm_active_users ${metrics.active_users}`);
});

// Start the server listening on PORT, then call the callback (second argument)
httpServer.listen(PORT, () => console.log(`Listening on port ${PORT}`));