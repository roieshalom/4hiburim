console.log('game.js loaded');

let puzzles = [];
let currentPuzzleIndex = 0;
let currentPuzzle = null;
let selectedWords = [];
let mistakes = 0;
let solvedCategories = [];
let remainingWords = [];
let triedCombinations = new Set();

// ------------------ DATE + PUZZLES ------------------

function getTodayDDMMYYYY() {
    const d = new Date();
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}.${month}.${year}`;
}

async function loadPuzzles() {
    const res = await fetch('2025_puzzles.json');
    const data = await res.json();
    const today = getTodayDDMMYYYY();
    console.log('today:', today, 'data:', data);

    puzzles = data.puzzles.filter(p => p.date === today);
    console.log('filtered puzzles:', puzzles);
}

// ------------------ STORAGE KEYS ------------------

const STORAGE_KEY_PREFIX = '4hiburim-puzzle-';
const STATE_KEY_PREFIX = '4hiburim-state-';

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

// ----- in‑progress state -----

function getTodayProgressKey() {
    const today = getTodayDDMMYYYY();
    const puzzleId = puzzles[0]?.id;
    return `4hiburim-progress-${today}-${puzzleId}`;
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

// ------------------ GAME INITIALIZATION ------------------

function initGame() {
    currentPuzzle = puzzles[currentPuzzleIndex];

    const saved = loadProgressState();
    if (saved) {
        mistakes = saved.mistakes || 0;
        solvedCategories = saved.solvedCategories || [];
        remainingWords = saved.remainingWords || [];
        selectedWords = [];              // clear any stale selection
        triedCombinations = new Set();

        updateDisplay();
        return;
    }


    mistakes = 0;
    solvedCategories = [];
    selectedWords = [];
    triedCombinations = new Set();

    remainingWords = currentPuzzle.categories.flatMap(cat =>
        cat.words.map(word => ({
            word: word,
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

// ------------------ RENDER ------------------

function updateDisplay() {
    document.getElementById('mistakes').textContent = mistakes;
    saveProgressState();

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

    const board = document.getElementById('game-board');
    board.innerHTML = '';
    remainingWords.forEach(item => {
        const tile = document.createElement('div');
        tile.className = 'word-tile';
        tile.textContent = item.word;
        tile.addEventListener('click', () => toggleWord(item.word, tile));
        board.appendChild(tile);
    });
    
    document.getElementById('submit-btn').disabled = selectedWords.length !== 4;


    if (remainingWords.length === 0) {
        showMessage('🏆Congratulations,<br>You solved the puzzle!', 'correct');

        clearProgressState();
        saveFinalState({
            mistakes,
            solvedCategories,
        });

        // Disable interactions but keep the board visible
        document.getElementById('submit-btn').disabled = true;
        document.getElementById('deselect-btn').disabled = true;
        document.getElementById('shuffle-btn').disabled = true;

        const tiles = document.querySelectorAll('.word-tile');
        tiles.forEach(tile => {
            tile.classList.add('completed');
            tile.style.pointerEvents = 'none';
        });

        return;
    }

    if (mistakes >= 4 && remainingWords.length > 0) {
        showMessage('Game Over! Try a new puzzle.', 'incorrect');
    }
}

// ------------------ INTERACTION ------------------

function toggleWord(word, tileElement) {
    if (mistakes >= 4 || remainingWords.length === 0) return;

    const index = selectedWords.indexOf(word);

    if (index > -1) {
        // Deselect this tile
        selectedWords.splice(index, 1);
        tileElement.classList.remove('selected');
        tileElement.classList.remove('group-selected');
    } else {
        // Only allow selecting a new tile if currently fewer than 4 are selected
        if (selectedWords.length >= 4) {
            return;
        }
        selectedWords.push(word);
        tileElement.classList.add('selected');
    }

    document.getElementById('submit-btn').disabled = selectedWords.length !== 4;
}

function highlightSelectedGroup() {
    const tiles = document.querySelectorAll('.word-tile');
    tiles.forEach(tile => {
        if (selectedWords.includes(tile.textContent)) {
            tile.classList.add('group-selected');
        }
    });
}

// Submit guess with small animation
const PRE_CHECK_DELAY = 150;
const CORRECT_DELAY   = 800;
const WRONG_DELAY     = 450;

function submitGuess() {
    if (selectedWords.length !== 4) return;
    if (mistakes >= 4) return;

    // Already tried check (order independent)
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

        // Check exact correct category
        const category = currentPuzzle.categories.find(cat => {
            const catWords = cat.words.map(w => w.toUpperCase());
            return (
                selectedUpper.every(w => catWords.includes(w)) &&
                selectedUpper.length === catWords.length
            );
        });

        if (category) {
            showMessage('Correct!', 'correct', 800);

            const tiles = document.querySelectorAll('.word-tile');

            const CORRECT_HOP_DURATION     = 250;
            const PAUSE_AFTER_HOP          = 300;
            const CORRECT_RESOLVE_DURATION = 500;
            const EXTRA_READ_TIME          = 800;

            // 1) hop
            tiles.forEach(tile => {
                if (selectedWords.includes(tile.textContent)) {
                    tile.classList.add('correct-hop');
                }
            });

            // 2) remove hop
            setTimeout(() => {
                tiles.forEach(tile => {
                    if (selectedWords.includes(tile.textContent)) {
                        tile.classList.remove('correct-hop');
                    }
                });
            }, CORRECT_HOP_DURATION);

            // 3) dissolve up
            setTimeout(() => {
                tiles.forEach(tile => {
                    if (selectedWords.includes(tile.textContent)) {
                        tile.classList.add('correct-resolve');
                    }
                });
            }, CORRECT_HOP_DURATION + PAUSE_AFTER_HOP);

            // 4) update state
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

        } else {
            // compute how close the guess is
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
                if (selectedWords.includes(tile.textContent)) {
                    tile.classList.add('wrong-guess');
                }
            });


            const JIGGLE_DURATION = 300;
            const EXTRA_READ_TIME = 1000;

            setTimeout(() => {
                tiles.forEach(tile => {
                    tile.classList.remove('wrong-guess');
                });

                document.getElementById('mistakes').textContent = mistakes;

                if (mistakes >= 4) {
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
                    updateDisplay();
                    showMessage('Better luck tomorrow!<br>Here’s today solution.', 'incorrect', 4000);

                    document.getElementById('submit-btn').disabled = true;
                    document.getElementById('deselect-btn').disabled = true;
                    document.getElementById('shuffle-btn').disabled = true;

                    const tiles2 = document.querySelectorAll('.word-tile');
                    tiles2.forEach(tile => {
                        tile.classList.add('completed');
                        tile.style.pointerEvents = 'none';
                    });
                }
            }, JIGGLE_DURATION + EXTRA_READ_TIME);

            setTimeout(() => {
                if (mistakes < 4 && remainingWords.length > 0) {
                    showMessage('', '');
                }
            }, JIGGLE_DURATION + EXTRA_READ_TIME);
        }

    }, PRE_CHECK_DELAY);
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
}

function shuffleBoard() {
    if (mistakes >= 4 || remainingWords.length === 0) return;

    const tiles = document.querySelectorAll('.word-tile');
    tiles.forEach(tile => tile.classList.add('shuffling'));
}

function handleResize() {
    document.body.style.overflowX = 'hidden';
    document.body.style.width = '100%';
}

window.addEventListener('orientationchange', () => {
    setTimeout(handleResize, 300);
});

window.addEventListener('resize', handleResize);

function nextPuzzle() {
    currentPuzzleIndex = (currentPuzzleIndex + 1) % puzzles.length;
    initGame();
}

// ------------------ STARTUP ------------------

document.getElementById('submit-btn').addEventListener('click', submitGuess);
document.getElementById('deselect-btn').addEventListener('click', deselectAll);
document.getElementById('shuffle-btn').addEventListener('click', shuffleBoard);

async function startGame() {
    console.log('startGame called');
    await loadPuzzles();
    console.log('puzzles after load:', puzzles);

    if (puzzles.length === 0) {
        showMessage('No puzzles loaded.', 'incorrect');
        return;
    }

    currentPuzzleIndex = 0;
    initGame();
    console.log('initGame finished');

    if (isTodayPuzzleLocked()) {
        const state = loadFinalState();
        console.log('loaded final state:', state);

        if (state && state.type === 'solved') {
            solvedCategories = state.solvedCategories;
            remainingWords = [];
            mistakes = state.mistakes;
            updateDisplay();
            showMessage('🏆 You solved the puzzle!<br>Come back tomorrow<br>for a new puzzle', 'correct', 4000);
        } else if (state && state.type === 'failed') {
            solvedCategories = state.solvedCategories;
            remainingWords = [];
            mistakes = state.mistakes;
            updateDisplay();
            showMessage('Better luck tomorrow! Here’s the solution.', 'incorrect');
        }

        document.getElementById('submit-btn').disabled = true;
        document.getElementById('deselect-btn').disabled = true;
        document.getElementById('shuffle-btn').disabled = true;

        const tiles = document.querySelectorAll('.word-tile');
        tiles.forEach(tile => {
            tile.classList.add('completed');
            tile.style.pointerEvents = 'none';
        });
    }
}

startGame();
