import path from "node:path";
import fs from "node:fs/promises";
import { spawn } from "bun";

async function main() {
	const args = Bun.argv;
	const url = args[2];

	if (!url) {
		console.error("Please provide a GitHub URL");
		process.exit(1);
	}

	const cleanUrl = url
		.replace("https://", "")
		.replace("http://", "")
		.replace("github.com/", "")
		.replace(".git", "")
		.trim();

	const urlParts = cleanUrl.split("/");
	const [username, repo] = urlParts;

	if (!username || !repo) {
		console.error(
			"Invalid GitHub URL format. Expected: github.com/username/repo or username/repo",
		);
		process.exit(1);
	}
	const homeDir = process.env.HOME;
	if (!homeDir) {
		console.error("HOME environment variable is not set");
		process.exit(1);
	}
	const targetDir = path.join(homeDir, "gh", username);
	try {
		await fs.mkdir(targetDir, { recursive: true });
	} catch (err) {
		console.error("Failed to create directory:", err);
		process.exit(1);
	}
	const gitUrl = `https://github.com/${username}/${repo}.git`;
	const cloneProcess = spawn(["git", "clone", gitUrl], {
		cwd: targetDir,
		stdio: ["inherit", "inherit", "inherit"],
	});
	const exitCode = await cloneProcess.exited;
	if (exitCode !== 0) {
		console.error("Failed to clone repository");
		process.exit(1);
	}
	console.log(
		`Successfully cloned ${username}/${repo} to ${targetDir}/${repo}`,
	);
}

await main();
