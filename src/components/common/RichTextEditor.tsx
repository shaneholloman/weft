/**
 * RichTextEditor - contenteditable editor with inline pill rendering
 *
 * Renders pill markdown as visual LinkPill components.
 * Handles paste events for URL detection.
 * Converts back to markdown format on change.
 */

import {
  useRef,
  useEffect,
  useCallback,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from 'react';
import type { LinkPillType } from '../../types';
import { createPortal } from 'react-dom';
import { McpIcon } from './McpIcon';
import './RichTextEditor.css';

// Regex to match [pill:type:title](url) syntax
const PILL_REGEX = /\[pill:([^:]+):([^\]]+)\]\(([^)]+)\)/g;

export interface PendingUrl {
  url: string;
  metadata: {
    type: LinkPillType;
    title: string;
  };
}

export interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  onPaste?: (e: ClipboardEvent<HTMLDivElement>) => void;
  /** Called after paste with the URL end position in the markdown */
  onPasteUrlPosition?: (endIndex: number) => void;
  placeholder?: string;
  rows?: number;
  label?: string;
  /** Pending URL for pill conversion tooltip */
  pendingUrl?: PendingUrl | null;
  isCheckingUrl?: boolean;
  onAcceptPill?: () => void;
  onDismissPill?: () => void;
}

interface PillData {
  type: LinkPillType;
  title: string;
  url: string;
}

/**
 * Parse markdown to extract pills and text segments
 */
function parseMarkdown(markdown: string): Array<{ type: 'text' | 'pill'; content: string; pill?: PillData }> {
  const segments: Array<{ type: 'text' | 'pill'; content: string; pill?: PillData }> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  PILL_REGEX.lastIndex = 0;

  while ((match = PILL_REGEX.exec(markdown)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        type: 'text',
        content: markdown.slice(lastIndex, match.index),
      });
    }

    const [fullMatch, pillType, title, url] = match;
    segments.push({
      type: 'pill',
      content: fullMatch,
      pill: { type: pillType as LinkPillType, title, url },
    });

    lastIndex = match.index + fullMatch.length;
  }

  if (lastIndex < markdown.length) {
    segments.push({
      type: 'text',
      content: markdown.slice(lastIndex),
    });
  }

  return segments;
}

/**
 * Convert HTML content back to markdown
 */
function htmlToMarkdown(element: HTMLElement): string {
  let result = '';
  const ZWS = '\u200B';

  const walker = document.createTreeWalker(element, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);

  let node: Node | null = walker.currentNode;
  while (node) {
    if (node.nodeType === Node.TEXT_NODE) {
      // Strip zero-width spaces (used for cursor positioning)
      const text = (node.textContent || '').replace(new RegExp(ZWS, 'g'), '');
      result += text;
    } else if (node instanceof HTMLElement) {
      if (node.classList.contains('rte-pill')) {
        const type = node.dataset.pillType || 'google_doc';
        const title = node.dataset.pillTitle || '';
        const url = node.dataset.pillUrl || '';
        result += `[pill:${type}:${title}](${url})`;
        // Skip children of pill elements
        const nextSibling = walker.nextSibling();
        if (nextSibling) {
          node = nextSibling;
          continue;
        }
        break;
      } else if (node.tagName === 'BR') {
        result += '\n';
      } else if (node.tagName === 'DIV' && node !== element && node.previousSibling) {
        // Divs after the first act as line breaks in contenteditable
        result += '\n';
      }
    }
    node = walker.nextNode();
  }

  return result;
}

/**
 * Get icon type for pill type
 */
function getIconType(type: LinkPillType): 'google-docs' | 'google-sheets' | 'github' {
  switch (type) {
    case 'google_doc':
      return 'google-docs';
    case 'google_sheet':
      return 'google-sheets';
    case 'github_pr':
    case 'github_issue':
    case 'github_repo':
      return 'github';
  }
}

