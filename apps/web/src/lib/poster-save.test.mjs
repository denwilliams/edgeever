import { test, expect } from "bun:test";
import { createPosterDocument, parsePosterDocument } from "@edgeever/shared";
import { savePosterMemo } from "./poster-save";
const memo = { id: "memo", title: "Poster", revision: 3, contentHash: "old", tags: ["design"] };
test("saves source with optimistic revision/hash checks and immutable preview", async () => {
  let payload;
  const repository = {
    uploadMemoResource: async () => ({ resource: { id: "res_new" } }),
    updateMemo: async (_memo, input) => { payload = input; return { memo: { ...memo, ...input } }; },
    deleteResource: async () => { throw new Error("must keep committed preview"); },
  };
  await savePosterMemo(repository, memo, createPosterDocument("Hello"), "Poster", "session", new Blob(["png"]));
  expect(payload).toMatchObject({ expectedRevision: 3, expectedContentHash: "old", editSessionId: "session", tags: ["design"] });
  expect(parsePosterDocument(payload.contentMarkdown)?.previewResourceId).toBe("res_new");
  expect(JSON.stringify(payload.contentJson)).not.toContain("edgeever-poster-v1");
});
test("failed memo save removes only its uncommitted preview, never the previous revision", async () => {
  const deleted = [];
  const repository = {
    uploadMemoResource: async () => ({ resource: { id: "res_new" } }),
    updateMemo: async () => { throw new Error("revision conflict"); },
    getMemo: async () => ({ memo }),
    deleteResource: async (id) => { deleted.push(id); },
  };
  await expect(savePosterMemo(repository, memo, { ...createPosterDocument(), previewResourceId: "res_old" }, "Poster", "session", new Blob(["png"]))).rejects.toThrow("revision conflict");
  expect(deleted).toEqual(["res_new"]);
});
test("metadata-only saves reuse the existing preview and persist edited tags", async () => {
  let payload;
  const repository = {
    uploadMemoResource: async () => { throw new Error("should not upload"); },
    updateMemo: async (_memo, input) => { payload = input; return { memo }; },
  };
  const result = await savePosterMemo(repository, memo, { ...createPosterDocument(), previewResourceId: "res_old" }, "New title", "session", undefined, ["poster", "layout"]);
  expect(result.document.previewResourceId).toBe("res_old");
  expect(payload.tags).toEqual(["poster", "layout"]);
});

test("an uncertain storage failure retains a preview already referenced by source", async () => {
  const { serializePosterDocument } = await import("@edgeever/shared");
  const document = { ...createPosterDocument(), previewResourceId: "res_new" };
  let deleted = false;
  const repository = {
    uploadMemoResource: async () => ({ resource: { id: "res_new" } }),
    updateMemo: async () => { throw new Error("acknowledgement lost"); },
    getMemo: async () => ({ memo: { ...memo, contentMarkdown: serializePosterDocument(document) } }),
    deleteResource: async () => { deleted = true; },
  };
  await expect(savePosterMemo(repository, memo, document, "Poster", "session", new Blob(["png"]))).rejects.toThrow("acknowledgement lost");
  expect(deleted).toBe(false);
});
