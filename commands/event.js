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
const eventDataPath = path.resolve("./events.json");

const DEFAULT_EVENT_DATA = {
  guildDefaultTimeZones: {},
  events: {},
  userTimeZones: {},
  finishedRoles: [],
};

// Events that finished more than this time ago will have their roles deleted
const EVENT_CLEANUP_PERIOD = moment.duration(7, "days");

if (global.eventData == null) {
  if (!fs.existsSync(eventDataPath)) {
    fs.writeFileSync(eventDataPath, JSON.stringify(DEFAULT_EVENT_DATA));
  }
  global.eventData = require(eventDataPath);
}

// We make writing state async because I found in testing
// that it was fairly common when events were removed that the
// JSON would get clobbered by multiple asynchronous writeFile commands,
// especially when completing events
async function writeEventState() {
  return fsp.writeFile(
    eventDataPath,
    JSON.stringify(global.eventData, null, 2),
  );
}

const dateInputFormats = ["YYYY-MM-DD", "YYYY/MM/DD", "MM-DD", "MM/DD"];
const timeInputFormat = "HH:mm";

function getTimeZoneFromUserInput(timeZone) {
  timeZone = timeZone && timeZone.replace(" ", "_");
  return timeZone && (tz.TIMEZONE_CODES[timeZone.toUpperCase()] || timeZone);
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
  /**
   * Create a new EventManager instance.
   *
   * @param client Discord client instance
   */
  constructor(client) {
    this.client = client;
    this.timer = null;
    this.upcomingEvents = {};
    this.rolesPendingPrune = [];

    this.loadState();
  }

  /**
   * Load the state of the EventManager from the global JSON data.
   */
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
    if (global.eventData.finishedRoles) {
      console.log;
      this.rolesPendingPrune = global.eventData.finishedRoles.map(role => ({
        ...role,
        startedAt: moment.utc(role.startedAt, moment.ISO_8601, true),
      }));
    }
  }

  /**
   * Save the state of the EventManager to the global JSON data.
   *
   * @returns {Promise<*>} Resolves when the data file has been written out.
   */
  async saveState() {
    // Serialize moment datetimes as ISO8601 strings
    Object.entries(this.upcomingEvents).forEach(([guild, events]) => {
      if (events.length !== undefined) {
        global.eventData.events[guild] = events.map(event => ({
          ...event,
          due: event.due.toISOString(),
        }));
      }
    });
    global.eventData.finishedRoles = this.rolesPendingPrune.map(role => ({
      ...role,
      startedAt: role.startedAt.toISOString(),
    }));
    return writeEventState();
  }

  /**
   * Start running the timer for recurring EventManager tasks.
   */
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

  /**
   * Perform a single run of the checks for pending scheduled tasks.
   *
   * @returns {Promise<void>} Resolves when the work for this tick is finished.
   */
  async tick() {
    const now = moment.utc();
    const eventsByGuild = Object.entries(this.upcomingEvents);

    for (const [guild, events] of eventsByGuild) {
      const dueEvents = events.filter(event => event.due.isSameOrBefore(now));
      this.upcomingEvents[guild] = events.filter(event =>
        event.due.isAfter(now),
      );
      this.rolesPendingPrune = [
        ...this.rolesPendingPrune,
        ...dueEvents.map(event => ({
          startedAt: event.due,
          guild: event.guild,
          role: event.role,
        })),
      ];
      await this.saveState();

      if (dueEvents) {
        for (const event of dueEvents) {
          const guild = this.client.guilds.cache.get(event.guild);
          const eventAge = moment.duration(now.diff(event.due));
          // Discard events we missed for more than 5 minutes
          if (eventAge.asMinutes() >= 5) {
            break;
          }
          const destChannel = await this.client.channels.fetch(event.channel);
          if (!destChannel) {
            console.log("Got event for unknown channel", event.channel);
            break;
          }

          await destChannel.send(
            `The event **'${event.name}'** is starting now! <@&${event.role}>`,
            embedEvent(event, guild, {
              title: event.name,
              description: "This event is starting now.",
            }),
          );
        }
      }
    }

    const rolesToPrune = this.rolesPendingPrune.filter(
      role => now.diff(role.startedAt) > EVENT_CLEANUP_PERIOD,
    );
    this.rolesPendingPrune = this.rolesPendingPrune.filter(
      role => now.diff(role.startedAt) <= EVENT_CLEANUP_PERIOD,
    );
    await this.saveState();

    for (const roleInfo of rolesToPrune) {
      const guild = this.client.guilds.cache.get(roleInfo.guild);
      const role = guild.roles.cache.get(roleInfo.role);
      if (role) {
        await role.delete(
          `Role removed as event happened ${EVENT_CLEANUP_PERIOD.humanize()} ago`,
        );
      }
      else {
        console.log(
          `Skipping removal of role ${roleInfo.role} from guild ${roleInfo.guild} as it no longer exists`,
        );
      }
    }
  }

  /**
   * Stop running the EventManager timer.
   */
  stop() {
    this.client.clearTimeout(this.timer);
    this.client.clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * Add a new event to the EventManager.
   *
   * @param event The data for the event.
   * @returns {Promise<*>} Resolves once the event has been saved persistently.
   */
  async add(event) {
    const guild = event.guild;
    if (!this.upcomingEvents[guild]) {
      this.upcomingEvents[guild] = [];
    }
    this.upcomingEvents[guild].push(event);
    this.upcomingEvents[guild].sort((a, b) => a.due.diff(b.due));
    return this.saveState();
  }

  _indexByName(guild, eventName) {
    let lowerEventName = eventName.toLowerCase();
    if (!this.upcomingEvents[guild]) {
      return undefined;
    }

    const index = this.upcomingEvents[guild].findIndex(
      event => event.name.toLowerCase() === lowerEventName,
    );

    return index !== -1 ? index : undefined;
  }

  /**
   * Get the event with this name on a specific guild.
   *
   * @param guildId The Snowflake corresponding to the event's guild
   * @param eventName The name of the event to retrieve
   * @returns Event data or undefined
   */
  getByName(guildId, eventName) {
    const index = this._indexByName(guildId, eventName);
    return index !== undefined ? this.upcomingEvents[guildId][index] : index;
  }

  /**
   * Update the event data for a named event on a specific guild
   *
   * @param guildId The Snowflake corresponding to the event's guild
   * @param eventName The name of the event to retrieve
   * @param event The new event data
   * @returns {Promise<boolean>} Resolves with whether the event was updated
   */
  async updateByName(guildId, eventName, event) {
    const index = this._indexByName(guildId, eventName);
    if (index === undefined) {
      return false;
    }

    this.upcomingEvents[guildId][index] = event;
    await this.saveState();
    return true;
  }

  /**
   * Delete a named event on a specific guild
   *
   * @param guildId The Snowflake corresponding to the event's guild
   * @param eventName The name of the event to retrieve
   * @returns {Promise<boolean>} Resolves with whether the event was delete
   */
  async deleteByName(guildId, eventName) {
    const index = this._indexByName(guildId, eventName);
    if (index === undefined) {
      return false;
    }

    this.upcomingEvents[guildId].splice(index);
    await this.saveState();
    return true;
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
   * @param guildId Snowflake of the Guild to scope events to.
   * @param userId Snowflake of the User to be added to the event.
   * @param eventName Name of the event to be updated.
   * @returns {boolean} Whether the user was added to the event (false if already added).
   */
  async addParticipant(guildId, userId, eventName) {
    const event = this.getByName(guildId, eventName);
    if (!event) {
      return false;
    }

    const guild = this.client.guilds.cache.get(guildId);
    const member = guild.members.cache.get(userId);
    await member.roles.add(event.role, "Requested to be added to this event");

    return true;
  }

  /**
   * Removes a participant from an event.
   *
   * @param guildId Snowflake of the Guild to scope events to.
   * @param userId Snowflake of the User to be removed to the event.
   * @param eventName Name of the event to be updated.
   * @returns {boolean} Whether the user was removed from the event (false if not already added).
   */
  async removeParticipant(guildId, userId, eventName) {
    const event = this.getByName(guildId, eventName);
    if (!event) {
      return false;
    }

    const guild = this.client.guilds.cache.get(guildId);
    const member = guild.members.cache.get(userId);
    await member.roles.remove(
      event.role,
      "Requested to be removed from this event",
    );

    return true;
  }
}

let eventManager;

/**
 * Creates a message embed for an event.
 *
 * @param event {object} The event data in question
 * @param guild {module:"discord.js".Guild} The guild object for the guild this event belongs to
 * @param options {object} The options for this embed
 * @returns {module:"discord.js".MessageEmbed} A MessageEmbed with structured info on this event
 */
function embedEvent(event, guild, options = {}) {
  const { title, description, forUser } = options;

  const role = guild && guild.roles.cache.get(event.role);

  const eventEmbed = new Discord.MessageEmbed()
    .setTitle(title)
    .setDescription(
      description ||
        `A message will be posted in <#${event.channel}> when this event starts. ` +
          `You can join this event with '${config.prefix}event join ${event.name}'.`,
    )
    .addField("Event name", event.name)
    .addField("Creator", `<@${event.owner}>`)
    .addField("Channel", `<#${event.channel}>`)
    .addField("Event role", `<@&${event.role}>`)
    .setTimestamp(event.due);

  if (role) {
    eventEmbed.addField("Participants", `${role.members.keyArray().length}`);
    if (forUser) {
      const member = guild.members.cache.get(forUser);
      eventEmbed.addField(
        "Participating?",
        forUser === event.owner || member.roles.cache.has(event.role)
          ? "Yes"
          : "No",
      );
    }
  }

  return eventEmbed;
}

async function createCommand(message, args, client) {
  const [date, time, ...nameParts] = args;
  const name = nameParts.join(" ");
  // 1 minute from now
  const timeZone = getUserTimeZone(message);
  const minimumDate = moment.tz(timeZone).add("1", "minutes");

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
      `The date format used wasn't recognized, or you entered an invalid date. Supported date formats are: ${dateInputFormats
        .map(date => `\`${date}\``)
        .join(", ")}.`,
    );
  }

  const timePart = moment.tz(time, timeInputFormat, true, timeZone);

  if (!timePart.isValid()) {
    return message.channel.send(
      `The time format used wasn't recognized. The supported format is \`${timeInputFormat}\`.`,
    );
  }

  const resolvedDate = datePart.set({
    hour: timePart.hour(),
    minute: timePart.minute(),
    second: 0,
    millisecond: 0,
  });

  // Ensure the event is in the future.
  if (resolvedDate.diff(minimumDate) < 0) {
    return message.channel.send("The event must start in the future.");
  }

  // Create a new role for this event
  let role;
  try {
    role = await message.guild.roles.create({
      data: {
        name: `Event - ${name}`,
        permissions: 0, // Event roles shouldn't grant any inherent permissions
        mentionable: true, // Roles should definitely be mentionable
      },
      reason: `Event role created on behalf of <@${message.author.id}>`,
    });

    // Add the role to the owner.
    const sendingMember = message.guild.members.cache.get(message.author.id);
    await sendingMember.roles.add(role.id, "Created the event for this role");
  }
  catch (e) {
    console.log("Error creating event role:", e);
    return message.channel.send(
      "There was an error creating the role for this event, contact the bot owner.",
    );
  }

  const newEvent = {
    due: resolvedDate.utc(),
    name,
    channel: message.channel.id,
    owner: message.author.id,
    guild: message.guild.id,
    role: role.id,
  };

  await eventManager.add(newEvent);

  return message.channel.send(
    "Your event has been created.",
    embedEvent(newEvent, null, {
      title: `New event: ${name}`,
      forUser: message.author.id,
    }),
  );
}

