// ─────────────────────────────────────────────────
//  APPLICATION VAULT  —  app.js
//  Local Storage keys
//    "av_universities"  →  JSON array
//    "av_stories"       →  JSON array
//    "av_nextUniId"     →  number
//    "av_nextStoryId"   →  number
// ─────────────────────────────────────────────────

// ── Local Storage helpers ──────────────────────────
const LS = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw !== null ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn("LocalStorage write failed:", e);
    }
  },
};

// ── Load data (starts empty until the user adds entries) ──
let universities = LS.get("av_universities",  []);
let stories      = LS.get("av_stories",       []);
let nextUniId    = LS.get("av_nextUniId",     1);
let nextStoryId  = LS.get("av_nextStoryId",   1);

// ── Persist helpers ────────────────────────────────
function saveUniversitiesToStorage() {
  LS.set("av_universities", universities);
  LS.set("av_nextUniId",    nextUniId);
}

function saveStoriesToStorage() {
  LS.set("av_stories",    stories);
  LS.set("av_nextStoryId", nextStoryId);
}

// ── App state ──────────────────────────────────────
let currentPage      = "dashboard";
let currentUniFilter = "all";
let currentTagFilter = "all";
let deleteCallback   = null;

// ── DOM helpers ────────────────────────────────────
const $  = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function sanitizeClass(str) {
  return str.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9-]/g, "");
}

function accentClass(tags) {
  if (!tags || tags.length === 0) return "accent-default";
  return "accent-" + sanitizeClass(tags[0]);
}

// ── Navigation ─────────────────────────────────────
function navigateTo(page) {
  currentPage = page;
  $$(".page").forEach(p => p.classList.add("hidden"));
  $(`#page-${page}`).classList.remove("hidden");
  $$(".nav-item").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.page === page);
  });
  if (page === "dashboard")    renderDashboard();
  if (page === "universities") renderUniversities();
  if (page === "stories")      renderStories();
}

// ── Dashboard ──────────────────────────────────────
function renderDashboard() {
  const total      = universities.length;
  const submitted  = universities.filter(u => u.status === "Submitted" || u.status === "Accepted").length;
  const inProgress = universities.filter(u => u.status === "In Progress").length;
  const notStarted = universities.filter(u => u.status === "Not Started" || u.status === "Researching").length;
  const storyCount = stories.length;

  // Upcoming: exclude already done, take first 4
  const upcoming = universities
    .filter(u => !["Submitted","Accepted","Rejected"].includes(u.status))
    .slice(0, 4);

  // Stats strip
  $("#dashboard-stats").innerHTML = `
    <div class="stat-box">
      <div class="stat-num">${total}</div>
      <div class="stat-lbl">Universities</div>
    </div>
    <div class="stat-box">
      <div class="stat-num">${storyCount}</div>
      <div class="stat-lbl">Stories saved</div>
    </div>
    <div class="stat-box">
      <div class="stat-num">${inProgress}</div>
      <div class="stat-lbl">In progress</div>
    </div>
  `;

  // Progress bar
  const pct = total > 0 ? Math.round((submitted / total) * 100) : 0;
  $("#progress-pct").textContent  = pct + "%";
  $("#progress-bar").style.width  = pct + "%";
  $("#progress-meta").innerHTML   =
    `<span>${submitted} submitted · ${inProgress} in progress · ${notStarted} not started</span>`;

  // Upcoming deadlines
  const deadlinesEl = $("#dashboard-deadlines");
  deadlinesEl.innerHTML = upcoming.length === 0
    ? `<p style="font-size:13px;color:var(--text-3);padding:8px 0">No upcoming deadlines.</p>`
    : upcoming.map(u => `
        <div class="deadline-row">
          <div>
            <div class="deadline-uni">${u.name}</div>
            <div class="deadline-type">${u.type}</div>
          </div>
          <div class="deadline-date">${u.deadline || "—"}</div>
        </div>
      `).join("");

  // Recent stories (newest first, up to 4)
  const recent = [...stories].reverse().slice(0, 4);
  const storiesEl = $("#dashboard-stories");
  storiesEl.innerHTML = recent.length === 0
    ? `<p style="font-size:13px;color:var(--text-3);padding:8px 0">No stories yet.</p>`
    : recent.map(s => `
        <div class="story-row">
          <div class="story-dot"></div>
          <div class="story-row-name">${s.title}</div>
          <div class="story-row-tag">${s.tags[0] || ""}</div>
        </div>
      `).join("");
}

