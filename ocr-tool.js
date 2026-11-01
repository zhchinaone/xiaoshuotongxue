const els = {
  status: document.querySelector("#tool-status"),
  outputTarget: document.querySelector("#output-target"),
  previewVideo: document.querySelector("#preview-video"),
  captureCanvas: document.querySelector("#capture-canvas"),
  liveText: document.querySelector("#live-text"),
  recordCount: document.querySelector("#record-count"),
  recordsBody: document.querySelector("#records-body"),
  intervalSeconds: document.querySelector("#interval-seconds"),
  ocrLanguage: document.querySelector("#ocr-language"),
  baseName: document.querySelector("#base-name"),
  clickDelay: document.querySelector("#click-delay"),
  clickX: document.querySelector("#click-x"),
  clickY: document.querySelector("#click-y"),
  autoClick: document.querySelector("#auto-click"),
  saveShots: document.querySelector("#save-shots"),
  startCapture: document.querySelector("#start-capture"),
  stopCapture: document.querySelector("#stop-capture"),
  exportNow: document.querySelector("#export-now"),
  pickFolder: document.querySelector("#pick-folder"),
  clearRecords: document.querySelector("#clear-records"),
};

const state = {
  running: false,
  busy: false,
  stream: null,
  worker: null,
  workerLanguage: "",
  timer: null,
  directoryHandle: null,
  records: [],
};

const settingsKey = "ocr-tool-settings-v1";
const savedSettings = loadSettings();
applySettings(savedSettings);
renderRecords();
wireEvents();
updateOutputTarget();

async function wireEvents() {
  els.startCapture.addEventListener("click", startCapture);
  els.stopCapture.addEventListener("click", stopCapture);
  els.exportNow.addEventListener("click", exportAndMaybeClick);
  els.pickFolder.addEventListener("click", pickOutputFolder);
  els.clearRecords.addEventListener("click", clearRecords);

  [els.intervalSeconds, els.ocrLanguage, els.baseName, els.clickDelay, els.clickX, els.clickY, els.autoClick, els.saveShots].forEach((input) => {
    input.addEventListener("input", persistSettings);
    input.addEventListener("change", persistSettings);
  });

  window.addEventListener("beforeunload", stopCapture);
}

function setStatus(message, tone = "info") {
  els.status.textContent = message;
  els.status.dataset.tone = tone;
}

function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(settingsKey) || "{}");
  } catch {
    return {};
  }
}

function applySettings(settings) {
  if (typeof settings.intervalSeconds === "number") els.intervalSeconds.value = String(settings.intervalSeconds);
  if (typeof settings.ocrLanguage === "string") els.ocrLanguage.value = settings.ocrLanguage;
  if (typeof settings.baseName === "string") els.baseName.value = settings.baseName;
  if (typeof settings.clickDelay === "number") els.clickDelay.value = String(settings.clickDelay);
  if (typeof settings.clickX === "number") els.clickX.value = String(settings.clickX);
  if (typeof settings.clickY === "number") els.clickY.value = String(settings.clickY);
  if (typeof settings.autoClick === "boolean") els.autoClick.checked = settings.autoClick;
  if (typeof settings.saveShots === "boolean") els.saveShots.checked = settings.saveShots;
}

function persistSettings() {
  const payload = {
    intervalSeconds: Number(els.intervalSeconds.value) || 3,
    ocrLanguage: els.ocrLanguage.value.trim() || "chi_sim+eng",
    baseName: sanitizeName(els.baseName.value) || "ocr-database",
    clickDelay: Number(els.clickDelay.value) || 0,
    clickX: Number(els.clickX.value) || 0,
    clickY: Number(els.clickY.value) || 0,
    autoClick: els.autoClick.checked,
    saveShots: els.saveShots.checked,
  };
  localStorage.setItem(settingsKey, JSON.stringify(payload));
  updateOutputTarget();
}

function updateOutputTarget() {
  const folderText = state.directoryHandle ? `输出：${state.directoryHandle.name}` : "输出：默认下载";
  els.outputTarget.textContent = folderText;
}

async function pickOutputFolder() {
  if (!window.showDirectoryPicker) {
    setStatus("当前浏览器不支持目录选择，继续使用默认下载。", "warn");
    return;
  }

  try {
    state.directoryHandle = await window.showDirectoryPicker({ mode: "readwrite" });
    updateOutputTarget();
    setStatus(`已选择输出目录：${state.directoryHandle.name}`);
  } catch (error) {
    if (error?.name !== "AbortError") {
      setStatus(error.message || "选择目录失败。", "error");
    }
  }
}

