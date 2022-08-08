import { Injectable } from '@nestjs/common';
import { ConnectedSocket, MessageBody } from '@nestjs/websockets';
import { randomBytes } from 'crypto';
import { Server, Socket } from 'socket.io';
import { CreateLobbyDto } from './dto/create-lobby.dto';
import { JoinLobbyDto } from './dto/join-lobby.dto';
import { SelectGameDto } from './dto/select-game.dto';
import { UpdateLobbyDto } from './dto/update-lobby.dto';

interface IGameState {
  [key: string]: {
    players: string[];
    currentGame?: string;
    admin?: string;
  };
}
const game_state: IGameState = {};

@Injectable()
export class LobbyService {
  async create(
    createLobbyDto: CreateLobbyDto,
    @ConnectedSocket() client: Socket,
  ) {
    const roomCode = randomBytes(48).toString('hex').substr(0, 7);
    const rooms = Array.from(client.rooms);
    if (rooms.length >= 2) {
      return { error: 'You cannot join ' };
    }
    await client.join(roomCode);
    if (roomCode) {
      game_state[roomCode] = {
        players: [createLobbyDto.name],
        currentGame: '',
        admin: client.id,
      };
    }
    client.data.name = createLobbyDto.name;
    client.data.room = roomCode;

    console.log(game_state);

    return { roomCode };
  }

  async join(
    @MessageBody() joinLobbyDto: JoinLobbyDto,
    @ConnectedSocket() client: Socket,
  ) {
    const roomId = joinLobbyDto.roomCode;
    const rooms = Array.from(client.rooms);
    if (rooms.length >= 2) {
      return false;
    }
    await client.join(roomId);
    if (roomId) {
      game_state[roomId] = {
        ...game_state[roomId],
        players: [...game_state[roomId].players, joinLobbyDto.name],
      };
    }
    client.data.name = joinLobbyDto.name;
    client.data.room = joinLobbyDto.roomCode;
    console.log(game_state);
    return true;
  }

  async disconnection(@ConnectedSocket() client: Socket, server: Server) {
    const connectedRoom = client.data.room;
    const clientName = client.data.name;
    console.log(client.rooms);
    if (!game_state[connectedRoom]) {
      return;
    }
    server.in(connectedRoom).emit('disconnection');

    if (client.id !== game_state[connectedRoom].admin) {
      return;
    }
    const usersConnected = game_state[connectedRoom].players.length;
    const newAdmin = Math.floor(Math.random()) * usersConnected;
    const connectedSockets = await server.in(connectedRoom).fetchSockets();
    const connectedIds = [];
    for (const socket of connectedSockets) {
      connectedIds.push(socket.id);
    }
    const filteredUsers = game_state[connectedRoom].players.filter(
      (e) => e !== clientName,
    );
    game_state[connectedRoom] = {
      ...game_state[connectedRoom],
      admin: connectedIds[newAdmin],
      players: filteredUsers,
    };
    server.in(connectedRoom).to(connectedIds[newAdmin]).emit('newadmin');
    console.log(game_state);
  }
  selectGame(
    @ConnectedSocket() client: Socket,
    @MessageBody() gameName: SelectGameDto,
  ) {
    console.log(client.id, game_state);
    if (client.id !== game_state[gameName.roomCode].admin) {
      return { error: 'You cannot do those' };
    }
    game_state[gameName.roomCode].currentGame = gameName.name;
    client.broadcast.emit('gamemode', {
      mode: gameName.name,
    });
    console.log(game_state);
    return true;
  }
  gameState(@ConnectedSocket() client: Socket, server: Server) {
    const clientRoom = client.data.room;
    server.in(clientRoom).emit('gamestate', game_state[clientRoom]);
    console.log(game_state);
    return true;
  }
}
