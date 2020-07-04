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
  description: 'Access configuration options for this bot.',
  usage: '',
  cooldown: 3,
  guildOnly: true,
  staffOnly: true,
  args: false,
  async execute(message, args, client) {
    // initializing configurable parts of config.json
    // each entry: [varname in config.json, info string, type of entry]
    // current entry types are boolean, integer, channel, role, channelArray, and prefix
    // prefix is specifically for command prefixes. It gets run through a special filter.
    // channel and role are a single ID for their respective type and are stored as strings.
    // channelArray is an array of channelIDs.
    // boolean and integer are as labeled.
    const configurableProps = [['prefix', 'Command Prefix', 'prefix'],
      ['roleStaff', 'Staff Role', 'role'],
      ['roleComrade', 'Comrade Role', 'role'],
      ['invLogToggle', 'Toggle invite logging and reporting', 'boolean'],
      ['channelInvLogs', 'Invite logging channel', 'channel'],
      ['countingToggle', 'Toggle counting', 'boolean'],
      ['countingChannelId', 'Counting channel', 'channel'],
      ['voiceTextChannelIds', 'Text channel(s) for voice commands', 'channelArray'],
      ['pinsToPin', 'Number of pin reacts to pin a message', 'integer'],
      ['pinIgnoreChannels', 'Channel(s) to ignore for pinning', 'channelArray'],
      ['botChannelId', 'Bot stuff channel', 'channel']];
    // declaring some useful functions.
    // function to pretty print the config data so that arrays show on one line, so it's easier to visually parse the config file when hand opening it. Purely cosmetic.
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
    function writeConfig() {
      fs.writeFile(configPath, prettyPrintConfig(), function(err) {
        if (err) {
          message.channel.send('There was an error saving the config file!');
          return console.log(err);
        }
      });
    }
    // function to get a channel name from a chanID
    function getChannelName(channelID) {
      const channelObj = client.channels.cache.get(channelID);
      return channelObj.name;
    }
    // function to get a role name from a roleID
    function getRoleName(roleID) {
      const roleObj = message.guild.roles.cache.get(roleID);
      return roleObj.name;
    }
    // function to get a channel object based on a channel ID or mention.
    async function getChannel(ID) {
      if (ID.startsWith('<#') && ID.endsWith('>')) {
        ID = ID.slice(2, -1);
        return await client.channels.cache.get(ID);
      }
      else {
        try { return await client.channels.cache.get(ID);}
        catch { return null;}
      }
    }

    async function getRole(ID) {
      if (ID.startsWith('<@&') && ID.endsWith('>')) {
        ID = ID.slice(3, -1);
        return await message.guild.roles.cache.get(ID);
      }
      else {
        try { return await message.guild.roles.cache.get(ID);}
        catch { return null;}
      }
    }

    // function to create a message collector.
    async function msgCollector() {
      // let responses = 0;
      let reply = false;
      // create a filter to ensure output is only accepted from the author who initiated the command.
      const filter = input => (input.author.id === message.author.id);
      await message.channel.awaitMessages(filter, { max: 1, time: 30000, errors: ['time'] })
        // this method creates a collection; since there is only one entry we get the data from collected.first
        .then(collected => reply = collected.first())
        .catch(collected => message.channel.send('Sorry, I waited 30 seconds with no response, please run the command again.'));
      // console.log('Reply processed...');
      return reply;
    }

    function outputConfig() {
      const ignoreChans = [];
      config.pinIgnoreChannels.forEach(chanID => ignoreChans.push(getChannelName(chanID)));
      return `Here's my current configuration:
__General settings__
Command prefix: **${config.prefix}**
Staff role: **@${getRoleName(config.roleStaff)}**
Member role: **@${getRoleName(config.roleComrade)}**

__Special Channels:__
User join/exit notifications: **${config.invLogToggle ? ('#' + getChannelName(config.channelInvLogs)) : 'off.'}**
Counting: **${config.countingToggle ? ('#' + getChannelName(config.countingChannelId)) : 'off.'}**
Bot channel: **${config.botChannelId ? ('#' + getChannelName(config.botChannelId)) : 'not set.'}**

__Pins:__
Pin reacts needed to pin a message: **${config.pinsToPin}**
Channel(s) to ignore for pinning: **${(config.pinIgnoreChannels[0]) ? '#' + ignoreChans.join(', #') : 'None'}**`;
    }
    // initialize disallowed prefix characters. None of these will be permitted in any part of the command prefix.
    const disallowedPrefix = ['@', '#', '/', '\\', '\\\\', '*', '~', '_'];

    if (args[0] && args[0].toLowerCase() == 'list' && args.length == 1) {
      return message.channel.send(outputConfig());
    }
    else if (args[0]) { return message.channel.send('I\'m sorry but I couldn\'t parse `' + args.join(' ') + '`');}
    // if command has no args, start the chat wizard to modify commands.
    else {
      message.channel.send(outputConfig() + '\n\n**Would you like to change any of these settings? (Y/N)**');
      let reply = await msgCollector();
      if (reply.content.toLowerCase() == 'n' || reply.content.toLowerCase() == 'no') {
        return message.channel.send('OK!');
      }
      else if (reply.content.toLowerCase() != 'y' && reply.content.toLowerCase() != 'yes') {
        return message.channel.send(`Sorry, please answer Y or N. Type ${config.prefix}config to try again.`);
      }
      // new iterator
      let i = 0;
      const msgData = [];
      // parse through all configurable properties.
      // reminder: each element in the array looks like [varname, varinfo, vartype].
      configurableProps.forEach(prop => {
        i++;
        msgData.push(`${i}. ${prop[1]}`);
      });
      message.channel.send(`Which item would you like to change?\n${msgData.join('\n')}\nType 0 to cancel.`);
      reply = await msgCollector();
      if (!reply) { return; }
      else if (reply.content == 0) { return message.channel.send('Canceling!');}
      else if (!parseInt(reply.content)) { return message.channel.send('Sorry, I couldn\'t parse that. Please answer with only the number of your response.'); }
      else if (configurableProps[parseInt(reply.content) - 1]) {
        const changeIndex = parseInt(reply.content) - 1;
        const changeName = configurableProps[changeIndex][0];
        const changeDesc = configurableProps[changeIndex][1];
        const changeType = configurableProps[changeIndex][2];
        let replyContent = `Ok, so you want to change *${changeDesc}*.`;
        // handle response depending on the type of entry.
        if (changeType == 'prefix') {
          replyContent += ' What would you like to change it to? (case sensitive)';
          message.channel.send(replyContent);
          reply = await msgCollector();
          if (reply.content.includes(' ')) { return message.channel.send('Sorry, I am unable to utilize prefixes that include a space.'); }
          else if (disallowedPrefix.some(noPrefix => reply.content.toLowerCase().includes(noPrefix.toLowerCase()))) { return message.channel.send('Sorry, the characters ' + disallowedPrefix.join('') + ' cannot be used in a prefix as each will conflict with some functionality of Discord.'); }
          else {
            config[changeName] = reply.content;
            writeConfig();
            return message.channel.send(`Setting ${changeDesc} to '**${reply.content}**'.`);
          }
        }
        else if (changeType == 'boolean') {
          replyContent += ' Would you like to turn it on or off?';
          message.channel.send(replyContent);
          reply = await msgCollector();
          switch (reply.content.toLowerCase()) {
          case 'on':
          case 'true':
          case 'yes':
            config[changeName] = true;
            writeConfig();
            return message.channel.send(`${changeDesc} is now '**ON**'.`);
          case 'off':
          case 'false':
          case 'no':
            config[changeName] = false;
            writeConfig();
            return message.channel.send(`${changeDesc} is now '**OFF**'.`);
          default:
            return message.channel.send(`I'm sorry, I couldn't parse "${reply.content}". Please use 'on' or 'off' to set this setting.`);
          }
        }
        else if (changeType == 'channel') {
          replyContent += ' Please #mention the channel you would like it changed to, or copy/paste the channel ID.';
          message.channel.send(replyContent);
          reply = await msgCollector();
          const newChannel = getChannel(reply.content);
          if (newChannel) {
            config[changeName] = newChannel.id;
            writeConfig();
            if (changeName == 'countingChannelId') {
              global.countingData.lastCount = 0;
              global.countingData.lastMessage = message.id;
              writeCounting();
              return message.channel.send(`${changeDesc} is now ${newChannel}. Count has been reset to 0.`);
            }
            return message.channel.send(`${changeDesc} is now ${newChannel}`);
          }
          else {return message.channel.send(`Sorry, I couldn't parse '${reply.content}' into a channel. Please #mention the channel or copy/paste the channel ID.`);}
        }
        else if (changeType == 'role') {
          replyContent += ' Please @mention the role you would like it changed to, or copy/paste the role ID.';
          message.channel.send(replyContent);
          reply = await msgCollector();
          const newRole = await getRole(reply.content);
          if (newRole) {
            config[changeName] = newRole.id;
            writeConfig();
            return message.channel.send(`${changeDesc} is now **${newRole.name}**`);
          }
          else {return message.channel.send(`Sorry, I couldn't parse '${reply.content}' into a role. Please @mention the role or copy/paste the role ID.`);}
        }
        else if (changeType == 'integer') {
          replyContent += ' What would you like to change it to?';
          message.channel.send(replyContent);
          reply = await msgCollector();
          if (!reply.content.includes('.') && parseInt(reply.content)) {
            config[changeName] = parseInt(reply.content);
            writeConfig();
            return message.channel.send(`${changeDesc} is now **${parseInt(reply.content)}**`);
          }
          else {return message.channel.send(`Sorry, I couldn't parse '${reply.content}' into a count. Please enter an integer (no decimals).`);}
        }
        else if (changeType == 'channelArray') {
          replyContent += ' Would you like to add or remove a channel from the list?';
          message.channel.send(replyContent);
          reply = await msgCollector();
          if (reply.content.toLowerCase() == 'add') {
            message.channel.send('Please #mention the channel you would like to add to the list, or copy/paste the channel ID.');
            reply = await msgCollector();
            const newChannel = await getChannel(reply.content);
            if (!config[changeName].includes(newChannel.id)) {
              config[changeName].push(newChannel.id);
              writeConfig();
              return message.channel.send(`Added ${newChannel} to *${changeDesc}*`);
            }
            else {return message.channel.send(`${newChannel} is already a part of *${changeDesc}*`);}
          }
          else if (reply.content.toLowerCase() == 'remove' && config[changeName].length > 0) {
            const chanArr = [];
            const msgArr = [];
            i = 0;
            for (const chanID of config[changeName]) {
              i++;
              const chan = await getChannel(chanID);
              if (chan) {
                chanArr.push(chan);
                msgArr.push(`${i}. ${chan}`);
              }
              else {
                msgArr.push(`Bad channel ID in config.json! See console for details; type ${i} to just delete this entry.`);
                console.log(`Could not find channel ID ${chanID} in ${changeName}!`);
              }
            }
            message.channel.send(`Please choose from the following to remove:\n${msgArr.join('\n')}\ntype all to remove all items.\ntype 0 to cancel.`);
            reply = await msgCollector();
            if (!reply) { return; }
            else if (reply.content.toLowerCase == 'all') {
              config[changeName] = [];
              writeConfig();
              return message.channel.send(`Cleared all *${changeDesc}* entries.`);
            }
            else if (parseInt(reply.content) > config[changeName].length) {
              return message.channel.send('Invalid entry! That\'s more than the highest item on the list!');
            }
            else if (reply.content == 0) {
              return message.channel.send('Canceled. No values changed.');
            }
            else if (reply.content.includes('.') || !parseInt(reply.content)) {
              return message.channel.send('Sorry, I couldn\'t parse that. Please answer with only the number of your response.');
            }
            else {
              const indexToRemove = parseInt(reply.content) - 1;
              const removedChan = await getChannel(config[changeName][indexToRemove]);
              config[changeName].splice(indexToRemove, 1);
              writeConfig();
              if (removedChan) { return message.channel.send(`Removed ${removedChan} from *${changeDesc}*.`); }
              else { return message.channel.send(`Removed bad entry ${config[changeName][indexToRemove]} from *${changeDesc}*`); }
            }
          }
        }
      }
    }
    // else { message.channel.send('hmm, check your input'); }
  },
};