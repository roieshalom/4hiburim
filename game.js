console.log('game.js loaded v3');

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

  window.clarity('set', 'puzzle_id', String(puzzleId));
  window.clarity('set', 'puzzle_date', String(today));
  window.clarity('set', 'puzzle_difficulties', String(difficultySummary));

  Object.entries(extra).forEach(([key, value]) => {
    window.clarity('set', String(key), String(value));
  });

  window.clarity('event', eventName);
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
  const idParam = new URLSearchParams(window.location.search).get('id');
  if (idParam !== null) {
    const byId = (data.puzzles || []).filter(p => String(p.id) === String(idParam));
    if (byId.length > 0) {
      puzzles = byId;
      return;
    }
  }
  const today = getTodayDDMMYYYY();
  puzzles = (data.puzzles || []).filter(p => p.date === today);
}

// ------------------ STORAGE KEYS ------------------

const STORAGE_KEY_PREFIX = 'grooped-puzzle-';
const STATE_KEY_PREFIX = 'grooped-state-';

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
    mistakes = saved.mistakes || 0;
    solvedCategories = saved.solvedCategories || [];
    remainingWords = saved.remainingWords || [];
    selectedWords = saved.selectedWords || [];
    triedCombinations = new Set();
    updateDisplayV2();
    return;
  }

  mistakes = 0;
  solvedCategories = [];
  selectedWords = [];
  triedCombinations = new Set();

  remainingWords = currentPuzzle.categories.flatMap(cat =>
    cat.words.map(word => ({
      word,
      category: cat.name,
      difficulty: cat.difficulty,
    })),
  );
  shuffleArray(remainingWords);
  updateDisplayV2();
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

// ------------------ RENDER (NEW VERSION) ------------------

function updateDisplayV2() {
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

    // two-word tiles: always 2 lines
    const parts = item.word.split(' ');
    let wordHtml;
    if (parts.length === 2) {
      wordHtml = `
        <span class="word-text two-words">
          <span class="word-part">${parts[0]}</span>
          <span class="word-part">${parts[1]}</span>
        </span>
      `;
    } else {
      wordHtml = `<span class="word-text">${item.word}</span>`;
    }

    tile.innerHTML = wordHtml;

    const textEl = tile.querySelector('.word-text');
    if (item.word.includes(' ')) {
      textEl.classList.add('has-space');
    }

    tile.dataset.word = item.word;
    tile.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (mistakes >= 4 || remainingWords.length === 0) return;

      // Don't allow selecting a 5th tile
      const alreadySelected = selectedWords.includes(item.word);
      if (!alreadySelected && selectedWords.length >= 4) return;

      // Phase 1: scale down immediately (no color yet)
      tile.classList.add('pressing');

      setTimeout(() => {
        // Phase 2: update state
        const idx = selectedWords.indexOf(item.word);
        if (idx > -1) {
          selectedWords.splice(idx, 1);
        } else {
          selectedWords.push(item.word);
        }

        // Toggle color on the SAME tile element so CSS transition fires
        tile.classList.remove('pressing');
        tile.classList.toggle('selected', selectedWords.includes(item.word));

        // Sync button states & save
        document.getElementById('submit-btn').disabled = selectedWords.length !== 4;
        updateDeselectButtonState();
        saveProgressState();
      }, 100); // matches the 0.10s press transition
    });

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
  updateDisplayV2(); // always re-render so DOM matches state
}

