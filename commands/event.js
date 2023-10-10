// TODO:
// * join events by reacts
// * choose which channel to use in DM
// * recurring events

const Discord = require('discord.js');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const configPath = path.resolve('./config.json');
const config = require(configPath);
const moment = require('moment-timezone');
const tz = require('../extras/timezones');
const eventDataPath = path.resolve('./events.json');
const { promptForMessage, promptYesNo, pkQuery } = require('../extras/common.js');

let eventInfoChannel = null;

const DEFAULT_EVENT_DATA = {
  guildDefaultTimeZones: {},
  events: {},
  userTimeZones: {},
  finishedRoles: [],
  eventInfoMessage: {},
};

// Events that finished more than this time ago will have their roles deleted
const EVENT_CLEANUP_PERIOD = moment.duration(7, 'days');


// Edit this to alter the text of the upcoming events message in the
// event info channel.
const EVENT_MESSAGE_TEMPLATE = ({ events, prefix }) => `\
__**UPCOMING EVENTS**__
All times are displayed in your local timezone for your current device.

Use \`${prefix}event info event name\` to view more about the event, and \
\`${prefix}event join event name\` to be reminded about the event.

${events}
`;

const TZ_MESSAGE_TEMPLATE = ({ tzlist }) => `\
**TIME ZONES**
The current list of time zones for use in the ${config.prefix}event command is as follows. Each maps to a specific locale.  \
Time zone commands such as ${config.prefix}event tz [time zone] can accept either a time zone short code or a locale name - \
Using these will automatically adapt to Daylight Savings Time in your area. You can also use fixed timezones like \`UTC+1\` \
and \`GMT-4\`, but they won't be adjusted for DST. Some time zones have multiple accepted abbreviations separated by \`/\`. \
Additional locale timezones can be found on <https://en.wikipedia.org/wiki/List_of_tz_database_time_zones> under 'TZ database name'.

The supported time zone abbreviations are:

${tzlist}

Please contact staff if your preferred time zone doesn't have an abbreviation on this list!
`;

const discordMomentFullDate = (time) => `<t:${time.unix()}:F>`;
const discordMomentRelativeDate = (time) => `<t:${time.unix()}:R>`;

// Edit this to alter how individual events in the above message
// are displayed.
const EVENT_INFO_TEMPLATE = ({ name, owner, channel, description, due }) => `\
**${name}** (by: <@${owner}> in <#${channel}>)
> - Starts: ${discordMomentFullDate(due)}
> - ${description ? `Description: ${description.replace(/\n/g, '\n> ')}` : ''}\

`;

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

const dateInputFormats = ['YYYY-MM-DD', 'YYYY/MM/DD', 'MM-DD', 'MM/DD'];
const timeInputFormat = 'HH:mm';

function getTimeZoneFromUserInput(timeZone) {
  timeZone = timeZone && timeZone.replace(' ', '_');
  return timeZone && (tz.TIMEZONE_CODES[timeZone.toUpperCase()] || timeZone);
}

function formatDateCalendar(date, timeZone) {
  return date.tz(getTimeZoneFromUserInput(timeZone)).format('llll');
}

function isValidTimeZone(timeZone) {
  return moment.tz(timeZone).tz() !== undefined;
}

function getGuildTimeZone(guild) {
  const guildZone = guild && global.eventData.guildDefaultTimeZones[guild.id];

  // Return a default if none specified (the system time zone)
  return getTimeZoneFromUserInput(guildZone) || moment.tz.guess();
}

function getAuthorTimeZone(message) {
  let userZone = global.eventData.userTimeZones[message.author.id];
  if (userZone == 'server') {
    userZone = undefined;
  }
  return getTimeZoneFromUserInput(userZone) || getGuildTimeZone(message.guild);
}

function getUserTimeZone(user, guild) {
  let userZone = null;
  if (user) {
    userZone = global.eventData.userTimeZones[user.id];
    if (userZone == 'server') {
      userZone = undefined;
    }
  }
  return getTimeZoneFromUserInput(userZone) || getGuildTimeZone(guild);
}

async function setGuildTimeZone(guild, timeZone) {
  global.eventData.guildDefaultTimeZones[guild.id] = timeZone;
  return writeEventState();
}

async function setUserTimeZone(user, timeZone) {
  global.eventData.userTimeZones[user.id] = timeZone;
  return writeEventState();
}

async function deleteUserTimeZone(user) {
  delete global.eventData.userTimeZones[user.id];
  return writeEventState();
}

// Used to make the timezone into the 'canonical' format vs whatever user provided
function getTimeZoneCanonicalDisplayName(timeZone) {
  return moment.tz(getTimeZoneFromUserInput(timeZone)).zoneAbbr();
}

// returns the amount of time between an input date and now (or two input dates) in simple language ("1 day, 2 hours, and 3 minutes")
function getRelativeTime(date1, date2) {
  date1 = moment(date1);
  if (!date2) {
    date2 = moment();
  }
  else {
    date2 = moment(date2);
  }

  let humanized = '';
  let diffMS = date1.diff(date2);
  // console.log(diffMS);
  diffMS = moment.duration(diffMS);
  const minutes = diffMS.minutes();
  const hours = diffMS.hours();
  const days = parseInt(diffMS.asDays());
  if (days > 0) {
    humanized += `${days} ${days == 1 ? 'day' : 'days'}`;
    if (hours > 0 || minutes > 0) {
      humanized += ', ';
    }
  }
  if (hours > 0) {
    humanized += `${hours} ${hours == 1 ? 'hour' : 'hours'}`;
    if (minutes > 0) {
      humanized += ', ';
    }
  }
  if (minutes > 0) {
    humanized += `${minutes} ${minutes == 1 ? 'minutes' : 'minutes'}`;
  }
  return humanized;
}

