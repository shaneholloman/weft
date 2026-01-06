/**
 * Unified diff parser
 * Parses git diff output into structured data
 */

export interface DiffFile {
  path: string;
  oldPath?: string;
  action: 'added' | 'modified' | 'deleted' | 'renamed';
  hunks: DiffHunk[];
  additions: number;
  deletions: number;
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  header: string;
  lines: DiffLine[];
}

export interface DiffLine {
  type: 'context' | 'addition' | 'deletion' | 'header';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

/**
 * Parse a unified diff string into structured data
 */
export function parseDiff(diffText: string): DiffFile[] {
  const files: DiffFile[] = [];
  const fileDiffs = diffText.split(/(?=^diff --git)/m).filter(Boolean);

  for (const fileDiff of fileDiffs) {
    const file = parseFileDiff(fileDiff);
    if (file) {
      files.push(file);
    }
  }

  return files;
}

function parseFileDiff(diffText: string): DiffFile | null {
  const lines = diffText.split('\n');

  // Parse file header
  const headerMatch = lines[0].match(/^diff --git a\/(.+) b\/(.+)$/);
  if (!headerMatch) return null;

  const oldPath = headerMatch[1];
  const newPath = headerMatch[2];

  // Determine action
  let action: DiffFile['action'] = 'modified';
  if (diffText.includes('new file mode')) {
    action = 'added';
  } else if (diffText.includes('deleted file mode')) {
    action = 'deleted';
  } else if (oldPath !== newPath) {
    action = 'renamed';
  }

  // Parse hunks
  const hunks: DiffHunk[] = [];
  let currentHunk: DiffHunk | null = null;
  let oldLineNum = 0;
  let newLineNum = 0;

  for (const line of lines) {
    // Hunk header
    const hunkMatch = line.match(/^@@\s*-(\d+)(?:,(\d+))?\s*\+(\d+)(?:,(\d+))?\s*@@(.*)$/);
    if (hunkMatch) {
      if (currentHunk) {
        hunks.push(currentHunk);
      }

      oldLineNum = parseInt(hunkMatch[1], 10);
      newLineNum = parseInt(hunkMatch[3], 10);

      currentHunk = {
        oldStart: oldLineNum,
        oldLines: parseInt(hunkMatch[2] || '1', 10),
        newStart: newLineNum,
        newLines: parseInt(hunkMatch[4] || '1', 10),
        header: line,
        lines: [],
      };
      continue;
    }

    if (!currentHunk) continue;

    // Parse diff lines
    if (line.startsWith('+') && !line.startsWith('+++')) {
      currentHunk.lines.push({
        type: 'addition',
        content: line.slice(1),
        newLineNumber: newLineNum++,
      });
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      currentHunk.lines.push({
        type: 'deletion',
        content: line.slice(1),
        oldLineNumber: oldLineNum++,
      });
    } else if (line.startsWith(' ')) {
      currentHunk.lines.push({
        type: 'context',
        content: line.slice(1),
        oldLineNumber: oldLineNum++,
        newLineNumber: newLineNum++,
      });
    }
  }

  if (currentHunk) {
    hunks.push(currentHunk);
  }

  // Count additions and deletions
  let additions = 0;
  let deletions = 0;
  for (const hunk of hunks) {
    for (const line of hunk.lines) {
      if (line.type === 'addition') additions++;
      if (line.type === 'deletion') deletions++;
    }
  }

  return {
    path: newPath,
    oldPath: action === 'renamed' ? oldPath : undefined,
    action,
    hunks,
    additions,
    deletions,
  };
}

/**
 * Get file extension from path
 */
export function getFileExtension(path: string): string {
  const match = path.match(/\.([^.]+)$/);
  return match ? match[1].toLowerCase() : '';
}

/**
 * Get language for syntax highlighting based on file extension
 */
export function getLanguage(path: string): string {
  const ext = getFileExtension(path);
  const languageMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    py: 'python',
    rb: 'ruby',
    go: 'go',
    rs: 'rust',
    java: 'java',
    c: 'c',
    cpp: 'cpp',
    h: 'c',
    hpp: 'cpp',
    css: 'css',
    scss: 'scss',
    html: 'html',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    md: 'markdown',
    sql: 'sql',
    sh: 'bash',
    bash: 'bash',
  };
  return languageMap[ext] || 'text';
}
