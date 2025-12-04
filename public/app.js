const socket = io();

const entryScreen = document.getElementById('entry-screen');
const entryMessage = document.getElementById('entry-message');
const createArenaBtn = document.getElementById('create-arena-btn');
const joinArenaBtn = document.getElementById('join-arena-btn');
const adminNameInput = document.getElementById('admin-name-input');
const participantNameInput = document.getElementById('participant-name-input');
const arenaCodeInput = document.getElementById('arena-code-input');

const panelCompetitors = document.getElementById('panel-competitors');
const panelAdmin = document.getElementById('panel-admin');
const globalArenaCodeEl = document.getElementById('global-arena-code');
const adminArenaCodeEl = document.getElementById('admin-arena-code');
const participantArenaCodeEl = document.getElementById('participant-arena-code');
const toastNotice = document.getElementById('toast-notice');
const toastMessageEl = document.getElementById('toast-message');

let myTeamId = null;
let myTeamName = '';
let currentTeamScores = {};
let teamNameMap = {};
let toastTimeoutId = null;

const bigBuzzBtn = document.getElementById('big-buzz-btn');
const bigBuzzLabel = document.getElementById('big-buzz-label');
const challengeWrapper = document.getElementById('challenge-wrapper');
const challengeBuzzBtn = document.getElementById('challenge-buzz-btn');

const btnCorrect = document.getElementById('btn-correct');
const btnWrong = document.getElementById('btn-wrong');
const btnChallengeCorrect = document.getElementById('btn-challenge-correct');
const btnChallengeWrong = document.getElementById('btn-challenge-wrong');
const btnNextQuestion = document.getElementById('btn-next-question');
const btnStartQuestion = document.getElementById('btn-start-question');
const btnOpenChallenge = document.getElementById('btn-open-challenge');
const btnFreezeLeaderboard = document.getElementById('btn-freeze-leaderboard');
const btnUnfreezeLeaderboard = document.getElementById('btn-unfreeze-leaderboard');
const currentAnsweringEl = document.getElementById('current-answering');
const buzzOrderList = document.getElementById('buzz-order-list');
const eventLog = document.getElementById('event-log');
const roundStatusText = document.getElementById('round-status-text');
const adminScoreboard = document.getElementById('admin-scoreboard');
const audienceScoreboard = document.getElementById('audience-scoreboard');
const audienceLeaderboard = document.getElementById('audience-leaderboard');
const btnAnnounceFinalWinner = document.getElementById('btn-announce-final-winner');
const winnerFlash = document.getElementById('winner-flash');
const winnerNameEl = document.getElementById('winner-name');
const btnShowWinners = document.getElementById('btn-show-winners');
const btnCloseWinners = document.getElementById('btn-close-winners');
const previousWinnersPanel = document.getElementById('previous-winners-panel');
const previousWinnersList = document.getElementById('previous-winners-list');

const clientState = {
  arenaCode: null,
  questionState: 'idle',
  buzzOrder: [],
  challengeBuzzOrder: [],
  currentAnsweringTeam: null,
  wrongAnswerTeamId: null,
  challengeAvailable: false,
  leaderboardFrozen: false,
};

const uiContext = {
  role: null,
  adminName: '',
};

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function getTeamName(teamId) {
  const numericId = toNumber(teamId);
  if (numericId === null) return null;

  const fromBuzzOrder = clientState.buzzOrder.find(
    (entry) => toNumber(entry.id) === numericId
  );
  if (fromBuzzOrder && fromBuzzOrder.name) {
    return fromBuzzOrder.name;
  }

  const fromChallengeOrder = clientState.challengeBuzzOrder.find(
    (entry) => toNumber(entry.id) === numericId
  );
  if (fromChallengeOrder && fromChallengeOrder.name) {
    return fromChallengeOrder.name;
  }

  const lookup =
    teamNameMap[numericId] ||
    teamNameMap[String(numericId)];
  if (lookup) return lookup;

  return `Team ${numericId}`;
}

function updateCurrentAnsweringDisplay(teamId) {
  if (!currentAnsweringEl) return;
  const name = getTeamName(teamId);
  if (teamId && name) {
    currentAnsweringEl.textContent = name;
    currentAnsweringEl.classList.add('status-value--active');
  } else {
    currentAnsweringEl.textContent = 'None yet';
    currentAnsweringEl.classList.remove('status-value--active');
  }
}