export function RichTextEditor({
  value,
  onChange,
  onPaste,
  onPasteUrlPosition,
  placeholder = '',
  rows = 4,
  label,
  pendingUrl,
  isCheckingUrl,
  onAcceptPill,
  onDismissPill,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState<{ top: number; left: number } | null>(null);
  const isUpdatingRef = useRef(false);

  // Render markdown as HTML with pill elements
  const renderContent = useCallback(() => {
    if (!editorRef.current || isUpdatingRef.current) return;

    const segments = parseMarkdown(value);
    const fragment = document.createDocumentFragment();
    const ZWS = '\u200B'; // Zero-width space for cursor positioning

    let lastNodeType: 'text' | 'br' | 'pill' | 'none' = 'none';

    segments.forEach((segment) => {
      if (segment.type === 'text') {
        // Split by newlines and add <br> elements
        const lines = segment.content.split('\n');
        lines.forEach((line, i) => {
          if (i > 0) {
            fragment.appendChild(document.createElement('br'));
            lastNodeType = 'br';
          }
          if (line) {
            fragment.appendChild(document.createTextNode(line));
            lastNodeType = 'text';
          }
        });
      } else if (segment.pill) {
        // Add ZWS before pill if it follows a BR or is first element (cursor can't render there otherwise)
        if (lastNodeType === 'br' || lastNodeType === 'none') {
          fragment.appendChild(document.createTextNode(ZWS));
        }

        // Create pill as a link element
        const pillLink = document.createElement('a');
        pillLink.className = 'rte-pill';
        pillLink.contentEditable = 'false';
        pillLink.href = segment.pill.url;
        pillLink.target = '_blank';
        pillLink.rel = 'noopener noreferrer';
        pillLink.dataset.pillType = segment.pill.type;
        pillLink.dataset.pillTitle = segment.pill.title;
        pillLink.dataset.pillUrl = segment.pill.url;

        // Build pill content using DOM APIs (safe from XSS)
        const iconSpan = document.createElement('span');
        iconSpan.className = 'rte-pill-icon';
        iconSpan.dataset.type = segment.pill.type;

        const titleSpan = document.createElement('span');
        titleSpan.className = 'rte-pill-title';
        titleSpan.textContent = segment.pill.title; // textContent escapes HTML

        pillLink.appendChild(iconSpan);
        pillLink.appendChild(titleSpan);
        fragment.appendChild(pillLink);
        lastNodeType = 'pill';
      }
    });

    // Save selection
    const selection = window.getSelection();
    const savedRange = selection?.rangeCount ? selection.getRangeAt(0) : null;
    const wasAtEnd = savedRange && editorRef.current.contains(savedRange.endContainer) &&
      savedRange.endOffset === (savedRange.endContainer.textContent?.length || 0);

    editorRef.current.innerHTML = '';
    editorRef.current.appendChild(fragment);

    // Restore cursor to end if it was there
    if (isFocused && wasAtEnd && editorRef.current.lastChild) {
      const range = document.createRange();
      range.selectNodeContents(editorRef.current);
      range.collapse(false);
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  }, [value, isFocused]);

  // Initial render and value changes
  useEffect(() => {
    renderContent();
  }, [renderContent]);

  // Handle input changes
  const handleInput = useCallback(() => {
    if (!editorRef.current) return;
    isUpdatingRef.current = true;
    const markdown = htmlToMarkdown(editorRef.current);
    onChange(markdown);
    // Allow React to process the change before allowing re-render
    requestAnimationFrame(() => {
      isUpdatingRef.current = false;
    });
  }, [onChange]);

  // Handle paste
  const handlePaste = useCallback(
    (e: ClipboardEvent<HTMLDivElement>) => {
      const pastedText = e.clipboardData?.getData('text') || '';

      // Let parent handle URL detection
      onPaste?.(e);

      // Calculate tooltip position after paste completes (cursor will be at end of pasted content)
      requestAnimationFrame(() => {
        const selection = window.getSelection();
        if (selection?.rangeCount) {
          const range = selection.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          setTooltipPosition({
            top: rect.bottom + 4,
            left: rect.left,
          });

          // Calculate the URL's end position in markdown
          if (editorRef.current && onPasteUrlPosition && pastedText) {
            const markdown = htmlToMarkdown(editorRef.current);
            // Find plain text URL (not inside pill syntax)
            // URLs inside pills are formatted as ](url) - we want URLs NOT preceded by ](
            let searchStart = 0;
            let foundIndex = -1;
            while (true) {
              const idx = markdown.indexOf(pastedText, searchStart);
              if (idx === -1) break;
              // Check if this is inside a pill (preceded by '](' )
              const prefix = markdown.slice(Math.max(0, idx - 2), idx);
              if (!prefix.endsWith('](')) {
                foundIndex = idx; // Found a plain URL, keep searching for later ones
              }
              searchStart = idx + 1;
            }
            if (foundIndex !== -1) {
              onPasteUrlPosition(foundIndex + pastedText.length);
            }
          }
        }
      });
    },
    [onPaste, onPasteUrlPosition]
  );

  // Handle keyboard
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      // Tab to accept pill
      if (e.key === 'Tab' && pendingUrl && onAcceptPill) {
        e.preventDefault();
        onAcceptPill();
        return;
      }
      // Escape to dismiss
      if (e.key === 'Escape' && pendingUrl && onDismissPill) {
        e.preventDefault();
        onDismissPill();
        return;
      }
      // Arrow keys or other navigation dismisses the prompt
      if (pendingUrl && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) {
        onDismissPill?.();
      }

      // Get the node immediately before/after the cursor in DOM order
      const getAdjacentNode = (direction: 'before' | 'after'): Node | null => {
        const selection = window.getSelection();
        if (!selection?.rangeCount) return null;
        const range = selection.getRangeAt(0);
        if (!range.collapsed) return null;

        const node = range.startContainer;
        const offset = range.startOffset;

        if (direction === 'before') {
          if (node.nodeType === Node.TEXT_NODE) {
            // If at start of text node, get previous sibling
            if (offset === 0) {
              return node.previousSibling;
            }
            // Otherwise we're in the middle of text, no adjacent element
            return null;
          }
          // If in element node, get child at offset-1
          if (offset > 0) {
            return node.childNodes[offset - 1];
          }
          return null;
        } else {
          if (node.nodeType === Node.TEXT_NODE) {
            // If at end of text node, get next sibling
            if (offset === node.textContent?.length) {
              return node.nextSibling;
            }
            return null;
          }
          // If in element node, get child at offset
          return node.childNodes[offset] || null;
        }
      };

      const isPill = (node: Node | null): node is HTMLElement => {
        return node instanceof HTMLElement && node.classList.contains('rte-pill');
      };

      const ZWS = '\u200B';
      const isZwsOnly = (node: Node | null): boolean => {
        return node?.nodeType === Node.TEXT_NODE && node.textContent === ZWS;
      };

      // Handle ArrowLeft - skip ZWS-only nodes and position before pills
      if (e.key === 'ArrowLeft' && editorRef.current) {
        const selection = window.getSelection();
        if (!selection?.rangeCount) return;
        const range = selection.getRangeAt(0);
        if (!range.collapsed) return;

        const node = range.startContainer;
        const offset = range.startOffset;

        // If we're in a ZWS-only text node, go to end of previous line
        if (isZwsOnly(node) && (offset === 0 || offset === 1)) {
          e.preventDefault();
          const prev = node.previousSibling;
          const newRange = document.createRange();

          if (prev && prev.nodeName === 'BR') {
            const beforeBr = prev.previousSibling;
            if (beforeBr) {
              if (beforeBr.nodeType === Node.TEXT_NODE) {
                newRange.setStart(beforeBr, beforeBr.textContent?.length || 0);
              } else if (beforeBr.nodeName === 'BR') {
                newRange.setStartAfter(beforeBr);
              } else {
                newRange.setStartAfter(beforeBr);
              }
            } else {
              newRange.setStart(node.parentNode!, 0);
            }
          } else if (prev) {
            if (prev.nodeType === Node.TEXT_NODE) {
              newRange.setStart(prev, prev.textContent?.length || 0);
            } else {
              newRange.setStartAfter(prev);
            }
          } else {
            newRange.setStart(node.parentNode!, 0);
          }
          newRange.collapse(true);
          selection.removeAllRanges();
          selection.addRange(newRange);
          return;
        }

        const prevNode = getAdjacentNode('before');

        // If prev is pill, check if there's a ZWS before it we should land in
        if (isPill(prevNode)) {
          e.preventDefault();
          const newRange = document.createRange();
          const beforePill = prevNode.previousSibling;
          if (beforePill && isZwsOnly(beforePill)) {
            newRange.setStart(beforePill, 1);
          } else {
            newRange.setStartBefore(prevNode);
          }
          newRange.collapse(true);
          selection.removeAllRanges();
          selection.addRange(newRange);
          return;
        }

        // If prev is ZWS, skip over it entirely
        if (prevNode && isZwsOnly(prevNode)) {
          e.preventDefault();
          const beforeZws = prevNode.previousSibling;
          const newRange = document.createRange();
          if (beforeZws) {
            if (beforeZws.nodeType === Node.TEXT_NODE) {
              newRange.setStart(beforeZws, beforeZws.textContent?.length || 0);
            } else {
              newRange.setStartAfter(beforeZws);
            }
          } else {
            newRange.setStart(node, 0);
          }
          newRange.collapse(true);
          selection.removeAllRanges();
          selection.addRange(newRange);
          return;
        }
      }

      // Handle ArrowRight - skip ZWS-only nodes and position after pills
      if (e.key === 'ArrowRight' && editorRef.current) {
        const selection = window.getSelection();
        if (!selection?.rangeCount) return;
        const range = selection.getRangeAt(0);
        if (!range.collapsed) return;

        const node = range.startContainer;
        const offset = range.startOffset;

        // If we're in a ZWS-only text node at the end, skip to after it
        if (isZwsOnly(node) && offset === 1) {
          e.preventDefault();
          const next = node.nextSibling;
          if (next) {
            const newRange = document.createRange();
            if (next.nodeType === Node.TEXT_NODE) {
              newRange.setStart(next, 0);
            } else if (isPill(next)) {
              newRange.setStartAfter(next);
            } else {
              newRange.setStartBefore(next);
            }
            newRange.collapse(true);
            selection.removeAllRanges();
            selection.addRange(newRange);
          }
          return;
        }

        // If we're at the start of ZWS (offset 0), skip entire ZWS and pill
        if (isZwsOnly(node) && offset === 0) {
          e.preventDefault();
          const next = node.nextSibling;
          const newRange = document.createRange();
          if (isPill(next)) {
            newRange.setStartAfter(next);
          } else if (next) {
            newRange.setStartBefore(next);
          } else {
            newRange.setStartAfter(node);
          }
          newRange.collapse(true);
          selection.removeAllRanges();
          selection.addRange(newRange);
          return;
        }

        const nextNode = getAdjacentNode('after');

        // If next is ZWS, skip it and go to after the pill (or wherever)
        if (nextNode && isZwsOnly(nextNode)) {
          e.preventDefault();
          const afterZws = nextNode.nextSibling;
          const newRange = document.createRange();
          if (isPill(afterZws)) {
            newRange.setStartAfter(afterZws);
          } else if (afterZws) {
            newRange.setStartBefore(afterZws);
          } else {
            newRange.setStartAfter(nextNode);
          }
          newRange.collapse(true);
          selection.removeAllRanges();
          selection.addRange(newRange);
          return;
        }

        if (isPill(nextNode)) {
          e.preventDefault();
          const newRange = document.createRange();
          newRange.setStartAfter(nextNode);
          newRange.collapse(true);
          selection.removeAllRanges();
          selection.addRange(newRange);
          return;
        }
      }

      // Handle Backspace to delete pills (especially at line start)
      if (e.key === 'Backspace' && editorRef.current) {
        const selection = window.getSelection();
        if (!selection?.rangeCount) return;

        const range = selection.getRangeAt(0);
        if (!range.collapsed) return; // Let browser handle selection deletion

        const node = range.startContainer;
        const offset = range.startOffset;

        // Check if cursor is at start of a text node that follows a pill
        if (node.nodeType === Node.TEXT_NODE && offset === 0) {
          const prev = node.previousSibling;
          if (prev instanceof HTMLElement && prev.classList.contains('rte-pill')) {
            e.preventDefault();
            prev.remove();
            handleInput();
            return;
          }
        }

        // Check if cursor is in editor directly and previous sibling is a pill
        if (node === editorRef.current && offset > 0) {
          const children = Array.from(editorRef.current.childNodes);
          const prevChild = children[offset - 1];
          if (prevChild instanceof HTMLElement && prevChild.classList.contains('rte-pill')) {
            e.preventDefault();
            prevChild.remove();
            handleInput();
            return;
          }
        }

        // Check if at start of editor with pill as first child
        if (node === editorRef.current && offset === 0) {
          // Nothing before cursor
          return;
        }

        // Handle case where cursor is right after a pill (pill is previous sibling of parent)
        if (node.nodeType === Node.TEXT_NODE && offset === 0 && node.parentNode) {
          const parent = node.parentNode;
          if (parent !== editorRef.current) {
            const prev = parent.previousSibling;
            if (prev instanceof HTMLElement && prev.classList.contains('rte-pill')) {
              e.preventDefault();
              prev.remove();
              handleInput();
              return;
            }
          }
        }
      }

      // Handle Delete key for pills
      if (e.key === 'Delete' && editorRef.current) {
        const selection = window.getSelection();
        if (!selection?.rangeCount) return;

        const range = selection.getRangeAt(0);
        if (!range.collapsed) return;

        const node = range.startContainer;
        const offset = range.startOffset;

        // Check if cursor is at end of text node before a pill
        if (node.nodeType === Node.TEXT_NODE && offset === node.textContent?.length) {
          const next = node.nextSibling;
          if (next instanceof HTMLElement && next.classList.contains('rte-pill')) {
            e.preventDefault();
            next.remove();
            handleInput();
            return;
          }
        }

        // Check if cursor is in editor directly and next sibling is a pill
        if (node === editorRef.current) {
          const children = Array.from(editorRef.current.childNodes);
          const nextChild = children[offset];
          if (nextChild instanceof HTMLElement && nextChild.classList.contains('rte-pill')) {
            e.preventDefault();
            nextChild.remove();
            handleInput();
            return;
          }
        }
      }
    },
    [pendingUrl, onAcceptPill, onDismissPill, handleInput]
  );

  // Handle focus
  const handleFocus = useCallback(() => {
    setIsFocused(true);
  }, []);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
  }, []);

  // Update tooltip position when pending URL changes
  useEffect(() => {
    if (!pendingUrl && !isCheckingUrl) {
      setTooltipPosition(null);
    }
  }, [pendingUrl, isCheckingUrl]);

  // Click outside to dismiss tooltip
  useEffect(() => {
    if (!pendingUrl && !isCheckingUrl) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Don't dismiss if clicking on the tooltip itself
      if (target.closest('.rte-tooltip')) return;
      // Dismiss on any other click
      onDismissPill?.();
    };

    // Use capture phase to catch clicks before they're handled
    document.addEventListener('mousedown', handleClickOutside, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
    };
  }, [pendingUrl, isCheckingUrl, onDismissPill]);

  const showTooltip = (pendingUrl || isCheckingUrl) && tooltipPosition;
  const isEmpty = !value;

  return (
    <div className="rte-container">
      {label && <label className="rte-label">{label}</label>}
      <div className="rte-wrapper">
        <div
          ref={editorRef}
          className={`rte-editor ${isEmpty ? 'rte-empty' : ''}`}
          contentEditable
          onInput={handleInput}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onBlur={handleBlur}
          data-placeholder={placeholder}
          style={{ minHeight: `${rows * 1.5}em` }}
          role="textbox"
          aria-multiline="true"
          aria-label={label}
        />

        {/* Floating tooltip for pill conversion */}
        {showTooltip &&
          createPortal(
            <div
              className="rte-tooltip"
              style={{
                position: 'fixed',
                top: tooltipPosition.top,
                left: tooltipPosition.left,
              }}
            >
              {isCheckingUrl ? (
                <span className="rte-tooltip-loading">Checking link...</span>
              ) : pendingUrl ? (
                <>
                  <span className="rte-tooltip-key">tab</span>
                  <span className="rte-tooltip-text">to replace with</span>
                  <button
                    type="button"
                    className="rte-tooltip-pill"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAcceptPill?.();
                    }}
                  >
                    <McpIcon type={getIconType(pendingUrl.metadata.type)} size={14} />
                    <span className="rte-tooltip-title">{pendingUrl.metadata.title}</span>
                  </button>
                </>
              ) : null}
            </div>,
            document.body
          )}
      </div>
    </div>
  );
}
