import { loadSharedData, syncStatsToFirebase, syncLearningStatusToFirebase } from './main.js';
import { shuffle } from './utils.js';

document.addEventListener('DOMContentLoaded', async () => {
    // DOM Elements
    const modeRadios = document.querySelectorAll('input[name="game-mode"]');
    const resetButton = document.getElementById('reset-button');
    const loadingOverlay = document.getElementById('loading-overlay');
    const pairMatchContainer = document.getElementById('pair-match-container');
    const multipleChoiceContainer = document.getElementById('multiple-choice-container');
    const cardBoard = document.getElementById('card-board');
    const questionArea = document.getElementById('question-area');
    const answersArea = document.getElementById('answers-area');
    const hideCorrectCheckbox = document.getElementById('hide-correct-pairs-checkbox');
    const selectionBubble = document.getElementById('selection-bubble');
    const weakPointsCheckbox = document.getElementById('practice-weak-points-checkbox');
    const mcProgressBar = document.getElementById('mc-progress-bar');
    const levelFilter = document.getElementById('level-filter');
    const pairMatchProgress = document.getElementById('pair-match-progress');
    const completionPopup = document.getElementById('completion-message-popup');

    // State Variables
    let activeGrammarData = [];
    let allGrammarData = []; // To store the original full list
    let currentMode = 'pair-match';
    let selectedStructure = null;
    let selectedMeaning = null;
    let totalPairs = 0;
    let correctPairs = 0;
    let grammarStats = {};
    let learningStatus = {};

    // Game State
    let questionQueue = [];
    let currentQuestion = null;
    let mcTotalQuestions = 0;

    // Initialize Game
    async function loadDataAndSetup() {
        try {
            const data = await loadSharedData();
            allGrammarData = data.appGrammarData;
            activeGrammarData = [...allGrammarData]; // Start with all data
            grammarStats = data.grammarStats;
            learningStatus = data.learningStatus;
            populateLevelFilter();
            setupGame();
            if (loadingOverlay) loadingOverlay.classList.add('hidden');
        } catch (error) {
            console.error('Error loading data:', error);
            if (loadingOverlay) loadingOverlay.classList.add('hidden');
        }
    }

    function applyGameModeFilter() {
        const gameMode = document.querySelector('input[name="game-mode"]:checked')?.value || 'pair-match';
        const practiceWeakPoints = weakPointsCheckbox?.checked && gameMode === 'pair-match';
        const selectedLevel = levelFilter?.value || 'all';
        let filteredData = [...allGrammarData];

        // 1. Filter by Level
        if (selectedLevel !== 'all') {
            filteredData = filteredData.filter(g => g.level === selectedLevel);
        }

        // 2. Filter by Weak Points if checkbox is checked for pair-match mode
        if (practiceWeakPoints) {
            filteredData = filteredData.filter(grammar => {
                const stats = grammarStats[grammar.id];
                if (!stats || stats.total <= 5) {
                    return true; // Keep if not practiced enough
                }
                const correctRate = stats.correct / stats.total;
                if (correctRate <= 0.8) { // Lọc các điểm yếu có độ chính xác <= 80%
                    return true; // Keep if accuracy is not high
                }
                return false; // Hide if accuracy > 90% and total > 5
            });
        }
        
        activeGrammarData = filteredData;
    }

    function populateLevelFilter() {
        if (!levelFilter) return;
    
        const levels = new Set(allGrammarData.map(g => g.level).filter(Boolean));
        const sortedLevels = Array.from(levels).sort();
    
        levelFilter.innerHTML = ""; // Clear existing options
    
        const allOption = document.createElement("option");
        allOption.value = "all";
        allOption.textContent = "Tất cả Level";
        levelFilter.appendChild(allOption);
    
        sortedLevels.forEach(level => {
            const option = document.createElement("option");
            option.value = level;
            option.textContent = level;
            levelFilter.appendChild(option);
        });
    }

    // Pair Matching Game
    function setupPairMatchingGame() {
        cardBoard.innerHTML = '';
        correctPairs = 0;
        selectedStructure = null;
        selectedMeaning = null;
        hideSelectionBubble();

        if (activeGrammarData.length === 0) {
            cardBoard.innerHTML = `<p class="completion-message">Không có ngữ pháp nào phù hợp với chế độ này, hoặc bạn đã học hết rồi!</p>`;
            updateProgressCounter();
            return;
        }
        const gameData = shuffle([...activeGrammarData]);
        totalPairs = gameData.length;
        
        const structures = gameData.map(item => ({ id: item.id, text: item.structure, type: 'structure' }));
        const meanings = gameData.map(item => ({ id: item.id, text: item.meaning, type: 'meaning' }));
        const allCardsData = shuffle([...structures, ...meanings]);
        
        allCardsData.forEach(itemData => createPairCard(itemData, cardBoard));
        updateProgressCounter();
    }

    function createPairCard(item, board) {
        const card = document.createElement('div');
        card.classList.add('card');
        card.dataset.id = item.id;
        card.dataset.type = item.type;
        card.textContent = item.text;
        card.addEventListener('click', () => onPairCardClick(card));
        board.appendChild(card);
    }

    function onPairCardClick(card) {
        if (card.classList.contains('correct')) return;

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

        if (selectedStructure && selectedMeaning) {
            checkPairMatch();
        }
    }

    function checkPairMatch() {
        const structCard = selectedStructure;
        const meanCard = selectedMeaning;

        const structGrammar = activeGrammarData.find(g => g.id == structCard.dataset.id);
        const meanGrammar = activeGrammarData.find(g => g.id == meanCard.dataset.id);
        const isCorrect = structGrammar && meanGrammar && structGrammar.meaning.trim() === meanGrammar.meaning.trim();

        hideSelectionBubble();

        if (isCorrect) {
            structCard.classList.add('correct');
            meanCard.classList.add('correct');
            updateStats(structCard.dataset.id, true);
            correctPairs++;
            updateProgressCounter();

            if (hideCorrectCheckbox.checked) {
                structCard.classList.add('burst');
                meanCard.classList.add('burst');
                setTimeout(() => {
                    structCard.classList.add('hidden');
                    meanCard.classList.add('hidden');
                }, 400);
            }

            if (correctPairs === totalPairs) {
                showCompletionPopup();
            }
        } else {
            structCard.classList.add('incorrect');
            meanCard.classList.add('incorrect');
            updateStats(structCard.dataset.id, false);

            setTimeout(() => {
                structCard.classList.remove('incorrect');
                meanCard.classList.remove('incorrect');
            }, 500);
        }

        selectedStructure = null;
        selectedMeaning = null;
        structCard.classList.remove('selected');
        meanCard.classList.remove('selected');
    }

    // Multiple Choice Game
    function setupMultipleChoiceGame() {
        applyGameModeFilter(); // Apply filter before setting up
        if (activeGrammarData.length === 0) {
            questionArea.innerHTML = `<p class="completion-message">Không có ngữ pháp nào phù hợp với chế độ này, hoặc bạn đã học hết rồi!</p>`;
            answersArea.innerHTML = '';
            updateMCProgressBar();
            return;
        }
        questionQueue = shuffle([...activeGrammarData]);
        mcTotalQuestions = questionQueue.length;
        hideSelectionBubble();
        loadNextQuestion();
    }

    function loadNextQuestion() {
        questionArea.innerHTML = '';
        answersArea.innerHTML = '';
        updateMCProgressBar();

        if (questionQueue.length === 0) {
            questionArea.innerHTML = `<p class="completion-message">Congratulations! You have completed all the questions!</p>`;
            hideSelectionBubble();
            return;
        }

        currentQuestion = questionQueue.shift();

        const questionCard = document.createElement('div');
        questionCard.className = 'card question-card';
        questionCard.textContent = currentQuestion.structure;
        
        questionArea.innerHTML = '<h3>Choose the correct meaning:</h3>';
        questionArea.appendChild(questionCard);

        // Create answer options
        const wrongOptions = shuffle([...activeGrammarData])
            .filter(g => g.id !== currentQuestion.id)
            .slice(0, 3);

        const answerOptions = shuffle([...wrongOptions, currentQuestion]);

        answerOptions.forEach(option => {
            const answerCard = document.createElement('div');
            answerCard.className = 'card answer-card';
            answerCard.textContent = option.meaning;
            answerCard.dataset.id = option.id;
            answerCard.addEventListener('click', () => checkAnswer(answerCard));
            answersArea.appendChild(answerCard);
        });

        // Skip button
        const skipButton = document.createElement('button');
        skipButton.id = 'mc-skip-button';
        skipButton.textContent = 'Skip';
        skipButton.className = 'btn btn-secondary';
        skipButton.style.marginTop = '20px';
        skipButton.style.marginLeft = '10px';
        skipButton.onclick = () => {
            questionQueue.push(currentQuestion);
            loadNextQuestion();
        };
        questionArea.appendChild(skipButton);
    }

    function checkAnswer(selectedCard) {
        const isCorrect = selectedCard.dataset.id == currentQuestion.id;
        updateStats(currentQuestion.id, isCorrect);

        document.querySelectorAll('.answer-card').forEach(card => {
            card.style.pointerEvents = 'none';
            if (card.dataset.id == currentQuestion.id) {
                card.classList.add('correct');
            }
        });

        if (!isCorrect) {
            selectedCard.classList.add('incorrect');
        }

        const skipButton = document.getElementById('mc-skip-button');
        if (skipButton) skipButton.disabled = true;

        setTimeout(loadNextQuestion, 1500);
    }

    // Stats and Progress
    function updateStats(grammarId, isCorrect) {
        if (!grammarStats[grammarId]) {
            grammarStats[grammarId] = { correct: 0, total: 0 };
        }

        const stats = grammarStats[grammarId];
        stats.total += 1;
        if (isCorrect) stats.correct += 1;

        // Check if needs review
        const incorrectCount = stats.total - stats.correct;
        const needsReview = learningStatus[grammarId] === 'learned' && incorrectCount > 3;

        const syncPromises = [];

        if (needsReview) {
            learningStatus[grammarId] = 'review';
            syncPromises.push(syncLearningStatusToFirebase(learningStatus));
        }

        syncPromises.push(syncStatsToFirebase(grammarStats));

        Promise.all(syncPromises)
            .then(() => {
                if (needsReview) {
                    const grammarItem = activeGrammarData.find(g => g.id == grammarId);
                    if (grammarItem) {
                        console.log(`"${grammarItem.structure}" moved to Review due to multiple errors.`);
                    }
                }
            })
            .catch(error => {
                console.error("Failed to sync progress:", error);
            });
    }

    function updateMCProgressBar() {
        if (mcTotalQuestions === 0) return;
        const completedCount = mcTotalQuestions - questionQueue.length;
        const percentage = Math.round((completedCount / mcTotalQuestions) * 100);
        mcProgressBar.style.width = `${percentage}%`;
        mcProgressBar.textContent = `${completedCount} / ${mcTotalQuestions}`;
    }

    function updateProgressCounter() {
        if (pairMatchProgress) {
            pairMatchProgress.textContent = `Completed: ${correctPairs} / ${totalPairs}`;
        }
    }

    // UI Helpers
    function showSelectionBubble(text) {
        if (selectionBubble) {
            selectionBubble.textContent = text;
            selectionBubble.style.display = 'block';
        }
    }

    function hideSelectionBubble() {
        if (selectionBubble) {
            selectionBubble.style.display = 'none';
        }
    }

    function showCompletionPopup() {
        if (completionPopup) {
            completionPopup.textContent = 'Congratulations! You have finished!';
            completionPopup.style.display = 'block';
            completionPopup.classList.remove('fade-out');

            setTimeout(() => {
                completionPopup.classList.add('fade-out');
                setTimeout(() => { 
                    completionPopup.style.display = 'none'; 
                }, 500);
            }, 3000);
        }
    }

    // Game Control
    function setupGame() {
        if (isGameInProgress() && !confirm('Restart? Current progress will be lost.')) {
            document.querySelector(`input[name="game-mode"][value="${currentMode}"]`).checked = true;
            return;
        }

        applyGameModeFilter();

        if (currentMode === 'pair-match' || currentMode === 'practice-weak-points') {
            pairMatchContainer.style.display = 'block';
            multipleChoiceContainer.style.display = 'none';
            setupPairMatchingGame();
        } else {
            pairMatchContainer.style.display = 'none'; // Should be multiple-choice
            multipleChoiceContainer.style.display = 'block';
            setupMultipleChoiceGame();
        }
    }

    function isGameInProgress() {
        const gameMode = document.querySelector('input[name="game-mode"]:checked')?.value;
        const isPairMatchBased = gameMode === 'pair-match';
        return isPairMatchBased && correctPairs > 0 && correctPairs < totalPairs;
    }

    // Event Listeners
    modeRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            currentMode = e.target.value;
            setupGame();
        });
    });

    if (levelFilter) {
        levelFilter.addEventListener('change', setupGame);
    }

    if (weakPointsCheckbox) {
        weakPointsCheckbox.addEventListener('change', setupGame);
    }

    resetButton.addEventListener('click', setupGame);

    hideCorrectCheckbox.addEventListener('change', (e) => {
        const shouldHide = e.target.checked;
        const correctCards = document.querySelectorAll('#card-board .card.correct');
        correctCards.forEach(card => {
            if (shouldHide) card.classList.add('hidden');
            else card.classList.remove('hidden');
        });
    });

    // Initialize
    loadDataAndSetup();
});