const EMPTY_CONTENT = {
  heroImages: [
    { src: "", alt: "", attachment: null },
    { src: "", alt: "", attachment: null },
    { src: "", alt: "", attachment: null },
  ],
  cases: [],
};

const DEFAULT_SITE_CONFIG = {
  heroImages: [
    {
      src: "assets/cases/large/case-01-large.jpg",
      alt: "科研图形摘要首页展示图",
    },
    {
      src: "assets/cases/large/case-08-large.jpg",
      alt: "生物材料机制示意首页展示图",
    },
    {
      src: "assets/cases/large/case-05-large.jpg",
      alt: "期刊封面首页展示图",
    },
  ],
  cases: [
    ["北京大学", "Advanced Science · 2025", "骨修复 / 3D机制示意", "mechanism render abstract"],
    ["东华大学", "ACS Nano · 2025", "纳米材料 / 期刊封面", "cover figure"],
    ["天津大学", "Advanced Materials · 2025", "信息材料 / 3D封面视觉", "cover render"],
    ["郑州大学", "Advanced Materials · 2025", "柔性传感 / 封面视觉", "cover render"],
    ["东北大学", "Angewandte Chemie · 2025", "腐蚀科学 / 期刊封面", "cover render"],
    ["东北林业大学", "Advanced Functional Materials · 2025", "功能材料 / 图形摘要", "abstract mechanism figure"],
    ["北京科技大学", "Chemical Engineering Journal · 2025", "化工材料 / 机制拆解", "mechanism render"],
    ["华中科技大学", "Biomaterials · 2025", "生物材料 / 结构机制", "mechanism render abstract"],
    ["吉林大学", "Advanced Materials · 2025", "材料科学 / 论文图组", "abstract figure"],
    ["哈尔滨工业大学", "Renewable and Sustainable Energy Reviews · 2025", "能源环境 / 综述图示", "abstract mechanism"],
    ["中国农业大学", "Analytical Chemistry · 2025", "分析检测 / 论文图组", "abstract mechanism figure"],
    ["中山大学", "Advanced Functional Materials · 2025", "生物医学 / 3D示意", "abstract render"],
    ["西安交通大学", "Advanced Energy Materials · 2025", "能源材料 / 期刊封面", "cover render"],
    ["南京大学", "Nature Communications · 2025", "化学机制 / 论文图组", "cover figure"],
    ["复旦大学", "Advanced Science · 2025", "细胞治疗 / 图形摘要", "abstract render mechanism"],
    ["上海交通大学", "Small · 2025", "纳米结构 / 机制示意", "mechanism figure"],
    ["浙江大学", "Nano Letters · 2025", "微纳材料 / 论文图组", "abstract mechanism figure"],
    ["四川大学", "Biomaterials · 2025", "生物材料 / 图形摘要", "abstract figure"],
    ["同济大学", "Advanced Materials · 2025", "工程材料 / 3D渲染", "abstract render"],
    ["中国科学院", "Chemical Society Reviews · 2025", "综述机制 / 信息图", "abstract mechanism figure"],
    ["南开大学", "Journal of Materials Chemistry A · 2025", "能源催化 / 机制图", "abstract mechanism"],
    ["厦门大学", "Energy & Environmental Science · 2025", "能源环境 / 3D机制", "abstract mechanism render"],
    ["山东大学", "ACS Applied Materials & Interfaces · 2025", "材料界面 / 机制示意", "abstract mechanism"],
    ["武汉大学", "Advanced Healthcare Materials · 2025", "医学材料 / 论文图组", "abstract figure"],
    ["华南理工大学", "Matter · 2025", "智能材料 / 3D图示", "abstract render"],
    ["重庆大学", "Carbon · 2025", "碳材料 / 结构机制", "abstract mechanism"],
    ["苏州大学", "Advanced Functional Materials · 2025", "柔性器件 / 期刊封面", "cover render"],
    ["兰州大学", "Environmental Science & Technology · 2025", "环境科学 / 论文图组", "abstract mechanism figure"],
  ],
};

