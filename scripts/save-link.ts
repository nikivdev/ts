import {
	appendObjectToJsonArrayFile,
	getClipboard,
	getCurrentMonth,
	getCurrentMonthAndDay,
	getCurrentSafariTechPreviewUrlAndTitle,
	getCurrentSafariUrlAndTitle,
} from "@nikiv/ts-utils";

async function main() {
	const args = Bun.argv;
	const fileName = getCurrentMonth()!.toLocaleLowerCase() + `.json`;
	const filePath = `~/data/links/${fileName}`;
	let newLink;
	switch (args[2]) {
		case "top":
			newLink = {
				...(await getCurrentSafariUrlAndTitle()),
				dateAdded: getCurrentMonthAndDay(),
				top: true,
			};
			if (newLink.url === null) {
				throw new Error("No URL found");
			}
			await appendObjectToJsonArrayFile(filePath, newLink);
			return "done";
		case "safari-tech-preview":
			newLink = {
				...(await getCurrentSafariTechPreviewUrlAndTitle()),
				dateAdded: getCurrentMonthAndDay(),
			};
			if (newLink.url === null) {
				throw new Error("No URL found");
			}
			await appendObjectToJsonArrayFile(filePath, newLink);
			return "done";
		case "safari-tech-preview-top":
			newLink = {
				...(await getCurrentSafariTechPreviewUrlAndTitle()),
				dateAdded: getCurrentMonthAndDay(),
				top: true,
			};
			if (newLink.url === null) {
				throw new Error("No URL found");
			}
			await appendObjectToJsonArrayFile(filePath, newLink);
			return "done";
		// TODO: add a new case for `twitter-url-from-clipboard`, include the tweet text as the title maybe
		case "url-from-clipboard":
			newLink = {
				url: getClipboard(),
				dateAdded: getCurrentMonthAndDay(),
			};
			if (newLink.url === null) {
				throw new Error("No URL found");
			}
			await appendObjectToJsonArrayFile(filePath, newLink);
			return "done";
		case "url-from-clipboard-top":
			newLink = {
				url: getClipboard(),
				dateAdded: getCurrentMonthAndDay(),
				top: true,
			};
			if (newLink.url === null) {
				throw new Error("No URL found");
			}
			await appendObjectToJsonArrayFile(filePath, newLink);
			return "done";
		default:
			newLink = {
				...(await getCurrentSafariUrlAndTitle()),
				dateAdded: getCurrentMonthAndDay(),
			};
			if (newLink.url === null) {
				throw new Error("No URL found");
			}
			await appendObjectToJsonArrayFile(filePath, newLink);
			return "done";
	}
}
console.log(await main());
