// TODO: add functionality to set role selection and move role selection channel on change of channelRoleSelection.
// TODO: finish cleaning up unused props, etc.
// TODO: refactor to use embed + reaction buttons etc
const { MessageActionRow, MessageButton, Collection, MessageEmbed } = require('discord.js');
const { promptForMessage, writeConfigTables, getUserPermLevel, getConfig } = require('../extras/common.js');
const { truncate } = require('fs');

/** initializing configurable parts of config.json
* current varTypes are boolean, integer, channel, role, channelArray, inviteCodesArray, prefix, and pinMode
* prefix is specifically for command prefixes. It gets run through a special filter.
* channel and role are a single ID for their respective type and are stored as strings.
* channelArray is an array of channelIDs.
* inviteCodesArray is an array of known invite codes that have been given descriptors, in the format {code, description}
* TODO: auto-remove bad entries, deleted channels, etc.
* pinMode should be one of the following: count, toggle, off.
* commented vars either do nothing or are in development at this time.
* IMPORTANT: NEVER PUT MORE THAN 8 PROPS ON THE SAME PAGE!
* NEVER REPEAT VALUES FOR THE shortDesc PROP!
*/
const configurableProps = [{ varName:'prefix', shortDesc:'Command Prefix', varType:'prefix', default: '.', page:'main' },
  { varName:'roleStaff', shortDesc:'Staff Role', varType:'role', default: '', page:'main' },
  { varName:'roleUser', shortDesc:'Member Role', varType:'role', default: '', page:'main' },
  { varName:'roleAirlock', shortDesc:'Airlock Role', varType:'role', default: '', page:'main' },
  { varName:'invLogToggle', shortDesc:'Toggle __Invite Iogging__', varType:'boolean', default: false, page:'logging' },
  { varName:'channelInvLogs', shortDesc:'Channel for logging joins/leaves', varType:'channel', default: '', page:'logging' },
  { varName:'knownInvites', shortDesc:'Invite Code Descriptions', varType:'inviteCodesArray', default: [], page:'logging' },
  { varName:'avatarLogToggle', shortDesc:'Toggle __avatar change__ logging (not working)', varType:'boolean', default: false, page:'logging' },
  { varName:'channelAvatarLogs', shortDesc:'Channel for notifying about avatar changes (not working)', varType:'channel', default: '', page: 'logging' },
  { varName:'avatarLogAirlockOnlyToggle', shortDesc:'Avatar notifications restricted to airlock channels (not working)', varType:'boolean', default: false, page: 'logging' },
  { varName:'countingToggle', shortDesc:'Toggle counting', varType:'boolean', default: false, page:'specialChannels' },
  { varName:'countingChannelId', shortDesc:'Counting channel', varType:'channel', default: '', page:'specialChannels' },
  { varName:'botChannelId', shortDesc:'Bot-specific message channel', varType:'channel', default: '', page: 'specialChannels' },
  { varName:'eventInfoChannelId', shortDesc:'Event announce channel', varType:'channel', default: '', page:'specialChannels' },
  { varName:'voiceTextChannelIds', shortDesc:'Text channel(s) for voice chat', varType:'channelArray', default: [], page:'specialChannels' },
  { varName:'pinMode', shortDesc:'React pinning mode', varType:'pinMode', default: 'count', page:'reactFunctions' },
  { varName:'pinsToPin', shortDesc:'Number of pin reacts to pin a message', varType:'integer', default: 5, page:'reactFunctions' },
  { varName:'pinIgnoreChannels', shortDesc:'Channel(s) to ignore for pinning', varType:'channelArray', default: [], page:'reactFunctions' },
  { varName:'bookmarkEnabled', shortDesc:'Toggle bookmark', varType:'boolean', default: true, page:'reactFunctions' },
  { varName:'starboardToggle', shortDesc:'Toggle starboard functionality', varType:'boolean', default: false, page:'starboard' },
  { varName:'starboardChannelId', shortDesc:'Starboard channel', varType:'channel', default: '', page:'starboard' },
  { varName:'starThreshold', shortDesc:'Number of stars to starboard a message', varType:'integer', default: '', page:'starboard' },
  { varName:'starboardIgnoreChannels', shortDesc:'Channel(s) to ignore for starboarding', varType:'channelArray', default: [], page:'starboard' },
  { varName:'starboardPrivateChannels', shortDesc:'Channel(s) to consider private for starboarding purposes', varType:'channelArray', default: [], page:'starboard' },
];

