import { object } from "@optique/core/constructs";
import { message } from "@optique/core/message";
import type { InferValue } from "@optique/core/parser";
import { argument } from "@optique/core/primitives";
import { string } from "@optique/core/valueparser";
import { run } from "@optique/run";
import { $ } from "bun";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

const PROGRAM_NAME = "find-file-in-git-history";
const TAGLINE =
	"Locate the first commit introducing a file name within a folder";

const cli = object({
	folderPath: argument(string(), {
		description: message`Folder to inspect (absolute or relative to the repository root)`,
	}),
	fileName: argument(string(), {
		description: message`File name to search for within the folder history`,
	}),
});

type CliArgs = InferValue<typeof cli>;

async function findFirstCommit(options: CliArgs) {
	const { folderPath, fileName } = options;

	const resolvedFolder = path.resolve(folderPath);

	try {
		await fs.access(resolvedFolder);
	} catch {
		console.error(`The folder "${resolvedFolder}" does not exist`);
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

	process.chdir(repoRoot);

	console.log(
		`Searching history of ${folderForGit} for the file name "${fileName}"...`,
	);

	const commitListText =
		folderForGit === "."
			? await $`git rev-list --reverse HEAD`.text()
			: await $`git rev-list --reverse HEAD -- ${folderForGit}`.text();

	const commits = commitListText
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);

	if (commits.length === 0) {
		console.log(`No commits found that touch ${folderForGit}`);
		return;
	}

	for (const commit of commits) {
		const treeOutput =
			await $`git ls-tree -r --name-only ${commit} -- ${folderForGit}`.text();
		const files = treeOutput
			.split("\n")
			.map((line) => line.trim())
			.filter(Boolean);

		const matches = files.filter((filePath) => {
			const candidate =
				filePath.lastIndexOf("/") >= 0
					? filePath.slice(filePath.lastIndexOf("/") + 1)
					: filePath;
			return candidate === fileName;
		});

		if (matches.length > 0) {
			const commitDetails =
				await $`git show -s --format=%H%n%an%n%ad%n%s ${commit}`.text();
			const details = commitDetails.trim().split("\n");
			const [hash, author, date, subject] = [
				details[0] ?? commit,
				details[1] ?? "Unknown author",
				details[2] ?? "Unknown date",
				details[3] ?? "",
			];

			console.log(`Found in commit ${hash}`);
			console.log(`Author: ${author}`);
			console.log(`Date: ${date}`);
			console.log(`Message: ${subject}`);
			console.log("Matching paths:");
			matches.forEach((match) => console.log(`- ${match}`));
			return;
		}
	}

	console.log(
		`No commit in the inspected history contains a file named "${fileName}" inside ${folderForGit}`,
	);
}

async function main() {
	const parsed = run(cli, {
		programName: PROGRAM_NAME,
		brief: message`${TAGLINE}`,
		help: "both",
	});

	await findFirstCommit(parsed);
}

main().catch((error) => {
	console.error("Failed to search git history:", error);
	process.exit(1);
});
