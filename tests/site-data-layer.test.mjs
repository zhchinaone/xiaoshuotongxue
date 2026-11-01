import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { createFeishuService, jsonResponse, normalizeIncomingContent } from "../functions/_shared/site.js";

mock.method(globalThis, "fetch", async () => {
  throw new Error("Network access is forbidden in data-layer tests");
});

const fields = {
  key: "案例键", title: "案例标题", area: "研究领域", background: "研究背景",
  challenge: "表达难点", approach: "绘图思路", deliverables: "交付内容", reviewed: "详情已审核",
  published: "是否发布", thumb: "缩略图", large: "大图", sort: "排序",
};

function fixture({ works = [], heroes = [], tables = true } = {}) {
  const service = createFeishuService({}, new Request("https://example.test/"));
  const store = { works: structuredClone(works), heroes: structuredClone(heroes) };
  const mutations = [];
  const specs = [];
  service.listTables = async () => tables ? [
    { name: service.config.heroTableName, table_id: "heroes" },
    { name: service.config.worksTableName, table_id: "works" },
  ] : [];
  service.listRecords = async (id) => structuredClone(store[id]);
  service.getAssetManifest = async () => null;
  service.ensureFields = async (id, definitions) => specs.push({ id, definitions });
  service.api = async (endpoint, options) => {
    mutations.push({ endpoint, ...structuredClone(options) });
    const [, table, operation] = endpoint.match(/tables\/(works|heroes)\/records\/(batch_\w+)$/) || [];
    assert.ok(table, `Unexpected API request: ${endpoint}`);
    for (const record of options.body.records) {
      if (operation === "batch_delete") {
        store[table] = store[table].filter((item) => item.record_id !== record);
      } else if (operation === "batch_update") {
        const existing = store[table].find((item) => item.record_id === record.record_id);
        assert.ok(existing);
        Object.assign(existing.fields, record.fields);
      } else {
        store[table].push({ record_id: `new-${table}-${store[table].length}`, fields: record.fields });
      }
    }
    return { code: 0, data: {} };
  };
  return { service, store, mutations, specs };
}

const record = (id, data = {}) => ({ record_id: id, fields: data });

test("normalization carries SEO fields, strict review flag and stable legacy keys", () => {
  const input = {
    id: "legacy-id", title: "Title", researchArea: "Area", background: "Background",
    challenge: "Challenge", approach: "Approach", deliverables: "Deliverables", detailReviewed: true,
  };
  const normalized = normalizeIncomingContent({ cases: [input] }).cases[0];
  for (const [key, value] of Object.entries(input)) assert.equal(normalized[key], value);
  assert.equal(normalized.caseKey, input.id);
  assert.equal(normalizeIncomingContent({ cases: [{ detailReviewed: "false" }] }).cases[0].detailReviewed, false);
  const newCase = normalizeIncomingContent({ cases: [{}] }).cases[0];
  assert.ok(newCase.caseKey);
  assert.equal(normalizeIncomingContent({ cases: [newCase] }).cases[0].caseKey, newCase.caseKey);
});

test("reads discover missing schema without any schema creation", async () => {
  const { service, mutations, specs } = fixture({ tables: false });
  service.createTable = async () => assert.fail("Read attempted schema creation");
  const content = await service.loadContent();
  assert.deepEqual(content.cases, []);
  assert.equal(content.heroImages.length, 3);
  assert.deepEqual(mutations, []);
  assert.deepEqual(specs, []);
});

test("reads legacy schema, filters unpublished and prefers token attachments over local/temporary URLs", async () => {
  const { service, mutations } = fixture({
    heroes: [record("hero", { "图片附件": [{ file_token: "hero/token", url: "https://expired.test/hero" }] })],
    works: [record("public", {
      [fields.title]: "Title", [fields.reviewed]: true,
      [fields.thumb]: [{ file_token: "thumb token", url: "https://expired.test/thumb" }],
      [fields.large]: [{ file_token: "large-token" }],
      "缩略图原图标识": "large-token",
      "缩略图本地缓存": "assets/local.jpg",
    }), record("hidden", { [fields.published]: false })],
  });
  const content = await service.loadContent();
  assert.equal(content.cases.length, 1);
  assert.equal(content.cases[0].caseKey, "public");
  assert.equal(content.cases[0].title, "Title");
  assert.equal(content.cases[0].detailReviewed, true);
  assert.equal(content.cases[0].thumbSrc, "/api/media?token=thumb%20token");
  assert.equal(content.cases[0].largeSrc, "/api/media?token=large-token");
  assert.equal(content.heroImages[0].src, "/api/media?token=hero%2Ftoken");
  assert.deepEqual(mutations, []);
});

