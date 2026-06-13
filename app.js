const STORAGE_KEY = "task-timer-log-v1";
const COUNTDOWN_STORAGE_KEY = "task-timer-countdown-v1";

if (new URLSearchParams(window.location.search).has("clear")) {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(COUNTDOWN_STORAGE_KEY);
  window.history.replaceState({}, "", window.location.pathname);
}

const elements = {
  workModeButton: document.querySelector("#workModeButton"),
  countdownModeButton: document.querySelector("#countdownModeButton"),
  workView: document.querySelector("#workView"),
  countdownView: document.querySelector("#countdownView"),
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
  deleteSelectedDay: document.querySelector("#deleteSelectedDay"),
  completedTotal: document.querySelector("#completedTotal"),
  completedList: document.querySelector("#completedList"),
  countdownForm: document.querySelector("#countdownForm"),
  countdownTaskName: document.querySelector("#countdownTaskName"),
  countdownHours: document.querySelector("#countdownHours"),
  countdownMinutes: document.querySelector("#countdownMinutes"),
  countdownSeconds: document.querySelector("#countdownSeconds"),
  countdownCurrentName: document.querySelector("#countdownCurrentName"),
  countdownTimer: document.querySelector("#countdownTimer"),
  countdownStatus: document.querySelector("#countdownStatus"),
  countdownStartedAt: document.querySelector("#countdownStartedAt"),
  countdownQuickPauseButton: document.querySelector("#countdownQuickPauseButton"),
  countdownQuickCompleteButton: document.querySelector("#countdownQuickCompleteButton"),
  countdownNotificationButton: document.querySelector("#countdownNotificationButton"),
  countdownNotificationState: document.querySelector("#countdownNotificationState"),
  countdownOpenCount: document.querySelector("#countdownOpenCount"),
  countdownOpenList: document.querySelector("#countdownOpenList"),
  countdownCompletedTotal: document.querySelector("#countdownCompletedTotal"),
  countdownCompletedList: document.querySelector("#countdownCompletedList"),
  countdownAlert: document.querySelector("#countdownAlert"),
  emptyTemplate: document.querySelector("#emptyTemplate")
};

let state = loadState();
let countdownState = loadCountdownState();
let calendarCursor = new Date();
calendarCursor.setDate(1);
let alarmAudioContext = null;
let alarmPrimed = false;
const notifiedExpiredCountdownIds = new Set();
let pendingDeleteDayKey = null;
let deleteConfirmationTimer = null;

if (!state.selectedDate) {
  state.selectedDate = dateKey(new Date());
}

ensureSingleRunningTask();
ensureSingleRunningCountdown();
bindEvents();
render();
setInterval(render, 1000);
registerServiceWorker();
updateNotificationUi();

function bindEvents() {
  elements.workModeButton.addEventListener("click", () => setMode("work"));
  elements.countdownModeButton.addEventListener("click", () => setMode("countdown"));

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

  elements.countdownForm.addEventListener("submit", (event) => {
    event.preventDefault();
    startCountdownTask();
  });

  elements.countdownNotificationButton.addEventListener("click", requestNotificationPermission);

  elements.countdownQuickPauseButton.addEventListener("click", () => {
    const task = getRunningCountdown();
    if (task) pauseCountdownTask(task.id);
  });

  elements.countdownQuickCompleteButton.addEventListener("click", () => {
    const task = getRunningCountdown();
    if (task) finishCountdownTask(task.id);
  });

  elements.countdownOpenList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-countdown-action]");
    if (!button) return;

    const taskId = button.closest("[data-countdown-id]")?.dataset.countdownId;
    if (!taskId) return;

    if (button.dataset.countdownAction === "pause") pauseCountdownTask(taskId);
    if (button.dataset.countdownAction === "resume") resumeCountdownTask(taskId);
    if (button.dataset.countdownAction === "finish") finishCountdownTask(taskId);
  });

  elements.prevMonth.addEventListener("click", () => {
    calendarCursor.setMonth(calendarCursor.getMonth() - 1);
    render();
  });

  elements.nextMonth.addEventListener("click", () => {
    calendarCursor.setMonth(calendarCursor.getMonth() + 1);
    render();
  });

  elements.deleteSelectedDay.addEventListener("click", requestDeleteSelectedDay);

  elements.resetData.addEventListener("click", () => {
    const confirmed = window.confirm("すべてのタスク記録を削除しますか？");
    if (!confirmed) return;
    state = {
      tasks: [],
      selectedDate: dateKey(new Date())
    };
    countdownState = {
      tasks: []
    };
    calendarCursor = new Date();
    calendarCursor.setDate(1);
    saveState();
    saveCountdownState();
    render();
  });
}

