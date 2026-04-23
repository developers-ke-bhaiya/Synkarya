const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" },
});

const users = {};

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join", (username) => {
    users[socket.id] = username;
    io.emit("users_list", users);
  });

  socket.on("sync_request", ({ from, to }) => {
    if (users[to]) {
      const roomId = socket.id + "-" + to;

      io.to(to).emit("sync_alert", {
        from,
        roomId,
      });
    }
  });

  socket.on("join_room", (roomId) => {
    socket.join(roomId);
    console.log(socket.id, "joined", roomId);
  });

  // 🔥 CORRECT SIGNALING (VERY IMPORTANT)
  socket.on("offer", ({ roomId, offer }) => {
    socket.to(roomId).emit("offer", { offer });
  });

  socket.on("answer", ({ roomId, answer }) => {
    socket.to(roomId).emit("answer", { answer });
  });

  socket.on("ice-candidate", ({ roomId, candidate }) => {
    socket.to(roomId).emit("ice-candidate", { candidate });
  });

  socket.on("end_call", ({ roomId }) => {
    io.to(roomId).emit("call_ended");
  });

  socket.on("disconnect", () => {
    delete users[socket.id];
    io.emit("users_list", users);
  });
});

server.listen(5000, () => {
  console.log("🚀 Server running on 5000");
});