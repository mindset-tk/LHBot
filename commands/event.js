// TODO:
// * join events by reacts
// * choose which channel to use
// * recurring events

const Discord = require("discord.js");
const fs = require("fs");
const fsp = fs.promises;
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

// We make writing state async because I found in testing
// that it was fairly common when events were removed that the
// JSON would get clobbered by multiple asynchronous writeFile commands,
// especially when
async function writeEventState() {
    return fsp.writeFile(eventDataPath, JSON.stringify(global.eventData, null, 2));
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

async function setGuildTimeZone(guild, timeZone) {
    global.eventData.guildDefaultTimeZones[guild.id] = timeZone;
    return writeEventState();
}

async function setUserTimeZone(user, timeZone) {
    global.eventData.userTimeZones[user.id] = timeZone;
    return writeEventState();
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
            // Convert saved date strings back into Moment datetime objects,
            // and participants into sets
            Object.entries(global.eventData.events).forEach(([guild, events]) => {
                this.upcomingEvents[guild] = events.map(event => ({
                    ...event,
                    due: moment.utc(event.due, moment.ISO_8601, true),
                    participants: new Set(event.participants),
                }));
            });
        }
    }

    async saveState() {
        // Serialize moment datetimes as ISO8601 strings,
        // and participants as arrays
        Object.entries(this.upcomingEvents).forEach(([guild, events]) => {
            if (events.length !== undefined) {
                global.eventData.events[guild] = events.map(event => ({
                    ...event,
                    due: event.due.toISOString(),
                    participants: Array.from(event.participants),
                }));
            }
        });
        return writeEventState();
    }

    start() {
        // Tick immediately at start to do cleanup
        this.tick().then(() => {
            // Ensure we're always at (or close to) the 'top' of a minute when we run our tick
            const topOfMinute = 60000 - (Date.now() % 60000);
            this.timer = this.client.setTimeout(() => {
                this.timer = this.client.setInterval(() => this.tick(), 60000);
                this.tick();
            }, topOfMinute);
        });
    }

    async tick() {
        const now = moment.utc();
        const eventsByGuild = Object.entries(this.upcomingEvents);
        for (const [guild, events] of eventsByGuild) {
            const dueEvents = events.filter(event => event.due.isSameOrBefore(now));
            this.upcomingEvents[guild] = events.filter(event => event.due.isAfter(now));
            await this.saveState();

            if (dueEvents) {
                for (const event of dueEvents) {
                    const eventAge = moment.duration(now.diff(event.due));
                    // Discard events we missed for more than 5 minutes
                    if (eventAge.asMinutes() >= 5) {
                        break;
                    }
                    const destChannel = this.client.channels.get(event.channel);
                    if (!destChannel) {
                        console.log("Got event for unknown channel", event.channel);
                        break;
                    }

                    const pingList = [event.owner, ...event.participants].map(snowflake => `<@${snowflake}>`).join(" ");

                    await destChannel.send(`The event **'${event.name}'** is starting now! ${pingList}`,
                        embedEvent(event, {
                            title: event.name,
                            description: "This event is starting now."
                        }));
                }
            }
        }
    }

    stop() {
        this.client.clearTimeout(this.timer);
        this.client.clearInterval(this.timer);
        this.timer = null;
    }

    async add(event) {
        const guild = event.guild;
        if (!this.upcomingEvents[guild]) {
            this.upcomingEvents[guild] = [];
        }
        this.upcomingEvents[guild].push(event);
        this.upcomingEvents[guild].sort((a, b) => a.due.diff(b.due));
        return this.saveState();
    }

    indexByName(guild, eventName) {
        let lowerEventName = eventName.toLowerCase();
        if (!this.upcomingEvents[guild]) {
            return undefined;
        }

        const index = this.upcomingEvents[guild].findIndex(
            event => event.name.toLowerCase() === lowerEventName
        );

        return index !== -1 ? index : undefined;
    }

    getByName(guild, eventName) {
        const index = this.indexByName(guild, eventName);
        return index !== undefined ? this.upcomingEvents[guild][index] : index;
    }

    async updateByName(guild, eventName, event) {
        const index = this.indexByName(guild, eventName);
        if (index === undefined) {
            return;
        }

        this.upcomingEvents[guild][index] = event;
        await this.saveState();
    }

    async deleteByName(guild, eventName) {
        const index = this.indexByName(guild, eventName);
        if (index === undefined) {
            return;
        }

        this.upcomingEvents[guild].splice(index);
        await this.saveState();
    }

    /**
     * Get the active events for a specified guild.
     *
     * @param guild Snowflake of the Guild to scope events to.
     * @returns Array of events for guild.
     */
    guildEvents(guild) {
        return this.upcomingEvents[guild] || [];
    }

    /**
     * Adds a participant to an event.
     *
     * @param guild Snowflake of the Guild to scope events to.
     * @param user Snowflake of the User to be added to the event.
     * @param eventName Name of the event to be updated.
     * @returns {boolean} Whether the user was added to the event (false if already added).
     */
    async addParticipant(guild, user, eventName) {
        const event = this.getByName(guild, eventName);
        if (!event || event.participants.has(user)) {
            return false;
        }

        event.participants.add(user);

        await this.updateByName(guild, eventName, event);

        return true;
    }

    /**
     * Removes a participant from an event.
     *
     * @param guild Snowflake of the Guild to scope events to.
     * @param user Snowflake of the User to be removed to the event.
     * @param eventName Name of the event to be updated.
     * @returns {boolean} Whether the user was removed from the event (false if not already added).
     */
    async removeParticipant(guild, user, eventName) {
        const event = this.getByName(guild, eventName);
        if (!event || !event.participants.has(user)) {
            return false;
        }

        event.participants.delete(user);

        await this.updateByName(guild, eventName, event);

        return true;
    }
}