function setMode(mode) {
  const showCountdown = mode === "countdown";
  elements.workView.hidden = showCountdown;
  elements.countdownView.hidden = !showCountdown;
  elements.workModeButton.classList.toggle("active", !showCountdown);
  elements.countdownModeButton.classList.toggle("active", showCountdown);
  elements.workModeButton.setAttribute("aria-selected", String(!showCountdown));
  elements.countdownModeButton.setAttribute("aria-selected", String(showCountdown));
}

function registerServiceWorker() {
  const canRegister = "serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1");
  if (!canRegister) return;
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

function updateNotificationUi() {
  if (!("Notification" in window)) {
    elements.countdownNotificationButton.disabled = true;
    elements.countdownNotificationState.textContent = "このブラウザは通知に対応していません。";
    return;
  }

  if (Notification.permission === "granted") {
    elements.countdownNotificationButton.disabled = true;
    elements.countdownNotificationState.textContent = "通知は許可済みです。";
    return;
  }

  if (Notification.permission === "denied") {
    elements.countdownNotificationButton.disabled = true;
    elements.countdownNotificationState.textContent = "通知はブラウザ設定で拒否されています。";
    return;
  }

  elements.countdownNotificationButton.disabled = false;
  elements.countdownNotificationState.textContent = "終了時に通知を出すには許可してください。";
}

function requestNotificationPermission() {
  prepareAlarmSound();
  if (!("Notification" in window)) {
    updateNotificationUi();
    return;
  }

  Notification.requestPermission().then(() => updateNotificationUi());
}

function prepareAlarmSound() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;

  if (!alarmAudioContext) {
    alarmAudioContext = new AudioContextClass();
  }

  if (alarmAudioContext.state === "suspended") {
    alarmAudioContext.resume().catch(() => {});
  }
  alarmPrimed = true;
}

function playAlarmSound() {
  if (!alarmAudioContext || !alarmPrimed) return;

  if (alarmAudioContext.state === "suspended") {
    alarmAudioContext.resume().catch(() => {});
  }

  const now = alarmAudioContext.currentTime;
  [0, 0.22, 0.44].forEach((offset) => {
    const oscillator = alarmAudioContext.createOscillator();
    const gain = alarmAudioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, now + offset);
    gain.gain.setValueAtTime(0.0001, now + offset);
    gain.gain.exponentialRampToValueAtTime(0.18, now + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.16);
    oscillator.connect(gain);
    gain.connect(alarmAudioContext.destination);
    oscillator.start(now + offset);
    oscillator.stop(now + offset + 0.18);
  });
}

function alertCountdownFinished(task) {
  if (notifiedExpiredCountdownIds.has(task.id)) return;
  notifiedExpiredCountdownIds.add(task.id);

  playAlarmSound();
  if ("vibrate" in navigator) {
    navigator.vibrate([180, 90, 180]);
  }

  showCountdownAlert(`${task.name} のカウントダウンが終了しました。`);

  if ("Notification" in window && Notification.permission === "granted") {
    try {
      new Notification("カウントダウン終了", {
        body: `${task.name} が終了しました。`,
        tag: `countdown-${task.id}`,
        renotify: true
      });
    } catch {}
  }
}

