const path = require('path');
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: '*' },
});

app.use(express.static(path.join(__dirname, 'public')));

const arenas = new Map();
const socketContexts = new Map();

function arenaRoom(code) {
  return `arena:${code}`;
}

function generateArenaCode() {
  const alphabet = '3456789ABCDEFGHJKMNPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 5; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

function generateUniqueArenaCode() {
  let code;
  do {
    code = generateArenaCode();
  } while (arenas.has(code));
  return code;
}

function generateTeamId(arena) {
  let id;
  do {
    id = Math.floor(100000 + Math.random() * 900000);
  } while (arena.teamScores[id]);
  return id;
}

function buildState(arena) {
  return {
    arenaCode: arena.code,
    questionState: arena.questionState,
    buzzOrder: arena.buzzOrder,
    challengeBuzzOrder: arena.challengeBuzzOrder,
    currentAnsweringTeam: arena.currentAnsweringTeam,
    wrongAnswerTeamId: arena.wrongAnswerTeamId,
    challengeAvailable: arena.challengeAvailable,
    teamScores: arena.teamScores,
    teamNames: arena.teamNames,
    leaderboardFrozen: arena.leaderboardFrozen,
  };
}

function emitState(arena) {
  io.to(arenaRoom(arena.code)).emit('state-sync', buildState(arena));
}

function emitStateToSocket(socket, arena) {
  socket.emit('state-sync', buildState(arena));
}

function emitScoreUpdate(arena) {
  io.to(arenaRoom(arena.code)).emit('score-update', {
    teamScores: arena.teamScores,
    teamNames: arena.teamNames,
  });
}

function resetForNextQuestion(arena, { clearTeams = false } = {}) {
  arena.buzzOrder = [];
  arena.challengeBuzzOrder = [];
  arena.currentAnsweringTeam = null;
  arena.wrongAnswerTeamId = null;
  arena.challengeAvailable = false;
  arena.questionState = 'idle';
  arena.hasEvaluatedAnswer = false;
  arena.hasEvaluatedChallenge = false;

  if (clearTeams) {
    arena.teamScores = {};
    arena.teamNames = {};
  }

  emitState(arena);
  emitScoreUpdate(arena);

  io.to(arenaRoom(arena.code)).emit('state-reset', {
    teamScores: arena.teamScores,
    teamNames: arena.teamNames,
    buzzOrder: arena.buzzOrder,
    challengeBuzzOrder: arena.challengeBuzzOrder,
    currentAnsweringTeam: arena.currentAnsweringTeam,
    wrongAnswerTeamId: arena.wrongAnswerTeamId,
    challengeAvailable: arena.challengeAvailable,
  });
}

function removeTeamFromArena(arena, teamId) {
  if (!arena.teamScores[teamId]) return;

  delete arena.teamScores[teamId];
  delete arena.teamNames[teamId];

  arena.buzzOrder = arena.buzzOrder.filter((entry) => entry.id !== teamId);
  arena.challengeBuzzOrder = arena.challengeBuzzOrder.filter((entry) => entry.id !== teamId);

  if (arena.currentAnsweringTeam === teamId) {
    arena.currentAnsweringTeam = null;
  }
  if (arena.wrongAnswerTeamId === teamId) {
    arena.wrongAnswerTeamId = null;
  }
}

function getAdminContext(arena) {
  if (!arena || !arena.adminSocketId) return null;
  return socketContexts.get(arena.adminSocketId) || null;
}

function recordWinner(arena, winnerName) {
  const adminCtx = getAdminContext(arena);
  if (!adminCtx) return;

  adminCtx.previousWinners = adminCtx.previousWinners || [];
  adminCtx.previousWinners.unshift({ name: winnerName, timestamp: Date.now() });
  if (adminCtx.previousWinners.length > 20) {
    adminCtx.previousWinners = adminCtx.previousWinners.slice(0, 20);
  }
}

function cleanupArena(arena, reason = 'closed') {
  if (!arena) return;

  const room = arenaRoom(arena.code);
  io.to(room).emit('arena-closed', { reason, code: arena.code });

  io.in(room).socketsLeave(room);

  socketContexts.forEach((ctx, socketId) => {
    if (ctx.arenaCode === arena.code) {
      if (ctx.role === 'admin') {
        ctx.arenaCode = null;
      } else {
        socketContexts.delete(socketId);
      }
    }
  });

  arenas.delete(arena.code);
}

function leaveExistingArena(socket) {
  const ctx = socketContexts.get(socket.id);
  if (ctx && ctx.arenaCode) {
    socket.leave(arenaRoom(ctx.arenaCode));
  }
}

io.on('connection', (socket) => {
  socket.on('admin-create-arena', ({ adminName }) => {
    const trimmedName = (adminName || '').trim();
    if (!trimmedName) {
      socket.emit('arena-error', { message: 'Admin name is required.' });
      return;
    }

    leaveExistingArena(socket);

    const existingCtx = socketContexts.get(socket.id);
    if (existingCtx && existingCtx.arenaCode) {
      const existingArena = arenas.get(existingCtx.arenaCode);
      if (existingArena) {
        cleanupArena(existingArena, 'replaced');
      }
    }

    const code = generateUniqueArenaCode();
    const arena = {
      code,
      adminSocketId: socket.id,
      adminName: trimmedName,
      teamScores: {},
      teamNames: {},
      buzzOrder: [],
      challengeBuzzOrder: [],
      currentAnsweringTeam: null,
      wrongAnswerTeamId: null,
      leaderboardFrozen: false,
      questionState: 'idle',
      challengeAvailable: false,
      hasEvaluatedAnswer: false,
      hasEvaluatedChallenge: false,
    };

    arenas.set(code, arena);

    const ctx = socketContexts.get(socket.id) || { role: 'admin' };
    ctx.role = 'admin';
    ctx.adminName = trimmedName;
    ctx.arenaCode = code;
    ctx.previousWinners = ctx.previousWinners || [];
    socketContexts.set(socket.id, ctx);

    socket.join(arenaRoom(code));

    socket.emit('arena-created', {
      code,
      adminName: trimmedName,
      previousWinners: ctx.previousWinners,
    });

    emitStateToSocket(socket, arena);
    emitScoreUpdate(arena);
  });

  socket.on('participant-join-arena', ({ code, name }) => {
    const trimmedName = (name || '').trim();
    const formattedCode = (code || '').trim().toUpperCase();

    if (!trimmedName) {
      socket.emit('join-error', { message: 'Team name is required.' });
      return;
    }

    if (!formattedCode) {
      socket.emit('join-error', { message: 'Arena code is required.' });
      return;
    }

    const arena = arenas.get(formattedCode);
    if (!arena) {
      socket.emit('join-error', { message: 'Invalid arena code. Please check with the admin.' });
      return;
    }

    leaveExistingArena(socket);

    const teamId = generateTeamId(arena);
    arena.teamNames[teamId] = trimmedName;
    arena.teamScores[teamId] = 0;

    socketContexts.set(socket.id, {
      role: 'team',
      arenaCode: arena.code,
      teamId,
      teamName: trimmedName,
    });

    socket.join(arenaRoom(arena.code));

    socket.emit('participant-join-success', {
      teamId,
      teamName: trimmedName,
      arenaCode: arena.code,
    });

    emitScoreUpdate(arena);
    emitStateToSocket(socket, arena);
    io.to(arenaRoom(arena.code)).emit('team-update', {
      teamId,
      name: trimmedName,
      score: arena.teamScores[teamId],
    });
  });

  socket.on('buzz', () => {
    const ctx = socketContexts.get(socket.id);
    if (!ctx || ctx.role !== 'team' || !ctx.arenaCode) return;

    const arena = arenas.get(ctx.arenaCode);
    if (!arena) return;

    const teamId = ctx.teamId;
    const displayName = arena.teamNames[teamId] || ctx.teamName || `Team ${teamId}`;

    if (arena.questionState === 'open') {
      if (arena.buzzOrder.find((entry) => entry.id === teamId)) return;

      arena.buzzOrder.push({ id: teamId, name: displayName });

      if (arena.buzzOrder.length === 1) {
        arena.currentAnsweringTeam = teamId;
      }

      io.to(arenaRoom(arena.code)).emit('buzz-update', {
        buzzOrder: arena.buzzOrder,
        currentAnsweringTeam: arena.currentAnsweringTeam,
      });
    } else if (arena.questionState === 'challenge') {
      if (teamId === arena.wrongAnswerTeamId) return;
      if (arena.challengeBuzzOrder.find((entry) => entry.id === teamId)) return;

      arena.challengeBuzzOrder.push({ id: teamId, name: displayName });

      io.to(arenaRoom(arena.code)).emit('challenge-buzz-update', {
        challengeBuzzOrder: arena.challengeBuzzOrder,
      });
    }
  });

  socket.on('admin-start-question', () => {
    const ctx = socketContexts.get(socket.id);
    if (!ctx || ctx.role !== 'admin' || !ctx.arenaCode) return;

    const arena = arenas.get(ctx.arenaCode);
    if (!arena) return;

    if (arena.questionState === 'open') return;

    arena.questionState = 'open';
    arena.buzzOrder = [];
    arena.challengeBuzzOrder = [];
    arena.currentAnsweringTeam = null;
    arena.wrongAnswerTeamId = null;
    arena.challengeAvailable = false;
    arena.hasEvaluatedAnswer = false;
    arena.hasEvaluatedChallenge = false;

    emitState(arena);
    io.to(arenaRoom(arena.code)).emit('question-started', {
      questionState: arena.questionState,
    });
  });

  socket.on('admin-evaluate-answer', ({ result }) => {
    const ctx = socketContexts.get(socket.id);
    if (!ctx || ctx.role !== 'admin' || !ctx.arenaCode) return;

    const arena = arenas.get(ctx.arenaCode);
    if (!arena) return;
    if (arena.questionState !== 'open') return;
    if (!arena.currentAnsweringTeam) return;
    if (arena.hasEvaluatedAnswer) return;

    if (result === 'correct') {
      const winningTeam = arena.currentAnsweringTeam;
      arena.teamScores[winningTeam] = (arena.teamScores[winningTeam] || 0) + 10;
      arena.hasEvaluatedAnswer = true;
      arena.questionState = 'closed';
      arena.challengeAvailable = false;
      arena.wrongAnswerTeamId = null;
      arena.currentAnsweringTeam = null;

      emitScoreUpdate(arena);
      io.to(arenaRoom(arena.code)).emit('question-ended', {
        reason: 'answered',
        winningTeam: arena.teamNames[winningTeam] || null,
      });
    } else if (result === 'wrong') {
      const answeringTeam = arena.currentAnsweringTeam;
      arena.teamScores[answeringTeam] = (arena.teamScores[answeringTeam] || 0) - 5;
      arena.hasEvaluatedAnswer = true;
      arena.questionState = 'closed';
      arena.challengeAvailable = true;
      arena.wrongAnswerTeamId = answeringTeam;
      arena.challengeBuzzOrder = [];
      arena.currentAnsweringTeam = null;

      emitScoreUpdate(arena);
      io.to(arenaRoom(arena.code)).emit('challenge-available', {
        wrongAnswerTeamId: answeringTeam,
        wrongTeamName: arena.teamNames[answeringTeam] || null,
        buzzOrder: arena.buzzOrder,
      });
    }
  });

  socket.on('admin-open-challenge', () => {
    const ctx = socketContexts.get(socket.id);
    if (!ctx || ctx.role !== 'admin' || !ctx.arenaCode) return;

    const arena = arenas.get(ctx.arenaCode);
    if (!arena || !arena.challengeAvailable) return;

    arena.challengeAvailable = false;
    arena.questionState = 'challenge';
    arena.challengeBuzzOrder = [];

    io.to(arenaRoom(arena.code)).emit('challenge-open', {
      currentAnsweringTeam: arena.currentAnsweringTeam,
      buzzOrder: arena.buzzOrder,
      wrongAnswerTeamId: arena.wrongAnswerTeamId,
    });
  });

  socket.on('admin-evaluate-challenge', ({ team, result }) => {
    const ctx = socketContexts.get(socket.id);
    if (!ctx || ctx.role !== 'admin' || !ctx.arenaCode) return;

    const arena = arenas.get(ctx.arenaCode);
    if (!arena) return;
    if (arena.questionState !== 'challenge') return;
    if (arena.hasEvaluatedChallenge) return;
    if (!team) return;

    if (!Object.prototype.hasOwnProperty.call(arena.teamScores, team)) {
      socket.emit('arena-error', { message: 'Selected team is not part of this arena.' });
      return;
    }

    if (result === 'correct') {
      arena.teamScores[team] = (arena.teamScores[team] || 0) + 20;
    } else if (result === 'wrong') {
      arena.teamScores[team] = (arena.teamScores[team] || 0) - 20;
    }

    arena.hasEvaluatedChallenge = true;
    arena.questionState = 'closed';
    arena.challengeBuzzOrder = [];
    arena.challengeAvailable = false;
    arena.wrongAnswerTeamId = null;

    emitScoreUpdate(arena);
    io.to(arenaRoom(arena.code)).emit('question-ended', {
      reason: 'challenge',
      winningTeam: result === 'correct' ? (arena.teamNames[team] || null) : null,
    });
  });

  socket.on('admin-next-question', () => {
    const ctx = socketContexts.get(socket.id);
    if (!ctx || ctx.role !== 'admin' || !ctx.arenaCode) return;

    const arena = arenas.get(ctx.arenaCode);
    if (!arena) return;

    resetForNextQuestion(arena);
  });

  socket.on('admin-set-leaderboard-frozen', ({ frozen }) => {
    const ctx = socketContexts.get(socket.id);
    if (!ctx || ctx.role !== 'admin' || !ctx.arenaCode) return;

    const arena = arenas.get(ctx.arenaCode);
    if (!arena) return;

    arena.leaderboardFrozen = !!frozen;
    io.to(arenaRoom(arena.code)).emit('leaderboard-freeze-update', {
      leaderboardFrozen: arena.leaderboardFrozen,
    });
  });

  socket.on('admin-request-winners', () => {
    const ctx = socketContexts.get(socket.id);
    if (!ctx || ctx.role !== 'admin') return;

    const winners = ctx.previousWinners || [];
    socket.emit('previous-winners', { winners });
  });

  socket.on('admin-announce-final-winner', ({ winnerName }) => {
    const ctx = socketContexts.get(socket.id);
    if (!ctx || ctx.role !== 'admin' || !ctx.arenaCode) return;

    const arena = arenas.get(ctx.arenaCode);
    if (!arena) return;

    const trimmedWinner = (winnerName || '').trim();
    if (!trimmedWinner) return;

    recordWinner(arena, trimmedWinner);
    io.to(arenaRoom(arena.code)).emit('final-winner', {
      winnerName: trimmedWinner,
    });

    setTimeout(() => {
      cleanupArena(arena, 'round-complete');
    }, 4000);
  });

  socket.on('disconnect', () => {
    const ctx = socketContexts.get(socket.id);
    if (!ctx) return;

    if (ctx.role === 'admin') {
      if (ctx.arenaCode) {
        const arena = arenas.get(ctx.arenaCode);
        if (arena) {
          cleanupArena(arena, 'admin-disconnected');
        }
      }
      socketContexts.delete(socket.id);
    } else if (ctx.role === 'team') {
      if (ctx.arenaCode) {
        const arena = arenas.get(ctx.arenaCode);
        if (arena) {
          removeTeamFromArena(arena, ctx.teamId);
          emitScoreUpdate(arena);
          emitState(arena);
        }
      }
      socketContexts.delete(socket.id);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
