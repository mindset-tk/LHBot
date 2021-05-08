const path = require('path');
const starboardpath = path.resolve('./starboard.js');
const starboard = require(starboardpath);
const configPath = path.resolve('./config.json');
const config = require(configPath);
const fs = require('fs');

function getPermLevel(message) {
  if (message.isPKMessage) {
    if (message.PKData.author.roles.cache.has(config.roleStaff)) {
      return 'staff';
    }
    else if (message.PKData.author.roles.cache.has(config.roleComrade)) {
      return 'comrade';
    }
    else {return null;}
  }
  else if (!message.isPKMessage) {
    if (message.member.roles.cache.has(config.roleStaff)) {
      return 'staff';
    }
    else if (message.member.roles.cache.has(config.roleComrade)) {
      return 'comrade';
    }
    else {return null;}
  }
  return null;
}

function prettyPrintConfig() {
  const output = JSON.stringify(config, function(k, v) {
    if (v instanceof Array) {
      return JSON.stringify(v);
    }
    return v;
  }, 2).replace(/\\/g, '')
    .replace(/"\[/g, '[')
    .replace(/\]"/g, ']')
    .replace(/"\{/g, '{')
    .replace(/\}"/g, '}');
  return output;
}
// function to write config to file.
function writeConfig(message) {
  fs.writeFileSync(configPath, prettyPrintConfig(), function(err) {
    if (err) {
      if (message) { message.channel.send('There was an error saving the config file!'); }
      else { console.error('Error saving config!'); }
      return console.error(err);
    }
  });
}

function sliceIfMention(input) {
  if (input.startsWith('<@') && input.endsWith('>')) {
    input = input.slice(2, -1);
    if (input.startsWith('!')) {
      input = input.slice(1);
    }
  }
  return input;
}

async function getMessageFromURL(url, client) {
  const messageRegEx = /(?:(?:https*:\/\/)*discord.com\/channels\/)\d+\/(\d+)\/(\d+)/;
  const target = { chanID: messageRegEx.exec(url)[1], msgID: messageRegEx.exec(url)[2] };
  target.chan = await client.channels.fetch(target.chanID);
  target.msg = await target.chan.messages.fetch(target.msgID);
  return target.msg;
}

// function to create a message collector.
async function msgCollector(message) {
  // let responses = 0;
  let reply = false;
  // create a filter to ensure output is only accepted from the author who initiated the command.
  const filter = input => (input.author.id === message.author.id);
  await message.channel.awaitMessages(filter, { max: 1, time: 30000, errors: ['time'] })
  // this method creates a collection; since there is only one entry we get the data from collected.first
    .then(collected => reply = collected.first())
    .catch(() => message.channel.send('Sorry, I waited 30 seconds with no response, please run the command again.'));
  return reply;
}

// function to get a channel object based on a channel ID or mention.
async function getChannel(ID, client) {
  if (ID.startsWith('<#') && ID.endsWith('>')) {
    ID = ID.slice(2, -1);
    return await client.channels.cache.get(ID);
  }
  else {
    try { return await client.channels.cache.get(ID);}
    catch { return null;}
  }
}

async function userBlock(message, targetdata, botdb) {
  const permLevel = getPermLevel(message);
  let blockTarget;
  if (targetdata.toLowerCase() === 'me') {
    blockTarget = message.author;
  }
  else {
  // run second arg through mention slicer to sanitize input to a bare userid, and try to fetch member from guild.
    blockTarget = await message.guild.members.fetch(sliceIfMention(targetdata));
  }
  // self-exemption responses.
  if (blockTarget != null && blockTarget.id === message.author.id) {
    switch (await starboard.blockUser(blockTarget.id, botdb)) {
    case 'blocksuccessful':
      return message.reply('Successfully exempted you from the starboard. Current starboard messages from you will no longer accrue stars; your future starboard messages will not be considered for the starboard.');
    case 'alreadyblocked':
      return message.reply('You are already starboard exempt!');
    case 'error':
      return message.reply('Error exempting you! See console log for details.');
    }
  }
  else if (blockTarget != null && blockTarget.id != message.author.id && permLevel == 'staff') {
    switch (await starboard.blockUser(blockTarget.id, botdb)) {
    case 'blocksuccessful':
      return message.reply(`Successfully blocked ${blockTarget.displayName} from the starboard. Current starboard messages from them will no longer accrue stars; future messages from them will not be considered for the starboard.`);
    case 'alreadyblocked':
      return message.reply(`${blockTarget.displayName} is already blocked from the starboard`);
    case 'error':
      return message.reply(`Error blocking ${blockTarget.displayName}! See console log for details.`);
    }
  }
  else if (blockTarget != null && permLevel != 'staff') {
    return message.reply(`Only staff can block others from the starboard.  You can exempt yourself from starboarding via the command \`${config.prefix}starboard exempt me\`.`);
  }
  else {
    return message.reply(`I couldn't parse a user ID from ${targetdata}. Please double-check the input.  Valid inputs are: \`me\`, a user id, or an @user mention.`);
  }
}


async function msgBlock(message, targetdata, botdb) {
  const permLevel = getPermLevel(message);
  const targetMsg = await getMessageFromURL(targetdata, message.client);
  if (!targetMsg) { return message.reply(`I couldn't parse ${targetdata} - please include a full message link as an argument to the block message command.`); }
  else if (message.author.id == targetMsg.author.id || permLevel == 'staff') {
    switch (await starboard.blockMsg(targetMsg, botdb)) {
    case 'blocksuccessful':
      return message.reply('Message blocked from starboard!');
    case 'alreadyblocked':
      return message.reply('Message already blocked from starboard!');
    case 'error':
      return message.reply('I couldn\'t block that message. See console for details.');
    }
  }
  else if (message.author.id != targetMsg.author.id && permLevel != 'staff') {
    message.reply('Only staff may block a message they did not write!');
  }
}

async function userUnblock(message, targetdata, botdb) {
  const permLevel = getPermLevel(message);
  let unblockTarget;
  if (targetdata.toLowerCase() === 'me') {
    unblockTarget = message.author;
  }
  else {
  // run second arg through mention slicer to sanitize input to a bare userid, and try to fetch member from guild.
    unblockTarget = await message.guild.members.fetch(sliceIfMention(targetdata));
  }
  // self-exemption responses.
  if (unblockTarget != null && unblockTarget.id === message.author.id) {
    switch (await starboard.unblockUser(unblockTarget.id, botdb)) {
    case 'unblocksuccessful':
      return message.reply('Successfully un-exempted you from starboard. Old messages of yours will need to have a star added/removed to update the starboard.');
    case 'notblocked':
      return message.reply('You are not starboard exempt!');
    case 'error':
      return message.reply('Error exempting you! See console log for details.');
    }
  }
  else if (unblockTarget != null && unblockTarget.id != message.author.id && permLevel == 'staff') {
    switch (await starboard.unblockUser(unblockTarget.id, botdb)) {
    case 'unblocksuccessful':
      return message.reply(`Successfully unblocked ${unblockTarget.displayName} from the starboard. Any messages of theirs can go onto the starboard; Old messages of theirs will need to have a star added/removed to update the starboard.`);
    case 'notblocked':
      return message.reply(`${unblockTarget.displayName} is not blocked from the starboard`);
    case 'error':
      return message.reply(`Error unblocking ${unblockTarget.displayName}! See console log for details.`);
    }
  }
  else if (unblockTarget != null && permLevel != 'staff') {
    return message.reply(`Only staff can unblock others from the starboard.  You can un-exempt yourself from starboarding via the command \`${config.prefix}starboard unexempt me\`.`);
  }
  else {
    return message.reply(`I couldn't parse a user ID from ${targetdata}. Please double-check the input.  Valid inputs are: \`me\`, a user id, or an @user mention.`);
  }
}

async function msgUnblock(message, targetdata, botdb) {
  const permLevel = getPermLevel(message);
  const targetMsg = await getMessageFromURL(targetdata, message.client);
  if (!targetMsg) { return message.reply(`I couldn't parse ${targetdata} - please include a full message link as an argument to the block message command.`); }
  else if (message.author.id == targetMsg.author.id || permLevel == 'staff') {
    switch (await starboard.unblockMsg(targetMsg, botdb)) {
    case 'unblocksuccessful':
      message.reply('Successfully unblocked message from starboard! Adding back to starboard if above threshold.');
      return starboard.onStar(targetMsg, botdb);
    case 'notblocked':
      return message.reply('Message was not blocked from starboard!');
    case 'error':
      return message.reply('Error unblocking message. See console log for details.');
    }
  }
  else if (message.author.id != targetMsg.author.id && permLevel != 'staff') {
    message.reply('Only staff may block a message they did not write!');
  }
}

async function startMigrator(message, botdb) {
  let reply;
  let questionLoop = true;
  let fromChannel = null;
  let toChannel = null;
  while (questionLoop) {
    let confirmed = false;
    message.channel.send('What channel will you be migrating the starboard **from**?  Please provide a #channel mention or channel ID.  Please note you may type cancel at any time during this process to quit the migration.');
    while (!fromChannel) {
      reply = await msgCollector(message);
      if (reply.content.toLowerCase() == 'cancel') {
        return message.channel.send('Migration canceled!');
      }
      fromChannel = await getChannel(reply.content, message.client);
      if (!fromChannel) {
        message.channel.send('I\'m sorry, I couldn\'t parse that reply. Please provide a #channel mention or channel ID, or type \'cancel\'. What channel will you be migrating the starboard from?');
      }
    }
    message.channel.send('What channel will you be migrating the starboard **to**?  Please provide a #channel mention or channel ID.  **Preferably, this should be an empty channel**');
    while (!toChannel) {
      reply = await msgCollector(message);
      if (reply.content.toLowerCase() == 'cancel') {
        return message.channel.send('Migration canceled!');
      }
      toChannel = await getChannel(reply.content, message.client);
      if (!toChannel) {
        message.channel.send('I\'m sorry, I couldn\'t parse that reply. Please provide a #channel mention or channel ID, or type \'cancel\'. What channel will you be migrating the starboard from?');
      }
      else if (toChannel == fromChannel) {
        message.channel.send('Your from channel matches your to channel! Please provide a new to channel, or cancel and retype the command to start over.');
      }
    }
    message.channel.send(`Great, I'll do the following:
1. Scan and move the starboard in ${fromChannel} to the new starboard in ${toChannel}.
2. Set the starboard channel for this server to ${toChannel}.
3. If a different starboard channel is already set for this bot, all posts from that starboard will be checked and integrated to one consolidated starboard, based on their date of posting to the starboard.

Is this correct? Please type '**yes**' or '**no**' in full. Once the process is started it cannot be stopped.`);
    while (!confirmed) {
      reply = await msgCollector(message);
      switch (reply.content.toLowerCase()) {
      case 'yes':
        questionLoop = false;
        confirmed = true;
        break;
      case 'no':
        fromChannel = null;
        toChannel = null;
        confirmed = true;
        break;
      case 'cancel':
        return message.channel.send('Migration canceled!');
      default:
        message.channel.send('I\'m sorry, I couldn\'t parse that reply. Please answer yes, no, or cancel.');
      }
    }
  }
  config.starboardToggle = false;
  config.starboardChannelId = toChannel.id;
  writeConfig();
  message.channel.send('Great, beginning starboard migration...');
  await starboard.migrator(fromChannel, toChannel, message.channel, botdb);
  message.channel.send('Starboard migration now complete. Please use the config commands to turn the starboard back on.');
}

module.exports = {
  name: 'starboard',
  description: 'Starboard-related functions.',
  usage: `**[unblockmsg or blockmsg] [message URL]** to block/unblock a message from the starboard (will also add/remove it to starboard based on starcount and block status).
**${config.prefix}starboard [unblockuser or blockuser] [user id or mention]** to block all of a user's posts from the starboard (will not delete their old posts)
non-staff can run **${config.prefix}starboard [unexempt or exempt] me** to exempt all of their own posts from the starboard.
non-staff may also perform the block/unblockmsg commands for any post they are the author of.`,
  cooldown: 3,
  guildOnly: true,
  staffOnly: false,
  args: true,
  async execute(message, args, client, c, botdb) {
    // pop out args[0] and run switch/case against it to determine next step.
    switch (args.shift().toLowerCase()) {
    case 'blockuser':
    case 'exempt':
      for (const targetdata of args) {
        await userBlock(message, targetdata, botdb);
      }
      return;
    case 'blockmsg':
    case 'blockmessage':
      for (const targetdata of args) {
        await msgBlock(message, targetdata, botdb);
      }
      return;
    case 'unblockuser':
    case 'unexempt':
      for (const targetdata of args) {
        await userUnblock(message, targetdata, botdb);
      }
      return;
    case 'unblockmsg':
    case 'unblockmessage':
      for (const targetdata of args) {
        await msgUnblock(message, targetdata, botdb);
      }
      return;
    case 'unblock':
      return message.reply(`Sorry, please use ${config.prefix}starboard unblockuser or unblockmsg.`);
    case 'block':
      return message.reply(`Sorry, please use ${config.prefix}starboard blockuser or blockmsg.`);
    case 'migrate':
      await startMigrator(message, botdb);
      return;
    }
  },
  init(client, c, botdb) {
    client.on('raw', async (packet) => {
      // return if the event isn't a reaction add or remove.
      if (packet.t !== 'MESSAGE_REACTION_ADD' && packet.t !== 'MESSAGE_REACTION_REMOVE') {
        return;
      }
      // then check if the emoji added/removed was a star. if not, do nothing.
      else if (packet.d.emoji.name !== '⭐') {
        return;
      }
      // pulling data from packet obj
      const { d: data } = packet;
      const user = client.users.cache.get(data.user_id);
      const channel = client.channels.cache.get(data.channel_id) || await user.createDM();
      if (channel.type == 'text') {
        // if it's a guild channel, fetch the message the reaction was added to, then pass it to the starboard functions for examination.
        await channel.messages.fetch(data.message_id).then(message => {
          if (!message || message.system) return;
          starboard.onStar(message, botdb);
        });
      }
    });
  },
};