async function startCapture() {
  if (state.running) {
    return;
  }

  try {
    state.stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        frameRate: { ideal: 12, max: 15 },
      },
      audio: false,
    });
    const [videoTrack] = state.stream.getVideoTracks();
    if (videoTrack) {
      videoTrack.addEventListener("ended", () => {
        if (state.running) {
          stopCapture();
        }
      });
    }
    els.previewVideo.srcObject = state.stream;
    await els.previewVideo.play();
    state.running = true;
    state.busy = false;
    els.startCapture.disabled = true;
    els.stopCapture.disabled = false;
    setStatus("采集已启动，正在准备 OCR 引擎...");
    await ensureWorker();
    setStatus("采集已启动。");
    scheduleNextCapture(0);
  } catch (error) {
    setStatus(error.message || "启动采集失败。", "error");
    await stopCapture();
  }
}

async function stopCapture() {
  state.running = false;
  clearTimeout(state.timer);
  state.timer = null;

  if (state.stream) {
    for (const track of state.stream.getTracks()) {
      track.stop();
    }
    state.stream = null;
  }

  if (els.previewVideo.srcObject) {
    els.previewVideo.srcObject = null;
  }

  els.startCapture.disabled = false;
  els.stopCapture.disabled = true;
}

function scheduleNextCapture(delayMs) {
  clearTimeout(state.timer);
  state.timer = setTimeout(async () => {
    if (!state.running) {
      return;
    }

    if (state.busy) {
      scheduleNextCapture(Math.max(250, Math.round((Number(els.intervalSeconds.value) || 3) * 1000)));
      return;
    }

    state.busy = true;
    try {
      await captureAndRecognize();
    } catch (error) {
      setStatus(error.message || "采集失败。", "error");
    } finally {
      state.busy = false;
      if (state.running) {
        scheduleNextCapture(Math.max(250, Math.round((Number(els.intervalSeconds.value) || 3) * 1000)));
      }
    }
  }, delayMs);
}

async function ensureWorker() {
  const nextLanguage = els.ocrLanguage.value.trim() || "chi_sim+eng";
  if (state.worker && state.workerLanguage === nextLanguage) {
    return state.worker;
  }

  if (state.worker) {
    await state.worker.terminate();
    state.worker = null;
  }

  if (!window.Tesseract) {
    throw new Error("OCR 依赖没有加载成功，请检查网络或刷新页面。");
  }

  state.workerLanguage = nextLanguage;
  state.worker = await window.Tesseract.createWorker(nextLanguage, 1, {
    logger: (message) => {
      if (message?.status) {
        setStatus(`OCR：${message.status}${typeof message.progress === "number" ? ` ${Math.round(message.progress * 100)}%` : ""}`);
      }
    },
  });
  return state.worker;
}

async function captureAndRecognize() {
  if (!state.stream) {
    return;
  }

  const worker = await ensureWorker();
  const canvas = els.captureCanvas;
  const video = els.previewVideo;
  canvas.width = video.videoWidth || 1280;
  canvas.height = video.videoHeight || 720;
  const ctx = canvas.getContext("2d", { willReadFrequently: false });
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const blob = await canvasToBlob(canvas);
  const previewUrl = URL.createObjectURL(blob);
  const result = await worker.recognize(canvas);
  const text = String(result?.data?.text || "").trim();
  const confidence = Number.isFinite(result?.data?.confidence) ? Math.round(result.data.confidence) : 0;
  const record = {
    id: crypto.randomUUID(),
    time: new Date(),
    text,
    confidence,
    previewUrl,
    blob,
  };

  state.records.unshift(record);
  els.liveText.textContent = text || "未识别到文字。";
  renderRecords();
  setStatus(`已采集 ${state.records.length} 条记录。`);
}

async function exportAndMaybeClick() {
  if (!state.records.length) {
    setStatus("还没有记录可以导出。", "warn");
    return;
  }

  const baseName = sanitizeName(els.baseName.value) || "ocr-database";
  const stamp = timeStamp(new Date());
  const bundleName = `${baseName}-${stamp}`;

  try {
    if (state.directoryHandle) {
      await saveToDirectory(bundleName);
    } else {
      await saveToDownloads(bundleName);
    }

    setStatus(`已保存 ${state.records.length} 条记录。`);
    if (els.autoClick.checked) {
      await triggerClick();
    }
  } catch (error) {
    setStatus(error.message || "保存失败。", "error");
  }
}