bigBuzzBtn.addEventListener('click', () => {
  if (!myTeamId || !myTeamName) return;
  if (bigBuzzBtn.disabled) return;
  socket.emit('buzz', { teamId: myTeamId, name: myTeamName });
  bigBuzzBtn.disabled = true;
  flashBuzz(bigBuzzBtn);
});

challengeBuzzBtn.addEventListener('click', () => {
  if (!myTeamId || !myTeamName) return;
  if (challengeBuzzBtn.disabled) return;
  socket.emit('buzz', { teamId: myTeamId, name: myTeamName });
  challengeBuzzBtn.disabled = true;
  flashBuzz(challengeBuzzBtn);
});

if (btnOpenChallenge) {
  btnOpenChallenge.disabled = true;
}

btnCorrect.addEventListener('click', () => {
  socket.emit('admin-evaluate-answer', { result: 'correct' });
});

btnWrong.addEventListener('click', () => {
  socket.emit('admin-evaluate-answer', { result: 'wrong' });
});

btnChallengeCorrect.addEventListener('click', () => {
  if (clientState.challengeBuzzOrder.length === 0) return;
  const firstTeam = clientState.challengeBuzzOrder[0];
  socket.emit('admin-evaluate-challenge', { team: firstTeam.id, result: 'correct' });
});

btnChallengeWrong.addEventListener('click', () => {
  if (clientState.challengeBuzzOrder.length === 0) return;
  const firstTeam = clientState.challengeBuzzOrder[0];
  socket.emit('admin-evaluate-challenge', { team: firstTeam.id, result: 'wrong' });
});

btnNextQuestion.addEventListener('click', () => {
  socket.emit('admin-next-question');
});

btnStartQuestion.addEventListener('click', () => {
  socket.emit('admin-start-question');
});

btnOpenChallenge.addEventListener('click', () => {
  if (btnOpenChallenge.disabled) return;
  socket.emit('admin-open-challenge');
  logEvent('Admin opened challenge phase.');
});

btnFreezeLeaderboard.addEventListener('click', () => {
  socket.emit('admin-set-leaderboard-frozen', { frozen: true });
  logEvent('Leaderboard frozen.');
});

btnUnfreezeLeaderboard.addEventListener('click', () => {
  socket.emit('admin-set-leaderboard-frozen', { frozen: false });
  logEvent('Leaderboard revealed.');
});

btnAnnounceFinalWinner.addEventListener('click', () => {
  const teamScores = Object.entries(teamNameMap).map(([id, name]) => ({
    name,
    id: parseInt(id, 10),
    score: currentTeamScores[parseInt(id, 10)] || 0,
  }));
  if (teamScores.length === 0) return;
  const winner = teamScores.reduce((a, b) => (a.score > b.score ? a : b));
  socket.emit('admin-announce-final-winner', { winnerName: winner.name });
});

if (btnShowWinners) {
  btnShowWinners.addEventListener('click', () => {
    socket.emit('admin-request-winners');
  });
}

if (btnCloseWinners && previousWinnersPanel) {
  btnCloseWinners.addEventListener('click', () => {
    previousWinnersPanel.hidden = true;
  });
}

function setEntryMessage(message) {
  if (!entryMessage) return;
  if (message) {
    entryMessage.textContent = message;
    entryMessage.classList.remove('hidden');
  } else {
    entryMessage.textContent = '';
    entryMessage.classList.add('hidden');
  }
}

function hideEntryScreen() {
  if (!entryScreen) return;
  entryScreen.classList.add('hidden');
  setEntryMessage('');
}

function showEntryScreen(message) {
  if (!entryScreen) return;
  entryScreen.classList.remove('hidden');
  setEntryMessage(message || '');
}

function setArenaCode(code) {
  const display = code || '-----';
  if (globalArenaCodeEl) globalArenaCodeEl.textContent = display;
  if (adminArenaCodeEl) adminArenaCodeEl.textContent = display;
  if (participantArenaCodeEl) participantArenaCodeEl.textContent = display;
}

function hideToast() {
  if (!toastNotice) return;
  toastNotice.classList.remove('toast-notice--visible');
  if (toastTimeoutId) {
    clearTimeout(toastTimeoutId);
    toastTimeoutId = null;
  }
  setTimeout(() => {
    if (toastNotice) {
      toastNotice.classList.add('hidden');
      toastNotice.classList.remove('toast-notice--success', 'toast-notice--error');
    }
  }, 220);
}

