const categoryOptions = [
  { value: "cover", label: "期刊封面" },
  { value: "abstract", label: "图形摘要" },
  { value: "mechanism", label: "机制示意" },
  { value: "render", label: "3D 渲染" },
  { value: "figure", label: "论文图组" },
];

const placeholderImage =
  "data:image/svg+xml;charset=UTF-8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800"><rect width="800" height="800" fill="#f5f5f7"/><text x="50%" y="48%" text-anchor="middle" fill="#8a8a8e" font-family="Arial, sans-serif" font-size="40">Upload</text><text x="50%" y="56%" text-anchor="middle" fill="#8a8a8e" font-family="Arial, sans-serif" font-size="40">Scientific Artwork</text></svg>',
  );

const contentStore = window.SiteContentStore;
const localFallbackContent = contentStore.loadConfig();

let state = localFallbackContent;
let selectedCaseIndex = 0;
let isDirty = false;
let apiMode = "default";

const heroManager = document.querySelector("#hero-manager");
const caseList = document.querySelector("#case-list");
const statusNode = document.querySelector("#admin-status");
const saveButton = document.querySelector("#save-config");
const resetButton = document.querySelector("#reset-config");
const exportButton = document.querySelector("#export-config");
const importInput = document.querySelector("#import-config");
const addCaseButton = document.querySelector("#add-case");
const duplicateCaseButton = document.querySelector("#duplicate-case");
const deleteCaseButton = document.querySelector("#delete-case");

const schoolInput = document.querySelector("#case-school");
const journalInput = document.querySelector("#case-journal");
const descriptionInput = document.querySelector("#case-description");
const altInput = document.querySelector("#case-alt");
const sourceInput = document.querySelector("#case-source");
const thumbInput = document.querySelector("#case-thumb");
const largeInput = document.querySelector("#case-large");
const thumbPreview = document.querySelector("#thumb-preview");
const largePreview = document.querySelector("#large-preview");
const categoryGrid = document.querySelector("#category-grid");

function getSelectedCase() {
  return state.cases[selectedCaseIndex];
}

function setStatus(message, dirty) {
  statusNode.textContent = message;
  statusNode.dataset.dirty = dirty ? "true" : "false";
}

function markDirty(message) {
  isDirty = true;
  setStatus(message || "已修改，记得点击“保存修改”。", true);
}

function markSaved(message) {
  isDirty = false;
  setStatus(message || "修改已保存。", false);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function caseTitle(entry) {
  return entry.school || entry.journal || "未命名作品";
}

async function loadRemoteContent() {
  try {
    const response = await fetch("/api/content", {
      headers: {
        Accept: "application/json",
      },
    });
    const payload = await response.json();

    if (response.ok && payload?.ok && payload.content) {
      apiMode = payload.mode || "default";
      return payload.content;
    }
  } catch (error) {
    console.warn("Using local fallback content:", error.message);
  }

  apiMode = "default";
  return localFallbackContent;
}

async function saveRemoteContent() {
  const response = await fetch("/api/content", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Accept: "application/json",
    },
    body: JSON.stringify({
      content: state,
    }),
  });

  const payload = await response.json();
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || "保存失败");
  }

  apiMode = payload.mode || "feishu";
  return payload.content;
}

function renderHeroManager() {
  heroManager.innerHTML = state.heroImages
    .map(
      (entry, index) => `
        <article class="admin-image-card" data-hero-index="${index}">
          <img src="${entry.src || placeholderImage}" alt="${escapeHtml(entry.alt || `首页图片 ${index + 1}`)}" />
          <div class="admin-image-card-body">
            <strong>首页图片 ${index + 1}</strong>
            <label class="admin-field admin-field-full">
              <span>图片说明</span>
              <input type="text" data-hero-alt="${index}" value="${escapeHtml(entry.alt || "")}" placeholder="例如：首页期刊封面展示图" />
            </label>
            <label class="admin-field admin-field-full">
              <span>上传图片</span>
              <input type="file" data-hero-file="${index}" accept="image/*" />
            </label>
          </div>
        </article>
      `,
    )
    .join("");

  heroManager.querySelectorAll("[data-hero-alt]").forEach((input) => {
    input.addEventListener("input", (event) => {
      const index = Number(event.currentTarget.dataset.heroAlt);
      state.heroImages[index].alt = event.currentTarget.value.trim();
      markDirty("首页图片说明已更新，记得保存。");
    });
  });

  heroManager.querySelectorAll("[data-hero-file]").forEach((input) => {
    input.addEventListener("change", async (event) => {
      const index = Number(event.currentTarget.dataset.heroFile);
      const file = event.currentTarget.files?.[0];

      if (!file) {
        return;
      }

      try {
        const result = await contentStore.processImageFile(file, {
          maxWidth: 2200,
          maxHeight: 1600,
          quality: 0.88,
        });
        state.heroImages[index].src = result.src;
        state.heroImages[index].attachment = null;
        if (!state.heroImages[index].alt) {
          state.heroImages[index].alt = `首页图片 ${index + 1}`;
        }
        renderHeroManager();
        markDirty("首页图片已上传，记得保存。");
      } catch (error) {
        setStatus(error.message || "首页图片上传失败。", true);
      }
    });
  });
}

