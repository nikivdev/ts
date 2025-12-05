import { object } from "@optique/core/constructs"
import { message } from "@optique/core/message"
import type { InferValue } from "@optique/core/parser"
import { argument } from "@optique/core/primitives"
import { string } from "@optique/core/valueparser"
import { run } from "@optique/run"
import { $ } from "bun"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

const PROGRAM_NAME = "clone-pr"
const TAGLINE =
	"Clone a GitHub repository and check out the branch for a pull request URL"

const cli = object({
	prUrl: argument(string(), {
		description: message`GitHub pull request URL like https://github.com/org/repo/pull/123`,
	}),
})

type CliArgs = InferValue<typeof cli>

type PullRequestRef = {
	owner: string
	repo: string
	number: number
}

function parsePullRequestUrl(rawUrl: string): PullRequestRef {
	const trimmed = rawUrl.trim()
	if (!trimmed) {
		throw new Error("Please provide a pull request URL.")
	}

	let normalized = trimmed
	if (!/^https?:\/\//i.test(normalized)) {
		if (normalized.startsWith("github.com/")) {
			normalized = `https://${normalized}`
		} else {
			const withoutLeadingSlashes = normalized.replace(/^\/+/, "")
			normalized = `https://github.com/${withoutLeadingSlashes}`
		}
	}

	let parsed: URL
	try {
		parsed = new URL(normalized)
	} catch {
		throw new Error(`Unable to parse pull request URL: ${rawUrl}`)
	}

	if (parsed.hostname !== "github.com") {
		throw new Error(
			`Only github.com URLs are supported (got ${parsed.hostname})`,
		)
	}

	const segments = parsed.pathname.split("/").filter(Boolean)
	if (segments.length < 4) {
		throw new Error(
			"Pull request URL must include owner, repo, and pull request number.",
		)
	}

	const owner = segments[0]
	const repo = segments[1]
	const pullIdx = segments.findIndex(
		(segment) => segment === "pull" || segment === "pulls",
	)

	if (pullIdx < 0 || pullIdx + 1 >= segments.length) {
		throw new Error("URL does not appear to reference a pull request.")
	}

	const prNumber = Number.parseInt(segments[pullIdx + 1], 10)
	if (!Number.isFinite(prNumber)) {
		throw new Error("Pull request number is not a valid integer.")
	}

	return { owner, repo, number: prNumber }
}

async function ensureDirectoryExists(directory: string) {
	try {
		await fs.mkdir(directory, { recursive: true })
	} catch (error) {
		const reason =
			error instanceof Error
				? error.message
				: "unknown error creating directory"
		throw new Error(`Unable to create directory ${directory}: ${reason}`)
	}
}

async function ensureDirectoryAvailable(directory: string) {
	try {
		await fs.access(directory)
		throw new Error(
			`Target directory already exists: ${directory}. Refusing to overwrite.`,
		)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return
		}
		throw error
	}
}

async function cloneRepository(ref: PullRequestRef, targetDir: string) {
	const repoUrl = `https://github.com/${ref.owner}/${ref.repo}.git`
	console.log(`Cloning ${repoUrl} into ${targetDir}`)
	try {
		await $`git clone ${repoUrl} ${targetDir}`
	} catch (error) {
		const reason =
			error instanceof Error ? error.message : "unknown git clone failure"
		throw new Error(`Failed to clone ${repoUrl}: ${reason}`)
	}
}

async function checkoutPullRequest(ref: PullRequestRef, repoDir: string) {
	const branchName = `pr-${ref.number}`
	console.log(`Fetching PR #${ref.number} into ${branchName}`)
	try {
		await $`git -C ${repoDir} fetch origin pull/${ref.number}/head:${branchName}`
		await $`git -C ${repoDir} checkout ${branchName}`
	} catch (error) {
		const reason =
			error instanceof Error ? error.message : "unknown git checkout failure"
		throw new Error(
			`Unable to fetch and checkout PR #${ref.number} in ${repoDir}: ${reason}`,
		)
	}
}

async function clonePullRequest(options: CliArgs) {
	const ref = parsePullRequestUrl(options.prUrl)
	const baseDir = path.join(os.homedir(), "gh", ref.owner)
	await ensureDirectoryExists(baseDir)

	const targetDir = path.join(baseDir, `${ref.repo}-pr-${ref.number}`)
	await ensureDirectoryAvailable(targetDir)

	await cloneRepository(ref, targetDir)
	await checkoutPullRequest(ref, targetDir)

	console.log(
		`Repository ready at ${targetDir} on branch pr-${ref.number} for ${ref.owner}/${ref.repo}#${ref.number}`,
	)
}

async function main() {
	const parsed = run(cli, {
		programName: PROGRAM_NAME,
		brief: message`${TAGLINE}`,
		help: "both",
	})

	await clonePullRequest(parsed)
}

main().catch((error) => {
	console.error(
		error instanceof Error
			? error.message
			: "Failed to clone repository for pull request",
	)
	process.exit(1)
})
