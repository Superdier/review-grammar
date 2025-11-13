import { db } from './firebase-init.js';
import { collection, getDocs, writeBatch, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

/**
 * Hiển thị một thông báo toast.
 * @param {string} message - Nội dung thông báo.
 * @param {'success' | 'error'} type - Loại thông báo.
 * @param {number} duration - Thời gian hiển thị (ms).
 */
function showToast(message, type = 'success', duration = 3000) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;

  container.appendChild(toast);

  // Animate in
  setTimeout(() => toast.classList.add('show'), 10);

  // Animate out and remove
  setTimeout(() => {
    toast.classList.remove('show');
    toast.addEventListener('transitionend', () => toast.remove());
  }, duration);
}

// Firebase document IDs for stats and learning status (assuming single user for now)
const FIREBASE_STATS_DOC_ID = "userStats";
const FIREBASE_LEARNING_STATUS_DOC_ID = "userLearningStatus";

function initializeHomePage(initialData, initialStats, initialLearningStatus) {
  
  // --- Lấy các phần tử DOM ---
  // Danh sách chính
  const grammarListUl = document.getElementById("grammar-ul");
  const addNewGrammarBtn = document.getElementById("add-new-grammar-btn");
  const sortOptions = document.getElementById("sort-options");
  const filterStatus = document.getElementById("filter-status");

  // Quản lý dữ liệu
  const fileInput = document.getElementById("word-file-input");
  const exportJsonBtn = document.getElementById("export-json-btn");
  const importJsonInput = document.getElementById("import-json-input");
  const clearStorageButton = document.getElementById("clear-storage-button");

  // Modal chi tiết/sửa
  const modal = document.getElementById("grammar-modal");
  const closeModalButton = document.querySelector(".close-button");
  const modalViewMode = document.getElementById("modal-view-mode");
  const modalEditMode = document.getElementById("modal-edit-mode");
  const editButton = document.getElementById("modal-edit-btn");
  const deleteButton = document.getElementById("modal-delete-btn");
  const saveButton = document.getElementById("modal-save-btn");
  const cancelButton = document.getElementById("modal-cancel-btn");

  // Mục tiêu hàng ngày
  const dailyGoalInput = document.getElementById('daily-goal-input');
  const learnedTodayCountSpan = document.getElementById('learned-today-count');
  const dailyGoalTargetSpan = document.getElementById('daily-goal-target');
  const dailyGoalProgressBar = document.getElementById('daily-goal-progress-bar');

  // Học nhanh (Quick Learn)
  const startQuickLearnBtn = document.getElementById('start-quick-learn-btn');
  const nextSessionOptions = document.getElementById('next-session-options');
  const startNextSessionBtn = document.getElementById('start-next-session-btn');
  const quickLearnContainer = document.getElementById('quick-learn-container');
  const qlProgressBar = document.getElementById('quick-learn-progress-bar');
  const qlStepTitle = document.getElementById('quick-learn-step-title');
  const qlNextBtn = document.getElementById('ql-next-btn');
  const qlStepContainers = document.querySelectorAll('.ql-step-container');
  const qlStep1View = document.getElementById('ql-step1-view');
  const qlStep2MC = document.getElementById('ql-step2-mc');
  const qlStep3Match = document.getElementById('ql-step3-match');
  const qlStep4Fill = document.getElementById('ql-step4-fill');

  // Scroll to top button
  const scrollToTopBtn = document.getElementById("scroll-to-top-btn");

  // Biến để lưu ID của ngữ pháp đang được xem/sửa
  let currentEditingId = null;

  let wasSkippedInQuickLearn = false; // Flag để xử lý việc bỏ qua câu hỏi
  const DATA_STORAGE_KEY = "jlptGrammarData";
  const STATS_STORAGE_KEY = "grammarStats";
  const LEARNING_STATUS_KEY = "learningStatus";
  const DAILY_GOAL_KEY = "dailyGoal";
  
  // Global variables for grammar data
  let appGrammarData = initialData || [];
  let grammarStats = initialStats || {};
  let learningStatus = initialLearningStatus || {};
  
  // Global variable to store IDs learned today, initialized here
  let learnedTodayIds = new Set();

  function renderGrammarList(data) {
    grammarListUl.innerHTML = ""; // Clear old list
    data.forEach((grammar) => {
      const li = document.createElement("li");
      const button = document.createElement("button");
      button.textContent = "View Details";
      button.onclick = () => showGrammarDetails(grammar.id);

      const status = learningStatus[grammar.id];
      let statusBadge = '';
      if (status === 'learned') statusBadge = ' <span class="badge learned">Learned</span>';
      else if (status === 'review') statusBadge = ' <span class="badge review">Review</span>';

      li.innerHTML = `
                <span><strong>${grammar.structure}</strong>: ${grammar.meaning}</span>${statusBadge}
            `;
      li.appendChild(button);
      grammarListUl.appendChild(li);
    });
  }

  fileInput.addEventListener("change", function (event) {
    const file = event.target.files[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = function (e) {
      const arrayBuffer = e.target.result;
      mammoth
        .extractRawText({ arrayBuffer: arrayBuffer })
        .then((result) => {
          const text = result.value;
          const parsedData = parseWordText(text);
          if (parsedData.length > 0) {
            // Ghi đè dữ liệu cũ bằng dữ liệu mới từ file Word
            appGrammarData = parsedData;
            // Cập nhật lại biến grammarData toàn cục để các trang khác có thể dùng
            window.grammarData = appGrammarData;
            // Lưu vào localStorage để dùng cho lần sau
            localStorage.setItem(DATA_STORAGE_KEY, JSON.stringify(appGrammarData));
            // Không cần đồng bộ stats/learningStatus ở đây, chỉ dữ liệu ngữ pháp chính
            console.log("Saved new data to localStorage. Starting sync to Firebase...");

            applyFiltersAndSort();
            syncDataToFirebase(); // <-- GỌI HÀM ĐỒNG BỘ
            showToast(`Successfully parsed ${parsedData.length} grammar structures!`, 'success');
          } else {
            showToast(
              "No grammar structures found in the file or the format is incorrect."
            , 'error');
          }
        })
        .catch((err) => {
          console.error(err);
          showToast("An error occurred while reading the Word file.", 'error');
        });
    };
    reader.readAsArrayBuffer(file);
  });

function preprocessExamples(text) {
  return text.replace(/([一-龯ぁ-ゔァ-ヴー々〆〤。！？])\s*([A-Za-zÀ-ỹ])/g, '$1\n$2');
}

function normalizeHeaders(text) {
  return text
    .replace(/\r/g, "")
    .replace(/^Cấu trúc\s*[:：]?/gim, "")
    .replace(/^Ý nghĩa\s*[:：]?/gim, "\nÝ nghĩa:\n")
    .replace(/^(Giải\s*thích|Giai\s*thich)\s*[:：]?/gim, "\nGiải thích:\n")
    .replace(/^(Ví\s*(dụ|vụ)|Vi\s*du)\s*[:：]?/gim, "\nVí dụ:\n")
    .replace(/^(Chú\s*ý|Chu\s*y)\s*[:：]?/gim, "\nChú ý:\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function parseExamples(content) {
  const lines = content.split("\n").map(l => l.trim()).filter(Boolean);
  const examples = [];
  const isJapanese = (s) => /[\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/.test(s);
  let jpBuffer = [];

  for (const line of lines) {
    if (isJapanese(line)) {
      if (jpBuffer.length > 0 && jpBuffer[jpBuffer.length - 1].vi === "") {
        examples.push(jpBuffer.pop());
      }
      jpBuffer.push({ jp: line, vi: "" });
    } else {
      if (jpBuffer.length > 0 && jpBuffer[jpBuffer.length - 1].vi === "") {
        jpBuffer[jpBuffer.length - 1].vi = line;
        examples.push(jpBuffer.pop());
      }
    }
  }
  if (jpBuffer.length > 0) examples.push(...jpBuffer);
  return examples;
}

function parseWordText(text) {
  const grammarArray = [];

  let normalizedText = normalizeHeaders(text);

  // 🔄 Tách khối ngữ pháp bằng dòng phân cách
  const blocks = normalizedText.split(/=+\n?/).filter(block => block.trim());

  for (const [index, block] of blocks.entries()) {
    try {
      const lines = block.split("\n").map(l => l.trim()).filter(Boolean);
      if (lines.length === 0) continue;

      // Dòng đầu tiên là tiêu đề: "1. ～ことにする～：　Quyết định làm..."
      const firstLineMatch = lines[0].match(/^\d+[.．]?\s*～?(.*?)～?\s*[:：]\s*(.*)$/);
      let structure = firstLineMatch ? firstLineMatch[1].trim() : "";
      const meaning = firstLineMatch ? firstLineMatch[2].trim() : "";

      if (!structure || !meaning) {
        console.warn(`⚠️ Could not recognize the title in block ${index + 1}:`, lines[0]);
        continue;
      }

      let explanation = "";
      let examples = [];
      let note = "";

      let currentSection = "";
      let buffer = [];

      const flushBuffer = () => {
        if (!currentSection || buffer.length === 0) return;
        let content = buffer.join("\n").trim();
        buffer = [];

        if (currentSection === "Ví dụ") {
          content = preprocessExamples(content);
          examples = parseExamples(content);
        } else if (currentSection === "Giải thích") {
          explanation = content;
        } else if (currentSection === "Chú ý") {
          note = content;
        }
      };

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (/^Giải\s*thích[:：]?$/i.test(line)) {
          flushBuffer();
          currentSection = "Giải thích";
          continue;
        }
        if (/^Ví\s*(dụ|vụ)[:：]?$/i.test(line)) {
          flushBuffer();
          currentSection = "Ví dụ";
          continue;
        }
        if (/^Chú\s*ý[:：]?$/i.test(line)) {
  flushBuffer();
  currentSection = "Chú ý";
  continue;
}
        buffer.push(line);
      }
      flushBuffer();

      grammarArray.push({
        id: index + 1,
        structure,
        meaning,
        explanation,
        examples,
        note,
      });
    } catch (e) {
      console.error("❌ Error parsing block:", e);
    }
  }

  return grammarArray;
}

  /**
   * Đồng bộ toàn bộ dữ liệu appGrammarData lên Firebase.
   * Hàm này sẽ XÓA TẤT CẢ dữ liệu cũ trên collection 'grammar' và ghi lại dữ liệu mới.
   */
  async function syncDataToFirebase() {
    if (!appGrammarData || appGrammarData.length === 0) {
      console.warn("No data to sync to Firebase.");
      return;
    }

    console.log("Starting data sync process to Firebase...");
    const grammarCollectionRef = collection(db, 'grammar');

    try {
      const batch = writeBatch(db);

      // Bước 1: Lấy và xóa tất cả các document cũ
      const oldDocsSnapshot = await getDocs(grammarCollectionRef);
      oldDocsSnapshot.forEach(document => {
        batch.delete(document.ref);
      });

      // Bước 2: Thêm tất cả các document mới từ appGrammarData
      appGrammarData.forEach(grammarItem => {
        const newDocRef = doc(grammarCollectionRef, String(grammarItem.id));
        batch.set(newDocRef, grammarItem);
      });

      // Bước 3: Thực thi batch
      await batch.commit();
      console.log("✅ Successfully synced data to Firebase!");
      showToast("Data successfully synced to Firebase!", 'success');
    } catch (error) {
      console.error("❌ Error syncing data to Firebase:", error);
      showToast("Error syncing data to Firebase. Check console.", 'error');
    }
  }

  function showGrammarDetails(grammarId) {
    const grammar = appGrammarData.find((g) => g.id === grammarId);
    if (!grammar) return;

    currentEditingId = grammarId; // Lưu ID để dùng khi lưu

    // --- Điền dữ liệu vào chế độ XEM ---
    document.getElementById("modal-structure").textContent = grammar.structure;
    document.getElementById("modal-meaning").textContent = grammar.meaning;
    document.getElementById("modal-explanation").textContent =
      grammar.explanation;

    // --- Điền dữ liệu vào chế độ SỬA ---
    document.getElementById("modal-edit-structure").value = grammar.structure;
    document.getElementById("modal-edit-meaning").value = grammar.meaning;
    document.getElementById("modal-edit-explanation").value = grammar.explanation;
    document.getElementById("modal-edit-note").value = grammar.note || "";

    // Format examples for the textarea
    const examplesText = grammar.examples
      .map(ex => `${ex.jp}\n${ex.vi}`)
      .join('\n---\n');
    document.getElementById("modal-edit-examples").value = examplesText;






    // Hiển thị thống kê
    const statsSpan = document.getElementById("modal-stats");
    const stats = grammarStats[grammarId];
    if (stats && stats.total > 0) {
      const percentage = Math.round((stats.correct / stats.total) * 100);
      statsSpan.textContent = `${stats.correct}/${stats.total} (${percentage}%)`;
    } else {
      statsSpan.textContent = "No stats yet.";
    }



    document.getElementById("modal-note").textContent =
      grammar.note || "No special notes.";

    const examplesUl = document.getElementById("modal-examples");
    examplesUl.innerHTML = "";
    grammar.examples.forEach((ex) => {
      const exLi = document.createElement("li");
      exLi.innerHTML = `
                <div class="jp-example">${ex.jp}</div>
                <div class="vi-example">${ex.vi}</div>
            `;
      examplesUl.appendChild(exLi);
    });

    // Hiển thị modal
    modalViewMode.style.display = "block";
    modalEditMode.style.display = "none";
    // Đặt lại trạng thái các nút ở footer khi mở modal
    editButton.style.display = "inline-block";
    deleteButton.style.display = "inline-block";
    saveButton.style.display = "none";
    cancelButton.style.display = "none";

    document.body.classList.add("modal-open");
    modal.style.display = "block";
  }

  function saveGrammarChanges() {
    if (currentEditingId === null) return;

    // Lấy dữ liệu mới từ form
    const newStructure = document.getElementById("modal-edit-structure").value;
    const newMeaning = document.getElementById("modal-edit-meaning").value;
    const newExplanation = document.getElementById("modal-edit-explanation").value;
    const newNote = document.getElementById("modal-edit-note").value;
    const examplesText = document.getElementById("modal-edit-examples").value;

    if (!newStructure || !newMeaning) {
      showToast("Structure and Meaning are required.", 'error');
      return;
    }

    // Parse examples from textarea
    const newExamples = examplesText
      .split(/\n---\n/)
      .map(pair => {
        const lines = pair.trim().split('\n');
        if (lines.length >= 2) {
          return { jp: lines[0].trim(), vi: lines.slice(1).join('\n').trim() };
        }
        return null;
      })
      .filter(ex => ex && ex.jp); // Lọc ra các ví dụ hợp lệ

    if (currentEditingId === 'new') {
      // Thêm mới
      const newId = appGrammarData.length > 0 ? Math.max(...appGrammarData.map(g => g.id)) + 1 : 1;
      const newGrammar = {
        id: newId,
        structure: newStructure,
        meaning: newMeaning,
        explanation: newExplanation,
        note: newNote,
        examples: newExamples,
      };
      appGrammarData.push(newGrammar);
    } else {
      // Sửa
      const grammarIndex = appGrammarData.findIndex(g => g.id === currentEditingId);
      if (grammarIndex === -1) return;
      const updatedGrammar = {
        ...appGrammarData[grammarIndex],
        structure: newStructure,
        meaning: newMeaning,
        explanation: newExplanation,
        note: newNote,
        examples: newExamples,
      };
      appGrammarData[grammarIndex] = updatedGrammar;

      // Cập nhật cả trong qlSessionData nếu đang trong phiên học nhanh
      // (qlSessionData chỉ tồn tại trong main.js, không cần đồng bộ ra ngoài)
      const qlIndex = qlSessionData.findIndex(g => g.id === currentEditingId);
      if (qlIndex > -1) {
        qlSessionData[qlIndex] = updatedGrammar;
      }
    }

    // Lưu vào localStorage và render lại danh sách
    localStorage.setItem(DATA_STORAGE_KEY, JSON.stringify(appGrammarData));
    syncDataToFirebase(); // Đồng bộ dữ liệu ngữ pháp chính lên Firebase
    applyFiltersAndSort();

    // Đóng modal
    closeModal();
  }

  function deleteCurrentGrammar() {
    if (currentEditingId === null || currentEditingId === 'new') return;

    if (confirm(`Are you sure you want to delete this grammar structure?`)) {
      const grammarIndex = appGrammarData.findIndex(g => g.id === currentEditingId);
      if (grammarIndex > -1) {
        appGrammarData.splice(grammarIndex, 1);

        // Lưu vào localStorage và render lại danh sách
        localStorage.setItem(DATA_STORAGE_KEY, JSON.stringify(appGrammarData));
        syncDataToFirebase(); // Đồng bộ dữ liệu ngữ pháp chính lên Firebase
        applyFiltersAndSort();

        // Đóng modal
        closeModal();
      }
    }
  }

  function openModalForNewGrammar() {
    currentEditingId = 'new'; // Đánh dấu là đang thêm mới

    // Xóa trắng các trường input
    document.getElementById("modal-edit-structure").value = "";
    document.getElementById("modal-edit-meaning").value = "";
    document.getElementById("modal-edit-explanation").value = "";
    document.getElementById("modal-edit-note").value = "";
    document.getElementById("modal-edit-examples").value = "";

    // Mở modal ở chế độ sửa
    switchToEditMode();
    document.body.classList.add("modal-open");
    modal.style.display = "block";
  }

  function closeModal() {
    document.body.classList.remove("modal-open");
    modal.style.display = "none";
    // Nếu đang trong phiên học nhanh, tải lại bước hiện tại để cập nhật thông tin
    // isQuickLearningActive là một biến tạm để kiểm tra
    if (quickLearnContainer.style.display === 'block') {
      if (wasSkippedInQuickLearn) {
        wasSkippedInQuickLearn = false;
        loadQuickLearnStep(); // Tải câu tiếp theo sau khi bỏ qua
      } else if (currentEditingId !== 'new') {
        loadQuickLearnStep(); // Tải lại câu hiện tại sau khi sửa
      }
    }
    currentEditingId = null;
  }

  function switchToEditMode() {
    modalViewMode.style.display = "none";
    modalEditMode.style.display = "block";
    // Ẩn/hiện các nút ở footer
    editButton.style.display = "none";
    deleteButton.style.display = "none";
    saveButton.style.display = "inline-block";
    cancelButton.style.display = "inline-block";
  }

  function switchToViewMode() {
    // Chuyển về chế độ xem
    modalEditMode.style.display = "none";
    modalViewMode.style.display = "block";
    // Đặt lại các nút ở footer
    editButton.style.display = "inline-block";
    deleteButton.style.display = "inline-block";
    saveButton.style.display = "none";
    cancelButton.style.display = "none";
  }

  // Gán sự kiện đóng modal
  closeModalButton.addEventListener("click", closeModal);
  window.addEventListener("click", (event) => {
    if (event.target == modal) {
      closeModal();
    }
  });

  // Gán sự kiện cho các nút trong modal
  editButton.addEventListener("click", switchToEditMode);
  saveButton.addEventListener("click", saveGrammarChanges);
  deleteButton.addEventListener("click", deleteCurrentGrammar);
  cancelButton.addEventListener("click", switchToViewMode);
  addNewGrammarBtn.addEventListener("click", openModalForNewGrammar);

  function applyFiltersAndSort() {
    let filteredData = [...appGrammarData];

    // 1. Lọc theo trạng thái
    const filterValue = filterStatus.value;
    if (filterValue !== 'all') {
      filteredData = filteredData.filter(g => {
        const status = learningStatus[g.id];
        if (filterValue === 'learned') return status === 'learned'; // Filter: Learned
        if (filterValue === 'review') return status === 'review';   // Filter: Review
        if (filterValue === 'unlearned') return !status;          // Filter: Unlearned
        return true;
      });
    }

    // 2. Sắp xếp
    const sortBy = sortOptions.value;
    switch (sortBy) {
      case 'az':
        filteredData.sort((a, b) => a.structure.localeCompare(b.structure, 'ja'));
        break;
      case 'za':
        filteredData.sort((a, b) => b.structure.localeCompare(a.structure, 'ja'));
        break;
      default: // 'default'
        filteredData.sort((a, b) => a.id - b.id);
        break;
    }

    // 3. Render lại danh sách
    renderGrammarList(filteredData);
  }

  sortOptions.addEventListener("change", applyFiltersAndSort);
  filterStatus.addEventListener("change", applyFiltersAndSort);

  // --- Logic cho Import/Export JSON ---

  function exportToJson() {
    if (appGrammarData.length === 0) {
      alert("No data to export.");
      return;
    }
    const jsonString = JSON.stringify(appGrammarData, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "grammar_data.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function importFromJson(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const importedData = JSON.parse(e.target.result);

        // Kiểm tra sơ bộ dữ liệu
        if (Array.isArray(importedData) && importedData.length > 0 && importedData[0].structure && importedData[0].meaning) {
          if (confirm(`Are you sure you want to overwrite current data with ${importedData.length} grammar structures from the file?`)) {
            appGrammarData = importedData;
            window.grammarData = appGrammarData;
            localStorage.setItem(DATA_STORAGE_KEY, JSON.stringify(appGrammarData));
            // Gọi hàm đồng bộ dữ liệu ngữ pháp chính
            syncDataToFirebase(); // <-- GỌI HÀM ĐỒNG BỘ
            applyFiltersAndSort();
            showToast("Data imported successfully!", 'success');
          }
        } else {
          showToast("Invalid JSON file format. Please check the file.", 'error');
        }
      } catch (error) {
        console.error("Lỗi khi phân tích file JSON:", error);
        showToast("Error reading JSON file. It may be corrupted.", 'error');
      } finally {
        // Reset input để có thể chọn lại cùng một file
        event.target.value = null;
      }
    };
    reader.readAsText(file);
  }

  exportJsonBtn.addEventListener("click", exportToJson);
  importJsonInput.addEventListener("change", importFromJson);

  clearStorageButton.addEventListener("click", function () {
    if (
      confirm(
        "Are you sure you want to delete uploaded data and revert to the original data?"
      )
    ) {
      localStorage.removeItem(DATA_STORAGE_KEY);
      localStorage.removeItem(STATS_STORAGE_KEY); // Xóa cả thống kê
      showToast("Data cleared. Reloading page...", 'success');
      window.location.reload();
    }
  });

  function loadAndDisplayDailyGoal() {
    const today = getTodayString();
    let goalData = JSON.parse(localStorage.getItem(DAILY_GOAL_KEY)) || {};

    // Nếu sang ngày mới, reset learnedIds
    if (goalData.date !== today) {
      goalData.date = today;
      goalData.learnedIds = [];
    }

    const goal = goalData.goal || 5;
    const learnedIds = new Set(goalData.learnedIds || []);

    dailyGoalInput.value = goal;
    learnedTodayIds = learnedIds; // Cập nhật biến toàn cục

    localStorage.setItem(DAILY_GOAL_KEY, JSON.stringify(goalData));
    updateDailyGoalProgress();

    // Nếu đã học ít nhất 1 ngữ pháp hôm nay, hiển thị tùy chọn phiên tiếp theo
    if (learnedTodayIds.size > 0) {
      startQuickLearnBtn.style.display = 'none';
      nextSessionOptions.style.display = 'block';
    }
  }

  function updateDailyGoalProgress() {
    const goal = parseInt(dailyGoalInput.value, 10);
    const learnedCount = learnedTodayIds.size;
    const percentage = goal > 0 ? Math.min(Math.round((learnedCount / goal) * 100), 100) : 0;

    learnedTodayCountSpan.textContent = learnedCount;
    dailyGoalTargetSpan.textContent = goal;
    dailyGoalProgressBar.style.width = `${percentage}%`;
    dailyGoalProgressBar.textContent = `${percentage}%`;

    // Cho phép chọn số lượng ngữ pháp tùy ý sau khi hoàn thành mục tiêu
    const quickLearnCountInput = document.getElementById('quick-learn-count');
    if (learnedCount >= goal) {
      // Luôn yêu cầu tối thiểu 1
      quickLearnCountInput.min = "1";
    } else {
      // Mặc định tối thiểu là 5
      quickLearnCountInput.min = "5";
    }

    // Cập nhật danh sách các ngữ pháp đã học hôm nay
    const learnedTodayListDiv = document.getElementById('learned-today-list');
    const learnedTodayListContainer = document.getElementById('learned-today-list-container');
    learnedTodayListDiv.innerHTML = ''; // Xóa nội dung cũ

    if (learnedTodayIds.size > 0) {
        const learnedItems = Array.from(learnedTodayIds)
            .map(id => appGrammarData.find(g => g.id === id))
            .filter(Boolean); // Lọc ra các item không tìm thấy

        learnedItems.forEach(g => {
            const badge = document.createElement('span');
            badge.className = 'badge learned';
            badge.textContent = g.structure;
            badge.style.cursor = 'pointer';
            badge.onclick = () => showGrammarDetails(g.id);
            learnedTodayListDiv.appendChild(badge);
        });
    } else {
        learnedTodayListDiv.innerHTML = '<span style="color: #888;">No grammar yet.</span>';
    }
  }

  dailyGoalInput.addEventListener('change', () => {
    const newGoal = parseInt(dailyGoalInput.value, 10);
    let goalData = JSON.parse(localStorage.getItem(DAILY_GOAL_KEY)) || {};
    goalData.goal = newGoal;
    localStorage.setItem(DAILY_GOAL_KEY, JSON.stringify(goalData));
    updateDailyGoalProgress();
    showToast(`Daily goal updated to ${newGoal}.`, 'success');
  });
  // ==================================================
  // LOGIC CHO QUICK LEARN
  // =================================================
  const QUICK_LEARN_DAILY_KEY = "quickLearnDailySelection";

  let qlSessionData = [];
  let qlCurrentIndex = 0; // Index for grammar item (0-4)
  let qlCurrentStep = 0; // Index for learning step (0-3)
  let qlNewItems = []; // Mảng chứa các mục mới trong phiên review
  let qlIsReviewSession = false; // Cờ đánh dấu phiên ôn tập

  function getTodayString() {
    return new Date().toISOString().slice(0, 10);
  }

  function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  function startLearnSession() {
    const learnMode = document.querySelector('input[name="learn-mode"]:checked')?.value || 'new-only';
    qlIsReviewSession = learnMode === 'review-and-new';

    const countInput = document.getElementById('quick-learn-count');
    let newItemsCount = parseInt(countInput.value, 10) || 1;

    // Lấy danh sách các ngữ pháp chưa học hoặc cần ôn lại
    const unlearnedCandidates = appGrammarData.filter(g => learningStatus[g.id] !== 'learned' && !learnedTodayIds.has(g.id));

    // Ưu tiên các mục cần "Ôn lại"
    const reviewPriorityItems = shuffle(unlearnedCandidates.filter(g => learningStatus[g.id] === 'review'));
    const otherNewItems = shuffle(unlearnedCandidates.filter(g => learningStatus[g.id] !== 'review'));

    // Chọn ra các mục mới cho phiên này
    qlNewItems = [...reviewPriorityItems, ...otherNewItems].slice(0, newItemsCount);

    if (qlIsReviewSession) {
      // Chế độ ôn tập: kết hợp mục mới và mục đã học hôm nay
      const learnedTodayItems = Array.from(learnedTodayIds)
        .map(id => appGrammarData.find(g => g.id === id))
        .filter(Boolean);
      
      // Đảm bảo không có mục nào bị trùng lặp
      const combinedItems = [...qlNewItems, ...learnedTodayItems];
      const uniqueIds = new Set();
      qlSessionData = combinedItems.filter(item => {
          if (uniqueIds.has(item.id)) return false;
          uniqueIds.add(item.id);
          return true;
      });

      if (qlNewItems.length === 0 && learnedTodayItems.length > 0) {
        showToast("All new items learned! This session will be for review.", 'success');
      }
    } else {
      // Chế độ học mới: chỉ bao gồm các mục mới
      qlSessionData = qlNewItems;
    }

    if (qlSessionData.length === 0) {
        showToast("Congratulations! You've learned all grammar points.", 'success');
        return;
    }
    
    qlCurrentIndex = 0;
    qlCurrentStep = 0;
    quickLearnContainer.style.display = 'block';
    startQuickLearnBtn.style.display = 'none';
    nextSessionOptions.style.display = 'none';

    loadQuickLearnStep();
  }

  startQuickLearnBtn.addEventListener('click', startLearnSession);
  startNextSessionBtn.addEventListener('click', startLearnSession);

  function updateQLProgress() {
    const totalItems = qlSessionData.length * 4; // 5 grammars * 4 steps
    const completedItems = qlCurrentStep * qlSessionData.length + qlCurrentIndex;
    const percentage = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
    qlProgressBar.style.width = `${percentage}%`;
    qlProgressBar.textContent = `Progress: ${completedItems} / ${totalItems}`;
  }

  function loadQuickLearnStep() {
    updateQLProgress();
    qlStepContainers.forEach(c => c.style.display = 'none');
    qlNextBtn.disabled = false;

    if (!qlSessionData[qlCurrentIndex]) return; // Guard against invalid index

    const currentGrammar = qlSessionData[qlCurrentIndex];

    // Trong phiên ôn tập, nếu mục này không phải là mục mới và đang ở bước 1, 2 -> bỏ qua
    if (qlIsReviewSession) {
      const isNew = qlNewItems.some(item => item.id === currentGrammar.id);
      if (!isNew && qlCurrentStep < 2) {
          qlNextBtn.click(); // Tự động chuyển
          return;
      }
    }

    // Xác định số lượng mục và tiêu đề cho từng bước
    const newItemsCount = qlNewItems.length;
    const totalSessionItemsCount = qlSessionData.length;
    const stepTitles = [
        `Step 1: View Details (${qlCurrentIndex + 1}/${newItemsCount})`,
        `Step 2: Multiple Choice (${qlCurrentIndex + 1}/${newItemsCount})`,
        `Step 3: Pair Match`,
        `Step 4: Fill in the Blank (${qlCurrentIndex + 1}/${totalSessionItemsCount})`
    ];
    qlStepTitle.textContent = stepTitles[qlCurrentStep];

    switch (qlCurrentStep) {
        case 0: { // View Details
            qlStep1View.style.display = 'block';
            qlStep1View.innerHTML = `
                <h3>${currentGrammar.structure}</h3>
                <p><strong>Meaning:</strong> ${currentGrammar.meaning}</p>
                <p><strong>Explanation:</strong> ${currentGrammar.explanation}</p>
                <p><strong>Examples:</strong></p>
                <ul>${currentGrammar.examples.map(ex => `<li><div class="jp-example">${ex.jp}</div><div class="vi-example">${ex.vi}</div></li>`).join('')}</ul>
                <p><strong>Note:</strong> ${currentGrammar.note || 'None'}</p>
            `;
            // Thêm nút Sửa
            const editBtn = document.createElement('button');
            editBtn.textContent = 'Edit Details';
            editBtn.onclick = () => showGrammarDetails(currentGrammar.id);
            qlStep1View.appendChild(editBtn);
            break;
        }
        case 1: { // Multiple Choice
            qlStep2MC.style.display = 'block';
            document.getElementById('ql-mc-meaning').innerText = currentGrammar.meaning;
            const options = shuffle([...appGrammarData]).filter(g => g.id !== currentGrammar.id).slice(0, 3);
            options.push(currentGrammar);
            shuffle(options);
            const optionsContainer = document.getElementById('ql-mc-options');
            optionsContainer.innerHTML = '';
            options.forEach(opt => {
                const btn = document.createElement('button');
                btn.textContent = opt.structure;
                btn.onclick = () => {
                    optionsContainer.querySelectorAll('button').forEach(b => b.disabled = true);
                    if (opt.id === currentGrammar.id) {
                        btn.style.backgroundColor = 'lightgreen';
                    } else {
                        btn.style.backgroundColor = 'lightcoral';
                    }
                };
                optionsContainer.appendChild(btn);
            });
            break;
        }
        case 2: { // Pair Match
            qlStep3Match.style.display = 'block';
            const board = document.getElementById('ql-match-board');
            const hintBtn = document.getElementById('ql-match-hint-btn');
            board.innerHTML = '';
            const structures = qlSessionData.map(item => ({ id: item.id, text: item.structure, type: 'structure' }));
            const meanings = qlSessionData.map(item => ({ id: item.id, text: item.meaning, type: 'meaning' }));
            const allCards = shuffle([...structures, ...meanings]);
            let selected = { structure: null, meaning: null };
            let correctCount = 0;
            allCards.forEach(cardData => {
                const cardEl = document.createElement('div');
                cardEl.className = 'card';
                cardEl.textContent = cardData.text;
                cardEl.dataset.id = cardData.id;
                cardEl.dataset.type = cardData.type;
                cardEl.onclick = () => {
                    if (cardEl.classList.contains('correct')) return;
                    if (selected[cardData.type]) selected[cardData.type].classList.remove('selected');
                    selected[cardData.type] = cardEl;
                    cardEl.classList.add('selected');
                    if (selected.structure && selected.meaning) {
                        if (selected.structure.dataset.id === selected.meaning.dataset.id) {
                            selected.structure.classList.add('correct');
                            selected.meaning.classList.add('correct');
                            correctCount++;
                            if (correctCount === qlSessionData.length) qlNextBtn.disabled = false;
                        } else {
                            selected.structure.classList.add('incorrect');
                            selected.meaning.classList.add('incorrect');
                            setTimeout(() => {
                                selected.structure.classList.remove('incorrect');
                                selected.meaning.classList.remove('incorrect');
                            }, 500);
                        }
                        selected.structure.classList.remove('selected');
                        selected.meaning.classList.remove('selected');
                        selected = { structure: null, meaning: null };
                    }
                };
                board.appendChild(cardEl);
            });
            qlNextBtn.disabled = true;

            // Logic cho nút Gợi ý
            hintBtn.onclick = () => {
                // Tìm một cặp chưa được ghép đúng
                const unsolvedCards = Array.from(board.querySelectorAll('.card:not(.correct)'));
                if (unsolvedCards.length === 0) return;

                const firstUnsolvedId = unsolvedCards[0].dataset.id;
                const hintStructureCard = board.querySelector(`.card[data-id="${firstUnsolvedId}"][data-type="structure"]`);
                const hintMeaningCard = board.querySelector(`.card[data-id="${firstUnsolvedId}"][data-type="meaning"]`);

                if (hintStructureCard && hintMeaningCard) {
                    // Làm nổi bật cặp gợi ý trong 2 giây
                    hintStructureCard.style.backgroundColor = '#ffc107'; // Màu vàng
                    hintMeaningCard.style.backgroundColor = '#ffc107';
                    setTimeout(() => {
                        hintStructureCard.style.backgroundColor = ''; // Trở về màu cũ
                        hintMeaningCard.style.backgroundColor = '';
                    }, 2000);
                }
            };
            break;
        }
        case 3: { // Fill Blank
            qlStep4Fill.style.display = 'block';
            document.getElementById('ql-fill-meaning').innerText = currentGrammar.meaning;
            const input = document.getElementById('ql-fill-input');
            const skipBtn = document.getElementById('ql-skip-btn');
            const hintBtn = document.getElementById('ql-fill-hint-btn');
            const resultP = document.getElementById('ql-fill-result');
            const statsSpan = document.getElementById('ql-fill-stats');
            input.value = '';
            resultP.textContent = '';
            statsSpan.textContent = '';
            qlNextBtn.disabled = true;

            hintBtn.onclick = () => {
                const answer = currentGrammar.structure;
                const currentVal = input.value;
                const remaining = answer.split('').filter(char => !currentVal.includes(char));
                if (remaining.length > 0) {
                    input.value += remaining[Math.floor(Math.random() * remaining.length)];
                }
            };
            input.oninput = () => {
                const userInput = input.value.trim();
                const mainAnswer = getValidAnswers(currentGrammar.structure)[0] || currentGrammar.structure;

                // Tính và hiển thị độ tương đồng
                const similarity = calculateSimilarity(userInput, mainAnswer);
                const percentage = Math.round(similarity * 100);
                statsSpan.textContent = `Match: ${percentage}%`;


                const validAnswers = getValidAnswers(currentGrammar.structure);

                if (validAnswers.includes(userInput)) {
                    resultP.textContent = 'Chính xác!';
                    resultP.style.color = 'green';
                    input.disabled = true;
                    hintBtn.disabled = true;
                    skipBtn.disabled = true;
                    // Tự động chuyển sang câu tiếp theo sau 1 giây
                    setTimeout(() => {
                        // Tạm thời kích hoạt nút để cho phép click lập trình
                        qlNextBtn.disabled = false; 
                        qlNextBtn.click();
                    }, 1000);
                }
            };
            input.disabled = false;
            skipBtn.disabled = false;
            hintBtn.disabled = false;
            // Tự động focus vào ô input để người dùng có thể gõ ngay
            input.focus();

            skipBtn.onclick = () => {
                // Đánh dấu là đã bỏ qua
                wasSkippedInQuickLearn = true;

                // Chuyển câu hỏi này xuống cuối danh sách của phiên học
                const skippedItem = qlSessionData.splice(qlCurrentIndex, 1)[0];
                qlSessionData.push(skippedItem);

                // Hiển thị modal chi tiết và ví dụ
                showGrammarDetails(skippedItem.id);
            };
            break;
        }
    }
  }

  /**
   * Tính toán tỷ lệ tương đồng giữa hai chuỗi (dựa trên LCS - Longest Common Subsequence).
   * @param {string} str1 Chuỗi thứ nhất.
   * @param {string} str2 Chuỗi thứ hai.
   * @returns {number} Tỷ lệ tương đồng từ 0 đến 1.
   */
  function calculateSimilarity(str1, str2) {
      if (!str1 || !str2) return 0;
      const m = str1.length;
      const n = str2.length;
      const dp = Array(m + 1).fill(0).map(() => Array(n + 1).fill(0));

      for (let i = 1; i <= m; i++) {
          for (let j = 1; j <= n; j++) {
              if (str1[i - 1] === str2[j - 1]) {
                  dp[i][j] = dp[i - 1][j - 1] + 1;
              } else {
                  dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
              }
          }
      }
      return dp[m][n] / Math.max(m, n);
  }
  /**
   * Phân tích chuỗi cấu trúc để lấy ra các câu trả lời hợp lệ.
   * Ví dụ: "よりしかたがない（～より仕方がない）" -> ["よりしかたがない", "より仕方がない"]
   * @param {string} structureString Chuỗi cấu trúc ngữ pháp.
   * @returns {string[]} Mảng các câu trả lời hợp lệ.
   */
  function getValidAnswers(structureString) {
      const answers = new Set();
      const originalTrimmed = structureString.trim();
      answers.add(originalTrimmed);

      // Regex để tìm phần hiragana và phần trong ngoặc
      const hiraganaKanjiRegex = /(.+?)\s*（(.*?)）/;
      const match = originalTrimmed.match(hiraganaKanjiRegex);

      if (match) {
          // Phần 1: Hiragana (trước ngoặc)
          answers.add(match[1].trim());

          // Phần 2: Kanji/hỗn hợp (trong ngoặc), loại bỏ ký tự '～'
          const kanjiPart = match[2].replace(/～/g, '').trim();
          answers.add(kanjiPart);
      }
      return Array.from(answers).filter(Boolean); // Lọc ra các chuỗi rỗng
  }

  qlNextBtn.addEventListener('click', () => {
    qlCurrentIndex++;

    // Xác định số lượng mục cho bước hiện tại
    const itemsForThisStep = (qlIsReviewSession && qlCurrentStep < 2) ? qlNewItems : qlSessionData;

    // Nếu đã xong 1 bước cho tất cả ngữ pháp (hoặc nếu là bước ghép cặp)
    if (qlCurrentIndex >= itemsForThisStep.length || qlCurrentStep === 2) {
      qlCurrentIndex = 0; 
      qlCurrentStep++;    
    }
    
    // Nếu đã hoàn thành tất cả các bước
    if (qlCurrentStep >= 4) {
      // Đánh dấu tất cả là đã học
      // Chỉ đánh dấu các mục mới là "learned"
      qlNewItems.forEach(grammar => {
        learningStatus[grammar.id] = 'learned';
      });
      // Thêm các ID vừa học xong vào danh sách đã học trong ngày
      const justLearnedIds = qlSessionData.map(g => g.id);
      justLearnedIds.forEach(id => learnedTodayIds.add(id));

      // Cập nhật và lưu tiến độ mục tiêu hàng ngày
      let goalData = JSON.parse(localStorage.getItem(DAILY_GOAL_KEY)) || {};
      goalData.date = getTodayString();
      goalData.learnedIds = Array.from(learnedTodayIds);
      localStorage.setItem(DAILY_GOAL_KEY, JSON.stringify(goalData));
      updateDailyGoalProgress();

      showToast(`Session complete! You learned ${qlSessionData.length} items.`, 'success');

      localStorage.setItem(LEARNING_STATUS_KEY, JSON.stringify(learningStatus));
      syncLearningStatusToFirebase(); // Đồng bộ trạng thái học lên Firebase

      quickLearnContainer.style.display = 'none';
      // Hiển thị các lựa chọn cho phiên tiếp theo thay vì nút bắt đầu mặc định
      startQuickLearnBtn.style.display = 'none';
      nextSessionOptions.style.display = 'block';

      applyFiltersAndSort(); // Render lại danh sách để cập nhật trạng thái
      return;
    }
    loadQuickLearnStep();
  });

  // --- Logic cho nút cuộn lên đầu trang ---
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

  // Initial render of the list
  applyFiltersAndSort();
  loadAndDisplayDailyGoal();
}

// Biến toàn cục để cache dữ liệu, tránh tải lại không cần thiết
let cachedData = null;

/**
 * Tải tất cả dữ liệu cần thiết từ Firebase (grammar, stats, learningStatus).
 * Sử dụng cơ chế cache để chỉ tải từ Firebase một lần.
 * @param {boolean} forceRefresh - Nếu true, sẽ bỏ qua cache và tải lại từ Firebase.
 * @returns {Promise<{appGrammarData: Array, grammarStats: Object, learningStatus: Object}>}
 */
export async function loadSharedData(forceRefresh = false) {
  if (cachedData && !forceRefresh) {
    console.log("Using cached data.");
    return cachedData;
  }

  console.log("Fetching data from Firebase...");
  let appGrammarData = [];
  let grammarStats = {};
  let learningStatus = {};

  try {
    // Tải dữ liệu ngữ pháp từ Firebase
    const querySnapshot = await getDocs(collection(db, "grammar"));
    const firebaseData = [];
    querySnapshot.forEach((doc) => {
      firebaseData.push({ id: doc.id, ...doc.data() });
    });

    if (firebaseData.length > 0) {
      appGrammarData = firebaseData.sort((a, b) => a.id - b.id); // Sắp xếp theo ID
    } else {
      // Không có dữ liệu trên Firebase, sử dụng dữ liệu từ data.js.
      appGrammarData = [...grammarData];
      console.log("No grammar data on Firebase. Loaded default data.");
    }
  } catch (e) {
    console.error("Error loading grammar data from Firebase. Using default data.", e);
    appGrammarData = [...grammarData];
  }

  // Load stats and learning status from Firebase
  try {
    const statsDocRef = doc(db, "stats", FIREBASE_STATS_DOC_ID);
    const statsDocSnap = await getDoc(statsDocRef);
    if (statsDocSnap.exists()) {
      grammarStats = statsDocSnap.data();
    } else {
      console.log("No grammar stats found on Firebase. Initializing empty stats.");
    }

    const learningStatusDocRef = doc(db, "learningStatus", FIREBASE_LEARNING_STATUS_DOC_ID);
    const learningStatusDocSnap = await getDoc(learningStatusDocRef);
    if (learningStatusDocSnap.exists()) {
      learningStatus = learningStatusDocSnap.data();
    } else {
      console.log("No learning status found on Firebase. Initializing empty status.");
    }
  } catch (e) {
    console.error("Error loading stats/learning status from Firebase.", e);
  }

  cachedData = { appGrammarData, grammarStats, learningStatus };
  return cachedData;
}

// Chỉ chạy logic của trang chủ nếu chúng ta đang ở trên trang index.html
if (document.getElementById('grammar-list')) {
  document.addEventListener("DOMContentLoaded", async () => {
    const loadingOverlay = document.getElementById('loading-overlay');
    const { appGrammarData: data, grammarStats: stats, learningStatus: status } = await loadSharedData();
    initializeHomePage(data, stats, status);
    // Hide loading overlay
    if (loadingOverlay) loadingOverlay.classList.add('hidden');
  });
}