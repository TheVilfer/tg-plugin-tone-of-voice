import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { validatePlugin } from "@better-tg/plugin-sdk/test";
import type { PluginRunError } from "@better-tg/plugin-sdk/test";

/** The manifest of this repository, as committed. */
export const manifest = JSON.parse(readFileSync("tg-plugin.json", "utf-8")) as {
  name: string;
  engines: Record<string, string>;
  permissions: string[];
  network: string[];
  secrets: unknown[];
  files: string[];
  commands: { name: string; effects: string[] }[];
};

/** Resolves with the error a run failed with, and fails the test when it did not fail. */
export async function failure(run: Promise<unknown>): Promise<PluginRunError> {
  try {
    await run;
  } catch (error) {
    return error as PluginRunError;
  }
  throw new Error("The run did not fail");
}

/**
 * The plugin folder the test host runs. It is this repository, unless the SDK carries a CLI older
 * than the one `engines` asks for (an SDK built before Better-TG-CLI 0.41.0, the first release
 * with plugins): then a copy of exactly the manifest's files with `engines` left out, so the
 * plugin's own behaviour is still tested. Any other refusal fails the tests.
 */
export function pluginDir(): string {
  try {
    validatePlugin(".");
    return ".";
  } catch (error) {
    if ((error as PluginRunError).code !== "plugin_unsupported") {
      throw error;
    }
  }
  const copy = mkdtempSync(join(tmpdir(), "tone-of-voice-"));
  for (const file of manifest.files) {
    mkdirSync(dirname(join(copy, file)), { recursive: true });
    cpSync(file, join(copy, file));
  }
  const { engines: _engines, ...rest } = manifest;
  writeFileSync(
    join(copy, "tg-plugin.json"),
    `${JSON.stringify(rest, null, 2)}\n`
  );
  validatePlugin(copy);
  return copy;
}

/** The test probe: the plugin's statistics code and its permissions in a folder of its own. */
export const probeDir = "test/probes/stats";