test("incremental save preserves record IDs, hidden/omitted records and unrelated/omitted fields", async () => {
  const hidden = record("hidden", { [fields.key]: "hidden-key", [fields.published]: false, private: "keep" });
  const omitted = record("omitted", { [fields.key]: "omitted-key" });
  const { service, store, mutations } = fixture({ works: [
    record("legacy", { [fields.title]: "Keep title", [fields.reviewed]: true, private: "keep" }), hidden, omitted,
  ] });
  await service.saveContent({ cases: [{ id: "legacy", description: "Updated" }] });
  assert.equal(store.works[0].record_id, "legacy");
  assert.equal(store.works[0].fields[fields.key], "legacy");
  assert.equal(store.works[0].fields[fields.title], "Keep title");
  assert.equal(store.works[0].fields[fields.reviewed], true);
  assert.equal(store.works[0].fields.private, "keep");
  assert.equal(store.works[0].fields["作品说明"], "Updated");
  assert.deepEqual(store.works.slice(1), [hidden, omitted]);
  assert.equal(mutations.length, 1);
  assert.ok(mutations[0].endpoint.endsWith("batch_update"));
});

test("stable keys persist through first save, later edits, reorder and lookup by key", async () => {
  const { service, store } = fixture({ works: [record("legacy")] });
  service.uploadAttachment = async () => assert.fail("Unchanged/omitted attachments must not be uploaded");
  let saved = await service.saveContent({ cases: [{ id: "legacy" }, { title: "New" }] });
  const newEntry = saved.cases.find((entry) => entry.id !== "legacy");
  assert.ok(newEntry.caseKey);
  saved = await service.saveContent({ cases: [newEntry, { caseKey: "legacy", title: "Edited" }] });
  assert.equal(saved.cases[0].caseKey, newEntry.caseKey);
  assert.equal(saved.cases[1].caseKey, "legacy");
  assert.equal(store.works.length, 2);
  assert.equal(store.works[0].fields[fields.title], "Edited");
});

test("save writes all SEO fields and migration schema includes their types", async () => {
  const { service, store, specs } = fixture();
  const input = {
    caseKey: "stable-key", title: "Title", researchArea: "Area", background: "Background",
    challenge: "Challenge", approach: "Approach", deliverables: "Deliverables", detailReviewed: true,
  };
  const saved = await service.saveContent({ cases: [input] });
  for (const [key, value] of Object.entries(input)) assert.equal(saved.cases[0][key], value);
  const definitions = specs.find((item) => item.id === "works").definitions;
  for (const name of Object.values(fields).filter((name) => ![fields.thumb, fields.large, fields.sort, fields.published].includes(name))) {
    assert.equal(definitions.find((spec) => spec.name === name)?.type, name === fields.reviewed ? 7 : 1);
  }
  await service.saveContent({ cases: [{ id: store.works[0].record_id, detailReviewed: false, title: "" }] });
  assert.equal(store.works[0].fields[fields.reviewed], false);
  assert.equal(store.works[0].fields[fields.title], "");
  assert.equal(store.works[0].fields[fields.key], "stable-key");
});

test("duplicate, changed and unknown identifiers fail before mutations", async () => {
  for (const cases of [
    [{ caseKey: "duplicate" }, { caseKey: "duplicate" }],
    [{ id: "existing", caseKey: "changed" }],
    [{ id: "missing" }],
    [{ id: "existing" }, { id: "existing" }],
    [{ caseKey: "   " }],
  ]) {
    const { service, mutations, specs } = fixture({ works: [record("existing", { [fields.key]: "original" })] });
    await assert.rejects(service.saveContent({ cases }));
    assert.deepEqual(mutations, []);
    assert.deepEqual(specs, []);
  }
  const { service } = fixture({ works: [record("a", { [fields.key]: "same" }), record("b", { [fields.key]: "same" })] });
  await assert.rejects(service.saveContent({ cases: [] }), /Duplicate caseKey/);
});

