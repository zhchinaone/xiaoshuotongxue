const http = require("node:http");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { URL } = require("node:url");

const ROOT = __dirname;
const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

loadDotEnv(path.join(ROOT, ".env"));

const PORT = Number(process.env.PORT || 3000);
const FEISHU_CONFIG = {
  appId: process.env.FEISHU_APP_ID || "",
  appSecret: process.env.FEISHU_APP_SECRET || "",
  appToken: process.env.FEISHU_BITABLE_APP_TOKEN || "",
  heroTableName: process.env.FEISHU_HERO_TABLE_NAME || "首页主视觉",
  worksTableName: process.env.FEISHU_WORKS_TABLE_NAME || "作品库",
};

const EMPTY_CONTENT = {
  heroImages: [
    { src: "", alt: "", attachment: null },
    { src: "", alt: "", attachment: null },
    { src: "", alt: "", attachment: null },
  ],
  cases: [],
};

const DEFAULT_CONTENT = loadDefaultContent();
let feishuService;

const server = http.createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url, `http://${request.headers.host}`);

    if (requestUrl.pathname.startsWith("/api/")) {
      await handleApiRequest(request, response, requestUrl);
      return;
    }

    await serveStaticFile(requestUrl.pathname, response);
  } catch (error) {
    console.error(error);
    sendJson(response, 500, {
      ok: false,
      error: error.message || "Server error",
    });
  }
});

server.listen(PORT, () => {
  console.log(`Site server running at http://localhost:${PORT}`);
});

async function handleApiRequest(request, response, requestUrl) {
  if (request.method === "GET" && requestUrl.pathname === "/api/status") {
    sendJson(response, 200, {
      ok: true,
      connected: feishuService.isConfigured(),
      mode: feishuService.isConfigured() ? "feishu" : "default",
      message: feishuService.isConfigured()
        ? "Feishu Bitable is configured."
        : "Feishu credentials are missing. Fill .env to enable cloud sync.",
    });
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/content") {
    if (!feishuService.isConfigured()) {
      sendJson(response, 200, {
        ok: true,
        mode: "default",
        content: DEFAULT_CONTENT,
      });
      return;
    }

    try {
      const content = await feishuService.loadContent();
      sendJson(response, 200, {
        ok: true,
        mode: "feishu",
        content,
      });
    } catch (error) {
      console.warn("Failed to load Feishu content, falling back to default:", error.message);
      sendJson(response, 200, {
        ok: true,
        mode: "default",
        content: DEFAULT_CONTENT,
        warning: "Feishu content could not be loaded. Showing default content.",
      });
    }
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/content") {
    if (!feishuService.isConfigured()) {
      sendJson(response, 503, {
        ok: false,
        error: "Feishu credentials are missing. Fill .env first.",
      });
      return;
    }

    const body = await readJsonBody(request);
    const content = normalizeIncomingContent(body?.content || {});
    const saved = await feishuService.saveContent(content);
    sendJson(response, 200, {
      ok: true,
      mode: "feishu",
      content: saved,
    });
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/asset") {
    if (!feishuService.isConfigured()) {
      response.statusCode = 404;
      response.end("Asset proxy unavailable");
      return;
    }

    const encoded = requestUrl.searchParams.get("u");
    if (!encoded) {
      response.statusCode = 400;
      response.end("Missing asset url");
      return;
    }

    const remoteUrl = Buffer.from(encoded, "base64url").toString("utf8");
    const assetResponse = await feishuService.fetchAsset(remoteUrl);
    response.writeHead(assetResponse.status, {
      "Content-Type": assetResponse.contentType,
      "Cache-Control": "public, max-age=3600",
    });
    response.end(assetResponse.buffer);
    return;
  }

  sendJson(response, 404, {
    ok: false,
    error: "Not found",
  });
}

