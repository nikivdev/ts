import { object } from "@optique/core/constructs";
import { message } from "@optique/core/message";
import type { InferValue } from "@optique/core/parser";
import { argument } from "@optique/core/primitives";
import { string } from "@optique/core/valueparser";
import { run } from "@optique/run";
import { $ } from "bun";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Buffer } from "node:buffer";

const PROGRAM_NAME = "create-tree-from-commit";
const TAGLINE =
	"Materialize a folder tree from a specific git commit into ~/trees";

const cli = object({
	folderPath: argument(string(), {
		description: message`Folder whose contents should be exported`,
	}),
	commitRef: argument(string(), {
		description: message`Git commit (or ref) to export from`,
	}),
});

type CliArgs = InferValue<typeof cli>;

async function createTreeFromCommit(options: CliArgs) {
	const { folderPath, commitRef } = options;

	const resolvedFolder = path.resolve(folderPath);
	let folderStats;

	try {
		folderStats = await fs.stat(resolvedFolder);
	} catch {
		console.error(`The folder "${resolvedFolder}" does not exist`);
		process.exit(1);
	}

	if (!folderStats.isDirectory()) {
		console.error(`"${resolvedFolder}" is not a folder`);
		process.exit(1);
	}

	let repoRoot: string;
	try {
		repoRoot = (
			await $`git -C ${resolvedFolder} rev-parse --show-toplevel`.text()
		).trim();
	} catch {
		console.error(
			`Unable to determine git repository root for "${resolvedFolder}". Is it inside a git repository?`,
		);
		process.exit(1);
	}

	let folderForGit = path.relative(repoRoot, resolvedFolder);
	if (!folderForGit) {
		folderForGit = ".";
	}

	folderForGit = folderForGit.split(path.sep).join(path.posix.sep);

	if (folderForGit.startsWith("..")) {
		console.error(
			`The provided folder resolves outside the repository at ${repoRoot}`,
		);
		process.exit(1);
	}

	const trimmedCommit = commitRef.trim();
	if (trimmedCommit.length === 0) {
		console.error("Please provide a non-empty commit hash or reference");
		process.exit(1);
	}

	try {
		await $`git -C ${repoRoot} rev-parse --verify ${trimmedCommit}^{commit}`;
	} catch {
		console.error(`Unable to resolve commit "${trimmedCommit}" in ${repoRoot}`);
		process.exit(1);
	}

	const lsTreeOutput =
		folderForGit === "."
			? await $`git -C ${repoRoot} ls-tree -r --full-tree ${trimmedCommit}`.text()
			: await $`git -C ${repoRoot} ls-tree -r --full-tree ${trimmedCommit} -- ${folderForGit}`.text();

	const treeEntries = lsTreeOutput
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0)
		.map(parseTreeLine)
		.filter(
			(entry): entry is GitTreeEntry => entry !== null && entry.type === "blob",
		);

	const fileEntries: MaterializedEntry[] = [];

	for (const entry of treeEntries) {
		const repoPathInTree = entry.path;

		if (folderForGit === ".") {
			fileEntries.push({
				relativePath: repoPathInTree,
				repoPath: repoPathInTree,
				mode: entry.mode,
			});
			continue;
		}

		if (repoPathInTree === folderForGit) {
			continue;
		}

		if (!repoPathInTree.startsWith(`${folderForGit}/`)) {
			continue;
		}

		const relativePath = repoPathInTree.slice(folderForGit.length + 1);
		if (!relativePath) {
			continue;
		}

		fileEntries.push({
			relativePath,
			repoPath: repoPathInTree,
			mode: entry.mode,
		});
	}

	if (fileEntries.length === 0) {
		console.error(
			`No tracked files for "${folderForGit}" in commit ${trimmedCommit}`,
		);
		process.exit(1);
	}

	const folderName = path.basename(resolvedFolder);
	const sanitizedCommit = trimmedCommit.replace(/[^a-zA-Z0-9._-]/g, "_");

	const treesRoot = path.join(os.homedir(), "trees");
	try {
		await fs.mkdir(treesRoot, { recursive: true });
	} catch (error) {
		handleDirectoryCreationError(treesRoot, error);
	}

	const targetDir = path.join(treesRoot, `${folderName}-${sanitizedCommit}`);

	if (await pathExists(targetDir)) {
		console.error(
			`Target directory already exists: ${targetDir}. Refusing to overwrite.`,
		);
		process.exit(1);
	}

	try {
		await fs.mkdir(targetDir, { recursive: true });
	} catch (error) {
		handleDirectoryCreationError(targetDir, error);
	}

	let materializedCount = 0;

	for (const entry of fileEntries) {
		const targetPath = path.join(
			targetDir,
			entry.relativePath.split("/").join(path.sep),
		);
		await fs.mkdir(path.dirname(targetPath), { recursive: true });

		const spec = `${trimmedCommit}:${entry.repoPath}`;

		if (entry.mode === "120000") {
			const linkTargetBuffer = Buffer.from(
				await $`git -C ${repoRoot} show ${spec}`.arrayBuffer(),
			);
			const linkTarget = linkTargetBuffer.toString();
			await fs.symlink(linkTarget, targetPath);
		} else {
			const fileBuffer = Buffer.from(
				await $`git -C ${repoRoot} show ${spec}`.arrayBuffer(),
			);
			await fs.writeFile(targetPath, fileBuffer);

			const mode = parseInt(entry.mode, 8) & 0o777;
			await fs.chmod(targetPath, mode);
		}

		materializedCount += 1;
	}

	console.log(
		`Materialized ${materializedCount} file(s) from ${folderForGit} at ${trimmedCommit} to ${targetDir}`,
	);
}

type GitTreeEntry = {
	mode: string;
	type: "blob" | "tree" | "commit";
	path: string;
} | null;

type MaterializedEntry = {
	relativePath: string;
	repoPath: string;
	mode: string;
};

function parseTreeLine(line: string): GitTreeEntry {
	const tabIndex = line.indexOf("\t");
	if (tabIndex === -1) {
		return null;
	}

	const meta = line.slice(0, tabIndex);
	const filePath = line.slice(tabIndex + 1);

	const parts = meta.split(" ");
	if (parts.length < 3) {
		return null;
	}

	const [mode, type] = parts;
	if (type !== "blob" && type !== "tree" && type !== "commit") {
		return null;
	}

	return { mode, type, path: filePath };
}

async function pathExists(candidate: string) {
	try {
		await fs.access(candidate);
		return true;
	} catch {
		return false;
	}
}

function handleDirectoryCreationError(directory: string, error: unknown) {
	const reason =
		error instanceof Error
			? error.message
			: "Unknown error while creating directory";
	console.error(`Failed to create directory ${directory}: ${reason}`);
	process.exit(1);
}

async function main() {
	const parsed = run(cli, {
		programName: PROGRAM_NAME,
		brief: message`${TAGLINE}`,
		help: "both",
	});

	await createTreeFromCommit(parsed);
}

main().catch((error) => {
	console.error(
		error instanceof Error ? error.message : "Failed to create tree",
	);
	process.exit(1);
});
