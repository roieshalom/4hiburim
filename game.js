const puzzles = [
    {
        id: "1",
        categories: [
            {
                name: "Kitchen Utensils",
                words: ["FORK", "SPOON", "KNIFE", "WHISK"],
                difficulty: "yellow"
            },
            {
                name: "Board Games",
                words: ["RISK", "CLUE", "LIFE", "MONOPOLY"],
                difficulty: "green"
            },
            {
                name: "Things You Can DRAW",
                words: ["BATH", "GUN", "CARD", "CURTAIN"],
                difficulty: "blue"
            },
            {
                name: "Words Before LINE",
                words: ["SKY", "DEAD", "HEAD", "PUNCH"],
                difficulty: "purple"
            }
        ]
    },
    {
        id: "2",
        categories: [
            {
                name: "Music Genres",
                words: ["JAZZ", "ROCK", "BLUES", "FUNK"],
                difficulty: "yellow"
            },
            {
                name: "Body Parts",
                words: ["HEART", "LUNG", "LIVER", "BRAIN"],
                difficulty: "green"
            },
            {
                name: "___ CARD (words before)",
                words: ["CREDIT", "BUSINESS", "WILD", "REPORT"],
                difficulty: "blue"
            },
            {
                name: "Homophones of Letters",
                words: ["BEE", "TEE", "JAY", "PEA"],
                difficulty: "purple"
            }
        ]
    },
    {
        id: "3",
        categories: [
            {
                name: "European Capitals",
                words: ["PARIS", "ROME", "BERLIN", "MADRID"],
                difficulty: "yellow"
            },
            {
                name: "Things That Are RED",
                words: ["APPLE", "ROSE", "BRICK", "CHERRY"],
                difficulty: "green"
            },
            {
                name: "Brands of Cars",
                words: ["FORD", "HONDA", "TESLA", "MAZDA"],
                difficulty: "blue"
            },
            {
                name: "___WOOD (words before)",
                words: ["HOLLY", "DRIFT", "FIRE", "HARD"],
                difficulty: "purple"
            }
        ]
    }
];

let currentPuzzleIndex = 0;
let currentPuzzle = null;
let selectedWords = [];
let mistakes = 0;
let solvedCategories = [];
let remainingWords = [];

// Initialize game
function initGame() {
    currentPuzzle = puzzles[currentPuzzleIndex];
    mistakes = 0;
    solvedCategories = [];
    selectedWords = [];

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

// Update display
function updateDisplay() {
    document.getElementById('mistakes').textContent = mistakes;

    const messageEl = document.getElementById('message');
    messageEl.textContent = '';
    messageEl.className = 'message';

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

    if (remainingWords.length === 0) {
        showMessage('🎉 Congratulations! You solved the puzzle!', 'correct');
    }

    if (mistakes >= 4 && remainingWords.length > 0) {
        showMessage('Game Over! Try a new puzzle.', 'incorrect');
    }
}

// Toggle word selection
function toggleWord(word, tileElement) {
    if (mistakes >= 4 || remainingWords.length === 0) return;

    const index = selectedWords.indexOf(word);
    if (index > -1) {
        selectedWords.splice(index, 1);
        tileElement.classList.remove('selected');
    } else {
        if (selectedWords.length < 4) {
            selectedWords.push(word);
            tileElement.classList.add('selected');
        }
    }

    document.getElementById('submit-btn').disabled = selectedWords.length !== 4;
}

// Highlight selected group before checking
function highlightSelectedGroup() {
    const tiles = document.querySelectorAll('.word-tile');
    tiles.forEach(tile => {
        if (selectedWords.includes(tile.textContent)) {
            tile.classList.add('group-selected');
        }
    });
}

// Submit guess with small animation
const PRE_CHECK_DELAY = 150;   // before checking the guess
const CORRECT_DELAY   = 800;   // time to show "Correct" + tiles highlighted
const WRONG_DELAY     = 450;   // time to show "Not quite" before reset

function submitGuess() {
    if (selectedWords.length !== 4) return;
    if (mistakes >= 4) return;

    highlightSelectedGroup();
    document.getElementById('submit-btn').disabled = true;

    setTimeout(() => {
        const category = currentPuzzle.categories.find(cat => {
            const catWords = cat.words.map(w => w.toUpperCase());
            const selected = selectedWords.map(w => w.toUpperCase());
            return (
                selected.every(w => catWords.includes(w)) &&
                selected.length === catWords.length
            );
        });

        if (category) {
            showMessage(`Correct! ${category.name}`, 'correct');
            solvedCategories.push({
                name: category.name,
                words: category.words,
                difficulty: category.difficulty
            });

            remainingWords = remainingWords.filter(
                item => !selectedWords.includes(item.word)
            );

            selectedWords = [];
            setTimeout(() => updateDisplay(), CORRECT_DELAY);
} else {
    mistakes++;
    showMessage('Not quite! Try again.', 'incorrect');

    const tiles = document.querySelectorAll('.word-tile');
    tiles.forEach(tile => {
        if (selectedWords.includes(tile.textContent)) {
            tile.classList.add('wrong-guess');  // horizontal shake
        }
    });

    const JIGGLE_DURATION = 300;   // length of the shake animation (ms)
    const EXTRA_READ_TIME = 500;   // extra time for user to read

    setTimeout(() => {
        selectedWords = [];
        updateDisplay();           // clears selection and removes class
    }, JIGGLE_DURATION + EXTRA_READ_TIME);
}

    }, PRE_CHECK_DELAY);
}


// Show message
function showMessage(text, type) {
    const messageEl = document.getElementById('message');
    messageEl.textContent = text;
    messageEl.className = `message ${type}`;
}

// Deselect all
function deselectAll() {
    selectedWords = [];
    updateDisplay();
}

// Animated shuffle of current board
function shuffleBoard() {
    if (mistakes >= 4 || remainingWords.length === 0) return;

    const tiles = document.querySelectorAll('.word-tile');
    tiles.forEach(tile => tile.classList.add('shuffling'));

    setTimeout(() => {
        tiles.forEach(tile => tile.classList.remove('shuffling'));
        shuffleArray(remainingWords);
        selectedWords = [];
        updateDisplay();
    }, 250);
}

// Next puzzle (cycles through puzzles)
function nextPuzzle() {
    currentPuzzleIndex = (currentPuzzleIndex + 1) % puzzles.length;
    initGame();
}

// Event listeners
document.getElementById('submit-btn').addEventListener('click', submitGuess);
document.getElementById('deselect-btn').addEventListener('click', deselectAll);
document.getElementById('shuffle-btn').addEventListener('click', shuffleBoard);

initGame();


// Start
initGame();


// Start game
initGame();