test("only explicit deletedCaseIds delete, supporting context and third-argument options", async () => {
  const { service, store, mutations } = fixture({ works: [record("a"), record("b"), record("c")] });
  await service.saveContent({ cases: [] });
  assert.equal(store.works.length, 3);
  assert.deepEqual(mutations, []);
  await service.saveContent({ cases: [] }, { deletedCaseIds: ["a"] });
  await service.saveContent({ cases: [] }, {}, { deletedCaseIds: ["b"] });
  assert.deepEqual(store.works.map((item) => item.record_id), ["c"]);
  assert.equal(mutations.length, 2);
  assert.ok(mutations.every((item) => item.endpoint.endsWith("batch_delete")));
  await assert.rejects(service.saveContent({ cases: [] }, { deletedCaseIds: ["missing"] }));
  await assert.rejects(service.saveContent({ cases: [{ id: "c" }] }, { deletedCaseIds: ["c"] }));
  await assert.rejects(service.saveContent({ cases: [] }, { deletedCaseIds: "c" }));
});

test("hero saves update in place and preserve extra hero records/unrelated fields", async () => {
  const extra = record("extra", { [fields.sort]: 4, private: "keep" });
  const { service, store } = fixture({ heroes: [
    record("hero", { [fields.sort]: 1, private: "keep", "图片附件": [{ file_token: "old" }] }), extra,
  ] });
  await service.saveContent({ heroImages: [{ src: "/api/media?token=hero-token", alt: "Updated" }], cases: [] });
  assert.equal(store.heroes.length, 2);
  assert.equal(store.heroes[0].record_id, "hero");
  assert.equal(store.heroes[0].fields.private, "keep");
  assert.deepEqual(store.heroes[0].fields["图片附件"], [{ file_token: "hero-token" }]);
  assert.deepEqual(store.heroes[1], extra);
});

test("hero updates target visible nonempty records, leaving blank sort-zero records untouched", async () => {
  const blank = record("blank", { [fields.sort]: 0, private: "untouched" });
  const { service, store } = fixture({ heroes: [blank,
    record("visible", { [fields.sort]: 2, "图片附件": [{ file_token: "old" }] }),
  ] });
  await service.saveContent({ heroImages: [{ src: "/api/media?token=new", alt: "Changed" }] });
  assert.deepEqual(store.heroes[0], blank);
  assert.equal(store.heroes[1].record_id, "visible");
  assert.deepEqual(store.heroes[1].fields["图片附件"], [{ file_token: "new" }]);
  assert.equal(store.heroes.length, 2);
});

test("JSON responses disable HTTP caching by default and allow explicit overrides", () => {
  assert.equal(jsonResponse({}).headers.get("Cache-Control"), "no-store");
  assert.equal(jsonResponse({}, 200, { "Cache-Control": "public, max-age=300" }).headers.get("Cache-Control"),
    "public, max-age=300");
});

test("unverified or stale thumbnails fall back to the actual large attachment, never index artwork", async () => {
  for (const thumbForToken of [undefined, "old-large"]) {
    const { service } = fixture({ works: [record("actual", {
      [fields.thumb]: [{ file_token: "stale-thumb" }],
      [fields.large]: [{ file_token: "current-large" }],
      "缩略图本地缓存": "assets/unrelated.jpg",
      "缩略图原图标识": thumbForToken,
    }), record("no-artwork")] });
    const content = await service.loadContent();
    assert.equal(content.cases[0].thumbSrc, "/api/media?token=current-large");
    assert.equal(content.cases[0].largeSrc, "/api/media?token=current-large");
    assert.equal(content.cases[1].thumbSrc, "");
    assert.equal(content.cases[1].largeSrc, "");
  }
});

test("a thumbnail without a large attachment is still usable", async () => {
  const { service } = fixture({ works: [record("thumb-only", {
    [fields.thumb]: [{ file_token: "thumb" }],
  })] });
  const content = await service.loadContent();
  assert.equal(content.cases[0].thumbSrc, "/api/media?token=thumb");
  assert.equal(content.cases[0].largeSrc, "");
});

