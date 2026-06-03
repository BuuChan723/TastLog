const STORAGE_KEY = "task-timer-log-v1";

if (new URLSearchParams(window.location.search).has("clear")) {
  localStorage.removeItem(STORAGE_KEY);
  window.history.replaceState({}, "", window.location.pathname);
}

const elements = {
  form: document.querySelector("#taskForm"),
  taskName: document.querySelector("#taskName"),
  startButton: document.querySelector("#startButton"),
  resetData: document.querySelector("#resetData"),
  currentTaskName: document.querySelector("#currentTaskName"),
  activeTimer: document.querySelector("#activeTimer"),
  activeStatus: document.querySelector("#activeStatus"),
  startedAt: document.querySelector("#startedAt"),
  quickPauseButton: document.querySelector("#quickPauseButton"),
  quickCompleteButton: document.querySelector("#quickCompleteButton"),
  openTaskCount: document.querySelector("#openTaskCount"),
  openTaskList: document.querySelector("#openTaskList"),
  todayTotal: document.querySelector("#todayTotal"),
  todayTaskCount: document.querySelector("#todayTaskCount"),
  todayCompletedCount: document.querySelector("#todayCompletedCount"),
  todayRunningCount: document.querySelector("#todayRunningCount"),
  todayBreakdown: document.querySelector("#todayBreakdown"),
  monthTitle: document.querySelector("#monthTitle"),
  prevMonth: document.querySelector("#prevMonth"),
  nextMonth: document.querySelector("#nextMonth"),
  calendarGrid: document.querySelector("#calendarGrid"),
  selectedDateTitle: document.querySelector("#selectedDateTitle"),
  selectedDateTotal: document.querySelector("#selectedDateTotal"),
  selectedDayList: document.querySelector("#selectedDayList"),
  completedTotal: document.querySelector("#completedTotal"),
  completedList: document.querySelector("#completedList"),
  emptyTemplate: document.querySelector("#emptyTemplate")
};

let state = loadState();
let calendarCursor = new Date();
calendarCursor.setDate(1);

if (!state.selectedDate) {
  state.selectedDate = dateKey(new Date());
}

ensureSingleRunningTask();
bindEvents();
render();
setInterval(render, 1000);
registerServiceWorker();

function bindEvents() {
  elements.form.addEventListener("submit", (event) => {
    event.preventDefault();
    startTask();
  });

  elements.quickPauseButton.addEventListener("click", () => {
    const task = getRunningTask();
    if (task) pauseTask(task.id);
  });

  elements.quickCompleteButton.addEventListener("click", () => {
    const task = getRunningTask();
    if (task) finishTask(task.id);
  });

  elements.openTaskList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;

    const taskId = button.closest("[data-task-id]")?.dataset.taskId;
    if (!taskId) return;

    if (button.dataset.action === "pause") pauseTask(taskId);
    if (button.dataset.action === "resume") resumeTask(taskId);
    if (button.dataset.action === "finish") finishTask(taskId);
  });

  elements.prevMonth.addEventListener("click", () => {
    calendarCursor.setMonth(calendarCursor.getMonth() - 1);
    render();
  });

  elements.nextMonth.addEventListener("click", () => {
    calendarCursor.setMonth(calendarCursor.getMonth() + 1);
    render();
  });

  elements.resetData.addEventListener("click", () => {
    const confirmed = window.confirm("すべてのタスク記録を削除しますか？");
    if (!confirmed) return;
    state = {
      tasks: [],
      selectedDate: dateKey(new Date())
    };
    calendarCursor = new Date();
    calendarCursor.setDate(1);
    saveState();
    render();
  });
}

function registerServiceWorker() {
  const canRegister = "serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1");
  if (!canRegister) return;
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

function startTask() {
  const name = elements.taskName.value.trim();
  if (!name) return;

  pauseRunningTasks();

  state.tasks.unshift({
    id: crypto.randomUUID(),
    name,
    status: "running",
    createdAt: new Date().toISOString(),
    completedAt: null,
    segments: [
      {
        start: new Date().toISOString(),
        end: null
      }
    ]
  });

  state.selectedDate = dateKey(new Date());
  elements.taskName.value = "";
  saveState();
  render();
}

