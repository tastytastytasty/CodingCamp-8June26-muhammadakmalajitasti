/* ============================================================
  Bad Habit Tracker — script.js
  Features:
  - Add / delete activities (LocalStorage)
  - Custom categories (LocalStorage)
  - Total wasted time (real-time)
  - Pie chart (Chart.js) — top 5 + "Lainnya"
  - Monthly summary view
  - Sort: duration desc/asc, category name
  - Highlight over-limit activities
  - Dark / Light mode (LocalStorage preference)
   ============================================================ */

"use strict";

/* ── Constants ── */
const STORAGE_KEY_ACTIVITIES = "bht_activities";
const STORAGE_KEY_CATEGORIES = "bht_categories";
const STORAGE_KEY_THEME = "bht_theme";
const STORAGE_KEY_LIMIT = "bht_limit";

/** Chart.js color palette (ordered per spec) */
const CHART_COLORS = [
  "#93C5FD",
  "#60A5FA",
  "#3B82F6",
  "#2563EB",
  "#1D4ED8",
  "#1E40AF"
];

/** Default built-in categories — cannot be deleted */
const DEFAULT_CATEGORIES = ["TikTok", "Instagram", "YouTube"];

/** Fallback category name when deleting a used category */
const FALLBACK_CATEGORY = "Lainnya";

/* ── State ── */
let activities = []; // { id, name, durationMinutes, category, createdAt }
let categories = []; // string[]
let limitMinutes = 0; // 0 = no limit
let currentView = "all"; // 'all' | 'monthly'
let currentSort = "default";
let chartInstance = null;

/* ── DOM refs ── */
const $ = (id) => document.getElementById(id);

const htmlEl = document.documentElement;
const themeToggle = $("themeToggle");
const themeIcon = $("themeIcon");
const totalTimeEl = $("totalTime");
const activityForm = $("activityForm");
const activityNameEl = $("activityName");
const durationEl = $("duration");
const durationUnitEl = $("durationUnit");
const categoryEl = $("category");
const newCategoryEl = $("newCategory");
const addCategoryBtn = $("addCategoryBtn");
const activityListEl = $("activityList");
const listEmptyEl = $("listEmpty");
const pieChartEl = $("pieChart");
const chartEmptyEl = $("chartEmpty");
const limitInputEl = $("limitInput");
const setLimitBtn = $("setLimitBtn");
const limitDisplayEl = $("limitDisplay");
const sortSelectEl = $("sortSelect");
const btnViewAll = $("btnViewAll");
const btnViewMonthly = $("btnViewMonthly");
const monthlySummary = $("monthlySummary");
const monthlyContent = $("monthlyContent");

/* ============================================================
  INIT
   ============================================================ */
function init() {
  loadFromStorage();
  applyTheme(loadTheme());
  applyLimit();
  populateCategorySelect();
  renderCategoryManager();
  renderAll();

  // Category modal buttons
  $("closeCatModalBtn").addEventListener("click", closeDeleteModal);
  $("modalCancelBtn").addEventListener("click", closeDeleteModal);
  $("modalConfirmBtn").addEventListener("click", confirmDeleteCategory);
  // Close category modal on backdrop click
  $("deleteCatModal").addEventListener("click", (e) => {
    if (e.target === $("deleteCatModal")) closeDeleteModal();
  });

  // Activity delete modal buttons
  $("closeActivityModalBtn").addEventListener("click", closeDeleteActivityModal);
  $("activityModalCancelBtn").addEventListener("click", closeDeleteActivityModal);
  $("activityModalConfirmBtn").addEventListener("click", confirmDeleteActivity);
  // Close activity modal on backdrop click
  $("deleteActivityModal").addEventListener("click", (e) => {
    if (e.target === $("deleteActivityModal")) closeDeleteActivityModal();
  });
  // Close modals on Escape key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeDeleteModal();
      closeDeleteActivityModal();
    }
  });
}

/* ============================================================
  LOCAL STORAGE
   ============================================================ */
function loadFromStorage() {
  try {
    activities = JSON.parse(localStorage.getItem(STORAGE_KEY_ACTIVITIES)) || [];
    const saved =
      JSON.parse(localStorage.getItem(STORAGE_KEY_CATEGORIES)) || [];
    // merge defaults + saved (no duplicates, case-insensitive)
    categories = mergeCategories(DEFAULT_CATEGORIES, saved);
    limitMinutes = parseInt(localStorage.getItem(STORAGE_KEY_LIMIT), 10) || 0;
  } catch {
    activities = [];
    categories = [...DEFAULT_CATEGORIES];
    limitMinutes = 0;
  }
}

