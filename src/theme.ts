import { stdout, stderr } from "node:process";

export function createTheme(isTTY: boolean, env: NodeJS.ProcessEnv = process.env) {
  const enabled = isTTY && env.NO_COLOR === undefined && env.TERM !== "dumb";
  const style = (code: string) => (value: string): string => enabled ? `\x1b[${code}m${value}\x1b[0m` : value;
  return { text: style("32"), heading: style("1;92"), dim: style("2;32"), selected: style("1;30;102") };
}

export const theme = createTheme(Boolean(stdout.isTTY));
const errorTheme = createTheme(Boolean(stderr.isTTY));
export function log(message: string): void { stdout.write(`${theme.text(message)}\n`); }
export function error(message: string): void { stderr.write(`${errorTheme.text(message)}\n`); }