async function deleteCommand(message, client, name) {
  if (!name) {
    return message.channel.send(
      "You must specify which event you want to delete.",
    );
  }

  const event = eventManager.getByName(message.guild.id, name);
  if (event) {
    if (
      event.owner !== message.author.id &&
      !message.author.roles.has(config.roleStaff)
    ) {
      return message.channel.send(
        `Only staff and the event creator can delete an event.`,
      );
    }

    try {
      const role = await message.guild.roles.fetch(event.role);
      await role.delete(
        `The event for this role was deleted by <@${message.author.id}>.`,
      );
    }
    catch (e) {
      console.log("Error deleting event role:", e);
      return message.channel.send(
        "There was an error deleting the role for this event, contact the bot owner.",
      );
    }

    await eventManager.deleteByName(message.guild.id, name);
    return message.channel.send(
      "The event was deleted.",
      embedEvent(event, message.guild, {
        title: `Deleted event: ${event.name}`,
      }),
    );
  }
  else {
    return message.channel.send(`The event '${name}' does not exist.`);
  }
}

async function infoCommand(message, client, name) {
  if (!name) {
    return message.channel.send(
      "You must specify which event you want info on.",
    );
  }

  const event = eventManager.getByName(message.guild.id, name);
  if (event) {
    return message.channel.send(
      "",
      embedEvent(event, message.guild, {
        title: event.name,
        forUser: message.author.id,
      }),
    );
  }
  else {
    return message.channel.send(`The event '${name}' does not exist.`);
  }
}

