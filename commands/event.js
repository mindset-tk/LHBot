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

const DEFAULT_EVENT_DATA = {
    guildDefaultTimeZones: {},
    events: {},
    userTimeZones: {},
};

if (global.eventData == null) {
    if (!fs.existsSync(eventDataPath)) {
        fs.writeFileSync(eventDataPath, JSON.stringify(DEFAULT_EVENT_DATA));
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
    timeZone = timeZone && timeZone.replace(' ', '_');
    return timeZone &&
        (tz.TIMEZONE_CODES[timeZone.toUpperCase()] || timeZone);
}

function formatDateCalendar(date, timeZone) {
    return date.tz(getTimeZoneFromUserInput(timeZone)).calendar();
}

function isValidTimeZone(timeZone) {
    return moment.tz(timeZone).tz() !== undefined;
}

function getGuildTimeZone(guild) {
    const guildZone = guild && global.eventData.guildDefaultTimeZones[guild.id];

    // Return a default if none specified (the system time zone)
    return getTimeZoneFromUserInput(guildZone) || moment.tz.guess();
}

function getUserTimeZone(message) {
    const userZone = global.eventData.userTimeZones[message.author.id];
    return getTimeZoneFromUserInput(userZone) || getGuildTimeZone(message.guild);
}

function setGuildTimeZone(guild, timeZone) {
    global.eventData.guildDefaultTimeZones[guild.id] = timeZone;
    writeEventState();
}

function setUserTimeZone(user, timeZone) {
    global.eventData.userTimeZones[user.id] = timeZone;
    writeEventState();
}

// Used to make the timezone into the 'canonical' format vs whatever user provided
function getTimeZoneCanonicalDisplayName(timeZone) {
    return moment.tz(getTimeZoneFromUserInput(timeZone)).zoneAbbr();
}

class EventManager {
    constructor(client) {
        this.client = client;
        this.timer = null;
        this.upcomingEvents = {};

        this.loadState();
    }

    loadState() {
        if (global.eventData.events) {
            // Convert saved date strings back into Moment datetime objects
            Object.entries(global.eventData.events).forEach(([guild, events]) => {
                this.upcomingEvents[guild] = events.map(event => ({
                    ...event,
                    due: moment.utc(event.due, moment.ISO_8601, true),
                }));
            });
        }
    }

    saveState() {
        // Serialize moment datetimes as ISO8601 strings
        Object.entries(this.upcomingEvents).forEach(([guild, events]) => {
            global.eventData.events[guild] = events.map(event => ({
                ...event,
                due: event.due.toISOString(),
            }));
        });
        writeEventState();
    }

    start() {
        // Tick immediately at start to do cleanup
        this.tick();

        // Ensure we're always at (or close to) the 'top' of a minute when we run our tick
        const topOfMinute = 60000 - (Date.now() % 60000);
        this.timer = this.client.setTimeout(() => {
            this.timer = this.client.setInterval(() => this.tick(), 60000);
            this.tick();
        }, topOfMinute);
    }

    tick() {
        const now = moment.utc();
        const eventsByGuild = Object.entries(this.upcomingEvents);
        eventsByGuild.forEach(([guild, events]) => {
            const dueEvents = events.filter(event => event.due.isSameOrBefore(now));
            this.upcomingEvents[guild] = events.filter(event => event.due.isAfter(now));
            this.saveState();

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
        })
    }

    stop() {
        this.client.clearTimeout(this.timer);
        this.client.clearInterval(this.timer);
        this.timer = null;
    }

    add(event) {
        const guild = event.guild;
        if (!this.upcomingEvents[guild]) {
            this.upcomingEvents[guild] = [];
        }
        this.upcomingEvents[guild].push(event);
        this.upcomingEvents[guild].sort((a, b) => a.due.diff(b.due));
        this.saveState();
    }

    getByName(guild, eventName) {
        let lowerEventName = eventName.toLowerCase();
        return this.upcomingEvents[guild] && this.upcomingEvents[guild].find(
            event => event.name.toLowerCase() === lowerEventName
        );
    }

    deleteByName(guild, eventName) {
        if (!this.upcomingEvents[guild]) {
            return;
        }

        let lowerEventName = eventName.toLowerCase();
        this.upcomingEvents[guild].splice(
            this.upcomingEvents[guild].indexOf(
                event => event.name.toLowerCase() === lowerEventName
            )
        );
        this.saveState();
    }

    guildEvents(guild) {
        return this.upcomingEvents[guild] || [];
    }
}

let eventManager;

function embedEvent(title, event) {
    return new Discord.RichEmbed()
        .setTitle(title)
        .setDescription(
            `A message will be posted in <#${event.channel}> when this event starts.`
        )
        .addField("Event name", event.name)
        .addField("Creator", `<@${event.owner}>`)
        .addField("Channel", `<#${event.channel}>`)
        .setTimestamp(event.due);
}

async function createCommand(message, args, client) {
    const [date, time, ...nameParts] = args;
    const name = nameParts.join(" ");
    // 1 minute from now
    const timeZone = getUserTimeZone(message);
    const minimumDate = moment.tz(timeZone).add('1', 'minutes');

    if (eventManager.getByName(message.guild.id, name)) {
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
        owner: message.author.id,
        guild: message.guild.id,
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

    const event = eventManager.getByName(message.guild.id, name);
    if (event) {
        if (event.owner !== message.author.id && !message.member.roles.has(config.roleStaff)) {
            await message.channel.send(`Only staff and the event creator can delete an event.`);
            return;
        }

        eventManager.deleteByName(message.guild.id, name);
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

    const event = eventManager.getByName(message.guild.id, name);
    if (event) {
        await message.channel.send("", embedEvent(event.name, event));
    } else {
        await message.channel.send(`The event '${name}' does not exist.`);
    }
}

async function listCommand(message, client, timeZone) {
    timeZone = getTimeZoneFromUserInput(timeZone) || getUserTimeZone(message);

    if (!isValidTimeZone(timeZone)) {
        await message.channel.send(
            `'${timeZone}' is an invalid or unknown time zone.`
        );
        return;
    }

    const guildUpcomingEvents = eventManager.guildEvents(message.guild.id);

    if (guildUpcomingEvents.length === 0) {
        await message.channel.send("There are no events coming up.");
        return;
    }

    const displayLimit = 10;
    const displayAmount = Math.min(
        guildUpcomingEvents.length,
        displayLimit
    );
    const eventList = guildUpcomingEvents
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
}

async function servertzCommand(message, client, timeZone) {
    if (!timeZone) {
        const defaultTimeZone = getGuildTimeZone(message.guild);
        return message.channel.send(
            `The server's default time zone is **${getTimeZoneCanonicalDisplayName(defaultTimeZone)}** (UTC${moment().tz(defaultTimeZone).format('Z')}).`
        );
    }

    if (!message.member.roles.has(config.roleStaff)) {
        return message.channel.send(`Only staff can set the server's default timezone.`);
    }

    timeZone = getTimeZoneFromUserInput(timeZone);

    if(!isValidTimeZone(timeZone)) {
        return message.channel.send(
            `'${timeZone}' is an invalid or unknown time zone.`
        );
    }

    setGuildTimeZone(message.guild.id, timeZone);

    return message.channel.send(
        `The server's default time zone is now set to **${getTimeZoneCanonicalDisplayName(timeZone)}** (UTC${moment().tz(timeZone).format('Z')}).`
    );
}

async function tzCommand(message, client, timeZone) {
    if (!timeZone) {
        const defaultTimeZone = getUserTimeZone(message);
        return message.channel.send(
            `<@${message.author.id}>, your default time zone is **${getTimeZoneCanonicalDisplayName(defaultTimeZone)}** (UTC${moment().tz(defaultTimeZone).format('Z')}).`
        );
    }

    timeZone = getTimeZoneFromUserInput(timeZone);

    if(!isValidTimeZone(timeZone)) {
        return message.channel.send(
            `'${timeZone}' is an invalid or unknown time zone.`
        );
    }

    setUserTimeZone(message.author, timeZone);

    return message.channel.send(
        `<@${message.author.id}>, your default time zone is now set to **${getTimeZoneCanonicalDisplayName(timeZone)}** (UTC${moment().tz(timeZone).format('Z')}).`
    );
}

module.exports = {
    name: "event",
    description: "Allows people on a server to participate in events",
    usage: `create [YYYY/MM/DD|MM/DD|today|tomorrow] [HH:mm] [name] to create a new event
${config.prefix}event list [timezone] to list events (optionally in a chosen timezone)
${config.prefix}event info [name] for info on an event
${config.prefix}event delete [name] to delete an event
${config.prefix}event servertz [name] to get/set the server's default timezone (staff only)
${config.prefix}event tz [name] to get/set your default timezone`,
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
            case "servertz":
                await servertzCommand(message, client, cmdArgs.join(" "));
                return;
            case "tz":
                await tzCommand(message, client, cmdArgs.join(" "));
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
        const onReady = () => {
            eventManager = new EventManager(client);
            eventManager.start();
            console.log("Event manager ready.");
        };

        if (client.status !== Discord.Constants.Status.READY) {
            client.on('ready', onReady);
        } else {
            onReady();
        }
    }
};

