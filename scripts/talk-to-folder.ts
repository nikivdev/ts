import { object } from "@optique/core/constructs";
import { message } from "@optique/core/message";
import type { InferValue } from "@optique/core/parser";
import { argument } from "@optique/core/primitives";
import { string } from "@optique/core/valueparser";
import { run } from "@optique/run";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import OpenAI from "openai";

const PROGRAM_NAME = "talk-to-folder";
const TAGLINE =
	"Describe a folder and ask OpenAI a question about its current contents";

const MAX_DEPTH = 3;
const MAX_ENTRIES = 200;
const IGNORED_DIRECTORIES = new Set([
	".git",
	"node_modules",
	".next",
	"dist",
	"build",
	".turbo",
]);

const cli = object({
	folderPath: argument(string(), {
		description: message`Folder to inspect`,
	}),
	prompt: argument(string(), {
		description: message`Question or instruction for OpenAI`,
	}),
});

type CliArgs = InferValue<typeof cli>;

async function talkToFolder(options: CliArgs) {
	const { folderPath, prompt } = options;

	const apiKey = process.env.OPENAI_API_KEY;
	if (!apiKey) {
		console.error("OPENAI_API_KEY is not set in the environment");
		process.exit(1);
	}

	const resolvedFolder = path.resolve(folderPath);
	let folderStats;

	try {
		folderStats = await fs.stat(resolvedFolder);
	} catch {
		console.error(`Folder does not exist: ${resolvedFolder}`);
		process.exit(1);
	}

	if (!folderStats.isDirectory()) {
		console.error(`Not a directory: ${resolvedFolder}`);
		process.exit(1);
	}

	const listing = await buildDirectoryListing(resolvedFolder);

	const client = new OpenAI({ apiKey });

	const system = [
		"You receive a partial directory listing and a user question.",
		"Answer using only the provided information or reasonable inferences.",
		"If something is unclear, explain what additional detail would help.",
	].join(" ");

	console.log("Sending request to OpenAI...\n");

	try {
		const response = await client.responses.create({
			model: "gpt-4.1-mini",
			input: [
				{
					role: "system",
					content: [{ type: "text", text: system }],
				},
				{
					role: "user",
					content: [
						{
							type: "text",
							text: [
								`Directory: ${resolvedFolder}`,
								"",
								"Listing:",
								listing,
								"",
								"Prompt:",
								prompt,
							].join("\n"),
						},
					],
				},
			],
		});

		const output = response.output_text;
		console.log(output ?? "OpenAI returned an empty response.");
	} catch (error) {
		console.error(
			error instanceof Error ? error.message : "Failed to call OpenAI",
		);
		process.exit(1);
	}
}

async function buildDirectoryListing(root: string) {
	const lines: string[] = [];
	let count = 0;
	let truncated = false;

	async function walk(current: string, depth: number, prefix: string) {
		if (count >= MAX_ENTRIES) {
			truncated = true;
			return;
		}

		let entries = await fs.readdir(current, { withFileTypes: true });
		entries = entries.filter((entry) => {
			if (!entry.isDirectory()) {
				return true;
			}
			return !IGNORED_DIRECTORIES.has(entry.name);
		});
		entries.sort((a, b) => {
			if (a.isDirectory() && !b.isDirectory()) return -1;
			if (!a.isDirectory() && b.isDirectory()) return 1;
			return a.name.localeCompare(b.name);
		});

		for (const entry of entries) {
			if (count >= MAX_ENTRIES) {
				truncated = true;
				break;
			}

			const displayName = entry.isDirectory() ? `${entry.name}/` : entry.name;
			lines.push(`${prefix}${displayName}`);
			count += 1;

			if (entry.isDirectory()) {
				const nextPath = path.join(current, entry.name);
				if (depth < MAX_DEPTH) {
					await walk(nextPath, depth + 1, `${prefix}  `);
				} else {
					lines.push(`${prefix}  ...`);
				}
			}
		}
	}

	await walk(root, 0, "");

	if (truncated) {
		lines.push(
			`[Listing truncated after ${MAX_ENTRIES} entries. Increase MAX_ENTRIES to see more.]`,
		);
	}

	return lines.join("\n");
}

async function main() {
	const parsed = run(cli, {
		programName: PROGRAM_NAME,
		brief: message`${TAGLINE}`,
		help: "both",
	});

	await talkToFolder(parsed);
}

main().catch((error) => {
	console.error(
		error instanceof Error ? error.message : "Unexpected error running script",
	);
	process.exit(1);
});