async function listCommand(message, client, timeZone) {
  timeZone = getTimeZoneFromUserInput(timeZone) || getUserTimeZone(message);

  if (!isValidTimeZone(timeZone)) {
    return message.channel.send(
      `'${timeZone}' is an invalid or unknown time zone.`,
    );
  }

  const guildUpcomingEvents = eventManager.guildEvents(message.guild.id);

  if (guildUpcomingEvents.length === 0) {
    return message.channel.send("There are no events coming up.");
  }

  const displayLimit = 10;
  const displayAmount = Math.min(guildUpcomingEvents.length, displayLimit);
  const eventList = guildUpcomingEvents
    .slice(0, displayLimit)
    .map(
      (event, i) =>
        `${i + 1}. **${event.name}** (${formatDateCalendar(
          moment(event.due),
          timeZone,
        )}) - in <#${event.channel}>`,
    )
    .join("\n");

  const embed = new Discord.MessageEmbed()
    .setTitle(`Upcoming events in ${message.guild.name}`)
    .setDescription(
      `
        ${
  displayAmount === 1
    ? "There's only one upcoming event."
    : `Next ${displayAmount} events, ordered soonest-first.`
}
        
        ${eventList}`,
    )
    .setFooter(
      `All event times are in ${getTimeZoneCanonicalDisplayName(timeZone)}.` +
        (timeZone
          ? ""
          : " Use !event list [timezone] to show in your time zone."),
    );
  return message.channel.send("Here are the upcoming events:", embed);
}