const pageArr = [];
const pageDescs = {
  main: 'Main Settings',
  logging: 'Logging and Notifications',
  specialChannels: 'Special Channels',
  reactFunctions: 'Reaction-based Functions',
  starboard: 'Starboard Functions',
};

configurableProps.forEach(p => {
  if (!pageArr.includes(p.page)) {
    pageArr.push(p.page);
  }
});

// initialize disallowed prefix characters. None of these will be permitted in any part of the command prefix.
const disallowedPrefix = ['@', '#', '/', '\\', '*', '~', '_', '>', '`'];

async function prepTables(client, botdb) {
  client.guildConfig = new Collection();
  // first create tables if needed.
  await botdb.run(`CREATE TABLE IF NOT EXISTS config (
    guild_id TEXT NOT NULL,
    item TEXT NOT NULL,
    value ,
    PRIMARY KEY(guild_id, item)
  )`);
  await botdb.run(`CREATE TABLE IF NOT EXISTS config_index (
    item TEXT PRIMARY KEY,
    shortDesc TEXT NOT NULL UNIQUE,
    type TEXT
  )`);
  // Insert any new items from the configurableprops list into config index.
  let sqlStatement = 'INSERT OR IGNORE INTO config_index(item, shortDesc, type) VALUES';
  let propArr = [];
  for (const prop of configurableProps) {
    sqlStatement += '(?, ?, ?),';
    propArr.push(prop.varName, prop.shortDesc, prop.varType);
  }
  sqlStatement = sqlStatement.slice(0, -1) + ';';
  await botdb.run(sqlStatement, ...propArr);
  // then remove any items that have been removed from configurable props.
  const dbArr = await botdb.all('SELECT * FROM config_index');
  for (const d of dbArr) {
    const found = configurableProps.find(e => e.varName == d.item);
    if (!found) {
      await botdb.run('DELETE FROM config_index WHERE item = ?', d.item);
      await botdb.run('DELETE FROM config WHERE item = ?', d.item);
    }
  }
  // now populate the config table per-guild, adding any missing config items for a given guild.
  for (const guild of await client.guilds.fetch()) {
    // pull existing config items, if any, from db.
    let gConfigArr = await botdb.all('SELECT item, value FROM config WHERE guild_id = ?', guild[1].id);
    sqlStatement = 'INSERT OR IGNORE INTO config(guild_id, item, value) VALUES';
    propArr = [];
    for (const prop of configurableProps) {
      sqlStatement += '(?, ?, ?),';
      propArr.push(guild[1].id, prop.varName, JSON.stringify(prop.default));
    }
    // slice the last comma off the sql statement and make it a semicolon
    sqlStatement = sqlStatement.slice(0, -1) + ';';
    await botdb.run(sqlStatement, ...propArr);
    // refresh what the SQL db shows... might be a better way of doing this but it's just a select and no joins
    gConfigArr = await botdb.all('SELECT item, value FROM config WHERE guild_id = ?', guild[1].id);
    const configObj = {};
    for (const d of gConfigArr) {
      // remove extraneous config entries.
      const found = configurableProps.find(e => e.varName == d.item);
      if (!found) {
        await botdb.run('DELETE FROM config WHERE item = ?', d.item);
      }
      // and assemble the config object for this guild iteravely.
      else {
        configObj[d.item] = JSON.parse(d.value);
      }
    }
    // finally, add the guild to the client.guildConfig collection for later use, so we aren't doing going back to the db every time.
    await client.guildConfig.set(guild[1].id, configObj);
  }
}

