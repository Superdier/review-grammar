import { db } from "./firebase-init.js";
import { grammarData as defaultGrammarData } from "./data.js";
import { showToast, shuffle } from "./utils.js";
import {
  collection,
  getDocs,
  writeBatch,
  doc,
  setDoc,
  getDoc,
  deleteDoc,
} from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

// ============= CONSTANTS =============
const STORAGE_KEYS = {
  DATA: "jlptGrammarData",
  STATS: "grammarStats",
  LEARNING_STATUS: "learningStatus",
  DAILY_GOAL: "dailyGoal",
  QL_SESSION: "quickLearnSession",
};

const FIREBASE_DOC_IDS = {
  STATS: "userStats",
  LEARNING_STATUS: "userLearningStatus",
  DAILY_GOAL: "userDailyGoal",
};

// ============= GLOBAL STATE =============
let appGrammarData = [];
let grammarStats = {};
let learningStatus = {};
let dailyGoalData = {};
let cachedData = null;
let currentEditingId = null;

// Quick Learn State
let qlSessionData = [];
let qlCurrentIndex = 0;
let qlCurrentStep = 0;
let qlNewItems = [];
let qlIsReviewSession = false;
let learnedTodayIds = new Set();

let onModalCloseAction = null;
// DOM Cache
let dom = {};

// ============= INITIALIZATION =============
document.addEventListener("DOMContentLoaded", async () => {
  const loadingOverlay = document.getElementById("loading-overlay");

  try {
    const data = await loadSharedData();
    Object.assign(
      { appGrammarData, grammarStats, learningStatus, dailyGoalData },
      data
    );
    [appGrammarData, grammarStats, learningStatus, dailyGoalData] = [
      data.appGrammarData,
      data.grammarStats,
      data.learningStatus,
      data.dailyGoal,
    ];

    // Only initialize the full homepage UI if we are on the main page
    if (document.getElementById("grammar-ul")) {
      initializeHomePage();
    }
  } catch (error) {
    console.error("Initialization error:", error);
  } finally {
    loadingOverlay?.classList.add("hidden");
    setupScrollToTop();
  }
});

function initializeHomePage() {
  initializeDOM();
  applyButtonStyles();
  initializeDataManagement();
  initializeModal();
  initializeDailyGoal();
  initializeQuickLearn();
  setupEventListeners();
  populateQuickLearnLevelFilter();

  applyFiltersAndSort();
  loadAndDisplayDailyGoal();

  const savedQlSession = JSON.parse(
    localStorage.getItem(STORAGE_KEYS.QL_SESSION)
  );
  if (savedQlSession) resumeQuickLearnSession(savedQlSession);
}

function initializeDOM() {
  dom = {
    grammarListUl: document.getElementById("grammar-ul"),
    addNewGrammarBtn: document.getElementById("add-new-grammar-btn"),
    sortOptions: document.getElementById("sort-options"),
    filterStatus: document.getElementById("filter-status"),
    searchInput: document.getElementById("search-input"),

    fileInput: document.getElementById("word-file-input"),
    exportJsonBtn: document.getElementById("export-json-btn"),
    importJsonInput: document.getElementById("import-json-input"),
    clearStorageButton: document.getElementById("clear-storage-button"),
    toggleImportBtn: document.getElementById("toggle-import-section-btn"),

    modal: document.getElementById("grammar-modal"),
    closeModalButton: document.querySelector(".close-button"),
    modalViewMode: document.getElementById("modal-view-mode"),
    modalEditMode: document.getElementById("modal-edit-mode"),
    editButton: document.getElementById("modal-edit-btn"),
    deleteButton: document.getElementById("modal-delete-btn"),
    saveButton: document.getElementById("modal-save-btn"),
    cancelButton: document.getElementById("modal-cancel-btn"),

    dailyGoalInput: document.getElementById("daily-goal-input"),
    learnedTodayCountSpan: document.getElementById("learned-today-count"),
    dailyGoalTargetSpan: document.getElementById("daily-goal-target"),
    dailyGoalProgressBar: document.getElementById("daily-goal-progress-bar"),
    learnedTodayListDiv: document.getElementById("learned-today-list"),

    startQuickLearnBtn: document.getElementById("start-quick-learn-btn"),
    nextSessionOptions: document.getElementById("next-session-options"),
    startNextSessionBtn: document.getElementById("start-next-session-btn"),
    quickLearnLevelFilter: document.getElementById(
      "quick-learn-level-filter"
    ),
    quickLearnContainer: document.getElementById("quick-learn-container"),
    qlProgressBar: document.getElementById("quick-learn-progress-bar"),
    qlStepTitle: document.getElementById("quick-learn-step-title"),
    qlNextBtn: document.getElementById("ql-next-btn"),
    qlExitBtn: document.getElementById("ql-exit-btn"),
    qlStepContainers: document.querySelectorAll(".ql-step-container"),
    qlStep1View: document.getElementById("ql-step1-view"),
    qlStep2MC: document.getElementById("ql-step2-mc"),
    qlStep3Match: document.getElementById("ql-step3-match"),
    qlStep4Fill: document.getElementById("ql-step4-fill"),
  };
}

function applyButtonStyles() {
  const styles = [
    {
      btns: [
        dom.addNewGrammarBtn,
        dom.saveButton,
        dom.startQuickLearnBtn,
        dom.startNextSessionBtn,
        dom.qlNextBtn,
      ],
      classes: ["btn", "btn-primary"],
    },
    {
      btns: [dom.editButton, dom.cancelButton, dom.exportJsonBtn],
      classes: ["btn", "btn-secondary"],
    },
    {
      btns: [dom.deleteButton, dom.clearStorageButton],
      classes: ["btn", "btn-danger"],
    },
  ];

  styles.forEach(({ btns, classes }) =>
    btns.forEach((btn) => btn?.classList.add(...classes))
  );

  document
    .querySelector('label[for="import-json-input"]')
    ?.classList.add("btn", "btn-secondary");
  document
    .querySelector('label[for="word-file-input"]')
    ?.classList.add("btn", "btn-secondary");
}

function setupEventListeners() {
  dom.sortOptions?.addEventListener("change", applyFiltersAndSort);
  dom.filterStatus?.addEventListener("change", applyFiltersAndSort);
  dom.searchInput?.addEventListener("input", applyFiltersAndSort);
}

function setupScrollToTop() {
  const scrollBtn = document.getElementById("scroll-to-top-btn");
  window.onscroll = () => {
    scrollBtn.style.display =
      document.body.scrollTop > 200 || document.documentElement.scrollTop > 200
        ? "block"
        : "none";
  };
  scrollBtn.addEventListener("click", () =>
    window.scrollTo({ top: 0, behavior: "smooth" })
  );
}

// ============= DATA MANAGEMENT =============
function initializeDataManagement() {
  dom.exportJsonBtn?.addEventListener("click", exportToJson);
  dom.importJsonInput?.addEventListener("change", importFromJson);
  dom.clearStorageButton?.addEventListener("click", clearStorage);
  dom.fileInput?.addEventListener("change", handleWordFileUpload);

  dom.toggleImportBtn?.addEventListener("click", () => {
    const content = document.getElementById("import-section-content");
    const isHidden = content.style.display === "none";
    content.style.display = isHidden ? "block" : "none";
    dom.toggleImportBtn.textContent = isHidden
      ? "- Hide Data Management"
      : "+ Import & Manage Data";
  });
}

