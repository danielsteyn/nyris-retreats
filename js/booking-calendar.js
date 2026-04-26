// Shared booking calendar — used by the property detail page (with prices +
// booked-date blocking) and the home page hero search (date selection only).
//
// State + behavior live on window.BkCal. Configure once per page:
//   window.BkCal.propertyId  — UUID; if set, fetches per-night prices + reservations.
//                              If null, calendar is purely a date picker (all available, no prices).
//   window.BkCal.targets     — DOM IDs for the popup container, hidden value inputs,
//                              and visible display spans. Defaults to property-page IDs.
//   window.BkCal.onChange    — called after every range update (e.g. to refresh totals).

window.BkCal = window.BkCal || {
  propertyId: null,
  data: null,
  range: { ci: null, co: null },
  hover: null,
  monthAnchor: null,
  pickFor: "checkin",
  loading: false,
  targets: {
    container: "bkCalendar",
    checkinValue: "bkCheckin",
    checkoutValue: "bkCheckout",
    checkinDisplay: "bkCheckinDisplay",
    checkoutDisplay: "bkCheckoutDisplay"
  },
  onChange: null
};

async function openBookingCalendar(pickFor) {
  const cal = document.getElementById(window.BkCal.targets.container);
  if (!cal) return;
  window.BkCal.pickFor = pickFor;
  if (!cal.hasAttribute("hidden")) { renderCalendar(); return; }
  cal.removeAttribute("hidden");

  if (!window.BkCal.monthAnchor) {
    const t = new Date(); t.setUTCDate(1); t.setUTCHours(0, 0, 0, 0);
    window.BkCal.monthAnchor = t.toISOString().slice(0, 10);
  }
  if (!window.BkCal.data) await loadCalendarData();
  renderCalendar();

  setTimeout(() => {
    document.addEventListener("click", outsideCalendarClose, { capture: true });
  }, 0);
}

function closeBookingCalendar() {
  const cal = document.getElementById(window.BkCal.targets.container);
  if (cal) cal.setAttribute("hidden", "");
  document.removeEventListener("click", outsideCalendarClose, { capture: true });
}

function outsideCalendarClose(e) {
  const cal = document.getElementById(window.BkCal.targets.container);
  if (!cal || cal.hasAttribute("hidden")) return;
  if (cal.contains(e.target)) return;
  if (e.target.closest(".date-trigger")) return;
  closeBookingCalendar();
}

async function loadCalendarData() {
  const propertyId = window.BkCal.propertyId;
  // Without a property, the calendar is just a date picker — empty data is
  // fine, every cell renders as available with no price.
  if (!propertyId) { window.BkCal.data = {}; return; }
  window.BkCal.loading = true;
  try {
    const r = await fetch(`/api/availability?propertyId=${encodeURIComponent(propertyId)}&months=4`);
    const j = await r.json();
    if (j.ok) {
      const m = {};
      for (const d of (j.days || [])) m[d.date] = d;
      window.BkCal.data = m;
    } else {
      window.BkCal.data = {};
    }
  } catch { window.BkCal.data = {}; }
  window.BkCal.loading = false;
}

function renderCalendar() {
  const cal = document.getElementById(window.BkCal.targets.container);
  if (!cal) return;
  const anchor = new Date(window.BkCal.monthAnchor + "T00:00:00Z");
  const m1 = monthGrid(anchor);
  const next = new Date(anchor); next.setUTCMonth(next.getUTCMonth() + 1);
  const m2 = monthGrid(next);

  const showLegend = !!window.BkCal.propertyId;

  cal.innerHTML = `
    <div class="bkcal-head">
      <button type="button" class="bkcal-nav" onclick="bkcalNav(-1)" aria-label="Previous month">‹</button>
      <div class="bkcal-titles"><span>${m1.title}</span><span>${m2.title}</span></div>
      <button type="button" class="bkcal-nav" onclick="bkcalNav(1)" aria-label="Next month">›</button>
      <button type="button" class="bkcal-close" onclick="closeBookingCalendar()" aria-label="Close">×</button>
    </div>
    <div class="bkcal-grids">
      ${renderMonth(m1)}
      ${renderMonth(m2)}
    </div>
    <div class="bkcal-foot">
      ${showLegend ? `
        <span class="bkcal-legend"><span class="dot booked"></span> Booked</span>
        <span class="bkcal-legend"><span class="dot live"></span> Live PriceLabs rate</span>
      ` : ``}
      <button type="button" class="bkcal-clear" onclick="bkcalClear()">Clear dates</button>
    </div>`;

  bindCalendarCells();
}

