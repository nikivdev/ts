import { getCurrentActiveAppTitle } from "@nikiv/ts-utils";

async function main() {
	const args = Bun.argv;
	const path = args[2]?.trim();
	const appTitle = await getCurrentActiveAppTitle();
	if (!path) throw new Error("No path");
	if (!appTitle) throw new Error("No app title");
	await Bun.write(path, appTitle);
}

await main();
