const path = require('path');
const starboardpath = path.resolve('./starboard.js');
const starboard = require(starboardpath);
const configPath = path.resolve('./config.json');
const config = require(configPath);

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

async function userBlock(message, targetdata) {
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
    switch (await starboard.blockUser(blockTarget.id)) {
    case 'blocksuccessful':
      return message.reply('Successfully exempted you from the starboard. Current starboard messages from you will no longer accrue stars; your future starboard messages will not be considered for the starboard.');
    case 'alreadyblocked':
      return message.reply('You are already starboard exempt!');
    case 'error':
      return message.reply('Error exempting you! See console log for details.');
    }
  }
  else if (blockTarget != null && blockTarget.id != message.author.id && message.member.roles.cache.has(config.roleStaff)) {
    switch (await starboard.blockUser(blockTarget.id)) {
    case 'blocksuccessful':
      return message.reply(`Successfully blocked ${blockTarget.displayName} from the starboard. Current starboard messages from them will no longer accrue stars; future messages from them will not be considered for the starboard.`);
    case 'alreadyblocked':
      return message.reply(`${blockTarget.displayName} is already blocked from the starboard`);
    case 'error':
      return message.reply(`Error blocking ${blockTarget.displayName}! See console log for details.`);
    }
  }
  else if (blockTarget != null && !message.member.roles.cache.has(config.roleStaff)) {
    return message.reply(`Only staff can block others from the starboard.  You can exempt yourself from starboarding via the command \`${config.prefix}starboard exempt me\`.`);
  }
  else {
    return message.reply(`I couldn't parse a user ID from ${targetdata}. Please double-check the input.  Valid inputs are: \`me\`, a user id, or an @user mention.`);
  }
}


async function msgBlock(message, targetdata, client) {
  const targetMsg = await getMessageFromURL(targetdata, client);
  if (!targetMsg) { return message.reply(`I couldn't parse ${targetdata} - please include a full message link as an argument to the block message command.`); }
  else if (message.author.id == targetMsg.author.id || message.member.roles.cache.has(config.roleStaff)) {
    switch (await starboard.blockMsg(targetMsg, client)) {
    case 'blocksuccessful':
      return message.reply('Message blocked from starboard!');
    case 'alreadyblocked':
      return message.reply('Message already blocked from starboard!');
    case 'error':
      return message.reply('I couldn\'t block that message. See console for details.');
    }
  }
  else if (message.author.id != targetMsg.author.id && !message.member.roles.cache.has(config.roleStaff)) {
    message.reply('Only staff may block a message they did not write!');
  }
}

async function userUnblock(message, targetdata) {
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
    switch (await starboard.unblockUser(unblockTarget.id)) {
    case 'unblocksuccessful':
      return message.reply('Successfully un-exempted you from starboard. Old messages of yours will need to have a star added/removed to update the starboard.');
    case 'notblocked':
      return message.reply('You are not starboard exempt!');
    case 'error':
      return message.reply('Error exempting you! See console log for details.');
    }
  }
  else if (unblockTarget != null && unblockTarget.id != message.author.id && message.member.roles.cache.has(config.roleStaff)) {
    switch (await starboard.unblockUser(unblockTarget.id)) {
    case 'unblocksuccessful':
      return message.reply(`Successfully unblocked ${unblockTarget.displayName} from the starboard. Any messages of theirs can go onto the starboard; Old messages of theirs will need to have a star added/removed to update the starboard.`);
    case 'notblocked':
      return message.reply(`${unblockTarget.displayName} is not blocked from the starboard`);
    case 'error':
      return message.reply(`Error unblocking ${unblockTarget.displayName}! See console log for details.`);
    }
  }
  else if (unblockTarget != null && !message.member.roles.cache.has(config.roleStaff)) {
    return message.reply(`Only staff can unblock others from the starboard.  You can un-exempt yourself from starboarding via the command \`${config.prefix}starboard unexempt me\`.`);
  }
  else {
    return message.reply(`I couldn't parse a user ID from ${targetdata}. Please double-check the input.  Valid inputs are: \`me\`, a user id, or an @user mention.`);
  }
}

async function msgUnblock(message, targetdata, client) {
  const targetMsg = await getMessageFromURL(targetdata, client);
  if (!targetMsg) { return message.reply(`I couldn't parse ${targetdata} - please include a full message link as an argument to the block message command.`); }
  else if (message.author.id == targetMsg.author.id || message.member.roles.cache.has(config.roleStaff)) {
    switch (await starboard.unblockMsg(targetMsg)) {
    case 'unblocksuccessful':
      message.reply('Successfully unblocked message from starboard! Adding back to starboard if above threshold.');
      return starboard.onStar(client, targetMsg);
    case 'notblocked':
      return message.reply('Message was not blocked from starboard!');
    case 'error':
      return message.reply('Error unblocking message. See console log for details.');
    }
  }
  else if (message.author.id != targetMsg.author.id && !message.member.roles.cache.has(config.roleStaff)) {
    message.reply('Only staff may block a message they did not write!');
  }
}

module.exports = {
  name: 'starboard',
  description: 'Starboard-related functions.',
  usage: `**[unblockmsg or blockmsg] [message URL]** to block/unblock a message from the starboard (will also add/remove it to starboard based on starcount and block status).
**${config.prefix}starboard [unblockusr or blockusr] [user id or mention]** to block all of a user's posts from the starboard (will not delete their old posts)
non-staff can run **${config.prefix}starboard [unexempt or exempt] me** to exempt all of their own posts from the starboard.
non-staff may also perform the block/unblockmsg commands for any post they are the author of.`,
  cooldown: 3,
  guildOnly: true,
  staffOnly: false,
  args: true,
  async execute(message, args, client) {
    // pop out args[0] and run switch/case against it to determine next step.
    switch (args.shift().toLowerCase()) {
    case 'blockuser':
    case 'exempt':
      for (const targetdata of args) {
        await userBlock(message, targetdata);
      }
      return;
    case 'blockmsg':
    case 'blockmessage':
      for (const targetdata of args) {
        await msgBlock(message, targetdata, client);
      }
      return;
    case 'unblockuser':
    case 'unexempt':
      for (const targetdata of args) {
        await userUnblock(message, targetdata);
      }
      return;
    case 'unblockmsg':
    case 'unblockmessage':
      for (const targetdata of args) {
        await msgUnblock(message, targetdata, client);
      }
      return;
    case 'unblock':
      return message.reply(`Sorry, please use ${config.prefix}starboard unblockuser or unblockmsg.`);
    case 'block':
      return message.reply(`Sorry, please use ${config.prefix}starboard blockuser or blockmsg.`);
    case 'migrate':
      // await startMigrator();
    }
  },
  init(client) {
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
      // fetch info about the message the reaction was added to.
      await channel.messages.fetch(data.message_id).then(message => {
        if (!message || message.system) return;
        starboard.onStar(client, message);
      });
    });
  },
};