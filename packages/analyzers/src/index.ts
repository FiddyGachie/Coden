export {
  indexProject,
  indexFile,
  reindexFile,
  resetSharedProject,
  hashContent,
  type ProjectGraph,
  type FileGraph,
  type GraphNode,
  type GraphEdge,
  type NodeKind,
  type EdgeKind,
  type CacheEntry,
  type AstIndexOptions
} from "./ast-index.js";

export {
  extractHunks,
  symbolsTouchedByHunks,
  getDiff,
  getDiffSummary,
  type DiffHunk,
  type FileDiff,
  type DiffSummary,
  type LineRange,
  type GetDiffOptions
} from "./diff-model.js";

export {
  remapLine,
  remapRange,
  buildLineMap,
  type LineMapping
} from "./hunk-tracker.js";
