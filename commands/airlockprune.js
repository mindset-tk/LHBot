const fs = require('fs');
const path = require('path');
const configPath = path.resolve('./config.json');
const config = require(configPath);
const moment = require('moment-timezone');

/* global BigInt */

function kickUser(user, reason) {
  user.send(`You've been kicked from **${user.guild.name}** with reason: "${reason}"`);
}

module.exports = {
  name: 'airlockprune',
  description: 'Lists all members of an airlock role, and offers to kick the ones that haven\'t finished onboarding after one week',
  usage: '[y]',
  cooldown: 3,
  guildOnly: true,
  staffOnly: true,
  args: false,
  async execute(message, args, client) {
    if (config.roleAirlock && config.airlockChannel) {
      const usersUnderLimit = [];
      const usersOverLimit = [];
      const usrMap = new Map;
      const AIRLOCK_ROLE_ID = config.roleAirlock;
      const AIRLOCK_PRUNE_LIMIT = config.airlockPruneDays ? config.airlockPruneDays : 7;
      const AIRLOCK_PRUNE_KICKMESSAGE = config.airlockPruneMessage ? config.airlockPruneMessage : 'Kicked during airlock prune';
      const AIRLOCK_CHANNEL = config.airlockChannel;
      const currentGuildUsrs = await message.guild.members.cache;
      const canKick = await message.guild.me.hasPermission('KICK_MEMBERS');
      const pruneNow = Boolean(args[0] == 'y');
      const now = moment.utc();
      let outMsg = '';

      // Loop through any airlock channels to find the last post date of airlock users
      airlockChannels = await client.channels.cache.filter(channel => channel.viewable && !channel.deleted && channel.type == 'text' && channel.name.includes(AIRLOCK_CHANNEL));
      for (channel of airlockChannels) {
        await channel[1].messages.fetch().then(messages => {
          //          messages = messages.filter(m => m.member.roles.cache.has(AIRLOCK_ROLE_ID));
          if (messages.size > 0) {
            for (m of messages) {
              m = m[1];
              // if the usrmap doesn't have the author at all, add them with value = message ID, so long as they are still currently in the guild
              if (!usrMap.has(m.author.id) && !m.author.bot && currentGuildUsrs.has(m.author.id)) {
                usrMap.set(m.author.id, m.id);
              }
              // if the usrmap has the author and the msgID stored is less than (older than) the one we're looking at, replace it.
              if (!m.author.bot && (usrMap.get(m.author.id) < m.id)) {
                usrMap.set(m.author.id, m.id);
              }
            }
          }
        });
      }
      message.guild.roles.cache.get(AIRLOCK_ROLE_ID).members.forEach(u => {
        let daysSinceJoin = moment.duration(now.diff(u.joinedAt)).asDays();
        let hasPosted = usrMap.has(u.id);
        let entry = `> - <@${u.id}> (${u.user.username}#${u.user.discriminator}) joined `;
        // ${moment(u.joinedAt).format('MMM Do')} displays Feb 23 if we need it
        if (daysSinceJoin > 1) {
          entry += `**${parseInt(daysSinceJoin)} day(s)** ago`;
        }
        else {
          entry += '**today**';
        }
        if (hasPosted) {
          var lastPostTimestamp = Number((BigInt(usrMap.get(u.id)) >> BigInt(22)) + BigInt(1420070400000));
          var timeSinceLastPost = moment.duration(now.diff(lastPostTimestamp)).asDays();
          if (timeSinceLastPost >= 1) {
            entry += `, and last posted **${parseInt(timeSinceLastPost)} day(s)** ago`;
          }
          else {
            entry += ', and last posted **today**';
          }
        }
        else {
          entry += ', and hasn\'t posted';
        }
        if (daysSinceJoin >= AIRLOCK_PRUNE_LIMIT && (!hasPosted || timeSinceLastPost >= AIRLOCK_PRUNE_LIMIT)) {
          usersOverLimit.push(entry);
          if (pruneNow && canKick) {
            kickUser(u, AIRLOCK_PRUNE_KICKMESSAGE);
            setTimeout(function() {
              u.kick(AIRLOCK_PRUNE_KICKMESSAGE);
            }, 1000);
          }
        }
        else if (!pruneNow) {
          usersUnderLimit.push(entry);
        }
      });
      if (usersOverLimit[0] || usersUnderLimit[0]) {
        if (usersOverLimit[0]) {
          let header = (pruneNow && canKick) ? 'Kicked ' + usersOverLimit.length + ' users who were' : 'Airlock users';
          outMsg += '__**' + header + ' past the prune limit (' + AIRLOCK_PRUNE_LIMIT + ' days):**__\n' + usersOverLimit.join('\n') + '\n\n';
        }
        if (usersUnderLimit[0] && !pruneNow) {
          outMsg += '__**Airlock users below prune limit (' + AIRLOCK_PRUNE_LIMIT + ' days):**__\n' + usersUnderLimit.join('\n') + '\n\n';
        }
        if (!pruneNow) { outMsg += '**NOTE:** Use `' + config.prefix + 'airlockprune y` to actually prune the users over the limit'; }
        if (!canKick) { outMsg += ' (I can\'t follow through without **kick** permissions, which I don\'t have right now)'; }
        return message.channel.send(outMsg);
      }
      else { return message.channel.send('There\'s nobody in the airlock right now!'); }
    }
    else {
      return message.channel.send('You need to set both an airlock user role and an airlock channel in the config');
    }
  },
};