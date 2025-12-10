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
const btnCloseChallenge = document.getElementById('btn-close-challenge');
const btnFreezeLeaderboard = document.getElementById('btn-freeze-leaderboard');
const btnUnfreezeLeaderboard = document.getElementById('btn-unfreeze-leaderboard');
const answerBonusToggle = document.getElementById('answer-bonus-toggle');
const challengeBonusToggle = document.getElementById('challenge-bonus-toggle');
const customTeamSelect = document.getElementById('custom-team-select');
const customScoreInput = document.getElementById('custom-score-input');
const btnApplyCustomScore = document.getElementById('btn-apply-custom-score');
const answeringTeamSelect = document.getElementById('answering-team-select');
const challengeTeamSelect = document.getElementById('challenge-team-select');
const currentAnsweringEl = document.getElementById('current-answering');
const buzzOrderList = document.getElementById('buzz-order-list');
const adminBuzzOrderList = document.getElementById('admin-buzz-order');
const adminChallengeOrderList = document.getElementById('admin-challenge-order');
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
  answeredTeams: [],
  challengeIneligibleTeams: [],
  lastWrongAnswerTeamId: null,
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

function getAllKnownTeamIds() {
  const ids = new Set();

  const addId = (value) => {
    const numeric = toNumber(value);
    if (numeric !== null) {
      ids.add(numeric);
    }
  };

  clientState.buzzOrder.forEach((entry) => addId(entry.id));
  clientState.challengeBuzzOrder.forEach((entry) => addId(entry.id));

  Object.keys(teamNameMap || {}).forEach((id) => addId(id));
  Object.keys(currentTeamScores || {}).forEach((id) => addId(id));

  return Array.from(ids);
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
  if (answeringTeamSelect) {
    const desired = teamId !== null && teamId !== undefined ? String(teamId) : '';
    if (desired && answeringTeamSelect.value !== desired) {
      answeringTeamSelect.value = desired;
    }
    if (!desired) {
      answeringTeamSelect.value = '';
    }
  }
}

function populateAnsweringTeamSelect() {
  if (!answeringTeamSelect) return;
  const answeredSet = new Set(
    Array.isArray(clientState.answeredTeams)
      ? clientState.answeredTeams.map((value) => toNumber(value)).filter((value) => value !== null)
      : []
  );
  const previouslySelected = answeringTeamSelect.value;
  answeringTeamSelect.innerHTML = '';

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Select team';
  placeholder.disabled = true;
  answeringTeamSelect.appendChild(placeholder);

  const addedTeamIds = new Set();

  const appendOption = (id, label) => {
    const numericId = toNumber(id);
    if (numericId === null || addedTeamIds.has(numericId)) return;
    const option = document.createElement('option');
    option.value = String(numericId);
    option.textContent = label || getTeamName(numericId);
    if (answeredSet.has(numericId)) {
      option.classList.add('team-option--answered');
    }
    answeringTeamSelect.appendChild(option);
    addedTeamIds.add(numericId);
  };

  clientState.buzzOrder.forEach((entry) => {
    appendOption(entry.id, entry.name || getTeamName(entry.id));
  });

  clientState.challengeBuzzOrder.forEach((entry) => {
    appendOption(entry.id, entry.name || getTeamName(entry.id));
  });

  getAllKnownTeamIds().forEach((id) => {
    appendOption(id, getTeamName(id));
  });

  if (clientState.currentAnsweringTeam !== null && clientState.currentAnsweringTeam !== undefined) {
    appendOption(clientState.currentAnsweringTeam, getTeamName(clientState.currentAnsweringTeam));
  }

  const desiredValue =
    clientState.currentAnsweringTeam !== null && clientState.currentAnsweringTeam !== undefined
      ? String(clientState.currentAnsweringTeam)
      : previouslySelected;

  if (desiredValue && Array.from(answeringTeamSelect.options).some((opt) => opt.value === desiredValue)) {
    answeringTeamSelect.value = desiredValue;
  } else {
    answeringTeamSelect.value = '';
  }

  placeholder.selected = answeringTeamSelect.value === '';

  const hasAnyTeamOption = answeringTeamSelect.options.length > 1;
  answeringTeamSelect.disabled = !hasAnyTeamOption;
}

