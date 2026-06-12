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

// ── College Database (from college-data.js) ───────
// COLLEGE_DATABASE is expected to be a global array of:
//   { name, location, type, sat, det, acceptanceRate }
// Loaded via <script src="college-data.js"> before this file.
const collegeDB = (typeof COLLEGE_DATABASE !== "undefined") ? COLLEGE_DATABASE : [];

let autocompleteHighlightIndex = -1;
let selectedCollegeData = null; // holds matched DB record, or null for custom entries

function findCollegeMatches(query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return collegeDB
    .filter(c => c.name.toLowerCase().includes(q))
    .slice(0, 8);
}

function findCollegeByName(name) {
  return collegeDB.find(c => c.name.toLowerCase() === name.trim().toLowerCase()) || null;
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
    const hasCollegeInfo = u.collegeType || u.sat || u.det || u.acceptanceRate;
    const infoChips = hasCollegeInfo ? `
      <div class="uni-card-collegeinfo">
        ${u.collegeType ? `<span class="uni-info-chip">${u.collegeType}</span>` : ""}
        ${u.sat ? `<span class="uni-info-chip">SAT ${u.sat}</span>` : ""}
        ${u.det && u.det !== "Not Required" ? `<span class="uni-info-chip">DET ${u.det}</span>` : (u.det === "Not Required" ? `<span class="uni-info-chip">DET not required</span>` : "")}
        ${u.acceptanceRate ? `<span class="uni-info-chip">${u.acceptanceRate} admit rate</span>` : ""}
      </div>
    ` : "";
    return `
      <div class="uni-card" data-id="${u.id}" onclick="openEditUniversity(${u.id})">
        <div class="uni-card-top">
          <div class="uni-name">${u.name}</div>
          <div class="status-badge ${statusKey}">${u.status}</div>
        </div>
        <div class="uni-meta">
          <span>${u.type}</span>
          ${u.deadline ? `<span class="uni-deadline-badge">${u.deadline}</span>` : ""}
          ${u.location ? `<span>· ${u.location}</span>` : ""}
        </div>
        ${infoChips}
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
  $("#uni-college-type").value = "";
  $("#uni-sat").value        = "";
  $("#uni-det").value        = "";
  $("#uni-acceptance").value = "";
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

  selectedCollegeData = null;
  hideCollegeInfoBox();
  $("#uni-custom-hint").classList.add("hidden");
  hideAutocomplete();
}

// ── College Info Box helpers ───────────────────────
function showCollegeInfoBox(college) {
  $("#info-location").textContent   = college.location || "—";
  $("#info-type").textContent       = college.type || "—";
  $("#info-sat").textContent        = college.sat || "—";
  $("#info-det").textContent        = (college.det === "Not Required" || college.det === "-") ? "Not required" : (college.det || "—");
  $("#info-acceptance").textContent = college.acceptanceRate || "—";
  $("#uni-college-info").classList.remove("hidden");
}

function hideCollegeInfoBox() {
  $("#uni-college-info").classList.add("hidden");
}

// Apply a selected college's data into the hidden fields + preview box
function applyCollegeSelection(college) {
  selectedCollegeData = college;
  $("#uni-location").value      = college.location || "";
  $("#uni-college-type").value  = college.type || "";
  $("#uni-sat").value           = college.sat || "";
  $("#uni-det").value           = (college.det === "-" ) ? "Not Required" : (college.det || "");
  $("#uni-acceptance").value    = college.acceptanceRate || "";
  showCollegeInfoBox(college);
  $("#uni-custom-hint").classList.add("hidden");
}

// Clear auto-filled fields (used when name no longer matches a DB entry)
function clearCollegeSelection() {
  selectedCollegeData = null;
  $("#uni-location").value      = "";
  $("#uni-college-type").value  = "";
  $("#uni-sat").value           = "";
  $("#uni-det").value           = "";
  $("#uni-acceptance").value    = "";
  hideCollegeInfoBox();
}

// ── Autocomplete UI ────────────────────────────────
function hideAutocomplete() {
  const list = $("#uni-autocomplete-list");
  list.classList.add("hidden");
  list.innerHTML = "";
  autocompleteHighlightIndex = -1;
}

function renderAutocomplete(query) {
  const list = $("#uni-autocomplete-list");
  const matches = findCollegeMatches(query);

  if (!query.trim()) {
    hideAutocomplete();
    return;
  }

  autocompleteHighlightIndex = -1;

  const items = matches.map(c => `
    <div class="autocomplete-item" data-name="${c.name.replace(/"/g, '&quot;')}">
      <div class="ac-name">${c.name}</div>
      <div class="ac-location">${c.location}${c.type ? " · " + c.type : ""}</div>
    </div>
  `).join("");

  const customItem = `
    <div class="autocomplete-item ac-custom" data-custom="true">
      Can't find your school? Use "${query.trim()}" as a custom entry
    </div>
  `;

  list.innerHTML = items + customItem;
  list.classList.remove("hidden");
}

function selectAutocompleteItem(el) {
  if (el.dataset.custom === "true") {
    // Custom entry — keep typed name, clear DB-sourced fields
    clearCollegeSelection();
    $("#uni-custom-hint").classList.remove("hidden");
  } else {
    const college = findCollegeByName(el.dataset.name);
    if (college) {
      $("#uni-name").value = college.name;
      applyCollegeSelection(college);
    }
  }
  hideAutocomplete();
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
  $("#uni-college-type").value = u.collegeType || "";
  $("#uni-sat").value      = u.sat || "";
  $("#uni-det").value      = u.det || "";
  $("#uni-acceptance").value = u.acceptanceRate || "";
  $("#uni-type").value     = u.type;
  $("#uni-deadline").value = u.deadline;
  $("#uni-notes").value    = u.notes;

  $$(".status-opt").forEach(b => {
    b.classList.toggle("selected", b.dataset.status === u.status);
  });

  $("#modal-uni-title").textContent = u.name;
  $("#btn-save-uni").textContent    = "Save changes";
  $("#btn-delete-uni").classList.remove("hidden");

  // Show college info box if we have data, otherwise show custom hint
  if (u.collegeType || u.sat || u.det || u.acceptanceRate || u.location) {
    selectedCollegeData = {
      name: u.name,
      location: u.location,
      type: u.collegeType,
      sat: u.sat,
      det: u.det,
      acceptanceRate: u.acceptanceRate,
    };
    showCollegeInfoBox(selectedCollegeData);
    $("#uni-custom-hint").classList.add("hidden");
  } else {
    selectedCollegeData = null;
    hideCollegeInfoBox();
    $("#uni-custom-hint").classList.remove("hidden");
  }

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
    collegeType: $("#uni-college-type").value.trim(),
    sat: $("#uni-sat").value.trim(),
    det: $("#uni-det").value.trim(),
    acceptanceRate: $("#uni-acceptance").value.trim(),
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

// ── University name autocomplete ───────────────────
const uniNameInput = $("#uni-name");
const uniAcList    = $("#uni-autocomplete-list");

uniNameInput.addEventListener("input", () => {
  const query = uniNameInput.value;

  // If the typed text exactly matches a DB entry, auto-apply it
  const exact = findCollegeByName(query);
  if (exact) {
    applyCollegeSelection(exact);
  } else if (selectedCollegeData) {
    // Previously selected college, but user is now editing the name → clear
    clearCollegeSelection();
  }

  renderAutocomplete(query);
});

uniNameInput.addEventListener("focus", () => {
  if (uniNameInput.value.trim()) renderAutocomplete(uniNameInput.value);
});

uniNameInput.addEventListener("keydown", (e) => {
  const items = [...uniAcList.querySelectorAll(".autocomplete-item")];
  if (uniAcList.classList.contains("hidden") || items.length === 0) return;

  if (e.key === "ArrowDown") {
    e.preventDefault();
    autocompleteHighlightIndex = Math.min(autocompleteHighlightIndex + 1, items.length - 1);
    items.forEach((it, i) => it.classList.toggle("highlighted", i === autocompleteHighlightIndex));
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    autocompleteHighlightIndex = Math.max(autocompleteHighlightIndex - 1, 0);
    items.forEach((it, i) => it.classList.toggle("highlighted", i === autocompleteHighlightIndex));
  } else if (e.key === "Enter") {
    e.preventDefault();
    if (autocompleteHighlightIndex >= 0) {
      selectAutocompleteItem(items[autocompleteHighlightIndex]);
    } else {
      hideAutocomplete();
    }
  } else if (e.key === "Escape") {
    hideAutocomplete();
  }
});

// Click on an autocomplete item
uniAcList.addEventListener("click", (e) => {
  const item = e.target.closest(".autocomplete-item");
  if (item) selectAutocompleteItem(item);
});

// Close autocomplete when clicking outside
document.addEventListener("click", (e) => {
  if (!e.target.closest(".autocomplete-wrap")) hideAutocomplete();
});

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
