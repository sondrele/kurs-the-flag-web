// eslint-disable no-console
import _ from 'lodash';
import * as websocket from 'websocket';
import http from 'http';

import PlayerService from '../service/player';
import RoundService from '../service/round';
import SimulationService from '../service/simulation';

const WebSocketServer = websocket.server;

const ipRegex = /((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?))/;

function register(ip, name) {
  PlayerService.register(ip, name);
}

function update(ip, color) {
  const { roundId, playerId } = RoundService.findLastActiveRoundDetails(ip) || {};

  if (roundId !== undefined) {
    console.log('Round update', roundId, ip, color);
    RoundService.update(roundId, playerId, color);
  } else {
    console.log('Simulation update', ip, color);
    SimulationService.update(ip, 0, color);
  }
}

function handleMessage(ip, { type, name, color }) {
  switch (type) {
    case 'register':
      register(ip, name);
      break;
    case 'update':
      update(ip, color);
      break;
    default:
      break;
  }
}

const server = http.createServer((request, response) => {
  console.log(`${new Date()} Received request for ${request.url}`);
  response.writeHead(404);
  response.end();
});

server.listen(3004, () => console.log(`${new Date()} Server is listening on port 3004`));

const wsServer = new WebSocketServer({
  httpServer: server,
  autoAcceptConnections: false,
});

function accept(request) {
  try {
    const connection = request.accept(null, request.origin);
    console.log(`${new Date()} Connection accepted.`);
    return connection;
  } catch (e) {
    console.log('Could not accept connection:', e);
  }
  return undefined;
}

wsServer.on('request', (request) => {
  const connection = accept(request);

  if (!connection) {
    return;
  }

  if (!connection.socket.remoteAddress.match(ipRegex)) {
    return;
  }

  const ip = connection.socket.remoteAddress.match(ipRegex)[0];
  console.log(`Connected to: ${ip}`);

  const onSimulationUpdate = clientIp => {
    if (ip === clientIp && !RoundService.findLastActiveRoundDetails(ip)) {
      const status = SimulationService.status(ip);
      const message = {
        type: 'status',
        isActive: true,
        status: _.map(status, 'color'),
      };
      connection.send(JSON.stringify(message));
    }
  };

  const onRoundUpdate = roundId => {
    if (RoundService.findLastActiveRoundDetails(ip).roundId === roundId) {
      const status = RoundService.status(roundId);
      const message = {
        type: 'status',
        isActive: RoundService.isActive(roundId),
        status: _.map(status, 'color'),
      };
      connection.send(JSON.stringify(message));
    }
  };

  const onRoundStop = roundId => {
    const roundDetails = RoundService.findLastRoundDetails(ip);

    if (String(roundDetails.roundId) === roundId) {
      const status = RoundService.status(roundId);
      const message = {
        type: 'status',
        isActive: false,
        status: _.map(status, 'color'),
      };
      connection.send(JSON.stringify(message));
    }
  };

  SimulationService.onUpdate(onSimulationUpdate);
  RoundService.on('start', onRoundUpdate);
  RoundService.on('update', onRoundUpdate);
  RoundService.on('stop', onRoundStop);

  connection.on('message', message => {
    if (message.type === 'utf8') {
      try {
        const action = JSON.parse(message.utf8Data);
        handleMessage(ip, action);
      } catch (e) {
        console.log('Recevied non-JSON message', message);
      }
    } else if (message.type === 'binary') {
      console.log('Recevied non-JSON message', message);
    }
  });

  connection.on('close', () => {
    SimulationService.offUpdate(onSimulationUpdate);
    RoundService.off('start', onRoundUpdate);
    RoundService.off('update', onRoundUpdate);
    RoundService.off('stop', onRoundUpdate);
    console.log(`${new Date()} Peer ${connection.remoteAddress} disconnected.`);
  });
});
