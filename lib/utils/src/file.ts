import path from "path";
import os from "os";
import { promises as fs } from "fs";

// Return true if file/folder of filePath exists
export async function fileOrFolderExists(filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}

// Append new object to existing JSON array file or create a new file with the object as the first entry in an array
export async function appendObjectToJsonArrayFile(
	filePath: string,
	newData: object,
): Promise<void> {
	const resolvedFilePath = filePath.startsWith("~")
		? path.join(os.homedir(), filePath.slice(1))
		: filePath;
	let dataArray: Array<object> = [];
	if (await fileOrFolderExists(resolvedFilePath)) {
		const fileContents = await readJsonFromFile(resolvedFilePath);
		if (Array.isArray(fileContents)) {
			dataArray = fileContents;
		}
	}
	dataArray.push(newData);
	await writeJsonArrayToFile(filePath, dataArray);
}

export async function readJsonFromFile(filePath: string): Promise<any> {
	const resolvedFilePath = filePath.startsWith("~")
		? path.join(os.homedir(), filePath.slice(1))
		: filePath;
	const data = await fs.readFile(resolvedFilePath, "utf-8");
	return JSON.parse(data);
}

// Overwrite content of the file at filePath with an array of objects
export async function writeJsonArrayToFile(
	filePath: string,
	data: Array<object>,
) {
	const resolvedFilePath = filePath.startsWith("~")
		? path.join(os.homedir(), filePath.slice(1))
		: filePath;
	const directoryPath = path.dirname(resolvedFilePath);
	await createFolderIfDoesntExist(directoryPath);
	await fs.writeFile(resolvedFilePath, JSON.stringify(data, null, 2));
}

// Create folder if it doesn't exist. accepts ~ as home directory
export async function createFolderIfDoesntExist(folderPath: string) {
	const resolvedFolderPath = folderPath.startsWith("~")
		? path.join(os.homedir(), folderPath.slice(1))
		: folderPath;
	if (!(await fileOrFolderExists(resolvedFolderPath))) {
		await fs.mkdir(resolvedFolderPath, { recursive: true });
	}
}