function highlightSelectedGroup() {
  const tiles = document.querySelectorAll('.word-tile');
  tiles.forEach(tile => {
    if (selectedWords.includes(tile.dataset.word)) {
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

  const CORRECT_HOP_DURATION = 450;
  const STAGGER = 50;
  const PAUSE_AFTER_HOP = 200;
  const CORRECT_RESOLVE_DURATION = 450;
  const EXTRA_READ_TIME = 200;
  const SLIDE_DURATION = 380;

  // Bug 1 fix: match on data-word, not textContent
  const getTiles = () => document.querySelectorAll('.word-tile');

  // Stagger hop: tiles animate left→right based on DOM order among selected
  const selectedTiles = Array.from(getTiles()).filter(t => selectedWords.includes(t.dataset.word));
  selectedTiles.forEach((tile, i) => {
    setTimeout(() => tile.classList.add('correct-hop'), i * STAGGER);
  });

  setTimeout(() => {
    getTiles().forEach(tile => {
      if (selectedWords.includes(tile.dataset.word)) {
        tile.classList.remove('correct-hop');
      }
    });
  }, CORRECT_HOP_DURATION + selectedTiles.length * STAGGER);

  const hopEnd = CORRECT_HOP_DURATION + selectedTiles.length * STAGGER;

  setTimeout(() => {
    // Stagger resolve too — same rhythm
    const resolveTiles = Array.from(getTiles()).filter(t => selectedWords.includes(t.dataset.word));
    resolveTiles.forEach((tile, i) => {
      setTimeout(() => tile.classList.add('correct-resolve'), i * STAGGER);
    });
  }, hopEnd + PAUSE_AFTER_HOP);

  setTimeout(() => {
    // Bug 2 fix: snapshot positions of remaining tiles BEFORE re-render
    const prePositions = new Map();
    getTiles().forEach(tile => {
      if (!selectedWords.includes(tile.dataset.word)) {
        const rect = tile.getBoundingClientRect();
        prePositions.set(tile.dataset.word, { top: rect.top, left: rect.left });
      }
    });

    solvedCategories.push({
      name: category.name,
      words: category.words,
      difficulty: category.difficulty,
    });

    remainingWords = remainingWords.filter(
      item => !selectedWords.includes(item.word),
    );

    selectedWords = [];

    const wasLastGroup = remainingWords.length === 0;

    if (wasLastGroup) {
      lockTodayPuzzle();
      saveFinalState({
        type: 'solved',
        solvedCategories: solvedCategories.slice(),
        mistakes,
      });

      incrementTrophyCount();

      trackPuzzleEvent('puzzle_completed', {
        result: 'solved',
        mistakes: mistakes,
        groups_solved: solvedCategories.length,
      });

      remainingWords = [];
      renderFullSolutionGrid(solvedCategories);
    }

    updateDisplayV2();

    // FLIP: slide remaining tiles from their old positions to their new ones
    if (!wasLastGroup && prePositions.size > 0) {
      getTiles().forEach(tile => {
        const oldPos = prePositions.get(tile.dataset.word);
        if (!oldPos) return;
        const newRect = tile.getBoundingClientRect();
        const dx = oldPos.left - newRect.left;
        const dy = oldPos.top - newRect.top;
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return; // didn't move

        // Snap to old position instantly, then transition to new
        tile.style.transition = 'none';
        tile.style.transform = `translate(${dx}px, ${dy}px)`;
        tile.getBoundingClientRect(); // force reflow
        tile.style.transition = `transform ${SLIDE_DURATION}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`;
        tile.style.transform = 'translate(0, 0)';
        setTimeout(() => {
          tile.style.transition = '';
          tile.style.transform = '';
        }, SLIDE_DURATION);
      });
    }

    if (wasLastGroup) {
      showMessage(
        '🏆 You solved the puzzle!<br>Come back tomorrow<br>for a new puzzle',
        'correct',
        4000,
      );
    } else {
      showMessage('', '');
    }
  }, hopEnd + PAUSE_AFTER_HOP + CORRECT_RESOLVE_DURATION + (selectedTiles.length * STAGGER) + EXTRA_READ_TIME);
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
    difficulty: cat.difficulty,
  }));

  const finalState = {
    type: 'failed',
    solvedCategories: fullSolution,
    mistakes,
  };
  saveFinalState(finalState);
  clearProgressState();

  solvedCategories = finalState.solvedCategories;
  remainingWords = [];
  renderFullSolutionGrid(solvedCategories);
  updateDisplayV2();
  showMessage('Better luck tomorrow! Here’s the solution.', 'incorrect', 4000);

  document.getElementById('submit-btn').disabled = true;
  document.getElementById('deselect-btn').disabled = true;
  document.getElementById('shuffle-btn').disabled = true;

  const tiles2 = document.querySelectorAll('.word-tile');
  tiles2.forEach(tile => {
    tile.classList.add('completed');
    tile.style.pointerEvents = 'none';
  });

  trackPuzzleEvent('puzzle_failed', {
    result: 'failed',
    mistakes: mistakes,
    groups_solved: solvedCategories.length,
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
  updateDisplayV2();
  saveProgressState();
  updateDeselectButtonState();
}

function shuffleBoard() {
  if (mistakes >= 4 || remainingWords.length === 0) return;

  shuffleArray(remainingWords);
  selectedWords = [];
  updateDisplayV2();
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
      updateDisplayV2();
      showMessage(
        '🏆 You solved the puzzle!<br>Come back tomorrow<br>for a new puzzle',
        'correct',
        4000,
      );
    } else if (state && state.type === 'failed') {
      solvedCategories = state.solvedCategories;
      remainingWords = [];
      mistakes = state.mistakes;
      renderFullSolutionGrid(solvedCategories);
      updateDisplayV2();
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

// expose our version globally so nothing else wins
window.updateDisplay = updateDisplayV2;

// ── Info / About modal ────────────────────────────────────────────────────────
// Modal div is placed before this <script> tag in the HTML, so getElementById
// works synchronously at parse time — no DOMContentLoaded needed.
(function () {
  const btn   = document.getElementById('about-btn');
  const modal = document.getElementById('about-modal');
  const close = document.getElementById('about-close');
  if (!btn || !modal || !close) return;

  const open = () => modal.classList.add('visible');
  const shut = () => modal.classList.remove('visible');

  btn.addEventListener('click', open);
  close.addEventListener('click', shut);
  modal.addEventListener('click', e => { if (e.target === modal) shut(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') shut(); });

  // Clarity event tracking on outbound links
  document.getElementById('about-link-portfolio')?.addEventListener('click', () => {
    if (typeof clarity === 'function') clarity('event', 'about_portfolio_click');
  });
})();

// ── Contact overlay ───────────────────────────────────────────────────────────
(function () {
  const contactLink    = document.getElementById('contact-link');
  const contactOverlay = document.getElementById('contact-overlay');
  const contactClose   = document.getElementById('contact-close');
  const contactForm    = document.getElementById('contact-form');
  const cfSubmit       = document.getElementById('cf-submit');
  const cfStatus       = document.getElementById('cf-status');

  if (!contactLink || !contactOverlay) return;

  const openContact = () => {
    contactOverlay.classList.add('visible');
    cfStatus.textContent = '';
    cfStatus.className = 'cf-status';
    contactForm.reset();
  };
  const closeContact = () => contactOverlay.classList.remove('visible');

  contactLink.addEventListener('click', openContact);
  contactClose.addEventListener('click', closeContact);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeContact(); });

  contactForm.addEventListener('submit', async e => {
    e.preventDefault();

    const name    = document.getElementById('cf-name').value.trim();
    const message = document.getElementById('cf-message').value.trim();
    if (!name || !message) {
      cfStatus.textContent = 'Please fill in the required fields.';
      cfStatus.className = 'cf-status error';
      return;
    }

    cfSubmit.disabled = true;
    cfStatus.textContent = 'Sending…';
    cfStatus.className = 'cf-status';

    try {
      const res = await fetch('https://formspree.io/f/meenjgbk', {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email: document.getElementById('cf-email').value.trim(),
          message,
        }),
      });
      if (res.ok) {
        cfStatus.textContent = 'Message sent! Thanks 🙌';
        cfStatus.className = 'cf-status success';
        contactForm.reset();
        if (typeof mixpanel !== 'undefined') mixpanel.track('contact_form_sent');
        if (typeof clarity === 'function') clarity('event', 'contact_form_sent');
      } else {
        throw new Error('server error');
      }
    } catch {
      cfStatus.textContent = 'Something went wrong. Try again?';
      cfStatus.className = 'cf-status error';
    } finally {
      cfSubmit.disabled = false;
    }
  });
})();
