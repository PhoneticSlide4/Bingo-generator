// public/room.js
// Client-side logic for room.html

const socket = io(); // connects to same origin server [web:242][web:243]

// DOM elements
const subtitleText = document.getElementById("subtitleText");
const leftTitle = document.getElementById("leftTitle");
const leftSub = document.getElementById("leftSub");

const joinForm = document.getElementById("joinForm");
const joinRoomIdInput = document.getElementById("joinRoomId");
const joinPasswordInput = document.getElementById("joinPassword");
const joinNameInput = document.getElementById("joinName");
const joinColorInput = document.getElementById("joinColor");
const colorWrapper = document.getElementById("colorWrapper");
const joinRoomBtn = document.getElementById("joinRoomBtn");
const joinStatus = document.getElementById("joinStatus");

const hostControls = document.getElementById("hostControls");
const generateCardsBtn = document.getElementById("generateCardsBtn");
const deleteRoomBtn = document.getElementById("deleteRoomBtn");
const hostStatus = document.getElementById("hostStatus");

const gameSection = document.getElementById("gameSection");
const currentRoomSpan = document.getElementById("currentRoom");
const youLabel = document.getElementById("youLabel");
const playersList = document.getElementById("playersList");
const spectatorsList = document.getElementById("spectatorsList");

const cardDiv = document.getElementById("card");
const cardHint = document.getElementById("cardHint");

// State
let mode = "join";          // "host" | "join" | "spectate"
let role = "player";        // "player" | "spectator"
let currentRoomId = null;
let myName = "Player";
let myColor = "#22c55e";
let isHost = false;
let isJoined = false;
let currentSize = 3;
let isSpectator = false;

// Helpers

function readQueryParams() {
  const params = new URLSearchParams(window.location.search); // [web:249][web:251]
  mode = params.get("mode") || "join";

  if (mode === "host") {
    subtitleText.textContent = "You are hosting this bingo room.";
    leftTitle.textContent = "Host: Room Details";
    leftSub.textContent = "These details were used to create the room.";
  } else if (mode === "spectate") {
    subtitleText.textContent = "Join a room as a spectator (view only).";
    leftTitle.textContent = "Join as Spectator";
    leftSub.textContent = "You will see the game but cannot mark cells.";
    colorWrapper.style.display = "none";
    role = "spectator";
  } else {
    subtitleText.textContent = "Join an existing bingo room as a player.";
    leftTitle.textContent = "Join as Player";
    leftSub.textContent = "Ask the host for the room ID and password.";
  }

  // If coming from create.html as host, pre-fill fields
  if (mode === "host") {
    const roomId = params.get("roomId") || "";
    const password = params.get("password") || "";
    const name = params.get("name") || "Host";
    const color = params.get("color") || "#ff4d4d";

    joinRoomIdInput.value = roomId;
    joinPasswordInput.value = password;
    joinNameInput.value = name;
    joinColorInput.value = color;

    myName = name;
    myColor = color;
  }
}

function updateYouLabel() {
  if (!youLabel) return;
  const roleText = isSpectator ? "Spectator" : (isHost ? "Host" : "Player");
  youLabel.innerHTML =
    'You (' + roleText + '): <span style="color:' + myColor + ';">' +
    myName + "</span>";
}

function setJoinStatus(text, isError = true) {
  joinStatus.textContent = text;
  joinStatus.className = "status " + (isError ? "error" : "success");
}

function setHostStatus(text, isError = true) {
  hostStatus.textContent = text;
  hostStatus.className = "status " + (isError ? "error" : "success");
}

function updateLists(players, spectators) {
  playersList.innerHTML = "";
  Object.entries(players || {}).forEach(([id, info]) => {
    const li = document.createElement("li");
    const dot = document.createElement("span");
    dot.className = "player-dot";
    dot.style.backgroundColor = info.color || "#ffffff";
    li.appendChild(dot);
    li.appendChild(
      document.createTextNode(" " + info.name + " (" + id.slice(0, 4) + "…)")
    );
    playersList.appendChild(li);
  });

  spectatorsList.innerHTML = "";
  Object.entries(spectators || {}).forEach(([id, info]) => {
    const li = document.createElement("li");
    li.appendChild(
      document.createTextNode((info.name || "Spectator") + " (" + id.slice(0, 4) + "…)")
    );
    spectatorsList.appendChild(li);
  });
}