function saveActivities() {
  localStorage.setItem(STORAGE_KEY_ACTIVITIES, JSON.stringify(activities));
}

function saveCategories() {
  // only persist user-added (non-default) categories
  const custom = categories.filter((c) => !DEFAULT_CATEGORIES.includes(c));
  localStorage.setItem(STORAGE_KEY_CATEGORIES, JSON.stringify(custom));
}

function loadTheme() {
  return localStorage.getItem(STORAGE_KEY_THEME) || "light";
}

function saveTheme(theme) {
  localStorage.setItem(STORAGE_KEY_THEME, theme);
}

/** Merge arrays, deduplicate case-insensitively, preserve order */
function mergeCategories(base, extra) {
  const result = [...base];
  extra.forEach((c) => {
    if (!result.some((r) => r.toLowerCase() === c.toLowerCase())) {
      result.push(c);
    }
  });
  return result;
}

/* ============================================================
  THEME
   ============================================================ */
function applyTheme(theme) {
  htmlEl.setAttribute("data-theme", theme);
  themeIcon.className = theme === "dark" ? "bx bx-sun" : "bx bx-moon";
  if (chartInstance) updateChart();
}

themeToggle.addEventListener("click", () => {
  const current = htmlEl.getAttribute("data-theme");
  const next = current === "dark" ? "light" : "dark";
  applyTheme(next);
  saveTheme(next);
});

/* ============================================================
  CATEGORY SELECT
   ============================================================ */
function populateCategorySelect() {
  const prev = categoryEl.value;
  categoryEl.innerHTML = "";
  categories.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    categoryEl.appendChild(opt);
  });
  // restore previous selection if still valid
  if (prev && categories.includes(prev)) categoryEl.value = prev;
}

/* ── Add custom category ── */
addCategoryBtn.addEventListener("click", () => {
  const val = newCategoryEl.value.trim();
  const errEl = $("errNewCat");

  if (!val) {
    showError(errEl, "Nama kategori tidak boleh kosong.");
    return;
  }
  if (val.length > 40) {
    showError(errEl, "Nama kategori maksimal 40 karakter.");
    return;
  }
  if (categories.some((c) => c.toLowerCase() === val.toLowerCase())) {
    showError(errEl, "Kategori sudah ada.");
    return;
  }

  clearError(errEl);
  categories.push(val);
  saveCategories();
  populateCategorySelect();
  renderCategoryManager();
  // auto-select newly added
  categoryEl.value = val;
  newCategoryEl.value = "";
});

/* ============================================================
  CATEGORY MANAGER — render list of custom categories
   ============================================================ */
function renderCategoryManager() {
  const listEl = $("customCatList");
  if (!listEl) return;

  const customCats = categories.filter((c) => !DEFAULT_CATEGORIES.includes(c));

  if (customCats.length === 0) {
    listEl.innerHTML =
      '<p class="cat-manager-empty">Belum ada kategori kustom.</p>';
    return;
  }

  listEl.innerHTML = customCats
    .map((cat) => {
      const usageCount = activities.filter((a) => a.category === cat).length;
      return `
        <div class="cat-manager-item">
          <span class="cat-manager-name">${escapeHtml(cat)}</span>
          ${usageCount > 0
            ? `<span class="cat-manager-usage">${usageCount} aktivitas</span>`
            : ""
          }
          <button
            class="btn btn-danger btn-icon-sm"
            aria-label="Hapus kategori ${escapeHtml(cat)}"
            data-cat="${escapeHtml(cat)}"
            title="Hapus kategori"
          ><i class="bx bx-x"></i></button>
        </div>
      `;
    })
    .join("");

  // Attach delete handlers
  listEl.querySelectorAll(".btn-danger[data-cat]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const catName = btn.getAttribute("data-cat");
      openDeleteModal(catName);
    });
  });
}

/* ============================================================
  DELETE CATEGORY MODAL
   ============================================================ */
let pendingDeleteCategory = null;

