/**
 * Markdown to Google Docs API Converter
 *
 * Converts markdown text to Google Docs API batchUpdate requests
 * with proper formatting (headings, bold, italic, lists, links).
 */

interface InsertTextRequest {
  insertText: {
    location: { index: number };
    text: string;
  };
}

interface UpdateTextStyleRequest {
  updateTextStyle: {
    range: { startIndex: number; endIndex: number };
    textStyle: {
      bold?: boolean;
      italic?: boolean;
      link?: { url: string };
      weightedFontFamily?: { fontFamily: string };
    };
    fields: string;
  };
}

interface UpdateParagraphStyleRequest {
  updateParagraphStyle: {
    range: { startIndex: number; endIndex: number };
    paragraphStyle: {
      namedStyleType?: string;
    };
    fields: string;
  };
}

interface CreateParagraphBulletsRequest {
  createParagraphBullets: {
    range: { startIndex: number; endIndex: number };
    bulletPreset: string;
  };
}

type DocsRequest =
  | InsertTextRequest
  | UpdateTextStyleRequest
  | UpdateParagraphStyleRequest
  | CreateParagraphBulletsRequest;

interface TextRange {
  start: number;
  end: number;
}

interface FormatInfo {
  bold: TextRange[];
  italic: TextRange[];
  code: TextRange[];
  links: Array<TextRange & { url: string }>;
}

interface ParagraphInfo {
  start: number;
  end: number;
  type: 'heading1' | 'heading2' | 'heading3' | 'heading4' | 'bullet' | 'numbered' | 'normal';
}

/**
 * Parse markdown and generate Google Docs API requests
 * @param markdown The markdown text to convert
 * @param startIndex The starting index in the document (usually 1 for new docs)
 * @returns Array of Google Docs API requests
 */
export function markdownToDocsRequests(markdown: string, startIndex: number = 1): DocsRequest[] {
  const { plainText, formatting, paragraphs } = parseMarkdown(markdown);

  if (!plainText) {
    return [];
  }

  const requests: DocsRequest[] = [];

  requests.push({
    insertText: {
      location: { index: startIndex },
      text: plainText,
    },
  });

  for (const para of paragraphs) {
    if (para.type === 'normal') continue;

    const paraStart = startIndex + para.start;
    const paraEnd = startIndex + para.end;

    if (para.type === 'bullet') {
      requests.push({
        createParagraphBullets: {
          range: { startIndex: paraStart, endIndex: paraEnd },
          bulletPreset: 'BULLET_DISC_CIRCLE_SQUARE',
        },
      });
    } else if (para.type === 'numbered') {
      requests.push({
        createParagraphBullets: {
          range: { startIndex: paraStart, endIndex: paraEnd },
          bulletPreset: 'NUMBERED_DECIMAL_ALPHA_ROMAN',
        },
      });
    } else {
      const styleMap: Record<string, string> = {
        heading1: 'HEADING_1',
        heading2: 'HEADING_2',
        heading3: 'HEADING_3',
        heading4: 'HEADING_4',
      };
      const namedStyleType = styleMap[para.type];
      if (namedStyleType) {
        requests.push({
          updateParagraphStyle: {
            range: { startIndex: paraStart, endIndex: paraEnd },
            paragraphStyle: { namedStyleType },
            fields: 'namedStyleType',
          },
        });
      }
    }
  }

  for (const range of formatting.bold) {
    requests.push({
      updateTextStyle: {
        range: {
          startIndex: startIndex + range.start,
          endIndex: startIndex + range.end,
        },
        textStyle: { bold: true },
        fields: 'bold',
      },
    });
  }

  for (const range of formatting.italic) {
    requests.push({
      updateTextStyle: {
        range: {
          startIndex: startIndex + range.start,
          endIndex: startIndex + range.end,
        },
        textStyle: { italic: true },
        fields: 'italic',
      },
    });
  }

  for (const range of formatting.code) {
    requests.push({
      updateTextStyle: {
        range: {
          startIndex: startIndex + range.start,
          endIndex: startIndex + range.end,
        },
        textStyle: {
          weightedFontFamily: { fontFamily: 'Roboto Mono' },
        },
        fields: 'weightedFontFamily',
      },
    });
  }

  for (const link of formatting.links) {
    requests.push({
      updateTextStyle: {
        range: {
          startIndex: startIndex + link.start,
          endIndex: startIndex + link.end,
        },
        textStyle: {
          link: { url: link.url },
        },
        fields: 'link',
      },
    });
  }

  return requests;
}