async function handleUserDateParse(dmChannel, date, time, ampm, timeZone) {
  let datePart;
  switch (date.toLowerCase()) {
  case 'today':
    datePart = moment.tz(moment(), dateInputFormats, true, timeZone);
    break;
  case 'tomorrow':
    datePart = moment.tz(
      moment().add(1, 'd'),
      dateInputFormats,
      true,
      timeZone,
    );
    break;
  default:
    datePart = moment.tz(date, dateInputFormats, true, timeZone);
  }
  const [hours, minutes] = time.split(':');
  time = String(hours).padStart(2, '0') + ':' + minutes;
  const timePart = moment.tz(time, timeInputFormat, true, timeZone);

  if (!datePart.isValid()) {
    dmChannel.send(
      `The date format used wasn't recognized, or you entered an invalid date. Supported date formats are: ${dateInputFormats
        .map((d) => `\`${d}\``)
        .join(', ')}.\n Please try again or type cancel to end event creation.`,
    );
    return false;
  }
  else if (!timePart.isValid()) {
    dmChannel.send(
      'The time format used wasn\'t recognized. Examples of properly formatted time:\n1:00\n01:00\n13:00\n1:00 AM\n1:00 PM\n Please try enter the date and time again or type cancel to give up for now.',
    );
    return false;
  }
  else if (ampm && !['am', 'pm'].includes(ampm.toLowerCase())) {
    dmChannel.send(
      'Please either use 24 hour time or include AM/PM after the time. Please try again or type cancel to give up for now.',
    );
    return false;
  }
  else if (ampm) {
    if (hours !== 12 && ampm.toLowerCase() === 'pm') {
      timePart.add(12, 'h');
    }
    if (hours === 12 && ampm.toLowerCase() === 'am') {
      timePart.subtract(12, 'h');
    }
  }

  return { datePart, timePart };
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
    this.timeZoneInfoMessage = {};
    this.eventInfoMessage = {};
  }

  /**
   * Load the state of the EventManager from the global JSON data.
   */
  async loadState() {
    if (global.eventData.events) {
      // Convert saved date strings back into Moment datetime objects
      Object.entries(global.eventData.events).forEach(([guild, events]) => {
        this.upcomingEvents[guild] = events.map((event) => ({
          ...event,
          due: moment.utc(event.due, moment.ISO_8601, true),
        }));
      });
    }
    if (global.eventData.finishedRoles) {
      this.rolesPendingPrune = global.eventData.finishedRoles.map((role) => ({
        ...role,
        startedAt: moment.utc(role.startedAt, moment.ISO_8601, true),
      }));
    }
    if (global.eventData.timeZoneInfoMessage) {
      await Promise.all(
        Object.entries(global.eventData.timeZoneInfoMessage).map(
          async ([guild, messageId]) => {
            if (eventInfoChannel) {
              const message = await eventInfoChannel.messages
                .fetch(messageId)
                .catch((e) =>
                  console.error('Failed to load time zone info message', e),
                );

              if (message) {
                this.timeZoneInfoMessage[guild] = message;
                console.log('Loaded time zone message', message.id);
              }
              else {
                console.log(
                  `Time zone info message ${messageId} could not be found for guild ${guild}`,
                );
              }
            }
          },
        ),
      );
    }
    if (global.eventData.eventInfoMessage) {
      await Promise.all(
        Object.entries(global.eventData.eventInfoMessage).map(
          async ([guild, messageId]) => {
            if (eventInfoChannel) {
              const message = await eventInfoChannel.messages
                .fetch(messageId)
                .catch((e) =>
                  console.error('Failed to load event info message', e),
                );

              if (message) {
                this.eventInfoMessage[guild] = message;
                console.log('Loaded event message', message.id);
              }
              else {
                console.log(
                  `Event info message ${messageId} could not be found for guild ${guild}`,
                );
              }
            }
          },
        ),
      );
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
        global.eventData.events[guild] = events.map((event) => ({
          ...event,
          due: event.due.toISOString(),
        }));
      }
    });
    global.eventData.finishedRoles = this.rolesPendingPrune.map((role) => ({
      ...role,
      startedAt: role.startedAt.toISOString(),
    }));

    if (global.eventData.eventInfoMessage === undefined) {
      global.eventData.eventInfoMessage = {};
    }
    Object.entries(this.eventInfoMessage).forEach(([guild, message]) => {
      global.eventData.eventInfoMessage[guild] = message.id;
    });

    if (global.eventData.timeZoneInfoMessage === undefined) {
      global.eventData.timeZoneInfoMessage = {};
    }
    Object.entries(this.timeZoneInfoMessage).forEach(([guild, message]) => {
      global.eventData.timeZoneInfoMessage[guild] = message.id;
    });

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
      this.timer = setTimeout(() => {
        this.timer = setInterval(() => this.tick(), 60000);
        this.tick();
      }, topOfMinute);
    });
    // update time zone posts in case list of time zones has changed.
    if (config.eventInfoChannelId) {
      this.client.guilds.cache.forEach((g) => {
        this.updateTZPost(g.id);
      });
    }
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
      const dueEvents = events.filter((event) => event.due.isSameOrBefore(now));
      this.upcomingEvents[guild] = events.filter((event) =>
        event.due.isAfter(now),
      );
      this.rolesPendingPrune = [
        ...this.rolesPendingPrune,
        ...dueEvents.map((event) => ({
          startedAt: event.due,
          guild: event.guild,
          role: event.role,
        })),
      ];
      await this.saveState();

      if (dueEvents.length > 0) {
        for (const event of dueEvents) {
          const guild = this.client.guilds.cache.get(event.guild);
          const eventAge = moment.duration(now.diff(event.due));
          // Discard events we missed for more than 5 minutes
          if (eventAge.asMinutes() >= 5) {
            break;
          }
          const destChannel = await this.client.channels.fetch(event.channel);
          if (!destChannel) {
            console.log('Got event for unknown channel', event.channel);
            break;
          }

          await destChannel.send(
            `The event **'${event.name}'** is starting now! <@&${event.role}>`,
            embedEvent(event, guild, {
              title: event.name,
              description: 'This event is starting now.',
            }),
          );
        }
      }

      // Post/update the event info message if necessary
      if (
        dueEvents.length > 0 ||
        (eventInfoChannel && !this.eventInfoMessage[guild])
      ) {
        await this.updateUpcomingEventsPost(guild);
      }
    }

    const rolesToPrune = this.rolesPendingPrune.filter(
      (role) => now.diff(role.startedAt) > EVENT_CLEANUP_PERIOD,
    );
    this.rolesPendingPrune = this.rolesPendingPrune.filter(
      (role) => now.diff(role.startedAt) <= EVENT_CLEANUP_PERIOD,
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
    await this.updateUpcomingEventsPost(guild);
    return this.saveState();
  }

  _indexByName(guild, eventName) {
    const lowerEventName = eventName.toLowerCase();
    if (!this.upcomingEvents[guild]) {
      return undefined;
    }

    const index = this.upcomingEvents[guild].findIndex(
      (event) => event.name.toLowerCase() === lowerEventName,
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

    this.upcomingEvents[guildId].splice(index, 1);
    await this.updateUpcomingEventsPost(guildId);
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
    await member.roles.add(event.role, 'Requested to be added to this event');

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
      'Requested to be removed from this event',
    );

    return true;
  }

  /**
   * Updates the guild's time zone post. Only runs at start, in case any time zones have been added.
   *
   * @param guildId Snowflake of the Guild to update the event post for
   * @returns {Promise<void>} Resolves when post update complete.
   */

  async updateTZPost(guildId) {
    const guild = this.client.guilds.cache.get(guildId);
    const tzMessage = this.timeZoneInfoMessage[guildId];

    const tzTemplateParams = {
      tzlist: tz.LOCAL_TIMEZONES.map(({ name, abbr, dstAbbr }) => {
        // Show DST and standard abbreviation together, where needed
        const tzAbbrs = dstAbbr ? `${abbr}/${dstAbbr}` : abbr;

        return `${tzAbbrs} - ${name}`;
      }).join('\n'),
    };

    if (eventInfoChannel) {
      if (!guild.channels.cache.has(eventInfoChannel.id)) {
        return;
      }
    }

    if (tzMessage) {
      console.log('found time zone message', tzMessage.id);
      await tzMessage.edit(TZ_MESSAGE_TEMPLATE(tzTemplateParams));
    }
    else {
      console.log(
        `No time zone info message found for guild ${guildId}, send a new one.`,
      );
      const newMessage = await eventInfoChannel.send(
        TZ_MESSAGE_TEMPLATE(tzTemplateParams),
      );
      this.timeZoneInfoMessage[guildId] = newMessage;
      await this.saveState();
    }
  }

  /**
   * Updates the guild's post for upcoming event if applicable.
   *
   * @param guildId Snowflake of the Guild to update the event post for
   * @returns {Promise<void>} Resolves when post update complete.
   */
  async updateUpcomingEventsPost(guildId) {
    const guild = this.client.guilds.cache.get(guildId);
    const events = this.guildEvents(guildId);
    const message = this.eventInfoMessage[guildId];
    const defaultTimeZone = getGuildTimeZone(guild);

    const upcomingEventsInfoText = events.map((event) =>
      EVENT_INFO_TEMPLATE({ ...event, due: event.due.tz(defaultTimeZone) }),
    );

    const templateParams = {
      events:
        upcomingEventsInfoText.length > 0
          ? upcomingEventsInfoText.join('\n')
          : 'No upcoming events.',
      prefix: config.prefix,
    };

    if (eventInfoChannel) {
      // We only support one eventinfochannel for now
      if (!guild.channels.cache.has(eventInfoChannel.id)) {
        console.log(`No event info channel for guild ${guildId}, skip.`);
        return;
      }

      if (message) {
        console.log('Updating events message ', message.id);
        await message.edit(EVENT_MESSAGE_TEMPLATE(templateParams));
        await message.channel.send('.').then((msg) => {
          msg.delete({ timeout: 100 });
        });
        // await message.delete();
        // global.eventData.guildDefaultTimeZones[guild.id];
      }
      else {
        console.log(
          `No event info message found for guild ${guildId}, send a new one.`,
        );
        const newMessage = await eventInfoChannel.send(
          EVENT_MESSAGE_TEMPLATE(templateParams),
        );
        this.eventInfoMessage[guildId] = newMessage;
        await this.saveState();
      }
    }
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
  const { title, description, forUser, firstRun } = options;
  let member;
  if (forUser) {
    member = guild.members.cache.get(forUser.id);
  }
  let userTimeZone = false;
  if (
    forUser &&
    global.eventData.userTimeZones[forUser.id] &&
    global.eventData.userTimeZones[forUser.id] != 'server'
  ) {
    userTimeZone = getUserTimeZone(forUser, guild);
  }

  const role = guild && guild.roles.cache.get(event.role);

  const eventEmbed = new Discord.MessageEmbed()
    .setTitle(title)
    .setDescription(
      description ||
        `A message will be posted in <#${event.channel}> when this event starts. ` +
          `You can join this event with '${config.prefix}event join ${event.name}'.`,
    )
    .addFields([{ name: 'Event name', value: event.name },
      { name: 'Starts at (your time)', value:
      `${discordMomentFullDate(event.due)} ${
        getRelativeTime(event.due) != ''
          ? `(${discordMomentRelativeDate(event.due)})`
          : '(starting now)'
      }`,
      inline: true }],
    );
  if (userTimeZone) {
    eventEmbed.addField(
      `Starts at (${
        member.nickname ? member.nickname : member.user.username
      } time)`,
      `${formatDateCalendar(
        moment(event.due),
        userTimeZone,
      )} ${getTimeZoneCanonicalDisplayName(userTimeZone)}`,
      true,
    );
  }
  eventEmbed
    .addField([{ name: 'Creator', value: `<@${event.owner}>` },
      { name:'Channel', value:`<#${event.channel}>` },
      { name:'Event role', value:`<@&${event.role}>` }]);
  if (event.description) {
    eventEmbed.addFields({ name: 'Description', value: event.description });
  }

  if (role && !firstRun) {
    eventEmbed.addFields({ name: 'Participants', value:`${role.members.keyArray().length}` });
    if (forUser) {
      eventEmbed.addFields({
        name: `Have you (${member.nickname ? member.nickname : member.user.username}) RSVPed?`,
        value: forUser === event.owner || member.roles.cache.has(event.role) ? 'Yes' : 'No',
      });
    }
  }

  return eventEmbed;
}