function openDeleteModal(catName) {
  pendingDeleteCategory = catName;
  const usageCount = activities.filter((a) => a.category === catName).length;

  $("modalCatName").textContent = catName;
  const warningEl = $("modalUsageWarning");

  if (usageCount > 0) {
    warningEl.textContent = `Kategori ini masih digunakan oleh ${usageCount} aktivitas. Semua aktivitas tersebut akan dipindahkan ke kategori "Lainnya".`;
    warningEl.style.display = "block";
  } else {
    warningEl.style.display = "none";
  }

  $("deleteCatModal").classList.add("modal-open");
}

function closeDeleteModal() {
  pendingDeleteCategory = null;
  $("deleteCatModal").classList.remove("modal-open");
}

function confirmDeleteCategory() {
  if (!pendingDeleteCategory) return;
  deleteCategory(pendingDeleteCategory);
  closeDeleteModal();
}

function deleteCategory(catName) {
  // Move affected activities to FALLBACK_CATEGORY
  const usageCount = activities.filter((a) => a.category === catName).length;
  if (usageCount > 0) {
    // Ensure fallback category exists in list
    if (!categories.some((c) => c.toLowerCase() === FALLBACK_CATEGORY.toLowerCase())) {
      categories.push(FALLBACK_CATEGORY);
    }
    activities = activities.map((a) =>
      a.category === catName ? { ...a, category: FALLBACK_CATEGORY } : a
    );
    saveActivities();
  }

  // Remove from categories array
  categories = categories.filter((c) => c !== catName);
  saveCategories();

  // Refresh all UI
  populateCategorySelect();
  renderCategoryManager();
  renderAll();
}

/* ============================================================
  FORM SUBMIT — Add Activity
   ============================================================ */
activityForm.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!validateForm()) return;

  const rawDuration = parseFloat(durationEl.value);
  const unit = durationUnitEl.value;
  const minutes =
    unit === "hours" ? Math.round(rawDuration * 60) : Math.round(rawDuration);

  const activity = {
    id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
    name: activityNameEl.value.trim(),
    durationMinutes: minutes,
    category: categoryEl.value,
    createdAt: new Date().toISOString(),
  };

  activities.unshift(activity); // newest first
  saveActivities();
  renderAll();
  activityForm.reset();
});

/* ── Form validation ── */
function validateForm() {
  let valid = true;

  const name = activityNameEl.value.trim();
  if (!name) {
    showError($("errName"), "Nama aktivitas wajib diisi.");
    valid = false;
  } else if (name.length > 80) {
    showError($("errName"), "Nama maksimal 80 karakter.");
    valid = false;
  } else {
    clearError($("errName"));
  }

  const dur = parseFloat(durationEl.value);
  if (!durationEl.value || isNaN(dur) || dur <= 0) {
    showError($("errDuration"), "Durasi wajib diisi dan harus lebih dari 0.");
    valid = false;
  } else {
    clearError($("errDuration"));
  }

  if (!categoryEl.value) {
    showError($("errCategory"), "Pilih kategori.");
    valid = false;
  } else {
    clearError($("errCategory"));
  }

  return valid;
}

function showError(el, msg) {
  el.textContent = msg;
}
function clearError(el) {
  el.textContent = "";
}

/* ============================================================
   DELETE Activity — with confirmation modal
   ============================================================ */
let pendingDeleteActivityId = null;

/** Open modal pre-filled with activity details; auto-focus Batal */
function openDeleteActivityModal(id) {
  const activity = activities.find((a) => a.id === id);
  if (!activity) return;

  pendingDeleteActivityId = id;

  $("modalActivityName").textContent     = activity.name;
  $("modalActivityDuration").textContent = formatMinutes(activity.durationMinutes);
  $("modalActivityCategory").textContent = activity.category;

  const modal = $("deleteActivityModal");
  modal.classList.add("modal-open");

  // Auto-focus Batal to prevent accidental confirm
  requestAnimationFrame(() => $("activityModalCancelBtn").focus());
}

function closeDeleteActivityModal() {
  pendingDeleteActivityId = null;
  $("deleteActivityModal").classList.remove("modal-open");
}

function confirmDeleteActivity() {
  if (!pendingDeleteActivityId) return;
  deleteActivity(pendingDeleteActivityId);
  closeDeleteActivityModal();
}

function deleteActivity(id) {
  activities = activities.filter((a) => a.id !== id);
  saveActivities();
  renderAll();
}

/* ============================================================
  LIMIT
   ============================================================ */