async function handleWordFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const arrayBuffer = e.target.result;
      const result = await mammoth.extractRawText({ arrayBuffer });
      const parsedData = parseWordText(result.value);

      if (
        parsedData.length > 0 &&
        confirm(`Phân tích được ${parsedData.length} mẫu câu. Import?`)
      ) {
        appGrammarData = parsedData;
        await saveAndSync(STORAGE_KEYS.DATA, appGrammarData);
        applyFiltersAndSort();
        showToast(`Nhập thành công ${parsedData.length} cấu trúc!`, "success");
      }
    } catch (err) {
      console.error(err);
      showToast("Lỗi đọc file Word.", "error");
    }
  };
  reader.readAsArrayBuffer(file);
}

function exportToJson() {
  if (appGrammarData.length === 0) return alert("Không có dữ liệu để xuất.");

  const blob = new Blob([JSON.stringify(appGrammarData, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "grammar_data.json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function normalizeStructure(structure) {
  if (!structure) return "";
  return structure.replace(/[～〜\s（）()]/g, "").toLowerCase();
}

async function importFromJson(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      let importedData = JSON.parse(e.target.result);
      if (
        !Array.isArray(importedData) ||
        !importedData[0]?.structure ||
        !importedData[0]?.meaning
      ) {
        showToast("Định dạng JSON không hợp lệ.", "error");
        return;
      }

      const existingStructureMap = new Map(
        appGrammarData.map((g) => [normalizeStructure(g.structure), g])
      );
      const newItems = [];
      const duplicates = [];

      for (const item of importedData) {
        if (!item.structure) continue;
        const normalizedNew = normalizeStructure(item.structure);
        const existingItem = existingStructureMap.get(normalizedNew);

        if (existingItem) {
          duplicates.push({ newItem: item, existingItem });
        } else {
          newItems.push(item);
        }
      }

      // Xử lý các mục trùng lặp
      for (const { newItem, existingItem } of duplicates) {
        const userChoice = await showDuplicateModal(newItem, existingItem);
        switch (userChoice) {
          case "update":
            // Cập nhật mục hiện có
            const index = appGrammarData.findIndex(
              (g) => g.id === existingItem.id
            );
            if (index !== -1) {
              const { id, ...restOfNewItem } = newItem; // Bỏ qua ID từ file import
              appGrammarData[index] = {
                ...appGrammarData[index],
                ...restOfNewItem,
              };
              await syncSingleGrammarItemToFirebase(appGrammarData[index]);
            }
            break;
          case "add":
            // Thêm mới dù bị trùng
            newItems.push(newItem);
            break;
          case "skip":
          default:
            // Bỏ qua
            break;
        }
      }

      // Thêm các mục mới không trùng lặp
      let maxId = Math.max(...appGrammarData.map((g) => Number(g.id) || 0), 0);
      const itemsToAdd = newItems.map((item) => {
        maxId++;
        const { id, ...rest } = item;
        return { ...rest, id: String(maxId) };
      });

      if (itemsToAdd.length > 0) {
        appGrammarData.push(...itemsToAdd);
        await saveAndSync(STORAGE_KEYS.DATA, appGrammarData);
      }

      applyFiltersAndSort();
      showToast("Hoàn tất quá trình nhập file!", "success");
    } catch (error) {
      console.error("JSON parse error:", error);
      showToast("Lỗi đọc file JSON.", "error");
    } finally {
      event.target.value = null;
    }
  };
  reader.readAsText(file);
}

async function showDuplicateModal(newItem, existingItem) {
  return new Promise((resolve) => {
    const modal = document.createElement("div");
    modal.className = "modal";
    modal.style.display = "block";
    modal.style.backgroundColor = "rgba(0,0,0,0.6)";

    const examplesToHtml = (examples) => {
      if (!examples || examples.length === 0) return "<li>(Không có)</li>";
      return examples
        .map(
          (ex) =>
            `<li>${ex.jp || ex.japanese}<br/><i>${
              ex.vi || ex.vietnamese
            }</i></li>`
        )
        .join("");
    };

    const existingExamplesHtml = examplesToHtml(existingItem.examples);
    const newExamplesHtml = examplesToHtml(newItem.examples);

    const getDiffClass = (val1, val2) => {
      const normalized1 = (val1 || "").trim();
      const normalized2 = (val2 || "").trim();
      return normalized1 !== normalized2 ? "diff" : "";
    };
    modal.innerHTML = `
<style>
        .comparison-table { width: 100%; border-collapse: collapse; margin-top: 20px; table-layout: fixed; }
        .comparison-table th, .comparison-table td { padding: 12px; border: 1px solid #ddd; text-align: left; vertical-align: top; word-wrap: break-word; }
        .comparison-table th { background-color: #f8f9fa; font-weight: bold; width: 120px; }
        .comparison-table td { background-color: #fff; }
        .comparison-table tr:nth-child(even) td { background-color: #f9f9f9; }
        .comparison-table .diff { background-color: #fffbe6 !important; }
        .comparison-table ul { margin: 0; padding-left: 20px; }
        .comparison-table li { margin-bottom: 8px; }
        .modal-footer { margin-top: 20px; text-align: right; }
      </style>
      <div class="modal-content" style="max-width: 900px;">
                <span class="close-button">&times;</span>
        <h2>Phát hiện cấu trúc có thể bị trùng</h2>
        <p>Cấu trúc <strong>${
          newItem.structure
        }</strong> từ file import có vẻ giống với một cấu trúc đã có.</p>
        <table class="comparison-table">
          <thead>
            <tr>
              <th>Trường</th>
              <th>Dữ liệu hiện tại</th>
              <th>Dữ liệu mới từ file</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>Cấu trúc</th>
              <td class="${getDiffClass(
                existingItem.structure,
                newItem.structure
              )}">${existingItem.structure}</td>
              <td class="${getDiffClass(
                existingItem.structure,
                newItem.structure
              )}">${newItem.structure}</td>
            </tr>
            <tr>
              <th>Ý nghĩa</th>
              <td class="${getDiffClass(
                existingItem.meaning,
                newItem.meaning
              )}">${existingItem.meaning}</td>
              <td class="${getDiffClass(
                existingItem.meaning,
                newItem.meaning
              )}">${newItem.meaning}</td>
            </tr>
            <tr>
              <th>Giải thích</th>
              <td class="${getDiffClass(
                existingItem.explanation,
                newItem.explanation
              )}">${existingItem.explanation || "(trống)"}</td>
              <td class="${getDiffClass(
                existingItem.explanation,
                newItem.explanation
              )}">${newItem.explanation || "(trống)"}</td>
            </tr>
            <tr>
              <th>Ví dụ</th>
              <td class="${getDiffClass(
                existingExamplesHtml,
                newExamplesHtml
              )}"><ul>${existingExamplesHtml}</ul></td>
              <td class="${getDiffClass(
                existingExamplesHtml,
                newExamplesHtml
              )}"><ul>${newExamplesHtml}</ul></td>
            </tr>
          </tbody>
        </table>

        <div class="modal-footer">
          
          <button id="dup-skip-btn" class="btn btn-secondary">Bỏ qua</button>
          <button id="dup-add-btn" class="btn btn-secondary">Vẫn thêm mới</button>
          <button id="dup-update-btn" class="btn btn-primary">Cập nhật dữ liệu mới</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const closeModalAndResolve = (choice) => {
      document.body.removeChild(modal);
      resolve(choice);
    };

    modal.querySelector(".close-button").onclick = () =>
      closeModalAndResolve("skip");
    modal.querySelector("#dup-skip-btn").onclick = () =>
      closeModalAndResolve("skip");
    modal.querySelector("#dup-add-btn").onclick = () =>
      closeModalAndResolve("add");
    modal.querySelector("#dup-update-btn").onclick = () =>
      closeModalAndResolve("update");

    window.addEventListener("click", function handler(event) {
      if (event.target === modal) {
        closeModalAndResolve("skip");
        window.removeEventListener("click", handler);
      }
    });
  });
}

async function clearStorage() {
  if (
    !confirm("XÓA vĩnh viễn TẤT CẢ dữ liệu. Không thể hoàn tác. Bạn chắc chứ?")
  )
    return;

  Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));

  if (await clearAllFirebaseData()) {
    showToast("Xóa thành công. Tải lại...", "success");
    setTimeout(() => window.location.reload(), 1500);
  }
}

async function saveAndSync(storageKey, data) {
  localStorage.setItem(storageKey, JSON.stringify(data));
  if (storageKey === STORAGE_KEYS.DATA) await syncDataToFirebase();
}

// ============= MODAL FUNCTIONS =============
function initializeModal() {
  dom.closeModalButton?.addEventListener("click", closeModal);
  window.addEventListener(
    "click",
    (e) => e.target === dom.modal && closeModal()
  );
  dom.editButton?.addEventListener("click", switchToEditMode);
  dom.saveButton?.addEventListener("click", saveGrammarChanges);
  dom.deleteButton?.addEventListener("click", deleteCurrentGrammar);
  dom.cancelButton?.addEventListener("click", () =>
    currentEditingId === "new" ? closeModal() : switchToViewMode()
  );
  dom.addNewGrammarBtn?.addEventListener("click", openModalForNewGrammar);
}

function showGrammarDetails(grammarId) {
  const grammar = appGrammarData.find((g) => g.id === grammarId);
  if (!grammar) return;

  currentEditingId = grammarId;

  // Populate view mode
  document.getElementById("modal-level").textContent = grammar.level || "N/A";
  document.getElementById("modal-structure").textContent = grammar.structure;
  document.getElementById("modal-meaning").textContent = grammar.meaning;
  document.getElementById("modal-explanation").textContent =
    grammar.explanation;
  document.getElementById("modal-note").textContent =
    grammar.note || "Không có ghi chú.";

  // Stats
  const stats = grammarStats[grammarId];
  const statsSpan = document.getElementById("modal-stats");
  statsSpan.textContent =
    stats?.total > 0
      ? `${stats.correct}/${stats.total} (${Math.round(
          (stats.correct / stats.total) * 100
        )}%)`
      : "Chưa có thống kê.";

  // Examples
  const examplesUl = document.getElementById("modal-examples");
  examplesUl.innerHTML = grammar.examples
    .map(
      (ex) =>
        `<li><div class="jp-example">${
          ex.jp || ex.japanese
        }</div><div class="vi-example">${ex.vi || ex.vietnamese}</div></li>`
    )
    .join("");

  // Populate edit mode
  document.getElementById("modal-edit-level").value = grammar.level || "";
  document.getElementById("modal-edit-structure").value = grammar.structure;
  document.getElementById("modal-edit-meaning").value = grammar.meaning;
  document.getElementById("modal-edit-explanation").value = grammar.explanation;
  document.getElementById("modal-edit-note").value = grammar.note || "";

  const examplesText = grammar.examples
    .map((ex) => `${ex.jp || ex.japanese}\n${ex.vi || ex.vietnamese}`)
    .join("\n---\n");
  document.getElementById("modal-edit-examples").value = examplesText;

  switchToViewMode();
  document.body.classList.add("modal-open");
  dom.modal.style.display = "block";
}

function openModalForNewGrammar() {
  currentEditingId = "new";
  [
    "modal-edit-structure",
    "modal-edit-meaning",
    "modal-edit-explanation",
    "modal-edit-note",
    "modal-edit-level",
    "modal-edit-examples",
  ].forEach((id) => (document.getElementById(id).value = ""));

  switchToEditMode();
  document.body.classList.add("modal-open");
  dom.modal.style.display = "block";
}

function switchToEditMode() {
  dom.modalViewMode.style.display = "none";
  dom.modalEditMode.style.display = "block";
  dom.editButton.style.display = "none";
  dom.deleteButton.style.display = "none";
  dom.saveButton.style.display = "inline-block";
  dom.cancelButton.style.display = "inline-block";
}

function switchToViewMode() {
  dom.modalEditMode.style.display = "none";
  dom.modalViewMode.style.display = "block";
  dom.editButton.style.display = "inline-block";
  dom.deleteButton.style.display = "inline-block";
  dom.saveButton.style.display = "none";
  dom.cancelButton.style.display = "none";
}

function closeModal() {
  document.body.classList.remove("modal-open");
  dom.modal.style.display = "none";
  currentEditingId = null;
  if (typeof onModalCloseAction === "function") {
    onModalCloseAction();
    onModalCloseAction = null; // Reset lại sau khi thực thi
  }
}

async function saveGrammarChanges() {
  if (!currentEditingId) return;

  const structure = document
    .getElementById("modal-edit-structure")
    .value.trim();
  const meaning = document.getElementById("modal-edit-meaning").value.trim();
  const explanation = document
    .getElementById("modal-edit-explanation")
    .value.trim();
  const note = document.getElementById("modal-edit-note").value.trim();
  let level = document.getElementById("modal-edit-level").value.trim();
  const examplesText = document.getElementById("modal-edit-examples").value;

  if (!structure || !meaning) {
    showToast("Cấu trúc và Ý nghĩa là bắt buộc.", "error");
    return;
  }

  const examples = examplesText
    .split(/\n---\n/)
    .map((pair) => {
      const lines = pair
        .trim()
        .split("\n")
        .filter((l) => l.trim());
      return lines.length >= 2
        ? {
            japanese: lines[0].trim(),
            vietnamese: lines.slice(1).join("\n").trim(),
          }
        : null;
    })
    .filter(Boolean);

  if (currentEditingId === "new") {
    const isDuplicate = appGrammarData.some(
      (g) => g.structure.toLowerCase() === structure.toLowerCase()
    );
    if (isDuplicate) {
      showToast("This structure already exists.", "error");
      return;
    }

    // Nếu đang thêm mới và level bị bỏ trống, hiện popup hỏi
    if (!level) {
      const promptedLevel = prompt("Vui lòng nhập level (ví dụ: N1, N2, N3):");
      if (promptedLevel && promptedLevel.trim() !== "") {
        level = promptedLevel.trim().toUpperCase();
      } else {
        showToast("Thao tác đã bị hủy. Level là thông tin bắt buộc.", "error");
        return; // Dừng lại nếu người dùng không nhập level
      }
    }
    const newId = String(
      (Math.max(...appGrammarData.map((g) => Number(g.id) || 0)) || 0) + 1
    );
    const newGrammar = {
      id: newId,
      structure,
      level,
      meaning,
      explanation,
      note,
      examples,
    };
    appGrammarData.push(newGrammar);
    await syncSingleGrammarItemToFirebase(newGrammar);
  } else {
    const mainIndex = appGrammarData.findIndex(
      (g) => g.id === currentEditingId
    );
    if (mainIndex !== -1) {
      const updatedGrammar = {
        ...appGrammarData[mainIndex],
        structure,
        level,
        meaning,
        explanation,
        note,
        examples,
      };
      appGrammarData[mainIndex] = updatedGrammar;
      await syncSingleGrammarItemToFirebase(updatedGrammar);

      // Đồng bộ với Quick Learn session nếu đang hoạt động
      if (qlSessionData && qlSessionData.length > 0) {
        const qlIndex = qlSessionData.findIndex(
          (g) => g.id === currentEditingId
        );
        if (qlIndex > -1) {
          qlSessionData[qlIndex] = updatedGrammar;
          saveQuickLearnSession();
          // Nếu mục đang sửa là mục đang hiển thị trong Quick Learn, tải lại bước đó
          if (qlIndex === qlCurrentIndex) {
            loadQuickLearnStep();
          }
        }
      }
    }
  }

  localStorage.setItem(STORAGE_KEYS.DATA, JSON.stringify(appGrammarData));
  applyFiltersAndSort();
  showToast("Lưu thành công!", "success");
  closeModal();
}

async function deleteCurrentGrammar() {
  if (!currentEditingId || currentEditingId === "new") return;
  if (!confirm("Xóa cấu trúc này?")) return;

  const index = appGrammarData.findIndex((g) => g.id === currentEditingId);
  if (index > -1) {
    const itemToDelete = appGrammarData[index];
    appGrammarData.splice(index, 1);
    localStorage.setItem(STORAGE_KEYS.DATA, JSON.stringify(appGrammarData));
    await deleteGrammarItemFromFirebase(itemToDelete.id);
    applyFiltersAndSort();
    closeModal();
    showToast(`Đã xóa cấu trúc "${itemToDelete.structure}".`, "success");
  }
}

async function deleteGrammarItemFromFirebase(itemId) {
  if (!itemId) return;
  try {
    await deleteDoc(doc(db, "grammar", String(itemId)));
  } catch (e) {
    console.error(`Delete item ${itemId} error:`, e);
    showToast(`Lỗi xóa mục ${itemId} trên server.`, "error");
  }
}

// ============= FILTERING & SORTING =============
function applyFiltersAndSort() {
  let filtered = [...appGrammarData];

  // Search filter
  const searchTerm = dom.searchInput?.value.toLowerCase().trim() || "";
  if (searchTerm) {
    filtered = filtered.filter((g) =>
      [g.structure, g.meaning, g.explanation, g.note].some((field) =>
        field?.toLowerCase().includes(searchTerm)
      )
    );
  }

  // Status filter
  const filterValue = dom.filterStatus?.value || "all";
  if (filterValue !== "all") {
    filtered = filtered.filter((g) => {
      const status = learningStatus[g.id];
      if (filterValue === "learned") return status === "learned";
      if (filterValue === "review") return status === "review";
      return !status;
    });}
    else if (filterValue.startsWith("level-")) {
      const level = filterValue.replace("level-", "").toUpperCase();
      filtered = filtered.filter((g) => g.level && g.level.toUpperCase() === level
      );
    }
  

  // Sort
  const sortBy = dom.sortOptions?.value || "oldest";
  if (sortBy === "az") {
    filtered.sort((a, b) => a.structure.localeCompare(b.structure, "ja"));
  } else if (sortBy === "za") {
    filtered.sort((a, b) => b.structure.localeCompare(a.structure, "ja"));
  } else if (sortBy === "newest") {
    filtered.sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0));
  } else if (sortBy === "oldest") {
    filtered.sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0));
  } else {
    filtered.sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0));
  }

  renderGrammarList(filtered, searchTerm);
}

function renderGrammarList(data, searchTerm = "") {
  if (!dom.grammarListUl) return;

  dom.grammarListUl.innerHTML = "";
  data.forEach((g, index) => {
    const li = document.createElement("li");
    li.className = "grammar-list-item";

    // Main content
    const mainInfo = document.createElement("div");
    mainInfo.className = "grammar-item-main";

    // Highlight function
    const highlight = (text, term) => {
      if (!term || !text) return text;
      const regex = new RegExp(
        `(${term.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&")})`,
        "gi"
      );
      return text.replace(regex, "<mark>$1</mark>");
    };
    const structureHTML = highlight(g.structure, searchTerm);
    const meaningHTML = highlight(g.meaning, searchTerm);
    const levelBadge = g.level
      ? ` <span class="badge level-badge">${g.level}</span>`
      : "";
    const status = learningStatus[g.id];
    const badge = status
      ? ` <span class="badge status-badge ${status}">${
          status === "learned" ? "Learned" : "Review"
        }</span>`
      : "";
    mainInfo.innerHTML = `<span><strong>${
      index + 1
    }. ${structureHTML}</strong>: ${meaningHTML}${badge}</span>`;

    // Stats and Actions
    const sideInfo = document.createElement("div");
    sideInfo.className = "grammar-item-side";

    const stats = grammarStats[g.id];
    const correctRate =
      stats && stats.total > 0
        ? `${Math.round((stats.correct / stats.total) * 100)}%`
        : "N/A";
    sideInfo.innerHTML = `<span class="correct-rate">${correctRate}</span>`;

    const button = document.createElement("button");
    button.className = "btn btn-secondary btn-sm";
    button.textContent = "View Details";
    button.addEventListener("click", () => showGrammarDetails(g.id));
    sideInfo.appendChild(button);

    li.appendChild(mainInfo);
    li.appendChild(sideInfo);
    dom.grammarListUl.appendChild(li);
  });
}

// ============= DAILY GOAL =============
function initializeDailyGoal() {
  dom.dailyGoalInput?.addEventListener("change", updateDailyGoal);
}

function loadAndDisplayDailyGoal() {
  const today = getTodayString();

  if (dailyGoalData.date !== today) {
    dailyGoalData.date = today;
    dailyGoalData.learnedIds = [];
    syncDailyGoalToFirebase(dailyGoalData);
  }

  learnedTodayIds = new Set(dailyGoalData.learnedIds || []);
  if (dom.dailyGoalInput) dom.dailyGoalInput.value = dailyGoalData.goal || 5;

  localStorage.setItem(STORAGE_KEYS.DAILY_GOAL, JSON.stringify(dailyGoalData));
  updateDailyGoalProgress();

  if (learnedTodayIds.size > 0) {
    dom.startQuickLearnBtn.style.display = "none";
    dom.nextSessionOptions.style.display = "block";
  }
}

function updateDailyGoal() {
  dailyGoalData.goal = parseInt(dom.dailyGoalInput.value, 10);
  localStorage.setItem(STORAGE_KEYS.DAILY_GOAL, JSON.stringify(dailyGoalData));
  updateDailyGoalProgress();
  syncDailyGoalToFirebase(dailyGoalData);
  showToast(`Cập nhật mục tiêu: ${dailyGoalData.goal}.`, "success");
}

function updateDailyGoalProgress() {
  const goal = parseInt(dom.dailyGoalInput?.value, 10) || 5;
  const learned = learnedTodayIds.size;
  const percentage =
    goal > 0 ? Math.min(Math.round((learned / goal) * 100), 100) : 0;

  if (dom.learnedTodayCountSpan)
    dom.learnedTodayCountSpan.textContent = learned;
  if (dom.dailyGoalTargetSpan) dom.dailyGoalTargetSpan.textContent = goal;
  if (dom.dailyGoalProgressBar) {
    dom.dailyGoalProgressBar.style.width = `${percentage}%`;
    dom.dailyGoalProgressBar.textContent = `${percentage}%`;
  }

  // Update learned list
  if (dom.learnedTodayListDiv) {
    const learnedItems = Array.from(learnedTodayIds)
      .map((id) => appGrammarData.find((g) => g.id === id))
      .filter(Boolean);

    dom.learnedTodayListDiv.innerHTML = ""; // Clear previous items
    if (learnedItems.length > 0) {
      learnedItems.forEach((g) => {
        const badge = document.createElement("span");
        badge.className = "badge status-badge learned";
        badge.style.cursor = "pointer";
        badge.textContent = g.structure;
        badge.dataset.grammarId = g.id;
        badge.addEventListener("click", () => showGrammarDetails(g.id));
        dom.learnedTodayListDiv.appendChild(badge);
      });
    } else {
      dom.learnedTodayListDiv.innerHTML =
        '<span style="color: #888;">Chưa học.</span>';
    }
  }
}

// ============= QUICK LEARN =============
function initializeQuickLearn() {
  dom.startQuickLearnBtn?.addEventListener("click", startLearnSession);
  dom.startNextSessionBtn?.addEventListener("click", startLearnSession);
  dom.qlNextBtn?.addEventListener("click", handleNextStep);
  dom.qlExitBtn?.addEventListener("click", exitQuickLearnSession);
}

const quickLearnSteps = [
  {
    title: (i, t) => `Step 1: Details (${i + 1}/${t})`,
    isGroupActivity: false,
    isNewOnly: true,
    setup: (grammar) => {
      dom.qlStep1View.innerHTML = `
        <div class="ql-detail-card">
          <h3>${grammar.structure}</h3>
          <p><strong>Meaning:</strong> ${grammar.meaning}</p>
          <p><strong>Explanation:</strong> ${grammar.explanation || "N/A"}</p>
          <div class="ql-examples">
            <p><strong>Example:</strong></p>
            <ul>${
              grammar.examples
                .map(
                  (ex) =>
                    `<li><div class="jp-example">${
                      ex.jp || ex.japanese
                    }</div><div class="vi-example">${
                      ex.vi || ex.vietnamese
                    }</div></li>`
                )
                .join("") || "<li>No example.</li>"
            }</ul>
          </div>
          <p><strong>Note:</strong> ${grammar.note || "No"}</p>
          <button id="ql-edit-details-btn" class="btn btn-secondary">Edit Details</button>
        </div>`;
      dom.qlStep1View.querySelector("#ql-edit-details-btn").onclick = () =>
        showGrammarDetails(grammar.id);
      return dom.qlStep1View;
    },
  },
  {
    title: (i, t) => `Step 2: Multiple choice (${i + 1}/${t})`,
    isGroupActivity: false,
    isNewOnly: true,
    setup: (grammar) => {
      document.getElementById("ql-mc-meaning").innerText = grammar.meaning;

      const options = shuffle([...appGrammarData])
        .filter((g) => g.id !== grammar.id)
        .slice(0, 3);
      options.push(grammar);
      shuffle(options);

      const container = document.getElementById("ql-mc-options");
      container.innerHTML = options
        .map(
          (opt) => `<button class="btn ql-mc-option">${opt.structure}</button>`
        )
        .join("");

      container.querySelectorAll(".ql-mc-option").forEach((btn, idx) => {
        btn.onclick = () =>
          handleMCOptionClick(
            btn,
            options[idx].id === grammar.id,
            container,
            grammar
          );
      });
      return dom.qlStep2MC;
    },
  },
  {
    title: () => `Step 3: Pair Match`,
    isGroupActivity: true,
    isNewOnly: false,
    setup: (grammar, sessionData) => {
      const board = document.getElementById("ql-match-board");
      board.innerHTML = "";
      let selected = { structure: null, meaning: null };

      const structures = sessionData.map((item) => ({
        id: item.id,
        text: item.structure,
        type: "structure",
      }));
      const meanings = sessionData.map((item) => ({
        id: item.id,
        text: item.meaning,
        type: "meaning",
      }));
      const cards = shuffle([...structures, ...meanings]);

      cards.forEach((cardData) => {
        const cardEl = document.createElement("div");
        cardEl.className = "card";
        cardEl.textContent = cardData.text;
        cardEl.dataset.id = cardData.id;
        cardEl.dataset.type = cardData.type;
        cardEl.onclick = () =>
          handlePairMatchClick(cardEl, cardData.type, selected, sessionData);
        board.appendChild(cardEl);
      });

      dom.qlNextBtn.disabled = true;
      document.getElementById("ql-match-hint-btn").onclick = () =>
        showPairMatchHint(board);
      return dom.qlStep3Match;
    },
  },
  {
    title: (i, t) => `Step 4: Fill in the blanks (${i + 1}/${t})`,
    isGroupActivity: false,
    isNewOnly: false,
    setup: (grammar) => {
      document.getElementById("ql-fill-meaning").innerText = grammar.meaning;

      const input = document.getElementById("ql-fill-input");
      const skipBtn = document.getElementById("ql-skip-btn");
      const hintBtn = document.getElementById("ql-fill-hint-btn");
      const resultP = document.getElementById("ql-fill-result");
      const statsSpan = document.getElementById("ql-fill-stats");

      input.value = "";
      input.disabled = false;
      resultP.textContent = "";
      statsSpan.textContent = "";
      hintBtn.disabled = false;
      skipBtn.disabled = false;
      dom.qlNextBtn.disabled = true;

      input.oninput = () => handleFillInput(input, grammar, resultP, statsSpan);
      hintBtn.onclick = () => provideFillHint(input, grammar.structure);
      skipBtn.onclick = () => handleSkipQuestion(grammar.id, input, resultP);

      return dom.qlStep4Fill;
    },
  },
];

function startLearnSession() {
  const mode =
    document.querySelector('input[name="learn-mode"]:checked')?.value ||
    "new-only";
  qlIsReviewSession = mode === "review-and-new";
  const count =
    parseInt(dom.quickLearnCount?.value, 10) ||
    parseInt(document.getElementById("quick-learn-count")?.value, 10) ||
    1;

  // Lọc dữ liệu theo level đã chọn
  const selectedLevel = dom.quickLearnLevelFilter.value;
  let sourceData = appGrammarData;

  if (selectedLevel !== "all") {
    if (selectedLevel === "unclassified") {
      sourceData = appGrammarData.filter((g) => !g.level);
    } else {
      sourceData = appGrammarData.filter(
        (g) => g.level && g.level.toUpperCase() === selectedLevel.toUpperCase()
      );
    }
  }

  if (sourceData.length === 0) {
    showToast("Không có ngữ pháp nào cho level đã chọn.", "info");
    return;
  }

  const unlearned = sourceData.filter(
    (g) => learningStatus[g.id] !== "learned" && !learnedTodayIds.has(g.id)
  );
  const review = shuffle(
    unlearned.filter((g) => learningStatus[g.id] === "review")
  );
  const newItems = shuffle(
    unlearned.filter((g) => learningStatus[g.id] !== "review")
  );
  qlNewItems = [...review, ...newItems].slice(0, count);

  if (qlIsReviewSession) {
    const learnedToday = Array.from(learnedTodayIds)
      .map((id) => sourceData.find((g) => g.id === id))
      .filter(Boolean);

    const unique = new Set();
    qlSessionData = [...qlNewItems, ...learnedToday].filter((item) => {
      if (unique.has(item.id)) return false;
      unique.add(item.id);
      return true;
    });
  } else {
    qlSessionData = qlNewItems;
  }

  if (qlSessionData.length === 0) {
    showToast("Chúc mừng! Bạn đã học hết các mục trong phần này.", "success");
    return;
  }

  qlCurrentIndex = 0;
  qlCurrentStep = 0;
  dom.quickLearnContainer.style.display = "block";
  dom.startQuickLearnBtn.style.display = "none";
  dom.nextSessionOptions.style.display = "none";

  saveQuickLearnSession();
  loadQuickLearnStep();
}

function loadQuickLearnStep() {
  updateQLProgress();

  document
    .querySelector(".ql-step-container.active")
    ?.classList.remove("active");
  dom.qlStepContainers.forEach((c) => (c.style.display = "none"));
  dom.qlNextBtn.disabled = false;

  if (!qlSessionData[qlCurrentIndex]) return;

  const grammar = qlSessionData[qlCurrentIndex];
  const stepConfig = quickLearnSteps[qlCurrentStep];

  if (
    qlIsReviewSession &&
    !qlNewItems.some((i) => i.id === grammar.id) &&
    stepConfig?.isNewOnly
  ) {
    dom.qlNextBtn.click();
    return;
  }

  if (dom.qlStepTitle) {
    const itemsForTitle = stepConfig.isNewOnly ? qlNewItems : qlSessionData;
    dom.qlStepTitle.textContent = stepConfig.title(
      qlCurrentIndex,
      itemsForTitle.length
    );
  }

  const container = stepConfig.setup(grammar, qlSessionData);
  container.style.display = "block";
  setTimeout(() => container.classList.add("active"), 10);

  const inputToFocus = container.querySelector("#ql-fill-input");
  if (inputToFocus) setTimeout(() => inputToFocus.focus(), 100);
}

function handleNextStep() {
  saveQuickLearnSession();

  qlCurrentIndex++;
  const stepConfig = quickLearnSteps[qlCurrentStep] || {};
  const itemsCount = stepConfig.isGroupActivity
    ? 1
    : (stepConfig.isNewOnly ? qlNewItems : qlSessionData).length;

  if (qlCurrentIndex >= itemsCount) {
    qlCurrentIndex = 0;
    qlCurrentStep++;

    // Nếu bước tiếp theo là Bước 4 (Fill in the blanks), xáo trộn lại danh sách
    // để tạo sự ngẫu nhiên và tăng độ khó.
    if (qlCurrentStep === 3) {
      shuffle(qlSessionData);
    }
  }

  if (qlCurrentStep >= quickLearnSteps.length) {
    completeQuickLearnSession();
  } else {
    loadQuickLearnStep();
  }
}

function exitQuickLearnSession() {
  if (
    confirm("Bạn có chắc muốn thoát phiên học này? Tiến trình sẽ được lưu lại.")
  ) {
    // Don't clear the session from localStorage, just hide the UI
    dom.quickLearnContainer.style.display = "none";

    // Show the appropriate start button
    if (learnedTodayIds.size > 0) {
      dom.nextSessionOptions.style.display = "block";
    } else {
      dom.startQuickLearnBtn.style.display = "block";
    }
    showToast("Đã thoát phiên học. Bạn có thể tiếp tục sau.", "info");
  }
}

function completeQuickLearnSession() {
  qlNewItems.forEach((g) => (learningStatus[g.id] = "learned"));

  qlSessionData.forEach((g) => learnedTodayIds.add(g.id));

  dailyGoalData.date = getTodayString();
  dailyGoalData.learnedIds = Array.from(learnedTodayIds);

  localStorage.setItem(STORAGE_KEYS.DAILY_GOAL, JSON.stringify(dailyGoalData));
  localStorage.setItem(
    STORAGE_KEYS.LEARNING_STATUS,
    JSON.stringify(learningStatus)
  );

  syncLearningStatusToFirebase(learningStatus);
  syncDailyGoalToFirebase(dailyGoalData);
  localStorage.removeItem(STORAGE_KEYS.QL_SESSION);

  updateDailyGoalProgress();
  dom.quickLearnContainer.style.display = "none";
  dom.startQuickLearnBtn.style.display = "none";
  dom.nextSessionOptions.style.display = "block";

  applyFiltersAndSort();
  showToast(`Hoàn thành! Đã học ${qlSessionData.length} mục.`, "success");
}

function updateQuickLearnStats(grammarId, isCorrect) {
  if (!grammarStats[grammarId])
    grammarStats[grammarId] = { correct: 0, total: 0 };

  const stats = grammarStats[grammarId];
  stats.total += 1;
  if (isCorrect) stats.correct += 1;

  localStorage.setItem(STORAGE_KEYS.STATS, JSON.stringify(grammarStats));

  const incorrectCount = stats.total - stats.correct;
  if (learningStatus[grammarId] === "learned" && incorrectCount > 3) {
    learningStatus[grammarId] = "review";
    localStorage.setItem(
      STORAGE_KEYS.LEARNING_STATUS,
      JSON.stringify(learningStatus)
    );
    syncLearningStatusToFirebase(learningStatus);
  }

  syncStatsToFirebase(grammarStats);
}

function handleMCOptionClick(button, isCorrect, container, grammar) {
  container.querySelectorAll("button").forEach((b) => (b.disabled = true));

  const correctButton = Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent === grammar.structure
  );

  if (isCorrect) {
    button.style.backgroundColor = "green";
  } else {
    button.classList.add("incorrect");
    if (correctButton) correctButton.style.backgroundColor = "green";
  }

  updateQuickLearnStats(grammar.id, isCorrect);
}