// declaring some useful functions.

/**
 * Converts an input integer between 0 and 10 to the emoji word for that number
 * generally should only need to use 0-8 for config buttons.
 * @param {integer} int between 0 and 10
 *
 * @returns {string} unicode keycap emoji associated with that number, eg. 1️⃣
 */
function numToEmoji(int) {
  const nums = ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
  return nums[int];
}

/**
* Gets a channel name from a raw channel ID
*
* @param channelId Snowflake of the channel to check
* @param client Discord Client object
* @returns {promise} Channel name
*/
async function getChannelName(channelId, client) {
  if(channelId) {
    try {
      const chan = await client.channels.fetch(channelId);
      return chan.name;
    }
    catch { return '[invalid or deleted channel]';}
  }
  else { return false; }
}

/**
* Gets a role name from a raw role ID
*
* @param roleId Snowflake of the role to check
* @param guild Discord guild object
* @returns {string} Role name
*/
function getRoleName(roleId, guild) {
  const roleObj = guild.roles.cache.get(roleId);
  if (roleObj) {return roleObj.name;}
  else {return '[invalid or deleted role]';}
}

/**
* Fetch a channel object from a raw channel ID, mention, or channel name if a guild is provided
*
* @param searchString Snowflake of the channel to check
* @param guild (optional)
* @param client Discord client object
* @returns {object} channel object, 'ambiguous', or null;
*/
async function getChannel(searchString, guild = false, client) {
  if (guild) {
    const chans = await guild.channels.fetch().then(channels => channels.filter(channel => channel.name == searchString.toLowerCase()));
    if (chans.size == 1) {
      return chans.first();
    }
    else if (chans.size > 1) {
      return 'ambiguous';
    }
  }
  if (searchString.startsWith('<#') && searchString.endsWith('>')) {
    searchString = searchString.slice(2, -1);
  }
  try { return await client.channels.fetch(searchString);}
  catch { return null;}
}

/**
* Gets a role object from a ID or mention
*
* @param searchString Snowflake or @mention of of the role to check
* @param guild Discord guild object
* @returns {promise} Role name
*/
async function getRole(searchString, guild) {
  const roles = await guild.roles.fetch().then(r => r.filter(role => role.name == searchString));
  console.log(roles.size);
  if (roles.size == 1) {
    return roles.first();
  }
  else if (roles.size > 1) {
    return 'ambiguous';
  }
  if (searchString.startsWith('<@&') && searchString.endsWith('>')) {
    searchString = searchString.slice(3, -1);
    return await guild.roles.fetch(searchString);
  }
  else {
    try { return await guild.roles.fetch(searchString);}
    catch { return null;}
  }
}

