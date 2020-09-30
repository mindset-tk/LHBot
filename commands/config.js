const fs = require('fs');
const Discord = require('discord.js');
const path = require('path');
const configPath = path.resolve('./config.json');
const config = require(configPath);
const countingDataPath = path.resolve('./counting.json');
if(global.countingData == null) {
  global.countingData = require(countingDataPath);
}
const eventPath = path.resolve('./commands/event.js');
const event = require(eventPath);

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
      ['roleAirlock', 'Airlock Role', 'role'],
      ['airlockChannel', 'Name of or prefix for airlock channels', 'string'],
      ['airlockPruneDays', 'Max days for airlock prune since last post', 'integer'],
      ['airlockPruneMessage', 'Kick message used when airlock is pruned', 'string'],
      ['invLogToggle', 'Toggle invite logging and reporting', 'boolean'],
      ['channelInvLogs', 'Invite logging channel', 'channel'],
      ['knownInvites', 'Invite code descriptions', 'inviteCodesArray'],
      ['channelLobby', 'Lobby channel for creating new invites', 'channel'],
      ['countingToggle', 'Toggle counting', 'boolean'],
      ['countingChannelId', 'Counting channel', 'channel'],
      ['voiceTextChannelIds', 'Text channel(s) for voice commands', 'channelArray'],
      ['voiceChamberDefaultSizes', 'Default sizes for size-limited channels', 'voiceChamberSettings'],
      ['voiceChamberSnapbackDelay', 'Delay before empty size-limited channels revert to default sizes', 'integer'],
      ['pinsToPin', 'Number of pin reacts to pin a message', 'integer'],
      ['pinIgnoreChannels', 'Channel(s) to ignore for pinning', 'channelArray'],
      ['botChannelId', 'Bot stuff channel', 'channel'],
      ['eventInfoChannelId', 'Event announce channel', 'channel']];
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
      const voiceTextChans = [];
      const cfgVoiceChans = [];
      const knownInv = [];
      config.pinIgnoreChannels.forEach(chanID => ignoreChans.push(getChannelName(chanID)));
      config.voiceTextChannelIds.forEach(chanID => voiceTextChans.push(getChannelName(chanID)));
      if (config.knownInvites) {config.knownInvites.forEach(inv => knownInv.push("**" + inv[1] + "** (" + inv[0] + ")"));}
