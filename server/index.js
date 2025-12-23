import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import Game from './game.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Serve static files (Priority over socket.io handling for root path)
app.use(express.static(path.join(__dirname, '../dist')));

const PORT = process.env.PORT || 3000;
const game = new Game();

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  const player = game.addPlayer(socket.id);
  socket.emit('init', { 
      id: socket.id,
      arenaSize: game.arenaSize,
      players: game.players,
      foods: game.foods
  });

  socket.on('input', (data) => {
      game.processInput(socket.id, data);
  });
  
  socket.on('joinGame', (name) => {
      game.spawnPlayer(socket.id, name);
  });

  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    game.removePlayer(socket.id);
    io.emit('playerLeft', socket.id);
  });
});

const TICK_RATE = 20;
let tickCount = 0;
setInterval(() => {
    const state = game.update();
    io.emit('gameState', state);
    
    tickCount++;
    if (tickCount % 100 === 0) {
        const aliveCount = state.players.length;
        const totalCount = Object.keys(game.players).length;
        console.log(`Tick ${tickCount}: ${totalCount} connected, ${aliveCount} playing`);
    }
}, 1000 / TICK_RATE);

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});