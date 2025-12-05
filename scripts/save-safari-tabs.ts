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

async function fetchLocalTabs(
	appIdentifier: "com.apple.Safari",
): Promise<LocalTab[]> {
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

const tabs = await fetchLocalTabs("com.apple.Safari");
const links = tabs.map((tab) => {
	return {
		title: tab.title,
		url: tab.url,
	};
});
const folderPath = path.join(os.homedir(), "/data/safari-sessions");
const date = new Date();
const currentDateStr = `${date.getFullYear()}-${String(
	date.getMonth() + 1,
).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const filePath = path.join(folderPath + `/${currentDateStr}-safari-tabs.json`);
if (fs.existsSync(filePath)) {
	let number = 1;
	let newPath = filePath;
	while (fs.existsSync(newPath)) {
		newPath = path.join(
			folderPath,
			`/${currentDateStr}-safari-tabs-${number}.json`,
		);
		number++;
	}
	Bun.write(newPath, JSON.stringify(links));
} else {
	Bun.write(filePath, JSON.stringify(links));
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
