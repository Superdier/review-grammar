import { loadSharedData, syncStatsToFirebase, syncLearningStatusToFirebase } from './main.js';
import { shuffle } from './utils.js';

document.addEventListener('DOMContentLoaded', async () => {
    // Get DOM elements
    const modeRadios = document.querySelectorAll('input[name="game-mode"]');
    const resetButton = document.getElementById('reset-button');
    const loadingOverlay = document.getElementById('loading-overlay');

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
        // Hide loading overlay
        if (loadingOverlay) loadingOverlay.classList.add('hidden');
    }

    // =================================================
    // MODE 1: PAIR MATCHING
    // =================================================

    function setupPairMatchingGame() {
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

        // Tìm đối tượng ngữ pháp đầy đủ cho mỗi thẻ được chọn
        const structGrammar = activeGrammarData.find(g => g.id == structCard.dataset.id);
        const meanGrammar = activeGrammarData.find(g => g.id == meanCard.dataset.id);

        // Kiểm tra xem ý nghĩa của chúng có giống nhau không, thay vì chỉ so sánh ID
        const isCorrect = structGrammar && meanGrammar && structGrammar.meaning.trim() === meanGrammar.meaning.trim();

        updateStats(structCard.dataset.id, isCorrect);

        // Deselect to prepare for the next click
        selectedStructure = null;
        selectedMeaning = null;
        // Remove 'selected' class from both cards
        structCard.classList.remove('selected');
        meanCard.classList.remove('selected');

        // Hide the bubble after checking
        hideSelectionBubble();

        if (isCorrect) {
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
            }
        } else {
            // Incorrect match
            structCard.classList.add('incorrect'); // Turn red
            meanCard.classList.add('incorrect');

            // If this item was "learned", change it to "review"
            if (learningStatus[structCard.dataset.id] === 'learned') {
                learningStatus[structCard.dataset.id] = 'review';
                syncLearningStatusToFirebase(learningStatus);
            }
            setTimeout(() => {
                // Revert to the initial state
                structCard.classList.remove('incorrect');
                meanCard.classList.remove('incorrect');
            }, 500);
        }
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
        // Lấy 3 đáp án sai ngẫu nhiên
        const wrongOptions = shuffle([...activeGrammarData])
            .filter(g => g.id !== currentQuestion.id)
            .slice(0, 3);

        // Tạo mảng lựa chọn gồm 1 đáp án đúng và 3 đáp án sai, sau đó xáo trộn
        const answerOptions = shuffle([...wrongOptions, currentQuestion]);

        answerOptions.forEach(option => {
            const answerCard = document.createElement('div');
            answerCard.className = 'card answer-card';
            answerCard.textContent = option.meaning;
            answerCard.dataset.id = option.id;
            answerCard.addEventListener('click', () => checkAnswer(answerCard));
            answersArea.appendChild(answerCard);
        });

        // Thêm nút Skip
        const skipButton = document.createElement('button');
        skipButton.id = 'mc-skip-button';
        skipButton.textContent = 'Skip';
        skipButton.className = 'btn btn-secondary'; // Sử dụng class cho đồng bộ
        skipButton.style.marginTop = '20px';
        skipButton.onclick = () => {
            // Đẩy câu hỏi hiện tại vào cuối hàng đợi để làm lại sau
            questionQueue.push(currentQuestion);
            loadNextQuestion();
        };
        questionArea.appendChild(skipButton);
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

        // Vô hiệu hóa nút Skip sau khi đã trả lời
        const skipButton = document.getElementById('mc-skip-button');
        if (skipButton) {
            skipButton.disabled = true;
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
        // Sync the entire stats object to Firebase
        syncStatsToFirebase(grammarStats);
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
});