test("newly uploaded thumbnail is paired to the resulting large token", async () => {
  const { service, store } = fixture({ works: [record("case", {
    [fields.large]: [{ file_token: "old-large" }], [fields.thumb]: [{ file_token: "old-thumb" }],
  })] });
  service.uploadAttachment = async (file) => file.name.includes("large") ? "new-large" : "new-thumb";
  const content = await service.saveContent({ cases: [{
    id: "case", largeSrc: "data:image/png;base64,AQ==", thumbSrc: "data:image/png;base64,Ag==",
    largeAttachment: null, thumbAttachment: null,
  }] });
  assert.equal(store.works[0].fields["缩略图原图标识"], "new-large");
  assert.equal(content.cases[0].thumbForToken, "new-large");
  assert.equal(content.cases[0].thumbSrc, "/api/media?token=new-thumb");
});

test("new thumbnail pairs with an omitted existing large attachment without reuploading it", async () => {
  const { service, store } = fixture({ works: [record("case", {
    [fields.large]: [{ file_token: "existing-large" }],
  })] });
  service.uploadAttachment = async () => "new-thumb";
  await service.saveContent({ cases: [{ id: "case", thumbSrc: "data:image/png;base64,AQ==" }] });
  assert.equal(store.works[0].fields["缩略图原图标识"], "existing-large");
  assert.deepEqual(store.works[0].fields[fields.large], [{ file_token: "existing-large" }]);
});

test("saving existing unverified thumbnails never fabricates a matching token", async () => {
  const { service, store } = fixture({ works: [record("case", {
    [fields.large]: [{ file_token: "large" }], [fields.thumb]: [{ file_token: "unverified" }],
  })] });
  const loaded = await service.loadContent();
  await service.saveContent({ cases: loaded.cases });
  assert.equal(store.works[0].fields["缩略图原图标识"], undefined);
});

test("token URLs round trip without reuploading attachments", async () => {
  const { service, store } = fixture();
  service.uploadAttachment = async () => assert.fail("Unexpected attachment upload");
  await service.saveContent({ cases: [{
    caseKey: "case", thumbSrc: "/api/media?token=thumb%2Ftoken", largeAttachment: { file_token: "large" },
  }] });
  assert.deepEqual(store.works[0].fields[fields.thumb], [{ file_token: "thumb/token" }]);
  assert.deepEqual(store.works[0].fields[fields.large], [{ file_token: "large" }]);
});

test("fetchMedia authorizes public attachments before authenticated download", async () => {
  const { service } = fixture({
    heroes: [record("hero", { "图片附件": [{ file_token: "hero-token" }] })],
    works: [record("public", { [fields.thumb]: [{ file_token: "public/token" }] }),
      record("hidden", { [fields.published]: false, [fields.large]: [{ file_token: "private-token" }] })],
  });
  const fetched = [];
  const expected = { bytes: new Uint8Array([1, 2]), status: 200, contentType: "image/png" };
  service.fetchAsset = async (url) => { fetched.push(url); return expected; };
  assert.equal(await service.fetchMedia("public/token"), expected);
  assert.ok(fetched[0].endsWith("/medias/public%2Ftoken/download"));
  assert.equal(await service.fetchMedia("hero-token"), expected);
  for (const token of ["private-token", "unknown-token", "", null]) {
    await assert.rejects(service.fetchMedia(token));
  }
  assert.equal(fetched.length, 2);
});

test("token download reuses tenant authentication and asset cache", async () => {
  const { service } = fixture();
  service.loadContent = async () => ({ heroImages: [{ attachment: { file_token: "public" } }], cases: [] });
  let authCalls = 0;
  let downloads = 0;
  service.getTenantAccessToken = async () => { authCalls += 1; return "test-only-token"; };
  const fetchMock = mock.method(globalThis, "fetch", async (url, options) => {
    downloads += 1;
    assert.equal(url, "https://open.feishu.cn/open-apis/drive/v1/medias/public/download");
    assert.equal(options.headers.Authorization, "Bearer test-only-token");
    return new Response(new Uint8Array([5, 6]), { headers: { "content-type": "image/jpeg" } });
  });
  try {
    const asset = await service.fetchMedia("public");
    assert.deepEqual(asset, { status: 200, contentType: "image/jpeg", bytes: new Uint8Array([5, 6]) });
    assert.equal(await service.fetchMedia("public"), asset);
    assert.equal(authCalls, 1);
    assert.equal(downloads, 1);
  } finally {
    fetchMock.mock.restore();
  }
});
