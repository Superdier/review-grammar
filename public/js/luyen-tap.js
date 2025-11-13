document.addEventListener('DOMContentLoaded', () => {
    const viSentenceEl = document.getElementById('vietnamese-sentence');
    const userAnswerZone = document.getElementById('user-answer-zone');
    const wordBankZone = document.getElementById('word-bank-zone');
    const checkButton = document.getElementById('check-button');
    const nextButton = document.getElementById('next-button');
    const resultMessageEl = document.getElementById('result-message');

    let activeGrammarData = [];
    let currentExample = null;

    // Load data from localStorage or use sample data
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
    }

    function setupNewExercise() {
        // Reset the state
        userAnswerZone.innerHTML = '';
        wordBankZone.innerHTML = '';
        resultMessageEl.innerHTML = '';
        checkButton.disabled = false;

        if (activeGrammarData.length === 0) {
            viSentenceEl.textContent = "Không có dữ liệu để luyện tập. Vui lòng tải file Word ở trang chủ.";
            return;
        }

        // Randomly select a grammar point, then randomly select an example
        const randomGrammar = activeGrammarData[Math.floor(Math.random() * activeGrammarData.length)];
        currentExample = randomGrammar.examples[Math.floor(Math.random() * randomGrammar.examples.length)];

        // Hiển thị câu tiếng Việt làm đề bài
        viSentenceEl.textContent = currentExample.vi;

        // Split the Japanese sentence into pieces and shuffle them
        // This is a simple split method, can be improved further
        const pieces = currentExample.jp.replace(/。|、/g, ' $&').split(/\s+/).filter(p => p);
        shuffle(pieces);

        // Create word pieces in the word bank
        pieces.forEach((piece, index) => {
            const pieceEl = document.createElement('div');
            pieceEl.id = `piece-${Date.now()}-${index}`; // Create a unique ID
            pieceEl.classList.add('word-piece');
            pieceEl.style.cursor = 'pointer'; // Add cursor pointer to indicate it's clickable
            pieceEl.textContent = piece;
            
            // Add click event to move the piece
            pieceEl.addEventListener('click', onPieceClick);

            wordBankZone.appendChild(pieceEl);
        });
    }

    // --- Handler for clicking on a sentence piece ---
    function onPieceClick(e) {
        const piece = e.target;
        // Check where the piece is and move it to the other zone
        if (piece.parentElement === wordBankZone) {
            userAnswerZone.appendChild(piece);
        } else {
            wordBankZone.appendChild(piece);
        }
    }

    function checkAnswer() {
        const userAnswerPieces = Array.from(userAnswerZone.children).map(el => el.textContent);
        const userAnswer = userAnswerPieces.join('').replace(/\s/g, '');
        const correctAnswer = currentExample.jp.replace(/\s/g, '');

        if (userAnswer === correctAnswer) {
            resultMessageEl.innerHTML = `<span style="color: green;">Correct!</span><br>The correct sentence is: <strong>${currentExample.jp}</strong>`;
        } else {
            resultMessageEl.innerHTML = `<span style="color: red;">Incorrect!</span><br>The correct sentence is: <strong>${currentExample.jp}</strong>`;
        }
        checkButton.disabled = true;
    }

    // Function to shuffle an array
    function shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    checkButton.addEventListener('click', checkAnswer);
    nextButton.addEventListener('click', setupNewExercise);

    // Start the first exercise
    loadData().then(() => {
        setupNewExercise();
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