import { executeJxa } from "./jxa.js";

export async function getCurrentSafariUrlAndTitle(): Promise<any> {
	const currentTabInfo = await executeJxa(`
      const safari = Application("Safari");
      const currentTab = safari.windows[0].currentTab();
      return {
          title: currentTab.name(),
          url: currentTab.url()
      };
     `);
	return currentTabInfo;
}

export async function getCurrentSafariTechPreviewUrlAndTitle(): Promise<any> {
	const currentTabInfo = await executeJxa(`
      const safari = Application("Safari Technology Preview");
      const currentTab = safari.windows[0].currentTab();
      return {
          title: currentTab.name(),
          url: currentTab.url()
      };
     `);
	return currentTabInfo;
}
