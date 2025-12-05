import { getClipboard } from "@nikiv/ts-utils";

async function main() {
	const args = Bun.argv;
	const cmd = args[2];
	if (!cmd) throw new Error("No command");
	const text = getClipboard();
	switch (cmd) {
		case "first-line-only":
			console.log(stripeToOnlyFirstLine(text));
	}
}

function stripeToOnlyFirstLine(text: string) {
	return text.split("\n")[0];
}

await main();