const DEFAULT_CONTENT = normalizeIncomingContent(DEFAULT_SITE_CONFIG, EMPTY_CONTENT);
const TOKEN_CACHE = new Map();
let ASSET_MANIFEST_CACHE = null;

export function createFeishuService(env, request) {
  return new FeishuBitableService(
    {
      appId: env.FEISHU_APP_ID || "",
      appSecret: env.FEISHU_APP_SECRET || "",
      appToken: env.FEISHU_BITABLE_APP_TOKEN || "",
      heroTableName: env.FEISHU_HERO_TABLE_NAME || "首页主视觉",
      worksTableName: env.FEISHU_WORKS_TABLE_NAME || "作品库",
    },
    { env, request },
  );
}

export function normalizeIncomingContent(content, fallbackContent = DEFAULT_CONTENT) {
  const heroImages = Array.isArray(content?.heroImages) ? content.heroImages : [];
  const cases = Array.isArray(content?.cases) ? content.cases : [];

  return {
    heroImages: [0, 1, 2].map((index) => ({
      src: heroImages[index]?.src || fallbackContent.heroImages[index]?.src || "",
      alt: heroImages[index]?.alt || fallbackContent.heroImages[index]?.alt || "",
      attachment: heroImages[index]?.attachment || null,
    })),
    cases: cases.map((entry, index) => {
      if (Array.isArray(entry)) {
        const [school = "", journal = "", description = "", categories = ""] = entry;
        const title = [school, journal].filter(Boolean).join(" · ");
        const number = String(index + 1).padStart(2, "0");
        return {
          id: null,
          sort: index + 1,
          cacheKey: "",
          school,
          journal,
          description,
          categories,
          alt: title ? `${title} 科研绘图案例` : "",
          thumbSrc: "",
          largeSrc: `assets/cases/large/case-${number}-large.jpg`,
          thumbAttachment: null,
          largeAttachment: null,
          published: true,
        };
      }

      return {
        id: entry?.id || null,
        sort: Number(entry?.sort || index + 1),
        cacheKey: entry?.cacheKey || "",
        school: entry?.school || "",
        journal: entry?.journal || "",
        description: entry?.description || "",
        categories: Array.isArray(entry?.categories)
          ? entry.categories.join(" ")
          : entry?.categories || "",
        alt: entry?.alt || "",
        thumbSrc: entry?.thumbSrc || "",
        largeSrc: entry?.largeSrc || "",
        thumbAttachment: entry?.thumbAttachment || null,
        largeAttachment: entry?.largeAttachment || null,
        published: entry?.published !== false,
      };
    }),
  };
}

export function jsonResponse(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}

export async function readJsonBody(request) {
  const text = await request.text();
  return text ? JSON.parse(text) : {};
}

