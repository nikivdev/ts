import path from "path";
import fs from "fs/promises";

async function main() {
	const args = Bun.argv;
	const template = args[2];
	if (template === "web") {
		const srcPath = path.join(process.env.HOME!, "src/new/web");
		const destPath = process.cwd();
		try {
			await fs.cp(srcPath, destPath, {
				recursive: true,
				filter: (src) => !src.includes("node_modules"),
			});
		} catch (err) {
			console.log(err);
		}
	} else {
		// TODO: show all options
		console.log("Specify valid template: i.e. `web`");
	}
}

await main();