function showToast(message, options = {}) {
  if (!toastNotice || !toastMessageEl) return;
  const { duration = 2400, intent = 'info' } = options;
  toastMessageEl.textContent = message;
  toastNotice.classList.remove('hidden');
  toastNotice.classList.remove('toast-notice--success', 'toast-notice--error', 'toast-notice--visible');
  if (intent === 'success') {
    toastNotice.classList.add('toast-notice--success');
  } else if (intent === 'error') {
    toastNotice.classList.add('toast-notice--error');
  }
  void toastNotice.offsetWidth;
  toastNotice.classList.add('toast-notice--visible');
  if (toastTimeoutId) {
    clearTimeout(toastTimeoutId);
  }
  toastTimeoutId = setTimeout(() => {
    hideToast();
  }, duration);
}

function describeArenaClosure(reason) {
  switch (reason) {
    case 'round-complete':
      return 'Arena sealed after winner announcement. Great job!';
    case 'admin-disconnected':
      return 'Admin disconnected. Please create or join another arena.';
    case 'replaced':
      return 'Admin started a fresh arena. Use the new code to join.';
    case 'closed':
    default:
      return 'Arena closed. Return to the entry screen to continue.';
  }
}

function resetUiToEntry(message) {
  uiContext.role = null;
  uiContext.adminName = '';
  clientState.arenaCode = null;
  clientState.questionState = 'idle';
  clientState.buzzOrder = [];
  clientState.challengeBuzzOrder = [];
  clientState.currentAnsweringTeam = null;
  clientState.wrongAnswerTeamId = null;
  clientState.challengeAvailable = false;
  clientState.leaderboardFrozen = false;

  myTeamId = null;
  myTeamName = '';
  teamNameMap = {};
  currentTeamScores = {};

  panelAdmin.classList.add('hidden');
  panelCompetitors.classList.add('hidden');

  setArenaCode(null);
  setScores({});
  renderBuzzOrder([]);
  updateCurrentAnsweringDisplay(null);
  if (bigBuzzLabel) bigBuzzLabel.textContent = 'Waiting to join';
  if (bigBuzzBtn) {
    bigBuzzBtn.disabled = true;
    bigBuzzBtn.classList.remove('pulse-ready');
  }
  if (challengeBuzzBtn) {
    challengeBuzzBtn.disabled = true;
    challengeBuzzBtn.classList.remove('pulse-ready');
  }
  if (challengeWrapper) {
    challengeWrapper.hidden = true;
    challengeWrapper.style.display = 'none';
  }
  if (roundStatusText) {
    roundStatusText.textContent = 'Awaiting arena setup';
  }
  if (eventLog) {
    eventLog.innerHTML = '';
  }
  if (previousWinnersPanel) {
    previousWinnersPanel.hidden = true;
  }

  if (participantNameInput) participantNameInput.value = '';
  if (arenaCodeInput) arenaCodeInput.value = '';
  if (createArenaBtn) createArenaBtn.disabled = false;
  if (joinArenaBtn) joinArenaBtn.disabled = false;

  hideToast();

  showEntryScreen(message);
}

function activateAdminView({ code, adminName, previousWinners }) {
  uiContext.role = 'admin';
  uiContext.adminName = adminName;
  clientState.arenaCode = code;
  setArenaCode(code);

  hideEntryScreen();
  panelAdmin.classList.remove('hidden');
  panelCompetitors.classList.add('hidden');

  renderPreviousWinners(previousWinners || []);
  if (roundStatusText) {
    roundStatusText.textContent = 'Arena live. Start when ready.';
  }
  logEvent(`Arena ${code} created. Share the code with teams.`);
}

function activateParticipantView({ arenaCode, teamId, teamName }) {
  uiContext.role = 'team';
  clientState.arenaCode = arenaCode;
  myTeamId = teamId;
  myTeamName = teamName;
  setArenaCode(arenaCode);

  hideEntryScreen();
  panelCompetitors.classList.remove('hidden');
  panelAdmin.classList.add('hidden');

  if (bigBuzzLabel) bigBuzzLabel.textContent = teamName;
  updateBuzzButtonState();
  logEvent(`Joined arena ${arenaCode} as ${teamName}.`);
  if (roundStatusText && roundStatusText.textContent.includes('Awaiting arena setup')) {
    roundStatusText.textContent = 'Waiting for admin to start the question';
  }
}

