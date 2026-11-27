export type PaperKind =
  | "journal"
  | "conference"
  | "preprint"
  | "book"
  | "book_chapter"
  | "thesis"
  | "tech_report"
  | "dataset"
  | "other";

export type ReadingStatus = "unread" | "queued" | "reading" | "read" | "skimmed";

export interface VenueRef {
  id: string;
  kind: string;
  abbrev: string | null;
  fullName: string;
  edition: { id: string; year: number; track: string; ordinal: number | null } | null;
  ccfField: string | null;
  ccfFieldKey: string | null;
}

export interface CcfEvaluation {
  level: string;
  field: string;
  fieldKey: string | null;
  datasetVersion: string;
  fallback: boolean;
}

export interface CasEvaluation {
  level: string;
  isTop: boolean;
  datasetVersion: string;
  fallback: boolean;
  majorField: string;
  majorFieldEn: string | null;
  minorFields: { fieldName: string; fieldNameEn: string | null; level: string }[];
}

export interface Evaluation {
  ccf: CcfEvaluation | null;
  cas: CasEvaluation | null;
}

export interface PaperAuthor {
  id: string;
  displayName: string;
  familyName: string | null;
  givenName: string | null;
  position: number;
  isCorresponding: boolean;
  equalContribution: boolean;
  affiliation: string | null;
  orcid: string | null;
  isMe: boolean;
}

export interface PaperState {
  status: ReadingStatus;
  priority: number;
  rating: number | null;
  progressPage: number | null;
  starred: boolean;
  archived: boolean;
}

export interface PaperCounts {
  pdfFiles: number;
  annotations: number;
  citedBy: number;
}

export interface PaperSummary {
  id: string;
  kind: PaperKind;
  title: string;
  citekey: string;
  year: number;
  venue: VenueRef | null;
  evaluation: Evaluation;
  authors: PaperAuthor[];
  authorCount: number;
  state: PaperState;
  counts: PaperCounts;
  tags: string[];
  collections: string[];
  /** 调研工作区暂存：默认不出现在文献库列表里 */
  staged?: boolean;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface PaperDetail extends PaperSummary {
  abstract: string | null;
  publicationDate: string | null;
  volume: string | null;
  issue: string | null;
  pages: string | null;
  institution: string | null;
  language: string;
  authorKeywords: string[];
  userLockedFields: string[];
  urls: Record<string, unknown>;
  identifiers: { id: string; scheme: string; value: string; isPrimary: boolean }[];
}

export interface PaperPage {
  items: PaperSummary[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface CollectionNode {
  id: string;
  parentId: string | null;
  name: string;
  slug: string | null;
  description: string | null;
  position: number;
  paperCount: number;
  totalCount: number;
  children: CollectionNode[];
}

export interface TagNode {
  id: string;
  path: string;
  namespace: string;
  name: string;
  parentId: string | null;
  color: string | null;
  description: string | null;
  paperCount: number;
  children: TagNode[];
}

export interface SavedView {
  id: string;
  name: string;
  description: string | null;
  filter: Record<string, unknown>;
  sort: { field?: string; direction?: string }[];
  columns: string[];
  viewMode: string;
  isPinned: boolean;
  position: number;
  count: number;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  citekeyTemplate: string | null;
  exportIncludeAbstract: boolean;
  collectionIds: string[];
  paperIds: string[];
  paperCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PdfFile {
  id: string;
  paperId: string;
  isPrimary: boolean;
  byteSize: number;
  pageCount: number | null;
  mime: string;
  originalFilename: string | null;
  textStatus: "pending" | "extracted" | "ocr_needed" | "failed";
  textLanguage: string | null;
  createdAt: string;
}

export interface Annotation {
  id: string;
  paperId: string;
  pdfFileId: string;
  kind: string;
  page: number;
  rects: { x: number; y: number; w: number; h: number }[];
  quote: string;
  prefix: string | null;
  suffix: string | null;
  comment: string | null;
  color: string;
  anchorStatus: string;
  createdAt: string;
  updatedAt: string;
}

export interface ImportCreated {
  importId: string;
  jobId: string;
  status: string;
  items: number;
}

export interface ImportItem {
  id: string;
  ordinal: number;
  rawInput: string;
  status: string;
  paperId: string | null;
  error: string | null;
  attempts: number;
}

export interface ImportJob {
  id: string;
  kind: string;
  status: string;
  stats: Record<string, number>;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  errorSummary: string | null;
}

export interface ImportPage {
  items: ImportJob[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface Job {
  id: string;
  kind: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface Meta {
  version: string;
  datasets: {
    scheme: string;
    version: string;
    label: string;
    sourceUrl: string | null;
    checksum: string;
    importedAt: string;
    isCurrent: boolean;
    validFrom: number | null;
    validTo: number | null;
  }[];
  counts: Record<string, number>;
  venues: Record<string, number>;
  storage: { backend: string; bytesUsed: number; files: number; blobs: number };
  jobs: Record<string, number>;
}

export interface SearchHit {
  paperId: string;
  paperTitle: string;
  fileId: string;
  page: number;
  snippet: string;
}

export interface FulltextSearch {
  query: string;
  hits: SearchHit[];
  hasMore: boolean;
}

export interface ApiProblem {
  type?: string;
  title?: string;
  status?: number;
  code?: string;
  detail?: string;
}


export interface Token {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
}

export interface TokenCreated extends Token {
  token: string;
}

export interface ExportToken {
  id: string;
  name: string;
  prefix: string;
  scopeType: string;
  scopeId: string | null;
  includeAbstract: boolean;
  createdAt: string;
  lastAccessedAt: string | null;
  accessCount: number;
  revokedAt: string | null;
}

export interface ExportTokenCreated {
  id: string;
  name: string;
  prefix: string;
  scopeType: string;
  scopeId: string | null;
  url: string;
  createdAt: string;
}


export interface CitationPaper {
  id: string;
  title: string;
  year: number;
  citekey: string;
}

export interface ExternalWork {
  id: string;
  title: string;
  year: number | null;
  doi: string | null;
  openalexId: string | null;
  citedByCount: number | null;
  resolvedPaperId: string | null;
}

export interface CitationItem {
  inLibrary: boolean;
  paper: CitationPaper | null;
  external: ExternalWork | null;
  source: string;
}

export interface CitationPage {
  items: CitationItem[];
  hasMore: boolean;
}


export interface PdfImportCreated {
  paperId: string;
  fileId: string;
  jobId: string | null;
  created: boolean;
  title: string;
  warnings: string[];
}


export interface ResearchWorkspace {
  id: string;
  name: string;
  description: string | null;
  paperCount: number;
  pendingCount: number;
  createdAt: string;
  closedAt: string | null;
}

export interface ResearchWorkspacePaper {
  paperId: string;
  citekey: string;
  title: string;
  year: number;
  kind: PaperKind;
  promoted: boolean;
  note: string | null;
}

export interface ResearchWorkspaceDetail extends ResearchWorkspace {
  papers: ResearchWorkspacePaper[];
}

export interface DuplicateCandidate {
  paper: PaperSummary;
  score: number;
  reasons: string[];
}
