import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

async function ensureEntryPointExists(entryPoint: string) {
	try {
		await fs.access(entryPoint);
	} catch {
		throw new Error(`Entry point not found: ${entryPoint}`);
	}
}

async function main() {
	const thisFilePath = fileURLToPath(import.meta.url);
	const projectRoot = path.dirname(thisFilePath);
	const entryPoint = path.join(projectRoot, "src", "main.ts");

	await ensureEntryPointExists(entryPoint);

	const binDirectory = path.join(os.homedir(), "bin");
	const binaryNameEnv = process.env.FLOW_TS_BIN_NAME?.trim();
	const binaryName =
		binaryNameEnv && binaryNameEnv.length > 0 ? binaryNameEnv : "flow-ts";
	const aliasEnv =
		process.env.FLOW_TS_BIN_ALIASES?.split(":")
			.map((name) => name.trim())
			.filter((name) => name.length > 0) ?? [];
	const namesToInstall = Array.from(new Set([binaryName, "fj", ...aliasEnv]));

	await fs.mkdir(binDirectory, { recursive: true });

	const entryUrl = pathToFileURL(entryPoint).href;
	const scriptContent = `#!/usr/bin/env bun
await import(${JSON.stringify(entryUrl)});
`;

	for (const name of namesToInstall) {
		const targetPath = path.join(binDirectory, name);
		await fs.writeFile(targetPath, scriptContent, { mode: 0o755 });
		await fs.chmod(targetPath, 0o755);
		console.log(`Installed CLI to ${targetPath}`);
	}
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
