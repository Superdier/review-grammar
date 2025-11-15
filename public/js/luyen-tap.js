import { loadSharedData, syncStatsToFirebase } from './main.js';
import { shuffle } from './utils.js';

document.addEventListener('DOMContentLoaded', async () => {
    const viSentenceEl = document.getElementById('vietnamese-sentence');
    const userAnswerZone = document.getElementById('user-answer-zone');
    const wordBankZone = document.getElementById('word-bank-zone');
    const checkButton = document.getElementById('check-button');
    const nextButton = document.getElementById('next-button');
    const resultMessageEl = document.getElementById('result-message');

    let activeGrammarData = [];
    let currentExample = null;
    let grammarStats = {};

    // Load data from localStorage or use sample data
    async function loadDataAndSetup() {
        // Use global data loaded by main.js from Firebase
        const data = await loadSharedData();
        activeGrammarData = data.appGrammarData;
        grammarStats = data.grammarStats;
        setupNewExercise();
    }

    function setupNewExercise() {
        // Reset the state
        userAnswerZone.innerHTML = '';
        wordBankZone.innerHTML = '';
        resultMessageEl.innerHTML = '';
        checkButton.disabled = false;

        if (activeGrammarData.length === 0) {
            viSentenceEl.textContent = "No data to practice. Please upload a data file on the homepage.";
            return;
        }

        // Randomly select a grammar point, then randomly select an example
        const randomGrammar = activeGrammarData[Math.floor(Math.random() * activeGrammarData.length)];
        const randomExample = randomGrammar.examples[Math.floor(Math.random() * randomGrammar.examples.length)];
        currentExample = { ...randomExample, grammarId: randomGrammar.id }; // Store grammarId with the example

        viSentenceEl.textContent = currentExample.vi;

        // Split the Japanese sentence into pieces and shuffle them
        // This is a simple split method, can be improved further
        // Cải tiến: Tách thành từng ký tự để xử lý câu không có khoảng trắng
        const pieces = currentExample.jp.split('');
        shuffle(pieces);

        // Create word pieces in the word bank
        pieces.forEach((piece, index) => {
            const pieceEl = document.createElement('div');
            pieceEl.id = `piece-${Date.now()}-${index}`; // Create a unique ID
            pieceEl.classList.add('word-piece');
            pieceEl.textContent = piece;
            
            // Kích hoạt chức năng kéo và thả
            pieceEl.draggable = true;
            pieceEl.addEventListener('dragstart', onDragStart);

            // Giữ lại chức năng click để tương thích mobile
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

    // --- Handlers for Drag and Drop ---
    function onDragStart(e) {
        e.dataTransfer.setData('text/plain', e.target.id);
    }

    function onDragOver(e) {
        e.preventDefault(); // Necessary to allow dropping
    }

    function onDrop(e) {
        e.preventDefault();
        const id = e.dataTransfer.getData('text');
        const draggableElement = document.getElementById(id);
        const dropzone = e.target.closest('.drop-zone, .word-bank');
        if (dropzone && draggableElement) {
            dropzone.appendChild(draggableElement);
        }
    }

    // Add drag and drop event listeners to both zones
    userAnswerZone.addEventListener('dragover', onDragOver);
    userAnswerZone.addEventListener('drop', onDrop);
    wordBankZone.addEventListener('dragover', onDragOver);
    wordBankZone.addEventListener('drop', onDrop);

    function checkAnswer() {
        const userAnswerPieces = Array.from(userAnswerZone.children).map(el => el.textContent);
        const userAnswer = userAnswerPieces.join('').replace(/\s/g, '');
        const correctAnswer = currentExample.jp.replace(/\s/g, '');

        const isCorrect = userAnswer === correctAnswer;

        // Update stats
        const grammarId = currentExample.grammarId;
        if (!grammarStats[grammarId]) {
            grammarStats[grammarId] = { correct: 0, total: 0 };
        }
        grammarStats[grammarId].total += 1;
        if (isCorrect) {
            grammarStats[grammarId].correct += 1;
            resultMessageEl.innerHTML = `<span style="color: green;">Correct!</span><br>The correct sentence is: <strong>${currentExample.jp}</strong>`;
        } else {
            resultMessageEl.innerHTML = `<span style="color: red;">Incorrect!</span><br>The correct sentence is: <strong>${currentExample.jp}</strong>`;
        }

        // Sync stats to Firebase
        syncStatsToFirebase(grammarStats);

        checkButton.disabled = true;
    }

    checkButton.addEventListener('click', checkAnswer);
    nextButton.addEventListener('click', setupNewExercise);

    // Start the first exercise
    loadDataAndSetup();
});