import { basename, dirname, resolve } from "node:path";
import { emitKeypressEvents } from "node:readline";
import { stdin, stdout } from "node:process";
import { formatBytes } from "./scanner.js";
import { isRestorable } from "./summary.js";
import { theme } from "./theme.js";
import { installCommand } from "./install-command.js";
import type { Candidate } from "./types.js";

export interface SummaryGroup { label: string; total: string; folders: { name: string; bytes: number; candidate: Candidate }[] }
export interface ViewState { metric: number; screen: "summary" | "folders" | "info"; row: number; scroll: number; exited: boolean }
export const initialState = (): ViewState => ({ metric: 0, screen: "summary", row: 0, scroll: 0, exited: false });

export function summaryGroups(candidates: Candidate[], skipped: number): SummaryGroup[] {
  const group = (label: string, restorable: boolean): SummaryGroup => {
    const folders = candidates.filter((item) => isRestorable(item) === restorable)
      .map((item) => ({ name: basename(dirname(item.modulesPath)), bytes: item.bytes, candidate: item }));
    return { label, folders, total: formatBytes(folders.reduce((sum, item) => sum + item.bytes, 0)) };
  };
  return [group("Space to claim with lockfiles", true), group("Space to claim without lockfiles", false),
    { label: "Skipped folders due to read permissions", total: String(skipped), folders: [] }];
}

export function navigate(state: ViewState, key: string, groups: SummaryGroup[], maxScroll = 0): ViewState {
  if (key === "q" || key === "ctrl-c") return { ...state, exited: true };
  if (key === "escape") {
    if (state.screen === "info") return { ...state, screen: "folders", scroll: 0 };
    return state.screen === "folders" ? { ...state, screen: "summary", row: 0 } : { ...state, exited: true };
  }
  if (key === "return") {
    if (state.screen === "summary") return { ...state, screen: "folders" };
    if (state.screen === "folders" && groups[state.metric].folders.length) return { ...state, screen: "info", scroll: 0 };
    return state;
  }
  const delta = key === "up" ? -1 : key === "down" ? 1 : 0;
  if (state.screen === "info") return { ...state, scroll: Math.max(0, Math.min(maxScroll, state.scroll + delta)) };
  const field = state.screen === "folders" ? "row" : "metric";
  const count = state.screen === "folders" ? groups[state.metric].folders.length : groups.length;
  return { ...state, [field]: Math.max(0, Math.min(Math.max(0, count - 1), state[field] + delta)) };
}

export async function folderInfo(candidate: Candidate): Promise<string[]> {
  const lines = [
    `Parent directory: ${basename(dirname(candidate.modulesPath))}`,
    `Full path: ${resolve(candidate.modulesPath)}`,
    `Project path: ${candidate.projectPath ? resolve(candidate.projectPath) : "N/A"}`,
    `Size: ${formatBytes(candidate.bytes)}`,
    `Package manager: ${candidate.manager || "N/A"}`,
    `Lockfile: ${candidate.lockfilePath ? resolve(candidate.lockfilePath) : "N/A"}`
  ];
  if (!isRestorable(candidate)) return [...lines, "Restore command: N/A", "No supported lockfile; LPM cannot restore this folder."];
  lines.push(`Working directory: ${resolve(candidate.projectPath)}`);
  try {
    const command = await installCommand(candidate);
    lines.push(`Restore command: ${command.executable} ${command.args.join(" ")}`);
  } catch (error) {
    lines.push(`Restore command: unavailable — ${error instanceof Error ? error.message : String(error)}`);
  }
  return lines;
}

export function wrapInfo(lines: string[], columns: number): string[] {
  const width = Math.max(1, columns - 1);
  return lines.flatMap((line) => {
    const chars = Array.from(line.replace(/[\x00-\x1f\x7f-\x9f]/g, "?"));
    const wrapped: string[] = [];
    for (let i = 0; i < chars.length; i += width) wrapped.push(chars.slice(i, i + width).join(""));
    return wrapped.length ? wrapped : [""];
  });
}

// Keep filesystem names from injecting terminal controls; Unicode is retained.
function fit(value: string, width: number): string {
  const chars = Array.from(value.replace(/[\x00-\x1f\x7f-\x9f]/g, "?"));
  return chars.length > width ? chars.slice(0, Math.max(0, width - 1)).join("") + "…" : chars.join("");
}