function renderCaseList() {
  caseList.innerHTML = state.cases
    .map((entry, index) => {
      const title = caseTitle(entry);
      const subtitle = entry.journal || "未填写期刊";
      return `
        <button class="admin-case-item${index === selectedCaseIndex ? " is-active" : ""}" type="button" data-case-index="${index}">
          <img src="${entry.thumbSrc || entry.largeSrc || placeholderImage}" alt="${escapeHtml(entry.alt || title)}" />
          <span>
            <strong>${escapeHtml(title)}</strong>
            <small>${escapeHtml(subtitle)}</small>
          </span>
        </button>
      `;
    })
    .join("");

  caseList.querySelectorAll("[data-case-index]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedCaseIndex = Number(button.dataset.caseIndex);
      renderCaseList();
      renderCaseEditor();
    });
  });
}

function renderCategoryGrid(entry) {
  const selectedCategories = new Set((entry.categories || "").split(" ").filter(Boolean));
  categoryGrid.innerHTML = categoryOptions
    .map(
      (item) => `
        <label class="admin-tag-option${selectedCategories.has(item.value) ? " is-active" : ""}">
          <input type="checkbox" value="${item.value}" ${selectedCategories.has(item.value) ? "checked" : ""} />
          <span>${item.label}</span>
        </label>
      `,
    )
    .join("");

  categoryGrid.querySelectorAll('input[type="checkbox"]').forEach((input) => {
    input.addEventListener("change", () => {
      const values = Array.from(categoryGrid.querySelectorAll('input[type="checkbox"]:checked')).map(
        (node) => node.value,
      );
      getSelectedCase().categories = values.join(" ");
      renderCategoryGrid(getSelectedCase());
      markDirty("作品分类已更新，记得保存。");
    });
  });
}

function renderCaseEditor() {
  const entry = getSelectedCase();
  if (!entry) {
    return;
  }

  schoolInput.value = entry.school || "";
  journalInput.value = entry.journal || "";
  descriptionInput.value = entry.description || "";
  altInput.value = entry.alt || "";
  sourceInput.value = "";
  thumbInput.value = "";
  largeInput.value = "";
  thumbPreview.src = entry.thumbSrc || entry.largeSrc || placeholderImage;
  largePreview.src = entry.largeSrc || entry.thumbSrc || placeholderImage;
  thumbPreview.alt = entry.alt || caseTitle(entry);
  largePreview.alt = entry.alt || caseTitle(entry);
  renderCategoryGrid(entry);
}

function bindTextInputs() {
  schoolInput.addEventListener("input", () => {
    getSelectedCase().school = schoolInput.value.trim();
    if (!altInput.value.trim()) {
      getSelectedCase().alt = `${caseTitle(getSelectedCase())} 科研绘图案例`;
      altInput.value = getSelectedCase().alt;
    }
    renderCaseList();
    markDirty();
  });

  journalInput.addEventListener("input", () => {
    getSelectedCase().journal = journalInput.value.trim();
    if (!altInput.value.trim()) {
      getSelectedCase().alt = `${caseTitle(getSelectedCase())} 科研绘图案例`;
      altInput.value = getSelectedCase().alt;
    }
    renderCaseList();
    markDirty();
  });

  descriptionInput.addEventListener("input", () => {
    getSelectedCase().description = descriptionInput.value.trim();
    markDirty();
  });

  altInput.addEventListener("input", () => {
    getSelectedCase().alt = altInput.value.trim();
    renderCaseList();
    markDirty();
  });
}