function pauseTask(taskId) {
  const task = findTask(taskId);
  if (!task || task.status !== "running") return;

  closeOpenSegment(task);
  task.status = "paused";
  saveState();
  render();
}

function resumeTask(taskId) {
  const task = findTask(taskId);
  if (!task || task.status !== "paused") return;

  pauseRunningTasks(task.id);
  task.status = "running";
  task.segments.push({
    start: new Date().toISOString(),
    end: null
  });
  saveState();
  render();
}

function finishTask(taskId) {
  const task = findTask(taskId);
  if (!task || task.status === "completed") return;

  if (task.status === "running") {
    closeOpenSegment(task);
  }

  task.status = "completed";
  task.completedAt = new Date().toISOString();
  saveState();
  render();
}

function render() {
  renderActiveTask();
  renderOpenTasks();
  renderToday();
  renderCalendar();
  renderSelectedDay();
  renderCompletedTasks();
}

function renderActiveTask() {
  const task = getRunningTask();

  elements.activeStatus.className = "status-pill idle";

  if (!task) {
    const pausedCount = getOpenTasks().length;
    elements.quickPauseButton.disabled = true;
    elements.quickCompleteButton.disabled = true;
    elements.currentTaskName.textContent = pausedCount > 0 ? "中断中のタスクあり" : "待機中";
    elements.activeTimer.textContent = "00:00:00";
    elements.activeTimer.setAttribute("datetime", "PT0S");
    elements.activeStatus.textContent = pausedCount > 0 ? "中断中" : "未開始";
    elements.activeStatus.className = pausedCount > 0 ? "status-pill paused" : "status-pill idle";
    elements.startedAt.textContent = pausedCount > 0 ? `${pausedCount}件を管理中` : "--";
    return;
  }

  const elapsed = taskTotalMs(task);
  elements.quickPauseButton.disabled = false;
  elements.quickCompleteButton.disabled = false;
  elements.currentTaskName.textContent = task.name;
  elements.activeTimer.textContent = formatDuration(elapsed, true);
  elements.activeTimer.setAttribute("datetime", `PT${Math.floor(elapsed / 1000)}S`);
  elements.startedAt.textContent = `開始 ${formatTime(task.createdAt)}`;
  elements.activeStatus.textContent = "計測中";
  elements.activeStatus.className = "status-pill running";
}

function renderOpenTasks() {
  const openTasks = getOpenTasks();
  elements.openTaskCount.textContent = `${openTasks.length}件`;
  elements.openTaskList.innerHTML = "";

  if (openTasks.length === 0) {
    elements.openTaskList.appendChild(emptyNode());
    return;
  }

  openTasks.forEach((task) => {
    const item = document.createElement("article");
    item.className = `task-card ${task.status}`;
    item.dataset.taskId = task.id;

    const main = document.createElement("div");
    main.className = "task-card-main";

    const topLine = document.createElement("div");
    topLine.className = "task-card-top";

    const title = document.createElement("strong");
    title.textContent = task.name;

    const status = document.createElement("span");
    status.className = `status-pill ${task.status}`;
    status.textContent = taskStatusLabel(task);

    const meta = document.createElement("p");
    meta.className = "item-meta";
    meta.textContent = `開始 ${formatTime(task.createdAt)}`;

    const duration = document.createElement("time");
    duration.textContent = formatDuration(taskTotalMs(task), true);
    duration.setAttribute("datetime", `PT${Math.floor(taskTotalMs(task) / 1000)}S`);

    topLine.append(title, status);
    main.append(topLine, meta);

    const actions = document.createElement("div");
    actions.className = "task-card-actions";

    if (task.status === "running") {
      actions.append(actionButton("pause", "Ⅱ", "中断", "secondary-button small-button"));
    } else {
      actions.append(actionButton("resume", "▶", "再開", "primary-button small-button"));
    }
    actions.append(actionButton("finish", "✓", "完了", "complete-button small-button"));

    item.append(main, duration, actions);
    elements.openTaskList.appendChild(item);
  });
}