export function encodeBase64Url(value) {
  const bytes = new TextEncoder().encode(String(value));
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

export function decodeBase64Url(value) {
  const normalized = String(value).replaceAll("-", "+").replaceAll("_", "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  const binary = atob(normalized + padding);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function createCacheKey(prefix) {
  const random = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
  return `${prefix}-${random}`;
}

function makeProxyUrl(remoteUrl) {
  return `/api/asset?u=${encodeURIComponent(encodeBase64Url(remoteUrl))}`;
}

function pickDisplayAssetSource(preferredSources, fallbackSources = [], assetManifest = null) {
  for (const source of [...preferredSources, ...fallbackSources]) {
    if (!source) {
      continue;
    }

    if (isRemoteAssetSource(source)) {
      return source;
    }

    if (isLocalStaticAssetPath(source) && localAssetExistsInManifest(source, assetManifest)) {
      return normalizeStaticAssetPath(source);
    }
  }

  return "";
}

function isRemoteAssetSource(source) {
  return Boolean(source) && (source.startsWith("/api/") || /^https?:\/\//i.test(source));
}

function isLocalStaticAssetPath(source) {
  if (!source || typeof source !== "string") {
    return false;
  }

  if (source.startsWith("data:") || /^https?:\/\//i.test(source) || source.startsWith("/api/")) {
    return false;
  }

  const cleanSource = source.split("?")[0].trim().replaceAll("\\", "/").replace(/^\/+/, "");
  return cleanSource.startsWith("assets/");
}

function normalizeStaticAssetPath(source) {
  if (!source || typeof source !== "string" || source.startsWith("/api/") || /^https?:\/\//i.test(source)) {
    return source || "";
  }

  return source.split("?")[0].trim().replaceAll("\\", "/").replace(/^\/+/, "");
}

function localAssetExistsInManifest(source, assetManifest) {
  if (!isLocalStaticAssetPath(source)) {
    return false;
  }

  if (!assetManifest) {
    return true;
  }

  return assetManifest.has(normalizeStaticAssetPath(source));
}

function buildFileName(baseName, mimeType) {
  const extension = String(mimeType || "application/octet-stream").split("/").pop() || "bin";
  return `${baseName}.${extension === "jpeg" ? "jpg" : extension}`;
}

function inferFileName(fallbackName, remoteUrl, mimeType) {
  if (fallbackName.includes(".")) {
    return fallbackName;
  }

  try {
    const pathname = new URL(remoteUrl).pathname;
    const name = pathname.split("/").pop();
    if (name) {
      return name;
    }
  } catch {
    return buildFileName(fallbackName, mimeType);
  }

  return buildFileName(fallbackName, mimeType);
}

function dataUrlToFile(dataUrl, fallbackName) {
  const match = String(dataUrl).match(/^data:(.+?);base64,(.+)$/);
  if (!match) {
    throw new Error("Invalid data url");
  }

  const mimeType = match[1];
  const binary = atob(match[2]);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  const extension = mimeType.split("/")[1] || "jpg";

  return {
    name: fallbackName.includes(".") ? fallbackName : `${fallbackName}.${extension}`,
    type: mimeType,
    bytes,
  };
}

async function fetchRemoteAssetAsFile(remoteUrl, fallbackName, feishuService) {
  let response = await fetch(remoteUrl);

  if (!response.ok && feishuService) {
    const asset = await feishuService.fetchAsset(remoteUrl);
    return {
      name: inferFileName(fallbackName, remoteUrl, asset.contentType),
      type: asset.contentType,
      bytes: asset.bytes,
    };
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch remote asset: ${remoteUrl}`);
  }

  const mimeType = response.headers.get("content-type") || "application/octet-stream";
  return {
    name: inferFileName(fallbackName, remoteUrl, mimeType),
    type: mimeType,
    bytes: new Uint8Array(await response.arrayBuffer()),
  };
}

async function fetchStaticAssetAsFile(source, fallbackName, context) {
  const normalized = normalizeStaticAssetPath(source);
  const targetUrl = new URL(`/${normalized}`, context.request.url);
  const assetRequest = new Request(targetUrl.toString(), {
    method: "GET",
    headers: { Accept: "*/*" },
  });

  const response = context.env?.ASSETS
    ? await context.env.ASSETS.fetch(assetRequest)
    : await fetch(assetRequest);

  if (!response.ok) {
    throw new Error(`Failed to fetch local asset: ${normalized}`);
  }

  const mimeType = response.headers.get("content-type") || "application/octet-stream";
  return {
    name: fallbackName.includes(".")
      ? fallbackName
      : normalized.split("/").pop() || buildFileName(fallbackName, mimeType),
    type: mimeType,
    bytes: new Uint8Array(await response.arrayBuffer()),
  };
}

async function fileSourceToFile(source, fallbackName, context) {
  if (!source || typeof source !== "string") {
    return null;
  }

  if (source.startsWith("data:")) {
    return dataUrlToFile(source, fallbackName);
  }

  if (/^https?:\/\//i.test(source)) {
    return fetchRemoteAssetAsFile(source, fallbackName, context.feishuService);
  }

  if (source.startsWith("/api/asset?")) {
    const parsed = new URL(source, "https://placeholder.local");
    const encoded = parsed.searchParams.get("u");
    if (!encoded) {
      return null;
    }

    return fetchRemoteAssetAsFile(decodeBase64Url(encoded), fallbackName, context.feishuService);
  }

  if (isLocalStaticAssetPath(source)) {
    return fetchStaticAssetAsFile(source, fallbackName, context);
  }

  return null;
}

function chunkArray(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function normalizeCategoryValue(value) {
  if (Array.isArray(value)) {
    return value.join(" ");
  }

  return String(value || "");
}

async function mapAsyncSeries(items, iteratee) {
  const results = [];
  for (let index = 0; index < items.length; index += 1) {
    results.push(await iteratee(items[index], index));
  }
  return results;
}

async function retryWithBackoff(task, maxAttempts = 6) {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      const message = String(error?.message || "");
      const shouldRetry =
        attempt < maxAttempts &&
        (message.includes("frequency limit") ||
          message.includes("Too Many Requests") ||
          message.includes("rate limit"));

      if (!shouldRetry) {
        throw error;
      }

      await sleep(400 * attempt);
    }
  }

  throw lastError;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class FeishuBitableService {
  constructor(config, context) {
    this.config = config;
    this.env = context.env;
    this.request = context.request;
    this.assetCache = new Map();
  }

  isConfigured() {
    return Boolean(this.config.appId && this.config.appSecret && this.config.appToken);
  }

  async fetchAsset(remoteUrl) {
    if (this.assetCache.has(remoteUrl)) {
      return this.assetCache.get(remoteUrl);
    }

    const asset = await retryWithBackoff(async () => {
      const token = await this.getTenantAccessToken();
      const response = await fetch(remoteUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const contentType = response.headers.get("content-type") || "application/octet-stream";
      const bytes = new Uint8Array(await response.arrayBuffer());

      if (!response.ok) {
        throw new Error(new TextDecoder().decode(bytes) || `Failed to fetch asset: ${remoteUrl}`);
      }

      return {
        status: response.status,
        contentType,
        bytes,
      };
    });

    this.assetCache.set(remoteUrl, asset);
    return asset;
  }

  async loadContent() {
    const schema = await this.ensureSchema();
    const heroRecords = await this.listRecords(schema.heroTableId);
    const workRecords = await this.listRecords(schema.worksTableId);
    const assetManifest = await this.getAssetManifest();

    const heroImages = heroRecords
      .sort((a, b) => (a.fields[schema.heroFields.sort] || 0) - (b.fields[schema.heroFields.sort] || 0))
      .slice(0, 3)
      .map((record, index) => {
        const attachments = record.fields[schema.heroFields.image] || [];
        const attachment = attachments[0] || null;
        return {
          src: pickDisplayAssetSource(
            [record.fields[schema.heroFields.localPath] || ""],
            [
              attachment ? makeProxyUrl(attachment.url || attachment.tmp_url) : "",
              DEFAULT_CONTENT.heroImages[index]?.src || "",
            ],
            assetManifest,
          ),
          alt: record.fields[schema.heroFields.alt] || DEFAULT_CONTENT.heroImages[index]?.alt || "",
          attachment: attachment
            ? {
                file_token: attachment.file_token,
                name: attachment.name,
                url: attachment.url || attachment.tmp_url,
              }
            : null,
        };
      });

    while (heroImages.length < 3) {
      heroImages.push({ ...DEFAULT_CONTENT.heroImages[heroImages.length] });
    }

    const cases = workRecords
      .filter((record) => record.fields[schema.worksFields.published] !== false)
      .sort((a, b) => (a.fields[schema.worksFields.sort] || 0) - (b.fields[schema.worksFields.sort] || 0))
      .map((record, index) => {
        const thumbAttachment = (record.fields[schema.worksFields.thumb] || [])[0] || null;
        const largeAttachment = (record.fields[schema.worksFields.large] || [])[0] || null;
        return {
          id: record.record_id,
          sort: Number(record.fields[schema.worksFields.sort] || index + 1),
          cacheKey: record.fields[schema.worksFields.cacheKey] || "",
          school: record.fields[schema.worksFields.school] || "",
          journal: record.fields[schema.worksFields.journal] || "",
          description: record.fields[schema.worksFields.description] || "",
          categories: normalizeCategoryValue(record.fields[schema.worksFields.categories]),
          alt: record.fields[schema.worksFields.alt] || "",
          thumbSrc: pickDisplayAssetSource(
            [
              record.fields[schema.worksFields.thumbLocal] || "",
              thumbAttachment ? makeProxyUrl(thumbAttachment.url || thumbAttachment.tmp_url) : "",
            ],
            [DEFAULT_CONTENT.cases[index]?.thumbSrc || ""],
            assetManifest,
          ),
          largeSrc: pickDisplayAssetSource(
            [largeAttachment ? makeProxyUrl(largeAttachment.url || largeAttachment.tmp_url) : ""],
            [DEFAULT_CONTENT.cases[index]?.largeSrc || ""],
            assetManifest,
          ),
          thumbAttachment: thumbAttachment
            ? {
                file_token: thumbAttachment.file_token,
                name: thumbAttachment.name,
                url: thumbAttachment.url || thumbAttachment.tmp_url,
              }
            : null,
          largeAttachment: largeAttachment
            ? {
                file_token: largeAttachment.file_token,
                name: largeAttachment.name,
                url: largeAttachment.url || largeAttachment.tmp_url,
              }
            : null,
          published: true,
        };
      });

    return normalizeIncomingContent({
      heroImages,
      cases,
    });
  }

  async saveContent(content, context) {
    const normalized = normalizeIncomingContent(content);
    normalized.cases = normalized.cases.map((entry, index) => ({
      ...entry,
      sort: index + 1,
      cacheKey: entry.cacheKey || createCacheKey("case"),
      thumbSrc: normalizeStaticAssetPath(entry.thumbSrc),
      largeSrc: normalizeStaticAssetPath(entry.largeSrc),
    }));
    normalized.heroImages = normalized.heroImages.map((entry) => ({
      ...entry,
      src: normalizeStaticAssetPath(entry.src),
    }));

    const heroRecords = await mapAsyncSeries(normalized.heroImages, async (entry, index) => ({
      fields: {
        [schemaHeroFields.sort]: index + 1,
        [schemaHeroFields.alt]: entry.alt || "",
        [schemaHeroFields.localPath]: isLocalStaticAssetPath(entry.src) ? normalizeStaticAssetPath(entry.src) : "",
        [schemaHeroFields.image]: await this.resolveAttachmentValue(
          entry.src,
          entry.attachment,
          `hero-${String(index + 1).padStart(2, "0")}`,
          context,
        ),
      },
    }));

    const workRecords = await mapAsyncSeries(normalized.cases, async (entry, index) => ({
      fields: {
        [schemaWorksFields.sort]: index + 1,
        [schemaWorksFields.cacheKey]: entry.cacheKey,
        [schemaWorksFields.school]: entry.school,
        [schemaWorksFields.journal]: entry.journal,
        [schemaWorksFields.description]: entry.description,
        [schemaWorksFields.categories]: entry.categories
          .split(" ")
          .map((item) => item.trim())
          .filter(Boolean),
        [schemaWorksFields.alt]: entry.alt,
        [schemaWorksFields.thumbLocal]: isLocalStaticAssetPath(entry.thumbSrc)
          ? normalizeStaticAssetPath(entry.thumbSrc)
          : "",
        [schemaWorksFields.thumb]: await this.resolveAttachmentValue(
          entry.thumbSrc,
          entry.thumbAttachment,
          `${entry.cacheKey || `case-${index + 1}`}-thumb`,
          context,
        ),
        [schemaWorksFields.large]: await this.resolveAttachmentValue(
          entry.largeSrc,
          entry.largeAttachment,
          `${entry.cacheKey || `case-${index + 1}`}-large`,
          context,
        ),
        [schemaWorksFields.published]: entry.published !== false,
      },
    }));

    const schema = await this.ensureSchema();
    await this.replaceTableRecords(schema.heroTableId, heroRecords);
    await this.replaceTableRecords(schema.worksTableId, workRecords);
    return this.loadContent();
  }

  async resolveAttachmentValue(source, attachmentMeta, fallbackName, context) {
    if (source && source.startsWith("data:")) {
      const upload = dataUrlToFile(source, attachmentMeta?.name || fallbackName);
      const fileToken = await this.uploadAttachment(upload);
      return [{ file_token: fileToken }];
    }

    if (attachmentMeta?.file_token) {
      return [{ file_token: attachmentMeta.file_token }];
    }

    if (source) {
      const upload = await fileSourceToFile(source, attachmentMeta?.name || fallbackName, context);
      if (upload) {
        const fileToken = await this.uploadAttachment(upload);
        return [{ file_token: fileToken }];
      }
    }

    return [];
  }

  async uploadAttachment(file) {
    return retryWithBackoff(async () => {
      const token = await this.getTenantAccessToken();
      const formData = new FormData();
      formData.set("file_name", file.name);
      formData.set("parent_type", "bitable_file");
      formData.set("parent_node", this.config.appToken);
      formData.set("size", String(file.bytes.length));
      formData.set("file", new Blob([file.bytes], { type: file.type }), file.name);

      const response = await fetch("https://open.feishu.cn/open-apis/drive/v1/medias/upload_all", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const payload = await response.json();
      if (!response.ok || payload.code !== 0) {
        const sizeInKb = Math.round(file.bytes.length / 1024);
        throw new Error(`${payload.msg || "Feishu upload failed"} [${file.name}, ${sizeInKb}KB]`);
      }

      return payload.data.file_token;
    });
  }

  async replaceTableRecords(tableId, records) {
    const existing = await this.listRecords(tableId);
    const recordIds = existing.map((item) => item.record_id).filter(Boolean);

    if (recordIds.length) {
      for (const chunk of chunkArray(recordIds, 500)) {
        await this.api(
          `/bitable/v1/apps/${this.config.appToken}/tables/${tableId}/records/batch_delete`,
          {
            method: "POST",
            body: {
              records: chunk,
            },
          },
        );
      }
    }

    if (!records.length) {
      return;
    }

    for (const chunk of chunkArray(records, 500)) {
      await this.api(
        `/bitable/v1/apps/${this.config.appToken}/tables/${tableId}/records/batch_create`,
        {
          method: "POST",
          body: {
            records: chunk,
          },
        },
      );
    }
  }

  async ensureSchema() {
    const tables = await this.listTables();
    let heroTable = tables.find((item) => item.name === this.config.heroTableName);
    let worksTable = tables.find((item) => item.name === this.config.worksTableName);

    if (!heroTable) {
      heroTable = await this.createTable(this.config.heroTableName);
    }

    if (!worksTable) {
      worksTable = await this.createTable(this.config.worksTableName);
    }

    await this.ensureFields(heroTable.table_id, [
      { name: "排序", type: 2 },
      { name: "图片说明", type: 1 },
      { name: "本地图片路径", type: 1 },
      { name: "图片附件", type: 17 },
    ]);

    await this.ensureFields(worksTable.table_id, [
      { name: "排序", type: 2 },
      { name: "缓存键", type: 1 },
      { name: "学校机构", type: 1 },
      { name: "期刊年份", type: 1 },
      { name: "作品说明", type: 1 },
      {
        name: "分类",
        type: 4,
        property: {
          options: [
            { name: "cover" },
            { name: "abstract" },
            { name: "mechanism" },
            { name: "render" },
            { name: "figure" },
          ],
        },
      },
      { name: "图片替代文字", type: 1 },
      { name: "缩略图本地缓存", type: 1 },
      { name: "缩略图", type: 17 },
      { name: "大图", type: 17 },
      { name: "是否发布", type: 7 },
    ]);

    return {
      heroTableId: heroTable.table_id,
      worksTableId: worksTable.table_id,
      heroFields: schemaHeroFields,
      worksFields: schemaWorksFields,
    };
  }

  async ensureFields(tableId, specs) {
    const fields = await this.listFields(tableId);
    const fieldMap = Object.fromEntries(fields.map((item) => [item.field_name, item.field_id]));

    for (const spec of specs) {
      if (fieldMap[spec.name]) {
        continue;
      }

      const payload = {
        field_name: spec.name,
        type: spec.type,
      };

      if (spec.property) {
        payload.property = spec.property;
      }

      const created = await this.api(`/bitable/v1/apps/${this.config.appToken}/tables/${tableId}/fields`, {
        method: "POST",
        body: payload,
      });
      fieldMap[spec.name] = created.data.field.field_id;
    }

    return fieldMap;
  }

  async listFields(tableId) {
    const payload = await this.api(
      `/bitable/v1/apps/${this.config.appToken}/tables/${tableId}/fields?page_size=500`,
      {
        method: "GET",
      },
    );
    return payload.data.items || [];
  }

  async listTables() {
    const payload = await this.api(`/bitable/v1/apps/${this.config.appToken}/tables?page_size=200`, {
      method: "GET",
    });
    return payload.data.items || [];
  }

  async createTable(name) {
    const payload = await this.api(`/bitable/v1/apps/${this.config.appToken}/tables`, {
      method: "POST",
      body: {
        table: {
          name,
        },
      },
    });
    return payload.data.table;
  }

  async listRecords(tableId) {
    const items = [];
    let pageToken = "";
    let hasMore = true;

    while (hasMore) {
      const suffix = pageToken ? `?page_size=500&page_token=${encodeURIComponent(pageToken)}` : "?page_size=500";
      const payload = await this.api(
        `/bitable/v1/apps/${this.config.appToken}/tables/${tableId}/records${suffix}`,
        {
          method: "GET",
        },
      );
      items.push(...(payload.data.items || []));
      hasMore = Boolean(payload.data.has_more);
      pageToken = payload.data.page_token || "";
    }

    return items;
  }

  async getTenantAccessToken() {
    const cacheKey = `${this.config.appId}:${this.config.appToken}`;
    const cached = TOKEN_CACHE.get(cacheKey);

    if (cached && Date.now() < cached.expireAt) {
      return cached.token;
    }

    const response = await fetch("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        app_id: this.config.appId,
        app_secret: this.config.appSecret,
      }),
    });
    const payload = await response.json();

    if (!response.ok || payload.code !== 0) {
      throw new Error(payload.msg || "Failed to get Feishu tenant_access_token");
    }

    TOKEN_CACHE.set(cacheKey, {
      token: payload.tenant_access_token,
      expireAt: Date.now() + Math.max(0, payload.expire - 300) * 1000,
    });
    return payload.tenant_access_token;
  }

  async getAssetManifest() {
    if (ASSET_MANIFEST_CACHE) {
      return ASSET_MANIFEST_CACHE;
    }

    const targetUrl = new URL("/asset-manifest.json", this.request.url);
    const manifestRequest = new Request(targetUrl.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    const response = this.env?.ASSETS
      ? await this.env.ASSETS.fetch(manifestRequest)
      : await fetch(manifestRequest);

    if (!response.ok) {
      return null;
    }

    const payload = await response.json();
    ASSET_MANIFEST_CACHE = new Set(Array.isArray(payload?.files) ? payload.files : []);
    return ASSET_MANIFEST_CACHE;
  }

  async api(endpoint, options) {
    return retryWithBackoff(async () => {
      const token = await this.getTenantAccessToken();
      const response = await fetch(`https://open.feishu.cn/open-apis${endpoint}`, {
        method: options.method || "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json; charset=utf-8",
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
      const payload = await response.json();

      if (!response.ok || payload.code !== 0) {
        throw new Error(payload.msg || `Feishu API error at ${endpoint}`);
      }

      return payload;
    });
  }
}

const schemaHeroFields = {
  sort: "排序",
  alt: "图片说明",
  localPath: "本地图片路径",
  image: "图片附件",
};

const schemaWorksFields = {
  sort: "排序",
  cacheKey: "缓存键",
  school: "学校机构",
  journal: "期刊年份",
  description: "作品说明",
  categories: "分类",
  alt: "图片替代文字",
  thumbLocal: "缩略图本地缓存",
  thumb: "缩略图",
  large: "大图",
  published: "是否发布",
};

export { DEFAULT_CONTENT, EMPTY_CONTENT };
