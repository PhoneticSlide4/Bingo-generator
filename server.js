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

// In-memory store
// rooms = { roomId: { password, options, size, hostId, players: {}, spectators: {}, cards: {} } }
const rooms = {};

function createRoom({ roomId, password, options, size, hostSocketId }) {
  rooms[roomId] = {
    password,
    options,
    size,          // 3, 4, or 5
    hostId: hostSocketId,
    players: {},
    spectators: {},
    cards: {}
  };
}


function pickRandomItems(options, count) {
  const copy = [...options];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  if (copy.length < count) return copy; // if fewer options, just use all
  return copy.slice(0, count);
}


app.post("/create-room", (req, res) => {
  const { roomId, password, options, size } = req.body;

  if (!roomId || !password || !Array.isArray(options) || options.length < 1) {
    return res.status(400).json({ error: "Invalid room data" });
  }
  if (![3,4,5].includes(size)) {
    return res.status(400).json({ error: "Invalid size" });
  }
  if (rooms[roomId]) {
    return res.status(400).json({ error: "Room ID already exists" });
  }

  // host is not yet known here (host will join next), so store basic info
  rooms[roomId] = {
    password,
    options,
    size,
    hostId: null,
    players: {},
    spectators: {},
    cards: {}
  };

  res.json({ ok: true });
});


// Socket.IO for real‑time sync
io.on("connection", (socket) => {
  console.log("User connected", socket.id);

  socket.on("joinRoom", ({ roomId, password, name, color, role }, cb) => {
  const room = rooms[roomId];
  if (!room) return cb({ ok: false, error: "Room not found" });
  if (room.password !== password) return cb({ ok: false, error: "Wrong password" });

  socket.join(roomId);

  const displayName = name || "Player";
  const displayColor = color || "#ff0000";

  if (role === "spectator") {
    room.spectators[socket.id] = { name: displayName };
  } else {
    room.players[socket.id] = { name: displayName, color: displayColor };
    if (!room.hostId) {
      room.hostId = socket.id; // first player becomes host
    }
  }

  cb({
    ok: true,
    role,
    isHost: room.hostId === socket.id,
    size: room.size,
    options: room.options,
    card: room.cards[socket.id] || null,
    players: room.players,
    spectators: room.spectators
  });

  io.to(roomId).emit("roomState", {
    players: room.players,
    spectators: room.spectators,
    hostId: room.hostId
  });
});
socket.on("generateCards", ({ roomId }, cb) => {
  const room = rooms[roomId];
  if (!room) return cb({ ok: false, error: "Room not found" });
  if (room.hostId !== socket.id) {
    return cb({ ok: false, error: "Only host can generate cards" });
  }

  const size = room.size;
  const count = size * size;

  // generate card for each player
  Object.keys(room.players).forEach((sid) => {
    room.cards[sid] = pickRandomItems(room.options, count);
  });

  // send each player their own card privately
  Object.entries(room.cards).forEach(([sid, card]) => {
    io.to(sid).emit("cardGenerated", { card, size });
  });

  cb({ ok: true });
});
socket.on("deleteRoom", async ({ roomId }, cb) => {
  const room = rooms[roomId];
  if (!room) return cb({ ok: false, error: "Room not found" });
  if (room.hostId !== socket.id) {
    return cb({ ok: false, error: "Only host can delete this room" });
  }

  const sockets = await io.in(roomId).fetchSockets();
  sockets.forEach((s) => {
    s.emit("roomDeleted", { roomId });
    s.leave(roomId);
  });

  delete rooms[roomId];
  cb({ ok: true });
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