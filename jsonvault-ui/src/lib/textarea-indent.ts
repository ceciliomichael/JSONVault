import type { KeyboardEvent } from "react";

const DEFAULT_INDENT = "  ";

function setTextareaSelection(
  textarea: HTMLTextAreaElement,
  start: number,
  end: number,
) {
  requestAnimationFrame(() => {
    textarea.selectionStart = start;
    textarea.selectionEnd = end;
  });
}

function leadingIndentLength(line: string, indent: string) {
  if (line.startsWith(indent)) return indent.length;
  if (line.startsWith("\t")) return 1;
  const spaces = line.match(/^ +/)?.[0].length ?? 0;
  return Math.min(spaces, indent.length);
}

export function handleTextareaIndent(
  event: KeyboardEvent<HTMLTextAreaElement>,
  onValueChange: (value: string) => void,
  indent = DEFAULT_INDENT,
) {
  if (event.key !== "Tab") return;

  const textarea = event.currentTarget;
  if (textarea.readOnly || textarea.disabled) return;

  event.preventDefault();

  const { selectionStart, selectionEnd, value } = textarea;
  const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;

  if (selectionStart === selectionEnd && !event.shiftKey) {
    const nextValue =
      value.slice(0, selectionStart) + indent + value.slice(selectionEnd);
    const nextCursor = selectionStart + indent.length;
    onValueChange(nextValue);
    setTextareaSelection(textarea, nextCursor, nextCursor);
    return;
  }

  const lineEndIndex = value.indexOf("\n", selectionEnd);
  const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
  const selectedBlock = value.slice(lineStart, lineEnd);
  const selectedLines = selectedBlock.split("\n");

  if (event.shiftKey) {
    const removals = selectedLines.map((line) =>
      leadingIndentLength(line, indent),
    );
    const nextBlock = selectedLines
      .map((line, index) => line.slice(removals[index]))
      .join("\n");
    const removedTotal = removals.reduce((sum, count) => sum + count, 0);
    const firstLineOffset = selectionStart - lineStart;
    const removedBeforeStart = Math.min(removals[0] ?? 0, firstLineOffset);
    const nextStart = selectionStart - removedBeforeStart;
    const nextEnd = Math.max(nextStart, selectionEnd - removedTotal);

    onValueChange(value.slice(0, lineStart) + nextBlock + value.slice(lineEnd));
    setTextareaSelection(textarea, nextStart, nextEnd);
    return;
  }

  const nextBlock = selectedLines.map((line) => indent + line).join("\n");
  const insertedTotal = selectedLines.length * indent.length;
  const nextStart =
    selectionStart === lineStart
      ? selectionStart
      : selectionStart + indent.length;
  const nextEnd = selectionEnd + insertedTotal;

  onValueChange(value.slice(0, lineStart) + nextBlock + value.slice(lineEnd));
  setTextareaSelection(textarea, nextStart, nextEnd);
}