function bkcalNav(dir) {
  const cur = new Date(window.BkCal.monthAnchor + "T00:00:00Z");
  cur.setUTCMonth(cur.getUTCMonth() + dir);
  const today = new Date(); today.setUTCDate(1); today.setUTCHours(0, 0, 0, 0);
  if (cur < today) return;
  window.BkCal.monthAnchor = cur.toISOString().slice(0, 10);
  renderCalendar();
}

function bkcalClear() {
  window.BkCal.range = { ci: null, co: null };
  document.getElementById(window.BkCal.targets.checkinValue).value = "";
  document.getElementById(window.BkCal.targets.checkoutValue).value = "";
  document.getElementById(window.BkCal.targets.checkinDisplay).textContent = "Add date";
  document.getElementById(window.BkCal.targets.checkoutDisplay).textContent = "Add date";
  renderCalendar();
  if (typeof window.BkCal.onChange === "function") window.BkCal.onChange();
}

function monthGrid(date) {
  const y = date.getUTCFullYear(), m = date.getUTCMonth();
  const first = new Date(Date.UTC(y, m, 1));
  const last = new Date(Date.UTC(y, m + 1, 0));
  const startWeekday = first.getUTCDay();
  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= last.getUTCDate(); d++) {
    cells.push(new Date(Date.UTC(y, m, d)));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return {
    year: y, month: m,
    title: first.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }),
    cells
  };
}

function renderMonth(grid) {
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const { ci, co } = window.BkCal.range;
  const ciDate = ci ? new Date(ci + "T00:00:00Z") : null;
  const coDate = co ? new Date(co + "T00:00:00Z") : null;
  const data = window.BkCal.data || {};

  const cellsHtml = grid.cells.map(d => {
    if (!d) return `<div class="bkcal-cell empty"></div>`;
    const iso = d.toISOString().slice(0, 10);
    const day = d.getUTCDate();
    const meta = data[iso] || { available: true, price: null };
    const past = d < today;
    const booked = meta.available === false;
    const disabled = past || booked;
    const isCi = ci && iso === ci;
    const isCo = co && iso === co;
    const inRange = ciDate && coDate && d > ciDate && d < coDate;
    const hoverInRange = ci && !co && window.BkCal.hover &&
      d > ciDate && d <= new Date(window.BkCal.hover + "T00:00:00Z");

    const classes = [
      "bkcal-cell",
      past && "past",
      booked && "booked",
      disabled && "disabled",
      isCi && "checkin",
      isCo && "checkout",
      (inRange || hoverInRange) && "in-range"
    ].filter(Boolean).join(" ");

    let bottomLabel = "";
    if (booked) {
      bottomLabel = `<span class="cell-price">Booked</span>`;
    } else if (!past && meta.price) {
      const formatted = meta.price >= 1000 ? Math.round(meta.price / 100) / 10 + 'k' : Math.round(meta.price);
      bottomLabel = `<span class="cell-price">$${formatted}</span>`;
    }

    const blockAttrs = disabled ? `disabled aria-disabled="true" tabindex="-1"` : "";
    return `<button type="button" class="${classes}" data-date="${iso}" ${blockAttrs}>
      <span class="cell-day">${day}</span>${bottomLabel}
    </button>`;
  }).join("");

  return `
    <div class="bkcal-month">
      <div class="bkcal-month-title">${grid.title}</div>
      <div class="bkcal-dow">
        ${["S", "M", "T", "W", "T", "F", "S"].map(c => `<span>${c}</span>`).join("")}
      </div>
      <div class="bkcal-cells">${cellsHtml}</div>
    </div>`;
}

