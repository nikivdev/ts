import { executeJxa } from "./jxa.js";

export async function getCurrentCursorFileAndTitle(): Promise<{
	title: string;
	file: string;
}> {
	const cursorInfo = await executeJxa(`
    const cursor = Application("Cursor");
    const systemEvents = Application("System Events");
    const cursorProcess = systemEvents.processes.whose({ name: "Cursor" })[0];

    if (cursorProcess && cursorProcess.windows.length > 0) {
      const window = cursorProcess.windows[0];
      return {
        title: window.name(),
        file: window.name()
      };
    }
    return { title: '', file: '' };
  `);
	return cursorInfo;
}
