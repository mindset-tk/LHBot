const fs = require('fs');
const path = require('path');
const configPath = path.resolve('./config.json');
const config = require(configPath);
const moment = require('moment-timezone');

module.exports = {
  name: 'airlockprune',
  description: "Lists all members of an airlock role, and offers to kick the ones that haven't finished onboarding after one week",
  usage: '[y]',
  cooldown: 3,
  guildOnly: true,
  staffOnly: true,
  args: false,
  execute(message, args, client) {
    if (config.roleAirlock) {
      const usersUnderLimit = [];
      const usersOverLimit = [];
      const AIRLOCK_ROLE_ID = config.roleAirlock;
      const AIRLOCK_PRUNE_LIMIT = config.airlockPruneDays ? config.airlockPruneDays : 7;
      const AIRLOCK_PRUNE_KICKMESSAGE = config.airlockPruneMessage ? config.airlockPruneMessage : "Kicked during airlock prune";
      const canKick = message.guild.me.hasPermission("KICK_MEMBERS");
      const pruneNow = Boolean(args[0] == "y");
      const now = moment.utc();
      var outMsg = "";
      var user = message.guild.roles.cache.get(AIRLOCK_ROLE_ID).members.forEach(u => { 
        let daysSinceJoin = moment.duration(now.diff(u.joinedAt)).asDays();
        let entry = `> - <@${u.id}> (${u.id} / ${u.user.username}#${u.user.discriminator}) - joined **${parseInt(daysSinceJoin)} days** ago (${moment(u.joinedAt).format('MMM Do')})`;
        if (daysSinceJoin >= AIRLOCK_PRUNE_LIMIT) {
          usersOverLimit.push(entry);
          if (pruneNow && canKick) {
              console.log("this is where I'd kick the user");
              u.kick(AIRLOCK_PRUNE_KICKMESSAGE);
          }
        }
        else if (!pruneNow){
          usersUnderLimit.push(entry);
        }
      });
      if (usersOverLimit[0] || usersUnderLimit[0]) {
        if (usersOverLimit[0]) {
          let header = (pruneNow && canKick) ? "Kicked " + usersOverLimit.length + " users who were" : "Airlock users";
          outMsg += "__**" + header + " past the prune limit (" + AIRLOCK_PRUNE_LIMIT + " days):**__\n" + 
                                usersOverLimit.join('\n') + "\n\n";
        }
        if (usersUnderLimit[0] && !pruneNow) {
          outMsg += "__**Airlock users below prune limit (" + AIRLOCK_PRUNE_LIMIT + " days):**__\n" + 
                                usersUnderLimit.join('\n') + "\n\n";
        }
        if (!pruneNow) { outMsg += "**NOTE:** Use `" + config.prefix + "airlockprune y` to actually prune the users over the limit"; }
        if (!canKick) { outMsg += " (I can't follow through without **kick** permissions, which I don't have right now)"; }
        return message.channel.send(outMsg);
      } else { return message.channel.send("There's nobody in the airlock right now!"); }
    }
    else {
      return message.channel.send("There isn't an airlock role set in the config");
    }
  }
};