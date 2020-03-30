/* eslint-disable no-useless-escape */
const fs = require('fs');
const path = require('path');
const configPath = path.resolve('./config.json');
const config = require(configPath);
const countingDataPath = path.resolve('./counting.json');
if(global.countingData == null) {
  global.countingData = require(countingDataPath);
}

function writeCounting() {
  fs.writeFile(countingDataPath, JSON.stringify(global.countingData, null, 2), function(err) {
    if (err) {
      return console.log(err);
    }
  });
}

module.exports = {
  name: 'config',
  description: `Access configuration options for this bot.
**${config.prefix}config list** - review current settings. *At this time not everything displayed in this output can be modified with this command.*
 
__Basic Config__
**${config.prefix}config prefix [newprefix]** - Set a new command prefix for the bot. The prefix must not contain any spaces, or any of the following characters: \`@#/\\*~_\`
**${config.prefix}config roleStaff [role mention]** - set the role the bot considers as server staff (allows access to restricted functions such as the ban command)
**${config.prefix}config roleMembers [role mention]** - set the role the bot considers as server members (members without this role will not be able to interact with the bot)
*Note: The role commands are not yet implemented.*

__Pin Management__
**${config.prefix}config pins count [number]** - modify the number of 📌 reacts required to pin a message
**${config.prefix}config pins ignore [channel mention] [channel mention2]...** - add channels to ignore for the pin functionality. This will accept any number of channel mentions, separated by a space.
**${config.prefix}config pins unignore [channel mention] [channel mention2]...** - remove channels from the pin ignore list. This will accept any number of channel mentions, separated by a space.

__Special channels__
**${config.prefix}config invitelogs [channel mention]** - activate join/leave notifications and route them to the mentioned channel.
**${config.prefix}config invitelogs off** - deactivate join/leave notifications.
**${config.prefix}config counting [channel mention]** - activate counting and select the mentioned channel for counting.  Note: this will set counting to 0, so be prepared
**${config.prefix}config counting off** - deactivate counting.`,
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
      const channelObj = client.channels.cache.get(channelID);
      return channelObj.name;
    }

    function getRoleName(roleID) {
      const roleObj = message.guild.roles.cache.get(roleID);
      return roleObj.name;
    }

    function getChannelFromMention(mention) {
      if (mention.startsWith('<#') && mention.endsWith('>')) {
        mention = mention.slice(2, -1);
        return client.channels.cache.get(mention);
      }
      else {return null;}
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
__General settings__
**Command prefix:** ${config.prefix}
**Staff role:** @${getRoleName(config.roleStaff)}
**Member role:** @${getRoleName(config.roleComrade)}

__Special Channels:__
**User join/exit notifications:** ${config.invLogToggle ? ('#' + getChannelName(config.channelInvLogs)) : 'off.'}
**Counting:** ${config.countingToggle ? ('#' + getChannelName(config.countingChannelId)) : 'off.'}

__Pins:__
**Pin reacts needed to pin a message:** ${config.pinsToPin}
**Channel(s) to ignore for pinning:** ${(config.pinIgnoreChannels[0]) ? '#' + ignoreChans.join(', #') : 'None'}`);
    }
    // pins number management
    if (args[0].toLowerCase() === 'pins' && args[1].toLowerCase() == 'count') {
      if (args[3]) { return message.channel.send(`When using the ${config.prefix}config pins command, please only provide one numerical argument.`); }
      else if (!parseInt(args[2])) { return message.channel.send('I couldn\'t interpret a number from that!'); }
      else {
        config.pinsToPin = parseInt(args[2]);
        writeConfig();
        return message.channel.send(`Messages will now need a minimum of ${config.pinsToPin} 📌 reactions before I pin them.`);
      }
    }
    // for adding pin ignore channels.
    if (args[1].toLowerCase() === 'ignore') {
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
    else if (args[1].toLowerCase() === 'unignore') {
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
    // Set invite log channel
    if (args[0].toLowerCase() === 'invitelogs') {
      if (args[2]) { return message.channel.send('Too many arguments!'); }
      if (args[1].toLowerCase() === 'off') {
        message.channel.send('Disabling leave/join information.');
        config.invLogToggle = false;
        writeConfig();
      }
      else if (!getChannelFromMention(args[1])) { return message.channel.send('Couldn\'t get a channel from that. Please #mention the channel.'); }
      else {
        message.channel.send('Future leave/join information will go to ' + args[1] + '.');
        config.channelInvLogs = (getChannelFromMention(args[1]).id);
        config.invLogToggle = true;
        writeConfig();
      }
    }
    if (args[0].toLowerCase() === 'counting') {
      if (args[2]) { return message.channel.send('Too many arguments!'); }
      if (args[1].toLowerCase() === 'off') {
        message.channel.send('Disabling counting.');
        config.countingToggle = false;
        writeConfig();
      }
      else if (!getChannelFromMention(args[1])) { return message.channel.send('Couldn\'t get a channel from that. Please #mention the channel.'); }
      else if (getChannelFromMention(args[1]).id == config.countingChannelId) {return message.channel.send('I\'m already using that channel for counting!'); }
      else {
        message.channel.send('The new counting channel will be ' + args[1] + '.  I am setting the count to 0 - please use ' + config.prefix + 'setcounting to change it if necessary.');
        config.countingChannelId = (getChannelFromMention(args[1]).id);
        config.countingToggle = true;
        global.countingData.lastCount = 0;
        global.countingData.lastMessage = message.id;
        writeCounting();
        writeConfig();
      }
    }
  },
};