// TODO:
// * probably use moment.js instead of weird timezone stuff
// * persistence
// * join events (incl. by reacts)
// * choose which channel to use
// * owner/staff check

const Discord = require("discord.js");
const path = require("path");
const configPath = path.resolve("./config.json");
const config = require(configPath);
const tz = require("../extras/timezones");

const datePattern = /([1-2][0-9]{3})([\-/])([0-9]{1,2})([\-/])([0-9]{1,2})/;
const timePattern = /([0-2][0-9]):([0-5][0-9])/;

function formatDate(date, origTimeZone) {
	const timeZone =
		origTimeZone &&
		(tz.TIMEZONE_CODES[origTimeZone.toUpperCase()] || origTimeZone);
	const dateFormat = Intl.DateTimeFormat("en-US", {
		weekday: "short",
		month: "long",
		day: "numeric",
		year: "numeric",
		hour: "numeric",
		minute: "numeric",
		hour12: true,
		timeZone
	});

	return dateFormat.format(date);
}

function getTimeZoneOfDate(date) {
	const dateFormat = Intl.DateTimeFormat(undefined, {
		second: "numeric",
		timeZoneName: "short"
	});

	const [, , timeZone] = dateFormat.formatToParts(date);

	return timeZone.value;
}

// Used to make the timezone into the 'canonical' format vs whatever user provided
function getTimeZoneCanonicalName(origTimeZone) {
	const timeZone =
		origTimeZone &&
		(tz.TIMEZONE_CODES[origTimeZone.toUpperCase()] || origTimeZone);
	const dateFormat = Intl.DateTimeFormat(undefined, {
		second: "numeric",
		timeZone,
		timeZoneName: "short"
	});

	const [, , canonicalTimeZone] = dateFormat.formatToParts(new Date());

	return canonicalTimeZone.value;
}

function isDateCorrect(date, input) {
	return (
		date.getFullYear() === input.year &&
		date.getMonth() === input.month - 1 &&
		date.getDate() === input.day &&
		date.getHours() === input.hour &&
		date.getMinutes() === input.minute
	);
}

class EventManager {
	constructor(client) {
		this.client = client;
		this.timer = null;
		this.upcomingEvents = [];
	}

	start() {
		// Ensure we're always at (or close to) the 'top' of a minute when we run our tick
		const topOfMinute = 60000 - (Date.now() % 60000);
		this.timer = this.client.setTimeout(() => {
			this.timer = this.client.setInterval(() => this.tick(), 60000);
			this.tick();
		}, topOfMinute);
	}

	tick() {
		const now = new Date();
		const dueEvents = this.upcomingEvents.filter(event => event.due <= now);
		this.upcomingEvents = this.upcomingEvents.filter(event => event.due > now);

		if (dueEvents) {
			dueEvents.forEach(event => {
				// Discard events we missed for more than 5 minutes
				if (now.valueOf() - event.due.valueOf() >= 300000) {
					return;
				}

				const destChannel = this.client.channels.get(event.channel);
				if (!destChannel) {
					console.log("Got event for unknown channel", event.channel);
					return;
				}

				destChannel.send(`Event '${event.name}' is starting now!`);
			});
		}
	}

	stop() {
		this.client.clearTimeout(this.timer);
		this.client.clearInterval(this.timer);
		this.timer = null;
	}

	add(event) {
		this.upcomingEvents.push(event);
		this.upcomingEvents.sort((a, b) => a.due.valueOf() - b.due.valueOf());
	}

	getByName(eventName) {
		let lowerEventName = eventName.toLowerCase();
		return this.upcomingEvents.find(
			event => event.name.toLowerCase() === lowerEventName
		);
	}

	deleteByName(eventName) {
		let lowerEventName = eventName.toLowerCase();
		this.upcomingEvents.splice(
			this.upcomingEvents.indexOf(
				event => event.name.toLowerCase() === lowerEventName
			)
		);
	}
}

let eventManager;

function embedEvent(title, event) {
	return new Discord.RichEmbed()
		.setTitle(title)
		.setDescription(
			`A message will be posted in <#${event.channel}> when this event starts.`
		)
		.addField("Creator", `<@${event.owner}>`)
		.addField("Channel", `<#${event.channel}>`)
		.setTimestamp(event.due);
}