if (createArenaBtn) {
  createArenaBtn.addEventListener('click', () => {
    const adminName = adminNameInput ? adminNameInput.value.trim() : '';
    if (!adminName) {
      setEntryMessage('Please enter an admin name to create an arena.');
      return;
    }

    createArenaBtn.disabled = true;
    socket.emit('admin-create-arena', { adminName });
  });
}

if (joinArenaBtn) {
  joinArenaBtn.addEventListener('click', () => {
    const teamName = participantNameInput ? participantNameInput.value.trim() : '';
    const codeRaw = arenaCodeInput ? arenaCodeInput.value.trim() : '';
    const code = codeRaw.toUpperCase();

    if (!teamName || !code) {
      setEntryMessage('Enter both team name and arena code to join.');
      return;
    }

    joinArenaBtn.disabled = true;
    socket.emit('participant-join-arena', { name: teamName, code });
  });
}

if (participantNameInput) {
  participantNameInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (joinArenaBtn) joinArenaBtn.click();
    }
  });
}

if (arenaCodeInput) {
  arenaCodeInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (joinArenaBtn) joinArenaBtn.click();
    }
  });
}

socket.on('arena-created', ({ code, adminName, previousWinners }) => {
  if (createArenaBtn) createArenaBtn.disabled = false;
  activateAdminView({ code, adminName, previousWinners });
});

socket.on('arena-error', ({ message }) => {
  if (createArenaBtn) createArenaBtn.disabled = false;
  setEntryMessage(message || 'Unable to create arena. Please try again.');
});

socket.on('participant-join-success', ({ teamId, teamName, arenaCode }) => {
  if (joinArenaBtn) joinArenaBtn.disabled = false;
  if (participantNameInput) participantNameInput.value = '';
  if (arenaCodeInput) arenaCodeInput.value = '';
  teamNameMap = {
    ...teamNameMap,
    [teamId]: teamName,
  };
  if (!Object.prototype.hasOwnProperty.call(currentTeamScores, teamId)) {
    currentTeamScores = { ...currentTeamScores, [teamId]: 0 };
  }
  setScores(currentTeamScores);
  activateParticipantView({ arenaCode, teamId, teamName });
});

socket.on('join-error', ({ message }) => {
  if (joinArenaBtn) joinArenaBtn.disabled = false;
  setEntryMessage(message || 'Unable to join arena. Please check your code.');
});

socket.on('arena-closed', ({ reason, code }) => {
  if (clientState.arenaCode && code && code !== clientState.arenaCode) return;
  resetUiToEntry(describeArenaClosure(reason));
});

socket.on('disconnect', () => {
  if (!uiContext.role) return;
  resetUiToEntry('Connection lost. Please reconnect to an arena.');
});
function escapeHtml(value) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}


function renderPreviousWinners(winners = []) {
  if (!previousWinnersList) return;
  previousWinnersList.innerHTML = '';

  if (!Array.isArray(winners) || winners.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'previous-winner previous-winner--empty';
    empty.textContent = 'No winners recorded yet.';
    previousWinnersList.appendChild(empty);
    return;
  }

  winners.forEach(({ name, timestamp }) => {
    const li = document.createElement('li');
    li.className = 'previous-winner';
    const safeName = escapeHtml(name || 'Unknown team');
    const formattedTime = timestamp
      ? new Date(timestamp).toLocaleString()
      : '';
    li.innerHTML = `
      <span class="previous-winner-name">${safeName}</span>
      ${formattedTime ? `<span class="previous-winner-time">${escapeHtml(formattedTime)}</span>` : ''}
    `;
    previousWinnersList.appendChild(li);
  });
}
function highlightName(name) {
  const safe = escapeHtml(name || '');
  return `<span class="highlight-name">${safe}</span>`;
}

function setRoundStatus(message) {
  if (!roundStatusText) return;
  roundStatusText.innerHTML = message;
}

