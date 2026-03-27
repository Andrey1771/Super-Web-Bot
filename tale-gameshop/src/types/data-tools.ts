export interface ImportIssue {
  code: string;
  message: string;
  path: string;
}

export interface ImportJobStats {
  gamesCreated: number;
  gamesUpdated: number;
  gamesSkipped: number;
  blogCreated: number;
  blogUpdated: number;
  blogSkipped: number;
  mediaCreated: number;
  mediaSkipped: number;
}

export interface ImportJob {
  id: string;
  userId: string;
  userName: string;
  startedAt: string;
  finishedAt?: string | null;
  status: string;
  dryRun: boolean;
  stats: ImportJobStats;
  errors: ImportIssue[];
  warnings: ImportIssue[];
  includes: string[];
}
