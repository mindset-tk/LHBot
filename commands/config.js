const fs = require('fs');
const path = require('path');
const configPath = path.resolve('./config.json');
const config = require(configPath);

module.exports = {
  name: 'config',
  description: 'Access configuration options for this bot.',
  usage: '',
  cooldown: 3,
  guildOnly: true,
  staffOnly: true,
  args: true,
  async execute(message, args, client) {

    function writeConfig() {
      fs.writeFile(configPath, JSON.stringify(config, null, 2), function(err) {
        if (err) {
          message.channel.send('There was an error saving the config file!');
          return console.log(err);
        }
      });
    }

    function getChannelName(channelID) {
      const channelObj = client.channels.get(channelID);
      return channelObj.name;
    }

    function getRoleName(roleID) {
      const roleObj = message.guild.roles.get(roleID);
      return roleObj.name;
    }

    function getChannelFromMention(mention) {
      if (mention.startsWith('<#') && mention.endsWith('>')) {
        mention = mention.slice(2, -1);
        return client.channels.get(mention);
      }
    }

    // initialize disallowed prefix characters. None of these will be permitted in any part of the command prefix.
    const disallowedPrefix = ['@', '#', '/', '\\', '\\\\', '*', '~', '_'];

    // prefix management
    if (args[0].toLowerCase() === 'prefix') {
      if (args[2]) { return message.channel.send('Sorry, I am unable to utilize prefixes that include a space.'); }
      else if (!args[1]) { return message.channel.send('The current prefix for my commands is \'**' + config.prefix + '**\'.'); }
      else if (disallowedPrefix.some(noPrefix => args[1].toLowerCase().includes(noPrefix.toLowerCase()))) { return message.channel.send('Sorry, the characters ' + disallowedPrefix.join('') + ' cannot be used in a prefix as each will conflict with some functionality of Discord.'); }
      else {
        config.prefix = args[1];
        writeConfig();
        return message.channel.send('Setting new prefix to \'**' + config.prefix + '**\'.');
      }
    }
    // list full config file info
    if (args[0].toLowerCase() === 'list') {
      const ignoreChans = [];
      config.pinIgnoreChannels.forEach(chanID => ignoreChans.push(getChannelName(chanID)));
      return message.channel.send(`Here's my current configuration:
\`\`\`Command prefix: ${config.prefix}

Roles:
Staff role: @${getRoleName(config.roleStaff)}
Comrade role: @${getRoleName(config.roleComrade)}

Special Channels:
User join/exit notification channel: #${getChannelName(config.channelInvLogs)}

Pins:
Number of pins needed to pin a message: ${config.pinsToPin}
Channel(s) to ignore for pinning: ${(config.pinIgnoreChannels[0]) ? '#' + ignoreChans.join(', #') : 'None'}\`\`\``);
    }
    // pins number management
    if (args[0].toLowerCase() === 'pins') {
      if (args[2]) { return message.channel.send(`When using the ${config.prefix}config pins command, please only provide one numerical argument.`); }
      else if (!parseInt(args[1])) { return message.channel.send('I couldn\'t interpret a number from that!'); }
      else {
        config.pinsToPin = parseInt(args[1]);
        writeConfig();
        return message.channel.send(`Messages will now need a minimum of ${config.pinsToPin} 📌 reactions before I pin them.`);
      }
    }
    // for adding pin ignore channels.
    if (args[0].toLowerCase() === 'pinignore') {
      if (args[1].toLowerCase() === 'add') {
        const failed = [];
        const succeeded = [];
        const duplicate = [];
        const output = [];
        args.splice(0, 2);
        args.forEach(chanMention => {
          try {
            const chan = getChannelFromMention(chanMention);
            const dupeCheck = config.pinIgnoreChannels.filter(id => id === chan.id);
            if (!dupeCheck[0]) {
              config.pinIgnoreChannels.push(chan.id);
              succeeded.push(chan.name);
            }
            else {
              duplicate.push(chan.name);
            }
          }
          catch(err) {
            failed.push(chanMention);
          }
        });
        if (failed[0] && !succeeded[0]) { output.push(`Channel add unsuccessful! I was unable to parse the following channels: ${failed.join(', ')}.`); }
        else if (failed[0] && succeeded[0]) { output.push(`Channel add partially successful.  I was able to add the following channels: #${succeeded.join(', #')}, but unable to parse the following: ${failed.join(', ')}.`); }
        else if (!failed[0] && succeeded[0]) { output.push(`Successfully added the following channels to the pin ignore list: #${succeeded.join(', #')}.`); }
        if (duplicate[0]) { output.push(`The following channels were already in the ignore list: #${duplicate.join(', #')}.`); }
        message.channel.send(output.join(' '));
        writeConfig();
      }
      // removing pin ignore channels.
      else if (args[1].toLowerCase() === 'remove') {
        const failed = [];
        const succeeded = [];
        const notonlist = [];
        const output = [];
        args.splice(0, 2);
        args.forEach(chanMention => {
          try {
            const chan = getChannelFromMention(chanMention);
            const chanMatch = config.pinIgnoreChannels.filter(id => id === chan.id);
            if (chanMatch[0]) {
              const chanIndex = config.pinIgnoreChannels.findIndex(id => id === chan.id);
              config.pinIgnoreChannels.splice(chanIndex, 1);
              succeeded.push(chan.name);
            }
          }
          catch(err) {
            failed.push(chanMention);
          }
        });
        if (failed[0] && !succeeded[0]) { output.push(`Channel remove unsuccessful! I was unable to parse the following channels: ${failed.join(', ')}.`); }
        else if (failed[0] && succeeded[0]) { output.push(`Channel remove partially successful.  I was able to remove the following channels: #${succeeded.join(', #')}, but unable to parse the following: ${failed.join(', ')}.`); }
        else if (!failed[0] && succeeded[0]) { output.push(`Successfully removed the following channels from the pin ignore list: #${succeeded.join(', #')}.`); }
        if (notonlist[0]) { output.push(`The following channels were not in the ignore list: #${notonlist.join(', #')}.`); }
        message.channel.send(output.join(' '));
        writeConfig();
      }
    }
  },
};