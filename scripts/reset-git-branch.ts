import { $ } from "bun";

// Function to reset local branch to match remote
async function resetLocalBranch(branchName: string) {
	try {
		console.log(`Switching to branch: ${branchName}`);
		await $`git checkout ${branchName}`;

		console.log("Fetching latest remote state...");
		await $`git fetch origin`;

		console.log(`Resetting local branch to origin/${branchName}...`);
		await $`git reset --hard origin/${branchName}`;

		console.log("Cleaning untracked files...");
		await $`git clean -fd`;

		console.log(
			`Local branch ${branchName} has been reset to match origin/${branchName}`,
		);
		console.log("Verifying branch status...");
		const status = await $`git status`.text();
		console.log(status);
	} catch (error) {
		console.error("Error resetting branch:", error);
		process.exit(1);
	}
}

// Check for branch name argument
const branchName = Bun.argv[2];
if (!branchName) {
	console.error(
		"Please provide a branch name. Usage: bun run reset-branch.ts <branch-name>",
	);
	process.exit(1);
}

// Run the reset function
resetLocalBranch(branchName);
