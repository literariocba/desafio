import express, { Request, Response } from 'express';
import http from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import * as Redis from 'redis';
import { promisify } from 'util';
import dotenv from 'dotenv';
import { RoomConfig } from './types';
import { Coin } from './Coin';



dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server);
const redis = Redis.createClient({
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT, 10) : 6379,
  });
const getAsync = promisify(redis.get).bind(redis);
const setAsync = promisify(redis.set).bind(redis);
const delAsync = promisify(redis.del).bind(redis);

const rooms: RoomConfig[] = [
  {
    id: 'room1',
    coinCount: 10,
    area: {
      xmin: 0,
      xmax: 10,
      ymin: 0,
      ymax: 10,
      zmin: 0,
      zmax: 10,
    },
  },
  // Puedes agregar más configuraciones de rooms aquí
];

// Generar las monedas para una room específica
async function generateCoins(roomId: string) {
  const roomConfig = rooms.find((room) => room.id === roomId);
  if (!roomConfig) {
    throw new Error('Room not found');
  }

  const coins: Coin[] = [];
  for (let i = 0; i < roomConfig.coinCount; i++) {
    const coin: Coin = {
      id: `coin_${roomId}_${i}`,
      position: {
        x: getRandomNumber(roomConfig.area.xmin, roomConfig.area.xmax),
        y: getRandomNumber(roomConfig.area.ymin, roomConfig.area.ymax),
        z: getRandomNumber(roomConfig.area.zmin, roomConfig.area.zmax),
      },
    };
    coins.push(coin);
  }

  await setAsync(roomId, JSON.stringify(coins));
  return coins;
}

// Obtener las monedas disponibles para una room específica
async function getAvailableCoins(roomId: string) {
  const coinsString = await getAsync(roomId);
  return coinsString ? JSON.parse(coinsString) : [];
}

// Eliminar una moneda de las disponibles
async function removeCoin(roomId: string, coinId: string) {
  const coinsString = await getAsync(roomId);
  if (!coinsString) {
    throw new Error('Room not found or coins expired');
  }

  const coins = JSON.parse(coinsString) as Coin[];
  const remainingCoins = coins.filter((coin) => coin.id !== coinId);
  if (remainingCoins.length === coins.length) {
    throw new Error('Coin not found');
  }

  await setAsync(roomId, JSON.stringify(remainingCoins));
}

// Generar las monedas y programar su eliminación después de 1 hora
async function generateAndExpireCoins() {
  for (const room of rooms) {
    const coins = await generateCoins(room.id);
    setTimeout(async () => {
      await delAsync(room.id);
      console.log(`Expired coins for room: ${room.id}`);
    }, 3600000); // 1 hora en milisegundos
    console.log(`Generated coins for room: ${room.id}`);
    console.log(coins);
  }
}

// Función de utilidad para generar números aleatorios
function getRandomNumber(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Configurar los puntos de enlace de la API REST
app.get('/api/rooms/:roomId/coins', async (req: Request, res: Response) => {
  try {
    const roomId = req.params.roomId;
    const coins = await getAvailableCoins(roomId);
    res.json(coins);
  } catch (error: any) {
    const err = error as Error;
    res.status(500).json({ error: err.message });
  }
});

// Configurar los eventos del socket
io.on('connection', (socket: Socket) => {
  console.log('New client connected:', socket.id);

  socket.on('joinRoom', (roomId: string) => {
    socket.join(roomId);
    console.log(`Client ${socket.id} joined room: ${roomId}`);
    socket.emit('roomJoined', roomId);
  });

  socket.on('getCoins', async (roomId: string) => {
    try {
      const coins = await getAvailableCoins(roomId);
      socket.emit('coins', coins);
    } catch (error: any) {
      const err = error as Error;
      socket.emit('error', err.message);
    }
  });

  socket.on('coinCollected', async (roomId: string, coinId: string) => {
    try {
      await removeCoin(roomId, coinId);
      socket.to(roomId).emit('coinCollected', coinId);
      console.log(`Coin ${coinId} collected in room: ${roomId}`);
    } catch (error: any) {
      const err = error as Error;
      socket.emit('error', err.message);
    }
  });
});

// Iniciar el servidor
const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`Server listening on port ${port}`);
  generateAndExpireCoins();
});