async function createCommand(message, args, client) {
	const [date, time, ...nameParts] = args;
	const name = nameParts.join(" ");
	// 1 minute from now
	const minimumDate = new Date(Date.now() + 60000);

	if (eventManager.getByName(name)) {
		await message.channel.send(`An event called '${name}' already exists.`);
		return;
	}

	if (!date) {
		await message.channel.send("You must specify a date for the event.");
		return;
	}

	if (!time) {
		await message.channel.send("You must specify a time for the event.");
		return;
	}

	const dateMatch = date.match(datePattern);

	if (!dateMatch) {
		await message.channel.send(
			"The date format used wasn't recognized. Use `YYYY/MM/DD` or `YYYY-MM-DD`."
		);
		return;
	}

	const [, yearStr, , monthStr, , dayStr] = dateMatch;
	const year = parseInt(yearStr);
	const month = parseInt(monthStr);
	const day = parseInt(dayStr);

	const timeMatch = time.match(timePattern);

	if (!timeMatch) {
		await message.channel.send(
			"The time format used wasn't recognized. Use `HH:MM`."
		);
		return;
	}

	const [, hourStr, minuteStr] = timeMatch;
	const hour = parseInt(hourStr);
	const minute = parseInt(minuteStr);

	// month is a 'month index', i.e. 0-11, because why not
	const resolvedDate = new Date(year, month - 1, day, hour, minute);

	if (!isDateCorrect(resolvedDate, { year, month, day, hour, minute })) {
		await message.channel.send(
			`The date-time ${date} ${time} is not a calendar date time (check the month/day).`
		);
		return;
	}

	if (resolvedDate < minimumDate) {
		await message.channel.send("The event must start in the future.");
		return;
	}

	const newEvent = {
		due: resolvedDate,
		name,
		channel: message.channel.id,
		owner: message.author.id
	};

	eventManager.add(newEvent);

	await message.channel.send(
		"Your event has been created.",
		embedEvent(`New event: ${name}`, newEvent)
	);
}

async function deleteCommand(message, client, name) {
	if (!name) {
		await message.channel.send(
			"You must specify which event you want to delete."
		);
		return;
	}

	const event = eventManager.getByName(name);
	if (event) {
		eventManager.deleteByName(name);
		await message.channel.send(
			"The event was deleted.",
			embedEvent(`Deleted event: ${event.name}`, event)
		);
	} else {
		await message.channel.send(`The event '${name}' does not exist.`);
	}
}

async function infoCommand(message, client, name) {
	if (!name) {
		await message.channel.send(
			"You must specify which event you want info on."
		);
		return;
	}

	const event = eventManager.getByName(name);
	if (event) {
		await message.channel.send("", embedEvent(event.name, event));
	} else {
		await message.channel.send(`The event '${name}' does not exist.`);
	}
}

async function listCommand(message, client, timeZone) {
	if (eventManager.upcomingEvents.length === 0) {
		await message.channel.send("There are no events coming up.");
		return;
	}

	try {
		const displayLimit = 10;
		const displayAmount = Math.min(
			eventManager.upcomingEvents.length,
			displayLimit
		);
		const eventList = eventManager.upcomingEvents
			.slice(0, displayLimit)
			.map(
				(event, i) =>
					`${i + 1}. **${event.name}** (${formatDate(
						event.due,
						timeZone
					)}) - in <#${event.channel}>`
			)
			.join("\n");

		const embed = new Discord.RichEmbed()
			.setTitle(`Upcoming events in ${message.guild.name}`)
			.setDescription(
				`
			${
				displayAmount === 1
					? "There's only one upcoming event."
					: `Next ${displayAmount} events, ordered soonest-first.`
			}
			
			${eventList}`
			)
			.setFooter(
				`All event times are in ${getTimeZoneCanonicalName(timeZone) ||
					getTimeZoneOfDate(new Date())}.` +
					(timeZone
						? ""
						: " Use !event list [timezone] to show in your time zone.")
			);
		await message.channel.send("Here are the upcoming events:", embed);
	} catch (e) {
		if (e instanceof RangeError) {
			await message.channel.send(
				`'${timeZone}' is an invalid or unknown time zone.`
			);
		} else {
			throw e;
		}
	}
}

module.exports = {
	name: "event",
	description: "Allows people on a server to participate in events",
	usage: `create [YYYY/MM/DD] [HH:mm] [name] to create a new event
${config.prefix}event list [timezone] to list events (optionally in a chosen timezone)
${config.prefix}event info [name] for info on an event
${config.prefix}event delete [name] to delete an event`,
	cooldown: 3,
	guildOnly: true,
	staffOnly: true,
	args: true,
	async execute(message, args, client) {
		let [subcommand, ...cmdArgs] = args;
		subcommand = subcommand.toLowerCase();
		switch (subcommand) {
			case "add":
			case "create":
				await createCommand(message, cmdArgs, client);
				return;
			case "delete":
			case "remove":
				await deleteCommand(message, client, cmdArgs.join(" ") || undefined);
				return;
			case "info":
				await infoCommand(message, client, cmdArgs.join(" "));
				return;
			case "list":
				await listCommand(message, client, cmdArgs.join(" ") || undefined);
				return;
			case "":
				await message.channel.send(
					"You must specify a subcommand. See help for usage."
				);
				return;
			default:
				await message.channel.send(
					`Unknown subcommand '${subcommand}'. See help for usage.`
				);
				return;
		}
	},
	init(client) {
		eventManager = new EventManager(client);
		eventManager.start();
		console.log("Event manager ready.");
	}
};
