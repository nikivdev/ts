import osascript from "osascript-tag";

export async function executeJxa(script: string): Promise<any> {
	try {
		const result = await osascript.jxa({ parse: true })`${script}`;
		return result;
	} catch (err: unknown) {
		if (typeof err === "string") {
			console.error(err, "failed to execute jxa");
		}
	}
}

export async function getCurrentActiveAppTitle(): Promise<string> {
	const appInfo = await executeJxa(`
      const systemEvents = Application("System Events");
      const frontmostApp = systemEvents.processes.whose({ frontmost: true })[0];
      return frontmostApp.name();
  `);
	return appInfo;
}