// ── Universities ───────────────────────────────────
function renderUniversities() {
  const filter = currentUniFilter;
  const filtered = filter === "all"
    ? universities
    : universities.filter(u => u.status === filter || u.type === filter);

  $("#uni-filters").querySelector("[data-filter='all']").textContent = `All (${universities.length})`;

  const grid  = $("#uni-grid");
  const empty = $("#uni-empty");
  empty.classList.add("hidden"); // legacy empty-state no longer used

  if (universities.length === 0) {
    // First-visit / no entries at all → show placeholder card
    grid.innerHTML = `
      <div class="placeholder-card">
        <div class="placeholder-icon">🏛️</div>
        <div class="placeholder-title">Welcome to Universities</div>
        <div class="placeholder-desc">Track colleges, application deadlines, statuses, and personal notes here. Click "Add University" to begin building your college list.</div>
      </div>
    `;
    return;
  }

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="placeholder-card">
        <div class="placeholder-icon">🔍</div>
        <div class="placeholder-title">No matches</div>
        <div class="placeholder-desc">No universities match this filter yet.</div>
      </div>
    `;
    return;
  }

  grid.innerHTML = filtered.map(u => {
    const statusKey = "status-" + sanitizeClass(u.status);
    return `
      <div class="uni-card" data-id="${u.id}" onclick="openEditUniversity(${u.id})">
        <div class="uni-card-top">
          <div class="uni-name">${u.name}</div>
          <div class="status-badge ${statusKey}">${u.status}</div>
        </div>
        <div class="uni-meta">
          <span>${u.type}</span>
          ${u.deadline ? `<span class="uni-deadline-badge">${u.deadline}</span>` : ""}
        </div>
      </div>
    `;
  }).join("");
}

// ── Stories ────────────────────────────────────────
function renderStories() {
  const filter = currentTagFilter;
  const filtered = filter === "all"
    ? stories
    : stories.filter(s => s.tags.includes(filter));

  $("#story-filters").querySelector("[data-filter='all']").textContent = `All (${stories.length})`;

  const grid  = $("#story-grid");
  const empty = $("#story-empty");
  empty.classList.add("hidden"); // legacy empty-state no longer used

  if (stories.length === 0) {
    // First-visit / no entries at all → show placeholder card
    grid.innerHTML = `
      <div class="placeholder-card">
        <div class="placeholder-icon">📖</div>
        <div class="placeholder-title">Welcome to Story Bank</div>
        <div class="placeholder-desc">Save meaningful experiences, reflections, and personal growth moments that may become future essay topics. Click "Add Story" to create your first story.</div>
      </div>
    `;
    return;
  }

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="placeholder-card">
        <div class="placeholder-icon">🔍</div>
        <div class="placeholder-title">No matches</div>
        <div class="placeholder-desc">No stories match this filter yet.</div>
      </div>
    `;
    return;
  }

  grid.innerHTML = filtered.map(s => {
    const tagChips = s.tags
      .map(t => `<span class="tag-chip tag-${sanitizeClass(t)}">${t}</span>`)
      .join("");
    return `
      <div class="story-card" data-id="${s.id}" onclick="openEditStory(${s.id})">
        <div class="story-card-accent ${accentClass(s.tags)}"></div>
        <div class="story-card-title">${s.title}</div>
        ${s.reflection ? `<div class="story-card-reflection">${s.reflection}</div>` : ""}
        <div class="story-card-tags">${tagChips}</div>
      </div>
    `;
  }).join("");
}

