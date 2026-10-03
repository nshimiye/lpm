import assert from "node:assert/strict";
import test from "node:test";
import { folderInfo, initialState, navigate, renderSummary, summaryGroups, wrapInfo } from "../src/summary-view.js";
import { createTheme } from "../src/theme.js";
import type { Candidate } from "../src/types.js";

const candidates: Candidate[] = [
  { modulesPath: "/a/project/node_modules", projectPath: "/a/project", lockfilePath: "/a/project/package-lock.json", manager: "npm", bytes: 2048 },
  { modulesPath: "/b/project/node_modules", projectPath: "/b/project", lockfilePath: "/b/project/package-lock.json", manager: "npm", bytes: 1024 },
  { modulesPath: "/unsafe/node_modules", projectPath: null, lockfilePath: null, manager: null, bytes: 512 }
];

test("groups show parent basenames, preserve duplicates and sum sizes", () => {
  const groups = summaryGroups(candidates, 4);
  assert.deepEqual(groups[0].folders.map((row) => row.name), ["project", "project"]);
  assert.equal(groups[0].total, "3.00 KiB");
  assert.equal(groups[1].folders[0].name, "unsafe");
  assert.equal(groups[1].total, "512 B");
  assert.equal(groups[2].total, "4");
});

test("navigation bounds, drill-down, return and exits", () => {
  const groups = summaryGroups(candidates, 4);
  let state = navigate(initialState(), "up", groups);
  assert.equal(state.metric, 0);
  state = navigate(state, "return", groups);
  for (let i = 0; i < 10; i++) state = navigate(state, "down", groups);
  assert.equal(state.row, 1);
  state = navigate(state, "escape", groups);
  assert.equal(state.screen, "summary");
  assert.equal(state.row, 0);
  for (let i = 0; i < 10; i++) state = navigate(state, "down", groups);
  assert.equal(state.metric, 2);
  assert.match(renderSummary(navigate(state, "return", groups), groups, 80, 24), /N\/A/);
  for (const key of ["q", "ctrl-c", "escape"]) assert.equal(navigate(state, key, groups).exited, true);
});

test("empty categories, scrolling and narrow terminals", () => {
  const empty = summaryGroups([], 0);
  assert.match(renderSummary({ ...initialState(), screen: "folders" }, empty, 80, 24), /No folders found/);
  const groups = summaryGroups(Array.from({ length: 30 }, (_, i) => ({ ...candidates[0], modulesPath: `/folder-${i}/node_modules` })), 0);
  const output = renderSummary({ ...initialState(), screen: "folders", row: 29 }, groups, 40, 10);
  assert.match(output, /folder-29/);
  assert.doesNotMatch(output, /folder-0\s/);
  assert.ok(output.split("\r\n").length <= 10);
  assert.match(renderSummary(initialState(), groups, 20, 5), /Resize terminal/);
});

test("colors respect the output stream, NO_COLOR and dumb terminals", () => {
  assert.match(createTheme(true, {}).text("hello"), /\x1b\[32m/);
  for (const theme of [createTheme(false, {}), createTheme(true, { NO_COLOR: "" }), createTheme(true, { TERM: "dumb" })]) {
    for (const style of Object.values(theme)) assert.equal(style("hello"), "hello");
  }
});

test("folder information preserves selection and shows full details", async () => {
  const groups = summaryGroups(candidates, 0);
  let state = navigate(initialState(), "return", groups);
  state = navigate(state, "down", groups);
  state = navigate(state, "return", groups);
  assert.equal(state.screen, "info");
  const info = await folderInfo(groups[0].folders[state.row].candidate);
  for (const line of ["Full path: /b/project/node_modules", "Package manager: npm", "Restore command: npm ci", "Working directory: /b/project"]) assert.ok(info.includes(line));
  state = navigate(state, "down", groups, 5);
  assert.equal(state.scroll, 1);
  for (const key of ["q", "ctrl-c"]) assert.equal(navigate(state, key, groups).exited, true);
  state = navigate(state, "escape", groups);
  assert.equal(state.screen, "folders");
  assert.equal(state.row, 1);
  assert.equal(state.scroll, 0);
});

test("empty and permission screens ignore Enter; unsupported folders explain N/A", async () => {
  const groups = summaryGroups([], 4);
  for (const metric of [0, 1, 2]) {
    const state = { ...initialState(), screen: "folders" as const, metric };
    assert.deepEqual(navigate(state, "return", groups), state);
  }
  const info = await folderInfo(candidates[2]);
  assert.ok(info.includes("Package manager: N/A"));
  assert.ok(info.includes("Restore command: N/A"));
});

test("full paths wrap without truncation and scroll within the viewport", () => {
  const path = `Full path: /${"long-directory/".repeat(20)}node_modules`;
  const wrapped = wrapInfo([path], 30);
  assert.equal(wrapped.join(""), path);
  const groups = summaryGroups(candidates, 0);
  const state = { ...initialState(), screen: "info" as const, scroll: wrapped.length - 3 };
  const output = renderSummary(state, groups, 30, 7, [path]);
  assert.match(output.replace(/\x1b\[[0-9;]*m/g, "").replace(/\r\n/g, ""), /node_modules/);
  assert.ok(output.split("\r\n").length <= 7);
  assert.equal(navigate(state, "down", groups, state.scroll).scroll, state.scroll);
});
