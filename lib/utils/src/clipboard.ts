import clipboard from "clipboardy";

export function getClipboard(): string {
	return clipboard.readSync();
}