function bindCalendarCells() {
  document.querySelectorAll(".bkcal-cell[data-date]").forEach(cell => {
    if (cell.disabled || cell.classList.contains("booked") || cell.classList.contains("past")) {
      cell.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); }, true);
      cell.addEventListener("mousedown", e => e.preventDefault(), true);
      return;
    }
    cell.addEventListener("click", () => onCellClick(cell.dataset.date));
    cell.addEventListener("mouseenter", () => {
      if (window.BkCal.range.ci && !window.BkCal.range.co) {
        window.BkCal.hover = cell.dataset.date;
        updateRangePreview();
      }
    });
  });
}

function updateRangePreview() {
  const { ci } = window.BkCal.range;
  const hov = window.BkCal.hover;
  document.querySelectorAll(".bkcal-cell[data-date]").forEach(cell => {
    if (cell.classList.contains("disabled") || cell.classList.contains("past") || cell.classList.contains("booked") || cell.classList.contains("checkin") || cell.classList.contains("checkout")) {
      cell.classList.remove("in-range");
      return;
    }
    if (!ci || !hov) {
      cell.classList.remove("in-range");
      return;
    }
    const d = cell.dataset.date;
    if (d > ci && d <= hov) cell.classList.add("in-range");
    else cell.classList.remove("in-range");
  });
}

function onCellClick(iso) {
  const { ci, co } = window.BkCal.range;
  if (!ci || (ci && co)) {
    window.BkCal.range = { ci: iso, co: null };
  } else {
    if (iso <= ci) {
      window.BkCal.range = { ci: iso, co: null };
    } else {
      const conflicts = rangeBlockedDays(ci, iso);
      if (conflicts.length) {
        flashBlockedConflict(conflicts);
        showCalendarBanner(`That range covers ${conflicts.length} booked night${conflicts.length > 1 ? "s" : ""} (${conflicts.map(d => formatDateShort(d)).join(", ")}). Pick a checkout before the first booked night.`);
        return;
      }
      window.BkCal.range = { ci, co: iso };
    }
  }
  hideCalendarBanner();
  applyCalendarSelection();
  renderCalendar();
  if (window.BkCal.range.ci && window.BkCal.range.co) {
    setTimeout(closeBookingCalendar, 200);
  }
}

function rangeBlockedDays(ci, co) {
  const data = window.BkCal.data || {};
  const start = new Date(ci + "T00:00:00Z");
  const end = new Date(co + "T00:00:00Z");
  const out = [];
  for (let d = new Date(start); d < end; d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    const meta = data[iso];
    if (meta && meta.available === false) out.push(iso);
  }
  return out;
}

function flashBlockedConflict(dates) {
  const set = new Set(dates);
  document.querySelectorAll(".bkcal-cell[data-date]").forEach(cell => {
    if (set.has(cell.dataset.date)) {
      cell.classList.add("conflict-flash");
      setTimeout(() => cell.classList.remove("conflict-flash"), 1400);
    }
  });
}

function showCalendarBanner(msg) {
  const cal = document.getElementById(window.BkCal.targets.container);
  if (!cal) return;
  let banner = document.getElementById("bkCalBanner");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "bkCalBanner";
    banner.className = "bkcal-banner";
    cal.insertBefore(banner, cal.firstChild);
  }
  banner.textContent = msg;
  banner.classList.remove("hidden");
}

function hideCalendarBanner() {
  document.getElementById("bkCalBanner")?.classList.add("hidden");
}

function applyCalendarSelection() {
  const t = window.BkCal.targets;
  const { ci, co } = window.BkCal.range;
  const ciInput = document.getElementById(t.checkinValue);
  const coInput = document.getElementById(t.checkoutValue);
  const ciDisp = document.getElementById(t.checkinDisplay);
  const coDisp = document.getElementById(t.checkoutDisplay);
  if (ciInput) ciInput.value = ci || "";
  if (coInput) coInput.value = co || "";
  if (ciDisp) ciDisp.textContent = ci ? formatDateShort(ci) : "Add date";
  if (coDisp) coDisp.textContent = co ? formatDateShort(co) : "Add date";
  if (typeof window.BkCal.onChange === "function") window.BkCal.onChange();
}

function formatDateShort(iso) {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}