function showCountdownAlert(message) {
  elements.countdownAlert.textContent = message;
  elements.countdownAlert.hidden = false;
  window.clearTimeout(showCountdownAlert.timeoutId);
  showCountdownAlert.timeoutId = window.setTimeout(() => {
    elements.countdownAlert.hidden = true;
  }, 5200);
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

function startCountdownTask() {
  const name = elements.countdownTaskName.value.trim();
  const totalMs = countdownInputMs();
  if (!name || totalMs <= 0) return;

  prepareAlarmSound();
  pauseRunningCountdowns();
  const now = new Date().toISOString();

  countdownState.tasks.unshift({
    id: crypto.randomUUID(),
    name,
    status: "running",
    totalMs,
    remainingMs: totalMs,
    createdAt: now,
    completedAt: null,
    lastStartedAt: now,
    segments: [
      {
        start: now,
        end: null
      }
    ]
  });

  elements.countdownTaskName.value = "";
  saveCountdownState();
  render();
}

function pauseCountdownTask(taskId) {
  const task = findCountdownTask(taskId);
  if (!task || task.status !== "running") return;

  task.remainingMs = countdownRemainingMs(task);
  closeCountdownSegment(task);
  task.lastStartedAt = null;
  task.status = task.remainingMs <= 0 ? "expired" : "paused";
  saveCountdownState();
  render();
}

function resumeCountdownTask(taskId) {
  const task = findCountdownTask(taskId);
  if (!task || task.status === "running" || task.status === "completed") return;

  prepareAlarmSound();
  notifiedExpiredCountdownIds.delete(task.id);
  pauseRunningCountdowns(task.id);
  if (task.remainingMs <= 0) {
    task.remainingMs = task.totalMs;
  }
  const now = new Date().toISOString();
  task.status = "running";
  task.lastStartedAt = now;
  task.segments.push({
    start: now,
    end: null
  });
  saveCountdownState();
  render();
}

function finishCountdownTask(taskId) {
  const task = findCountdownTask(taskId);
  if (!task || task.status === "completed") return;

  if (task.status === "running") {
    task.remainingMs = countdownRemainingMs(task);
    closeCountdownSegment(task);
  }
  task.status = "completed";
  task.completedAt = new Date().toISOString();
  task.lastStartedAt = null;
  saveCountdownState();
  render();
}

function render() {
  checkExpiredCountdowns();
  renderActiveTask();
  renderOpenTasks();
  renderToday();
  renderCalendar();
  renderSelectedDay();
  renderCompletedTasks();
  renderCountdown();
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
  const completedWorkToday = state.tasks.filter((task) => task.completedAt && dateKey(new Date(task.completedAt)) === today).length;
  const completedCountdownToday = countdownState.tasks.filter((task) => task.completedAt && dateKey(new Date(task.completedAt)) === today).length;
  const openCount = getOpenTasks().length + getOpenCountdownTasks().length;

  elements.todayTotal.textContent = formatDuration(total, false);
  elements.todayTaskCount.textContent = String(items.length);
  elements.todayCompletedCount.textContent = String(completedWorkToday + completedCountdownToday);
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
  elements.deleteSelectedDay.disabled = total <= 0;
  elements.deleteSelectedDay.textContent = pendingDeleteDayKey === state.selectedDate
    ? "もう一度押して削除"
    : "この日の記録を削除";
  elements.deleteSelectedDay.classList.toggle("confirming", pendingDeleteDayKey === state.selectedDate);
  renderWorkList(elements.selectedDayList, items);
}

function requestDeleteSelectedDay() {
  if (pendingDeleteDayKey !== state.selectedDate) {
    pendingDeleteDayKey = state.selectedDate;
    window.clearTimeout(deleteConfirmationTimer);
    deleteConfirmationTimer = window.setTimeout(() => {
      pendingDeleteDayKey = null;
      renderSelectedDay();
    }, 5000);
    renderSelectedDay();
    return;
  }

  window.clearTimeout(deleteConfirmationTimer);
  pendingDeleteDayKey = null;
  deleteSelectedDayRecords();
}

function deleteSelectedDayRecords() {
  const dayKey = state.selectedDate;
  const items = totalsByTaskForDay(dayKey);
  if (items.length === 0) return;

  const deletingToday = dayKey === dateKey(new Date());

  if (deletingToday) {
    pauseActiveTimersForDayDeletion();
  }

  state.tasks = state.tasks
    .map((task) => removeDayFromTask(task, dayKey))
    .filter(Boolean);
  countdownState.tasks = countdownState.tasks
    .map((task) => removeDayFromTask(task, dayKey))
    .filter(Boolean);

  saveState();
  saveCountdownState();
  render();
}

function pauseActiveTimersForDayDeletion() {
  const runningTask = getRunningTask();
  if (runningTask) {
    closeOpenSegment(runningTask);
    runningTask.status = "paused";
  }

  const runningCountdown = getRunningCountdown();
  if (runningCountdown) {
    runningCountdown.remainingMs = countdownRemainingMs(runningCountdown);
    closeCountdownSegment(runningCountdown);
    runningCountdown.lastStartedAt = null;
    runningCountdown.status = runningCountdown.remainingMs <= 0 ? "expired" : "paused";
  }
}

function removeDayFromTask(task, dayKey) {
  const segments = removeDayFromSegments(task.segments, dayKey);
  if (segments.length === 0) return null;

  const updatedTask = {
    ...task,
    segments
  };
  const firstStart = segments
    .map((segment) => new Date(segment.start))
    .sort((a, b) => a - b)[0];
  if (firstStart) {
    updatedTask.createdAt = firstStart.toISOString();
  }

  if (updatedTask.completedAt && dateKey(new Date(updatedTask.completedAt)) === dayKey) {
    const latestMoment = segments
      .map((segment) => new Date(segment.end || segment.start))
      .sort((a, b) => b - a)[0];
    updatedTask.completedAt = latestMoment ? latestMoment.toISOString() : null;
  }

  return updatedTask;
}

function removeDayFromSegments(segments, dayKey) {
  const dayStart = new Date(`${dayKey}T00:00:00`);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  const now = new Date();

  return segments.flatMap((segment) => {
    const start = new Date(segment.start);
    const end = segment.end ? new Date(segment.end) : now;
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return [];
    if (end <= dayStart || start >= dayEnd) return [{ ...segment }];

    const remaining = [];
    if (start < dayStart) {
      remaining.push({
        start: segment.start,
        end: dayStart.toISOString()
      });
    }
    if (end > dayEnd) {
      remaining.push({
        start: dayEnd.toISOString(),
        end: segment.end ? segment.end : null
      });
    }
    return remaining;
  });
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

function renderCountdown() {
  renderCountdownActive();
  renderOpenCountdownTasks();
  renderCompletedCountdownTasks();
}

function renderCountdownActive() {
  const task = getRunningCountdown();
  elements.countdownStatus.className = "status-pill idle";

  if (!task) {
    const openTasks = getOpenCountdownTasks();
    const hasExpired = openTasks.some((item) => item.status === "expired");
    elements.countdownQuickPauseButton.disabled = true;
    elements.countdownQuickCompleteButton.disabled = true;
    elements.countdownCurrentName.textContent = hasExpired ? "時間終了のタスクあり" : openTasks.length > 0 ? "中断中のタスクあり" : "待機中";
    elements.countdownTimer.textContent = "00:00:00";
    elements.countdownTimer.setAttribute("datetime", "PT0S");
    elements.countdownStatus.textContent = hasExpired ? "時間終了" : openTasks.length > 0 ? "中断中" : "未開始";
    elements.countdownStatus.className = hasExpired ? "status-pill expired" : openTasks.length > 0 ? "status-pill paused" : "status-pill idle";
    elements.countdownStartedAt.textContent = openTasks.length > 0 ? `${openTasks.length}件を管理中` : "--";
    return;
  }

  const remaining = countdownRemainingMs(task);
  elements.countdownQuickPauseButton.disabled = false;
  elements.countdownQuickCompleteButton.disabled = false;
  elements.countdownCurrentName.textContent = task.name;
  elements.countdownTimer.textContent = formatDuration(remaining, true);
  elements.countdownTimer.setAttribute("datetime", `PT${Math.ceil(remaining / 1000)}S`);
  elements.countdownStartedAt.textContent = `開始 ${formatTime(task.lastStartedAt || task.createdAt)}`;
  elements.countdownStatus.textContent = "カウント中";
  elements.countdownStatus.className = "status-pill running";
}

function renderOpenCountdownTasks() {
  const openTasks = getOpenCountdownTasks();
  elements.countdownOpenCount.textContent = `${openTasks.length}件`;
  elements.countdownOpenList.innerHTML = "";

  if (openTasks.length === 0) {
    elements.countdownOpenList.appendChild(emptyNode());
    return;
  }

  openTasks.forEach((task) => {
    const item = document.createElement("article");
    item.className = `task-card ${task.status}`;
    item.dataset.countdownId = task.id;

    const main = document.createElement("div");
    main.className = "task-card-main";

    const topLine = document.createElement("div");
    topLine.className = "task-card-top";

    const title = document.createElement("strong");
    title.textContent = task.name;

    const status = document.createElement("span");
    status.className = `status-pill ${task.status}`;
    status.textContent = countdownStatusLabel(task);

    const meta = document.createElement("p");
    meta.className = "item-meta";
    meta.textContent = `設定 ${formatDuration(task.totalMs, false)}`;

    const duration = document.createElement("time");
    const remaining = countdownRemainingMs(task);
    duration.textContent = formatDuration(remaining, true);
    duration.setAttribute("datetime", `PT${Math.ceil(remaining / 1000)}S`);

    topLine.append(title, status);
    main.append(topLine, meta);

    const actions = document.createElement("div");
    actions.className = "task-card-actions";

    if (task.status === "running") {
      actions.append(countdownActionButton("pause", "Ⅱ", "中断", "secondary-button small-button"));
    } else {
      const resumeLabel = task.status === "expired" ? "開始" : "再開";
      actions.append(countdownActionButton("resume", "▶", resumeLabel, "primary-button small-button"));
    }
    actions.append(countdownActionButton("finish", "✓", "完了", "complete-button small-button"));

    item.append(main, duration, actions);
    elements.countdownOpenList.appendChild(item);
  });
}

function renderCompletedCountdownTasks() {
  const completed = countdownState.tasks
    .filter((task) => task.status === "completed")
    .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));

  elements.countdownCompletedTotal.textContent = `${completed.length}件`;
  elements.countdownCompletedList.innerHTML = "";

  if (completed.length === 0) {
    elements.countdownCompletedList.appendChild(emptyNode());
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
    meta.textContent = `${formatDate(task.completedAt)} 完了 / 設定 ${formatDuration(task.totalMs, false)}`;

    const duration = document.createElement("span");
    duration.className = "duration";
    duration.textContent = `実行 ${formatDuration(countdownElapsedMs(task), false)}`;

    text.append(title, meta);
    item.append(text, duration);
    elements.countdownCompletedList.appendChild(item);
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
  const workItems = state.tasks
    .map((task) => ({
      id: task.id,
      name: task.name,
      durationMs: durationForTaskOnDay(task, dayKey),
      statusLabel: `工数 / ${taskStatusLabel(task)}`
    }))
    .filter((item) => item.durationMs > 0);

  const countdownItems = countdownState.tasks
    .map((task) => ({
      id: task.id,
      name: task.name,
      durationMs: durationForCountdownOnDay(task, dayKey),
      statusLabel: `カウントダウン / ${countdownStatusLabel(task)}`
    }))
    .filter((item) => item.durationMs > 0);

  return [...workItems, ...countdownItems].sort((a, b) => b.durationMs - a.durationMs);
}

function totalForDay(dayKey) {
  const workTotal = state.tasks.reduce((sum, task) => sum + durationForTaskOnDay(task, dayKey), 0);
  const countdownTotal = countdownState.tasks.reduce((sum, task) => sum + durationForCountdownOnDay(task, dayKey), 0);
  return workTotal + countdownTotal;
}

function durationForTaskOnDay(task, dayKey) {
  return task.segments.reduce((sum, segment) => {
    const parts = splitSegmentByDay(segment);
    return sum + (parts.get(dayKey) || 0);
  }, 0);
}

function durationForCountdownOnDay(task, dayKey) {
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

function countdownElapsedMs(task) {
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

function pauseRunningCountdowns(exceptTaskId) {
  countdownState.tasks.forEach((task) => {
    if (task.status !== "running" || task.id === exceptTaskId) return;
    task.remainingMs = countdownRemainingMs(task);
    closeCountdownSegment(task);
    task.lastStartedAt = null;
    task.status = task.remainingMs <= 0 ? "expired" : "paused";
  });
}

function closeOpenSegment(task) {
  const openSegment = task.segments.find((segment) => !segment.end);
  if (openSegment) {
    openSegment.end = new Date().toISOString();
  }
}

function closeCountdownSegment(task, endAt = new Date().toISOString()) {
  const openSegment = task.segments.find((segment) => !segment.end);
  if (openSegment) {
    openSegment.end = endAt;
  }
}

function checkExpiredCountdowns() {
  let changed = false;
  countdownState.tasks.forEach((task) => {
    if (task.status !== "running") return;
    const remaining = countdownRemainingMs(task);
    if (remaining > 0) return;
    const expiredAt = new Date(new Date(task.lastStartedAt).getTime() + task.remainingMs).toISOString();
    closeCountdownSegment(task, expiredAt);
    task.remainingMs = 0;
    task.lastStartedAt = null;
    task.status = "expired";
    alertCountdownFinished(task);
    changed = true;
  });
  if (changed) saveCountdownState();
}

function countdownRemainingMs(task) {
  if (task.status !== "running" || !task.lastStartedAt) {
    return Math.max(0, task.remainingMs || 0);
  }

  const elapsed = new Date() - new Date(task.lastStartedAt);
  return Math.max(0, (task.remainingMs || 0) - elapsed);
}

function countdownInputMs() {
  const hours = clampNumber(elements.countdownHours.value, 0, 99);
  const minutes = clampNumber(elements.countdownMinutes.value, 0, 59);
  const seconds = clampNumber(elements.countdownSeconds.value, 0, 59);
  elements.countdownHours.value = String(hours);
  elements.countdownMinutes.value = String(minutes);
  elements.countdownSeconds.value = String(seconds);
  return hours * 60 * 60 * 1000 + minutes * 60 * 1000 + seconds * 1000;
}

function clampNumber(value, min, max) {
  const number = Number.parseInt(value, 10);
  if (Number.isNaN(number)) return min;
  return Math.min(max, Math.max(min, number));
}

function findTask(taskId) {
  return state.tasks.find((task) => task.id === taskId);
}

function findCountdownTask(taskId) {
  return countdownState.tasks.find((task) => task.id === taskId);
}

function getRunningTask() {
  return state.tasks.find((task) => task.status === "running") || null;
}

function getRunningCountdown() {
  return countdownState.tasks.find((task) => task.status === "running") || null;
}

function getOpenTasks() {
  return state.tasks
    .filter((task) => task.status === "running" || task.status === "paused")
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "running" ? -1 : 1;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
}

function getOpenCountdownTasks() {
  const priority = {
    running: 0,
    expired: 1,
    paused: 2
  };

  return countdownState.tasks
    .filter((task) => task.status === "running" || task.status === "paused" || task.status === "expired")
    .sort((a, b) => {
      if (a.status !== b.status) return priority[a.status] - priority[b.status];
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
}

function taskStatusLabel(task) {
  if (task.status === "running") return "計測中";
  if (task.status === "paused") return "中断中";
  return "完了";
}

function countdownStatusLabel(task) {
  if (task.status === "running") return "カウント中";
  if (task.status === "expired") return "時間終了";
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

function countdownActionButton(action, icon, label, className) {
  const button = document.createElement("button");
  button.className = className;
  button.type = "button";
  button.dataset.countdownAction = action;

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

function loadCountdownState() {
  try {
    const stored = localStorage.getItem(COUNTDOWN_STORAGE_KEY);
    if (!stored) {
      return {
        tasks: []
      };
    }

    const parsed = JSON.parse(stored);
    return {
      tasks: normalizeCountdownTasks(parsed.tasks)
    };
  } catch {
    return {
      tasks: []
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

function normalizeCountdownTasks(tasks) {
  if (!Array.isArray(tasks)) return [];
  return tasks
    .filter((task) => task && task.id && task.name)
    .map((task) => {
      const totalMs = Number.isFinite(task.totalMs) && task.totalMs > 0 ? task.totalMs : 25 * 60 * 1000;
      const remainingMs = Number.isFinite(task.remainingMs) ? Math.max(0, task.remainingMs) : totalMs;
      return {
        id: task.id,
        name: task.name,
        status: ["running", "paused", "expired", "completed"].includes(task.status) ? task.status : "paused",
        totalMs,
        remainingMs,
        createdAt: task.createdAt || new Date().toISOString(),
        completedAt: task.completedAt || null,
        lastStartedAt: task.lastStartedAt || null,
        segments: normalizeCountdownSegments(task)
      };
    });
}

function normalizeCountdownSegments(task) {
  if (Array.isArray(task.segments)) {
    return task.segments.filter((segment) => segment && segment.start);
  }

  if (task.status === "running" && task.lastStartedAt) {
    return [
      {
        start: task.lastStartedAt,
        end: null
      }
    ];
  }

  return [];
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

function ensureSingleRunningCountdown() {
  let runningTaskFound = false;
  countdownState.tasks.forEach((task) => {
    if (task.status !== "running") return;
    if (!runningTaskFound) {
      runningTaskFound = true;
      return;
    }
    task.remainingMs = countdownRemainingMs(task);
    task.lastStartedAt = null;
    task.status = task.remainingMs <= 0 ? "expired" : "paused";
  });
  saveCountdownState();
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function saveCountdownState() {
  localStorage.setItem(COUNTDOWN_STORAGE_KEY, JSON.stringify(countdownState));
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
