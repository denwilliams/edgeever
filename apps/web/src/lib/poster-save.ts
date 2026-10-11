import { markdownToDoc, posterFallbackMarkdown, parsePosterDocument, serializePosterDocument, type MemoDetail, type PosterDocument } from "@edgeever/shared";
import type { EdgeEverRepository } from "./repository";

// Immutable previews keep revision restores and concurrent drafts independent.
// Only artwork changes upload a new, bounded-size preview; metadata edits reuse it.
export const savePosterMemo = async (repository: EdgeEverRepository, memo: MemoDetail, document: PosterDocument, title: string, editSessionId: string, preview?: Blob, tags: string[] = memo.tags) => {
  let previewId: string | undefined;
  let committed = false;
  try {
    if (preview) {
      if (typeof navigator !== "undefined" && navigator.onLine === false) throw new Error("Reconnect to save the poster preview. Your local draft is preserved.");
      const { resource } = await repository.uploadMemoResource(memo.id, new File([preview], "poster-preview.png", { type: "image/png" }));
      previewId = resource.id;
    }
    const next = { ...document, ...(previewId ? { previewResourceId: previewId } : {}) };
    const result = await repository.updateMemo(memo, {
      expectedRevision: memo.revision, expectedContentHash: memo.contentHash, editSessionId, title,
      contentMarkdown: serializePosterDocument(next), contentJson: markdownToDoc(posterFallbackMarkdown(next)), tags,
    });
    committed = true;
    return { memo: result.memo, document: next };
  } finally {
    if (previewId && !committed) {
      // A storage failure can arrive after a local commit. Keep the attachment
      // unless the current source confirms that it was never referenced.
      const latest = await repository.getMemo(memo.id).catch(() => null);
      if (latest && parsePosterDocument(latest.memo.contentMarkdown)?.previewResourceId !== previewId) {
        await repository.deleteResource(previewId).catch(() => undefined);
      }
    }
  }
};
