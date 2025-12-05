import { object } from "@optique/core/constructs";
import { message } from "@optique/core/message";
import type { InferValue } from "@optique/core/parser";
import { run } from "@optique/run";
import { $ } from "bun";
import process from "node:process";

const PROGRAM_NAME = "fork";
const TAGLINE =
	"Fork the current repository, point origin to the fork over SSH, and run f commitPush";

const cli = object({});

type CliArgs = InferValue<typeof cli>;

async function ensureRepoRoot() {
	try {
		const repoRoot = (await $`git rev-parse --show-toplevel`.text()).trim();
		process.chdir(repoRoot);
		return repoRoot;
	} catch {
		console.error("This command must be run inside a git repository.");
		process.exit(1);
	}
}

async function ensureGhCli() {
	try {
		await $`gh --version`;
	} catch {
		console.error("GitHub CLI (gh) is required but not available in PATH.");
		process.exit(1);
	}
}

async function runGhFork() {
	try {
		await $`gh repo fork --remote --remote-name fork`;
		console.log("Fork created (or already exists) via gh CLI.");
	} catch (error) {
		console.error(
			error instanceof Error
				? error.message
				: "Failed to fork repository using gh CLI.",
		);
		process.exit(1);
	}
}

async function getRemoteUrl(remoteName: string) {
	try {
		return (await $`git remote get-url ${remoteName}`.text()).trim();
	} catch {
		return null;
	}
}

function convertToSsh(url: string) {
	if (url.startsWith("git@")) {
		return url;
	}

	try {
		const parsed = new URL(url);
		if (parsed.hostname !== "github.com") {
			throw new Error("Only github.com remotes are supported.");
		}

		const pathname = parsed.pathname.replace(/^\/+/, "");
		const ensured = pathname.endsWith(".git") ? pathname : `${pathname}.git`;
		return `git@github.com:${ensured}`;
	} catch {
		if (/^[\w-]+\/[\w.-]+(\.git)?$/.test(url)) {
			const ensured = url.endsWith(".git") ? url : `${url}.git`;
			return `git@github.com:${ensured}`;
		}

		throw new Error(`Unable to convert remote URL to SSH: ${url}`);
	}
}

async function rewireRemotes(sshUrl: string) {
	const existingOrigin = await getRemoteUrl("origin");

	let renamedOrigin = false;
	if (existingOrigin) {
		try {
			await $`git remote rename origin upstream`;
			renamedOrigin = true;
			console.log(
				"Renamed existing origin to upstream to retain the original remote.",
			);
		} catch {
			console.log("Origin remote kept; unable to rename (maybe already set).");
		}
	}

	if (renamedOrigin) {
		try {
			await $`git remote add origin ${sshUrl}`;
			console.log(`Added origin pointing to ${sshUrl}`);
		} catch (error) {
			console.error(
				error instanceof Error
					? error.message
					: `Failed to add origin remote ${sshUrl}`,
			);
			process.exit(1);
		}
	} else {
		try {
			await $`git remote set-url origin ${sshUrl}`;
			console.log(`Updated origin to ${sshUrl}`);
		} catch (error) {
			console.error(
				error instanceof Error
					? error.message
					: `Failed to update origin to ${sshUrl}`,
			);
			process.exit(1);
		}
	}
}

async function runCommitPush() {
	try {
		await $`f commitPush`;
	} catch (error) {
		console.error(
			error instanceof Error
				? error.message
				: "f commitPush command failed to execute.",
		);
		process.exit(1);
	}
}

async function forkRepository(_: CliArgs) {
	const repoRoot = await ensureRepoRoot();
	console.log(`Working inside ${repoRoot}`);

	await ensureGhCli();
	await runGhFork();

	const forkRemote = await getRemoteUrl("fork");
	if (!forkRemote) {
		console.error(
			"Fork remote was not created. Verify gh repo fork succeeds manually.",
		);
		process.exit(1);
	}

	let sshUrl: string;
	try {
		sshUrl = convertToSsh(forkRemote);
	} catch (error) {
		console.error(
			error instanceof Error
				? error.message
				: "Could not derive SSH URL for fork remote.",
		);
		process.exit(1);
	}

	await rewireRemotes(sshUrl);
	await runCommitPush();
}

async function main() {
	const parsed = run(cli, {
		programName: PROGRAM_NAME,
		brief: message`${TAGLINE}`,
		help: "both",
	});

	await forkRepository(parsed);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
});