function applyLimit() {
  if (limitMinutes > 0) {
    limitInputEl.value = limitMinutes;
    limitDisplayEl.textContent = `Batas aktif: ${formatMinutes(limitMinutes)}`;
  } else {
    limitDisplayEl.textContent = "Belum ada batas.";
  }
}

setLimitBtn.addEventListener("click", () => {
  const val = parseInt(limitInputEl.value, 10);
  if (isNaN(val) || val <= 0) {
    limitMinutes = 0;
    limitDisplayEl.textContent = "Batas dihapus.";
  } else {
    limitMinutes = val;
    limitDisplayEl.textContent = `Batas aktif: ${formatMinutes(val)}`;
  }
  localStorage.setItem(STORAGE_KEY_LIMIT, limitMinutes);
  renderActivityList();
});

/* ============================================================
  SORT
   ============================================================ */
sortSelectEl.addEventListener("change", () => {
  currentSort = sortSelectEl.value;
  renderActivityList();
});

function getSortedActivities() {
  const arr = [...activities];
  switch (currentSort) {
    case "dur-desc":
      return arr.sort((a, b) => b.durationMinutes - a.durationMinutes);
    case "dur-asc":
      return arr.sort((a, b) => a.durationMinutes - b.durationMinutes);
    case "category":
      return arr.sort((a, b) => a.category.localeCompare(b.category));
    default:
      return arr; // newest-first (already unshift on add)
  }
}

/* ============================================================
  VIEW TOGGLE
   ============================================================ */
btnViewAll.addEventListener("click", () => switchView("all"));
btnViewMonthly.addEventListener("click", () => switchView("monthly"));

function switchView(view) {
  currentView = view;
  btnViewAll.classList.toggle("active", view === "all");
  btnViewMonthly.classList.toggle("active", view === "monthly");
  monthlySummary.classList.toggle("hidden", view !== "monthly");
  if (view === "monthly") renderMonthlySummary();
}

/* ============================================================
  RENDER — orchestrator
   ============================================================ */
function renderAll() {
  renderTotalTime();
  renderActivityList();
  renderChart();
  if (currentView === "monthly") renderMonthlySummary();
}

/* ── Total Time ── */
function renderTotalTime() {
  const total = activities.reduce((sum, a) => sum + a.durationMinutes, 0);
  totalTimeEl.textContent = formatMinutes(total);
}

/* ── Activity List ── */
function renderActivityList() {
  const sorted = getSortedActivities();
  activityListEl.innerHTML = "";

  if (sorted.length === 0) {
    listEmptyEl.style.display = "block";
    return;
  }
  listEmptyEl.style.display = "none";

  sorted.forEach((activity) => {
    const isOver = limitMinutes > 0 && activity.durationMinutes > limitMinutes;
    const catColor = getCategoryColor(activity.category);

    const li = document.createElement("li");
    li.className = "activity-item" + (isOver ? " over-limit" : "");
    li.dataset.id = activity.id;

    li.innerHTML = `
      <span class="cat-dot" style="background:${catColor};"></span>
      <div class="item-info">
        <div class="item-name">${escapeHtml(activity.name)}</div>
        <div class="item-meta">
          ${formatMinutes(activity.durationMinutes)} &middot;
          ${formatDate(activity.createdAt)}
        </div>
      </div>
      <div class="item-badges">
        <span class="badge badge-category">${escapeHtml(activity.category)}</span>
        ${isOver ? '<span class="badge badge-warn">⚠️ Melebihi Batas</span>' : ""}
        <button class="btn btn-danger" aria-label="Hapus aktivitas ${escapeHtml(activity.name)}">
          Hapus
        </button>
      </div>
    `;

    li.querySelector(".btn-danger").addEventListener("click", () =>
      openDeleteActivityModal(activity.id),
    );
    activityListEl.appendChild(li);
  });
}