function bindImageInputs() {
  sourceInput.addEventListener("change", async () => {
    const file = sourceInput.files?.[0];
    if (!file) {
      return;
    }

    try {
      const [thumbResult, largeResult] = await Promise.all([
        contentStore.processImageFile(file, {
          maxWidth: 1200,
          maxHeight: 1200,
          quality: 0.82,
        }),
        contentStore.processImageFile(file, {
          maxWidth: 2400,
          maxHeight: 2400,
          quality: 0.86,
        }),
      ]);

      getSelectedCase().thumbSrc = thumbResult.src;
      getSelectedCase().largeSrc = largeResult.src;
      getSelectedCase().thumbAttachment = null;
      getSelectedCase().largeAttachment = null;
      renderCaseList();
      renderCaseEditor();
      markDirty("已根据一张原图自动生成缩略图和大图，记得保存。");
    } catch (error) {
      setStatus(error.message || "原图处理失败。", true);
    }
  });

  thumbInput.addEventListener("change", async () => {
    const file = thumbInput.files?.[0];
    if (!file) {
      return;
    }

    try {
      const result = await contentStore.processImageFile(file, {
        maxWidth: 1200,
        maxHeight: 1200,
        quality: 0.82,
      });
      getSelectedCase().thumbSrc = result.src;
      getSelectedCase().thumbAttachment = null;
      renderCaseList();
      renderCaseEditor();
      markDirty("缩略图已上传，记得保存。");
    } catch (error) {
      setStatus(error.message || "缩略图上传失败。", true);
    }
  });

  largeInput.addEventListener("change", async () => {
    const file = largeInput.files?.[0];
    if (!file) {
      return;
    }

    try {
      const result = await contentStore.processImageFile(file, {
        maxWidth: 2400,
        maxHeight: 2400,
        quality: 0.86,
      });
      getSelectedCase().largeSrc = result.src;
      getSelectedCase().largeAttachment = null;
      renderCaseEditor();
      markDirty("大图已上传，记得保存。");
    } catch (error) {
      setStatus(error.message || "大图上传失败。", true);
    }
  });
}

function createEmptyCase() {
  return {
    cacheKey: "",
    school: "",
    journal: "",
    description: "",
    categories: "abstract",
    thumbSrc: "",
    largeSrc: "",
    alt: "科研绘图案例",
    thumbAttachment: null,
    largeAttachment: null,
    published: true,
  };
}

function bindActions() {
  addCaseButton.addEventListener("click", () => {
    state.cases.push(createEmptyCase());
    selectedCaseIndex = state.cases.length - 1;
    renderCaseList();
    renderCaseEditor();
    markDirty("已新增一个空白作品，开始上传即可。");
  });

  duplicateCaseButton.addEventListener("click", () => {
    const duplicated = contentStore.clone(getSelectedCase());
    duplicated.id = null;
    duplicated.cacheKey = "";
    state.cases.splice(selectedCaseIndex + 1, 0, duplicated);
    selectedCaseIndex += 1;
    renderCaseList();
    renderCaseEditor();
    markDirty("已复制当前作品。");
  });

  deleteCaseButton.addEventListener("click", () => {
    if (state.cases.length <= 1) {
      setStatus("至少保留一个作品条目会更稳妥。", true);
      return;
    }

    state.cases.splice(selectedCaseIndex, 1);
    selectedCaseIndex = Math.max(0, selectedCaseIndex - 1);
    renderCaseList();
    renderCaseEditor();
    markDirty("当前作品已删除。");
  });

  saveButton.addEventListener("click", async () => {
    try {
      state = await saveRemoteContent();
      renderHeroManager();
      renderCaseList();
      renderCaseEditor();
      markSaved(
        apiMode === "feishu"
          ? "修改已保存到飞书多维表格。刷新官网就能看到新内容。"
          : "修改已保存。",
      );
    } catch (error) {
      setStatus(error.message || "保存失败。", true);
    }
  });

  resetButton.addEventListener("click", async () => {
    state = contentStore.clone(localFallbackContent);
    selectedCaseIndex = 0;
    renderHeroManager();
    renderCaseList();
    renderCaseEditor();
    markDirty("已恢复到默认内容，点击保存后会同步到飞书。");
  });

  exportButton.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "xs-site-content.json";
    link.click();
    URL.revokeObjectURL(url);
    setStatus("当前内容已导出为 JSON。", isDirty);
  });

  importInput.addEventListener("change", async () => {
    const file = importInput.files?.[0];
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      state = JSON.parse(text);
      selectedCaseIndex = 0;
      renderHeroManager();
      renderCaseList();
      renderCaseEditor();
      markDirty("配置已导入，记得点击保存。");
    } catch (error) {
      setStatus("导入失败，请确认选择的是本站导出的 JSON。", true);
    } finally {
      importInput.value = "";
    }
  });
}

async function init() {
  state = await loadRemoteContent();
  renderHeroManager();
  renderCaseList();
  renderCaseEditor();
  bindTextInputs();
  bindImageInputs();
  bindActions();
  markSaved(
    apiMode === "feishu"
      ? "当前内容来自飞书多维表格。修改后点击“保存修改”即可同步。"
      : "当前显示的是默认内容。配置好 .env 后，保存将同步到飞书。",
  );
}

init();