function handlePairMatchClick(cardEl, type, selected, sessionData) {
  if (cardEl.classList.contains("correct")) return;

  if (selected[type]) selected[type].classList.remove("selected");
  selected[type] = cardEl;
  cardEl.classList.add("selected");

  if (selected.structure && selected.meaning) {
    const isMatch =
      selected.structure.dataset.id === selected.meaning.dataset.id;

    if (isMatch) {
      selected.structure.classList.add("correct");
      selected.meaning.classList.add("correct");
      updateQuickLearnStats(selected.structure.dataset.id, true);

      if (
        sessionData.length ===
        document.querySelectorAll(".card.correct").length / 2
      ) {
        dom.qlNextBtn.disabled = false;
      }
      selected.structure.classList.remove("selected");
      selected.meaning.classList.remove("selected");
      selected.structure = null;
      selected.meaning = null;
    } else {
      selected.structure.classList.add("incorrect");
      selected.meaning.classList.add("incorrect");
      const incorrectStructure = selected.structure;
      const incorrectMeaning = selected.meaning;
      selected.structure.classList.remove("selected");
      selected.meaning.classList.remove("selected");
      selected.structure = null;
      selected.meaning = null;
      setTimeout(() => {
        updateQuickLearnStats(incorrectStructure.dataset.id, false);
        incorrectStructure.classList.remove("incorrect");
        incorrectMeaning.classList.remove("incorrect");
      }, 500);
    }
  }
}