/* ── Pie Chart ── */
function renderChart() {
  // Aggregate duration per category
  const map = {};
  activities.forEach((a) => {
    map[a.category] = (map[a.category] || 0) + a.durationMinutes;
  });

  const entries = Object.entries(map).sort((a, b) => b[1] - a[1]);

  if (entries.length === 0) {
    chartEmptyEl.style.display = "block";
    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }
    return;
  }
  chartEmptyEl.style.display = "none";

  let labels, data, colors;

  if (entries.length <= 6) {
    labels = entries.map((e) => e[0]);
    data = entries.map((e) => e[1]);
    colors = entries.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]);
  } else {
    // Top 5 + "Lainnya"
    const top5 = entries.slice(0, 5);
    const others = entries.slice(5);
    const otherTotal = others.reduce((s, e) => s + e[1], 0);
    labels = [...top5.map((e) => e[0]), "Lainnya"];
    data = [...top5.map((e) => e[1]), otherTotal];
    colors = labels.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]);
  }

  const isDark = htmlEl.getAttribute("data-theme") === "dark";
  const legendColor = isDark ? "#F1F5F9" : "#1E293B";

  const chartData = {
    labels,
    datasets: [
      {
        data,
        backgroundColor: colors,
        borderColor: isDark ? "#1E293B" : "#FFFFFF",
        borderWidth: 2,
        hoverOffset: 8,
      },
    ],
  };

  const options = {
    responsive: true,
    plugins: {
      legend: {
        position: "bottom",
        labels: {
          color: legendColor,
          font: { size: 12, family: "'Segoe UI', system-ui, sans-serif" },
          padding: 12,
          boxWidth: 12,
          boxHeight: 12,
        },
      },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const total = ctx.dataset.data.reduce((s, v) => s + v, 0);
            const pct = total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : 0;
            return ` ${formatMinutes(ctx.parsed)} (${pct}%)`;
          },
        },
      },
    },
  };

  if (chartInstance) {
    // Update existing chart (avoid flicker)
    chartInstance.data = chartData;
    chartInstance.options = options;
    chartInstance.update();
  } else {
    chartInstance = new Chart(pieChartEl, {
      type: "pie",
      data: chartData,
      options,
    });
  }
}

/** Alias used by theme toggle */
function updateChart() {
  renderChart();
}

/* ── Monthly Summary ── */
function renderMonthlySummary() {
  if (activities.length === 0) {
    monthlyContent.innerHTML =
      '<p style="color:var(--text-muted);text-align:center;">Belum ada data.</p>';
    return;
  }

  // Group by YYYY-MM
  const monthMap = {};
  activities.forEach((a) => {
    const key = a.createdAt.slice(0, 7); // "YYYY-MM"
    if (!monthMap[key]) monthMap[key] = [];
    monthMap[key].push(a);
  });

  // Sort months descending
  const months = Object.keys(monthMap).sort((a, b) => b.localeCompare(a));

  monthlyContent.innerHTML = months
    .map((month) => {
      const items = monthMap[month];
      const total = items.reduce((s, a) => s + a.durationMinutes, 0);

      // Per-category breakdown
      const catMap = {};
      items.forEach((a) => {
        catMap[a.category] = (catMap[a.category] || 0) + a.durationMinutes;
      });
      const catEntries = Object.entries(catMap).sort((a, b) => b[1] - a[1]);

      const [year, monthNum] = month.split("-");
      const monthLabel = new Date(
        parseInt(year),
        parseInt(monthNum) - 1,
        1,
      ).toLocaleDateString("id-ID", { month: "long", year: "numeric" });

      return `
      <div class="monthly-month">
        <div class="monthly-month-header">
          <strong>${monthLabel}</strong>
          <span>${items.length} aktivitas &middot; Total: ${formatMinutes(total)}</span>
        </div>
        <ul class="monthly-cat-list">
          ${catEntries
            .map(
              ([cat, mins]) => `
            <li class="monthly-cat-item">
              <strong>${escapeHtml(cat)}</strong>
              <span>${formatMinutes(mins)}</span>
            </li>
          `,
            )
            .join("")}
        </ul>
      </div>
    `;
    })
    .join("");
}

/* ============================================================
  HELPERS
   ============================================================ */

/** Format minutes → "X Jam Y Menit" */
function formatMinutes(totalMinutes) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} Menit`;
  if (m === 0) return `${h} Jam`;
  return `${h} Jam ${m} Menit`;
}

/** Format ISO date string → locale date */
function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "-";
  }
}

/** Map category name → consistent chart color */
function getCategoryColor(category) {
  const allCats = [...new Set(activities.map((a) => a.category))].sort();
  const idx = allCats.indexOf(category);
  return CHART_COLORS[idx % CHART_COLORS.length];
}

/** Escape HTML to prevent XSS */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* ============================================================
  BOOT
   ============================================================ */
document.addEventListener("DOMContentLoaded", init);