// ── Modal helpers ──────────────────────────────────
function openModal(id) {
  $(`#${id}`).classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closeModal(id) {
  $(`#${id}`).classList.add("hidden");
  document.body.style.overflow = "";
}

// Backdrop click closes
$$(".modal-backdrop").forEach(backdrop => {
  backdrop.addEventListener("click", e => {
    if (e.target === backdrop) closeModal(backdrop.id);
  });
});

// [data-close] buttons
document.addEventListener("click", e => {
  const btn = e.target.closest("[data-close]");
  if (btn) closeModal(btn.dataset.close);
});

// ── University modal ───────────────────────────────
function resetUniversityModal() {
  $("#uni-edit-id").value    = "";
  $("#uni-name").value       = "";
  $("#uni-location").value   = "";
  $("#uni-type").value       = "Early Action";
  $("#uni-deadline").value   = "";
  $("#uni-notes").value      = "";
  $$(".status-opt").forEach(b => b.classList.remove("selected"));
  $$(".status-opt").forEach(b => {
    if (b.dataset.status === "Not Started") b.classList.add("selected");
  });
  $("#modal-uni-title").textContent = "Add university";
  $("#btn-save-uni").textContent    = "Add university";
  $("#btn-delete-uni").classList.add("hidden");
}

function openAddUniversity() {
  resetUniversityModal();
  openModal("modal-university");
  $("#uni-name").focus();
}

function openEditUniversity(id) {
  const u = universities.find(u => u.id === id);
  if (!u) return;

  $("#uni-edit-id").value  = id;
  $("#uni-name").value     = u.name;
  $("#uni-location").value = u.location || "";
  $("#uni-type").value     = u.type;
  $("#uni-deadline").value = u.deadline;
  $("#uni-notes").value    = u.notes;

  $$(".status-opt").forEach(b => {
    b.classList.toggle("selected", b.dataset.status === u.status);
  });

  $("#modal-uni-title").textContent = u.name;
  $("#btn-save-uni").textContent    = "Save changes";
  $("#btn-delete-uni").classList.remove("hidden");

  openModal("modal-university");
}

function saveUniversity() {
  const id   = $("#uni-edit-id").value;
  const name = $("#uni-name").value.trim();
  if (!name) { alert("Please enter a university name."); return; }

  const selected = $(".status-opt.selected");
  const status   = selected ? selected.dataset.status : "Not Started";

  const data = {
    name,
    location: $("#uni-location").value.trim(),
    type:     $("#uni-type").value,
    deadline: $("#uni-deadline").value.trim(),
    status,
    notes:    $("#uni-notes").value.trim(),
  };

  if (id) {
    const idx = universities.findIndex(u => u.id == id);
    if (idx !== -1) universities[idx] = { ...universities[idx], ...data };
  } else {
    universities.push({ id: nextUniId++, ...data });
  }

  saveUniversitiesToStorage();   // ← persist
  closeModal("modal-university");
  renderUniversities();
  if (currentPage === "dashboard") renderDashboard();
}

function deleteUniversity(id) {
  universities = universities.filter(u => u.id != id);
  saveUniversitiesToStorage();   // ← persist
  closeModal("modal-university");
  renderUniversities();
  if (currentPage === "dashboard") renderDashboard();
}

// ── Story modal ────────────────────────────────────
function resetStoryModal() {
  $("#story-edit-id").value        = "";
  $("#story-title-input").value    = "";
  $("#story-description").value    = "";
  $("#story-reflection").value     = "";
  $$(".tag-opt").forEach(b => b.classList.remove("selected"));
  $("#modal-story-title").textContent = "Add story";
  $("#btn-save-story").textContent    = "Add story";
  $("#btn-delete-story").classList.add("hidden");
}

function openAddStory() {
  resetStoryModal();
  openModal("modal-story");
  $("#story-title-input").focus();
}

function openEditStory(id) {
  const s = stories.find(s => s.id === id);
  if (!s) return;

  $("#story-edit-id").value     = id;
  $("#story-title-input").value = s.title;
  $("#story-description").value = s.description;
  $("#story-reflection").value  = s.reflection;

  $$(".tag-opt").forEach(b => {
    b.classList.toggle("selected", s.tags.includes(b.dataset.tag));
  });

  $("#modal-story-title").textContent = s.title;
  $("#btn-save-story").textContent    = "Save changes";
  $("#btn-delete-story").classList.remove("hidden");

  openModal("modal-story");
}

function saveStory() {
  const id    = $("#story-edit-id").value;
  const title = $("#story-title-input").value.trim();
  if (!title) { alert("Please enter a story title."); return; }

  const tags = [...$$(".tag-opt.selected")].map(b => b.dataset.tag);

  const data = {
    title,
    description: $("#story-description").value.trim(),
    tags,
    reflection:  $("#story-reflection").value.trim(),
  };

  if (id) {
    const idx = stories.findIndex(s => s.id == id);
    if (idx !== -1) stories[idx] = { ...stories[idx], ...data };
  } else {
    stories.push({ id: nextStoryId++, ...data });
  }

  saveStoriesToStorage();   // ← persist
  closeModal("modal-story");
  renderStories();
  if (currentPage === "dashboard") renderDashboard();
}

function deleteStory(id) {
  stories = stories.filter(s => s.id != id);
  saveStoriesToStorage();   // ← persist
  closeModal("modal-story");
  renderStories();
  if (currentPage === "dashboard") renderDashboard();
}

// ── Confirm-delete modal ───────────────────────────
function confirmDelete(title, desc, onConfirm) {
  $("#confirm-title").textContent = title;
  $("#confirm-desc").textContent  = desc;
  deleteCallback = onConfirm;
  openModal("modal-confirm");
}

$("#btn-confirm-delete").addEventListener("click", () => {
  if (deleteCallback) { deleteCallback(); deleteCallback = null; }
  closeModal("modal-confirm");
});

// ── Event wiring ───────────────────────────────────

// Navigation
$$(".nav-item").forEach(btn => {
  btn.addEventListener("click", () => navigateTo(btn.dataset.page));
});

// Buttons
$("#btn-add-university").addEventListener("click", openAddUniversity);
$("#btn-add-story").addEventListener("click",      openAddStory);
$("#btn-save-uni").addEventListener("click",       saveUniversity);
$("#btn-save-story").addEventListener("click",     saveStory);

// Delete with confirm
$("#btn-delete-uni").addEventListener("click", () => {
  const id   = $("#uni-edit-id").value;
  const name = $("#uni-name").value || "this university";
  confirmDelete(
    "Delete university?",
    `"${name}" will be permanently removed.`,
    () => deleteUniversity(id)
  );
});

$("#btn-delete-story").addEventListener("click", () => {
  const id    = $("#story-edit-id").value;
  const title = $("#story-title-input").value || "this story";
  confirmDelete(
    "Delete story?",
    `"${title}" will be permanently removed.`,
    () => deleteStory(id)
  );
});

// Status toggle (uni modal)
$$("#uni-status-grid .status-opt").forEach(btn => {
  btn.addEventListener("click", () => {
    $$("#uni-status-grid .status-opt").forEach(b => b.classList.remove("selected"));
    btn.classList.add("selected");
  });
});

// Tag toggle (story modal)
$$(".tag-opt").forEach(btn => {
  btn.addEventListener("click", () => btn.classList.toggle("selected"));
});

// University filters
$$("#uni-filters .filter-chip").forEach(chip => {
  chip.addEventListener("click", () => {
    $$("#uni-filters .filter-chip").forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    currentUniFilter = chip.dataset.filter;
    renderUniversities();
  });
});

// Story tag filters
$$("#story-filters .filter-chip").forEach(chip => {
  chip.addEventListener("click", () => {
    $$("#story-filters .filter-chip").forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    currentTagFilter = chip.dataset.filter;
    renderStories();
  });
});

// ESC closes modals
document.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    ["modal-university", "modal-story", "modal-confirm"].forEach(id => {
      if (!$(`#${id}`).classList.contains("hidden")) closeModal(id);
    });
  }
});

// ── Init ───────────────────────────────────────────
navigateTo("dashboard");
