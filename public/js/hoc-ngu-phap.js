document.addEventListener('DOMContentLoaded', () => {
    // Lấy các element DOM
    const modeRadios = document.querySelectorAll('input[name="game-mode"]');
    const resetButton = document.getElementById('reset-button');

    // Containers cho 2 chế độ
    const pairMatchContainer = document.getElementById('pair-match-container');
    const multipleChoiceContainer = document.getElementById('multiple-choice-container');
    const cardBoard = document.getElementById('card-board'); // Cho chế độ ghép cặp
    const questionArea = document.getElementById('question-area'); // Cho chế độ trắc nghiệm
    const answersArea = document.getElementById('answers-area'); // Cho chế độ trắc nghiệm
    const hideCorrectCheckbox = document.getElementById('hide-correct-pairs-checkbox');
    const selectionBubble = document.getElementById('selection-bubble');
    const mcProgressBar = document.getElementById('mc-progress-bar');
    const pairMatchProgress = document.getElementById('pair-match-progress');
    const completionPopup = document.getElementById('completion-message-popup');

    // Biến trạng thái chung
    let activeGrammarData = [];
    let currentMode = 'pair-match';

    // Biến cho chế độ ghép cặp
    let selectedStructure = null;
    let selectedMeaning = null;
    let totalPairs = 0;
    let correctPairs = 0;

    const PAIR_MATCH_STATE_KEY = "pairMatchGameState";
    // Biến cho thống kê
    const STATS_KEY = "grammarStats";
    let grammarStats = {};

    // Biến cho trạng thái học
    const LEARNING_STATUS_KEY = "learningStatus";
    let learningStatus = {};

    // Tải dữ liệu từ localStorage hoặc dùng dữ liệu mẫu
    async function loadData() {
        const STORAGE_KEY = "jlptGrammarData";
        try {
            const storedData = localStorage.getItem(STORAGE_KEY);
            if (storedData) {
                activeGrammarData = JSON.parse(storedData);
            } else {
                activeGrammarData = [...grammarData]; // Dùng dữ liệu mặc định
            }
        } catch (e) {
            activeGrammarData = [...grammarData]; // Dùng dữ liệu mặc định khi lỗi
        }

        // Tải dữ liệu thống kê
        try {
            const storedStats = localStorage.getItem(STATS_KEY);
            if (storedStats) grammarStats = JSON.parse(storedStats);
        } catch (e) {
            console.error("Lỗi khi tải thống kê:", e);
        }

        // Tải dữ liệu trạng thái học
        try {
            const storedLearningStatus = localStorage.getItem(LEARNING_STATUS_KEY);
            if (storedLearningStatus) learningStatus = JSON.parse(storedLearningStatus);
        } catch (e) {
            console.error("Lỗi khi tải trạng thái học:", e);
        }
    }

    // Hàm xáo trộn mảng
    function shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    // =================================================
    // CHẾ ĐỘ 1: GHÉP CẶP (PAIR MATCHING)
    // =================================================

    function setupPairMatchingGame() {
        // Kiểm tra xem có game nào được lưu không
        const savedStateJSON = localStorage.getItem(PAIR_MATCH_STATE_KEY);
        if (savedStateJSON) {
            try {
                if (confirm('Tìm thấy một phiên ghép cặp đang dang dở. Bạn có muốn tiếp tục không?')) {
                    loadPairMatchingFromState(JSON.parse(savedStateJSON));
                    return; // Thoát sau khi tải trạng thái
                }
            } catch (e) {
                console.error("Lỗi khi đọc trạng thái game đã lưu:", e);
            }
            // Nếu người dùng không muốn tiếp tục hoặc có lỗi, xóa trạng thái đã lưu
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

        // Cập nhật bộ đếm tiến độ
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
        // Tạo thẻ div đơn giản
        const card = document.createElement('div');
        card.classList.add('card');
        card.dataset.id = item.id; // id của cấu trúc ngữ pháp
        card.dataset.type = item.type; // 'structure' hoặc 'meaning'
        card.textContent = item.text;
        card.addEventListener('click', () => onPairCardClick(card));
        board.appendChild(card);
    }

    function onPairCardClick(card) {
        if (card.classList.contains('correct')) return;

        // Hiển thị bong bóng với nội dung thẻ được chọn
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

        // Kiểm tra nếu đã chọn đủ 1 cặp
        if (selectedStructure && selectedMeaning) {
            checkPairMatch();
        }
    }

    function checkPairMatch() {
        const structCard = selectedStructure;
        const meanCard = selectedMeaning;

        const isCorrect = structCard.dataset.id === meanCard.dataset.id;
        updateStats(structCard.dataset.id, isCorrect);

        // Bỏ chọn để chuẩn bị cho lần click tiếp theo
        selectedStructure = null;
        selectedMeaning = null;
        // Xóa class 'selected' khỏi cả hai thẻ
        structCard.classList.remove('selected');
        meanCard.classList.remove('selected');

        // Ẩn bong bóng sau khi kiểm tra
        hideSelectionBubble();

        if (structCard.dataset.id === meanCard.dataset.id) {
            // Ghép đúng
            structCard.classList.add('correct');
            meanCard.classList.add('correct');
            correctPairs++;
            updateProgressCounter();

            if (hideCorrectCheckbox.checked) {
                // Thêm hiệu ứng vỡ bong bóng
                structCard.classList.add('burst');
                meanCard.classList.add('burst');
                setTimeout(() => {
                    structCard.classList.add('hidden'); meanCard.classList.add('hidden');
                }, 400); // Thời gian khớp với animation
            }

            if (correctPairs === totalPairs) {
                showCompletionPopup();
                localStorage.removeItem(PAIR_MATCH_STATE_KEY); // Xóa trạng thái khi hoàn thành
            }
        } else {
            // Ghép sai
            structCard.classList.add('incorrect'); // Lật sang màu đỏ
            meanCard.classList.add('incorrect');
            savePairMatchingState(); // Lưu trạng thái sau khi ghép đúng

            // Nếu mục này đã "học" thì chuyển thành "ôn lại"
            if (learningStatus[structCard.dataset.id] === 'learned') {
                learningStatus[structCard.dataset.id] = 'review';
                localStorage.setItem(LEARNING_STATUS_KEY, JSON.stringify(learningStatus));
            }
            setTimeout(() => {
                // Lật trở lại trạng thái ban đầu
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
    // CHẾ ĐỘ 2: TRẮC NGHIỆM (MULTIPLE CHOICE)
    // =================================================

    let questionQueue = [];
    let currentQuestion = null;
    let mcTotalQuestions = 0;

    function setupMultipleChoiceGame() {
        questionQueue = shuffle([...activeGrammarData]);
        mcTotalQuestions = questionQueue.length;
        hideSelectionBubble(); // Ẩn bong bóng khi chuyển chế độ
        loadNextQuestion();
    }

    function loadNextQuestion() {
        questionArea.innerHTML = '';
        answersArea.innerHTML = '';
        updateMCProgressBar();

        if (questionQueue.length === 0) {
            questionArea.innerHTML = `<p class="completion-message">Chúc mừng! Bạn đã hoàn thành tất cả các câu hỏi!</p>`;
            hideSelectionBubble(); // Ẩn bong bóng khi kết thúc
            return;
        }

        currentQuestion = questionQueue.shift();

        // Tạo thẻ câu hỏi
        showSelectionBubble(currentQuestion.structure); // Hiển thị câu hỏi trong bong bóng

        const questionCard = document.createElement('div');
        questionCard.className = 'card question-card';
        questionCard.textContent = currentQuestion.structure;
        questionArea.innerHTML = '<h3>Chọn ý nghĩa đúng:</h3>';
        questionArea.appendChild(questionCard);

        // Tạo các thẻ đáp án
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

        // Vô hiệu hóa các thẻ khác
        document.querySelectorAll('.answer-card').forEach(card => {
            card.style.pointerEvents = 'none';
            if (card.dataset.id == currentQuestion.id) {
                card.classList.add('correct'); // Luôn tô xanh đáp án đúng
            }
        });

        if (!isCorrect) {
            selectedCard.classList.add('incorrect');
        }

        setTimeout(loadNextQuestion, 1500); // Chờ 1.5s rồi sang câu tiếp
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

        localStorage.setItem(STATS_KEY, JSON.stringify(grammarStats));
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
        pairMatchProgress.textContent = `Đã hoàn thành: ${correctPairs} / ${totalPairs}`;
    }

    function showCompletionPopup() {
        completionPopup.textContent = 'Chúc mừng! Bạn đã hoàn thành!';
        completionPopup.style.display = 'block';
        completionPopup.classList.remove('fade-out');

        // Tự động ẩn sau 3 giây
        setTimeout(() => {
            completionPopup.classList.add('fade-out');
            // Chờ animation kết thúc rồi mới display: none
            setTimeout(() => { completionPopup.style.display = 'none'; }, 500);
        }, 3000);
    }

    // =================================================
    // KHỞI TẠO VÀ ĐIỀU KHIỂN CHUNG
    // =================================================

    function setupGame() {
        if (isGameInProgress() && !confirm('Bạn có chắc muốn bắt đầu lại? Tiến trình hiện tại sẽ bị mất.')) {
            // Nếu người dùng hủy, khôi phục lại lựa chọn radio button về chế độ hiện tại
            document.querySelector(`input[name="game-mode"][value="${currentMode}"]`).checked = true;
            return;
        }
        // Xóa trạng thái game ghép cặp đã lưu khi bắt đầu lại hoặc chuyển chế độ
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

    // Hàm kiểm tra xem game có đang diễn ra không
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

    // Tải dữ liệu và bắt đầu game lần đầu
    loadData().then(() => {
        setupGame();
    });


    // Bây giờ game đã được lưu, không cần cảnh báo nữa.
    // Thay vào đó, ta sẽ lưu trạng thái khi người dùng rời đi.
    window.addEventListener('beforeunload', (event) => {
        savePairMatchingState();
    });

    // --- Logic cho nút cuộn lên đầu trang ---
    const scrollToTopBtn = document.getElementById("scroll-to-top-btn");

    // Hiển thị nút khi cuộn xuống 200px
    window.onscroll = function() {
        if (document.body.scrollTop > 200 || document.documentElement.scrollTop > 200) {
            scrollToTopBtn.style.display = "block";
        } else {
            scrollToTopBtn.style.display = "none";
        }
    };

    // Cuộn lên đầu khi nhấp vào nút
    scrollToTopBtn.addEventListener("click", function() {
        window.scrollTo({top: 0, behavior: 'smooth'});
    });
});