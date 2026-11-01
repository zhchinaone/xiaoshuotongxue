(function attachSiteContentStore() {
  const STORAGE_KEY = "xs_site_content_v1";

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function padCaseNumber(index) {
    return String(index + 1).padStart(2, "0");
  }

  function normalizeHeroImage(entry, fallback) {
    return {
      ...entry,
      src: entry?.src || fallback?.src || "",
      alt: entry?.alt || fallback?.alt || "",
    };
  }

  function normalizeCaseEntry(entry, index) {
    const number = padCaseNumber(index);
    const fallback = {
      cacheKey: "",
      caseKey: "",
      title: "",
      researchArea: "",
      background: "",
      challenge: "",
      approach: "",
      deliverables: "",
      detailReviewed: false,
      school: "",
      journal: "",
      description: "",
      categories: "",
      thumbSrc: `assets/cases/thumbs/case-${number}-thumb.jpg`,
      largeSrc: `assets/cases/large/case-${number}-large.jpg`,
      alt: "科研绘图案例",
    };

    if (Array.isArray(entry)) {
      const [school = "", journal = "", description = "", categories = ""] = entry;
      const title = [school, journal].filter(Boolean).join(" · ");
      return {
        ...fallback,
        school,
        journal,
        description,
        categories,
        thumbSrc: "",
        alt: title ? `${title} 科研绘图案例` : fallback.alt,
      };
    }

    const school = entry?.school || fallback.school;
    const journal = entry?.journal || fallback.journal;
    const description = entry?.description || fallback.description;
    const categories = Array.isArray(entry?.categories)
      ? entry.categories.join(" ")
      : entry?.categories || fallback.categories;
    const title = [school, journal].filter(Boolean).join(" · ");

    return {
      ...fallback,
      cacheKey: entry?.cacheKey || fallback.cacheKey,
      ...entry,
      caseKey: String(entry?.caseKey || entry?.id || "").trim(),
      detailReviewed: entry?.detailReviewed === true,
      school,
      journal,
      description,
      categories,
      thumbSrc: entry?.thumbSrc || fallback.thumbSrc,
      largeSrc: entry?.largeSrc || fallback.largeSrc,
      alt: entry?.alt || (title ? `${title} 科研绘图案例` : fallback.alt),
    };
  }

  function normalizeConfig(rawConfig) {
    const config = rawConfig || {};
    const defaultConfig = window.siteConfig || {};
    const rawHeroImages = config.heroImages?.length ? config.heroImages : defaultConfig.heroImages || [];
    const rawCases = config.cases?.length ? config.cases : defaultConfig.cases || [];

    return {
      heroImages: [0, 1, 2].map((index) =>
        normalizeHeroImage(rawHeroImages[index], defaultConfig.heroImages?.[index]),
      ),
      cases: rawCases.map((entry, index) => normalizeCaseEntry(entry, index)),
    };
  }

  function loadConfig() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return normalizeConfig(window.siteConfig);
      }

      return normalizeConfig(JSON.parse(raw));
    } catch (error) {
      console.warn("Failed to load site content:", error);
      return normalizeConfig(window.siteConfig);
    }
  }

  function saveConfig(config) {
    const normalized = normalizeConfig(config);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    return normalized;
  }

  function resetConfig() {
    window.localStorage.removeItem(STORAGE_KEY);
    return normalizeConfig(window.siteConfig);
  }

  function exportConfig(config) {
    return JSON.stringify(normalizeConfig(config), null, 2);
  }

  function importConfig(text) {
    const parsed = JSON.parse(text);
    if (!parsed || !Array.isArray(parsed.heroImages) || !Array.isArray(parsed.cases) || !parsed.cases.length ||
        parsed.cases.some((entry) => !entry || typeof entry !== "object" || Array.isArray(entry))) {
      throw new Error("配置格式无效");
    }
    const normalized = normalizeConfig(parsed);
    validateCases(normalized.cases);
    return normalized;
  }

  function validateCases(cases) {
    const keys = new Set();
    const ids = new Set();
    for (const entry of cases) {
      const key = entry.caseKey;
      if (typeof key !== "string" || !key.trim() || key !== key.trim()) {
        throw new Error("每个作品都必须有 caseKey");
      }
      if (keys.has(key)) {
        throw new Error(`caseKey 重复：${key}`);
      }
      keys.add(key);
      if (entry.id != null) {
        if (typeof entry.id !== "string" || !entry.id.trim() || ids.has(entry.id)) {
          throw new Error("作品记录 id 无效或重复");
        }
        ids.add(entry.id);
      }
      for (const field of ["title", "researchArea", "background", "challenge", "approach", "deliverables"]) {
        if (typeof entry[field] !== "string") {
          throw new Error(`作品字段 ${field} 必须为文字`);
        }
      }
    }
  }

  function readOriginalImageFile(file) {
    return new Promise((resolve, reject) => {
      if (!file || !file.type.startsWith("image/")) {
        reject(new Error("请选择图片文件"));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve({ src: reader.result });
      reader.onerror = () => reject(new Error("原图读取失败"));
      reader.onabort = () => reject(new Error("原图读取已取消"));
      reader.readAsDataURL(file);
    });
  }

  function processImageFile(file, options) {
    const settings = {
      maxWidth: options?.maxWidth || 2400,
      maxHeight: options?.maxHeight || 2400,
      quality: options?.quality || 0.86,
      mimeType: options?.mimeType,
    };

    return new Promise((resolve, reject) => {
      if (!file || !file.type.startsWith("image/")) {
        reject(new Error("请选择图片文件"));
        return;
      }

      const image = new Image();
      const objectUrl = URL.createObjectURL(file);

      image.onload = () => {
        try {
          const scale = Math.min(
            1,
            settings.maxWidth / image.width,
            settings.maxHeight / image.height,
          );
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(image.width * scale));
          canvas.height = Math.max(1, Math.round(image.height * scale));

          const context = canvas.getContext("2d");
          context.drawImage(image, 0, 0, canvas.width, canvas.height);

          const mimeType = settings.mimeType || (file.type === "image/png" ? "image/png" : "image/jpeg");
          const src =
            mimeType === "image/png"
              ? canvas.toDataURL(mimeType)
              : canvas.toDataURL(mimeType, settings.quality);

          if (settings.mimeType && !src.startsWith(`data:${settings.mimeType};`)) {
            throw new Error("浏览器不支持所需图片格式");
          }
          resolve({ src, width: canvas.width, height: canvas.height });
        } catch (error) {
          reject(error);
        } finally {
          URL.revokeObjectURL(objectUrl);
        }
      };

      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("图片读取失败"));
      };

      image.src = objectUrl;
    });
  }

  window.SiteContentStore = {
    clone,
    exportConfig,
    importConfig,
    loadConfig,
    normalizeConfig,
    processImageFile,
    readOriginalImageFile,
    resetConfig,
    saveConfig,
    validateCases,
  };
})();
