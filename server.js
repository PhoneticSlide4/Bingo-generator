// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

// In‑memory store: { roomId: { password, options, players: {socketId: {name,color}}, cards: {socketId: cardArray} } }
const rooms = {};

// Simple helper: pick 9 random items from an array
function pickNineRandom(options) {
  const copy = [...options];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, 9);
}

// Create room (HTTP POST from frontend)
app.post("/create-room", (req, res) => {
  const { roomId, password, options } = req.body;
  if (!roomId || !password || !Array.isArray(options) || options.length < 9) {
    return res.status(400).json({ error: "Invalid room data" });
  }
  if (rooms[roomId]) {
    return res.status(400).json({ error: "Room ID already exists" });
  }
  rooms[roomId] = {
    password,
    options,
    players: {},
    cards: {}
  };
  res.json({ ok: true });
});

// Socket.IO for real‑time sync
io.on("connection", (socket) => {
  console.log("User connected", socket.id);

  socket.on("joinRoom", ({ roomId, password, name, color }, cb) => {
    const room = rooms[roomId];
    if (!room) {
      return cb({ ok: false, error: "Room not found" });
    }
    if (room.password !== password) {
      return cb({ ok: false, error: "Wrong password" });
    }

    socket.join(roomId);

    room.players[socket.id] = { name: name || "Player", color: color || "#ff0000" };

    // Generate a 3×3 card for this player using room options
    const nine = pickNineRandom(room.options);
    room.cards[socket.id] = nine;

    cb({
      ok: true,
      card: nine,
      players: room.players
    });

    // Notify others that a new player joined
    socket.to(roomId).emit("playerJoined", {
      id: socket.id,
      name: room.players[socket.id].name,
      color: room.players[socket.id].color
    });
  });

  // Mark a cell (index 0–8) with player's color
  socket.on("markCell", ({ roomId, index }, cb) => {
    const room = rooms[roomId];
    if (!room) {
      return cb && cb({ ok: false, error: "Room not found" });
    }
    if (!room.cards[socket.id]) {
      return cb && cb({ ok: false, error: "Player has no card" });
    }

    const playerInfo = room.players[socket.id];
    if (!playerInfo) {
      return cb && cb({ ok: false, error: "Player not in room" });
    }

    // Broadcast mark to everyone in the room
    io.to(roomId).emit("cellMarked", {
      playerId: socket.id,
      color: playerInfo.color,
      index
    });

    cb && cb({ ok: true });
  });

  socket.on("disconnect", () => {
    console.log("User disconnected", socket.id);

    // Remove from any room
    for (const [roomId, room] of Object.entries(rooms)) {
      if (room.players[socket.id]) {
        delete room.players[socket.id];
        delete room.cards[socket.id];
        socket.to(roomId).emit("playerLeft", { id: socket.id });

        // Optional: delete empty room
        if (Object.keys(room.players).length === 0) {
          delete rooms[roomId];
        }
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Server running on http://localhost:" + PORT);
});