function showPairMatchHint(board) {
  const unsolved = Array.from(board.querySelectorAll(".card:not(.correct)"));
  if (unsolved.length === 0) return;

  const hintPair = board.querySelectorAll(
    `.card[data-id="${unsolved[0].dataset.id}"]`
  );
  hintPair.forEach((card) => (card.style.backgroundColor = "#ffc107"));
  setTimeout(
    () => hintPair.forEach((card) => (card.style.backgroundColor = "")),
    2000
  );
}

function normalizeAnswerString(str) {
  if (!str) return "";
  // NFKC normalization handles full-width to half-width conversion (e.g., ～/〜 -> ~)
  // and other compatibility characters.
  return str.normalize("NFKC")
    .trim()
    .toLowerCase();
}

function stripSpecialChars(str) {
  if (!str) return "";
  return str.replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();
}

function handleFillInput(input, grammar, resultP, statsSpan) {
  const userInput = normalizeAnswerString(input.value);
  const validAnswers = getValidAnswers(grammar.structure);

  const isExactMatch = validAnswers.includes(userInput);
  let maxSimilarity = 0;
  let isTextMatch = false;

  if (!isExactMatch) {
    // 1. Calculate max similarity for display purposes
    for (const answer of validAnswers) {
      const similarity = calculateSimilarity(userInput, answer);
      if (similarity > maxSimilarity) maxSimilarity = similarity;
    }

    // 2. Check for text-only match (ignoring special characters)
    const strippedUserInput = stripSpecialChars(userInput);
    for (const answer of validAnswers) {
      const strippedAnswer = stripSpecialChars(answer);
      if (strippedUserInput.length > 0 && strippedUserInput === strippedAnswer) {
        isTextMatch = true;
        break;
      }
    }
  } else {
    maxSimilarity = 1;
  }

  if (statsSpan)
    statsSpan.textContent = `Khớp: ${Math.round(maxSimilarity * 100)}%`;

  if (isExactMatch || isTextMatch) {
    resultP.textContent = "Chính xác!";
    resultP.style.color = "green";
    input.disabled = true;
    document.getElementById("ql-fill-hint-btn").disabled = true;
    document.getElementById("ql-skip-btn").disabled = true;
    dom.qlNextBtn.disabled = false;
    updateQuickLearnStats(grammar.id, true);
    setTimeout(() => dom.qlNextBtn.click(), 1000);
  }
}