async function serveStaticFile(pathname, response) {
  let targetPath = pathname === "/" ? "/index.html" : pathname;
  targetPath = decodeURIComponent(targetPath);

  const safePath = path.normalize(path.join(ROOT, targetPath));
  if (!safePath.startsWith(ROOT)) {
    response.statusCode = 403;
    response.end("Forbidden");
    return;
  }

  try {
    const stats = await fs.promises.stat(safePath);
    const filePath = stats.isDirectory() ? path.join(safePath, "index.html") : safePath;
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    const content = await fs.promises.readFile(filePath);

    response.writeHead(200, {
      "Content-Type": contentType,
    });
    response.end(content);
  } catch {
    response.statusCode = 404;
    response.end("Not found");
  }
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
}

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function loadDefaultContent() {
  const configSource = fs.readFileSync(path.join(ROOT, "site-config.js"), "utf8");
  const sandbox = { window: {} };
  vm.runInNewContext(configSource, sandbox);
  return normalizeIncomingContent(sandbox.window.siteConfig || {}, EMPTY_CONTENT);
}

function normalizeIncomingContent(content, fallbackContent = DEFAULT_CONTENT) {
  const heroImages = Array.isArray(content.heroImages) ? content.heroImages : [];
  const cases = Array.isArray(content.cases) ? content.cases : [];

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
        id: entry.id || null,
        sort: Number(entry.sort || index + 1),
        cacheKey: entry.cacheKey || "",
        school: entry.school || "",
        journal: entry.journal || "",
        description: entry.description || "",
        categories: Array.isArray(entry.categories)
          ? entry.categories.join(" ")
          : entry.categories || "",
        alt: entry.alt || "",
        thumbSrc: entry.thumbSrc || "",
        largeSrc: entry.largeSrc || "",
        thumbAttachment: entry.thumbAttachment || null,
        largeAttachment: entry.largeAttachment || null,
        published: entry.published !== false,
      };
    }),
  };
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

class FeishuBitableService {
  constructor(config) {
    this.config = config;
    this.cachedToken = null;
    this.cachedExpireAt = 0;
    this.assetCache = new Map();
    this.assetFetchConcurrency = 0;
    this.assetFetchQueue = [];
  }

  isConfigured() {
    return Boolean(this.config.appId && this.config.appSecret && this.config.appToken);
  }

