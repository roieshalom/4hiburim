console.log('game.js loaded');

let puzzles = [];
let currentPuzzleIndex = 0;
let currentPuzzle = null;

// Now track selected by word text ONLY, but always derive classes from state
let selectedWords = [];
let mistakes = 0;
let solvedCategories = [];
let remainingWords = [];
let triedCombinations = new Set();

// ------------------ CLARITY HELPERS ------------------

function trackPuzzleEvent(eventName, extra = {}) {
  if (typeof window === 'undefined' || typeof window.clarity !== 'function') return;

  const today = getTodayDDMMYYYY();
  const puzzleId = puzzles[0]?.id || currentPuzzle?.id || 'unknown';
  const difficultySummary = currentPuzzle
    ? currentPuzzle.categories.map(c => c.difficulty).join(',')
    : '';

  window.clarity("set", "puzzle_id", String(puzzleId));
  window.clarity("set", "puzzle_date", String(today));
  window.clarity("set", "puzzle_difficulties", String(difficultySummary));

  Object.entries(extra).forEach(([key, value]) => {
    window.clarity("set", String(key), String(value));
  });

  window.clarity("event", eventName);
}

// ------------------ DATE + Puzzles ------------------

function getTodayDDMMYYYY() {
  const d = new Date();
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
}

async function loadPuzzles() {
  const res = await fetch('puzzles.json');
  const data = await res.json();
  const today = getTodayDDMMYYYY();
  puzzles = (data.puzzles || []).filter(p => p.date === today);
}

// ------------------ STORAGE KEYS ------------------

const STORAGE_KEY_PREFIX = 'grooped-puzzle-';
const STATE_KEY_PREFIX   = 'grooped-state-';

function getTodayKey() {
  const today = getTodayDDMMYYYY();
  const puzzleId = puzzles[0]?.id;
  return `${STORAGE_KEY_PREFIX}${today}-${puzzleId}`;
}

function isTodayPuzzleLocked() {
  const key = getTodayKey();
  return localStorage.getItem(key) === 'done';
}

function lockTodayPuzzle() {
  const key = getTodayKey();
  localStorage.setItem(key, 'done');
}

function getTodayStateKey() {
  const today = getTodayDDMMYYYY();
  const puzzleId = puzzles[0]?.id;
  return `${STATE_KEY_PREFIX}${today}-${puzzleId}`;
}

function saveFinalState(state) {
  const key = getTodayStateKey();
  localStorage.setItem(key, JSON.stringify(state));
}

function loadFinalState() {
  const key = getTodayStateKey();
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const TROPHY_KEY = 'grooped-trophies';

// ------------------ MIGRATION FROM OLD KEYS ------------------

function migrateFromOldKeys() {
  const oldTrophyKey = '4hiburim-trophies';
  const oldTrophyValue = localStorage.getItem(oldTrophyKey);
  if (oldTrophyValue !== null && localStorage.getItem(TROPHY_KEY) === null) {
    localStorage.setItem(TROPHY_KEY, oldTrophyValue);
  }

  const today = getTodayDDMMYYYY();
  const puzzleId = puzzles[0]?.id;

  if (puzzleId) {
    const oldPuzzleKey = `4hiburim-puzzle-${today}-${puzzleId}`;
    const oldPuzzleValue = localStorage.getItem(oldPuzzleKey);
    if (oldPuzzleValue !== null) {
      const newPuzzleKey = getTodayKey();
      if (localStorage.getItem(newPuzzleKey) === null) {
        localStorage.setItem(newPuzzleKey, oldPuzzleValue);
      }
    }

    const oldStateKey = `4hiburim-state-${today}-${puzzleId}`;
    const oldStateValue = localStorage.getItem(oldStateKey);
    if (oldStateValue !== null) {
      const newStateKey = getTodayStateKey();
      if (localStorage.getItem(newStateKey) === null) {
        localStorage.setItem(newStateKey, oldStateValue);
      }
    }

    const oldProgressKey = `4hiburim-progress-${today}-${puzzleId}`;
    const oldProgressValue = localStorage.getItem(oldProgressKey);
    if (oldProgressValue !== null) {
      const newProgressKey = getTodayProgressKey();
      if (localStorage.getItem(newProgressKey) === null) {
        localStorage.setItem(newProgressKey, oldProgressValue);
      }
    }
  }

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('4hiburim-')) {
      const newKey = key.replace('4hiburim-', 'grooped-');
      if (localStorage.getItem(newKey) === null) {
        const value = localStorage.getItem(key);
        if (value !== null) {
          localStorage.setItem(newKey, value);
        }
      }
    }
  }
}