function provideFillHint(input, answer) {
  const remaining = answer
    .split("")
    .filter((char) => !input.value.includes(char));
  if (remaining.length > 0) {
    input.value += remaining[Math.floor(Math.random() * remaining.length)];
  }
}

function handleSkipQuestion(grammarId, inputEl, resultEl) {
  // Cập nhật thống kê là trả lời sai
  updateQuickLearnStats(grammarId, false);

  const item = qlSessionData.splice(qlCurrentIndex, 1)[0];
  if (item) qlSessionData.push(item);

  // Hiển thị chi tiết ngữ pháp trong modal. Khi modal được đóng,
  // tự động chuyển sang câu tiếp theo.
  showGrammarDetails(grammarId);
  // Thiết lập hành động sẽ được thực thi khi modal đóng lại
  onModalCloseAction = handleNextStep;
}

function saveQuickLearnSession() {
  localStorage.setItem(
    STORAGE_KEYS.QL_SESSION,
    JSON.stringify({
      qlSessionData,
      qlCurrentIndex,
      qlCurrentStep,
      qlNewItems,
      qlIsReviewSession,
    })
  );
}

function resumeQuickLearnSession(sessionState) {
  if (!confirm("Tiếp tục phiên học chưa hoàn thành?")) {
    localStorage.removeItem(STORAGE_KEYS.QL_SESSION);
    return;
  }

  qlSessionData = sessionState.qlSessionData || [];
  qlCurrentIndex = sessionState.qlCurrentIndex || 0;
  qlCurrentStep = sessionState.qlCurrentStep || 0;
  qlNewItems = sessionState.qlNewItems || [];
  qlIsReviewSession = sessionState.qlIsReviewSession || false;

  dom.quickLearnContainer.style.display = "block";
  dom.startQuickLearnBtn.style.display = "none";
  dom.nextSessionOptions.style.display = "none";
  loadQuickLearnStep();
}