function renderScoreboard(container, teams) {
  if (!container) return;
  container.innerHTML = '';

  if (!teams || teams.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'score-row score-row--empty';
    empty.textContent = 'No teams yet';
    container.appendChild(empty);
    return;
  }

  teams.forEach((team, index) => {
    const row = document.createElement('div');
    row.className = 'score-row';
    if (index === 0) {
      row.classList.add('score-row--leader');
    }

    row.innerHTML = `
      <span class="score-rank">${index + 1}.</span>
      <span class="score-name">${team.name}</span>
      <span class="score-points">${team.score}</span>
    `;
    container.appendChild(row);
  });
}

function setScores(teamScores = {}) {
  currentTeamScores = { ...teamScores };
  const sorted = Object.entries(teamScores)
    .map(([id, score]) => {
      const numericId = toNumber(id);
      return {
        id: numericId !== null ? numericId : id,
        score: typeof score === 'number' ? score : 0,
        name: getTeamName(numericId !== null ? numericId : id),
      };
    })
    .sort((a, b) => b.score - a.score);

  renderScoreboard(adminScoreboard, sorted);
  renderScoreboard(audienceScoreboard, sorted);
  updateCurrentAnsweringDisplay(clientState.currentAnsweringTeam);
}

function updateBuzzButtonState() {
  const phase = clientState.questionState;
  const numericTeamId = toNumber(myTeamId);

  const hasBuzzedPrimary =
    numericTeamId !== null &&
    clientState.buzzOrder.some((entry) => toNumber(entry.id) === numericTeamId);

  const hasBuzzedChallenge =
    numericTeamId !== null &&
    clientState.challengeBuzzOrder.some(
      (entry) => toNumber(entry.id) === numericTeamId
    );

  const canBuzz =
    phase === 'open' &&
    numericTeamId !== null &&
    Boolean(myTeamName) &&
    !hasBuzzedPrimary;
  bigBuzzBtn.disabled = !canBuzz;

  const wrongId = toNumber(clientState.wrongAnswerTeamId);
  const isWrongAnsweringTeam =
    numericTeamId !== null && wrongId !== null && numericTeamId === wrongId;

  const canChallenge =
    phase === 'challenge' &&
    numericTeamId !== null &&
    Boolean(myTeamName) &&
    !isWrongAnsweringTeam &&
    !hasBuzzedChallenge;

  if (challengeWrapper) {
    if (canChallenge) {
      challengeWrapper.hidden = false;
      challengeWrapper.style.display = 'flex';
      challengeWrapper.classList.add('challenge-wrapper--active');
    } else {
      challengeWrapper.hidden = true;
      challengeWrapper.style.display = 'none';
      challengeWrapper.classList.remove('challenge-wrapper--active');
    }
  }

  if (canChallenge) {
    challengeBuzzBtn.disabled = false;
    challengeBuzzBtn.classList.remove('pulse-ready');
    void challengeBuzzBtn.offsetWidth;
    challengeBuzzBtn.classList.add('pulse-ready');
  } else {
    challengeBuzzBtn.disabled = true;
    challengeBuzzBtn.classList.remove('pulse-ready');
  }
}

function renderBuzzOrder(order, { isChallenge = false } = {}) {
  if (!buzzOrderList) return;
  buzzOrderList.innerHTML = '';

  const activeOrder = Array.isArray(order) ? order : [];
  if (activeOrder.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = isChallenge
      ? 'Waiting for challenge buzz...'
      : 'Waiting for buzz...';
    buzzOrderList.appendChild(li);
    return;
  }

  activeOrder.forEach((entry, index) => {
    const li = document.createElement('li');
    li.classList.add('buzz-pos');

    if (isChallenge) {
      li.classList.add('challenge-pos');
    } else {
      li.classList.add(`buzz-pos-${Math.min(index + 1, 4)}`);
    }

    const rankLabel = isChallenge ? `C${index + 1}` : index + 1;
    const displayName = entry.name || getTeamName(entry.id);
    li.innerHTML = `
      <span class="buzz-rank">${rankLabel}</span>
      <span class="buzz-name">${displayName}</span>
    `;
    buzzOrderList.appendChild(li);
  });
}

function updateAdminControls() {
  if (!btnOpenChallenge) return;
  const allowReady = !!clientState.challengeAvailable;
  btnOpenChallenge.disabled = !allowReady;
  btnOpenChallenge.classList.toggle('action-btn--ready', allowReady);
  btnOpenChallenge.textContent = 'Allow Challenge';
}