/**
* Format a new response to the command, with buttons
*
* @param message discord message object
* @param config config for this server.
* @param client Discord client
* @param pageNo Page number to generate. If not provided, defaults to first page.
* @returns {object}
*/
async function generateEmbed(message, config, client, pageNo = 1) {
  /* const knownInv = [];
  if (config.knownInvites) {config.knownInvites.forEach(inv => knownInv.push('**' + inv[1] + '** (' + inv[0] + ')'));}
  console.log((Object.keys(config[voiceChamberDefaultSizes]).length == 0));
  if(typeof config.voiceChamberDefaultSizes == 'object') Object.keys(config.voiceChamberDefaultSizes).forEach(chanId => cfgVoiceChans.push('#' + config.voiceChamberDefaultSizes[chanId].Name + ' (Size: ' + config.voiceChamberDefaultSizes[chanId].Size + ')')); */

  const configEmbed = new MessageEmbed()
    .setTitle(`Server config for ${message.guild.members.me.displayName}`)
    .setDescription(`**__${pageDescs[pageArr[pageNo - 1]]}__**\nClick a numbered button to change the corresponding setting, or the arrow buttons to change pages.`)
    .setFooter({ text: `Page ${pageNo} of ${pageArr.length}` });
  let i = 1;
  for await (const prop of configurableProps) {
    if (prop.page == pageArr[pageNo - 1]) {
      const fieldTitle = `${numToEmoji(i)} ${prop.shortDesc}:`;
      let fieldValue = `${prop.longDesc ? (prop.longDesc + '\n') : ''}`;
      // console.log(`${numToEmoji(i)} ${prop.shortDesc}:`, `${prop.longDesc ? (prop.longDesc + '\n') : ''}${config[prop.varName].length > 0 ? `${config[prop.varName]}` : 'NOT SET' }`);
      if (prop.varType == 'prefix') {
        fieldValue += `\`${config[prop.varName]}\``;
      }
      else if (prop.varType == 'channelArray') {
        const chanList = [];
        console.log(config[prop.varName]);
        if (config[prop.varName].length > 0) {
          for (const chanId of config[prop.varName]) {chanList.push('#' + await getChannelName(chanId, client));}
          console.log(chanList);
        }
        fieldValue += `${chanList.length > 0 ? `${chanList.join(', ')}` : 'NONE SET' }`;
      }
      else if (prop.varType == 'boolean') {
        fieldValue += `${config[prop.varName] ? 'ON' : 'OFF' }`;
      }
      else if (prop.varType == 'role') {
        fieldValue += `${config[prop.varName] ? getRoleName(config[prop.varName], message.guild) : 'NOT SET' }`;
      }
      else if (prop.varType == 'channel') {
        const chanName = await getChannelName(config[prop.varName], client);
        fieldValue += `${config[prop.varName] ? `#${chanName}` : 'NOT SET' }`;
      }
      else if (prop.varType == 'integer') {
        fieldValue += (typeof config[prop.varName] === 'number') ? parseInt(config[prop.varName]) : 'NOT SET';
      }
      else {fieldValue += `${config[prop.varName].length > 0 ? `${config[prop.varName]}` : 'NOT SET' }`;}
      configEmbed.addFields({ name: fieldTitle, value: fieldValue });
      i++;
    }
  }
  const rows = [];
  const firstActionRow = new MessageActionRow();
  const secondActionRow = new MessageActionRow();
  for(i = 0; i <= (configEmbed.fields.length + 1); i++) {
    const button = new MessageButton();
    let buttonCustomId = '';
    let buttonEmoji = '';
    if (i == 0) {
      buttonCustomId = 'configPageBack';
      buttonEmoji = '⬅';
    }
    else if (i == 1) {
      buttonCustomId = 'configPageNext';
      buttonEmoji = '➡';
    }
    else if (i > 1) {
      buttonCustomId = `configSelect${i - 1}`;
      buttonEmoji = `${numToEmoji(i - 1)}`;
    }
    button.setCustomId(buttonCustomId)
      .setStyle('SECONDARY')
      .setEmoji(buttonEmoji);
    if (i <= 4) {
      firstActionRow.addComponents(button);
    }
    else if (i > 4 && i <= 9) {
      secondActionRow.addComponents(button);
    }
    else { throw 'Error when creating config embed! Too many config items on one page (Max is 8)! Please review config.js!';}
  }
  rows.push(firstActionRow);
  if (secondActionRow.components.length > 0) {rows.push(secondActionRow);}
  return { embeds: [configEmbed], components: rows };
}


/**
* Update config post
*
* @param message discord message object of config post.
* @param config config for this server.
* @param client Discord client
* @param pageNo Page number to generate. If not provided, defaults to first page.
* @returns {promise} updated message object for interaction.update() method.
*/
async function updateConfigPost(message, pageKey = null) {
  const config = getConfig(message.client, message.guild.id);
  let currentPageNo = getPageNo(message);
  if (pageKey == 'prevPage') {
    currentPageNo--;
    if (currentPageNo < 1) {currentPageNo = pageArr.length;}
  }
  else if (pageKey == 'nextPage') {
    currentPageNo++;
    if (currentPageNo > pageArr.length) {currentPageNo = 1;}
  }
  return await generateEmbed(message, config, message.client, currentPageNo);
}