function updateQLProgress() {
  if (!dom.qlProgressBar) return;

  const total = qlSessionData.length * 4;
  const completed = qlCurrentStep * qlSessionData.length + qlCurrentIndex;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  dom.qlProgressBar.style.width = `${percentage}%`;
  dom.qlProgressBar.textContent = `Progress: ${completed}/${total}`;
}

// ============= UTILITY FUNCTIONS =============
function getTodayString() {
  return new Date().toISOString().slice(0, 10);
}

function calculateSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;

  const m = str1.length,
    n = str2.length;
  const dp = Array(m + 1)
    .fill(0)
    .map(() => Array(n + 1).fill(0));

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

function getValidAnswers(structureString) {
  const answers = new Set();
  answers.add(normalizeAnswerString(structureString));

  // Tách phần trong ngoặc, ví dụ: "A (B)" -> "A" và "B". 
  // Regex này xử lý cả ngoặc full-width và half-width.
  const match = structureString.trim().match(/(.+?)\s*[\(（]([^）)]*)/);
  if (match) {
    answers.add(normalizeAnswerString(match[1]));
    answers.add(normalizeAnswerString(match[2]));
  }
  return Array.from(answers).filter(Boolean);
}

function populateQuickLearnLevelFilter() {
  if (!dom.quickLearnLevelFilter) return;

  const levels = new Set(appGrammarData.map((g) => g.level).filter(Boolean));
  const sortedLevels = Array.from(levels).sort();

  dom.quickLearnLevelFilter.innerHTML = ""; // Clear existing options

  const allOption = document.createElement("option");
  allOption.value = "all";
  allOption.textContent = "Tất cả Level";
  dom.quickLearnLevelFilter.appendChild(allOption);

  sortedLevels.forEach((level) => {
    const option = document.createElement("option");
    option.value = level;
    option.textContent = level;
    dom.quickLearnLevelFilter.appendChild(option);
  });
}

