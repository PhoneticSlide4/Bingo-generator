// public/create.js
const btn = document.getElementById("createRoomBtn");
const statusEl = document.getElementById("createStatus");

btn.addEventListener("click", async () => {
  const roomId = document.getElementById("createRoomId").value.trim();
  const password = document.getElementById("createPassword").value.trim();
  const name = document.getElementById("createName").value.trim() || "Host";
  const color = document.getElementById("createColor").value || "#ff4d4d";
  const size = parseInt(document.getElementById("createSize").value, 10);
  const options = document
    .getElementById("optionsInput")
    .value.split("\n")
    .map(s => s.trim())
    .filter(Boolean);

  if (!roomId || !password) {
    statusEl.textContent = "Room ID and password are required.";
    statusEl.className = "status error";
    return;
  }
  if (![3,4,5].includes(size)) {
    statusEl.textContent = "Invalid bingo size.";
    statusEl.className = "status error";
    return;
  }
  if (options.length < 1) {
    statusEl.textContent = "Enter at least one bingo option.";
    statusEl.className = "status error";
    return;
  }

  try {
    const res = await fetch("/create-room", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId, password, options, size })
    });
    const data = await res.json();
    if (!data.ok) {
      statusEl.textContent = data.error || "Failed to create room.";
      statusEl.className = "status error";
      return;
    }

    // success: go to room as host
    statusEl.textContent = "Room created. Redirecting...";
    statusEl.className = "status success";

    const params = new URLSearchParams({
      mode: "host",
      roomId,
      password,
      name,
      color
    });
    window.location.href = "room.html?" + params.toString();
  } catch (e) {
    statusEl.textContent = "Network error.";
    statusEl.className = "status error";
  }
});
