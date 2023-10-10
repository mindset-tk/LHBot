const Discord = require('discord.js');
const fetch = require('node-fetch');


/**
* Function to save a specific guild's config tables to the db.
* @param botdb discord message object
* @param client discord client
* @param guildId guild id (optional, but best practice to use it whenever possible to reduce wasteful DB access)
*
* @returns {promise} resolves once db writes are complete.
*/
async function writeConfigTables(botdb, client, guildId = null) {
  // if the guildId is specified when calling this function (it should be 99% of the time)
  if (guildId != null) {
    const configToWrite = getConfig(client, guildId);
    const configArr = [];
    for (const [key, value] of Object.entries(configToWrite)) {
      configArr.push(botdb.run(`UPDATE config
        SET value = ?
        WHERE item = ? AND guild_id =?;`, JSON.stringify(value), key, guildId));
    }
    await Promise.all(configArr);
  }
  // TODO write an "all guilds" version in case guildId is null.
}

/**
* Function to determine if a message author's permission level - returns null, 'member', or 'staff'
* Use this for messages since they might be PK messages.
* @param message discord message object
* @returns {string} null, 'member', or 'staff'
*/
function getMessagePermLevel(message) {
  if (message.channel instanceof Discord.DMChannel) return null;
  const config = getConfig(message.client, message.guild.id);
  // if the staff role has not been set, the bot responds to all commands on a server
  // TODO add some advisory message to this effect - DM the server inviter maybe?
  if (config.roleStaff == '' || !config.roleStaff) {
    return 'staff';
  }
  if (message.isPKMessage) {
    if (message.PKData.author.roles.cache.has(config.roleStaff) || message.PKData.author.permissions.has(Discord.Permissions.FLAGS.ADMINISTRATOR)) {
      return 'staff';
    }
    else if (message.PKData.author.roles.cache.has(config.roleUser)) {
      return 'user';
    }
    else {return null;}
  }
  else if (!message.isPKMessage && message.member) {
    if (message.member.roles.cache.has(config.roleStaff) || message.member.permissions.has(Discord.Permissions.FLAGS.ADMINISTRATOR)) {
      return 'staff';
    }
    else if (message.member.roles.cache.has(config.roleUser)) {
      return 'user';
    }
    else {return null;}
  }
  return null;
}

/**
* Function to find a user's permission level - returns null, 'member', or 'staff'
* Use this for eg, Interactions, since a message object is not used here and PK isn't compatible with interactions at this time.
* @param member discord guildmember object
* @param guild discord guild object
* @param client Discord client
* @returns {string} null, 'member', or 'staff'
*/
function getUserPermLevel(member, guild, client) {
  const config = getConfig(client, guild.id);
  // if the staff role has not been set, the bot responds to all commands on a server
  // TODO add some advisory message to this effect - DM the server inviter maybe?
  if (config.roleStaff == '' || !config.roleStaff) {
    return 'staff';
  }

  if (member.roles.cache.has(config.roleStaff) || member.permissions.has(Discord.Permissions.FLAGS.ADMINISTRATOR)) {
    return 'staff';
  }
  else if (member.roles.cache.has(config.roleComrade)) {
    return 'user';
  }
  else {return null;}
}

// function to get config for a given guild.
// returns an object with all configurableprops (see config.js)
function getConfig(client, guildId) {
  return client.guildConfig.get(guildId);
}

/**
* Function to create a message collector in a DM. Default timeout is 3 minutes.
* Use this for eg, Interactions, since a message object is not used here and PK isn't compatible with interactions at this time.
* @param dmChannel discord channel object, specifically for a dm
* @param {integer} timeout optional - timeout in milliseconds to wait for a reply.
* @returns {string} null, 'member', or 'staff'
*/
async function dmCollector(dmChannel, timeout = 18000) {
  // let responses = 0;
  let reply = false;
  // awaitmessages needs a filter but we're just going to accept the first reply it gets.
  const filter = m => (m.author.id === dmChannel.recipient.id);
  await dmChannel.awaitMessages({ filter, max: 1, time: timeout, errors: ['time'] })
    // this method creates a collection; since there is only one entry we get the data from collected.first
    .then(collected => reply = collected.first())
    .catch(err => {
      console.err(err);
      dmChannel.send('Sorry, I waited 3 minutes with no response. You will need to start over.');
    });
  return reply;
}

/**
 * Prompts for a message using a dmCollector.
 *
 * The handler is a function which takes a `Discord.Message` and returns a value. It can optionally be async,
 * but it doesn't need to be.
 * Return 'retry' from the `handler` if you want to retry the prompt, and 'abort' to cancel the prompt.
 * Anything else will be returned as the value.
 *
 * @param dmChannel {Discord.DMChannel} The DM channel to prompt in
 * @param handler {function(Discord.Message): object|string|Promise<object|string>} The function that handles the reply.
 * @param timeout (optional) timeout for message prompt
 * @returns {Promise<object|boolean>} Returns the result from the handler or `false` if aborted.
 ` */