// ----- in‑progress state -----

function getTodayProgressKey() {
  const today = getTodayDDMMYYYY();
  const puzzleId = puzzles[0]?.id;
  return `grooped-progress-${today}-${puzzleId}`;
}

function saveProgressState() {
  const key = getTodayProgressKey();
  const state = {
    mistakes,
    solvedCategories,
    remainingWords,
    selectedWords: selectedWords || [],
  };
  localStorage.setItem(key, JSON.stringify(state));
}

function loadProgressState() {
  const key = getTodayProgressKey();
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function clearProgressState() {
  const key = getTodayProgressKey();
  localStorage.removeItem(key);
}

function getTrophyCount() {
  const raw = localStorage.getItem(TROPHY_KEY);
  const n = raw == null ? 0 : parseInt(raw, 10);
  return isNaN(n) ? 0 : n;
}

function setTrophyCount(n) {
  localStorage.setItem(TROPHY_KEY, String(n));
}

function updateTrophyDisplay(value) {
  const el = document.getElementById('trophy-count');
  if (!el) return;
  el.textContent = value;
}

function incrementTrophyCount() {
  const current = getTrophyCount();
  const next = current + 1;
  setTrophyCount(next);
  updateTrophyDisplay(next);
}

// ------------------ GAME INITIALIZATION ------------------

function initGame() {
  currentPuzzle = puzzles[currentPuzzleIndex];

  const saved = loadProgressState();
  if (saved) {
    mistakes         = saved.mistakes || 0;
    solvedCategories = saved.solvedCategories || [];
    remainingWords   = saved.remainingWords || [];
    selectedWords    = saved.selectedWords || [];
    triedCombinations = new Set();
    updateDisplay();
    return;
  }

  mistakes         = 0;
  solvedCategories = [];
  selectedWords    = [];
  triedCombinations = new Set();

  remainingWords = currentPuzzle.categories.flatMap(cat =>
    cat.words.map(word => ({
      word,
      category: cat.name,
      difficulty: cat.difficulty
    }))
  );
  shuffleArray(remainingWords);
  updateDisplay();
}

// Shuffle array util

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

// ------------------ TEXT FIT HELPER ------------------

function fitWordToTile(tile) {
  const textEl = tile.querySelector('.word-text');
  if (!textEl) return;

  const isMobile = window.matchMedia('(max-width: 600px)').matches;
  const baseSize = isMobile ? 13 : 16;

  let fontSize = baseSize;
  textEl.style.fontSize = baseSize + 'px';

  const maxWidth = tile.clientWidth - 14;

  while (textEl.scrollWidth > maxWidth && fontSize > 10) {
    fontSize -= 0.5;
    textEl.style.fontSize = fontSize + 'px';
  }
}

// ------------------ SOLVED BAR RENDER ------------------

let lastSolvedSignature = '';

function renderSolvedCategoriesIfChanged() {
  const signature = JSON.stringify(solvedCategories);
  if (signature === lastSolvedSignature) return; // nothing changed

  lastSolvedSignature = signature;

  const solvedContainer = document.getElementById('solved-categories');
  solvedContainer.innerHTML = '';
  solvedCategories.forEach(cat => {
    const div = document.createElement('div');
    div.className = `solved-category ${cat.difficulty}`;
    div.innerHTML = `
      <div class="category-name">${cat.name}</div>
      <div class="category-words">${cat.words.join(', ')}</div>
    `;
    solvedContainer.appendChild(div);
  });
}

// ------------------ RENDER ------------------

function updateDisplay() {
  document.getElementById('mistakes').textContent = mistakes;
  saveProgressState();

  // NEW: only update solved bar when needed
  renderSolvedCategoriesIfChanged();

  const board = document.getElementById('game-board');
  board.innerHTML = '';

  remainingWords.forEach(item => {
    const tile = document.createElement('div');
    tile.className = 'word-tile';

    // keep selection visual state in sync
    if (selectedWords.includes(item.word)) {
      tile.classList.add('selected');
    }

    tile.innerHTML = `<span class="word-text">${item.word}</span>`;

    const textEl = tile.querySelector('.word-text');
    if (item.word.includes(' ')) {
      textEl.classList.add('has-space');
    }

    tile.addEventListener('click', () => toggleWord(item.word));

    board.appendChild(tile);
    fitWordToTile(tile);
  });

  document.getElementById('submit-btn').disabled = selectedWords.length !== 4;
  updateDeselectButtonState();

  if (remainingWords.length === 0) {
    return;
  }

  if (mistakes >= 4 && remainingWords.length > 0) {
    showMessage('Game Over! Try a new puzzle.', 'incorrect');
  }
}


// ------------------ INTERACTION ------------------

function toggleWord(word) {
  if (mistakes >= 4 || remainingWords.length === 0) return;

  const index = selectedWords.indexOf(word);

  if (index > -1) {
    selectedWords.splice(index, 1);
  } else {
    if (selectedWords.length >= 4) return;
    selectedWords.push(word);
  }

  document.getElementById('submit-btn').disabled = selectedWords.length !== 4;
  updateDeselectButtonState();
  updateDisplay(); // always re-render so DOM matches state
}

function highlightSelectedGroup() {
  const tiles = document.querySelectorAll('.word-tile');
  tiles.forEach(tile => {
    const text = tile.textContent.trim();
    if (selectedWords.includes(text)) {
      tile.classList.add('group-selected');
    } else {
      tile.classList.remove('group-selected');
    }
  });
}

// Submit guess with small animation

const PRE_CHECK_DELAY = 150;

function submitGuess() {
  if (selectedWords.length !== 4) return;
  if (mistakes >= 4) return;

  const comboKey = selectedWords.slice().sort().join('|');
  if (triedCombinations.has(comboKey)) {
    showMessage('Already tried', 'incorrect', 1200);
    return;
  }
  triedCombinations.add(comboKey);

  highlightSelectedGroup();
  document.getElementById('submit-btn').disabled = true;

  setTimeout(() => {
    const selectedUpper = selectedWords.map(w => w.toUpperCase());

    const category = currentPuzzle.categories.find(cat => {
      const catWordsUpper = cat.words.map(w => w.toUpperCase());
      return (
        selectedUpper.every(w => catWordsUpper.includes(w)) &&
        selectedUpper.length === catWordsUpper.length
      );
    });

    if (category) {
      handleCorrectGuess(category);
    } else {
      handleWrongGuess(selectedUpper);
    }
  }, PRE_CHECK_DELAY);
}

function handleCorrectGuess(category) {
  showMessage('Correct!', 'correct', 800);

  const tiles = document.querySelectorAll('.word-tile');

  const CORRECT_HOP_DURATION     = 250;
  const PAUSE_AFTER_HOP          = 300;
  const CORRECT_RESOLVE_DURATION = 500;
  const EXTRA_READ_TIME          = 800;

  tiles.forEach(tile => {
    const text = tile.textContent.trim();
    if (selectedWords.includes(text)) {
      tile.classList.add('correct-hop');
    }
  });

  setTimeout(() => {
    tiles.forEach(tile => {
      const text = tile.textContent.trim();
      if (selectedWords.includes(text)) {
        tile.classList.remove('correct-hop');
      }
    });
  }, CORRECT_HOP_DURATION);

  setTimeout(() => {
    tiles.forEach(tile => {
      const text = tile.textContent.trim();
      if (selectedWords.includes(text)) {
        tile.classList.add('correct-resolve');
      }
    });
  }, CORRECT_HOP_DURATION + PAUSE_AFTER_HOP);

  setTimeout(() => {
    solvedCategories.push({
      name: category.name,
      words: category.words,
      difficulty: category.difficulty
    });

    remainingWords = remainingWords.filter(
      item => !selectedWords.includes(item.word)
    );

    selectedWords = [];

    const wasLastGroup = remainingWords.length === 0;

    if (wasLastGroup) {
      lockTodayPuzzle();
      saveFinalState({
        type: 'solved',
        solvedCategories: solvedCategories.slice(),
        mistakes
      });

      incrementTrophyCount();

      trackPuzzleEvent("puzzle_completed", {
        result: "solved",
        mistakes: mistakes,
        groups_solved: solvedCategories.length
      });

      remainingWords = [];
      renderFullSolutionGrid(solvedCategories);
    }

    updateDisplay();

    if (wasLastGroup) {
      showMessage(
        '🏆 You solved the puzzle!<br>Come back tomorrow<br>for a new puzzle',
        'correct',
        4000
      );
    } else {
      showMessage('', '');
    }
  }, CORRECT_HOP_DURATION + PAUSE_AFTER_HOP + CORRECT_RESOLVE_DURATION + EXTRA_READ_TIME);
}

function handleWrongGuess(selectedUpper) {
  let maxOverlap = 0;
  currentPuzzle.categories.forEach(cat => {
    const catWordsUpper = cat.words.map(w => w.toUpperCase());
    const overlap = selectedUpper.filter(w => catWordsUpper.includes(w)).length;
    if (overlap > maxOverlap) maxOverlap = overlap;
  });

  if (maxOverlap === 3) {
    showMessage('One away', 'incorrect', 1200);
  } else {
    showMessage('', '', 0);
  }

  mistakes++;
  saveProgressState();

  const tiles = document.querySelectorAll('.word-tile');
  tiles.forEach(tile => {
    const text = tile.textContent.trim();
    if (selectedWords.includes(text)) {
      tile.classList.add('wrong-guess');
    }
  });

  const JIGGLE_DURATION = 300;
  const EXTRA_READ_TIME = 1000;

  setTimeout(() => {
    tiles.forEach(tile => {
      tile.classList.remove('wrong-guess');
    });

    const mistakesEl = document.getElementById('mistakes');
    if (mistakesEl) {
      mistakesEl.textContent = mistakes;
    }

    if (mistakes >= 4) {
      handleFailure();
    }
  }, JIGGLE_DURATION + EXTRA_READ_TIME);

  setTimeout(() => {
    if (mistakes < 4 && remainingWords.length > 0) {
      showMessage('', '');
    }
  }, JIGGLE_DURATION + EXTRA_READ_TIME);
}

function handleFailure() {
  lockTodayPuzzle();
  const fullSolution = currentPuzzle.categories.map(cat => ({
    name: cat.name,
    words: cat.words,
    difficulty: cat.difficulty
  }));

  const finalState = {
    type: 'failed',
    solvedCategories: fullSolution,
    mistakes
  };
  saveFinalState(finalState);
  clearProgressState();

  solvedCategories = finalState.solvedCategories;
  remainingWords = [];
  renderFullSolutionGrid(solvedCategories);
  updateDisplay();
  showMessage('Better luck tomorrow! Here’s the solution.', 'incorrect', 4000);

  document.getElementById('submit-btn').disabled = true;
  document.getElementById('deselect-btn').disabled = true;
  document.getElementById('shuffle-btn').disabled = true;

  const tiles2 = document.querySelectorAll('.word-tile');
  tiles2.forEach(tile => {
    tile.classList.add('completed');
    tile.style.pointerEvents = 'none';
  });

  trackPuzzleEvent("puzzle_failed", {
    result: "failed",
    mistakes: mistakes,
    groups_solved: solvedCategories.length
  });
}

// ------------------ UTILS ------------------

let currentMessageTimeout = null;

function showMessage(text, type = 'info', duration = 1200) {
  const overlay = document.getElementById('message-overlay');
  if (!overlay) return;

  if (currentMessageTimeout) {
    clearTimeout(currentMessageTimeout);
    currentMessageTimeout = null;
  }

  if (!text) {
    overlay.classList.remove('visible', 'correct', 'incorrect', 'info');
    return;
  }

  overlay.innerHTML = text;

  overlay.classList.remove('correct', 'incorrect', 'info');
  if (type === 'correct') overlay.classList.add('correct');
  else if (type === 'incorrect') overlay.classList.add('incorrect');
  else overlay.classList.add('info');

  overlay.classList.add('visible');

  if (duration > 0) {
    currentMessageTimeout = setTimeout(() => {
      overlay.classList.remove('visible');
      currentMessageTimeout = null;
    }, duration);
  }
}

function positionMessageOverBoard() {
  const overlay = document.getElementById('message-overlay');
  const board = document.getElementById('game-board');
  if (!overlay || !board) return;

  const boardRect = board.getBoundingClientRect();
  const containerRect = document.querySelector('.container').getBoundingClientRect();

  const boardCenterY = boardRect.top + boardRect.height / 2;
  const offsetFromContainerTop = boardCenterY - containerRect.top;

  overlay.style.top = offsetFromContainerTop + 'px';
}

function deselectAll() {
  selectedWords = [];
  updateDisplay();
  saveProgressState();
  updateDeselectButtonState();
}

function shuffleBoard() {
  if (mistakes >= 4 || remainingWords.length === 0) return;

  shuffleArray(remainingWords);
  selectedWords = [];
  updateDisplay();
  saveProgressState();
}

// Resize/text fit

function handleResize() {
  document.body.style.overflowX = 'hidden';
  document.body.style.width = '100%';

  const tiles = document.querySelectorAll('.word-tile');
  tiles.forEach(fitWordToTile);
}

window.addEventListener('orientationchange', () => {
  setTimeout(handleResize, 300);
});

window.addEventListener('resize', handleResize);

function nextPuzzle() {
  currentPuzzleIndex = (currentPuzzleIndex + 1) % puzzles.length;
  initGame();
}

function renderFullSolutionGrid(solutionCategories) {
  const board = document.getElementById('game-board');
  board.innerHTML = '';

  solutionCategories.forEach(cat => {
    cat.words.forEach(word => {
      const tile = document.createElement('div');
      tile.className = `word-tile completed ${cat.difficulty}`;
      tile.innerHTML = `<span class="word-text">${word}</span>`;
      tile.style.pointerEvents = 'none';

      const textEl = tile.querySelector('.word-text');
      if (word.includes(' ')) {
        textEl.classList.add('has-space');
      }

      board.appendChild(tile);
      fitWordToTile(tile);
    });
  });
}

// ------------------ STARTUP ------------------

const deselectButton = document.getElementById('deselect-btn');

function updateDeselectButtonState() {
  const selectedCount = selectedWords.length;
  deselectButton.disabled = selectedCount === 0;
}

document.getElementById('submit-btn').addEventListener('click', submitGuess);
document.getElementById('deselect-btn').addEventListener('click', deselectAll);
document.getElementById('shuffle-btn').addEventListener('click', shuffleBoard);

async function startGame() {
  await loadPuzzles();

  migrateFromOldKeys();

  updateTrophyDisplay(getTrophyCount());

  if (puzzles.length === 0) {
    showMessage('No puzzles loaded.', 'incorrect');
    return;
  }

  currentPuzzleIndex = 0;

  if (isTodayPuzzleLocked()) {
    const state = loadFinalState();

    if (state && state.type === 'solved') {
      solvedCategories = state.solvedCategories;
      remainingWords = [];
      mistakes = state.mistakes;
      renderFullSolutionGrid(solvedCategories);
      updateDisplay();
      showMessage('🏆 You solved the puzzle!<br>Come back tomorrow<br>for a new puzzle', 'correct', 4000);
    } else if (state && state.type === 'failed') {
      solvedCategories = state.solvedCategories;
      remainingWords = [];
      mistakes = state.mistakes;
      renderFullSolutionGrid(solvedCategories);
      updateDisplay();
      showMessage('Better luck tomorrow! Here’s the solution.', 'incorrect', 4000);
    }

    document.getElementById('submit-btn').disabled = true;
    document.getElementById('deselect-btn').disabled = true;
    document.getElementById('shuffle-btn').disabled = true;

    const tiles = document.querySelectorAll('.word-tile');
    tiles.forEach(tile => {
      tile.classList.add('completed');
      tile.style.pointerEvents = 'none';
    });
  } else {
    initGame();
  }
}

startGame();