let eventManager;

function embedEvent(event, options = {}) {
    const {title, description, forUser} = options;

    const eventEmbed = new Discord.RichEmbed()
        .setTitle(title)
        .setDescription(
            description || `A message will be posted in <#${event.channel}> when this event starts.`
        )
        .addField("Event name", event.name)
        .addField("Creator", `<@${event.owner}>`)
        .addField("Channel", `<#${event.channel}>`)
        .addField("Participants", `${event.participants.size + 1}`)
        .setTimestamp(event.due);

    if (forUser) {
        eventEmbed.addField("Participating?",
            forUser === event.owner || event.participants.has(forUser) ? "Yes" : "No");
    }

    return eventEmbed;
}

async function createCommand(message, args, client) {
    const [date, time, ...nameParts] = args;
    const name = nameParts.join(" ");
    // 1 minute from now
    const timeZone = getUserTimeZone(message);
    const minimumDate = moment.tz(timeZone).add('1', 'minutes');

    if (eventManager.getByName(message.guild.id, name)) {
        return message.channel.send(`An event called '${name}' already exists.`);
    }

    if (!date) {
        return message.channel.send("You must specify a date for the event.");
    }

    if (!time) {
        return message.channel.send("You must specify a time for the event.");
    }

    if (!name) {
        return message.channel.send("You must specify a name for the event.");
    }

    // Process date and time separately for better error handling
    const datePart = moment.tz(date, dateInputFormats, true, timeZone);

    if (!datePart.isValid()) {
        return message.channel.send(
            `The date format used wasn't recognized, or you entered an invalid date. Supported date formats are: ${dateInputFormats.map(date => `\`${date}\``).join(', ')}.`
        );
    }

    const timePart = moment.tz(time, timeInputFormat, true, timeZone);

    if (!timePart.isValid()) {
        return message.channel.send(
            `The time format used wasn't recognized. The supported format is \`${timeInputFormat}\`.`
        );
    }

    const resolvedDate = datePart.set({
        'hour': timePart.hour(),
        'minute': timePart.minute(),
        'second': 0,
        'millisecond': 0
    });

    // Ensure the event is in the future.
    if (resolvedDate.diff(minimumDate) < 0) {
        return message.channel.send("The event must start in the future.");
    }

    const newEvent = {
        due: resolvedDate.utc(),
        name,
        channel: message.channel.id,
        owner: message.author.id,
        guild: message.guild.id,
        participants: new Set(),
    };

    await eventManager.add(newEvent);

    return message.channel.send(
        "Your event has been created.",
        embedEvent(newEvent, {
            title: `New event: ${name}`,
            forUser: message.author.id,
        })
    );
}

async function deleteCommand(message, client, name) {
    if (!name) {
        return message.channel.send(
            "You must specify which event you want to delete."
        );
    }

    const event = eventManager.getByName(message.guild.id, name);
    if (event) {
        if (event.owner !== message.author.id && !message.member.roles.has(config.roleStaff)) {
            return message.channel.send(`Only staff and the event creator can delete an event.`);
        }

        await eventManager.deleteByName(message.guild.id, name);
        return message.channel.send(
            "The event was deleted.",
            embedEvent(event, {
                title: `Deleted event: ${event.name}`
            })
        );
    } else {
        return message.channel.send(`The event '${name}' does not exist.`);
    }
}