async function saveToDirectory(bundleName) {
  const root = await state.directoryHandle.getDirectoryHandle(bundleName, { create: true });
  const records = buildRecords();

  if (els.saveShots.checked) {
    const shots = await root.getDirectoryHandle("screenshots", { create: true });
    for (const item of records) {
      const shotHandle = await shots.getFileHandle(item.screenshotFile, { create: true });
      const writer = await shotHandle.createWritable();
      await writer.write(state.records[item.index].blob);
      await writer.close();
    }
  }

  await writeBlobToDirectory(root, `${bundleName}.xlsx`, buildWorkbook(records));
  await writeBlobToDirectory(root, `${bundleName}.md`, new Blob([buildMarkdown(records)], { type: "text/markdown;charset=utf-8" }));
}

async function saveToDownloads(bundleName) {
  const records = buildRecords();
  downloadBlob(buildWorkbook(records), `${bundleName}.xlsx`);
  downloadBlob(new Blob([buildMarkdown(records)], { type: "text/markdown;charset=utf-8" }), `${bundleName}.md`);
}

async function writeBlobToDirectory(directoryHandle, fileName, blob) {
  const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
  const writer = await fileHandle.createWritable();
  await writer.write(blob);
  await writer.close();
}

function buildWorkbook(records) {
  const rows = records.map((item) => ({
    序号: item.order,
    采集时间: item.timeText,
    置信度: item.confidence,
    截图文件: item.screenshotFile,
    OCR文本: item.text,
  }));
  const worksheet = window.XLSX.utils.json_to_sheet(rows);
  const workbook = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(workbook, worksheet, "OCR记录");
  const output = window.XLSX.write(workbook, {
    bookType: "xlsx",
    type: "array",
  });
  return new Blob([output], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function buildMarkdown(records) {
  const header = ["| 序号 | 采集时间 | 置信度 | 截图文件 | OCR 文本 |", "| --- | --- | --- | --- | --- |"];
  const rows = records.map((item) =>
    [
      item.order,
      item.timeText,
      item.confidence,
      escapeMarkdown(item.screenshotFile),
      escapeMarkdown(item.text),
    ].join(" | "),
  );
  return [...header, ...rows.map((line) => `| ${line} |`)].join("\n");
}

function buildRecords() {
  return state.records.map((record, index) => ({
    index,
    order: index + 1,
    timeText: formatDateTime(record.time),
    confidence: record.confidence,
    screenshotFile: `${timeStamp(record.time)}-${String(index + 1).padStart(3, "0")}.png`,
    text: record.text,
  }));
}

function renderRecords() {
  els.recordCount.textContent = `${state.records.length} 条记录`;
  els.recordsBody.innerHTML = state.records
    .map((record, index) => {
      return `
        <tr>
          <td>${index + 1}</td>
          <td>${formatDateTime(record.time)}</td>
          <td>${record.confidence}</td>
          <td><img class="ocr-thumb" src="${record.previewUrl}" alt="截图 ${index + 1}" /></td>
          <td><pre class="ocr-cell-text"></pre></td>
        </tr>
      `;
    })
    .join("");

  els.recordsBody.querySelectorAll(".ocr-cell-text").forEach((node, index) => {
    node.textContent = state.records[index]?.text || "";
  });

  if (!state.records.length) {
    els.recordsBody.innerHTML = `
      <tr>
        <td colspan="5" class="ocr-empty">还没有记录。</td>
      </tr>
    `;
  }
}

function clearRecords() {
  for (const record of state.records) {
    URL.revokeObjectURL(record.previewUrl);
  }
  state.records = [];
  els.liveText.textContent = "等待采集。";
  renderRecords();
  setStatus("记录已清空。");
}

async function triggerClick() {
  const payload = {
    x: Math.round(Number(els.clickX.value) || 0),
    y: Math.round(Number(els.clickY.value) || 0),
    delayMs: Math.max(0, Math.round(Number(els.clickDelay.value) || 0)),
    button: "left",
  };

  const response = await fetch("/api/automation/click", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(payload),
  });

  const result = await response.json();
  if (!response.ok || !result?.ok) {
    throw new Error(result?.error || "自动点击失败。");
  }

  setStatus(`已保存并点击 ${payload.x}, ${payload.y}`);
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function canvasToBlob(canvas) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png");
  });
}

function sanitizeName(value) {
  return String(value || "")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(value);
}

function timeStamp(value) {
  const date = value instanceof Date ? value : new Date(value);
  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
}

function escapeMarkdown(value) {
  return String(value || "")
    .replaceAll("|", "\\|")
    .replaceAll("\n", "<br>");
}