// ============= WORD FILE PARSING =============
function parseWordText(text) {
  const grammarArray = [];

  let normalizedText = normalizeHeaders(text);

  // 🔄 Tách khối ngữ pháp bằng dòng phân cách
  const blocks = normalizedText.split(/=+\n?/).filter((block) => block.trim());

  for (const [index, block] of blocks.entries()) {
    try {
      const lines = block
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      if (lines.length === 0) continue;

      // Dòng đầu tiên là tiêu đề: "1. ～ことにする～：　Quyết định làm..."
      const firstLineMatch = lines[0].match(
        /^\d+[.．]?\s*～?(.*?)～?\s*[:：]\s*(.*)$/
      );
      let structure = firstLineMatch ? firstLineMatch[1].trim() : "";
      const meaning = firstLineMatch ? firstLineMatch[2].trim() : "";

      if (!structure || !meaning) {
        console.warn(
          `⚠️ Could not recognize the title in block ${index + 1}:`,
          lines[0]
        );
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

      // Bắt đầu từ dòng thứ 2 (sau tiêu đề)
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];

        // Kiểm tra section headers
        if (line.match(/^Giải\s*thích\s*[:：]?$/i)) {
          flushBuffer();
          currentSection = "Giải thích";
          continue;
        }
        if (line.match(/^Ví\s*(dụ|vụ)\s*[:：]?$/i)) {
          flushBuffer();
          currentSection = "Ví dụ";
          continue;
        }
        if (line.match(/^Chú\s*ý\s*[:：]?$/i)) {
          flushBuffer();
          currentSection = "Chú ý";
          continue;
        }

        // Nếu không phải header, thêm vào buffer của section hiện tại
        if (currentSection) {
          buffer.push(line);
        } else {
          // Nếu chưa có section, mặc định là Giải thích
          currentSection = "Giải thích";
          buffer.push(line);
        }
      }

      // Flush buffer cuối cùng
      flushBuffer();

      grammarArray.push({
        id: String(index + 1),
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

function normalizeHeaders(text) {
  return text
    .replace(/\r/g, "")
    .replace(/^Cấu trúc\s*[:：]?/gim, "")
    .replace(/^Ý nghĩa\s*[:：]?/gim, "Ý nghĩa:")
    .replace(/^(Giải\s*thích|Giai\s*thich)\s*[:：]?/gim, "Giải thích:")
    .replace(/^(Ví\s*(dụ|vụ)|Vi\s*du)\s*[:：]?/gim, "Ví dụ:")
    .replace(/^(Chú\s*ý|Chu\s*y)\s*[:：]?/gim, "Chú ý:")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseExamples(content) {
  const lines = content
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const examples = [];
  const isJapanese = (s) =>
    /[\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/.test(s);

  let currentExample = null;

  for (const line of lines) {
    if (isJapanese(line)) {
      // Nếu có example đang chờ Vietnamese translation, lưu nó trước
      if (currentExample && currentExample.vi === "") {
        examples.push(currentExample);
      }
      // Bắt đầu example mới với Japanese text
      currentExample = { jp: line, vi: "" };
    } else if (currentExample) {
      // Nếu có example đang chờ và dòng này là Vietnamese
      if (currentExample.vi === "") {
        currentExample.vi = line;
        examples.push(currentExample);
        currentExample = null;
      }
    }
    // Bỏ qua các dòng không phải Japanese nếu không có example đang chờ
  }

  // Thêm example cuối cùng nếu còn
  if (currentExample && currentExample.jp) {
    examples.push(currentExample);
  }

  return examples;
}

function preprocessExamples(text) {
  return text.replace(
    /([一-龯ぁ-ゔァ-ヴー々〆〤。！？])\s*([A-Za-zÀ-ỹ])/g,
    "$1\n$2"
  );
}

// ============= FIREBASE SYNC =============
export async function loadSharedData(forceRefresh = false) {
  if (cachedData && !forceRefresh) return cachedData;

  let appGrammarData = [];
  let grammarStats = {};
  let learningStatus = {};
  let dailyGoal = {};

  const localData = {
    grammar: JSON.parse(localStorage.getItem(STORAGE_KEYS.DATA)),
    stats: JSON.parse(localStorage.getItem(STORAGE_KEYS.STATS)),
    status: JSON.parse(localStorage.getItem(STORAGE_KEYS.LEARNING_STATUS)),
    goal: JSON.parse(localStorage.getItem(STORAGE_KEYS.DAILY_GOAL)),
  };

  try {
    const grammarSnapshot = await getDocs(collection(db, "grammar"));
    const firebaseData = [];
    grammarSnapshot.forEach((d) =>
      firebaseData.push({ id: d.id, ...d.data() })
    );

    if (firebaseData.length > 0) {
      appGrammarData = firebaseData.sort((a, b) => a.id - b.id);
      localStorage.setItem(STORAGE_KEYS.DATA, JSON.stringify(appGrammarData));
    } else if (localData.grammar) {
      appGrammarData = localData.grammar;
    } else {
      appGrammarData = [...defaultGrammarData];
    }

    const statsSnap = await getDoc(doc(db, "stats", FIREBASE_DOC_IDS.STATS));
    grammarStats = statsSnap.exists()
      ? statsSnap.data()
      : localData.stats || {};
    if (grammarStats !== localData.stats)
      localStorage.setItem(STORAGE_KEYS.STATS, JSON.stringify(grammarStats));

    const statusSnap = await getDoc(
      doc(db, "learningStatus", FIREBASE_DOC_IDS.LEARNING_STATUS)
    );
    learningStatus = statusSnap.exists()
      ? statusSnap.data()
      : localData.status || {};
    if (learningStatus !== localData.status)
      localStorage.setItem(
        STORAGE_KEYS.LEARNING_STATUS,
        JSON.stringify(learningStatus)
      );

    const goalSnap = await getDoc(
      doc(db, "dailyGoals", FIREBASE_DOC_IDS.DAILY_GOAL)
    );
    dailyGoal = goalSnap.exists() ? goalSnap.data() : localData.goal || {};
    if (dailyGoal !== localData.goal)
      localStorage.setItem(STORAGE_KEYS.DAILY_GOAL, JSON.stringify(dailyGoal));
  } catch (e) {
    console.error("Firebase error, using local data:", e);
    appGrammarData = localData.grammar || [...defaultGrammarData];
    grammarStats = localData.stats || {};
    learningStatus = localData.status || {};
    dailyGoal = localData.goal || {};
  }

  cachedData = { appGrammarData, grammarStats, learningStatus, dailyGoal };
  return cachedData;
}

export async function syncStatsToFirebase(data) {
  if (!data) return;
  try {
    await setDoc(doc(db, "stats", FIREBASE_DOC_IDS.STATS), data, {
      merge: true,
    });
  } catch (e) {
    console.error("Sync stats error:", e);
  }
}

export async function syncLearningStatusToFirebase(data) {
  if (!data) return;
  try {
    await setDoc(
      doc(db, "learningStatus", FIREBASE_DOC_IDS.LEARNING_STATUS),
      data
    );
  } catch (e) {
    console.error("Sync status error:", e);
  }
}

export async function syncDailyGoalToFirebase(data) {
  if (!data) return;
  try {
    await setDoc(doc(db, "dailyGoals", FIREBASE_DOC_IDS.DAILY_GOAL), data);
  } catch (e) {
    console.error("Sync goal error:", e);
  }
}

async function syncDataToFirebase() {
  if (!appGrammarData?.length) return;

  try {
    const batch = writeBatch(db);
    const grammarRef = collection(db, "grammar");

    const oldDocs = await getDocs(grammarRef);
    oldDocs.forEach((d) => batch.delete(d.ref));

    appGrammarData.forEach((item) => {
      batch.set(doc(grammarRef, String(item.id)), item);
    });

    await batch.commit();
    console.log("✅ Grammar data synced");
  } catch (e) {
    console.error("Sync error:", e);
  }
}

async function clearAllFirebaseData() {
  try {
    const batch = writeBatch(db);

    const grammarDocs = await getDocs(collection(db, "grammar"));
    grammarDocs.forEach((d) => batch.delete(d.ref));

    batch.delete(doc(db, "stats", FIREBASE_DOC_IDS.STATS));
    batch.delete(doc(db, "learningStatus", FIREBASE_DOC_IDS.LEARNING_STATUS));
    batch.delete(doc(db, "dailyGoals", FIREBASE_DOC_IDS.DAILY_GOAL));

    await batch.commit();
    console.log("✅ All data cleared");
    return true;
  } catch (e) {
    console.error("Clear error:", e);
    showToast("Lỗi xóa dữ liệu server.", "error");
    return false;
  }
}

async function syncSingleGrammarItemToFirebase(item) {
  if (!item?.id) return;
  try {
    await setDoc(doc(db, "grammar", String(item.id)), item);
  } catch (e) {
    console.error(`Sync item ${item.id} error:`, e);
    showToast(`Lỗi đồng bộ ${item.structure}.`, "error");
  }
}