function logEvent(message) {
  if (!eventLog) return;
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  const time = new Date().toLocaleTimeString();
  entry.textContent = `[${time}] ${message}`;
  eventLog.prepend(entry);
}

function flashBuzz(teamCard) {
  if (!teamCard) return;
  teamCard.classList.remove('buzz-flash');
  void teamCard.offsetWidth;
  teamCard.classList.add('buzz-flash');
}

function maybeToastForWinningTeam(winningTeam) {
  const normalized = (winningTeam || '').trim();
  if (!normalized) return;
  if (!myTeamName) return;
  const myName = myTeamName.trim();
  if (!myName) return;
  if (normalized.localeCompare(myName, undefined, { sensitivity: 'accent' }) !== 0) return;
  showToast('Correct answer! Prepare for the next question.', { intent: 'success' });
}

socket.on('state-sync', (state) => {
  if (state.arenaCode) {
    clientState.arenaCode = state.arenaCode;
    setArenaCode(state.arenaCode);
  }

  if (state.teamNames) {
    teamNameMap = { ...state.teamNames };
  }

  clientState.questionState = state.questionState || 'idle';
  clientState.buzzOrder = Array.isArray(state.buzzOrder) ? state.buzzOrder : [];
  clientState.challengeBuzzOrder = Array.isArray(state.challengeBuzzOrder)
    ? state.challengeBuzzOrder
    : [];
  clientState.currentAnsweringTeam = toNumber(state.currentAnsweringTeam);
  clientState.wrongAnswerTeamId = toNumber(state.wrongAnswerTeamId);
  clientState.challengeAvailable = !!state.challengeAvailable;
  clientState.leaderboardFrozen = !!state.leaderboardFrozen;

  setScores(state.teamScores || {});

  if (roundStatusText) {
    if (clientState.questionState === 'challenge') {
      const wrongTeamName = getTeamName(state.wrongAnswerTeamId);
      setRoundStatus(
        wrongTeamName
          ? `Challenge open! Initial answer from ${highlightName(wrongTeamName)} was wrong. Teams can now buzz to challenge.`
          : 'Challenge phase active. Teams can now buzz to challenge.'
      );
    } else if (clientState.questionState === 'open') {
      setRoundStatus('Question live. Waiting for buzz...');
    } else if (clientState.questionState === 'closed') {
      setRoundStatus('Question closed. Awaiting next action from admin.');
    } else {
      setRoundStatus('Ready for next question');
    }
  }

  const showingChallenge = clientState.questionState === 'challenge';
  renderBuzzOrder(
    showingChallenge ? clientState.challengeBuzzOrder : clientState.buzzOrder,
    { isChallenge: showingChallenge }
  );

  if (audienceLeaderboard) {
    audienceLeaderboard.classList.toggle('hidden', !!state.leaderboardFrozen);
  }

  updateCurrentAnsweringDisplay(clientState.currentAnsweringTeam);
  updateBuzzButtonState();
  updateAdminControls();
});

socket.on('buzz-update', ({ buzzOrder, currentAnsweringTeam }) => {
  clientState.questionState = 'open';
  clientState.buzzOrder = Array.isArray(buzzOrder) ? buzzOrder : [];
  clientState.challengeBuzzOrder = [];
  clientState.currentAnsweringTeam = toNumber(currentAnsweringTeam);
  clientState.wrongAnswerTeamId = null;

  renderBuzzOrder(clientState.buzzOrder);

  const answeringName = getTeamName(clientState.currentAnsweringTeam);
  updateCurrentAnsweringDisplay(clientState.currentAnsweringTeam);

  if (roundStatusText) {
    setRoundStatus(
      answeringName
        ? `${highlightName(answeringName)} has the mic. Awaiting answer...`
        : 'Waiting for buzz...'
    );
  }

  const last = clientState.buzzOrder[clientState.buzzOrder.length - 1];
  if (last) {
    const logName = last.name || getTeamName(last.id);
    if (logName) {
      logEvent(`Buzz registered from ${logName}`);
    }
  }

  updateBuzzButtonState();
  updateAdminControls();
});

socket.on('score-update', ({ teamScores, teamNames }) => {
  if (teamNames) {
    teamNameMap = { ...teamNames };
  }
  setScores(teamScores);
});

