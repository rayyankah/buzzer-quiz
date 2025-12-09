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

function normalizeTeamId(value) {
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function serializeSet(setInstance) {
  if (!setInstance) return [];
  return Array.from(setInstance);
}

function ensureArenaTracking(arena) {
  if (!arena.answeredTeams || !(arena.answeredTeams instanceof Set)) {
    arena.answeredTeams = new Set();
  }
  if (!arena.challengeIneligibleTeams || !(arena.challengeIneligibleTeams instanceof Set)) {
    arena.challengeIneligibleTeams = new Set();
  }
}

function markTeamAnswered(arena, teamId) {
  const normalized = normalizeTeamId(teamId);
  if (normalized === null) return;
  ensureArenaTracking(arena);
  arena.answeredTeams.add(normalized);
  arena.challengeIneligibleTeams.add(normalized);
}

function markTeamChallengeIneligible(arena, teamId) {
  const normalized = normalizeTeamId(teamId);
  if (normalized === null) return;
  ensureArenaTracking(arena);
  arena.challengeIneligibleTeams.add(normalized);
}

function hasRemainingAnswerCandidates(arena) {
  ensureArenaTracking(arena);
  return arena.buzzOrder.some((entry) => !arena.answeredTeams.has(entry.id));
}

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
  } while (Object.prototype.hasOwnProperty.call(arena.teamScores, id));
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
    answeredTeams: serializeSet(arena.answeredTeams),
    challengeIneligibleTeams: serializeSet(arena.challengeIneligibleTeams),
    lastWrongAnswerTeamId: arena.lastWrongAnswerTeamId,
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
  arena.lastWrongAnswerTeamId = null;
  ensureArenaTracking(arena);
  arena.answeredTeams.clear();
  arena.challengeIneligibleTeams.clear();

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
  if (!Object.prototype.hasOwnProperty.call(arena.teamScores, teamId)) return;

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
  ensureArenaTracking(arena);
  arena.answeredTeams.delete(teamId);
  arena.challengeIneligibleTeams.delete(teamId);
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
      answeredTeams: new Set(),
      challengeIneligibleTeams: new Set(),
      lastWrongAnswerTeamId: null,
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

    ensureArenaTracking(arena);

    const teamId = ctx.teamId;
    const displayName = arena.teamNames[teamId] || ctx.teamName || `Team ${teamId}`;

    if (arena.questionState === 'answering') {
      if (arena.answeredTeams.has(teamId)) return;
      if (arena.buzzOrder.some((entry) => entry.id === teamId)) return;

      arena.buzzOrder.push({ id: teamId, name: displayName });

      io.to(arenaRoom(arena.code)).emit('buzz-update', {
        buzzOrder: arena.buzzOrder,
        currentAnsweringTeam: arena.currentAnsweringTeam,
        answeredTeams: serializeSet(arena.answeredTeams),
      });
      emitState(arena);
    } else if (arena.questionState === 'challenge') {
      if (arena.challengeIneligibleTeams.has(teamId)) return;
      if (teamId === arena.currentAnsweringTeam) return;
      if (arena.challengeBuzzOrder.some((entry) => entry.id === teamId)) return;

      arena.challengeBuzzOrder.push({ id: teamId, name: displayName });

      io.to(arenaRoom(arena.code)).emit('challenge-buzz-update', {
        challengeBuzzOrder: arena.challengeBuzzOrder,
      });
      emitState(arena);
    }
  });

  socket.on('admin-start-question', () => {
    const ctx = socketContexts.get(socket.id);
    if (!ctx || ctx.role !== 'admin' || !ctx.arenaCode) return;

    const arena = arenas.get(ctx.arenaCode);
    if (!arena) return;

    if (arena.questionState === 'answering') return;

    arena.questionState = 'answering';
    arena.buzzOrder = [];
    arena.challengeBuzzOrder = [];
    arena.currentAnsweringTeam = null;
    arena.wrongAnswerTeamId = null;
    arena.lastWrongAnswerTeamId = null;
    arena.challengeAvailable = false;

    ensureArenaTracking(arena);
    arena.answeredTeams.clear();
    arena.challengeIneligibleTeams.clear();

    emitState(arena);
    io.to(arenaRoom(arena.code)).emit('question-started', {
      questionState: arena.questionState,
    });
  });

  socket.on('admin-select-answer-team', ({ teamId }) => {
    const ctx = socketContexts.get(socket.id);
    if (!ctx || ctx.role !== 'admin' || !ctx.arenaCode) return;

    const arena = arenas.get(ctx.arenaCode);
    if (!arena) return;

    ensureArenaTracking(arena);
    const selectedTeam = normalizeTeamId(teamId);
    if (selectedTeam === null) return;
    if (!Object.prototype.hasOwnProperty.call(arena.teamScores, selectedTeam)) return;

    arena.currentAnsweringTeam = selectedTeam;
    emitState(arena);
    io.to(arenaRoom(arena.code)).emit('answering-team-selected', {
      teamId: selectedTeam,
      teamName: arena.teamNames[selectedTeam] || `Team ${selectedTeam}`,
    });
  });

  socket.on('admin-evaluate-answer', ({ result, teamId }) => {
    const ctx = socketContexts.get(socket.id);
    if (!ctx || ctx.role !== 'admin' || !ctx.arenaCode) return;

    const arena = arenas.get(ctx.arenaCode);
    if (!arena) return;

    ensureArenaTracking(arena);

    const selectedTeam = normalizeTeamId(
      teamId !== undefined ? teamId : arena.currentAnsweringTeam,
    );
    if (selectedTeam === null) return;
    if (!Object.prototype.hasOwnProperty.call(arena.teamScores, selectedTeam)) return;

    const teamName = arena.teamNames[selectedTeam] || `Team ${selectedTeam}`;
    const isActiveRound =
      arena.questionState === 'answering' || arena.questionState === 'challenge';
    const challengeActive = arena.questionState === 'challenge';

    if (result === 'correct') {
      arena.teamScores[selectedTeam] = (arena.teamScores[selectedTeam] || 0) + 10;

      if (isActiveRound) {
        markTeamAnswered(arena, selectedTeam);
        arena.questionState = 'finished';
        arena.challengeAvailable = false;
        arena.currentAnsweringTeam = selectedTeam;
        arena.wrongAnswerTeamId = null;
        arena.lastWrongAnswerTeamId = null;
        arena.challengeBuzzOrder = [];
      } else {
        arena.currentAnsweringTeam = selectedTeam;
        arena.wrongAnswerTeamId = null;
      }

      emitScoreUpdate(arena);
      emitState(arena);
      io.to(arenaRoom(arena.code)).emit('answer-evaluated', {
        teamId: selectedTeam,
        result: 'correct',
        teamName,
        questionState: arena.questionState,
        challengeAvailable: arena.challengeAvailable,
      });

      if (isActiveRound) {
        io.to(arenaRoom(arena.code)).emit('question-ended', {
          reason: 'answered',
          winningTeam: teamName,
        });
      }
    } else if (result === 'wrong') {
      arena.teamScores[selectedTeam] = (arena.teamScores[selectedTeam] || 0) - 5;

      if (isActiveRound) {
        markTeamAnswered(arena, selectedTeam);
        arena.wrongAnswerTeamId = selectedTeam;
        arena.lastWrongAnswerTeamId = selectedTeam;
        arena.currentAnsweringTeam = null;

        if (challengeActive) {
          arena.challengeAvailable = false;
          arena.questionState = 'challenge';
        } else {
          arena.challengeAvailable = true;
          arena.challengeBuzzOrder = [];
          arena.questionState = 'answering';
        }
      } else {
        arena.wrongAnswerTeamId = null;
        arena.lastWrongAnswerTeamId = selectedTeam;
        arena.currentAnsweringTeam = null;
      }

      emitScoreUpdate(arena);
      emitState(arena);
      io.to(arenaRoom(arena.code)).emit('answer-evaluated', {
        teamId: selectedTeam,
        result: 'wrong',
        teamName,
        nextAnsweringTeam: arena.currentAnsweringTeam,
        challengeAvailable: arena.challengeAvailable,
        questionState: arena.questionState,
      });
    }
  });

  socket.on('admin-open-challenge', () => {
    const ctx = socketContexts.get(socket.id);
    if (!ctx || ctx.role !== 'admin' || !ctx.arenaCode) return;

    const arena = arenas.get(ctx.arenaCode);
    if (!arena || arena.questionState !== 'answering') return;

    ensureArenaTracking(arena);

    arena.challengeAvailable = false;
    arena.questionState = 'challenge';
    arena.challengeBuzzOrder = [];

    const activeAnswerTeam = normalizeTeamId(arena.currentAnsweringTeam);
    if (activeAnswerTeam !== null) {
      markTeamChallengeIneligible(arena, activeAnswerTeam);
    }

    io.to(arenaRoom(arena.code)).emit('challenge-open', {
      buzzOrder: arena.buzzOrder,
      currentAnsweringTeam: arena.currentAnsweringTeam,
      wrongAnswerTeamId: arena.wrongAnswerTeamId,
      challengeIneligibleTeams: serializeSet(arena.challengeIneligibleTeams),
    });
    emitState(arena);
  });

  socket.on('admin-close-challenge', () => {
    const ctx = socketContexts.get(socket.id);
    if (!ctx || ctx.role !== 'admin' || !ctx.arenaCode) return;

    const arena = arenas.get(ctx.arenaCode);
    if (!arena || arena.questionState !== 'challenge') return;

    ensureArenaTracking(arena);

    arena.challengeBuzzOrder = [];
    arena.challengeAvailable = false;
    arena.wrongAnswerTeamId = null;
    arena.questionState = hasRemainingAnswerCandidates(arena) ? 'answering' : 'finished';

    emitState(arena);
    io.to(arenaRoom(arena.code)).emit('challenge-closed', {
      reason: 'admin',
    });

    if (arena.questionState === 'finished') {
      io.to(arenaRoom(arena.code)).emit('question-ended', {
        reason: 'exhausted',
        winningTeam: null,
      });
    }
  });

  socket.on('admin-evaluate-challenge', ({ team, result }) => {
    const ctx = socketContexts.get(socket.id);
    if (!ctx || ctx.role !== 'admin' || !ctx.arenaCode) return;

    const arena = arenas.get(ctx.arenaCode);
    if (!arena) return;
    if (arena.questionState !== 'challenge') return;

    ensureArenaTracking(arena);

    const selectedTeam = normalizeTeamId(
      team !== undefined && team !== null
        ? team
        : (arena.challengeBuzzOrder[0] && arena.challengeBuzzOrder[0].id),
    );
    if (selectedTeam === null) return;
    if (!arena.challengeBuzzOrder.some((entry) => entry.id === selectedTeam)) return;

    if (!Object.prototype.hasOwnProperty.call(arena.teamScores, selectedTeam)) {
      socket.emit('arena-error', { message: 'Selected team is not part of this arena.' });
      return;
    }

    const teamName = arena.teamNames[selectedTeam] || `Team ${selectedTeam}`;

    if (result === 'correct') {
      arena.teamScores[selectedTeam] = (arena.teamScores[selectedTeam] || 0) + 20;
      markTeamChallengeIneligible(arena, selectedTeam);
      arena.challengeBuzzOrder = [];
      arena.challengeAvailable = false;
      arena.questionState = 'finished';
      arena.wrongAnswerTeamId = null;
      arena.lastWrongAnswerTeamId = null;
      arena.currentAnsweringTeam = selectedTeam;

      emitScoreUpdate(arena);
      emitState(arena);
      io.to(arenaRoom(arena.code)).emit('challenge-evaluated', {
        teamId: selectedTeam,
        result: 'correct',
        teamName,
      });
      io.to(arenaRoom(arena.code)).emit('question-ended', {
        reason: 'challenge',
        winningTeam: teamName,
      });
    } else if (result === 'wrong') {
      arena.teamScores[selectedTeam] = (arena.teamScores[selectedTeam] || 0) - 20;
      markTeamChallengeIneligible(arena, selectedTeam);
      arena.challengeBuzzOrder = [];
      arena.challengeAvailable = false;
      arena.wrongAnswerTeamId = null;
      arena.lastWrongAnswerTeamId = null;
      const hasCandidates = hasRemainingAnswerCandidates(arena);
      arena.currentAnsweringTeam = null;
      arena.questionState = hasCandidates ? 'answering' : 'finished';

      emitScoreUpdate(arena);
      emitState(arena);
      io.to(arenaRoom(arena.code)).emit('challenge-evaluated', {
        teamId: selectedTeam,
        result: 'wrong',
        teamName,
        nextAnsweringTeam: arena.currentAnsweringTeam,
      });

      if (!hasCandidates) {
        io.to(arenaRoom(arena.code)).emit('question-ended', {
          reason: 'exhausted',
          winningTeam: null,
        });
      }
    }
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