/**
* Get current page number from a config post. Mostly just uses a regex on the footer.
*
* @param message discord message object of config post.
*
* @returns {integer} current page number of the config post.
*/
function getPageNo(message) {
  const footerRegex = new RegExp(/Page (\d+) of \d+/);
  return message.embeds[0].footer.text.match(footerRegex)[1];
}

/**
* Update a config item based on a button press.
*
* @param interaction discord interaction object.
*
* @returns {promise} updated message object interaction.update() method.
*/
async function updateConfigItem(interaction) {
  const itemNo = parseInt(interaction.customId.slice(-1));
  // Regex to extract a shortDesc from a field title
  const configRegex = new RegExp(/[\u0030-\u0038]\uFE0F\u20E3 (.+):/);
  // the below filter should only return one item since we never repeat emoji in the embed.
  const matchingField = interaction.message.embeds[0].fields.filter(field => field.name.startsWith(numToEmoji(itemNo)))[0];
  const shortDescFilter = matchingField.name.match(configRegex)[1];
  const propToUpdate = configurableProps.filter(prop => prop.shortDesc == shortDescFilter)[0];
  await configDM(interaction, propToUpdate);
  return await updateConfigPost(interaction.message);
}

/**
* Update a config item based on a button press.
*
* @param interaction discord interaction object.
* @param propToUpdate item from configurableProps that will be updated.
*
* @returns {Promise} true/false based on success of config change.
*/
async function configDM(interaction, propToUpdate) {
  let i = 0;
  const config = getConfig(interaction.client, interaction.guild.id);
  let msgContent = 'Please note that you may cancel this routine at any time by replying with \'cancel\'\n';
  const responseList = [];
  // build the message
  switch (propToUpdate.varType) {
  case 'prefix':
    msgContent += `Please reply with a new command prefix for ${interaction.guild.members.me.displayName} in ${interaction.guild.name}. Please note the following limitations:
    -The maximum prefix length is 10 characters long.
    -The prefix may not contain spaces.
    -The following characters **may not** be used in any part of the prefix: ${disallowedPrefix.join(' ')}`;
    break;
  case 'integer':
    msgContent += `${(typeof config[propToUpdate.varName] === 'number') ? parseInt(config[propToUpdate.varName]) : 'NOT SET'}`;
    break;
  case 'boolean':
    msgContent += `${propToUpdate.shortDesc} is currently set to ${config[propToUpdate.varName] ? 'ON' : 'OFF'}.  Would you like to toggle it ${config[propToUpdate.varName] ? 'OFF' : 'ON'}?
    Please reply with 'yes' or 'no'.`;
    break;
  case 'channel':
    msgContent += `${propToUpdate.shortDesc} is currently set to ${config[propToUpdate.varName] ? '#' + await getChannelName(config[propToUpdate.varName], interaction.client) : 'NOT SET' }.
    Please reply with a new channel name or channel ID snowflake.`;
    break;
  case 'role':
    msgContent += `${propToUpdate.shortDesc} is currently set to ${config[propToUpdate.varName] ? '@' + getRoleName(config[propToUpdate.varName], interaction.client) : 'NOT SET' }.
    Please reply with a new role name or role ID snowflake.`;
    break;
  case 'channelArray':
    if (config[propToUpdate.varName].length > 0) {
      for (const chanId of config[propToUpdate.varName]) {
        responseList.push('#' + await getChannelName(chanId, interaction.client));
      }
    }
    msgContent += `${propToUpdate.shortDesc} is currently set to ${responseList.length > 0 ? `${responseList.join('\n')}` : 'NONE SET' }.
    This is an Array; you may add or remove as many items to this list as you would like.
    Please reply with 'add' or 'remove'.`;
    break;
  case 'inviteCodesArray':
    if (config[propToUpdate.varName].length > 0) { config[propToUpdate.varName].forEach(invite => responseList.push(`${invite.code} - ${invite.description}`)); }
    msgContent += `The current list of known invite codes is ${responseList.length > 0 ? ':\n' + responseList.join('\n') : 'empty' }.
    Would you like to add, remove, or modify one of the items on this list?
    Please reply with 'add', 'remove', or 'modify'.`;
    break;
  case 'pinMode':
    switch (config.pinMode) {
    case 'count':
      msgContent += 'The current pinning mode is "count", meaning that messages will be pinned after a defined number of 📌 reactions.';
      break;
    case 'toggle':
      msgContent += 'The current pinning mode is "toggle", meaning that 📌 reactions will toggle a messages pin status on/off; a single reaction is all that is needed to change.';
      break;
    case 'off':
      msgContent += 'Reaction pinning is currently off. 📌 reactions will not cause a message to be pinned.';
      break;
    }
    msgContent += `\nPlease reply with a new pinning mode. Acceptable inputs are 'count','toggle', or 'off'.
    If you wish to define the number of pins for count mode, add the number with a space, eg. 'count 5'.`;
    break;
  default:
    interaction.reply({ content: 'There was an error updating this item. The error was: `Invalid prop vartype in config`. Please review the log to determine what caused the error.', ephemeral: true });
    console.error('Invalid vartype in config. The config item being updated was:\n', propToUpdate);
  }
  const dmChannel = await interaction.user.createDM();
  try {
    await dmChannel.send(msgContent);
  }
  catch(err) {
    if (err.message == 'Cannot send messages to this user') {
      interaction.reply({ content: 'Sorry, I can\'t seem to DM you. Please make sure that your privacy settings allow you to recieve DMs from this bot.', ephemeral: true });
    }
    else {
      interaction.reply({ content: 'There was an error sending you a DM! Please check your privacy settings.  If your settings allow you to recieve DMs from this bot, check the console for full error review.', ephemeral:true });
      console.log(err);
    }
    return false;
  }
  await promptForMessage(dmChannel, async (reply) => {
    if (reply.content.toLowerCase() == 'cancel') {
      dmChannel.send('config changes aborted!');
      return 'abort';
    }
    switch (propToUpdate.varType) {
    case 'prefix':
      if (disallowedPrefix.some(noPrefix => reply.content.toLowerCase().includes(noPrefix.toLowerCase()))) {
        dmChannel.send(`Sorry, the characters ${disallowedPrefix.join(' ')} cannot be used in a prefix as each will conflict with some functionality of Discord. Please type a new prefix, or 'cancel' to abort.`);
        return 'retry';
      }
      else {
        config[propToUpdate.varName] = reply.content.trim();
        dmChannel.send(`Great! \`${reply.content.trim()}\` is the new command prefix.`);
        return true;
      }
    case 'integer':
      if (parseInt(reply.content)) {
        config[propToUpdate.varName] = parseInt(reply.content);
        dmChannel.send(`Great! ${propToUpdate.shortDesc} is now ${parseInt(reply.content)}`);
        return true;
      }
      else {
        dmChannel.send(`Sorry, I couldn't parse ${reply.content}. Please type a number, or 'cancel' to abort.`);
        return 'retry';
      }
    case 'boolean':
      switch (reply.content.trim().toLowerCase()) {
      case 'n':
      case 'no':
        dmChannel.send(`Ok. ${propToUpdate.shortDesc} will remain ${config[propToUpdate.varName] ? 'ON' : 'OFF'}.`);
        return 'abort';
      case 'y':
      case 'yes':
        config[propToUpdate.varName] ? config[propToUpdate.varName] = false : config[propToUpdate.varName] = true;
        dmChannel.send(`Ok. Setting ${propToUpdate.shortDesc} to ${config[propToUpdate.varName] ? 'ON' : 'OFF'}.`);
        return true;
      case 'cancel':
        return 'abort';
      case false:
        return 'retry';
      default:
        dmChannel.send(`Reply not recognized! Please answer Y or N. Should ${propToUpdate.shortDesc} be set to ${config[propToUpdate.varName] ? 'OFF' : 'ON'}?`);
        return 'retry';
      }
    case 'channel': {
      const newChannel = await getChannel(reply.content.trim(), interaction.guild, interaction.client);
      switch (newChannel) {
      case undefined:
      case false:
        dmChannel.send(`${reply.content} is not a valid channelID or channel name! Please try again, or type 'cancel' to abort.`);
        return 'retry';
      case 'ambiguous':
        dmChannel.send(`I found more than one channel named ${reply.content} in ${interaction.guild.name}! Please try again using the channel ID.`);
        return 'retry';
      default:
        dmChannel.send(`Great! Updating ${propToUpdate.shortDesc} to #${newChannel.name}!`);
        config[propToUpdate.varName] = newChannel.id;
        return true;
      }}
    case 'role': {
      const newRole = await getRole(reply.content.trim(), interaction.guild);
      switch (newRole) {
      case false:
      case undefined:
        dmChannel.send(`${reply.content} is not a valid roleID or role name! Please try again, or type 'cancel' to abort.`);
        return 'retry';
      case 'ambiguous':
        dmChannel.send(`I found more than one role named ${reply.content} in ${interaction.guild.name}! Please try again using the role ID.`);
        return 'retry';
      default:
        dmChannel.send(`Great! Updating ${propToUpdate.shortDesc} to ${newRole.name}!`);
        config[propToUpdate.varName] = newRole.id;
        return true;
      }}
    // TODO: these two are branching for how arrays work. Will need add/remove functionality.
    case 'channelArray':
      let result;
      switch(reply.content.trim().toLowerCase()) {
      case 'add':
        dmChannel.send('OK. Please reply with a new channel name or channel ID snowflake.');
        result = await promptForMessage(dmChannel, async (reply) => {
          if (reply.content.toLowerCase() == 'cancel') {
            dmChannel.send('config changes aborted!');
            return 'abort';
          }
          const newChannel = await getChannel(reply.content.trim(), interaction.guild, interaction.client);
          switch (newChannel) {
          case undefined:
          case false:
            dmChannel.send(`${reply.content} is not a valid channelID or channel name! Please try again, or type 'cancel' to abort.`);
            return 'retry';
          case 'ambiguous':
            dmChannel.send(`I found more than one channel named ${reply.content} in ${interaction.guild.name}! Please try again using the channel ID.`);
            return 'retry';
          default:
            dmChannel.send(`Great! Adding #${newChannel.name} to ${propToUpdate.shortDesc}`);
            if (config[propToUpdate.varName] > 0) config[propToUpdate.varName].push(newChannel.id);
            else config[propToUpdate.varName] = [newChannel.id];
            return true;
          }
        });
        if (result) return true;
        else return 'abort';
      case 'remove':
        if (config[propToUpdate.varName].length == 0) {
          dmChannel.send('There are no channels to remove from the list!');
          return 'abort';
        }
        i = 0;
        responseList.length = 0;
        config[propToUpdate.varName].forEach(async chanId => {
          i++;
          responseList.push(i + '. #' + await getChannelName(chanId, interaction.client));
        });
        dmChannel.send('OK. Which channel would you like to remove? Please enter the number from the following list: \n' + responseList.join('\n'));
        result = await promptForMessage(dmChannel, async (reply) => {
          if (reply.content.toLowerCase() == 'cancel') {
            dmChannel.send('config changes aborted!');
            return 'abort';
          }
          const selection = parseInt(reply.content.trim()) - 1;
          if (selection.isNaN()) {
            dmChannel.send(`I couldn't parse '${reply.content}. Please type the number of the channel you would like to remove.`);
            return 'retry';
          }
          else if (selection > responseList.length || selection < 0) {
            dmChannel.send('Sorry, please enter a number from the list.');
            return 'retry';
          }
          else {
            let chantoremove = await getChannelName(config[propToUpdate.varName][(selection-1)], interaction.client)
            dmChannel.send(`Great! Removing #${chantoremove} from ${propToUpdate.shortDesc}`);
            config[propToUpdate.varName].slice((selection - 1), 1);
            return true;
          }
        });
        if (result) return true;
        else return 'abort';
      default:
        dmChannel.send(`I couldn't parse '${reply.content}' Please type 'add' or 'remove', or type 'cancel' to abort.`);
        return 'retry';
      }
    // as above but with addition of a modify function.
    case 'inviteCodesArray':
      break;
    case 'pinMode':
      switch (reply.content.trim().toLowerCase().split(' ')[0]) {
      case 'count':
        config.pinMode = 'count';
        if (reply.content.trim().toLowerCase().split(' ')[1] && parseInt(reply.content.trim().toLowerCase().split(' ')[1])) {
          config.pinsToPin = parseInt(reply.content.trim().toLowerCase().split(' ')[1]);
          dmChannel.send(`Ok. Messages will be pinned after ${config.pinsToPin} pin reacts are accrued.`);
        }
        else {
          dmChannel.send(`Ok. Messages will be pinned after ${config.pinsToPin} 📌 reacts are accrued.\
          This was the value already set, or the default for this setting.\
          Please use the config embed again to adjust if needed.`);
        }
        return true;
      case 'toggle':
        config.pinMode = 'toggle';
        dmChannel.send('Ok. Pins will now be toggled by adding/removing a 📌 react. Note that this means that anyone who can react to a message can add/remove it from the pins.');
        return true;
      case 'off':
        config.pinMode = 'off';
        return true;
      case 'cancel':
        return 'abort';
      case false:
        return 'retry';
      default:
        dmChannel.send(`Reply not recognized! Please answer Y or N. Should ${propToUpdate.shortDesc} be set to ${config[propToUpdate.varName] ? 'OFF' : 'ON'}?`);
        return 'retry';
      }
    default:
      interaction.reply({ content: 'There was an error updating this item. The error was: `Invalid prop vartype in config`. Please review the log to determine what caused the error.', ephemeral: true });
      console.error('Invalid vartype in config. The config item being updated was:\n', propToUpdate);
      return 'abort';
    }
  });
}

