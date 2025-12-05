import { $ } from "bun";

// TODO: should return the out and error from $`` commands, right now it eats them
async function main() {
	const args = Bun.argv;
	const arg = args[2];
	if (arg === "remove-origin") {
		await $`git remote remove origin`;
		// TODO: get current url from safari (if it's github, then set origin to it, but first confirm it)
	} else {
		console.log("Specify valid command: i.e. `remove-origin`");
	}
}

await main();
