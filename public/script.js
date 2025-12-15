// public/script.js
const socket = io();

let currentRoomId = null;
let myCard = [];
let myColor = "#ff0000";

// DOM elements
const createRoomId = document.getElementById("createRoomId");
const createPassword = document.getElementById("createPassword");
const createName = document.getElementById("createName");
const createColor = document.getElementById("createColor");
const optionsInput = document.getElementById("optionsInput");
const createRoomBtn = document.getElementById("createRoomBtn");
const createStatus = document.getElementById("createStatus");

const joinRoomId = document.getElementById("joinRoomId");
const joinPassword = document.getElementById("joinPassword");
const joinName = document.getElementById("joinName");
const joinColor = document.getElementById("joinColor");
const joinRoomBtn = document.getElementById("joinRoomBtn");
const joinStatus = document.getElementById("joinStatus");

const gameSection = document.getElementById("gameSection");
const currentRoom = document.getElementById("currentRoom");
const playersList = document.getElementById("playersList");
const cardDiv = document.getElementById("card");
const params = new URLSearchParams(window.location.search);
const mode = params.get("mode") || "join"; // "host" / "join" / "spectate"



// Create room (HTTP)
createRoomBtn.addEventListener("click", async () => {
  const roomId = createRoomId.value.trim();
  const password = createPassword.value.trim();
  const name = createName.value.trim() || "Host";
  const color = createColor.value || "#ff0000";
  myColor = color;

  const rawOptions = optionsInput.value
    .split("")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (!roomId || !password) {
    createStatus.textContent = "Room ID and password required.";
    return;
  }
  if (rawOptions.length < 9) {
    createStatus.textContent = "Enter at least 9 options.";
    return;
  }

  try {
    const res = await fetch("/create-room", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roomId,
        password,
        options: rawOptions
      })
    });
    const data = await res.json();
    if (!data.ok) {
      createStatus.textContent = data.error || "Error creating room.";
      return;
    }
    createStatus.textContent = "Room created. Now join it below.";
    // Pre-fill join section
    joinRoomId.value = roomId;
    joinPassword.value = password;
    joinName.value = name;
    joinColor.value = color;
  } catch (e) {
    createStatus.textContent = "Network error.";
  }
});

// Join room (Socket.IO)
joinRoomBtn.addEventListener("click", () => {
  const roomId = joinRoomId.value.trim();
  const password = joinPassword.value.trim();
  const name = joinName.value.trim() || "Player";
  const color = joinColor.value || "#00aa00";
  myColor = color;

  if (!roomId || !password) {
    joinStatus.textContent = "Room ID and password required.";
    return;
  }

  socket.emit(
    "joinRoom",
    { roomId, password, name, color },
    (response) => {
      if (!response.ok) {
        joinStatus.textContent = response.error || "Failed to join room.";
        return;
      }
      joinStatus.textContent = "";
      currentRoomId = roomId;
      myCard = response.card;
      currentRoom.textContent = roomId;
      updatePlayersList(response.players);
      renderCard();
      gameSection.style.display = "block";
    }
  );
});

// Render 3x3 card
function renderCard(card, size) {
  cardDiv.innerHTML = "";
  cardDiv.style.gridTemplateColumns = `repeat(${size}, 1fr)`;

  card.forEach((text, index) => {
    const cell = document.createElement("div");
    cell.className = "cell";
    cell.dataset.index = index;

    const span = document.createElement("span");
    span.textContent = text; // full text, not single letter
    cell.appendChild(span);

    if (!isSpectator) {
      cell.addEventListener("click", () => {
        socket.emit("markCell", { roomId: currentRoomId, index }, () => {});
      });
    }

    cardDiv.appendChild(cell);
  });
}
socket.on("cardGenerated", ({ card, size }) => {
  myCard = card;
  currentSize = size;
  renderCard(card, size);
});
let isSpectator = false;
socket.emit("joinRoom", { roomId, password, name, color, role }, (res) => {
  isSpectator = res.role === "spectator";
  if (isSpectator) {
    document.getElementById("yourColorWrapper").style.display = "none";
  }
  // ...
});


// Update players list
function updatePlayersList(players) {
  playersList.innerHTML = "";
  Object.entries(players).forEach(([id, info]) => {
    const li = document.createElement("li");
    const colorBox = document.createElement("span");
    colorBox.style.display = "inline-block";
    colorBox.style.width = "12px";
    colorBox.style.height = "12px";
    colorBox.style.backgroundColor = info.color;
    colorBox.style.marginRight = "5px";
    li.appendChild(colorBox);
    li.appendChild(document.createTextNode(info.name + " (" + id.slice(0, 5) + "…)"));
    playersList.appendChild(li);
  });
}

// Socket events
socket.on("playerJoined", ({ id, name, color }) => {
  const li = document.createElement("li");
  const colorBox = document.createElement("span");
  colorBox.style.display = "inline-block";
  colorBox.style.width = "12px";
  colorBox.style.height = "12px";
  colorBox.style.backgroundColor = color;
  colorBox.style.marginRight = "5px";
  li.appendChild(colorBox);
  li.appendChild(document.createTextNode(name + " (" + id.slice(0, 5) + "…)"));
  playersList.appendChild(li);
});

socket.on("playerLeft", ({ id }) => {
  const children = Array.from(playersList.children);
  children.forEach((li) => {
    if (li.textContent.includes(id.slice(0, 5))) {
      playersList.removeChild(li);
    }
  });
});

// When any player colors a cell, color that index on *everyone's* board
socket.on("cellMarked", ({ playerId, color, index }) => {
  const cell = cardDiv.querySelector(`.cell[data-index="${index}"]`);
  if (cell) {
    cell.style.backgroundColor = color;
  }
});