module.exports = {
  name: 'config',
  description() {return 'Access configuration options for this bot.';},
  usage() {return '';},
  cooldown: 3,
  guildOnly: true,
  staffOnly: true,
  args: false,
  async execute(message) {
    const client = message.client;
    const config = getConfig(client, message.guild.id);
    const replyObj = await generateEmbed(message, config, client);
    message.reply(replyObj);
    // writeConfigTables(botdb, message.client, message.guild.id);
  },
  async init(client, botdb) {
    client.on('interactionCreate', async interaction => {
      // only staff/admins can manage config.
      if (!(interaction.isButton() && interaction.customId.startsWith('config'))) return;
      if (getUserPermLevel(interaction.member, interaction.guild, client) != 'staff') {
        return interaction.reply({ content: 'Sorry, only staff and users with administrator-level permissions may access these controls.', ephemeral: true });
      }
      await interaction.deferUpdate();
      let newMsgPayload = false;
      // perform button action
      switch (interaction.customId) {
      case 'configPageBack':
        newMsgPayload = await updateConfigPost(interaction.message, 'prevPage');
        break;
      case 'configPageNext':
        newMsgPayload = await updateConfigPost(interaction.message, 'nextPage');
        break;
      default:
        if (interaction.customId.startsWith('configSelect')) {
          newMsgPayload = await updateConfigItem(interaction, botdb);
          await writeConfigTables(botdb, interaction.client, interaction.guild.id);
        }
      }
      if (newMsgPayload) {
        interaction.editReply(newMsgPayload);
      }
    });
  },
  prepTables: prepTables,
};