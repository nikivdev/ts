async function main() {
	const args = Bun.argv;
	const timezone = args[2];
	if (!timezone) {
		console.error("Usage: bun scripts/get-time.ts <timezone>");
		return;
	}

	try {
		console.log(getCurrentTime(timezone));
	} catch (error) {
		if (error instanceof RangeError) {
			console.error(error.message);
			return;
		}

		throw error;
	}
}

function getCurrentTime(timezone: string) {
	const timezoneMap: Record<string, string> = {
		"gmt-8": "America/Los_Angeles",
		"pacific": "America/Los_Angeles",
		"pst": "America/Los_Angeles",
		"pt": "America/Los_Angeles",
		"sf": "America/Los_Angeles",
	};

	const normalizedTimezone = timezone.trim().toLowerCase();
	const ianaTimezone = timezoneMap[normalizedTimezone] || timezone;

	const date = new Date();
	const options: Intl.DateTimeFormatOptions = {
		timeZone: ianaTimezone,
		hour: "2-digit",
		minute: "2-digit",
	hour12: false,
	};
	const formatter = new Intl.DateTimeFormat("en-US", options);
	return formatter.format(date);
}

await main();