function populateChallengeTeamSelect() {
  if (!challengeTeamSelect) return;
  const previouslySelected = challengeTeamSelect.value;
  challengeTeamSelect.innerHTML = '';

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Select challenger';
  placeholder.disabled = true;
  challengeTeamSelect.appendChild(placeholder);

  clientState.challengeBuzzOrder.forEach((entry, index) => {
    const numericId = toNumber(entry.id);
    if (numericId === null) return;
    const option = document.createElement('option');
    option.value = String(numericId);
    const label = entry.name || getTeamName(numericId);
    option.textContent = `${label} (${index + 1})`;
    challengeTeamSelect.appendChild(option);
  });

  if (previouslySelected && Array.from(challengeTeamSelect.options).some((opt) => opt.value === previouslySelected)) {
    challengeTeamSelect.value = previouslySelected;
  } else if (challengeTeamSelect.options.length > 1) {
    challengeTeamSelect.selectedIndex = 1;
  } else {
    challengeTeamSelect.value = '';
  }

  placeholder.selected = challengeTeamSelect.value === '';
  challengeTeamSelect.disabled = clientState.questionState !== 'challenge' || challengeTeamSelect.options.length <= 1;
}

function populateCustomTeamSelect() {
  if (!customTeamSelect) return;
  const previouslySelected = customTeamSelect.value;
  customTeamSelect.innerHTML = '';

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Select team';
  placeholder.disabled = true;
  customTeamSelect.appendChild(placeholder);

  const ids = getAllKnownTeamIds().sort((a, b) => {
    const nameA = (getTeamName(a) || '').toLowerCase();
    const nameB = (getTeamName(b) || '').toLowerCase();
    if (nameA === nameB) return a - b;
    return nameA.localeCompare(nameB);
  });

  ids.forEach((id) => {
    const option = document.createElement('option');
    option.value = String(id);
    option.textContent = getTeamName(id);
    customTeamSelect.appendChild(option);
  });

  if (previouslySelected && Array.from(customTeamSelect.options).some((opt) => opt.value === previouslySelected)) {
    customTeamSelect.value = previouslySelected;
  } else {
    customTeamSelect.value = '';
  }

  placeholder.selected = customTeamSelect.value === '';
  customTeamSelect.disabled = customTeamSelect.options.length <= 1;
}

function getSelectedAnsweringTeamId() {
  if (!answeringTeamSelect) return clientState.currentAnsweringTeam;
  const fromSelect = toNumber(answeringTeamSelect.value);
  if (fromSelect !== null) return fromSelect;
  return clientState.currentAnsweringTeam;
}

function getSelectedChallengeTeamId() {
  if (!challengeTeamSelect) return clientState.challengeBuzzOrder[0]?.id || null;
  const fromSelect = toNumber(challengeTeamSelect.value);
  if (fromSelect !== null) return fromSelect;
  const first = clientState.challengeBuzzOrder[0];
  return first ? toNumber(first.id) : null;
}