export function renderSummary(state: ViewState, groups: SummaryGroup[], columns: number, rows: number, info: string[] = ["Loading…"]): string {
  const width = Math.max(1, columns - 1);
  if (rows < 7 || columns < 24) return theme.text(fit("Resize terminal · q exits", width));
  const group = groups[state.metric];
  if (state.screen === "info") {
    const wrapped = wrapInfo(info, columns);
    const capacity = Math.max(1, rows - 4);
    const start = Math.min(state.scroll, Math.max(0, wrapped.length - capacity));
    return [theme.heading("Folder information"), theme.dim("─".repeat(width)),
      ...wrapped.slice(start, start + capacity).map(theme.text),
      theme.dim(fit(`${start + 1}–${Math.min(start + capacity, wrapped.length)} / ${wrapped.length}`, width)),
      theme.dim(fit("↑/↓ scroll · Esc back · q quit", width))].join("\r\n");
  }
  const lines = [theme.heading(fit(state.screen === "folders" ? group.label : "LPM · Scan summary", width))];
  const tableRow = (name: string, size: string, selected: boolean): string => {
    const nameWidth = Math.max(1, width - size.length - 4);
    const short = fit(name, nameWidth);
    const text = `${selected ? ">" : " "} ${short}${" ".repeat(Math.max(0, nameWidth - Array.from(short).length))}  ${size}`;
    return (selected ? theme.selected : theme.text)(fit(text, width));
  };
  lines.push(theme.dim("─".repeat(width)));
  if (state.screen === "summary") {
    groups.forEach((item, index) => lines.push(tableRow(item.label, item.total, index === state.metric)));
  } else if (state.metric === 2) {
    lines.push(theme.text("N/A"));
  } else {
    lines.push(theme.dim(fit("  Parent directory · Reclaimable space", width)));
    const capacity = Math.max(1, rows - 7);
    const start = Math.max(0, state.row - capacity + 1);
    const visible = group.folders.slice(start, start + capacity);
    if (!visible.length) lines.push(theme.text("No folders found."));
    visible.forEach((item, index) => lines.push(tableRow(item.name, formatBytes(item.bytes), start + index === state.row)));
    lines.push(theme.heading(fit(`Total: ${group.total} · ${group.folders.length} folder(s)`, width)));
    if (group.folders.length) lines.push(theme.dim(fit(`${state.row + 1} / ${group.folders.length}`, width)));
  }
  lines.push(theme.dim(fit(state.screen === "folders" ? "↑/↓ browse · Enter info · Esc back · q quit" : "↑/↓ select · Enter open · q quit", width)));
  return lines.join("\r\n");
}

export async function browseSummary(candidates: Candidate[], skipped: number): Promise<void> {
  const groups = summaryGroups(candidates, skipped);
  let state = initialState();
  let info = ["Loading…"];
  let request = 0;
  let active = true;
  const wasRaw = Boolean(stdin.isRaw);
  const wasFlowing = stdin.readableFlowing === true;
  const maxScroll = () => Math.max(0, wrapInfo(info, stdout.columns || 80).length - Math.max(1, (stdout.rows || 24) - 4));
  const draw = () => {
    state.scroll = Math.min(state.scroll, maxScroll());
    stdout.write(`\x1b[H\x1b[2J${renderSummary(state, groups, stdout.columns || 80, stdout.rows || 24, info)}`);
  };
  let cleanup = () => {};
  try {
    await new Promise<void>((resolve, reject) => {
      const finish = () => resolve();
      const fail = (error: Error) => reject(error);
      const keypress = (_: string, key: { name?: string; ctrl?: boolean } = {}) => {
        try {
          const previous = state.screen;
          state = navigate(state, key.ctrl && key.name === "c" ? "ctrl-c" : key.name || "", groups, maxScroll());
          if (state.screen === "info" && previous !== "info") {
            info = ["Loading…"];
            const current = ++request;
            void folderInfo(groups[state.metric].folders[state.row].candidate).then((result) => {
              if (!active || state.exited || state.screen !== "info" || current !== request) return;
              info = result;
              draw();
            }).catch(reject);
          }
          if (state.exited) finish(); else draw();
        } catch (error) { reject(error); }
      };
      const resize = () => { try { draw(); } catch (error) { reject(error); } };
      cleanup = () => {
        stdin.off("keypress", keypress); stdin.off("end", finish); stdin.off("error", fail);
        stdout.off("resize", resize); stdout.off("error", fail);
        process.off("SIGTERM", finish); process.off("SIGINT", finish);
      };
      emitKeypressEvents(stdin);
      stdin.on("keypress", keypress); stdin.on("end", finish); stdin.on("error", fail);
      stdout.on("resize", resize); stdout.on("error", fail);
      process.once("SIGTERM", finish); process.once("SIGINT", finish);
      stdin.setRawMode(true);
      stdin.resume();
      stdout.write("\x1b[?1049h\x1b[?25l");
      draw();
    });
  } finally {
    active = false;
    cleanup();
    stdin.setRawMode(wasRaw);
    if (!wasFlowing) stdin.pause();
    stdout.write("\x1b[0m\x1b[?25h\x1b[?1049l");
  }
}
