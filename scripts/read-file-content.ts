async function main() {
	const args = Bun.argv;
	const path = args[2]?.trim();
	if (!path) throw new Error("No path");
	const content = await Bun.file(path).text();
	console.log(content);
}

await main();