function refreshAdminSelectors() {
  populateAnsweringTeamSelect();
  populateChallengeTeamSelect();
  populateCustomTeamSelect();
  updateAdminControls();
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

btnCorrect.addEventListener('click', () => {
  const teamId = getSelectedAnsweringTeamId();
  if (teamId === null || teamId === undefined) {
    showToast('Select a team to evaluate before marking correct.', { intent: 'error' });
    return;
  }
  const bonus = !!(answerBonusToggle && answerBonusToggle.checked);
  socket.emit('admin-evaluate-answer', { result: 'correct', teamId, bonus });
});

btnWrong.addEventListener('click', () => {
  const teamId = getSelectedAnsweringTeamId();
  if (teamId === null || teamId === undefined) {
    showToast('Select a team to evaluate before marking wrong.', { intent: 'error' });
    return;
  }
  socket.emit('admin-evaluate-answer', { result: 'wrong', teamId });
});

btnChallengeCorrect.addEventListener('click', () => {
  const teamId = getSelectedChallengeTeamId();
  if (teamId === null || teamId === undefined) {
    showToast('Select a challenger before marking correct.', { intent: 'error' });
    return;
  }
  if (clientState.questionState !== 'challenge') {
    showToast('Open the challenge phase before scoring a challenge.', { intent: 'error' });
    return;
  }
  const bonus = !!(challengeBonusToggle && challengeBonusToggle.checked);
  socket.emit('admin-evaluate-challenge', { team: teamId, result: 'correct', bonus });
});

btnChallengeWrong.addEventListener('click', () => {
  const teamId = getSelectedChallengeTeamId();
  if (teamId === null || teamId === undefined) {
    showToast('Select a challenger before marking wrong.', { intent: 'error' });
    return;
  }
  if (clientState.questionState !== 'challenge') {
    showToast('Open the challenge phase before scoring a challenge.', { intent: 'error' });
    return;
  }
  socket.emit('admin-evaluate-challenge', { team: teamId, result: 'wrong' });
});

if (btnApplyCustomScore) {
  btnApplyCustomScore.addEventListener('click', () => {
    if (!customTeamSelect) return;
    const teamId = toNumber(customTeamSelect.value);
    if (teamId === null) {
      showToast('Select a team before applying custom score.', { intent: 'error' });
      return;
    }
    const rawValue = customScoreInput ? customScoreInput.value.trim() : '';
    const delta = Number(rawValue);
    if (!rawValue) {
      showToast('Enter the number of points to apply.', { intent: 'error' });
      return;
    }
    if (!Number.isFinite(delta)) {
      showToast('Use a valid number for custom scoring.', { intent: 'error' });
      return;
    }
    if (delta === 0) {
      showToast('Custom adjustment must be non-zero.', { intent: 'error' });
      return;
    }
    socket.emit('admin-custom-score', { teamId, delta });
    if (customScoreInput) {
      customScoreInput.value = '';
    }
  });
}

if (customScoreInput) {
  customScoreInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (btnApplyCustomScore) btnApplyCustomScore.click();
    }
  });
}

btnNextQuestion.addEventListener('click', () => {
  socket.emit('admin-next-question');
});

btnStartQuestion.addEventListener('click', () => {
  socket.emit('admin-start-question');
});

if (btnOpenChallenge) {
  btnOpenChallenge.addEventListener('click', () => {
    if (clientState.questionState !== 'answering') {
      showToast('Challenges can only be toggled while awaiting an answer.', { intent: 'error' });
      return;
    }

    socket.emit('admin-open-challenge');
    logEvent('Admin allowed challenges.');
  });
}

if (btnCloseChallenge) {
  btnCloseChallenge.addEventListener('click', () => {
    if (clientState.questionState !== 'challenge') {
      showToast('No active challenge phase to close.', { intent: 'error' });
      return;
    }
    socket.emit('admin-close-challenge');
    logEvent('Admin disallowed further challenges for now.');
  });
}


if (answeringTeamSelect) {
  answeringTeamSelect.addEventListener('change', () => {
    const selected = toNumber(answeringTeamSelect.value);
    if (selected === null) return;
    socket.emit('admin-select-answer-team', { teamId: selected });
  });
}
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
      return null;
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
  clientState.answeredTeams = [];
  clientState.challengeIneligibleTeams = [];
  clientState.lastWrongAnswerTeamId = null;

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

  if (answeringTeamSelect) {
    answeringTeamSelect.innerHTML = '';
  }
  if (challengeTeamSelect) {
    challengeTeamSelect.innerHTML = '';
  }
  if (customTeamSelect) {
    customTeamSelect.innerHTML = '';
  }
  if (customScoreInput) {
    customScoreInput.value = '';
  }
  if (answerBonusToggle) {
    answerBonusToggle.checked = false;
  }
  if (challengeBonusToggle) {
    challengeBonusToggle.checked = false;
  }
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
  populateAnsweringTeamSelect();
  populateChallengeTeamSelect();
  populateCustomTeamSelect();
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
  const display = message || 'Unable to process arena action. Please try again.';
  if (!uiContext.role) {
    if (createArenaBtn) createArenaBtn.disabled = false;
    setEntryMessage(display);
  } else {
    showToast(display, { intent: 'error', duration: 3200 });
  }
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
  populateCustomTeamSelect();
}

