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


let currentPuzzle = null;
let selectedWords = [];
let mistakes = 0;
let solvedCategories = [];
let remainingWords = [];

// Initialize game
function initGame() {
    currentPuzzle = puzzles[0]; // Start with first puzzle
    mistakes = 0;
    solvedCategories = [];
    selectedWords = [];
    
    // Flatten all words and shuffle
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

// Shuffle array
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

// Update display
function updateDisplay() {
    // Update mistakes
    document.getElementById('mistakes').textContent = mistakes;
    
    // Clear message
    const messageEl = document.getElementById('message');
    messageEl.textContent = '';
    messageEl.className = 'message';
    
    // Display solved categories
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
    
    // Display remaining words
    const board = document.getElementById('game-board');
    board.innerHTML = '';
    remainingWords.forEach(item => {
        const tile = document.createElement('div');
        tile.className = 'word-tile';
        tile.textContent = item.word;
        tile.addEventListener('click', () => toggleWord(item.word, tile));
        board.appendChild(tile);
    });
    
    // Check win condition
    if (remainingWords.length === 0) {
        showMessage('🎉 Congratulations! You solved the puzzle!', 'correct');
    }
    
    // Check lose condition
    if (mistakes >= 4 && remainingWords.length > 0) {
        showMessage('Game Over! Try a new puzzle.', 'incorrect');
    }
}

// Toggle word selection
function toggleWord(word, tileElement) {
    if (mistakes >= 4) return;
    
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
    
    // Enable/disable submit button
    document.getElementById('submit-btn').disabled = selectedWords.length !== 4;
}

// Submit guess
function submitGuess() {
    if (selectedWords.length !== 4) return;
    
    // Check if selected words form a category
    const category = currentPuzzle.categories.find(cat => {
        const catWords = cat.words.map(w => w.toUpperCase());
        const selected = selectedWords.map(w => w.toUpperCase());
        return selected.every(w => catWords.includes(w)) && selected.length === catWords.length;
    });
    
    if (category) {
        // Correct!
        showMessage(`Correct! ${category.name}`, 'correct');
        solvedCategories.push({
            name: category.name,
            words: category.words,
            difficulty: category.difficulty
        });
        
        // Remove solved words
        remainingWords = remainingWords.filter(item => 
            !selectedWords.includes(item.word)
        );
        
        selectedWords = [];
        setTimeout(() => updateDisplay(), 1000);
    } else {
        // Incorrect
        mistakes++;
        showMessage('Not quite! Try again.', 'incorrect');
        
        // Deselect all
        selectedWords = [];
        setTimeout(() => {
            updateDisplay();
        }, 1000);
    }
    
    document.getElementById('submit-btn').disabled = true;
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

// Event listeners
document.getElementById('submit-btn').addEventListener('click', submitGuess);
document.getElementById('deselect-btn').addEventListener('click', deselectAll);
document.getElementById('new-puzzle-btn').addEventListener('click', initGame);

// Start game
initGame();