async function promptForMessage(dmChannel, handler, timeout) {
  while (true) {
    const reply = await dmCollector(dmChannel, (timeout || null));
    if (!reply) {
      return false;
    }
    const result = await handler(reply);
    if (result === 'retry') {
      continue;
    }
    else if (result === 'abort') {
      return false;
    }
    else {
      return result;
    }
  }
}

/**
 * Convenience function for a common prompt for a yes/no/cancel.
 *
 * The options object has a `messages` entry that takes messages for yes, no, cancel, and invalid.
 *
 * yes/y and no/n are considered for yes/no (case insensitive), and cancel is considered for cancel.
 *
 * @param dmChannel {Discord.DMChannel} The DM channel to prompt in
 * @param options {object} Options containing messages with strings for the above keys.
 * @returns {Promise<object|boolean>} Returns `{answer: true}` for yes, `{answer: false}` for no, or `false` if aborted.
 */
async function promptYesNo(dmChannel, options) {
  return promptForMessage(dmChannel, (reply) => {
    const content = reply.content.trim();
    switch (content.toLowerCase()) {
    case 'n':
    case 'no':
      if (options.messages.no) dmChannel.send(options.messages.no);
      return { answer: false };
    case 'y':
    case 'yes':
      if (options.messages.yes) dmChannel.send(options.messages.yes);
      return { answer: true };
    case 'cancel':
      if (options.messages.cancel) dmChannel.send(options.messages.cancel);
      return 'abort';
    case false:
      return 'retry';
    default:
      if (options.messages.invalid) dmChannel.send(options.messages.invalid);
      return 'retry';
    }
  });
}

/**
* Asyncronously updates the pluralkit properties of the message it is run from.
* @method pkQuery()
* @param {Object} message The message object to be tested for PK info.
* @param {boolean} [force=false] Whether to skip any cached data and make a new request from the PK API.
* @returns {Object} returns the PKData props of the message. Property values will be null if it is not a PK message.
*/
async function pkQuery(message, force = false) {
  if (!message.PKData) {
    message.PKData = {};
  }
  if (!message.author.bot) {
    message.isPKMessage = false;
    message.PKData = {
      author: null,
      system: null,
      systemMember: null,
    };
    return message.PKData;
  }
  if (!force && message.pkCached) return message.PKData;
  const pkAPIurl = 'https://api.pluralkit.me/v2/messages/' + message.id;
  try {
    let pkResponse = await fetch(pkAPIurl);
    if (pkResponse.ok && pkResponse.headers.get('content-type').includes('application/json')) {
      message.isPKMessage = true;
      pkResponse = await pkResponse.json();
      try { message.PKData.author = await message.guild.members.fetch(pkResponse.sender);}
      catch (err) { message.PKData.author = await message.client.users.fetch(pkResponse.sender);}
      message.PKData.system = pkResponse.system;
      message.PKData.systemMember = pkResponse.member;
      message.pkCached = true;
      return message.PKData;
    }
  }
  catch (err) {
    console.log('Error caching PK data on message at:\n' + this.url + '\nError:\n' + err + '\nPK Data for message not cached. Will try again next time pkQuery is called.');
    message.PKData = {
      author: null,
      system: null,
      systemMember: null,
    };
    return message.PKData;
  }
  message.pkCached = true;
  message.PKData = {
    author: null,
    system: null,
    systemMember: null,
  };
  return message.PKData;
}

/**
* Convenience function for checking if a channel is a valid guild text channel.
*
* @param channel {Discord.Channel} The channel to check.
* @returns {boolean} Returns true if the channel is a guild text channel, false if not.
*/
function isTextChannel(channel) {
  if (channel.type.toLowerCase().includes('guild') && channel.isText()) {
    return true;
  }
  return false;
}

const emojiRegex = require('emoji-regex');
const unicodeEmojiTest = emojiRegex();
const discordEmojiTest = new RegExp(/<a?:.+?:(\d+)>$/);

/**
* Test if input is a unicode or Discord emoji mention, and if it can be posted by the bot (eg, is not animated or from a different server.)
* @param message Discord message object
* @param emoji string to test
*
* @returns postable emoji string, if emoji can be posted by the bot, false if not.
*/
async function validateEmoji(client, emoji) {
  // first check if the string contains exactly one unicode emoji and nothing more.
  if (emoji.match(unicodeEmojiTest)) {
    if (emoji == emoji.match(unicodeEmojiTest)[0] && emoji.match(unicodeEmojiTest).length == 1) {
      return emoji;
    }
  }
  // if not, test if it's a single custom emoji that the bot can access.
  try {
    if (discordEmojiTest.test(emoji)) {
      emoji = await client.emojis.resolve(discordEmojiTest.exec(emoji)[1]);
      if (emoji && emoji.available) {
        return `<${emoji.animated ? 'a' : ''}:${emoji.name}:${emoji.id}>`;
      }
    }
  }
  catch (err) {
    console.error(err.message);
    return false;
  }
  return false;
}

module.exports = {
  getMessagePermLevel,
  getUserPermLevel,
  dmCollector,
  promptForMessage,
  promptYesNo,
  pkQuery,
  getConfig,
  writeConfigTables,
  isTextChannel,
  validateEmoji,
};