import { loadSharedData } from './main.js';

document.addEventListener('DOMContentLoaded', async () => {
    // Get DOM elements
    const modeRadios = document.querySelectorAll('input[name="game-mode"]');
    const resetButton = document.getElementById('reset-button');

    // Containers for the 2 modes
    const pairMatchContainer = document.getElementById('pair-match-container');
    const multipleChoiceContainer = document.getElementById('multiple-choice-container');
    const cardBoard = document.getElementById('card-board'); // For pair matching mode
    const questionArea = document.getElementById('question-area'); // For multiple choice mode
    const answersArea = document.getElementById('answers-area'); // For multiple choice mode
    const hideCorrectCheckbox = document.getElementById('hide-correct-pairs-checkbox');
    const selectionBubble = document.getElementById('selection-bubble');
    const mcProgressBar = document.getElementById('mc-progress-bar');
    const pairMatchProgress = document.getElementById('pair-match-progress');
    const completionPopup = document.getElementById('completion-message-popup');

    // General state variables
    let activeGrammarData = [];
    let currentMode = 'pair-match';

    // Variables for pair matching mode
    let selectedStructure = null;
    let selectedMeaning = null;
    let totalPairs = 0;
    let correctPairs = 0;

    const PAIR_MATCH_STATE_KEY = "pairMatchGameState";
    // Variable for statistics
    const STATS_KEY = "grammarStats";
    let grammarStats = {};

    // Variable for learning status
    const LEARNING_STATUS_KEY = "learningStatus";
    let learningStatus = {};

    // Load data from localStorage or use sample data
    async function loadDataAndSetup() {
        const data = await loadSharedData();
        activeGrammarData = data.appGrammarData;
        grammarStats = data.grammarStats;
        learningStatus = data.learningStatus;
        setupGame();
    }

    // Function to shuffle an array
    function shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    // =================================================
    // MODE 1: PAIR MATCHING
    // =================================================

    function setupPairMatchingGame() {
        // Check if there is a saved game
        const savedStateJSON = localStorage.getItem(PAIR_MATCH_STATE_KEY);
        if (savedStateJSON) {
            try {
                if (confirm('An unfinished pair matching session was found. Do you want to continue?')) {
                    loadPairMatchingFromState(JSON.parse(savedStateJSON));
                    return; // Exit after loading state
                }
            } catch (e) {
                console.error("Error reading saved game state:", e);
            }
            // If the user doesn't want to continue or there's an error, clear the saved state
            localStorage.removeItem(PAIR_MATCH_STATE_KEY);
        }
        cardBoard.innerHTML = '';
        correctPairs = 0;
        selectedStructure = null;
        selectedMeaning = null;
        hideSelectionBubble();

        const gameData = shuffle([...activeGrammarData]);
        totalPairs = gameData.length;
        const structures = gameData.map(item => ({ id: item.id, text: item.structure, type: 'structure' }));
        const meanings = gameData.map(item => ({ id: item.id, text: item.meaning, type: 'meaning' }));

        const allCardsData = shuffle([...structures, ...meanings]);
        allCardsData.forEach(itemData => createPairCard(itemData, cardBoard));

        // Update the progress counter
        updateProgressCounter();
    }

    function loadPairMatchingFromState(state) {
        cardBoard.innerHTML = '';
        hideSelectionBubble();

        totalPairs = state.totalPairs;
        correctPairs = state.correctPairs;

        state.cards.forEach(cardData => {
            const card = document.createElement('div');
            card.classList.add('card');
            card.dataset.id = cardData.id;
            card.dataset.type = cardData.type;
            card.textContent = cardData.text;
            if (cardData.isCorrect) {
                card.classList.add('correct');
                if (hideCorrectCheckbox.checked) {
                    card.classList.add('hidden');
                }
            }
            card.addEventListener('click', () => onPairCardClick(card));
            cardBoard.appendChild(card);
        });

        updateProgressCounter();
    }

    function createPairCard(item, board) {
        // Create a simple div card
        const card = document.createElement('div');
        card.classList.add('card');
        card.dataset.id = item.id; // id of the grammar structure
        card.dataset.type = item.type; // 'structure' or 'meaning'
        card.textContent = item.text;
        card.addEventListener('click', () => onPairCardClick(card));
        board.appendChild(card);
    }

    function onPairCardClick(card) {
        if (card.classList.contains('correct')) return;

        // Show a bubble with the content of the selected card
        showSelectionBubble(card.textContent);

        if (card.dataset.type === 'structure') {
            if (selectedStructure) selectedStructure.classList.remove('selected');
            selectedStructure = card;
            card.classList.add('selected');
        } else {
            if (selectedMeaning) selectedMeaning.classList.remove('selected');
            selectedMeaning = card;
            card.classList.add('selected');
        }

        // Check if a pair has been selected
        if (selectedStructure && selectedMeaning) {
            checkPairMatch();
        }
    }

    function checkPairMatch() {
        const structCard = selectedStructure;
        const meanCard = selectedMeaning;

        const isCorrect = structCard.dataset.id === meanCard.dataset.id;
        updateStats(structCard.dataset.id, isCorrect);

        // Deselect to prepare for the next click
        selectedStructure = null;
        selectedMeaning = null;
        // Remove 'selected' class from both cards
        structCard.classList.remove('selected');
        meanCard.classList.remove('selected');

        // Hide the bubble after checking
        hideSelectionBubble();

        if (structCard.dataset.id === meanCard.dataset.id) {
            // Correct match
            structCard.classList.add('correct');
            meanCard.classList.add('correct');
            correctPairs++;
            updateProgressCounter();

            if (hideCorrectCheckbox.checked) {
                // Add a bursting effect
                structCard.classList.add('burst');
                meanCard.classList.add('burst');
                setTimeout(() => {
                    structCard.classList.add('hidden'); meanCard.classList.add('hidden');
                }, 400); // Time should match the animation duration
            }

            if (correctPairs === totalPairs) {
                showCompletionPopup();
                localStorage.removeItem(PAIR_MATCH_STATE_KEY); // Clear state upon completion
            }
        } else {
            // Incorrect match
            structCard.classList.add('incorrect'); // Turn red
            meanCard.classList.add('incorrect');
            savePairMatchingState(); // Save state after a correct match

            // If this item was "learned", change it to "review"
            if (learningStatus[structCard.dataset.id] === 'learned') {
                learningStatus[structCard.dataset.id] = 'review';
                localStorage.setItem(LEARNING_STATUS_KEY, JSON.stringify(learningStatus));
                if (window.syncLearningStatusToFirebase) window.syncLearningStatusToFirebase(); // Đồng bộ lên Firebase
            }
            setTimeout(() => {
                // Revert to the initial state
                structCard.classList.remove('incorrect');
                meanCard.classList.remove('incorrect');
            }, 500);
        }
    }
    function savePairMatchingState() {
        if (currentMode !== 'pair-match' || correctPairs === totalPairs) {
            localStorage.removeItem(PAIR_MATCH_STATE_KEY);
            return;
        }
        const cardsState = Array.from(cardBoard.children).map(card => ({
            id: card.dataset.id,
            type: card.dataset.type,
            text: card.textContent,
            isCorrect: card.classList.contains('correct')
        }));

        const gameState = { totalPairs, correctPairs, cards: cardsState };
        localStorage.setItem(PAIR_MATCH_STATE_KEY, JSON.stringify(gameState));
    }

    // =================================================
    // MODE 2: MULTIPLE CHOICE
    // =================================================

    let questionQueue = [];
    let currentQuestion = null;
    let mcTotalQuestions = 0;

    function setupMultipleChoiceGame() {
        questionQueue = shuffle([...activeGrammarData]);
        mcTotalQuestions = questionQueue.length;
        hideSelectionBubble(); // Hide bubble when switching modes
        loadNextQuestion();
    }

    function loadNextQuestion() {
        questionArea.innerHTML = '';
        answersArea.innerHTML = '';
        updateMCProgressBar();

        if (questionQueue.length === 0) {
            questionArea.innerHTML = `<p class="completion-message">Congratulations! You have completed all the questions!</p>`;
            hideSelectionBubble(); // Hide bubble at the end
            return;
        }

        currentQuestion = questionQueue.shift();

        // Create the question card
        showSelectionBubble(currentQuestion.structure); // Show the question in the bubble

        const questionCard = document.createElement('div');
        questionCard.className = 'card question-card';
        questionCard.textContent = currentQuestion.structure;
        questionArea.innerHTML = '<h3>Choose the correct meaning:</h3>';
        questionArea.appendChild(questionCard);

        // Create the answer cards
        const answerOptions = shuffle([...activeGrammarData]);
        answerOptions.forEach(option => {
            const answerCard = document.createElement('div');
            answerCard.className = 'card answer-card';
            answerCard.textContent = option.meaning;
            answerCard.dataset.id = option.id;
            answerCard.addEventListener('click', () => checkAnswer(answerCard));
            answersArea.appendChild(answerCard);
        });
    }

    function checkAnswer(selectedCard) {
        const isCorrect = selectedCard.dataset.id == currentQuestion.id;
        updateStats(currentQuestion.id, isCorrect);

        // Disable other cards
        document.querySelectorAll('.answer-card').forEach(card => {
            card.style.pointerEvents = 'none';
            if (card.dataset.id == currentQuestion.id) {
                card.classList.add('correct'); // Always highlight the correct answer in green
            }
        });

        if (!isCorrect) {
            selectedCard.classList.add('incorrect');
        }

        setTimeout(loadNextQuestion, 1500); // Wait 1.5s then load the next question
    }

    function updateStats(grammarId, isCorrect) {
        if (!grammarStats[grammarId]) {
            grammarStats[grammarId] = { correct: 0, total: 0 };
        }

        const stats = grammarStats[grammarId];
        stats.total += 1;
        if (isCorrect) {
            stats.correct += 1;
        }
        localStorage.setItem(STATS_KEY, JSON.stringify(grammarStats)); // Lưu vào localStorage

        if (window.syncStatsToFirebase) window.syncStatsToFirebase(); // Đồng bộ lên Firebase
    }

    function updateMCProgressBar() {
        if (mcTotalQuestions === 0) return;
        const completedCount = mcTotalQuestions - questionQueue.length;
        const percentage = Math.round((completedCount / mcTotalQuestions) * 100);
        mcProgressBar.style.width = `${percentage}%`;
        mcProgressBar.textContent = `${completedCount} / ${mcTotalQuestions}`;
    }

    function showSelectionBubble(text) {
        selectionBubble.textContent = text;
        selectionBubble.style.display = 'block';
    }

    function hideSelectionBubble() {
        selectionBubble.style.display = 'none';
    }

    function updateProgressCounter() {
        pairMatchProgress.textContent = `Completed: ${correctPairs} / ${totalPairs}`;
    }

    function showCompletionPopup() {
        completionPopup.textContent = 'Congratulations! You have finished!';
        completionPopup.style.display = 'block';
        completionPopup.classList.remove('fade-out');

        // Automatically hide after 3 seconds
        setTimeout(() => {
            completionPopup.classList.add('fade-out');
            // Wait for the animation to finish before setting display to none
            setTimeout(() => { completionPopup.style.display = 'none'; }, 500);
        }, 3000);
    }

    // =================================================
    // GENERAL INITIALIZATION AND CONTROL
    // =================================================

    function setupGame() {
        if (isGameInProgress() && !confirm('Are you sure you want to restart? Current progress will be lost.')) {
            // If the user cancels, restore the radio button selection to the current mode
            document.querySelector(`input[name="game-mode"][value="${currentMode}"]`).checked = true;
            return;
        }
        // Clear the saved pair-matching game state when restarting or switching modes
        localStorage.removeItem(PAIR_MATCH_STATE_KEY);
        if (currentMode === 'pair-match') {
            pairMatchContainer.style.display = 'block';
            multipleChoiceContainer.style.display = 'none';
            setupPairMatchingGame();
        } else {
            pairMatchContainer.style.display = 'none';
            multipleChoiceContainer.style.display = 'block';
            setupMultipleChoiceGame();
        }
    }

    // Function to check if a game is in progress
    function isGameInProgress() {
        return currentMode === 'pair-match' && correctPairs > 0 && correctPairs < totalPairs;
    }

    modeRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            currentMode = e.target.value;
            setupGame();
        });
    });

    resetButton.addEventListener('click', setupGame);

    hideCorrectCheckbox.addEventListener('change', (e) => {
        const shouldHide = e.target.checked;
        const correctCards = document.querySelectorAll('#card-board .card.correct');

        correctCards.forEach(card => {
            if (shouldHide) {
                card.classList.add('hidden');
            } else {
                card.classList.remove('hidden');
            }
        });
    });

    // Load data and start the game for the first time
    loadDataAndSetup();

    // The game state is now saved, so no warning is needed.
    // Instead, we will save the state when the user leaves.
    window.addEventListener('beforeunload', (event) => {
        savePairMatchingState();
    });

    // --- Logic for the scroll-to-top button ---
    const scrollToTopBtn = document.getElementById("scroll-to-top-btn");

    // Show the button when scrolling down 200px
    window.onscroll = function() {
        if (document.body.scrollTop > 200 || document.documentElement.scrollTop > 200) {
            scrollToTopBtn.style.display = "block";
        } else {
            scrollToTopBtn.style.display = "none";
        }
    };

    // Scroll to the top when the button is clicked
    scrollToTopBtn.addEventListener("click", function() {
        window.scrollTo({top: 0, behavior: 'smooth'});
    });
});