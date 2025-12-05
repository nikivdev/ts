async function main() {
	const args = Bun.argv;
	const path = args[2]?.trim();
	const text = args[3]?.trim();
	if (!path || !text) throw new Error("No path or text");
	await Bun.write(path, text);
}

await main();