  async fetchAsset(remoteUrl) {
    const cached = this.assetCache.get(remoteUrl);
    if (cached) {
      return cached;
    }

    const asset = await this.runWithAssetSlot(async () =>
      retryWithBackoff(async () => {
        const token = await this.getTenantAccessToken();
        const response = await fetch(remoteUrl, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const contentType = response.headers.get("content-type") || "application/octet-stream";
        const buffer = Buffer.from(await response.arrayBuffer());

        if (!response.ok) {
          const error = new Error(buffer.toString("utf8") || `Failed to fetch asset: ${remoteUrl}`);
          error.statusCode = response.status;
          error.contentType = contentType;
          throw error;
        }

        return {
          status: response.status,
          contentType,
          buffer,
        };
      }),
    );

    this.assetCache.set(remoteUrl, asset);
    return asset;
  }

  async loadContent() {
    const schema = await this.ensureSchema();
    const heroRecords = await this.listRecords(schema.heroTableId);
    const workRecords = await this.listRecords(schema.worksTableId);

    const heroImages = heroRecords
      .sort((a, b) => (a.fields[schema.heroFields.sort] || 0) - (b.fields[schema.heroFields.sort] || 0))
      .slice(0, 3)
      .map((record, index) => {
        const attachments = record.fields[schema.heroFields.image] || [];
        const attachment = attachments[0] || null;
        return {
          src: pickDisplayAssetSource(
            [
              record.fields[schema.heroFields.localPath] || "",
              DEFAULT_CONTENT.heroImages[index]?.src || "",
            ],
            [attachment ? this.makeProxyUrl(attachment.url || attachment.tmp_url) : ""],
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
      heroImages.push(DEFAULT_CONTENT.heroImages[heroImages.length]);
    }

    const cases = workRecords
      .filter((record) => record.fields[schema.worksFields.published] !== false)
      .sort((a, b) => (a.fields[schema.worksFields.sort] || 0) - (b.fields[schema.worksFields.sort] || 0))
      .map((record, index) => {
        const thumbAttachment = (record.fields[schema.worksFields.thumb] || [])[0] || null;
        const largeAttachment = (record.fields[schema.worksFields.large] || [])[0] || null;
        const categories = record.fields[schema.worksFields.categories] || [];
        return {
          id: record.record_id,
          sort: Number(record.fields[schema.worksFields.sort] || index + 1),
          cacheKey: record.fields[schema.worksFields.cacheKey] || "",
          school: record.fields[schema.worksFields.school] || "",
          journal: record.fields[schema.worksFields.journal] || "",
          description: record.fields[schema.worksFields.description] || "",
          categories: Array.isArray(categories) ? categories.join(" ") : String(categories || ""),
          alt: record.fields[schema.worksFields.alt] || "",
          thumbSrc: pickDisplayAssetSource(
            [
              record.fields[schema.worksFields.thumbLocal] || "",
              DEFAULT_CONTENT.cases[index]?.thumbSrc || "",
            ],
            [thumbAttachment ? this.makeProxyUrl(thumbAttachment.url || thumbAttachment.tmp_url) : ""],
          ),
          largeSrc: pickDisplayAssetSource(
            [largeAttachment ? this.makeProxyUrl(largeAttachment.url || largeAttachment.tmp_url) : ""],
            [DEFAULT_CONTENT.cases[index]?.largeSrc || ""],
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

  async saveContent(content) {
    const normalized = await materializeLocalDisplayCache(
      normalizeIncomingContent(content),
      this,
    );
    const schema = await this.ensureSchema();

    const heroRecords = await mapAsyncSeries(
      normalized.heroImages,
      async (entry, index) => ({
        fields: {
          [schema.heroFields.sort]: index + 1,
          [schema.heroFields.alt]: entry.alt || "",
          [schema.heroFields.localPath]: localAssetExists(entry.src) ? entry.src : "",
          [schema.heroFields.image]: await this.resolveAttachmentValue(entry.src, entry.attachment),
        },
      }),
    );

    const workRecords = await mapAsyncSeries(
      normalized.cases,
      async (entry, index) => ({
        fields: {
          [schema.worksFields.sort]: index + 1,
          [schema.worksFields.cacheKey]: entry.cacheKey || "",
          [schema.worksFields.school]: entry.school,
          [schema.worksFields.journal]: entry.journal,
          [schema.worksFields.description]: entry.description,
          [schema.worksFields.categories]: entry.categories
            .split(" ")
            .map((item) => item.trim())
            .filter(Boolean),
          [schema.worksFields.alt]: entry.alt,
          [schema.worksFields.thumbLocal]: localAssetExists(entry.thumbSrc) ? entry.thumbSrc : "",
          [schema.worksFields.thumb]: await this.resolveAttachmentValue(
            entry.thumbSrc,
            entry.thumbAttachment,
          ),
          [schema.worksFields.large]: await this.resolveAttachmentValue(
            entry.largeSrc,
            entry.largeAttachment,
          ),
          [schema.worksFields.published]: entry.published !== false,
        },
      }),
    );

    await this.replaceTableRecords(schema.heroTableId, heroRecords);
    await this.replaceTableRecords(schema.worksTableId, workRecords);

    return this.loadContent();
  }

  async resolveAttachmentValue(source, attachmentMeta) {
    if (source && source.startsWith("data:")) {
      const upload = dataUrlToFile(source, attachmentMeta?.name || "upload.jpg");
      const fileToken = await this.uploadAttachment(upload);
      return [{ file_token: fileToken }];
    }

    if (attachmentMeta?.file_token) {
      return [{ file_token: attachmentMeta.file_token }];
    }

    if (source) {
      const upload = await fileSourceToFile(source, attachmentMeta?.name || "upload", this);
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
      formData.set("size", String(file.buffer.length));
      formData.set("file", new Blob([file.buffer], { type: file.type }), file.name);

      const response = await fetch("https://open.feishu.cn/open-apis/drive/v1/medias/upload_all", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const payload = await response.json();
      if (!response.ok || payload.code !== 0) {
        const sizeInKb = Math.round(file.buffer.length / 1024);
        throw new Error(`${payload.msg || "Feishu upload failed"} [${file.name}, ${sizeInKb}KB]`);
      }

      return payload.data.file_token;
    });
  }

  async runWithAssetSlot(task, maxConcurrent = 4) {
    if (this.assetFetchConcurrency >= maxConcurrent) {
      await new Promise((resolve) => this.assetFetchQueue.push(resolve));
    }

    this.assetFetchConcurrency += 1;
    try {
      return await task();
    } finally {
      this.assetFetchConcurrency -= 1;
      const next = this.assetFetchQueue.shift();
      if (next) {
        next();
      }
    }
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

    const heroFields = await this.ensureFields(heroTable.table_id, [
      { name: "排序", type: 2 },
      { name: "图片说明", type: 1 },
      { name: "本地图片路径", type: 1 },
      { name: "图片附件", type: 17 },
    ]);

    const worksFields = await this.ensureFields(worksTable.table_id, [
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
      heroFields: {
        sort: "排序",
        alt: "图片说明",
        localPath: "本地图片路径",
        image: "图片附件",
      },
      worksFields: {
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
      },
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

      const created = await this.api(
        `/bitable/v1/apps/${this.config.appToken}/tables/${tableId}/fields`,
        {
          method: "POST",
          body: payload,
        },
      );
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

  makeProxyUrl(remoteUrl) {
    return `/api/asset?u=${encodeURIComponent(Buffer.from(remoteUrl).toString("base64url"))}`;
  }

  async getTenantAccessToken() {
    if (this.cachedToken && Date.now() < this.cachedExpireAt) {
      return this.cachedToken;
    }

    const response = await fetch(
      "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify({
          app_id: this.config.appId,
          app_secret: this.config.appSecret,
        }),
      },
    );
    const payload = await response.json();

    if (!response.ok || payload.code !== 0) {
      throw new Error(payload.msg || "Failed to get Feishu tenant_access_token");
    }

    this.cachedToken = payload.tenant_access_token;
    this.cachedExpireAt = Date.now() + Math.max(0, payload.expire - 300) * 1000;
    return this.cachedToken;
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

function chunkArray(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function dataUrlToFile(dataUrl, fallbackName) {
  const match = dataUrl.match(/^data:(.+?);base64,(.+)$/);
  if (!match) {
    throw new Error("Invalid data url");
  }

  const mimeType = match[1];
  const buffer = Buffer.from(match[2], "base64");
  const extension = mimeType.split("/")[1] || "jpg";

  return {
    name: fallbackName.includes(".") ? fallbackName : `${fallbackName}.${extension}`,
    type: mimeType,
    buffer,
  };
}

async function fileSourceToFile(source, fallbackName, feishuService) {
  if (!source || typeof source !== "string") {
    return null;
  }

  if (source.startsWith("data:")) {
    return dataUrlToFile(source, fallbackName);
  }

  if (/^https?:\/\//i.test(source)) {
    return remoteUrlToFile(source, fallbackName, feishuService);
  }

  if (source.startsWith("/api/asset?")) {
    const parsed = new URL(source, "http://localhost");
    const encoded = parsed.searchParams.get("u");
    if (!encoded) {
      return null;
    }

    const remoteUrl = Buffer.from(encoded, "base64url").toString("utf8");
    return remoteUrlToFile(remoteUrl, fallbackName, feishuService);
  }

  return localPathToFile(source, fallbackName);
}

async function remoteUrlToFile(remoteUrl, fallbackName, feishuService) {
  let response = await fetch(remoteUrl);
  if (!response.ok && feishuService) {
    const asset = await feishuService.fetchAsset(remoteUrl);
    const pathname = new URL(remoteUrl).pathname;
    const fileName = fallbackName.includes(".")
      ? fallbackName
      : path.basename(pathname) || buildFileName(fallbackName, asset.contentType);

    return {
      name: fileName,
      type: asset.contentType,
      buffer: asset.buffer,
    };
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch remote asset: ${remoteUrl}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const mimeType = response.headers.get("content-type") || "application/octet-stream";
  const pathname = new URL(remoteUrl).pathname;
  const fileName = fallbackName.includes(".")
    ? fallbackName
    : path.basename(pathname) || buildFileName(fallbackName, mimeType);

  return {
    name: fileName,
    type: mimeType,
    buffer,
  };
}

async function localPathToFile(source, fallbackName) {
  const resolvedPath = resolveReadableLocalSourcePath(source);
  if (!resolvedPath || !fs.existsSync(resolvedPath)) {
    throw new Error(`Invalid local asset path: ${source}`);
  }

  const buffer = await fs.promises.readFile(resolvedPath);
  const extension = path.extname(resolvedPath).toLowerCase();
  const mimeType = MIME_TYPES[extension] || "application/octet-stream";
  const fileName = fallbackName.includes(".")
    ? fallbackName
    : path.basename(resolvedPath) || buildFileName(fallbackName, mimeType);

  return {
    name: fileName,
    type: mimeType,
    buffer,
  };
}

function buildFileName(baseName, mimeType) {
  const extension = mimeType.split("/")[1] || "bin";
  return `${baseName}.${extension}`;
}

function createCacheKey(prefix) {
  return `${prefix}-${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
}

async function materializeLocalDisplayCache(content, feishuService) {
  const nextContent = normalizeIncomingContent(content);
  nextContent.cases = nextContent.cases.map((entry) => ({
    ...entry,
    cacheKey: entry.cacheKey || createCacheKey("case"),
  }));

  nextContent.heroImages = await mapAsyncSeries(nextContent.heroImages, async (entry, index) => {
    const localPath = await cacheSourceToLocalAsset({
      source: entry.src,
      fileStem: `hero-${String(index + 1).padStart(2, "0")}`,
      outputDir: path.join(ROOT, "assets", "hero"),
      outputRoot: "assets/hero",
      feishuService,
    });

    return {
      ...entry,
      src: localPath || entry.src,
    };
  });

  nextContent.cases = await mapAsyncSeries(nextContent.cases, async (entry) => {
    const thumbLocalPath = await cacheSourceToLocalAsset({
      source: entry.thumbSrc,
      fileStem: `${entry.cacheKey}-thumb`,
      outputDir: path.join(ROOT, "assets", "cases", "thumbs"),
      outputRoot: "assets/cases/thumbs",
      feishuService,
    });

    return {
      ...entry,
      thumbSrc: thumbLocalPath || entry.thumbSrc,
    };
  });

  return nextContent;
}

async function cacheSourceToLocalAsset({ source, fileStem, outputDir, outputRoot, feishuService }) {
  if (!source || localAssetExists(source)) {
    return source || "";
  }

  const file = await fileSourceToFile(source, fileStem, feishuService);
  if (!file) {
    return "";
  }

  const extension = inferAssetExtension(file);
  const fileName = `${fileStem}.${extension}`;
  const absolutePath = path.join(outputDir, fileName);
  const relativePath = `${outputRoot}/${fileName}`.replaceAll("\\", "/");

  await fs.promises.mkdir(outputDir, { recursive: true });
  await fs.promises.writeFile(absolutePath, file.buffer);

  return relativePath;
}

function inferAssetExtension(file) {
  const extFromName = path.extname(file.name || "").toLowerCase().replace(".", "");
  if (extFromName) {
    return extFromName === "jpeg" ? "jpg" : extFromName;
  }

  const extFromMime = String(file.type || "")
    .split("/")
    .pop()
    ?.toLowerCase();

  if (extFromMime) {
    return extFromMime === "jpeg" ? "jpg" : extFromMime;
  }

  return "jpg";
}

function pickDisplayAssetSource(preferredSources, fallbackSources = []) {
  for (const source of [...preferredSources, ...fallbackSources]) {
    if (!source) {
      continue;
    }

    if (isRemoteAssetSource(source) || localAssetExists(source)) {
      return source;
    }
  }

  return "";
}

function localAssetExists(source) {
  if (!source || typeof source !== "string") {
    return false;
  }

  if (source.startsWith("data:") || /^https?:\/\//i.test(source) || source.startsWith("/api/")) {
    return false;
  }

  const resolvedPath = resolveProjectAssetPath(source);
  return Boolean(resolvedPath) && fs.existsSync(resolvedPath);
}

function isRemoteAssetSource(source) {
  return Boolean(source) && (source.startsWith("/api/") || /^https?:\/\//i.test(source));
}

function resolveProjectAssetPath(source) {
  if (!source || typeof source !== "string") {
    return "";
  }

  const cleanSource = source.split("?")[0].trim().replace(/^\/+/, "");
  if (!cleanSource) {
    return "";
  }

  const resolvedPath = path.normalize(path.join(ROOT, cleanSource));
  return resolvedPath.startsWith(ROOT) ? resolvedPath : "";
}

function resolveReadableLocalSourcePath(source) {
  if (!source || typeof source !== "string") {
    return "";
  }

  const cleanSource = source.split("?")[0].trim();
  if (!cleanSource) {
    return "";
  }

  if (path.isAbsolute(cleanSource)) {
    return path.normalize(cleanSource);
  }

  return resolveProjectAssetPath(cleanSource);
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

feishuService = new FeishuBitableService(FEISHU_CONFIG);
