import express from 'express';
import PlayerService from '../service/player';

const server = express();

server.post('/register', (req, res) => {
  const { player } = req.body;

  const id = PlayerService.create(player);

  res.json({ id });
  res.end();
});

server.get('/list', (req, res) => {
  const players = PlayerService.list();

  res.json(players);
  res.end();
});

export default server;