async function servertzCommand(message, client, timeZone) {
  if (!timeZone) {
    const defaultTimeZone = getGuildTimeZone(message.guild);
    return message.channel.send(
      `The server's default time zone is **${getTimeZoneCanonicalDisplayName(
        defaultTimeZone,
      )}** (UTC${moment()
        .tz(defaultTimeZone)
        .format("Z")}).`,
    );
  }

  if (!message.member.roles.has(config.roleStaff)) {
    return message.channel.send(
      `Only staff can set the server's default timezone.`,
    );
  }

  timeZone = getTimeZoneFromUserInput(timeZone);

  if (!isValidTimeZone(timeZone)) {
    return message.channel.send(
      `'${timeZone}' is an invalid or unknown time zone.`,
    );
  }

  await setGuildTimeZone(message.guild.id, timeZone);

  return message.channel.send(
    `The server's default time zone is now set to **${getTimeZoneCanonicalDisplayName(
      timeZone,
    )}** (UTC${moment()
      .tz(timeZone)
      .format("Z")}).`,
  );
}

async function tzCommand(message, client, timeZone) {
  if (!timeZone) {
    const defaultTimeZone = getUserTimeZone(message);
    return message.channel.send(
      `<@${
        message.author.id
      }>, your default time zone is **${getTimeZoneCanonicalDisplayName(
        defaultTimeZone,
      )}** (UTC${moment()
        .tz(defaultTimeZone)
        .format("Z")}).`,
    );
  }

  timeZone = getTimeZoneFromUserInput(timeZone);

  if (!isValidTimeZone(timeZone)) {
    return message.channel.send(
      `'${timeZone}' is an invalid or unknown time zone.`,
    );
  }

  await setUserTimeZone(message.author, timeZone);

  return message.channel.send(
    `<@${
      message.author.id
    }>, your default time zone is now set to **${getTimeZoneCanonicalDisplayName(
      timeZone,
    )}** (UTC${moment()
      .tz(timeZone)
      .format("Z")}).`,
  );
}

async function joinCommand(message, client, eventName) {
  if (!eventName) {
    return message.channel.send(
      `<@${message.author.id}>, you must specify which event you want to join.`,
    );
  }

  const event = eventManager.getByName(message.guild.id, eventName);

  if (!event) {
    return message.channel.send(
      `<@${message.author.id}>, the event '${eventName}' does not exist.`,
    );
  }

  const success = await eventManager.addParticipant(
    message.guild.id,
    message.author.id,
    eventName,
  );

  if (success) {
    return message.channel.send(
      `<@${message.author.id}> was successfully added to the event '${eventName}'.`,
    );
  }
  else {
    return message.channel.send(
      `<@${message.author.id}>, you've already joined the event '${eventName}'.`,
    );
  }
}

async function leaveCommand(message, client, eventName) {
  if (!eventName) {
    return message.channel.send(
      `<@${message.author.id}>, you must specify which event you want to join.`,
    );
  }

  const event = eventManager.getByName(message.guild.id, eventName);

  if (!event) {
    return message.channel.send(
      `<@${message.author.id}>, the event '${eventName}' does not exist.`,
    );
  }

  const success = await eventManager.removeParticipant(
    message.guild.id,
    message.author.id,
    eventName,
  );

  if (success) {
    if (event.owner === message.author.id) {
      return message.channel.send(
        `<@${message.author.id}>, you've been removed from the event '${eventName}'. As the event creator, ` +
          "you can still delete this event event though you have been removed.",
      );
    }
    else {
      return message.channel.send(
        `<@${message.author.id}>, you've been removed from the event '${eventName}'.`,
      );
    }
  }
  else {
    return message.channel.send(
      `<@${message.author.id}>, you aren't participating in '${eventName}'.`,
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
        "You must specify a subcommand. See help for usage.",
      );
    default:
      return message.channel.send(
        `Unknown subcommand '${subcommand}'. See help for usage.`,
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
      client.on("ready", onReady);
    }
    else {
      onReady();
    }
  },
};
