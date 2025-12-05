export function getCurrentMonth(): string {
	const monthNames = [
		"January",
		"February",
		"March",
		"April",
		"May",
		"June",
		"July",
		"August",
		"September",
		"October",
		"November",
		"December",
	];
	const currentDate = new Date();
	return monthNames[currentDate.getMonth()];
}

export function getCurrentMonthAndDay(): string {
	const monthNames = [
		"January",
		"February",
		"March",
		"April",
		"May",
		"June",
		"July",
		"August",
		"September",
		"October",
		"November",
		"December",
	];
	const currentDate = new Date();
	return `${monthNames[currentDate.getMonth()]} ${currentDate.getDate()}`;
}