socket.on('team-update', ({ teamId, name, score }) => {
  if (!teamId || !name) return;
  teamNameMap = {
    ...teamNameMap,
    [teamId]: name,
  };
  currentTeamScores = {
    ...currentTeamScores,
    [teamId]: typeof score === 'number' ? score : (currentTeamScores[teamId] || 0),
  };
  setScores(currentTeamScores);
});

socket.on('challenge-available', ({ wrongAnswerTeamId, wrongTeamName, buzzOrder }) => {
  clientState.questionState = 'closed';
  clientState.challengeAvailable = true;
  clientState.wrongAnswerTeamId = toNumber(wrongAnswerTeamId);
  clientState.challengeBuzzOrder = [];
  if (Array.isArray(buzzOrder)) {
    clientState.buzzOrder = buzzOrder;
  }
  clientState.currentAnsweringTeam = null;

  const displayName = wrongTeamName || getTeamName(wrongAnswerTeamId);
  if (roundStatusText) {
    setRoundStatus(
      displayName
        ? `${highlightName(displayName)} missed. Admin may allow a challenge.`
        : 'Answer marked wrong. Admin may allow a challenge.'
    );
  }
  if (displayName) {
    logEvent(`Answer marked wrong for ${displayName}.`);
  } else {
    logEvent('Answer marked wrong. Waiting for admin to open challenge.');
  }

  if (toNumber(myTeamId) === clientState.wrongAnswerTeamId) {
    showToast('Wrong answer. Eyes on the challenge window.', {
      intent: 'error',
      duration: 2800,
    });
  }

  updateCurrentAnsweringDisplay(null);
  renderBuzzOrder(clientState.buzzOrder, { isChallenge: false });
  updateBuzzButtonState();
  updateAdminControls();
});

socket.on('challenge-open', ({ currentAnsweringTeam, buzzOrder, wrongAnswerTeamId }) => {
  clientState.questionState = 'challenge';
  clientState.challengeAvailable = false;
  clientState.buzzOrder = Array.isArray(buzzOrder) ? buzzOrder : clientState.buzzOrder;
  clientState.challengeBuzzOrder = [];
  clientState.currentAnsweringTeam = null;
  clientState.wrongAnswerTeamId = toNumber(
    wrongAnswerTeamId !== undefined && wrongAnswerTeamId !== null
      ? wrongAnswerTeamId
      : currentAnsweringTeam
  );

  const wrongTeamName = getTeamName(clientState.wrongAnswerTeamId);
  setRoundStatus(
    wrongTeamName
      ? `Challenge open! Initial answer from ${highlightName(wrongTeamName)} was wrong. Teams can now buzz to challenge.`
      : 'Challenge open! Teams may now buzz to challenge.'
  );
  logEvent('Challenge phase opened.');

  if (toNumber(myTeamId) === clientState.wrongAnswerTeamId) {
    logEvent('You answered incorrectly this round and cannot challenge.');
  }

  renderBuzzOrder(clientState.challengeBuzzOrder, { isChallenge: true });
  updateCurrentAnsweringDisplay(null);
  updateBuzzButtonState();
  updateAdminControls();
});

socket.on('question-ended', ({ reason, winningTeam }) => {
  if (reason === 'answered' && winningTeam) {
    setRoundStatus(`Question ended. ${highlightName(winningTeam)} answered correctly.`);
    logEvent(`Question ended with ${winningTeam} correct.`);
    maybeToastForWinningTeam(winningTeam);
  } else if (reason === 'challenge') {
    if (winningTeam) {
      setRoundStatus(`Question ended. Challenge by ${highlightName(winningTeam)} succeeded.`);
      logEvent(`Challenge by ${winningTeam} succeeded.`);
      maybeToastForWinningTeam(winningTeam);
    } else {
      setRoundStatus('Question ended after failed challenge.');
      logEvent('Challenge failed.');
    }
  }
  clientState.questionState = 'closed';
  clientState.currentAnsweringTeam = null;
  clientState.wrongAnswerTeamId = null;
  clientState.challengeBuzzOrder = [];
  clientState.challengeAvailable = false;
  updateCurrentAnsweringDisplay(null);
  renderBuzzOrder(clientState.buzzOrder, { isChallenge: false });
  updateBuzzButtonState();
  updateAdminControls();
});