// version of embedEvent modified for the DM session during event creation.
function DMembedEvent(event, guild, options = {}) {
  // formatDateCalendar(moment(event.due), timeZone)
  const { title, description, forUser } = options;
  // const owner = ;
  const timeZone = getUserTimeZone(forUser, guild);
  const eventEmbed = new Discord.MessageEmbed()
    .setTitle(title)
    .setDescription(
      description ||
        `A message will be posted in <#${event.channel}> when this event starts. ` +
          `Users can join this event with '${config.prefix}event join ${event.name}'.`,
    )
    .addFields([{ name: 'Event name', value: event.name },
      { name: 'Event time',
        value: `${discordMomentFullDate(event.due)}`,
        inline: true },
      { name:'Creator', value:`<@${event.owner}>` },
      { name:'Channel', value:`<#${event.channel}>` }],
    )
    .setTimestamp(event.due.toISOString());
  if (event.description) {
    eventEmbed.addFields({ name: 'Description', value: event.description });
  }
  eventEmbed.addFields({ name: 'Event role', value: `@Event - ${event.name}` });
  return eventEmbed;
}

async function editCommand(message, client, name) {
  const guildmember = message.guild.members.cache.get(message.author);
  if (!name) {
    return message.channel.send(
      'You must specify which event you want to edit.',
    );
  }

  const event = eventManager.getByName(message.guild.id, name);
  if (!event) {
    return message.channel.send(`The event '${name}' does not exist.`);
  }

  if (
    event.owner !== message.author.id &&
    !guildmember.roles.cache.has(config.roleStaff)
  ) {
    return message.channel.send(
      'Only staff and the event creator can edit an event.',
    );
  }
  const timeZone = getAuthorTimeZone(message);
  const dmChannel = await message.author.createDM();
  dmChannel.send(
    `Just a reminder that all dates and times are set for the **${getTimeZoneCanonicalDisplayName(
      timeZone,
    )}** time zone. This is ${
      global.eventData.userTimeZones[message.author.id] == 'server' ||
      !global.eventData.userTimeZones[message.author.id]
        ? 'the server time zone, and not set by you.'
        : 'the time zone you set.'
    }`,
  );
  const minimumDate = moment.tz(timeZone).add('1', 'minutes');

  // Prompt for new event name
  dmChannel.send(
    'Would you like to update the name for this event? **Y/N**\n *You can reply \'cancel\' without quotes at any time to end this wizard without editing the event.\nPlease note that you have 3 minutes to answer each of these questions; The timer resets for each question',
  );
  let result = await promptYesNo(dmChannel, {
    messages: {
      cancel:
        'Event edit cancelled. Please run the command again to edit an event.',
      invalid:
        'Reply not recognized! Please answer Y or N. Would you like to update the name for this event? **Y/N**',
    },
  });
  if (!result) return false;
  let renamed = false;
  let editing = result.answer;
  if (editing) {
    dmChannel.send('What should the new name for the event be?');
  }
  while (editing) {
    result = await promptForMessage(dmChannel, async (reply) => {
      let eventData;
      const content = reply.content.trim();
      if (content.toLowerCase() === 'cancel') {
        dmChannel.send(
          `Event creation cancelled. Please run ${config.prefix}event again to initiate event creation again.`,
        );
        return 'abort';
      }
      eventData.name = content.replace(/["_\*>`\n]/g, '');
      if (eventManager.getByName(message.guild.id, eventData.name)) {
        dmChannel.send(
          `An event called '${eventData.name}' already exists. Please enter a different name.`,
        );
        return 'retry';
      }
      else {
        return { name: eventData.name };
      }
    });
    if (!result) return false;
    const newName = result.name;
    dmChannel.send(
      `Great, **${event.name}** will be renamed to **${newName}**. Is this OK? **Y/N**`,
    );
    result = await promptYesNo(dmChannel, {
      messages: {
        yes: `OK, your event is now called ${newName}.`,
        no: 'OK, please type a new name for the event.',
        cancel:
          'Event edit cancelled. Please run the command again to edit an event.',
        invalid: `Reply not recognized! Please answer Y or N. **${event.name}** will be renamed to **${newName}**. Is this OK? **Y/N**`,
      },
    });
    if (!result) return false;
    editing = !result.answer;
    if (result.answer) {
      event.name = newName;
      renamed = true;
    }
  }

  // Prompt for new event date
  dmChannel.send(
    'Would you like to set a new date or time for this event? **Y/N**',
  );
  result = await promptYesNo(dmChannel, {
    messages: {
      cancel:
        'Event edit cancelled. Please run the command again to edit an event.',
      invalid:
        'Reply not recognized! Please answer Y or N. Would you like to set a new date or time for this event? **Y/N**',
    },
  });
  if (!result) return false;
  editing = result.answer;
  if (editing) {
    dmChannel.send(
      `What date and time would you like to change the event to? Please use the format: [Date] [HH:mm] [AM/PM] (AM/PM are optional).\nValid date formats are: YYYY/MM/DD, MM/DD, today, or tomorrow.\n Currently, ${
        event.name
      } is set to occur at ${formatDateCalendar(
        moment(event.due),
        timeZone,
      )} ${getTimeZoneCanonicalDisplayName(timeZone)}`,
    );
  }
  while (editing) {
    result = await promptForMessage(dmChannel, async (reply) => {
      const content = reply.content.trim();
      if (content.toLowerCase() === 'cancel') {
        dmChannel.send(
          'Event edit cancelled. Please run the command again to edit an event.',
        );
        return 'abort';
      }
      const [date, time, ampm] = content.split(' ');
      // handle special date formats.
      if (!time) {
        dmChannel.send(
          'Please include a time, separated by a space from the date.  You can enter the time in 24 hour format, or with AM/PM separated by a space.\nPlease try again or type cancel to end event edit.',
        );
        return 'retry';
      }
      const dateParseRes = await handleUserDateParse(
        dmChannel,
        date,
        time,
        ampm,
        timeZone,
      );
      if (!dateParseRes) return 'retry';
      const { datePart, timePart } = dateParseRes;

      if (!datePart.isValid()) {
        dmChannel.send(
          'There was a problem with the format of your date. Please try again or type cancel to end.',
        );
        return 'retry';
      }
      else if (!timePart.isValid()) {
        dmChannel.send(
          'There was a problem with the format of your time. Please try again or type cancel to end.',
        );
        return 'retry';
      }

      const resolvedDate = datePart.set({
        hour: timePart.hour(),
        minute: timePart.minute(),
        second: 0,
        millisecond: 0,
      });

      // Ensure the event is in the future.
      if (resolvedDate && resolvedDate.diff(minimumDate) < 0) {
        dmChannel.send(
          'The event must start in the future. Please try again or type cancel to end.',
        );
        return 'retry';
      }

      return { resolvedDate };
    });
    if (!result) return false;
    const { resolvedDate } = result;
    const d = resolvedDate.utc();
    dmChannel.send(
      `Great, **${
        event.name
      }** will be updated to occur at ${formatDateCalendar(
        moment(d),
        timeZone,
      )} ${getTimeZoneCanonicalDisplayName(timeZone)}. Is this OK? **Y/N**`,
    );

    result = await promptYesNo(dmChannel, {
      messages: {
        yes: 'OK, great.',
        no: 'OK, please type a new date and time for the event.',
        cancel:
          'Event edit cancelled. Please run the command again to edit an event.',
        invalid: `Reply not recognized! Please answer Y or N. is ${formatDateCalendar(
          moment(d),
          timeZone,
        )} ${getTimeZoneCanonicalDisplayName(
          timeZone,
        )} an acceptable date and time for the event? **Y/N**`,
      },
    });
    if (!result) return false;
    editing = !result.answer;
    if (result.answer) {
      event.due = d;
    }
  }

  dmChannel.send(
    'Would you like to change the description for this event? **Y/N**',
  );

  result = await promptYesNo(dmChannel, {
    messages: {
      yes:
        'Great! Please enter new a description for the event. It\'s best to keep this short, 2-3 sentences max. You can type \'none\' if you want to remove the description.',
      no: 'OK, no description.',
      cancel: 'Event edit cancelled. Please run the command again to edit an event.',
      invalid:
        'Reply not recognized! Please answer Y or N. Would you like to change the description for this event? **Y/N**',
    },
  });
  if (!result) return false;
  editing = result.answer;

  while (editing) {
    result = await promptForMessage(dmChannel, async (reply) => {
      const description = reply.content.trim().replace(/["_\*>`]/g, '');
      switch (description.toLowerCase()) {
      case 'cancel':
        dmChannel.send(
          'Event edit cancelled. Please run the command again to edit an event.',
        );
        return 'abort';
      case 'none':
        dmChannel.send('OK, no description. Is this OK? **Y/N**');
        return { description: undefined };
      case false:
        return 'retry';
      default:
        dmChannel.send(
          `Great,\n> ${description.replace(
            /\n/g,
            '\n> ',
          )}\nwill be the description of your event. Is this OK? **Y/N**`,
        );
        return { description };
      }
    });
    if (!result) return false;
    const { description } = result;
    // Confirm the description is okay
    result = await promptYesNo(dmChannel, {
      messages: {
        no: 'OK, please type a new description, or \'none\' for no description.',
        cancel: 'Event edit cancelled. Please run the command again to edit an event.',
        invalid: description === undefined ?
          'Reply not recognized! Please answer Y or N. Do you want to have no description for your event? **Y/N**'
          : `Reply not recognized! Please answer Y or N. Are you happy with your new description *${description}*? **Y/N**`,
      },
    });
    if (!result) return false;
    editing = !result.answer;
    if (result.answer) {
      event.description = description;
    }
  }

  dmChannel.send('Great! Here\'s your updated event:');
  dmChannel.send(
    DMembedEvent(event, message.guild, {
      title: `Event has changed: ${event.name}`,
      forUser: message.author,
    }),
  );
  dmChannel.send('Does this look OK? **Y/N**');
  result = await promptYesNo(dmChannel, {
    messages: {
      yes: `Perfect. I'll post the updated event in <#${event.channel}> now.`,
      no:
        'OK. For now you will have to re-run the command in the server to restart editing.',
      cancel:
        'Event edit cancelled. Please run the command again to edit an event.',
      invalid:
        'Reply not recognized! Please answer Y or N. Is the updated event data I posted above acceptable? **Y/N**',
    },
  });
  if (!result || !result.answer) return false;

  await eventManager.updateUpcomingEventsPost(message.guild.id);
  await message.channel.send(
    embedEvent(event, message.guild, {
      title: `Event has changed: ${event.name}`,
      forUser: message.author,
    }),
  );

  if (renamed) {
    try {
      const role = await message.guild.roles.fetch(event.role);
      await role.edit({
        name: `Event - ${event.name}`,
        // Event roles shouldn't grant any inherent permissions
        permissions: 0,
        // Event roles should definitely be mentionable
        mentionable: true,
      }, `Event was renamed by ${message.author.tag}`);
    }
    catch (e) {
      console.log('Error updating event role:', e);
      return message.channel.send(
        'The event role couldn\'t be renamed, contact the bot owner.',
      );
    }
  }
}

async function deleteCommand(message, client, name) {
  const guildmember = message.guild.members.cache.get(message.author);
  if (!name) {
    return message.channel.send(
      'You must specify which event you want to delete.',
    );
  }

  const event = eventManager.getByName(message.guild.id, name);
  if (event) {
    if (
      event.owner !== message.author.id &&
      !guildmember.roles.cache.has(config.roleStaff)
    ) {
      return message.channel.send(
        'Only staff and the event creator can delete an event.',
      );
    }

    try {
      const role = await message.guild.roles.fetch(event.role);
      await role.delete(
        `The event for this role was deleted by <@${message.author.id}>.`,
      );
    }
    catch (e) {
      console.log('Error deleting event role:', e);
      return message.channel.send(
        'There was an error deleting the role for this event, contact the bot owner.',
      );
    }

    await eventManager.deleteByName(message.guild.id, name);
    return message.channel.send(
      'The event was deleted.',
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
      'You must specify which event you want info on.',
    );
  }

  const event = eventManager.getByName(message.guild.id, name);
  if (event) {
    return message.channel.send(
      '',
      embedEvent(event, message.guild, {
        title: event.name,
        forUser: message.author,
      }),
    );
  }
  else {
    return message.channel.send(`The event '${name}' does not exist.`);
  }
}

async function listCommand(message, client, timeZone) {
  timeZone = getTimeZoneFromUserInput(timeZone) || getAuthorTimeZone(message);

  if (!isValidTimeZone(timeZone)) {
    return message.channel.send(
      `'${timeZone}' is an invalid or unknown time zone.`,
    );
  }

  const guildUpcomingEvents = eventManager.guildEvents(message.guild.id);

  if (guildUpcomingEvents.length === 0) {
    return message.channel.send('There are no events coming up.');
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
    .join('\n');

  const embed = new Discord.MessageEmbed()
    .setTitle(`Upcoming events in ${message.guild.name}`)
    .setDescription(
      `
        ${
  displayAmount === 1
    ? 'There\'s only one upcoming event.'
    : `Next ${displayAmount} events, ordered soonest-first.`
}
        
        ${eventList}`,
    )
    .setFooter(
      { text:`All event times are in ${getTimeZoneCanonicalDisplayName(timeZone)}. ${timeZone ? '' : ` Use ${config.prefix}event list [timezone] to show in a different time zone.`}` },
    );

  return message.channel.send({ content: 'Here are the upcoming events:', embeds: [embed] });
}

async function servertzCommand(message, client, timeZone) {
  const member = message.guild.members.cache.get(message.author);
  if (!timeZone) {
    const defaultTimeZone = getGuildTimeZone(message.guild);
    return message.channel.send(
      `The server's default time zone is **${getTimeZoneCanonicalDisplayName(
        defaultTimeZone,
      )}** (UTC${moment().tz(defaultTimeZone).format('Z')}).`,
    );
  }

  if (!member.roles.cache.has(config.roleStaff)) {
    return message.channel.send(
      'Only staff can set the server\'s default timezone.',
    );
  }

  timeZone = getTimeZoneFromUserInput(timeZone);

  if (!isValidTimeZone(timeZone)) {
    return message.channel.send(
      `'${timeZone}' is an invalid or unknown time zone.`,
    );
  }

  await setGuildTimeZone(message.guild, timeZone);

  return message.channel.send(
    `The server's default time zone is now set to **${getTimeZoneCanonicalDisplayName(
      timeZone,
    )}** (UTC${moment().tz(timeZone).format('Z')}).`,
  );
}

async function tzCommand(message, client, timeZone) {
  if (!timeZone) {
    const defaultTimeZone = getAuthorTimeZone(message);
    return message.author.send(
      `<@${
        message.author.id
      }>, your default time zone is **${getTimeZoneCanonicalDisplayName(
        defaultTimeZone,
      )}** (UTC${moment().tz(defaultTimeZone).format('Z')}).`,
    );
  }

  if (
    timeZone.toLowerCase() == 'delete' ||
    timeZone.toLowerCase() == 'remove'
  ) {
    await deleteUserTimeZone(message.author);
    return message.author.send('Your time zone data has been purged.');
  }

  timeZone = getTimeZoneFromUserInput(timeZone);

  if (!isValidTimeZone(timeZone)) {
    return message.author.send(
      `'${timeZone}' is an invalid or unknown time zone. You may safely delete your message calling this command.`,
    );
  }

  await setUserTimeZone(message.author, timeZone);

  return message.author.send(
    `Your default time zone is now set to **${getTimeZoneCanonicalDisplayName(
      timeZone,
    )}** (UTC${moment()
      .tz(timeZone)
      .format('Z')}). You may safely delete your message calling this command.`,
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
          'you can still delete this event event though you have been removed.',
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

async function updateInfoPostCommand(message) {
  const member = message.guild.members.cache.get(message.author);
  if (!member.roles.cache.has(config.roleStaff)) {
    return message.channel.send(
      'Only staff can force the event info to be updated.',
    );
  }

  try {
    await eventManager.updateUpcomingEventsPost(message.guild.id);
    return message.channel.send(
      `<@${message.author.id}>, the post has been updated.`,
    );
  }
  catch (e) {
    console.log('Unable to update upcoming events post:', e);
    return message.channel.send(
      `<@${message.author.id}>, there was an error updating the post, check the logs.`,
    );
  }
}

// function to create a message collector after recieving a message.
async function msgCollector(message) {
  // let responses = 0;
  let reply = false;
  // create a filter to ensure output is only accepted from the author who initiated the command.
  const filter = (input) => input.author.id === message.author.id;
  await message.channel
    .awaitMessages(filter, { max: 1, time: 30000, errors: ['time'] })
    // this method creates a collection; since there is only one entry we get the data from collected.first
    .then((collected) => (reply = collected.first()))
    .catch((collected) =>
      message.channel.send(
        'Sorry, I waited 30 seconds with no response, please run the command again.',
      ),
    );
  // console.log('Reply processed...');
  return reply;
}

async function createWizard(message, channel) {
  let eventData = {};
  let result;
  const dmChannel = await message.author.createDM();
  // TODO if/then statement to check if it's the first time the user has done this (global.eventData.userTimeZones[message.author.id]) then run the user through setting their time zone or just using the server zone.
  // Note to self: setting the user's timeZone to "server" should tell this routine to use the server time zone without storing any time zone in the system.
  if (!global.eventData.userTimeZones[message.author.id]) {
    dmChannel.send(
      `Before we get started, it looks like you don't have a time zone set on file. Would you like to add one now? **Y/N**\n\n**PLEASE NOTE** this will store your userID and time zone on file (this data will be deleted if you leave the server). If you are not comfortable with this, say **N** and you will not be asked again, but all events you create will be in the server time zone (currently **${getTimeZoneCanonicalDisplayName(
        getGuildTimeZone(message.guild),
      )}**, but staff can change this setting at any time.) No matter what you elect to do, you can still change it at a later date with the ${
        config.prefix
      }event tz command. You may also type 'cancel' to quit event creation entirely; no data is stored in this case.`,
    );
    result = await promptYesNo(dmChannel, {
      messages: {
        yes: 'OK. Please provide a time zone.',
        no: `OK, no problem. Going forward, all time zones will use the server time zone. Again, this is currently **${getTimeZoneCanonicalDisplayName(
          getGuildTimeZone(message.guild),
        )}**`,
        cancel: `Event creation cancelled. Please run ${config.prefix}event create again to initiate event creation again.`,
        invalid: 'Reply not recognized! Please answer Y or N.',
      },
    });
    if (!result.answer) {
      await setUserTimeZone(message.author, 'server');
    }
    else {
      result = await promptForMessage(dmChannel, async (reply) => {
        const content = reply.content.trim();
        if (content === 'cancel') {
          await setUserTimeZone(message.author, 'server');
          return 'abort';
        }
        else {
          const usrTZ = getTimeZoneFromUserInput(reply.content);
          if (!isValidTimeZone(usrTZ)) {
            message.author.send(
              `'${usrTZ}' is an invalid or unknown time zone. Please try again, or type 'cancel' to set your time zone to match the server's time zone.`,
            );
            return 'retry';
          }
          else {
            await setUserTimeZone(message.author, usrTZ);
            dmChannel.send(
              `OK, your time zone is now set to **${getTimeZoneCanonicalDisplayName(
                usrTZ,
              )}**.`,
            );
            return { set: true };
          }
        }
      });
      if (!result) return false;
    }
  }
  else {
    const usrTZ = getAuthorTimeZone(message);
    dmChannel.send(
      `Just a reminder that all dates and times are set for the **${getTimeZoneCanonicalDisplayName(
        usrTZ,
      )}** time zone. This is ${
        global.eventData.userTimeZones[message.author.id] === 'server'
          ? 'the server time zone, and not set by you.'
          : 'the time zone you set.'
      }`,
    );
  }
  const timeZone = getAuthorTimeZone(message);
  const minimumDate = moment.tz(timeZone).add('1', 'minutes');
  dmChannel.send(
    'First, I\'ll need a name for the event. What would you like to call it?\n *You can reply \'cancel\' without quotes at any time to end this wizard without creating an event.\nPlease note that you have 3 minutes to answer each of these questions; The timer resets for each question.',
  );
  result = await promptForMessage(dmChannel, async (reply) => {
    const content = reply.content.trim();
    if (content.toLowerCase() === 'cancel') {
      dmChannel.send(
        `Event creation cancelled. Please run ${config.prefix}event again to initiate event creation again.`,
      );
      return 'abort';
    }
    eventData.name = content.replace(/["_\*>`\n]/g, '');
    if (eventManager.getByName(message.guild.id, eventData.name)) {
      dmChannel.send(
        `An event called '${eventData.name}' already exists. Please enter a different name.`,
      );
      return 'retry';
    }
    else {
      return { name: eventData.name };
    }
  });
  if (!result) return false;
  dmChannel.send(
    `OK, an event called **${eventData.name}**.\nNext, I need a date and time for the event, like so: [Date] [HH:mm] [AM/PM] (AM/PM are optional).\nValid date formats are: YYYY/MM/DD, MM/DD, today, or tomorrow.`,
  );
  let settingDate = true;
  let resolvedDate;
  while (settingDate) {
    result = await promptForMessage(dmChannel, async (reply) => {
      const content = reply.content.trim();
      if (content.toLowerCase() === 'cancel') {
        dmChannel.send(
          `Event creation cancelled. Please run ${config.prefix}event again to initiate event creation again.`,
        );
        return 'abort';
      }
      let [date, time, ampm] = reply.content.split(' ');
      // handle special date formats.
      if (!time) {
        dmChannel.send(
          'Please include a time, separated by a space from the date.  You can enter the time in 24 hour format, or with AM/PM separated by a space.\nPlease try again or type cancel to end event creation.',
        );
        return 'retry';
      }
      const dateParseRes = await handleUserDateParse(
        dmChannel,
        date,
        time,
        ampm,
        timeZone,
      );
      if (!dateParseRes) return 'retry';
      const { datePart, timePart } = dateParseRes;

      if (!datePart.isValid()) {
        dmChannel.send(
          'There was a problem with the format of your date. Please try again or type cancel to end.',
        );
        return 'retry';
      }
      else if (!timePart.isValid()) {
        dmChannel.send(
          'There was a problem with the format of your time. Please try again or type cancel to end.',
        );
        return 'retry';
      }

      const resolvedDate = datePart.set({
        hour: timePart.hour(),
        minute: timePart.minute(),
        second: 0,
        millisecond: 0,
      });

      // Ensure the event is in the future.
      if (resolvedDate && resolvedDate.diff(minimumDate) < 0) {
        dmChannel.send(
          'The event must start in the future. Please try again or type cancel to end.',
        );
        return 'retry';
      }

      return { resolvedDate };
    });

    if (!result) return false;
    console.log(result);
    resolvedDate = result.resolvedDate;
    const d = resolvedDate.utc();
    const options = {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      timeZone: timeZone,
      timeZoneName: 'short',
    };

    dmChannel.send(
      `Great, **${eventData.name}** will happen on ${discordMomentFullDate(d)}. Is this OK? **Y/N**`,
    );

    result = await promptYesNo(dmChannel, {
      messages: {
        no: 'OK, please type a new date and time for the event.',
        cancel: `Event creation cancelled. Please run ${config.prefix}event create again to initiate event creation again.`,
        invalid: `Reply not recognized! Please answer Y or N. Is ${discordMomentFullDate(d)} an acceptable date and time for the event? **Y/N**`,
      },
    });
    if (!result) return false;
    settingDate = !result.answer;
  }

  dmChannel.send(
    'OK! Would you like to set a description for this event? **Y/N**',
  );

  eventData.due = resolvedDate.utc();
  result = await promptYesNo(dmChannel, {
    messages: {
      yes:
        'Great! Please enter a description for the event. It\'s best to keep this short, 2-3 sentences max. You can type \'none\' if you decide you do not want a description after all.',
      no: 'OK, no description.',
      cancel: `Event creation cancelled. Please run ${config.prefix}event create again to initiate event creation again.`,
      invalid:
        'Reply not recognized! Please answer Y or N. Would you like to set a description for this event? **Y/N**',
    },
  });
  if (!result) return false;
  let needsDesc = result.answer;

  while (needsDesc) {
    result = await promptForMessage(dmChannel, async (reply) => {
      const description = reply.content.trim().replace(/["_\*>`]/g, '');
      switch (description.toLowerCase()) {
      case 'cancel':
        dmChannel.send(
          `Event creation cancelled. Please run ${config.prefix}event again to initiate event creation again.`,
        );
        return 'abort';
      case 'none':
        dmChannel.send('OK, no description.');
        return { description: undefined };
      case false:
        return 'retry';
      default:
        dmChannel.send(
          `Great,\n> ${description.replace(
            /\n/g,
            '\n> ',
          )}\nwill be the description of your event. Is this OK? **Y/N**`,
        );
        return { description };
      }
    });
    if (!result) return false;
    const { description } = result;
    // Confirm the description is okay
    result = await promptYesNo(dmChannel, {
      messages: {
        no: 'OK, please type a new description, or \'none\' for no description.',
        cancel: `Event creation cancelled. Please run ${config.prefix}event create again to initiate event creation again.`,
        invalid: `Reply not recognized! Please answer Y or N. Would you like to change the description for this event from *${description}*? **Y/N**`,
      },
    });
    if (!result) return false;
    needsDesc = !result.answer;
    if (result.answer) {
      eventData.description = description;
    }
  }
  eventData.channel = channel.id;
  eventData.owner = message.author.id;
  eventData.guild = message.guild.id;

  dmChannel.send('Great! Here\'s your event:');
  dmChannel.send(
    DMembedEvent(eventData, message.guild, {
      title: `New event: ${eventData.name}`,
      forUser: message.author,
    }),
  );
  dmChannel.send('Does this look OK? **Y/N**');
  result = await promptYesNo(dmChannel, {
    messages: {
      yes: `Perfect. I'll notify <#${eventData.channel}> now.`,
      no:
        'OK. For now you will have to re-run the command in the server to re-create the event.',
      cancel: `Event creation cancelled. Please run ${config.prefix}event again to initiate event creation again.`,
      invalid:
        'Reply not recognized! Please answer Y or N. Is the event data I posted above acceptable? **Y/N**',
    },
  });
  if (!result || !result.answer) return false;

  let role;
  try {
    role = await message.guild.roles.create({
      data: {
        name: `Event - ${eventData.name}`,
        // Event roles shouldn't grant any inherent permissions
        permissions: 0,
        // Event roles should definitely be mentionable
        mentionable: true,
      },
      reason: `Event role created on behalf of ${message.author.tag}`,
    });

    // Add the role to the owner.
    const sendingMember = message.guild.members.cache.get(message.author.id);
    await sendingMember.roles.add(role.id, 'Created the event for this role');
  }
  catch (e) {
    console.log('Error creating event role:', e);
    return message.channel.send(
      'There was an error creating the role for this event, contact the bot owner.',
    );
  }

  eventData.role = role.id;

  await eventManager.add(eventData);

  return channel.send(
    embedEvent(eventData, message.guild, {
      title: `New event: ${eventData.name}`,
      forUser: message.author,
      firstRun: true,
    }),
  );
}

/**
 * Delete and recreate the event messages. Typically this function is called when the config command modifies the event info channel.
 * @param oldChanID
 * @param newChanID
 */
async function deleteAndCreateMsgs(oldChanID, newChanID, guild) {
  eventInfoChannel = guild.channels.cache.get(newChanID);
  if (oldChanID) {
    if (guild.channels.cache.has(oldChanID)) {
      const oldChan = guild.channels.cache.get(oldChanID);
      if (global.eventData.timeZoneInfoMessage[guild.id]) {
        const message = await oldChan.messages
          .fetch(global.eventData.timeZoneInfoMessage[guild.id])
          .catch((e) =>
            console.error('Failed to load time zone info message', e),
          );
        await message.delete();
        delete global.eventData.timeZoneInfoMessage[guild.id];
        delete eventManager.timeZoneInfoMessage[guild.id];
      }
      if (global.eventData.eventInfoMessage[guild.id]) {
        const message = await oldChan.messages
          .fetch(global.eventData.eventInfoMessage[guild.id])
          .catch((e) => console.error('Failed to load event info message', e));
        await message.delete();
        delete global.eventData.eventInfoMessage[guild.id];
        delete eventManager.eventInfoMessage[guild.id];
      }
    }
  }
  eventManager.updateTZPost(guild.id);
  eventManager.updateUpcomingEventsPost(guild.id);
}

module.exports = {
  name: 'event',
  description: 'Allows people on a server to participate in events',
  usage: `create to start a DM session to create a new event
${config.prefix}event join [name] to join an event
${config.prefix}event leave [name] to leave an event
${config.prefix}event edit [name] to edit the time of an event you created (staff can edit any event)
${config.prefix}event list [timezone] to list events (optionally in a chosen timezone)
${config.prefix}event info [name] for info on an event
${config.prefix}event delete [name] to delete an event
${config.prefix}event servertz [name] to get/set the server's default timezone (staff only)
${config.prefix}event tz [name] to get/set your default timezone*
*This data is stored in the bot. If you exit the server it is wiped. If you'd like to wipe it yourself please use ${config.prefix}event tz delete.
Staff can add users to the event by hand simply by giving any user the associated event role.`,
  cooldown: 3,
  guildOnly: true,
  staffOnly: false,
  args: true,
  async execute(message, args, client) {
    await pkQuery(message);
    if (message.isPKMessage) {
      return message.reply(
        'Unfortunately, due to how roles work in Discord, the event system cannot be accessed by PluralKit webhooks at this time.',
      );
    }

    // function to get a channel object based on a channel ID or mention.
    async function getChannel(ID) {
      if (ID.startsWith('<#') && ID.endsWith('>')) {
        ID = ID.slice(2, -1);
        return await client.channels.cache.get(ID);
      }
      else {
        try {
          return await client.channels.cache.get(ID);
        }
        catch {
          return null;
        }
      }
    }

    const subcommand = args.shift().toLowerCase();
    const [...cmdArgs] = args;
    switch (subcommand) {
    case 'add':
    case 'create':
    case 'new':
      // todo: fix section so it can occur in the DM session.
      let newChannel;
      let userInput;
      if (!cmdArgs.join(' ')) {
        message.channel.send(
          'What channel would you like the event to take place in? Please #mention the channel the event should take place in. For the current channel, just reply with `this`',
        );
        const reply = await msgCollector(message);
        if (!reply) {
          return;
        }
        userInput = reply.content;
      }
      else {
        userInput = cmdArgs.join(' ');
      }

      if (userInput.toLowerCase() == 'this') {
        newChannel = message.channel;
      }
      else {
        newChannel = await getChannel(userInput);
        if (!newChannel) {
          return message.channel.send(
            'Please try again and make sure you either #mention the channel or copy/paste the channel ID.',
          );
        }
        if (!newChannel.permissionsFor(message.author).has(Discord.Permissions.FLAGS.SEND_MESSAGES)) {
          return message.channel.send(
            'Please choose a channel that you have the ability to send messages in',
          );
        }
      }

      message.channel.send(
        'Ok! I\'ve opened a DM with you for event management.',
      );
      await createWizard(message, newChannel);

      return;
    case 'delete':
    case 'remove':
      return deleteCommand(message, client, cmdArgs.join(' ') || undefined);
    case 'edit':
      return editCommand(message, client, cmdArgs.join(' ') || undefined);
    case 'join':
    case 'rsvp':
      return joinCommand(message, client, cmdArgs.join(' ') || undefined);
    case 'leave':
      return leaveCommand(message, client, cmdArgs.join(' ') || undefined);
    case 'info':
      return infoCommand(message, client, cmdArgs.join(' '));
    case 'list':
      return listCommand(message, client, cmdArgs.join(' ') || undefined);
    case 'servertz':
      return servertzCommand(message, client, cmdArgs.join(' '));
    case 'tz':
      await tzCommand(message, client, cmdArgs.join(' '));
      return;
    case 'updateinfopost':
      await updateInfoPostCommand(message);
      return;
    case '':
      return message.channel.send(
        'You must specify a subcommand. See help for usage.',
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
      if (eventInfoChannel !== null) return eventInfoChannel;

      if (!config.eventInfoChannelId) {
        console.log('No event info channel set, skipping.');
      }
      else {
        console.log(
          `Retrieving event info channel: ${config.eventInfoChannelId}`,
        );
        eventInfoChannel =
          client.channels.cache.get(config.eventInfoChannelId) || null;

        if (eventInfoChannel) {
          console.log('Event info channel set.');
        }
        else {
          console.log(
            `Event info channel ${config.eventInfoChannelId} could not be found.`,
          );
        }
      }

      eventManager = new EventManager(client);
      eventManager.loadState().then(() => {
        eventManager.start();
        console.log('Event manager ready.');
      });
    };

    if (client.status !== Discord.Constants.Status.READY) {
      client.on('ready', onReady);
    }
    else {
      onReady();
    }
  },
  regenMsgs(oldChanID, newChanID, guild) {
    deleteAndCreateMsgs(oldChanID, newChanID, guild);
  },
};