// Render bingo card
function renderCard(card, size) {
  currentSize = size;
  cardDiv.innerHTML = "";
  if (!card || card.length === 0) {
    cardHint.textContent = "Waiting for host to generate cards...";
    return;
  }

  cardDiv.style.gridTemplateColumns = `repeat(${size}, 1fr)`;

  card.forEach((text, index) => {
    const cell = document.createElement("div");
    cell.className = "cell";
    cell.dataset.index = index;

    const span = document.createElement("span");
    span.textContent = text; // full phrase
    cell.appendChild(span);

    if (!isSpectator) {
      cell.addEventListener("click", () => {
        if (!currentRoomId) return;
        socket.emit("markCell", { roomId: currentRoomId, index }, (res) => {
          if (res && !res.ok && res.error) {
            console.log("markCell error:", res.error);
          }
        });
      });
    }

    cardDiv.appendChild(cell);
  });

  cardHint.textContent = "Click cells to mark them with your color.";
}

// Join room

async function joinRoom() {
  if (isJoined) return;

  const roomId = joinRoomIdInput.value.trim();
  const password = joinPasswordInput.value.trim();
  const name = joinNameInput.value.trim() || (role === "spectator" ? "Spectator" : "Player");
  const color = role === "spectator"
    ? "#ffffff"
    : (joinColorInput.value || "#22c55e");

  if (!roomId || !password) {
    setJoinStatus("Room ID and password are required.");
    return;
  }

  myName = name;
  myColor = color;
  isSpectator = role === "spectator";

  socket.emit(
    "joinRoom",
    { roomId, password, name, color, role },
    (res) => {
      if (!res || !res.ok) {
        setJoinStatus(res && res.error ? res.error : "Failed to join room.");
        return;
      }

      isJoined = true;
      currentRoomId = roomId;
      isHost = !!res.isHost;
      currentSize = res.size || 3;

      updateYouLabel();
      setJoinStatus("Joined room successfully.", false);

      currentRoomSpan.textContent = roomId;
      updateLists(res.players, res.spectators);

      if (res.card) {
        renderCard(res.card, currentSize);
      } else {
        renderCard([], currentSize);
      }

      gameSection.style.display = "block";
      if (isHost) {
        hostControls.style.display = "block";
      }

      // For host-mode auto-join, hide join form after join
      if (mode === "host") {
        joinForm.style.opacity = "0.6";
        joinForm.querySelectorAll("input,button").forEach(el => el.disabled = true);
      }
    }
  );
}

// Event handlers

joinRoomBtn.addEventListener("click", () => {
  joinRoom();
});

// If mode=host and URL contains room data, auto-join
window.addEventListener("load", () => {
  readQueryParams();

  if (mode === "host") {
    // auto-join after a short delay to ensure socket connected
    setTimeout(joinRoom, 200);
  }
});

// Host controls

if (generateCardsBtn) {
  generateCardsBtn.addEventListener("click", () => {
    if (!currentRoomId) {
      setHostStatus("You must be in a room to generate cards.");
      return;
    }
    socket.emit("generateCards", { roomId: currentRoomId }, (res) => {
      if (!res || !res.ok) {
        setHostStatus(res && res.error ? res.error : "Failed to generate cards.");
      } else {
        setHostStatus("Cards generated.", false);
      }
    });
  });
}

if (deleteRoomBtn) {
  deleteRoomBtn.addEventListener("click", () => {
    if (!currentRoomId) {
      setHostStatus("You must be in a room to delete it.");
      return;
    }
    if (!confirm("Are you sure you want to delete this room for everyone?")) {
      return;
    }
    socket.emit("deleteRoom", { roomId: currentRoomId }, (res) => {
      if (!res || !res.ok) {
        setHostStatus(res && res.error ? res.error : "Failed to delete room.");
      } else {
        setHostStatus("Room deleted. Returning to home…", false);
        setTimeout(() => {
          window.location.href = "home.html";
        }, 1000);
      }
    });
  });
}

// Socket listeners

socket.on("roomState", ({ players, spectators, hostId }) => {
  updateLists(players, spectators);
  isHost = hostId === socket.id;
  if (isJoined) {
    hostControls.style.display = isHost ? "block" : "none";
  }
  updateYouLabel();
});

socket.on("cardGenerated", ({ card, size }) => {
  renderCard(card, size || currentSize);
});

socket.on("cellMarked", ({ playerId, color, index }) => {
  const cell = cardDiv.querySelector(`.cell[data-index="${index}"]`);
  if (cell) {
    cell.style.backgroundColor = color;
  }
});

socket.on("roomDeleted", ({ roomId }) => {
  alert("Room " + roomId + " was deleted by the host.");
  window.location.href = "home.html";
});

// Optional: handle disconnect
socket.on("disconnect", () => {
  if (isJoined) {
    setJoinStatus("Disconnected from server.", true);
  }
});