socket.on('state-reset', ({ teamScores, teamNames, buzzOrder, challengeBuzzOrder, currentAnsweringTeam, wrongAnswerTeamId }) => {
  if (teamNames) {
    teamNameMap = { ...teamNames };
  }

  clientState.questionState = 'idle';
  clientState.buzzOrder = Array.isArray(buzzOrder) ? buzzOrder : [];
  clientState.challengeBuzzOrder = Array.isArray(challengeBuzzOrder)
    ? challengeBuzzOrder
    : [];
  clientState.currentAnsweringTeam = null;
  clientState.wrongAnswerTeamId = toNumber(wrongAnswerTeamId);
  clientState.challengeAvailable = false;

  setScores(teamScores);
  renderBuzzOrder(clientState.buzzOrder, { isChallenge: false });

  updateCurrentAnsweringDisplay(null);
  setRoundStatus('Ready for next question');
  logEvent('Reset for next question.');

  bigBuzzBtn.disabled = true;
  challengeBuzzBtn.disabled = true;
  bigBuzzBtn.classList.remove('pulse-ready');
  challengeBuzzBtn.classList.remove('pulse-ready');
  hideToast();
  updateBuzzButtonState();
  updateAdminControls();
});

socket.on('challenge-buzz-update', ({ challengeBuzzOrder: newChallengebuzzOrder }) => {
  clientState.challengeBuzzOrder = Array.isArray(newChallengebuzzOrder)
    ? newChallengebuzzOrder
    : [];

  renderBuzzOrder(clientState.challengeBuzzOrder, { isChallenge: true });

  const last = clientState.challengeBuzzOrder[clientState.challengeBuzzOrder.length - 1];
  if (last) {
    const logName = last.name || getTeamName(last.id);
    if (logName) {
      logEvent(`Challenge buzz from ${logName}`);
    }
  }

  if (clientState.challengeBuzzOrder.length > 0) {
    const firstChallenger = clientState.challengeBuzzOrder[0];
    clientState.currentAnsweringTeam = toNumber(firstChallenger.id);
    updateCurrentAnsweringDisplay(clientState.currentAnsweringTeam);
    if (roundStatusText) {
      const challengerName = firstChallenger.name || getTeamName(firstChallenger.id);
      if (challengerName) {
        setRoundStatus(`${highlightName(challengerName)} is challenging! Await admin verdict.`);
      }
    }
  }

  updateBuzzButtonState();
});

socket.on('previous-winners', ({ winners }) => {
  renderPreviousWinners(Array.isArray(winners) ? winners : []);
  if (previousWinnersPanel) {
    previousWinnersPanel.hidden = false;
  }
});

socket.on('leaderboard-freeze-update', ({ leaderboardFrozen }) => {
  clientState.leaderboardFrozen = !!leaderboardFrozen;
  if (audienceLeaderboard) {
    audienceLeaderboard.classList.toggle('hidden', !!leaderboardFrozen);
  }
});

socket.on('final-winner', ({ winnerName }) => {
  if (!winnerFlash || !winnerNameEl) return;
  winnerNameEl.textContent = winnerName;
  winnerFlash.classList.remove('hidden');
  winnerFlash.classList.add('visible');

  setTimeout(() => {
    winnerFlash.classList.remove('visible');
    winnerFlash.classList.add('hidden');
  }, 6000);
});

socket.on('question-started', ({ questionState }) => {
  clientState.questionState = questionState || 'open';
  clientState.buzzOrder = [];
  clientState.challengeBuzzOrder = [];
  clientState.currentAnsweringTeam = null;
  clientState.wrongAnswerTeamId = null;
  clientState.challengeAvailable = false;
  renderBuzzOrder([], { isChallenge: false });
  updateCurrentAnsweringDisplay(null);
  setRoundStatus('Question started. Waiting for buzz...');
  logEvent('Question started.');
  hideToast();
  bigBuzzBtn.disabled = false;
  bigBuzzBtn.classList.remove('pulse-ready');
  void bigBuzzBtn.offsetWidth;
  bigBuzzBtn.classList.add('pulse-ready');
  challengeBuzzBtn.classList.remove('pulse-ready');
  updateBuzzButtonState();
  updateAdminControls();
});

setScores({});
renderBuzzOrder([]);
updateBuzzButtonState();
updateAdminControls();