//      console.log((Object.keys(config[voiceChamberDefaultSizes]).length == 0));
      if(typeof config.voiceChamberDefaultSizes == "object") Object.keys(config.voiceChamberDefaultSizes).forEach(chanID => cfgVoiceChans.push("#" + config.voiceChamberDefaultSizes[chanID].Name + " (Size: " + config.voiceChamberDefaultSizes[chanID].Size + ")"));

      return `Here's my current configuration:
__General settings__
Command prefix: **${config.prefix}**
Staff role: **${config.roleStaff ? "@" + getRoleName(config.roleStaff) : "Not set"}**
Member role: **${config.roleComrade ? "@" + getRoleName(config.roleComrade) : "Not set"}**
Airlock role: **${config.roleAirlock ? "@" + getRoleName(config.roleAirlock) : "Not set"}**

__Special Channels:__
User join/exit notifications: **${config.invLogToggle ? ('#' + getChannelName(config.channelInvLogs)) : 'off.'}**
Counting: **${config.countingToggle ? ('#' + getChannelName(config.countingChannelId)) : 'off.'}**
Text channels to use for voice-related commands: **${(config.voiceTextChannelIds[0]) ? '#' + voiceTextChans.join(', #') : 'None'}**
Configured user-limited voice channels: **${(cfgVoiceChans[0]) ? cfgVoiceChans.join(', ') : 'None'}**
Bot channel: **${config.botChannelId ? ('#' + getChannelName(config.botChannelId)) : 'not set.'}** (Note: does nothing at this time)
Event announcement channel: **${config.eventInfoChannelId ? ('#' + getChannelName(config.eventInfoChannelId)) : 'not set.'}**
Airlock Channel Name/Prefix: **${config.airlockChannel ? config.airlockChannel : "Not set"}**
Lobby channel for invites: **${config.channelLobby ? ('#' + getChannelName(config.channelLobby)) : 'not set.'}**

__Message Settings:__
Airlock Prune Message: **${config.airlockPruneMessage ? config.airlockPruneMessage : "Not set"}**

__Other Settings:__
Invite code descriptions: ${(knownInv[0]) ? knownInv.join(', ') : '**None**'}
User-limited voice channels snapback delay: **${config.voiceChamberSnapbackDelay ? config.voiceChamberSnapbackDelay : 'Not set, defaulting to 5min'}**
Max days since last post for airlock prune: **${config.airlockPruneDays ? config.airlockPruneDays : 'Not set, defaulting to 7 days'}**

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
      if (!reply) { return; }
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
          if(!reply) {return;}
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
          if (!reply) {return;}
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
          if(!reply) {return;}
          const newChannel = await getChannel(reply.content);
          const oldChannelID = config[changeName] || null;
          if (newChannel) {
            config[changeName] = newChannel.id;
            writeConfig();
            if (changeName == 'countingChannelId') {
              global.countingData.lastCount = 0;
              global.countingData.lastMessage = message.id;
              writeCounting();
              return message.channel.send(`${changeDesc} is now ${newChannel}. Count has been reset to 0.`);
            }
            if (changeName == 'eventInfoChannelId') {
              await event.regenMsgs(oldChannelID, newChannel.id, message.guild);
              return message.channel.send(`${changeDesc} is now ${newChannel}. Deleting info messages from old channel (if applicable) and recreating.`);
            }
            return message.channel.send(`${changeDesc} is now ${newChannel}.`);
          }
          else {return message.channel.send(`Sorry, I couldn't parse '${reply.content}' into a channel. Please #mention the channel or copy/paste the channel ID.`);}
        }
        else if (changeType == 'role') {
          replyContent += ' Please @mention the role you would like it changed to, or copy/paste the role ID.';
          message.channel.send(replyContent);
          reply = await msgCollector();
          if(!reply) {return;}
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
          if(!reply) {return;}
          if (!reply.content.includes('.') && parseInt(reply.content)) {
            config[changeName] = parseInt(reply.content);
            writeConfig();
            return message.channel.send(`${changeDesc} is now **${parseInt(reply.content)}**`);
          }
          else {return message.channel.send(`Sorry, I couldn't parse '${reply.content}' into a count. Please enter an integer (no decimals).`);}
        }
        else if (changeType == 'string') {
          replyContent += ' What would you like to change it to?';
          message.channel.send(replyContent);
          reply = await msgCollector();
          if(!reply) {return;}
            config[changeName] = reply.content.replace(/"/g, '');
            writeConfig();
            return message.channel.send(`${changeDesc} is now **${reply.content.replace(/"/g, '')}**`);
        }
        
        
        
        
        
        else if (changeType == 'voiceChamberSettings') {
          replyContent += ' Would you like to **add**, **remove**, or **change** a channel from the list?';
          message.channel.send(replyContent);
          reply = await msgCollector();
          if(!reply) {return;}
          if (reply.content.toLowerCase() == 'add') {
            message.channel.send('Please paste the channel ID.');
            reply = await msgCollector();
            if(!reply) {return;}
            const newChannel = await getChannel(reply.content);
            if (!config[changeName]) {
              config[changeName] = new Object();
            }
            if (!config[changeName][newChannel.id]) {
              config[changeName][newChannel.id] = new Object();
              message.channel.send('Please enter the default name for the channel (this should really be 24 chars or less). You can say "current" to use the name it already has');
              reply = await msgCollector();
              if(!reply) {return;}
              if(reply.content.toLowerCase() == 'current') {
                config[changeName][newChannel.id]["Name"] = newChannel.name.replace(/"/g, '');
              } else {
                config[changeName][newChannel.id]["Name"] = reply.content.replace(/"/g, '');
              }
              message.channel.send('Please send the default user limit for this channel (e.g. "4")');
              reply = await msgCollector();
              if(!reply) {return;}         
              if (!reply.content.includes('.') && parseInt(reply.content) && reply.content <= 99) {
                config[changeName][newChannel.id]["Size"] = reply.content;
                writeConfig();
                return message.channel.send(`Added ${newChannel} to the list of voice chambers with a default size of **${parseInt(reply.content)}**`);
              }
              else {return message.channel.send(`Sorry, I couldn't parse '${reply.content}' into a count or the entry was over 99 (discord's max). Please enter an integer (no decimals) 99 or under.`);}
            }
            else {return message.channel.send(`${newChannel} is already in the list of voice chambers`);}
          }
          
          else if (reply.content.toLowerCase() == 'remove') {
            if(!config.voiceChamberDefaultSizes) { return message.channel.send("No channels have been setup, you should do that first"); }
            else if(Object.keys(config[changeName]).length == 0) { return message.channel.send("No channels have been setup, you should do that first"); }
            
            const chanArr = [];
            const msgArr = [];
            i = 0;
            for (const chanID in config[changeName]) {
              i++;
              const chan = await getChannel(chanID);
              if (chan) {
                chanArr.push(chan);
                msgArr.push(`${i}. ${config[changeName][chanID]["Name"]}`);
              }
              else {
                msgArr.push(`Bad channel ID in config.json! See console for details; type ${i} to just delete this entry.`);
                console.log(`Could not find channel ID ${chanID} in ${changeName}!`);
              }
            }
            message.channel.send(`Please choose from the following to remove:\n${msgArr.join('\n')}\ntype all to remove all items.\ntype 0 to cancel.`);
            reply = await msgCollector();
            if (!reply) { return; }
            else if (reply.content.toLowerCase() == "all") {
              config[changeName] = {};
              writeConfig();
              return message.channel.send(`Cleared all *${changeDesc}* entries.`);
            }
            else if (parseInt(reply.content) > Object.keys(config[changeName]).length) {
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
              const removedChan = await getChannel(Object.keys(config[changeName])[indexToRemove]);
              delete config[changeName][Object.keys(config[changeName])[indexToRemove]];
              writeConfig();
              if (removedChan) { return message.channel.send(`Removed ${removedChan} from *${changeDesc}*.`); }
              else { return message.channel.send(`Removed bad entry ${config[changeName][indexToRemove]} from *${changeDesc}*`); }
            }
          }
          
          else if (reply.content.toLowerCase() == 'change') {
            if(!config.voiceChamberDefaultSizes) { return message.channel.send("No channels have been setup, you should do that first"); }
            else if(Object.keys(config[changeName]).length == 0) { return message.channel.send("No channels have been setup, you should do that first"); }
            
            const chanArr = [];
            const msgArr = [];
            i = 0;
            for (const chanID in config[changeName]) {
              i++;
              const chan = await getChannel(chanID);
              if (chan) {
                chanArr.push(chan);
                msgArr.push(`${i}. ${config[changeName][chanID]["Name"]} (default size: ${config[changeName][chanID]["Size"]})`);
              }
              else {
                msgArr.push(`Bad channel ID in config.json! See console for details; type ${i} to just delete this entry.`);
                console.log(`Could not find channel ID ${chanID} in ${changeName}!`);
              }
            }
            message.channel.send(`Please choose from the following to change:\n${msgArr.join('\n')}\ntype 0 to cancel.`);
            reply = await msgCollector();
            if (!reply) { return; }
            else if (parseInt(reply.content) > Object.keys(config[changeName]).length) {
              return message.channel.send('Invalid entry! That\'s more than the highest item on the list!');
            }
            else if (reply.content == 0) {
              return message.channel.send('Canceled. No values changed.');
            }
            else if (reply.content.includes('.') || !parseInt(reply.content)) {
              return message.channel.send('Sorry, I couldn\'t parse that. Please answer with only the number of your response.');
            }
            else {
              const indexToChange = parseInt(reply.content) - 1;
              const chanID = Object.keys(config[changeName])[indexToChange];

              message.channel.send(`Do you want to change the default **name**, **size**, or **both**?`);
              reply = await msgCollector();
              if (!reply) { return; }

              const changeType = reply.content.toLowerCase();              
              
              if (changeType == "name" || changeType == "both") {
                message.channel.send('Please enter the default name for the channel (this should really be 24 chars or less)');
                reply = await msgCollector();
                if(!reply) {return;}         
                config[changeName][chanID]["Name"] = reply.content.replace(/"/g, '');
              }
  
              if (changeType == "size" || changeType == "both") {
                message.channel.send('Please send the default user limit for this channel (e.g. "4")');
                reply = await msgCollector();
                if(!reply) {return;}         
                if (!reply.content.includes('.') && parseInt(reply.content) && reply.content <= 99) {
                  config[changeName][chanID]["Size"] = reply.content;
                } else {
                  return message.channel.send("Sorry, I couldn't parse that, or the entry was over 99 (discord's max). Please enter an integer (no decimals) 99 or under.");
                }
              }

            writeConfig();
            return message.channel.send(`Updated ${config[changeName][chanID]["Name"]}'s defaults. The default size is **${config[changeName][chanID]["Size"]}**`);
            }
          }
        }




        else if (changeType == 'inviteCodesArray') {
          if (!config[changeName]) {config[changeName] = [];} 
          replyContent += ' Would you like to **add**, **remove**, or **change** an invite code description from the list?';
          message.channel.send(replyContent);
          reply = await msgCollector();
          if(!reply) {return;}
          if (reply.content.toLowerCase() == 'add') {
            message.channel.send('Please say the invite code you would like to add to the list');
            reply = await msgCollector();
            if(!reply) {return;}
            let response = reply.content.slice(-7);
            const knownInvites = new Map(config.knownInvites);
            if (!knownInvites.has(response)) {
              message.guild.fetchInvites().then(async guildInvites => {
                let invite = new Discord.Collection();
                if (guildInvites.has(response)) {
                  invite = guildInvites.get(response);
                  const inviter = client.users.cache.get(invite.inviter.id);
                  message.channel.send("Okay, what do you want the description to be?");
                  reply = await msgCollector();
                  if(!reply) {return;}
                  config[changeName].push([invite.code, reply.content.replace(/"/g, '')]);                  
                  writeConfig();
                  return message.channel.send(`Ok! **${reply.content.replace(/"/g, '')}** (${invite.code}) by <@${inviter.id}> (${inviter.username}#${inviter.discriminator} / ${inviter.id}) has been added to the *${changeDesc}*`);
                }
                else {
                  return message.channel.send("The invite code you provided wasn't found on the server. Please make sure you pasted it in correctly!");
                }
              });
            } else {
                  return message.channel.send(`**${knownInvites.get(response)}** (${response}) is already in *${changeDesc}*`);
            }
          }
          if ((reply.content.toLowerCase() == 'remove' || reply.content.toLowerCase() == 'change')) {
          if (config[changeName].length == 0) { return message.channel.send("No invite code descriptions have been setup, you should do that first"); }
            const action = reply.content.toLowerCase();
            const invCodeArr = [];
            const msgArr = [];
            i = 0;
            for (const invcode of config[changeName]) {
              i++;
              invCodeArr.push(invcode);
              msgArr.push(`${i}. **${invcode[1]}** (${invcode[0]})`);
            }
            if (action == "remove") msgArr.push("\ntype all to remove all items.");
            message.channel.send(`Please choose from the following to ${action}:\n${msgArr.join('\n')}\ntype 0 to cancel.`);
            reply = await msgCollector();
            if (!reply) { return; }
            else if (reply.content.toLowerCase() == 'all' && action == "remove") {
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
              const index = parseInt(reply.content) - 1;
              const selectedInv = config[changeName][index];
              if (action == "remove") {
                config[changeName].splice(index, 1);
                writeConfig();
                return message.channel.send(`Removed ${selectedInv[1]} (${selectedInv[0]}) from *${changeDesc}*.`);
              }
              else if (action == "change") {
                message.channel.send('What should be the new description for this invite code?');
                reply = await msgCollector();
                if(!reply) {return;}
                config[changeName][index][1] = reply.content.replace(/"/g, '');
                writeConfig();
                return message.channel.send(`Changed the description for ${selectedInv[0]} from ${selectedInv[1]} to ${config[changeName][index][1]} in the *${changeDesc}*.`);
              }
            }
          }
        }
            
        else if (changeType == 'channelArray') {
          replyContent += ' Would you like to add or remove a channel from the list?';
          message.channel.send(replyContent);
          reply = await msgCollector();
          if(!reply) {return;}
          if (reply.content.toLowerCase() == 'add') {
            message.channel.send('Please #mention the channel you would like to add to the list, or copy/paste the channel ID.');
            reply = await msgCollector();
            if(!reply) {return;}
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
            else if (reply.content.toLowerCase() == 'all') {
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