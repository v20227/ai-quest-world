import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";

export async function identifyValidation(command, cwd, depth = 0) {
  if (typeof command !== "string" || depth > 3) return null;
  let source = command.trim();
  const shell = source.match(/^(?:\/bin\/)?(?:ba|z)?sh -[lc]+ '([^']*)'$/);
  if (shell) source = shell[1];
  // Unsupported shell syntax remains an ordinary tool operation.
  if (/[;&|<>`$\n\r"'\\]/.test(source)) return null;
  const words = source.split(/\s+/);
  const executable = words[0];
  let kind = null;
  if (executable === "node" && words.includes("--test")) kind = "test";
  else if (/^(pytest|jest|mocha|vitest)$/.test(executable)) kind = "test";
  else if (/^python(?:3)?$/.test(executable) && words[1] === "-m" && words[2] === "pytest") kind = "test";
  else if (executable === "tsc" && words.includes("--noEmit")) kind = "typecheck";
  else if (executable === "mypy") kind = "typecheck";
  else if (executable === "eslint" && !words.includes("--fix")) kind = "lint";
  else if (executable === "prettier" && words.includes("--check")) kind = "lint";
  else if (executable === "npm" && (words[1] === "test" || words[1] === "run")) {
    const script = words[1] === "test" ? "test" : words[2];
    if (!script || words.length !== (words[1] === "test" ? 2 : 3)) return null;
    try {
      const pkg = JSON.parse(await readFile(join(cwd, "package.json"), "utf8"));
      if (pkg.scripts?.[`pre${script}`] || pkg.scripts?.[`post${script}`]) return null;
      const nested = await identifyValidation(pkg.scripts?.[script], cwd, depth + 1);
      kind = nested?.kind ?? null;
    } catch { return null; }
  }
  if (kind === null || words.some(word => /^(--help|--version|--list.*|--collect-only|--showConfig|--print-config|--inspect-config|--init|--fix-dry-run|--eval|-e|-h|-v)(=|$)/.test(word))) return null;
  return { kind, target: `command:${createHash("sha256").update(source).digest("hex")}` };
}

export function validationMeasurements(output) {
  if (typeof output !== "string") return {};
  const text = output.replace(/\x1b\[[0-9;]*m/g, "");
  const total = text.match(/^\s*(?:#|ℹ) tests (\d+)\s*$/m);
  const passed = text.match(/^\s*(?:#|ℹ) pass (\d+)\s*$/m);
  const failed = text.match(/^\s*(?:#|ℹ) fail (\d+)\s*$/m);
  if (!total || !passed || !failed) return {};
  const values = { total: Number(total[1]), passed: Number(passed[1]), failed: Number(failed[1]) };
  return Object.values(values).every(Number.isSafeInteger) && values.passed + values.failed <= values.total ? values : {};
}