function renderToday() {
  const today = dateKey(new Date());
  const items = totalsByTaskForDay(today);
  const total = items.reduce((sum, item) => sum + item.durationMs, 0);
  const completedToday = state.tasks.filter((task) => task.completedAt && dateKey(new Date(task.completedAt)) === today).length;
  const openCount = getOpenTasks().length;

  elements.todayTotal.textContent = formatDuration(total, false);
  elements.todayTaskCount.textContent = String(items.length);
  elements.todayCompletedCount.textContent = String(completedToday);
  elements.todayRunningCount.textContent = String(openCount);

  renderWorkList(elements.todayBreakdown, items);
}

function renderCalendar() {
  const year = calendarCursor.getFullYear();
  const month = calendarCursor.getMonth();
  const firstDay = new Date(year, month, 1);
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  const gridStart = new Date(year, month, 1 - mondayOffset);

  elements.monthTitle.textContent = new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long"
  }).format(calendarCursor);

  elements.calendarGrid.innerHTML = "";

  for (let index = 0; index < 42; index += 1) {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + index);

    const key = dateKey(day);
    const total = totalForDay(key);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "day-cell";
    button.dataset.date = key;

    if (day.getMonth() !== month) button.classList.add("muted");
    if (key === dateKey(new Date())) button.classList.add("today");
    if (key === state.selectedDate) button.classList.add("selected");
    if (total > 0) button.classList.add("has-work");

    const dayNumber = document.createElement("span");
    dayNumber.className = "day-number";
    dayNumber.textContent = String(day.getDate());

    const dayTotal = document.createElement("span");
    dayTotal.className = "day-total";
    dayTotal.textContent = total > 0 ? formatDuration(total, false) : "";

    button.append(dayNumber, dayTotal);
    button.addEventListener("click", () => {
      state.selectedDate = key;
      calendarCursor = new Date(day);
      calendarCursor.setDate(1);
      saveState();
      render();
    });

    elements.calendarGrid.appendChild(button);
  }
}

function renderSelectedDay() {
  const date = new Date(`${state.selectedDate}T00:00:00`);
  const items = totalsByTaskForDay(state.selectedDate);
  const total = items.reduce((sum, item) => sum + item.durationMs, 0);

  elements.selectedDateTitle.textContent = new Intl.DateTimeFormat("ja-JP", {
    month: "long",
    day: "numeric",
    weekday: "short"
  }).format(date);
  elements.selectedDateTotal.textContent = formatDuration(total, false);
  renderWorkList(elements.selectedDayList, items);
}

function renderCompletedTasks() {
  const completed = state.tasks
    .filter((task) => task.status === "completed")
    .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));

  elements.completedTotal.textContent = `${completed.length}件`;
  elements.completedList.innerHTML = "";

  if (completed.length === 0) {
    elements.completedList.appendChild(emptyNode());
    return;
  }

  completed.forEach((task) => {
    const item = document.createElement("article");
    item.className = "work-item";

    const text = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = task.name;

    const meta = document.createElement("p");
    meta.className = "item-meta";
    meta.textContent = `${formatDate(task.completedAt)} 完了`;

    const duration = document.createElement("span");
    duration.className = "duration";
    duration.textContent = formatDuration(taskTotalMs(task), false);

    text.append(title, meta);
    item.append(text, duration);
    elements.completedList.appendChild(item);
  });
}

function renderWorkList(container, items) {
  container.innerHTML = "";

  if (items.length === 0) {
    container.appendChild(emptyNode());
    return;
  }

  items.forEach((item) => {
    const row = document.createElement("article");
    row.className = "work-item";

    const text = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = item.name;

    const meta = document.createElement("p");
    meta.className = "item-meta";
    meta.textContent = item.statusLabel;

    const duration = document.createElement("time");
    duration.textContent = formatDuration(item.durationMs, false);

    text.append(title, meta);
    row.append(text, duration);
    container.appendChild(row);
  });
}

function totalsByTaskForDay(dayKey) {
  return state.tasks
    .map((task) => ({
      id: task.id,
      name: task.name,
      durationMs: durationForTaskOnDay(task, dayKey),
      statusLabel: taskStatusLabel(task)
    }))
    .filter((item) => item.durationMs > 0)
    .sort((a, b) => b.durationMs - a.durationMs);
}

