import { db } from './firebase-init.js';
import { grammarData as defaultGrammarData } from './data.js';
import { showToast, shuffle } from './utils.js';
import { collection, getDocs, writeBatch, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

const FIREBASE_STATS_DOC_ID = "userStats";
const FIREBASE_LEARNING_STATUS_DOC_ID = "userLearningStatus";
const FIREBASE_DAILY_GOAL_DOC_ID = "userDailyGoal"; // Thêm hằng số mới

// --- Local Storage Keys ---
const DATA_STORAGE_KEY = "jlptGrammarData";
const STATS_STORAGE_KEY = "grammarStats";
const LEARNING_STATUS_KEY = "learningStatus";
const DAILY_GOAL_KEY = "dailyGoal";

function initializeHomePage(initialData, initialStats, initialLearningStatus, initialDailyGoal) {

  // --- Gom nhóm các phần tử DOM ---
  const dom = {
    // Danh sách chính
    grammarListUl: document.getElementById("grammar-ul"),
    addNewGrammarBtn: document.getElementById("add-new-grammar-btn"),
    sortOptions: document.getElementById("sort-options"),
    filterStatus: document.getElementById("filter-status"),
    searchInput: document.getElementById("search-input"),

    // Quản lý dữ liệu
    fileInput: document.getElementById("word-file-input"),
    exportJsonBtn: document.getElementById("export-json-btn"),
    importJsonInput: document.getElementById("import-json-input"),
    clearStorageButton: document.getElementById("clear-storage-button"),

    // Modal chi tiết/sửa
    modal: document.getElementById("grammar-modal"),
    closeModalButton: document.querySelector(".close-button"),
    modalViewMode: document.getElementById("modal-view-mode"),
    modalEditMode: document.getElementById("modal-edit-mode"),
    editButton: document.getElementById("modal-edit-btn"),
    deleteButton: document.getElementById("modal-delete-btn"),
    saveButton: document.getElementById("modal-save-btn"),
    cancelButton: document.getElementById("modal-cancel-btn"),

    // Mục tiêu hàng ngày
    dailyGoalInput: document.getElementById('daily-goal-input'),
    learnedTodayCountSpan: document.getElementById('learned-today-count'),
    dailyGoalTargetSpan: document.getElementById('daily-goal-target'),
    dailyGoalProgressBar: document.getElementById('daily-goal-progress-bar'),
    learnedTodayListDiv: document.getElementById('learned-today-list'),

    // Học nhanh (Quick Learn)
    startQuickLearnBtn: document.getElementById('start-quick-learn-btn'),
    nextSessionOptions: document.getElementById('next-session-options'),
    startNextSessionBtn: document.getElementById('start-next-session-btn'),
    quickLearnContainer: document.getElementById('quick-learn-container'),
    qlProgressBar: document.getElementById('quick-learn-progress-bar'),
    qlStepTitle: document.getElementById('quick-learn-step-title'),
    qlNextBtn: document.getElementById('ql-next-btn'),
    qlStepContainers: document.querySelectorAll('.ql-step-container'),
    qlStep1View: document.getElementById('ql-step1-view'),
    qlStep2MC: document.getElementById('ql-step2-mc'),
    qlStep3Match: document.getElementById('ql-step3-match'),
    qlStep4Fill: document.getElementById('ql-step4-fill'),

    // Scroll to top button
    scrollToTopBtn: document.getElementById("scroll-to-top-btn"),
  };

  // Biến để lưu ID của ngữ pháp đang được xem/sửa
  let currentEditingId = null;
  let wasSkippedInQuickLearn = false; // Flag để xử lý việc bỏ qua câu hỏi

  
  // Global variables for grammar data
  let appGrammarData = initialData || [];
  let grammarStats = initialStats || {};
  let learningStatus = initialLearningStatus || {};
  let dailyGoalData = initialDailyGoal || {};

  // Hàm để áp dụng các lớp CSS cho các nút để có giao diện đồng bộ
  function applyButtonStyles() {
    // Nút hành động chính
    dom.addNewGrammarBtn?.classList.add('btn', 'btn-primary');
    dom.saveButton?.classList.add('btn', 'btn-primary');
    dom.startQuickLearnBtn?.classList.add('btn', 'btn-primary');
    dom.startNextSessionBtn?.classList.add('btn', 'btn-primary');
    dom.qlNextBtn?.classList.add('btn', 'btn-primary');

    // Nút hành động phụ
    dom.editButton?.classList.add('btn', 'btn-secondary');
    dom.cancelButton?.classList.add('btn', 'btn-secondary');
    dom.exportJsonBtn?.classList.add('btn', 'btn-secondary');
    document.querySelector('label[for="import-json-input"]')?.classList.add('btn', 'btn-secondary');
    document.querySelector('label[for="word-file-input"]')?.classList.add('btn', 'btn-secondary');

    // Nút hành động nguy hiểm
    dom.deleteButton?.classList.add('btn', 'btn-danger');
    dom.clearStorageButton?.classList.add('btn', 'btn-danger');
  }
  
  // Global variable to store IDs learned today, initialized here
  let learnedTodayIds = new Set();

  function renderGrammarList(data) {
    dom.grammarListUl.innerHTML = ""; // Clear old list
    data.forEach((grammar) => {
      const li = document.createElement("li");
      const button = document.createElement("button");
      button.className = 'btn btn-secondary btn-sm'; // Áp dụng style mới
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
      dom.grammarListUl.appendChild(li);
    });
  }

  dom.fileInput.addEventListener("change", function (event) {
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
        id: String(index + 1), // Chuyển ID thành chuỗi
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
      // showToast("Data successfully synced to Firebase!", 'success');
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
    dom.modalViewMode.style.display = "block";
    dom.modalEditMode.style.display = "none";
    // Đặt lại trạng thái các nút ở footer khi mở modal
    dom.editButton.style.display = "inline-block";
    dom.deleteButton.style.display = "inline-block";
    dom.saveButton.style.display = "none";
    dom.cancelButton.style.display = "none";

    document.body.classList.add("modal-open");
    dom.modal.style.display = "block";
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
      const newId = appGrammarData.length > 0 ? Math.max(...appGrammarData.map(g => Number(g.id))) + 1 : 1;
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
    dom.modal.style.display = "block";
  }

  /**
   * Xử lý sự kiện nhấn nút Cancel trong modal.
   * Nếu đang thêm mới, đóng modal. Nếu đang sửa, quay lại chế độ xem.
   */
  function handleCancelClick() {
    if (currentEditingId === 'new') {
      closeModal();
    } else {
      switchToViewMode();
    }
  }

  function closeModal() {
    document.body.classList.remove("modal-open");
    dom.modal.style.display = "none";
    if (dom.quickLearnContainer.style.display === 'block') {
      if (currentEditingId !== 'new') {
        loadQuickLearnStep(); // Tải lại câu hiện tại sau khi sửa hoặc bỏ qua
      }
    }
    currentEditingId = null;
  }

  function switchToEditMode() {
    dom.modalViewMode.style.display = "none";
    dom.modalEditMode.style.display = "block";
    // Ẩn/hiện các nút ở footer
    dom.editButton.style.display = "none";
    dom.deleteButton.style.display = "none";
    dom.saveButton.style.display = "inline-block";
    dom.cancelButton.style.display = "inline-block";
  }

  function switchToViewMode() {
    // Chuyển về chế độ xem
    dom.modalEditMode.style.display = "none";
    dom.modalViewMode.style.display = "block";
    // Đặt lại các nút ở footer
    dom.editButton.style.display = "inline-block";
    dom.deleteButton.style.display = "inline-block";
    dom.saveButton.style.display = "none";
    dom.cancelButton.style.display = "none";
  }

  function initializeModal() {
    dom.closeModalButton.addEventListener("click", closeModal);
    window.addEventListener("click", (event) => {
      if (event.target == dom.modal) {
        closeModal();
      }
    });
    dom.editButton.addEventListener("click", switchToEditMode);
    dom.saveButton.addEventListener("click", saveGrammarChanges);
    dom.deleteButton.addEventListener("click", deleteCurrentGrammar);
    dom.cancelButton.addEventListener("click", handleCancelClick);
    dom.addNewGrammarBtn.addEventListener("click", openModalForNewGrammar);
  }

  function applyFiltersAndSort() {
    let filteredData = [...appGrammarData];

    // 1. Lọc theo trạng thái
    // 1. Lọc theo từ khóa tìm kiếm
    const searchTerm = dom.searchInput ? dom.searchInput.value.toLowerCase().trim() : "";
    if (searchTerm && dom.searchInput) {
      filteredData = filteredData.filter(g =>
        g.structure.toLowerCase().includes(searchTerm) ||
        g.meaning.toLowerCase().includes(searchTerm) ||
        (g.explanation && g.explanation.toLowerCase().includes(searchTerm)) ||
        (g.note && g.note.toLowerCase().includes(searchTerm))
      );
    }


    // 2. Lọc theo trạng thái
    const filterValue = dom.filterStatus ? dom.filterStatus.value : 'all';
    if (dom.filterStatus && filterValue !== 'all') {
      filteredData = filteredData.filter(g => {
        const status = learningStatus[g.id];
        if (filterValue === 'learned') return status === 'learned'; // Filter: Learned
        if (filterValue === 'review') return status === 'review';   // Filter: Review
        if (filterValue === 'unlearned') return !status;          // Filter: Unlearned
        return true;
      });
    }

    // 2. Sắp xếp
    // 3. Sắp xếp
    const sortBy = dom.sortOptions.value;
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
    // 4. Render lại danh sách
    renderGrammarList(filteredData);
  }

  dom.sortOptions?.addEventListener("change", applyFiltersAndSort);
  dom.filterStatus?.addEventListener("change", applyFiltersAndSort);
  dom.searchInput?.addEventListener("input", applyFiltersAndSort);

  // --- Logic cho Quản lý Dữ liệu ---

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

  function initializeDataManagement() {
    dom.exportJsonBtn.addEventListener("click", exportToJson);
    dom.importJsonInput.addEventListener("change", importFromJson);

    dom.clearStorageButton.addEventListener("click", function () {
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
  }

  function loadAndDisplayDailyGoal() {
    const today = getTodayString();

    // Nếu sang ngày mới, reset learnedIds
    if (dailyGoalData.date !== today) {
      dailyGoalData.date = today;
      dailyGoalData.learnedIds = [];
      // Đồng bộ trạng thái reset của ngày mới lên Firebase
      syncDailyGoalToFirebase(dailyGoalData);
    }

    const goal = dailyGoalData.goal || 5;
    const learnedIds = new Set(dailyGoalData.learnedIds || []);

    dom.dailyGoalInput.value = goal;
    learnedTodayIds = learnedIds; // Cập nhật biến toàn cục

    localStorage.setItem(DAILY_GOAL_KEY, JSON.stringify(dailyGoalData));
    updateDailyGoalProgress();

    // Nếu đã học ít nhất 1 ngữ pháp hôm nay, hiển thị tùy chọn phiên tiếp theo
    if (learnedTodayIds.size > 0) {
      dom.startQuickLearnBtn.style.display = 'none';
      dom.nextSessionOptions.style.display = 'block';
    }
  }

  function updateDailyGoalProgress() {
    const goal = parseInt(dom.dailyGoalInput.value, 10);
    const learnedCount = learnedTodayIds.size;
    const percentage = goal > 0 ? Math.min(Math.round((learnedCount / goal) * 100), 100) : 0;

    dom.learnedTodayCountSpan.textContent = learnedCount;
    dom.dailyGoalTargetSpan.textContent = goal;
    dom.dailyGoalProgressBar.style.width = `${percentage}%`;
    dom.dailyGoalProgressBar.textContent = `${percentage}%`;

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
    dom.learnedTodayListDiv.innerHTML = ''; // Xóa nội dung cũ

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
            dom.learnedTodayListDiv.appendChild(badge);
        });
    } else {
        dom.learnedTodayListDiv.innerHTML = '<span style="color: #888;">No grammar yet.</span>';
    }
  }

  function initializeDailyGoal() {
    dom.dailyGoalInput.addEventListener('change', () => {
      const newGoal = parseInt(dom.dailyGoalInput.value, 10);
      dailyGoalData.goal = newGoal;
      localStorage.setItem(DAILY_GOAL_KEY, JSON.stringify(dailyGoalData)); // Vẫn lưu local để truy cập nhanh
      updateDailyGoalProgress();
      syncDailyGoalToFirebase(dailyGoalData); // Đồng bộ thay đổi lên Firebase
      showToast(`Daily goal updated to ${newGoal}.`, 'success');
    });
  }
  // ==================================================
  // LOGIC CHO QUICK LEARN
  // =================================================
  const QUICK_LEARN_DAILY_KEY = "quickLearnDailySelection";

  let qlSessionData = [];
  let qlCurrentIndex = 0; // Index for grammar item (0-4)
  let qlCurrentStep = 0; // Index for learning step (0-3)
  let qlNewItems = []; // Mảng chứa các mục mới trong phiên review
  let qlIsReviewSession = false; // Cờ đánh dấu phiên ôn tập

  // ==================================================
  // REFACTORED QUICK LEARN STEP DEFINITIONS
  // ==================================================
  const quickLearnSteps = [
    { // Step 1: View Details
      title: (currentIndex, totalItems) => `Step 1: View Details (${currentIndex + 1}/${totalItems})`,
      isGroupActivity: false,
      isNewOnly: true,
      setup: (currentGrammar) => {
        const container = dom.qlStep1View;
        container.innerHTML = `
          <div class="ql-detail-card">
              <h3>${currentGrammar.structure}</h3>
              <p><strong>Meaning:</strong> ${currentGrammar.meaning}</p>
              <p><strong>Explanation:</strong> ${currentGrammar.explanation || 'N/A'}</p>
              <div class="ql-examples">
                  <p><strong>Examples:</strong></p>
                  <ul>${currentGrammar.examples.map(ex => `<li><div class="jp-example">${ex.jp}</div><div class="vi-example">${ex.vi}</div></li>`).join('') || '<li>No examples available.</li>'}</ul>
              </div>
              <p><strong>Note:</strong> ${currentGrammar.note || 'None'}</p>
              <button id="ql-edit-details-btn" class="btn-secondary">Edit Details</button>
          </div>
        `;
        container.querySelector('#ql-edit-details-btn').onclick = () => showGrammarDetails(currentGrammar.id);
        return container;
      }
    },
    { // Step 2: Multiple Choice
      title: (currentIndex, totalItems) => `Step 2: Multiple Choice (${currentIndex + 1}/${totalItems})`,
      isGroupActivity: false,
      isNewOnly: true,
      setup: (currentGrammar) => {
        const container = dom.qlStep2MC;
        document.getElementById('ql-mc-meaning').innerText = currentGrammar.meaning;
        const options = shuffle([...appGrammarData]).filter(g => g.id !== currentGrammar.id).slice(0, 3);
        options.push(currentGrammar);
        shuffle(options);
        const optionsContainer = document.getElementById('ql-mc-options');
        optionsContainer.innerHTML = '';
        options.forEach(opt => {
            const btn = document.createElement('button');
            btn.className = 'ql-mc-option btn';
            btn.textContent = opt.structure;
            btn.onclick = () => {
                optionsContainer.querySelectorAll('button').forEach(b => b.disabled = true);
                if (opt.id === currentGrammar.id) {
                    btn.classList.add('correct');
                } else {
                    btn.classList.add('incorrect');
                    const correctBtn = Array.from(optionsContainer.querySelectorAll('button')).find(b => b.textContent === currentGrammar.structure);
                    if (correctBtn) correctBtn.classList.add('correct');
                }
            };
            optionsContainer.appendChild(btn);
        });
        return container;
      }
    },
    { // Step 3: Pair Match
      title: () => `Step 3: Pair Match`,
      isGroupActivity: true,
      isNewOnly: false,
      setup: (currentGrammar, sessionData) => {
        const container = dom.qlStep3Match;
        const board = document.getElementById('ql-match-board');        
        const hintBtn = document.getElementById('ql-match-hint-btn');
        board.innerHTML = '';
        const structures = sessionData.map(item => ({ id: item.id, text: item.structure, type: 'structure' }));
        const meanings = sessionData.map(item => ({ id: item.id, text: item.meaning, type: 'meaning' }));
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
                        if (correctCount === sessionData.length) dom.qlNextBtn.disabled = false;
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
        dom.qlNextBtn.disabled = true;
        hintBtn.onclick = () => {
            const unsolvedCards = Array.from(board.querySelectorAll('.card:not(.correct)'));
            if (unsolvedCards.length === 0) return;
            const firstUnsolvedId = unsolvedCards[0].dataset.id;
            const hintPair = board.querySelectorAll(`.card[data-id="${firstUnsolvedId}"]`);
            hintPair.forEach(card => card.style.backgroundColor = '#ffc107');
            setTimeout(() => hintPair.forEach(card => card.style.backgroundColor = ''), 2000);
        };
        return container;
      }
    },
    { // Step 4: Fill in the Blank
      title: (currentIndex, totalItems) => `Step 4: Fill in the Blank (${currentIndex + 1}/${totalItems})`,
      isGroupActivity: false,
      isNewOnly: false, // Áp dụng cho cả mục mới và mục ôn tập
      setup: (currentGrammar) => {
        const container = dom.qlStep4Fill;
        document.getElementById('ql-fill-meaning').innerText = currentGrammar.meaning;
        const input = document.getElementById('ql-fill-input');
        const skipBtn = document.getElementById('ql-skip-btn');
        const hintBtn = document.getElementById('ql-fill-hint-btn');
        const resultP = document.getElementById('ql-fill-result');
        const statsSpan = document.getElementById('ql-fill-stats');

        // Reset trạng thái cho câu hỏi mới
        input.disabled = false;
        hintBtn.disabled = false;
        skipBtn.disabled = false;

        input.value = '';
        resultP.textContent = '';
        statsSpan.textContent = '';
        dom.qlNextBtn.disabled = true;

        hintBtn.classList.add('btn', 'btn-secondary');
        skipBtn.classList.add('btn', 'btn-warning');

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
            const similarity = calculateSimilarity(userInput, mainAnswer);
            statsSpan.textContent = `Match: ${Math.round(similarity * 100)}%`;

            if (getValidAnswers(currentGrammar.structure).includes(userInput)) {
                resultP.textContent = 'Chính xác!';
                resultP.style.color = 'green';
                input.disabled = true;
                hintBtn.disabled = true;
                skipBtn.disabled = true;
                dom.qlNextBtn.disabled = false; // Kích hoạt nút Next
                setTimeout(() => dom.qlNextBtn.click(), 1000); // Tự động chuyển
            }
        };

        skipBtn.onclick = () => handleSkipQuestion(currentGrammar.id);
        return container;
      }
    }
  ];

  /**
   * Xử lý việc bỏ qua một câu hỏi trong Quick Learn.
   * Di chuyển câu hỏi bị bỏ qua xuống cuối hàng đợi và hiển thị chi tiết.
   * @param {number} grammarId - ID của ngữ pháp bị bỏ qua.
   */
  function handleSkipQuestion(grammarId) {
    const itemToSkip = qlSessionData.splice(qlCurrentIndex, 1)[0];
    if (itemToSkip) {
      qlSessionData.push(itemToSkip);
    }
    showGrammarDetails(grammarId);
  }

  function getTodayString() {
    return new Date().toISOString().slice(0, 10);
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
    dom.quickLearnContainer.style.display = 'block';
    dom.startQuickLearnBtn.style.display = 'none';
    dom.nextSessionOptions.style.display = 'none';

    loadQuickLearnStep();
  }

  function initializeQuickLearn() {
    dom.startQuickLearnBtn.addEventListener('click', startLearnSession);
    dom.startNextSessionBtn.addEventListener('click', startLearnSession);
  }

  function updateQLProgress() {
    const totalItems = qlSessionData.length * 4; // 5 grammars * 4 steps
    const completedItems = qlCurrentStep * qlSessionData.length + qlCurrentIndex;
    const percentage = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
    dom.qlProgressBar.style.width = `${percentage}%`;
    dom.qlProgressBar.textContent = `Progress: ${completedItems} / ${totalItems}`;
  }
  
  function loadQuickLearnStep() {
    updateQLProgress();
    // Ẩn container hiện tại một cách mượt mà
    const activeContainer = document.querySelector('.ql-step-container.active');
    if (activeContainer) {
        activeContainer.classList.remove('active');
    }

    // Ẩn tất cả các container để chuẩn bị cho cái tiếp theo
    dom.qlStepContainers.forEach(c => c.style.display = 'none'); // Vẫn cần để reset
    dom.qlNextBtn.disabled = false;

    if (!qlSessionData[qlCurrentIndex]) return; // Guard against invalid index

    const currentGrammar = qlSessionData[qlCurrentIndex];

    const currentStepConfig = quickLearnSteps[qlCurrentStep];

    // Trong phiên ôn tập, nếu mục này không phải là mục mới và bước này chỉ dành cho mục mới -> bỏ qua
    if (qlIsReviewSession) {
      const isNew = qlNewItems.some(item => item.id === currentGrammar.id);
      if (!isNew && currentStepConfig && currentStepConfig.isNewOnly) {
          dom.qlNextBtn.click(); // Tự động chuyển
          return;
      }
    }

    // Xác định số lượng mục và tiêu đề cho từng bước
    const itemsForTitle = currentStepConfig.isNewOnly ? qlNewItems : qlSessionData;
    dom.qlStepTitle.textContent = currentStepConfig ? currentStepConfig.title(qlCurrentIndex, itemsForTitle.length) : `Step ${qlCurrentStep + 1}`;

    if (currentStepConfig) {
      const container = currentStepConfig.setup(currentGrammar, qlSessionData);
      // Reset và chuẩn bị hiển thị
      container.style.display = 'block';
      
      // Thêm class 'active' để kích hoạt hiệu ứng fade-in
      setTimeout(() => {
        container.classList.add('active');

        // Lắng nghe sự kiện transition kết thúc để đảm bảo focus hoạt động ổn định
        const onTransitionEnd = () => {
          const inputToFocus = container.querySelector('#ql-fill-input');
          if (inputToFocus) {
            inputToFocus.focus();
          }
          container.removeEventListener('transitionend', onTransitionEnd); // Dọn dẹp listener
        };
        container.addEventListener('transitionend', onTransitionEnd);
      }, 10);
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

  dom.qlNextBtn.addEventListener('click', () => {
    qlCurrentIndex++;

    const currentStepConfig = quickLearnSteps[qlCurrentStep] || {};
    const itemsForThisStep = currentStepConfig.isGroupActivity ? [1] : (currentStepConfig.isNewOnly ? qlNewItems : qlSessionData);

    // Nếu đã xong 1 bước cho tất cả ngữ pháp (hoặc nếu là bước ghép cặp)
    if (qlCurrentIndex >= itemsForThisStep.length) {
      qlCurrentIndex = 0; 
      qlCurrentStep++;    
    }
    
    // Nếu đã hoàn thành tất cả các bước
    if (qlCurrentStep >= quickLearnSteps.length) {
      // Đánh dấu tất cả là đã học
      // Chỉ đánh dấu các mục mới là "learned"
      qlNewItems.forEach(grammar => {
        learningStatus[grammar.id] = 'learned';
      });
      // Thêm các ID vừa học xong vào danh sách đã học trong ngày
      const justLearnedIds = qlSessionData.map(g => g.id);
      justLearnedIds.forEach(id => learnedTodayIds.add(id));

      // Cập nhật và lưu tiến độ mục tiêu hàng ngày
      dailyGoalData.date = getTodayString();
      dailyGoalData.learnedIds = Array.from(learnedTodayIds);
      localStorage.setItem(DAILY_GOAL_KEY, JSON.stringify(dailyGoalData));
      updateDailyGoalProgress();
      syncDailyGoalToFirebase(dailyGoalData); // Đồng bộ tiến độ hàng ngày lên Firebase
      // showToast(`Session complete! You learned ${qlSessionData.length} items.`, 'success');

      localStorage.setItem(LEARNING_STATUS_KEY, JSON.stringify(learningStatus));
      syncLearningStatusToFirebase(learningStatus); // Đồng bộ trạng thái học lên Firebase

      dom.quickLearnContainer.style.display = 'none';
      // Hiển thị các lựa chọn cho phiên tiếp theo thay vì nút bắt đầu mặc định
      dom.startQuickLearnBtn.style.display = 'none';
      dom.nextSessionOptions.style.display = 'block';

      applyFiltersAndSort(); // Render lại danh sách để cập nhật trạng thái
      return;
    }
    loadQuickLearnStep();
  });

  // --- KHỞI TẠO ---
  // Render danh sách ban đầu
  applyFiltersAndSort();
  // Tải và hiển thị mục tiêu hàng ngày
  loadAndDisplayDailyGoal();
  // Áp dụng style cho các nút
  applyButtonStyles();
  // Gán các sự kiện
  initializeDataManagement();
  initializeModal();
  initializeDailyGoal();
  initializeQuickLearn();
}


// Biến toàn cục để cache dữ liệu, tránh tải lại không cần thiết
let cachedData = null;

/**
 * Tải tất cả dữ liệu cần thiết từ Firebase (grammar, stats, learningStatus).
 * Sử dụng cơ chế cache để chỉ tải từ Firebase một lần.
 * @param {boolean} forceRefresh - Nếu true, sẽ bỏ qua cache và tải lại từ Firebase.
 * @returns {Promise<{appGrammarData: Array, grammarStats: Object, learningStatus: Object, dailyGoal: Object}>}
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
  let dailyGoal = {};

  // --- Tải dữ liệu từ Local Storage trước để có thể dùng offline ---
  const localGrammarData = JSON.parse(localStorage.getItem(DATA_STORAGE_KEY));
  const localStats = JSON.parse(localStorage.getItem(STATS_STORAGE_KEY));
  const localLearningStatus = JSON.parse(localStorage.getItem(LEARNING_STATUS_KEY));
  const localDailyGoal = JSON.parse(localStorage.getItem(DAILY_GOAL_KEY));
  try {
    // Tải dữ liệu ngữ pháp từ Firebase
    const querySnapshot = await getDocs(collection(db, "grammar"));
    const firebaseData = [];
    querySnapshot.forEach((doc) => {
      firebaseData.push({ id: doc.id, ...doc.data() });
    });

    if (firebaseData.length > 0) {
      appGrammarData = firebaseData.sort((a, b) => a.id - b.id); // Sắp xếp theo ID
      localStorage.setItem(DATA_STORAGE_KEY, JSON.stringify(appGrammarData)); // Cập nhật cache
    } else if (localGrammarData) {
      appGrammarData = localGrammarData;
      console.log("Loaded grammar data from localStorage.");
    } else {
      // Không có dữ liệu trên Firebase, sử dụng dữ liệu từ data.js.
      appGrammarData = [...defaultGrammarData];
      console.log("No grammar data on Firebase. Loaded default data.");
    }
  } catch (e) {
    // Nếu lỗi mạng, ưu tiên dùng localStorage
    if (localGrammarData) appGrammarData = localGrammarData;
    console.error("Error loading grammar data from Firebase. Using default data.", e);
    if (appGrammarData.length === 0) appGrammarData = [...defaultGrammarData];
  }

  // Load stats and learning status from Firebase
  try {
    const statsDocRef = doc(db, "stats", FIREBASE_STATS_DOC_ID);
    const statsDocSnap = await getDoc(statsDocRef);
    if (statsDocSnap.exists()) {
      grammarStats = statsDocSnap.data();
      localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(grammarStats)); // Cập nhật cache
    } else if (localStats) {
      grammarStats = localStats;
      console.log("Loaded stats from localStorage.");
    } else {
      console.log("No grammar stats found on Firebase. Initializing empty stats.");
    }

    const learningStatusDocRef = doc(db, "learningStatus", FIREBASE_LEARNING_STATUS_DOC_ID);
    const learningStatusDocSnap = await getDoc(learningStatusDocRef);
    if (learningStatusDocSnap.exists()) {
      learningStatus = learningStatusDocSnap.data();
      localStorage.setItem(LEARNING_STATUS_KEY, JSON.stringify(learningStatus)); // Cập nhật cache
    } else if (localLearningStatus) {
      learningStatus = localLearningStatus;
      console.log("Loaded learning status from localStorage.");
    } else {
      console.log("No learning status found on Firebase. Initializing empty status.");
    }

    const dailyGoalDocRef = doc(db, "dailyGoals", FIREBASE_DAILY_GOAL_DOC_ID);
    const dailyGoalDocSnap = await getDoc(dailyGoalDocRef);
    if (dailyGoalDocSnap.exists()) {
      dailyGoal = dailyGoalDocSnap.data();
      localStorage.setItem(DAILY_GOAL_KEY, JSON.stringify(dailyGoal)); // Cập nhật cache
    } else if (localDailyGoal) {
      dailyGoal = localDailyGoal;
      console.log("Loaded daily goal from localStorage.");
    } else {
      console.log("No daily goal found on Firebase. Initializing empty goal data.");
    }
  } catch (e) {
    if (localStats) grammarStats = localStats;
    if (localLearningStatus) learningStatus = localLearningStatus;
    if (localDailyGoal) dailyGoal = localDailyGoal;
    console.error("Error loading stats/learning status from Firebase.", e);
  }

  cachedData = { appGrammarData, grammarStats, learningStatus, dailyGoal };
  return cachedData;
}

/**
 * Đồng bộ đối tượng grammarStats lên Firebase.
 * @param {Object} statsData - Đối tượng thống kê cần lưu.
 */
export async function syncStatsToFirebase(statsData) {
  if (!statsData) {
    console.warn("No stats data to sync.");
    return;
  }
  try {
    const statsDocRef = doc(db, "stats", FIREBASE_STATS_DOC_ID);
    await setDoc(statsDocRef, statsData, { merge: true }); // Dùng merge để không ghi đè toàn bộ
    console.log("✅ Successfully synced stats to Firebase!");
  } catch (error) {
    console.error("❌ Error syncing stats to Firebase:", error);
  }
}

/**
 * Đồng bộ đối tượng learningStatus lên Firebase.
 * @param {Object} statusData - Đối tượng trạng thái học tập cần lưu.
 */
export async function syncLearningStatusToFirebase(statusData) {
  if (!statusData) {
    console.warn("No learning status data to sync.");
    return;
  }
  try {
    const statusDocRef = doc(db, "learningStatus", FIREBASE_LEARNING_STATUS_DOC_ID);
    await setDoc(statusDocRef, statusData);
    console.log("✅ Successfully synced learning status to Firebase!");
  } catch (error) {
    console.error("❌ Error syncing learning status to Firebase:", error);
  }
}

/**
 * Đồng bộ đối tượng dailyGoalData lên Firebase.
 * @param {Object} goalData - Đối tượng mục tiêu hàng ngày cần lưu.
 */
export async function syncDailyGoalToFirebase(goalData) {
  if (!goalData) {
    console.warn("No daily goal data to sync.");
    return;
  }
  try {
    const goalDocRef = doc(db, "dailyGoals", FIREBASE_DAILY_GOAL_DOC_ID);
    await setDoc(goalDocRef, goalData);
    console.log("✅ Successfully synced daily goal to Firebase!");
  } catch (error) {
    console.error("❌ Error syncing daily goal to Firebase:", error);
  }
}

// Chỉ chạy logic của trang chủ nếu chúng ta đang ở trên trang index.html
if (document.getElementById('grammar-list')) {
  document.addEventListener("DOMContentLoaded", async () => {
    const loadingOverlay = document.getElementById('loading-overlay');
    const scrollToTopBtn = document.getElementById("scroll-to-top-btn");
    const { appGrammarData: data, grammarStats: stats, learningStatus: status, dailyGoal: goal } = await loadSharedData();
    initializeHomePage(data, stats, status, goal);
    // Hide loading overlay
    if (loadingOverlay) loadingOverlay.classList.add('hidden');

    // --- Logic cho nút cuộn lên đầu trang ---
    window.onscroll = function() {
      if (document.body.scrollTop > 200 || document.documentElement.scrollTop > 200) {
        scrollToTopBtn.style.display = "block";
      } else {
        scrollToTopBtn.style.display = "none";
      }
    };
    scrollToTopBtn.addEventListener("click", function() {
      window.scrollTo({top: 0, behavior: 'smooth'});
    });
  });
}