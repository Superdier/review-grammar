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
        // Cải tiến: Tách riêng các khối Kanji, Hiragana, Katakana và các ký tự khác.
        const pieces = smartSplit(currentExample.jp);

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

    /**
 * Tách câu tiếng Nhật thành các mảnh một cách thông minh và ngẫu nhiên.
 * - Đảm bảo luôn có ít nhất 4 mảnh
 * - Dấu câu luôn được gộp với từ đứng trước, TRỪ dấu 。 nếu chỉ có 1 dấu trong câu
 * - Xử lý đặc biệt với các dấu câu như 「、」「。」「が、」「ので、」等
 * @param {string} sentence Câu cần tách.
 * @returns {string[]} Mảng các mảnh câu (ít nhất 4 mảnh).
 */
function smartSplit(sentence) {
    // Đếm số dấu 。 trong câu
    const dotCount = (sentence.match(/。/g) || []).length;
    let hasSingleDot = false;
    let processedSentence = sentence;
    
    // Nếu chỉ có 1 dấu 。, tách nó ra
    if (dotCount === 1) {
        hasSingleDot = true;
        processedSentence = sentence.replace(/。$/, '');
    }
    
    // Regex cải tiến để tách tiếng Nhật, giữ nguyên các cụm có dấu câu
    const regex = /[^、！？…]+[、！？…]*/g;
    let initialParts = processedSentence.match(regex) || [processedSentence];
    
    // Lọc bỏ các phần rỗng
    initialParts = initialParts.filter(part => part.length > 0);
    
    const finalPieces = [];
    
    // Xử lý từng phần, đảm bảo dấu câu đi kèm với từ
    for (let i = 0; i < initialParts.length; i++) {
        let currentPiece = initialParts[i];
        
        // Nếu phần này kết thúc bằng dấu câu (trừ 。), giữ nguyên
        // Nếu không, quyết định có gộp với phần tiếp theo không
        const endsWithPunctuation = /[、！？…]$/.test(currentPiece);
        
        if (!endsWithPunctuation && i + 1 < initialParts.length) {
            // Quyết định ngẫu nhiên có gộp với phần tiếp theo không (tỷ lệ 40%)
            const shouldMerge = Math.random() < 0.4;
            
            if (shouldMerge) {
                const nextPiece = initialParts[i + 1];
                // Chỉ gộp nếu tổng độ dài không quá 8 ký tự
                if (currentPiece.length + nextPiece.length <= 8) {
                    currentPiece += nextPiece;
                    i++; // Bỏ qua phần đã gộp
                }
            }
        }
        
        finalPieces.push(currentPiece);
    }
    
    // Thêm dấu 。 riêng nếu ban đầu chỉ có 1 dấu
    if (hasSingleDot) {
        finalPieces.push('。');
    }
    
    // Đảm bảo có ít nhất 4 mảnh bằng cách chia nhỏ
    return ensureMinimumPieces(finalPieces, 4);
}

/**
 * Đảm bảo số lượng mảnh tối thiểu bằng cách chia nhỏ các mảnh dài
 * @param {string[]} pieces Mảng các mảnh
 * @param {number} minPieces Số mảnh tối thiểu
 * @returns {string[]} Mảng các mảnh đã được điều chỉnh
 */
function ensureMinimumPieces(pieces, minPieces) {
    if (pieces.length >= minPieces) {
        return pieces;
    }

    let result = [...pieces];
    
    // Tiếp tục chia nhỏ các mảnh dài nhất cho đến khi đủ số lượng
    while (result.length < minPieces) {
        // Tìm mảnh dài nhất có thể chia (ưu tiên mảnh không có dấu câu ở giữa)
        let bestSplitIndex = -1;
        let bestSplitScore = -1;
        
        for (let i = 0; i < result.length; i++) {
            const piece = result[i];
            // Bỏ qua dấu 。 riêng
            if (piece === '。') continue;
            if (piece.length < 2) continue;
            
            // Tính điểm ưu tiên: mảnh dài hơn và không có dấu câu quan trọng ở giữa
            let score = piece.length;
            
            // Trừ điểm nếu có dấu câu quan trọng ở giữa (không phải cuối)
            if (/[、]/.test(piece.slice(0, -1))) {
                score -= 3;
            }
            
            if (score > bestSplitScore) {
                bestSplitScore = score;
                bestSplitIndex = i;
            }
        }
        
        if (bestSplitIndex === -1) {
            // Không thể chia thêm, thoát khỏi vòng lặp
            break;
        }
        
        // Chia mảnh dài nhất thành 2 phần
        const piece = result[bestSplitIndex];
        let splitPoint;
        
        // Ưu tiên chia tại vị trí tự nhiên (sau các trợ từ)
        const naturalSplit = findNaturalSplitPoint(piece);
        if (naturalSplit > 0) {
            splitPoint = naturalSplit;
        } else {
            // Chia ở giữa
            splitPoint = Math.floor(piece.length / 2);
        }
        
        const part1 = piece.substring(0, splitPoint);
        const part2 = piece.substring(splitPoint);
        
        // Thay thế mảnh cũ bằng 2 mảnh mới
        result.splice(bestSplitIndex, 1, part1, part2);
    }
    
    return result;
}

/**
 * Tìm điểm chia tự nhiên trong câu tiếng Nhật
 * @param {string} text Đoạn văn bản
 * @returns {number} Vị trí chia, -1 nếu không tìm thấy
 */
function findNaturalSplitPoint(text) {
    // Các vị trí chia tự nhiên: sau trợ từ, liên từ
    const naturalSplitters = ['は', 'が', 'を', 'に', 'で', 'と', 'から', 'まで', 'ので', 'けど'];
    
    for (const splitter of naturalSplitters) {
        const index = text.indexOf(splitter);
        if (index > 0 && index < text.length - 1) {
            return index + splitter.length;
        }
    }
    
    // Tìm khoảng trống hoặc vị trí chuyển đổi loại ký tự
    for (let i = 1; i < text.length - 1; i++) {
        const prevChar = text[i - 1];
        const currChar = text[i];
        
        // Chuyển từ Hiragana sang Kanji hoặc ngược lại
        const isHiraganaToKanji = /[\u3040-\u309f]/.test(prevChar) && /[\u4e00-\u9faf]/.test(currChar);
        const isKanjiToHiragana = /[\u4e00-\u9faf]/.test(prevChar) && /[\u3040-\u309f]/.test(currChar);
        
        if (isHiraganaToKanji || isKanjiToHiragana) {
            return i;
        }
    }
    
    return -1;
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