function updateBuzzButtonState() {
  const phase = clientState.questionState;
  const numericTeamId = toNumber(myTeamId);

  const hasBuzzedPrimary =
    numericTeamId !== null &&
    clientState.buzzOrder.some((entry) => toNumber(entry.id) === numericTeamId);

  const hasAnsweredBefore =
    numericTeamId !== null &&
    clientState.answeredTeams.some((id) => toNumber(id) === numericTeamId);

  const hasBuzzedChallenge =
    numericTeamId !== null &&
    clientState.challengeBuzzOrder.some(
      (entry) => toNumber(entry.id) === numericTeamId
    );

  const canBuzz =
    phase === 'answering' &&
    numericTeamId !== null &&
    Boolean(myTeamName) &&
    !hasBuzzedPrimary &&
    !hasAnsweredBefore;
  bigBuzzBtn.disabled = !canBuzz;

  const wrongId = toNumber(clientState.wrongAnswerTeamId);
  const challengeIneligible =
    numericTeamId !== null &&
    clientState.challengeIneligibleTeams.some((id) => toNumber(id) === numericTeamId);
  const isWrongAnsweringTeam =
    numericTeamId !== null && wrongId !== null && numericTeamId === wrongId;

  const canChallenge =
    phase === 'challenge' &&
    numericTeamId !== null &&
    Boolean(myTeamName) &&
    !isWrongAnsweringTeam &&
    !hasBuzzedChallenge &&
    !challengeIneligible;

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

function renderQueueList(listElement, order, { isChallenge = false, emptyText } = {}) {
  if (!listElement) return;
  listElement.innerHTML = '';

  const entries = Array.isArray(order) ? order : [];
  const answeredSet = new Set(Array.isArray(clientState.answeredTeams) ? clientState.answeredTeams : []);

  if (entries.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = emptyText || (isChallenge ? 'Waiting for challenge buzz...' : 'Waiting for buzz...');
    listElement.appendChild(li);
    return;
  }

  entries.forEach((entry, index) => {
    const li = document.createElement('li');
    li.classList.add('buzz-pos');

    if (isChallenge) {
      li.classList.add('challenge-pos');
    } else {
      li.classList.add(`buzz-pos-${Math.min(index + 1, 4)}`);
    }

    const rankLabel = isChallenge ? `C${index + 1}` : index + 1;
    const numericId = toNumber(entry.id);
    const displayName = entry.name || getTeamName(numericId !== null ? numericId : entry.id);

    if (!isChallenge && numericId !== null && answeredSet.has(numericId)) {
      li.classList.add('buzz-pos--answered');
    }

    li.innerHTML = `
      <span class="buzz-rank">${rankLabel}</span>
      <span class="buzz-name">${displayName}</span>
    `;
    listElement.appendChild(li);
  });
}

function renderAdminQueues() {
  renderQueueList(adminBuzzOrderList, clientState.buzzOrder, {
    isChallenge: false,
    emptyText: 'Waiting for buzz...',
  });

  renderQueueList(adminChallengeOrderList, clientState.challengeBuzzOrder, {
    isChallenge: true,
    emptyText: 'No challengers yet.',
  });
}

function renderBuzzOrder(order, { isChallenge = false } = {}) {
  renderQueueList(buzzOrderList, order, {
    isChallenge,
    emptyText: isChallenge ? 'Waiting for challenge buzz...' : 'Waiting for buzz...',
  });
  renderAdminQueues();
}

function updateAdminControls() {
  if (btnOpenChallenge) {
    const challengeLive = clientState.questionState === 'challenge';
    const canOpen = clientState.questionState === 'answering';
    btnOpenChallenge.disabled = !canOpen;
    btnOpenChallenge.classList.toggle('action-btn--ready', canOpen && clientState.challengeAvailable);
    btnOpenChallenge.textContent = challengeLive ? 'Challenges Live' : 'Allow Challenges';
  }

  if (btnCloseChallenge) {
    const canClose = clientState.questionState === 'challenge';
    btnCloseChallenge.disabled = !canClose;
    btnCloseChallenge.classList.toggle('action-btn--ready', canClose);
  }

  if (btnCorrect) btnCorrect.disabled = false;
  if (btnWrong) btnWrong.disabled = false;

  if (btnChallengeCorrect) btnChallengeCorrect.disabled = false;
  if (btnChallengeWrong) btnChallengeWrong.disabled = false;
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
  clientState.answeredTeams = Array.isArray(state.answeredTeams)
    ? state.answeredTeams.map((value) => toNumber(value)).filter((value) => value !== null)
    : [];
  clientState.challengeIneligibleTeams = Array.isArray(state.challengeIneligibleTeams)
    ? state.challengeIneligibleTeams.map((value) => toNumber(value)).filter((value) => value !== null)
    : [];
  clientState.lastWrongAnswerTeamId = toNumber(state.lastWrongAnswerTeamId);

  setScores(state.teamScores || {});

  if (roundStatusText) {
    const currentAnswering = getTeamName(clientState.currentAnsweringTeam);
    switch (clientState.questionState) {
      case 'challenge': {
        const wrongTeamName = getTeamName(clientState.wrongAnswerTeamId);
        setRoundStatus(
          wrongTeamName
            ? `Challenge open! Initial answer from ${highlightName(wrongTeamName)} was wrong. Teams can now buzz to challenge.`
            : 'Challenge phase active. Teams can now buzz to challenge.'
        );
        break;
      }
      case 'answering': {
        if (currentAnswering) {
          setRoundStatus(`${highlightName(currentAnswering)} has the mic. Awaiting answer...`);
        } else if (clientState.buzzOrder.length > 0) {
          setRoundStatus('Awaiting admin selection for the next answer.');
        } else {
          setRoundStatus('Question live. Waiting for buzz...');
        }
        break;
      }
      case 'finished':
        setRoundStatus('Question complete. Prepare the next move.');
        break;
      default:
        setRoundStatus('Ready for next question');
        break;
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
  refreshAdminSelectors();
});

socket.on('buzz-update', ({ buzzOrder, currentAnsweringTeam, answeredTeams }) => {
  clientState.questionState = 'answering';
  clientState.buzzOrder = Array.isArray(buzzOrder) ? buzzOrder : [];
  clientState.challengeBuzzOrder = [];
  clientState.currentAnsweringTeam = toNumber(currentAnsweringTeam);
  clientState.wrongAnswerTeamId = null;
  if (Array.isArray(answeredTeams)) {
    clientState.answeredTeams = answeredTeams
      .map((value) => toNumber(value))
      .filter((value) => value !== null);
  }

  renderBuzzOrder(clientState.buzzOrder);

  const answeringName = getTeamName(clientState.currentAnsweringTeam);
  updateCurrentAnsweringDisplay(clientState.currentAnsweringTeam);

  if (roundStatusText) {
    if (answeringName) {
      setRoundStatus(`${highlightName(answeringName)} has the mic. Awaiting answer...`);
    } else if (clientState.buzzOrder.length > 0) {
      setRoundStatus('Awaiting admin selection for the next answer.');
    } else {
      setRoundStatus('Waiting for buzz...');
    }
  }

  const last = clientState.buzzOrder[clientState.buzzOrder.length - 1];
  if (last) {
    const logName = last.name || getTeamName(last.id);
    if (logName) {
      logEvent(`Buzz registered from ${logName}`);
    }
  }

  updateBuzzButtonState();
  refreshAdminSelectors();
});

socket.on('answering-team-selected', ({ teamId, teamName }) => {
  const numericId = toNumber(teamId);
  clientState.currentAnsweringTeam = numericId;
  if (teamName) {
    logEvent(`Admin selected ${teamName} to answer.`);
  } else if (numericId !== null) {
    logEvent(`Admin selected ${getTeamName(numericId)} to answer.`);
  }
  updateCurrentAnsweringDisplay(clientState.currentAnsweringTeam);
  refreshAdminSelectors();
});

socket.on('answer-evaluated', ({ teamId, result, teamName, nextAnsweringTeam, challengeAvailable, questionState, pointsDelta, bonusApplied }) => {
  const numericId = toNumber(teamId);
  const displayName = teamName || getTeamName(numericId);
  const deltaText = typeof pointsDelta === 'number' ? `${pointsDelta > 0 ? '+' : ''}${pointsDelta}` : null;
  const bonusSuffix = bonusApplied ? ' (bonus)' : '';

  if (numericId !== null) {
    clientState.answeredTeams = Array.from(
      new Set([...clientState.answeredTeams, numericId])
    );
    clientState.challengeIneligibleTeams = Array.from(
      new Set([...clientState.challengeIneligibleTeams, numericId])
    );
  }

  if (typeof questionState === 'string') {
    clientState.questionState = questionState;
  }

  if (typeof challengeAvailable === 'boolean') {
    clientState.challengeAvailable = challengeAvailable;
  }

  if (result === 'wrong') {
    clientState.wrongAnswerTeamId = numericId;
    clientState.lastWrongAnswerTeamId = numericId;

    if (nextAnsweringTeam !== undefined) {
      clientState.currentAnsweringTeam = toNumber(nextAnsweringTeam);
    }

    if (!questionState) {
      clientState.questionState = 'answering';
    }

    if (displayName) {
      const detail = deltaText ? ` (${deltaText})` : '';
      logEvent(`Answer marked wrong for ${displayName}${detail}.`);
    }

    if (answerBonusToggle) {
      answerBonusToggle.checked = false;
    }

    if (numericId !== null && numericId === toNumber(myTeamId)) {
      showToast('Wrong answer. Eyes on the challenge window.', {
        intent: 'error',
        duration: 2800,
      });
    }
  } else if (result === 'correct') {
    clientState.wrongAnswerTeamId = null;
    clientState.lastWrongAnswerTeamId = null;
    clientState.currentAnsweringTeam = numericId;
    if (answerBonusToggle) {
      answerBonusToggle.checked = false;
    }

    if (typeof challengeAvailable !== 'boolean') {
      clientState.challengeAvailable = false;
    }

    if (!questionState) {
      clientState.questionState = 'finished';
    }

    if (displayName) {
      const detail = deltaText ? ` (${deltaText})` : '';
      logEvent(`Answer marked correct for ${displayName}${detail}${bonusSuffix}.`);
    }
  }

  const showingChallenge = clientState.questionState === 'challenge';
  if (showingChallenge) {
    renderBuzzOrder(clientState.challengeBuzzOrder, { isChallenge: true });
  } else {
    renderBuzzOrder(clientState.buzzOrder);
  }

  updateCurrentAnsweringDisplay(clientState.currentAnsweringTeam);
  updateBuzzButtonState();
  refreshAdminSelectors();
});

socket.on('challenge-evaluated', ({ teamId, result, teamName, nextAnsweringTeam, pointsDelta, bonusApplied }) => {
  const numericId = toNumber(teamId);
  const displayName = teamName || getTeamName(numericId);
  const deltaText = typeof pointsDelta === 'number' ? `${pointsDelta > 0 ? '+' : ''}${pointsDelta}` : null;
  const bonusSuffix = bonusApplied ? ' (bonus)' : '';

  if (numericId !== null) {
    clientState.challengeIneligibleTeams = Array.from(
      new Set([...clientState.challengeIneligibleTeams, numericId])
    );
  }

  clientState.challengeBuzzOrder = [];

  if (result === 'correct') {
    if (displayName) {
      const detail = deltaText ? ` (${deltaText})` : '';
      logEvent(`Challenge by ${displayName} succeeded${detail}${bonusSuffix}.`);
    }
    clientState.questionState = 'finished';
    clientState.currentAnsweringTeam = numericId;
    clientState.wrongAnswerTeamId = null;
    if (challengeBonusToggle) {
      challengeBonusToggle.checked = false;
    }
  } else {
    if (displayName) {
      const detail = deltaText ? ` (${deltaText})` : '';
      logEvent(`Challenge by ${displayName} failed${detail}.`);
    }
    clientState.currentAnsweringTeam = toNumber(nextAnsweringTeam);
    clientState.questionState = clientState.currentAnsweringTeam ? 'answering' : 'finished';
    clientState.wrongAnswerTeamId = null;
    if (challengeBonusToggle) {
      challengeBonusToggle.checked = false;
    }
  }

  const showingChallenge = clientState.questionState === 'challenge';
  if (showingChallenge) {
    renderBuzzOrder(clientState.challengeBuzzOrder, { isChallenge: true });
  } else {
    renderBuzzOrder(clientState.buzzOrder);
  }

  updateCurrentAnsweringDisplay(clientState.currentAnsweringTeam);
  updateBuzzButtonState();
  refreshAdminSelectors();
});

socket.on('custom-score-applied', ({ teamId, delta, teamName, updatedScore }) => {
  const numericId = toNumber(teamId);
  const name = teamName || getTeamName(numericId);
  const deltaText = Number(delta) > 0 ? `+${Number(delta)}` : `${Number(delta)}`;
  if (name) {
    logEvent(`Custom score ${deltaText} applied to ${name}.`);
  }
  if (numericId !== null && numericId === toNumber(myTeamId)) {
    showToast(`Score adjusted: ${deltaText} points.`, {
      intent: Number(delta) >= 0 ? 'success' : 'error',
      duration: 2600,
    });
  }
  if (typeof updatedScore === 'number' && name && uiContext.role === 'admin') {
    showToast(`${name} now at ${updatedScore} points.`, { intent: 'success', duration: 2200 });
  }
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
 
socket.on('challenge-open', ({ currentAnsweringTeam, buzzOrder, wrongAnswerTeamId, challengeIneligibleTeams }) => {
  clientState.questionState = 'challenge';
  clientState.challengeAvailable = false;
  clientState.buzzOrder = Array.isArray(buzzOrder) ? buzzOrder : clientState.buzzOrder;
  clientState.challengeBuzzOrder = [];
  clientState.currentAnsweringTeam = toNumber(currentAnsweringTeam);
  clientState.wrongAnswerTeamId = toNumber(
    wrongAnswerTeamId !== undefined && wrongAnswerTeamId !== null
      ? wrongAnswerTeamId
      : currentAnsweringTeam
  );
  if (Array.isArray(challengeIneligibleTeams)) {
    clientState.challengeIneligibleTeams = challengeIneligibleTeams
      .map((value) => toNumber(value))
      .filter((value) => value !== null);
  }

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
  updateCurrentAnsweringDisplay(clientState.currentAnsweringTeam);
  updateBuzzButtonState();
  updateAdminControls();
  refreshAdminSelectors();
});

socket.on('challenge-closed', ({ reason }) => {
  if (clientState.questionState === 'challenge') {
    clientState.questionState = 'answering';
  }
  clientState.challengeAvailable = false;
  clientState.challengeBuzzOrder = [];

  if (roundStatusText) {
    const statusMessage = reason === 'admin'
      ? 'Challenges closed. Select the next answering team.'
      : 'Challenge phase closed.';
    setRoundStatus(statusMessage);
  }

  logEvent('Challenge phase closed.');
  renderBuzzOrder(clientState.buzzOrder, { isChallenge: false });
  updateCurrentAnsweringDisplay(clientState.currentAnsweringTeam);
  updateBuzzButtonState();
  updateAdminControls();
  refreshAdminSelectors();
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
  } else if (reason === 'exhausted') {
    setRoundStatus('Question ended. No teams remaining.');
    logEvent('Question ended with no remaining teams.');
  } else {
    setRoundStatus('Question ended.');
    logEvent('Question closed.');
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
  refreshAdminSelectors();
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
  } else {
    clientState.currentAnsweringTeam = null;
    updateCurrentAnsweringDisplay(null);
  }

  updateBuzzButtonState();
  refreshAdminSelectors();
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
