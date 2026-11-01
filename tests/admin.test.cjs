const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const source = (name) => fs.readFileSync(path.join(root, name), "utf8");

async function fixture() {
  const nodes = new Map();
  const stats = { posts: [], canvases: 0, revoked: 0, reads: [], failSave: false, outputMime: null };
  function node(id) {
    if (!nodes.has(id)) {
      nodes.set(id, {
        value: "", checked: false, files: [], dataset: {}, handlers: {},
        addEventListener(type, fn) { this.handlers[type] = fn; },
        querySelectorAll() { return []; },
      });
    }
    return nodes.get(id);
  }
  const initial = {
    heroImages: [{ src: "hero.jpg", attachment: { file_token: "fixture" } }],
    cases: [
      { id: "rec-a", published: false, title: "Existing", detailReviewed: true },
      { id: "rec-b", published: true },
    ],
  };
  const sandbox = {
    console, crypto: { randomUUID }, Blob,
    URL: {
      createObjectURL() { return "blob:test"; },
      revokeObjectURL() { stats.revoked++; },
    },
    document: {
      querySelector: node,
      createElement(type) {
        assert.equal(type, "canvas");
        stats.canvases++;
        return {
          getContext() { return { drawImage() {} }; },
          toDataURL(mime) { return `data:${stats.outputMime || mime};base64,preview`; },
        };
      },
    },
    Image: class {
      width = 6000;
      height = 4000;
      set src(value) { queueMicrotask(() => this.onload()); }
    },
    FileReader: class {
      readAsDataURL(file) {
        stats.reads.push(file);
        queueMicrotask(() => {
          if (file.fail) return this.onerror();
          if (file.abort) return this.onabort();
          this.result = `data:${file.type};base64,${Buffer.from(file.bytes).toString("base64")}`;
          this.onload();
        });
      }
    },
    window: { siteConfig: initial, localStorage: { getItem() { return null; } } },
    async fetch(url, options) {
      assert.equal(url, "/api/content");
      if (!options.method) return { ok: true, json: async () => ({ ok: true, content: initial }) };
      assert.equal(options.method, "POST");
      const body = JSON.parse(options.body);
      stats.posts.push(body);
      return {
        ok: !stats.failSave,
        json: async () => stats.failSave
          ? { ok: false, error: "fixture failure" }
          : { ok: true, content: body.content },
      };
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(source("content-store.js"), sandbox);
  vm.runInContext(source("admin.js"), sandbox);
  await new Promise((resolve) => setImmediate(resolve));
  return {
    node, stats, initial, store: sandbox.window.SiteContentStore,
    run: (code) => vm.runInContext(code, sandbox),
    fire: async (id, type = "click") => node(id).handlers[type](),
    async import(content) {
      node("#import-config").files = [{ text: async () => JSON.stringify(content) }];
      await node("#import-config").handlers.change();
    },
  };
}

test("legacy identity, publication, review defaults and hero attachments survive normalization", async () => {
  const f = await fixture();
  const content = f.store.importConfig(JSON.stringify(f.initial));
  assert.equal(content.cases[0].caseKey, "rec-a");
  assert.equal(content.cases[0].id, "rec-a");
  assert.equal(content.cases[0].published, false);
  assert.equal(content.cases[1].detailReviewed, false);
  assert.equal(content.heroImages[0].attachment.file_token, "fixture");
  assert.equal(f.node("#case-key").value, "rec-a");
});

test("imports reject malformed configs, duplicate keys/IDs and missing new keys", async () => {
  const f = await fixture();
  for (const cases of [
    [{ caseKey: "same" }, { caseKey: "same" }],
    [{ id: "a", caseKey: "one" }, { id: "a", caseKey: "two" }],
    [{}], [{ caseKey: "x", title: 5 }],
  ]) {
    assert.throws(() => f.store.importConfig(JSON.stringify({ heroImages: [], cases })));
  }
  assert.throws(() => f.store.importConfig("{bad"));
  assert.throws(() => f.store.importConfig("{}"));
});

test("all SEO fields and the review checkbox edit the selected record", async () => {
  const f = await fixture();
  for (const [id, field] of [
    ["title", "title"], ["research-area", "researchArea"], ["background", "background"],
    ["challenge", "challenge"], ["approach", "approach"], ["deliverables", "deliverables"],
  ]) {
    f.node(`#case-${id}`).value = `Updated ${field}`;
    await f.fire(`#case-${id}`, "input");
    assert.equal(f.run(`state.cases[0].${field}`), `Updated ${field}`);
  }
  f.node("#case-detail-reviewed").checked = false;
  await f.fire("#case-detail-reviewed", "change");
  assert.equal(f.run("state.cases[0].detailReviewed"), false);
  assert.equal(f.run("state.cases[0].id"), "rec-a");
  assert.equal(f.run("state.cases[0].published"), false);
});

test("duplicates reset ID, key and review; new records receive unreviewed UUIDs", async () => {
  const f = await fixture();
  await f.fire("#duplicate-case");
  assert.equal(f.run("getSelectedCase().id"), null);
  assert.notEqual(f.run("getSelectedCase().caseKey"), "rec-a");
  assert.match(f.run("getSelectedCase().caseKey"), /^[0-9a-f-]{36}$/);
  assert.equal(f.run("getSelectedCase().detailReviewed"), false);
  assert.equal(f.run("getSelectedCase().published"), false);
  await f.fire("#delete-case");
  assert.equal(f.run("deletedCaseIds.size"), 0);
  await f.fire("#add-case");
  assert.equal(f.run("getSelectedCase().detailReviewed"), false);
  assert.match(f.run("getSelectedCase().caseKey"), /^[0-9a-f-]{36}$/);
});

test("explicit deletions survive failed saves and clear only after success", async () => {
  const f = await fixture();
  await f.fire("#delete-case");
  assert.equal(f.run('deletedCaseIds.has("rec-a")'), true);
  f.stats.failSave = true;
  await f.fire("#save-config");
  assert.deepEqual(f.stats.posts.at(-1).deletedCaseIds, ["rec-a"]);
  assert.equal(f.run('deletedCaseIds.has("rec-a")'), true);
  f.stats.failSave = false;
  await f.fire("#save-config");
  assert.equal(f.run("deletedCaseIds.size"), 0);
  assert.equal(f.stats.posts.at(-1).content.cases[0].id, "rec-b");
});

test("imports cannot change persisted identity/publication or implicitly delete omissions", async () => {
  const f = await fixture();
  const before = f.run("JSON.stringify(state)");
  for (const patch of [{ caseKey: "changed" }, { published: true }, { id: "changed" }]) {
    const changed = JSON.parse(before);
    Object.assign(changed.cases[0], patch);
    await f.import(changed);
    assert.equal(f.run("JSON.stringify(state)"), before);
  }
  const omitted = JSON.parse(before);
  omitted.cases = omitted.cases.slice(1);
  await f.import(omitted);
  await f.fire("#save-config");
  assert.deepEqual(f.stats.posts.at(-1).deletedCaseIds, []);
});

test("source upload retains exact original bytes and generates only a WebP preview", async () => {
  const f = await fixture();
  const bytes = Buffer.from([0, 255, 216, 1, 2, 3, 255, 217]);
  const file = { type: "image/jpeg", bytes };
  f.node("#case-source").files = [file];
  await f.fire("#case-source", "change");
  assert.equal(f.run("getSelectedCase().largeSrc"), `data:image/jpeg;base64,${bytes.toString("base64")}`);
  assert.match(f.run("getSelectedCase().thumbSrc"), /^data:image\/webp;/);
  assert.equal(f.stats.canvases, 1);
  assert.equal(f.stats.reads[0], file);
  assert.equal(f.run("getSelectedCase().largeAttachment"), null);
  assert.equal(f.run("getSelectedCase().thumbAttachment"), null);
  assert.match(f.node("#admin-status").textContent, /WebP/);
});

test("large-only upload preserves PNG bytes without canvas encoding or changing preview", async () => {
  const f = await fixture();
  const thumb = f.run("getSelectedCase().thumbSrc");
  const bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  f.node("#case-large").files = [{ type: "image/png", bytes }];
  await f.fire("#case-large", "change");
  assert.equal(f.run("getSelectedCase().largeSrc"), `data:image/png;base64,${bytes.toString("base64")}`);
  assert.equal(f.run("getSelectedCase().thumbSrc"), thumb);
  assert.equal(f.stats.canvases, 0);
  assert.equal(f.stats.reads.length, 1);
  assert.equal(f.run("getSelectedCase().largeAttachment"), null);
});

test("thumbnail encoding scales dimensions, enforces WebP and releases object URLs", async () => {
  const f = await fixture();
  f.node("#case-thumb").files = [{ type: "image/jpeg" }];
  await f.fire("#case-thumb", "change");
  assert.match(f.run("getSelectedCase().thumbSrc"), /^data:image\/webp;/);
  const result = await f.store.processImageFile({ type: "image/png" }, {
    maxWidth: 1200, maxHeight: 1200, mimeType: "image/webp",
  });
  assert.equal(result.width, 1200);
  assert.equal(result.height, 800);
  assert.equal(f.stats.revoked, 2);
  f.stats.outputMime = "image/png";
  await assert.rejects(f.store.processImageFile({ type: "image/png" }, { mimeType: "image/webp" }));
  assert.equal(f.stats.revoked, 3);
  await assert.rejects(f.store.processImageFile({ type: "text/plain" }, {}));
});

test("original read errors, aborts and invalid files reject without replacing artwork", async () => {
  const f = await fixture();
  const before = f.run("getSelectedCase().largeSrc");
  await assert.rejects(f.store.readOriginalImageFile({ type: "text/plain" }));
  await assert.rejects(f.store.readOriginalImageFile({ type: "image/png", fail: true }));
  await assert.rejects(f.store.readOriginalImageFile({ type: "image/png", abort: true }));
  f.node("#case-large").files = [{ type: "image/png", fail: true }];
  await f.fire("#case-large", "change");
  assert.equal(f.run("getSelectedCase().largeSrc"), before);
  f.node("#case-source").files = [{ type: "image/png", fail: true }];
  await f.fire("#case-source", "change");
  assert.equal(f.run("getSelectedCase().largeSrc"), before);
});

test("admin is noindex, case key is readonly and review starts unchecked", () => {
  const html = source("admin.html");
  assert.match(html, /name="robots" content="noindex, nofollow"/);
  assert.match(html, /id="case-key"[^>]*readonly/);
  assert.doesNotMatch(html, /id="case-detail-reviewed"[^>]*checked/);
});