/**
 * Parse markdown into plain text with formatting info
 */
function parseMarkdown(markdown: string): {
  plainText: string;
  formatting: FormatInfo;
  paragraphs: ParagraphInfo[];
} {
  const formatting: FormatInfo = {
    bold: [],
    italic: [],
    code: [],
    links: [],
  };
  const paragraphs: ParagraphInfo[] = [];
  const lines = markdown.split('\n');
  let plainText = '';
  let currentIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    const lineStart = currentIndex;
    let paragraphType: ParagraphInfo['type'] = 'normal';

    const headingMatch = line.match(/^(#{1,4})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      line = headingMatch[2];
      paragraphType = `heading${level}` as ParagraphInfo['type'];
    }

    const bulletMatch = line.match(/^[-*]\s+(.*)$/);
    if (bulletMatch) {
      line = bulletMatch[1];
      paragraphType = 'bullet';
    }

    const numberedMatch = line.match(/^\d+\.\s+(.*)$/);
    if (numberedMatch) {
      line = numberedMatch[1];
      paragraphType = 'numbered';
    }

    const { text: processedLine, formatRanges } = processInlineFormatting(line, currentIndex);

    formatting.bold.push(...formatRanges.bold);
    formatting.italic.push(...formatRanges.italic);
    formatting.code.push(...formatRanges.code);
    formatting.links.push(...formatRanges.links);

    plainText += processedLine;
    currentIndex += processedLine.length;

    if (i < lines.length - 1) {
      plainText += '\n';
      currentIndex += 1;
    }

    if (processedLine.trim() || paragraphType !== 'normal') {
      paragraphs.push({
        start: lineStart,
        end: currentIndex,
        type: paragraphType,
      });
    }
  }

  return { plainText, formatting, paragraphs };
}

/**
 * Process inline formatting (bold, italic, code, links)
 */
function processInlineFormatting(
  text: string,
  baseIndex: number
): {
  text: string;
  formatRanges: FormatInfo;
} {
  const formatRanges: FormatInfo = {
    bold: [],
    italic: [],
    code: [],
    links: [],
  };

  let result = '';
  let i = 0;
  let outputIndex = baseIndex;

  while (i < text.length) {
    const linkMatch = text.slice(i).match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (linkMatch) {
      const linkText = linkMatch[1];
      const url = linkMatch[2];
      const start = outputIndex;
      result += linkText;
      outputIndex += linkText.length;
      formatRanges.links.push({ start, end: outputIndex, url });
      i += linkMatch[0].length;
      continue;
    }

    const codeMatch = text.slice(i).match(/^`([^`]+)`/);
    if (codeMatch) {
      const codeText = codeMatch[1];
      const start = outputIndex;
      result += codeText;
      outputIndex += codeText.length;
      formatRanges.code.push({ start, end: outputIndex });
      i += codeMatch[0].length;
      continue;
    }

    const boldItalicMatch = text.slice(i).match(/^(\*\*\*|___)([^*_]+)\1/);
    if (boldItalicMatch) {
      const content = boldItalicMatch[2];
      const start = outputIndex;
      result += content;
      outputIndex += content.length;
      formatRanges.bold.push({ start, end: outputIndex });
      formatRanges.italic.push({ start, end: outputIndex });
      i += boldItalicMatch[0].length;
      continue;
    }

    const boldMatch = text.slice(i).match(/^(\*\*|__)([^*_]+)\1/);
    if (boldMatch) {
      const content = boldMatch[2];
      const start = outputIndex;
      result += content;
      outputIndex += content.length;
      formatRanges.bold.push({ start, end: outputIndex });
      i += boldMatch[0].length;
      continue;
    }

    const italicMatch = text.slice(i).match(/^(\*|_)([^*_]+)\1/);
    if (italicMatch) {
      const content = italicMatch[2];
      const start = outputIndex;
      result += content;
      outputIndex += content.length;
      formatRanges.italic.push({ start, end: outputIndex });
      i += italicMatch[0].length;
      continue;
    }

    result += text[i];
    outputIndex += 1;
    i += 1;
  }

  return { text: result, formatRanges };
}

/**
 * Extract plain text from markdown (for preview/display)
 */
export function markdownToPlainText(markdown: string): string {
  const { plainText } = parseMarkdown(markdown);
  return plainText;
}
