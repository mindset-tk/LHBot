// TODO:
// * join events (incl. by reacts)
// * choose which channel to use
// * recurring events
// * set user/guild default timezone

const Discord = require("discord.js");
const fs = require("fs");
const path = require("path");
const configPath = path.resolve("./config.json");
const config = require(configPath);
const moment = require("moment-timezone");
const tz = require("../extras/timezones");
const eventDataPath = path.resolve('./events.json');
if (global.eventData == null) {
    if (!fs.existsSync(eventDataPath)) {
        fs.writeFileSync(eventDataPath, '{}');
    }
    global.eventData = require(eventDataPath);
}

function writeEventState() {
    fs.writeFile(eventDataPath, JSON.stringify(global.eventData, null, 2), function (err) {
        if (err) {
            return console.log(err);
        }
    });
}

const dateInputFormats = ['YYYY-MM-DD', 'YYYY/MM/DD', 'MM-DD', 'MM/DD'];
const timeInputFormat = 'HH:mm';

function getTimeZoneFromUserInput(timeZone) {
    return timeZone &&
        (tz.TIMEZONE_CODES[timeZone.toUpperCase()] || timeZone);
}

function formatDateCalendar(date, timeZone) {
    return date.tz(getTimeZoneFromUserInput(timeZone)).calendar();
}

function getTimeZoneOfDate(date) {
    return date.tz().zoneName();
}

function getGuildTimeZone(guild) {
    const guildZone = global.eventData.guildDefaultTimeZones[guild];

    // Return a default if none specified (the system time zone)
    return getTimeZoneFromUserInput(guildZone) || moment.tz().zoneName();
}

// Used to make the timezone into the 'canonical' format vs whatever user provided
function getTimeZoneCanonicalDisplayName(timeZone) {
    return moment.tz(getTimeZoneFromUserInput(timeZone)).zoneAbbr();
}

class EventManager {
    constructor(client) {
        this.client = client;
        this.timer = null;
        this.upcomingEvents = [];

        this.loadState();
    }

    loadState() {
        if (global.eventData.events) {
            // Convert saved date strings back into Moment datetime objects
            this.upcomingEvents = global.eventData.events.map(event => ({
                ...event,
                due: moment.utc(event.due, moment.ISO_8601, true),
            }));
        }
    }

    saveState() {
        // Serialize moment datetimes as ISO8601 strings
        global.eventData.events = this.upcomingEvents.map(event => ({
            ...event,
            due: event.due.toISOString(),
        }));
        writeEventState();
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
        const now = moment.utc();
        const dueEvents = this.upcomingEvents.filter(event => event.due.isSameOrBefore(now));
        this.upcomingEvents = this.upcomingEvents.filter(event => event.due.isAfter(now));

        if (dueEvents) {
            dueEvents.forEach(event => {
                const eventAge = moment.duration(now.diff(event.due));
                // Discard events we missed for more than 5 minutes
                if (eventAge.asMinutes() >= 5) {
                    return;
                }

                const destChannel = this.client.channels.get(event.channel);
                if (!destChannel) {
                    console.log("Got event for unknown channel", event.channel);
                    return;
                }

                destChannel.send(`The event **'${event.name}'** is starting now!`);
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
        this.upcomingEvents.sort((a, b) => a.due.diff(b.due));
        this.saveState();
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
        this.saveState();
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
    const timeZone = getGuildTimeZone(message.guild.id);
    const minimumDate = moment.tz(timeZone).add('1', 'minutes');

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

    if (!name) {
        await message.channel.send("You must specify a name for the event.");
        return;
    }

    // Process date and time separately for better error handling
    const datePart = moment.tz(date, dateInputFormats, true, timeZone);

    if (!datePart.isValid()) {
        await message.channel.send(
            `The date format used wasn't recognized, or you entered an invalid date. Supported date formats are: ${dateInputFormats.map(date => `\`${date}\``).join(', ')}.`
        );
        return;
    }

    const timePart = moment.tz(time, timeInputFormat, true, timeZone);

    if (!timePart.isValid()) {
        await message.channel.send(
            `The time format used wasn't recognized. The supported format is \`${timeInputFormat}\`.`
        );
        return;
    }

    const resolvedDate = datePart.set({
        'hour': timePart.hour(),
        'minute': timePart.minute(),
        'second': 0,
        'millisecond': 0
    });

    // Ensure the event is in the future.
    if (resolvedDate.diff(minimumDate) < 0) {
        await message.channel.send("The event must start in the future.");
        return;
    }

    const newEvent = {
        due: resolvedDate.utc(),
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
        if (event.owner !== message.author.id && !message.author.roles.has(config.roleStaff)) {
            await message.channel.send(`Only staff and the event creator can delete an event.`);
            return;
        }

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
    timeZone = getTimeZoneFromUserInput(timeZone) || getGuildTimeZone(message.guild.id);

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
                    `${i + 1}. **${event.name}** (${formatDateCalendar(
                        moment(event.due),
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
                `All event times are in ${getTimeZoneCanonicalDisplayName(timeZone)}.` +
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
    usage: `create [YYYY/MM/DD|MM/DD|today|tomorrow] [HH:mm] [name] to create a new event
${config.prefix}event list [timezone] to list events (optionally in a chosen timezone)
${config.prefix}event info [name] for info on an event
${config.prefix}event delete [name] to delete an event`,
    cooldown: 3,
    guildOnly: true,
    staffOnly: false,
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