function totalForDay(dayKey) {
  return state.tasks.reduce((sum, task) => sum + durationForTaskOnDay(task, dayKey), 0);
}

function durationForTaskOnDay(task, dayKey) {
  return task.segments.reduce((sum, segment) => {
    const parts = splitSegmentByDay(segment);
    return sum + (parts.get(dayKey) || 0);
  }, 0);
}

function splitSegmentByDay(segment) {
  const parts = new Map();
  let cursor = new Date(segment.start);
  const end = segment.end ? new Date(segment.end) : new Date();

  while (cursor < end) {
    const nextMidnight = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
    const partEnd = nextMidnight < end ? nextMidnight : end;
    const key = dateKey(cursor);
    parts.set(key, (parts.get(key) || 0) + (partEnd - cursor));
    cursor = partEnd;
  }

  return parts;
}

function taskTotalMs(task) {
  return task.segments.reduce((sum, segment) => {
    const start = new Date(segment.start);
    const end = segment.end ? new Date(segment.end) : new Date();
    return sum + Math.max(0, end - start);
  }, 0);
}

function pauseRunningTasks(exceptTaskId) {
  state.tasks.forEach((task) => {
    if (task.status !== "running" || task.id === exceptTaskId) return;
    closeOpenSegment(task);
    task.status = "paused";
  });
}

function closeOpenSegment(task) {
  const openSegment = task.segments.find((segment) => !segment.end);
  if (openSegment) {
    openSegment.end = new Date().toISOString();
  }
}

function findTask(taskId) {
  return state.tasks.find((task) => task.id === taskId);
}

function getRunningTask() {
  return state.tasks.find((task) => task.status === "running") || null;
}

function getOpenTasks() {
  return state.tasks
    .filter((task) => task.status === "running" || task.status === "paused")
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "running" ? -1 : 1;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
}

function taskStatusLabel(task) {
  if (task.status === "running") return "計測中";
  if (task.status === "paused") return "中断中";
  return "完了";
}

function actionButton(action, icon, label, className) {
  const button = document.createElement("button");
  button.className = className;
  button.type = "button";
  button.dataset.action = action;

  const iconNode = document.createElement("span");
  iconNode.setAttribute("aria-hidden", "true");
  iconNode.textContent = icon;

  const labelNode = document.createElement("span");
  labelNode.textContent = label;

  button.append(iconNode, labelNode);
  return button;
}

function emptyNode() {
  return elements.emptyTemplate.content.firstElementChild.cloneNode(true);
}

function loadState() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return {
        tasks: [],
        selectedDate: dateKey(new Date())
      };
    }

    const parsed = JSON.parse(stored);
    return {
      tasks: normalizeTasks(parsed.tasks),
      selectedDate: parsed.selectedDate || dateKey(new Date())
    };
  } catch {
    return {
      tasks: [],
      selectedDate: dateKey(new Date())
    };
  }
}

function normalizeTasks(tasks) {
  if (!Array.isArray(tasks)) return [];
  return tasks
    .filter((task) => task && task.id && task.name)
    .map((task) => ({
      id: task.id,
      name: task.name,
      status: ["running", "paused", "completed"].includes(task.status) ? task.status : "paused",
      createdAt: task.createdAt || new Date().toISOString(),
      completedAt: task.completedAt || null,
      segments: Array.isArray(task.segments) ? task.segments : []
    }));
}

function ensureSingleRunningTask() {
  let runningTaskFound = false;
  state.tasks.forEach((task) => {
    if (task.status !== "running") return;
    if (!runningTaskFound) {
      runningTaskFound = true;
      return;
    }
    closeOpenSegment(task);
    task.status = "paused";
  });
  saveState();
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDuration(ms, withSeconds) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (withSeconds) {
    return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
  }

  if (totalSeconds === 0) return "0分";
  if (hours === 0 && minutes === 0) return "1分未満";
  if (hours === 0) return `${minutes}分`;
  if (minutes === 0) return `${hours}時間`;
  return `${hours}時間${minutes}分`;
}

function formatTime(value) {
  return new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatDate(value) {
  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}