async function infoCommand(message, client, name) {
    if (!name) {
        return message.channel.send(
            "You must specify which event you want info on."
        );
    }

    const event = eventManager.getByName(message.guild.id, name);
    if (event) {
        return message.channel.send("", embedEvent(event, {
            title: event.name,
            forUser: message.author.id,
        }));
    } else {
        return message.channel.send(`The event '${name}' does not exist.`);
    }
}

async function listCommand(message, client, timeZone) {
    timeZone = getTimeZoneFromUserInput(timeZone) || getUserTimeZone(message);

    if (!isValidTimeZone(timeZone)) {
        return message.channel.send(
            `'${timeZone}' is an invalid or unknown time zone.`
        );
    }

    const guildUpcomingEvents = eventManager.guildEvents(message.guild.id);

    if (guildUpcomingEvents.length === 0) {
        return message.channel.send("There are no events coming up.");
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
    return message.channel.send("Here are the upcoming events:", embed);
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

    if (!isValidTimeZone(timeZone)) {
        return message.channel.send(
            `'${timeZone}' is an invalid or unknown time zone.`
        );
    }

    await setGuildTimeZone(message.guild.id, timeZone);

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

    if (!isValidTimeZone(timeZone)) {
        return message.channel.send(
            `'${timeZone}' is an invalid or unknown time zone.`
        );
    }

    await setUserTimeZone(message.author, timeZone);

    return message.channel.send(
        `<@${message.author.id}>, your default time zone is now set to **${getTimeZoneCanonicalDisplayName(timeZone)}** (UTC${moment().tz(timeZone).format('Z')}).`
    );
}

async function joinCommand(message, client, eventName) {
    if (!eventName) {
        return message.channel.send(
            `<@${message.author.id}>, you must specify which event you want to join.`
        );
    }

    const event = eventManager.getByName(message.guild.id, eventName);

    if (!event) {
        return message.channel.send(
            `<@${message.author.id}>, the event '${eventName}' does not exist.`
        );
    }

    if (event.owner.id === message.author.id) {
        return message.channel.send(
            `<@${message.author.id}>, you created '${eventName}', so you don't need to join it.`
        );
    }

    const success = await eventManager.addParticipant(message.guild.id, message.author.id, eventName);

    if (success) {
        return message.channel.send(
            `<@${message.author.id}> was successfully added to the event '${eventName}'.`
        );
    } else {
        return message.channel.send(
            `<@${message.author.id}>, you've already joined the event '${eventName}'.`
        );
    }
}

async function leaveCommand(message, client, eventName) {
    if (!eventName) {
        return message.channel.send(
            `<@${message.author.id}>, you must specify which event you want to join.`
        );
    }

    const event = eventManager.getByName(message.guild.id, eventName);

    if (!event) {
        return message.channel.send(
            `<@${message.author.id}>, the event '${eventName}' does not exist.`
        );
    }

    if (event.owner.id === message.author.id) {
        return message.channel.send(
            `<@${message.author.id}>, you created '${eventName}', so you can't leave it.`
        );
    }

    const success = await eventManager.removeParticipant(message.guild.id, message.author.id, eventName);

    if (success) {
        return message.channel.send(
            `<@${message.author.id}> was successfully removed from the event '${eventName}'.`
        );
    } else {
        return message.channel.send(
            `<@${message.author.id}>, you aren't participating in '${eventName}'.`
        );
    }
}

module.exports = {
    name: "event",
    description: "Allows people on a server to participate in events",
    usage: `create [YYYY/MM/DD|MM/DD|today|tomorrow] [HH:mm] [name] to create a new event
${config.prefix}event join [name] to join an event
${config.prefix}event leave [name] to leave an event
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
                return createCommand(message, cmdArgs, client);
            case "delete":
            case "remove":
                return deleteCommand(message, client, cmdArgs.join(" ") || undefined);
            case "join":
                return joinCommand(message, client, cmdArgs.join(" ") || undefined);
            case "leave":
                return leaveCommand(message, client, cmdArgs.join(" ") || undefined);
            case "info":
                return infoCommand(message, client, cmdArgs.join(" "));
            case "list":
                return listCommand(message, client, cmdArgs.join(" ") || undefined);
            case "servertz":
                return servertzCommand(message, client, cmdArgs.join(" "));
            case "tz":
                await tzCommand(message, client, cmdArgs.join(" "));
                return;
            case "":
                return message.channel.send(
                    "You must specify a subcommand. See help for usage."
                );
            default:
                return message.channel.send(
                    `Unknown subcommand '${subcommand}'. See help for usage.`
                );
        }
    },
    init(client) {
        // Ensure the client is ready so that event catch-up doesn't fail
        // due to not knowing about the channel.
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

