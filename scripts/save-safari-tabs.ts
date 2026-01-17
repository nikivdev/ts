import os from "os";
import path from "path";
import fs from "fs";
import { executeJxa } from "@nikiv/ts-utils";

type Tab = {
	uuid: string;
	title: string;
	url: string;
	is_local: boolean;
};
type LocalTab = Tab & {
	window_id: number;
	index: number;
};

type SafariApp = "com.apple.Safari" | "com.apple.SafariTechnologyPreview"

async function fetchLocalTabs(appIdentifier: SafariApp): Promise<LocalTab[]> {
	return executeJxa(`
    const safari = Application("${appIdentifier}");
    const tabs = [];
    safari.windows().map(window => {
      const windowTabs = window.tabs();
      if (windowTabs) {
        return windowTabs.map(tab => {
          tabs.push({
            uuid: window.id() + '-' + tab.index(),
            title: tab.name(),
            url: tab.url() || '',
            window_id: window.id(),
            index: tab.index(),
            is_local: true
          });
        })
      }
    });
    return tabs;
`);
}

async function saveTabs(appIdentifier: SafariApp, suffix: string) {
	const tabs = await fetchLocalTabs(appIdentifier)
	const links = tabs.map((tab) => ({
		title: tab.title,
		url: tab.url,
	}))

	if (links.length === 0) return

	const folderPath = path.join(os.homedir(), "/data/safari-sessions")
	const date = new Date()
	const currentDateStr = `${date.getFullYear()}-${String(
		date.getMonth() + 1,
	).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`

	const baseFileName = `${currentDateStr}-${suffix}`
	let filePath = path.join(folderPath, `${baseFileName}.json`)

	if (fs.existsSync(filePath)) {
		let number = 1
		while (fs.existsSync(filePath)) {
			filePath = path.join(folderPath, `${baseFileName}-${number}.json`)
			number++
		}
	}

	await Bun.write(filePath, JSON.stringify(links))
	console.log(`Saved ${links.length} tabs to ${filePath}`)
}

const arg = process.argv[2]

if (arg === "tp" || arg === "preview") {
	await saveTabs("com.apple.SafariTechnologyPreview", "safari-tp-tabs")
} else if (arg === "safari") {
	await saveTabs("com.apple.Safari", "safari-tabs")
} else {
	// Default: save both
	await Promise.all([
		saveTabs("com.apple.Safari", "safari-tabs"),
		saveTabs("com.apple.SafariTechnologyPreview", "safari-tp-tabs"),
	])
}

// const file = Bun.file(file_path)
// const linksParsed = JSON.parse(await file.text())
// console.log(linksParsed)

// TODO: attempt to get safari url
// TODO: write using JXA approach above and delete below code
// import { execa } from "execa"
// TODO: need https://github.com/dsherret/dax but for bun..
// https://github.com/google/zx can't import
// https://github.com/sindresorhus/execa not nice DX but can't do below string with "" to work using it
// Return URL of current tab in Safari
// export async function getSafariUrl() {
//   // const { stdout } = await execa("osascript", ['-e'], '')
//   // return await $` -e 'tell application "Safari" to return URL of front document'`
// }

// TODO: add support for google chrome, chrome canary, safari tech preview
// TODO: change from safari.ts to browser.ts, use code as part of CLI
// TODO: cleanup, above is messy
