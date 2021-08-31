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
function writeConfig(message) {
  fs.writeFileSync(configPath, prettyPrintConfig(), function(err) {
    if (err) {
      if (message) { message.channel.send('There was an error saving the config file!'); }
      else { console.error('Error saving config!'); }
      return console.error(err);
    }
  });
}

// initializing configurable parts of config.json
// current varTypes are boolean, integer, channel, role, channelArray, inviteCodesArray, and prefix
// prefix is specifically for command prefixes. It gets run through a special filter.
// channel and role are a single ID for their respective type and are stored as strings.
// channelArray is an array of channelIDs.
// inviteCodesArray is an array of known invite codes that have been given descriptors.
// boolean and integer are as labeled.
const configurableProps = [{ varName:'prefix', description:'Command Prefix', varType:'prefix' },
  { varName:'roleStaff', description:'Staff Role', varType:'role' },
  { varName:'roleComrade', description:'Comrade Role', varType:'role' },
  { varName:'roleAirlock', description:'Airlock Role', varType:'role' },
  { varName:'airlockChannel', description:'Airlock Channel(s) Name/Prefix', varType:'string' },
  { varName:'airlockPruneDays', description:'Max Inactivity for __airlock prune eligibility__', varType:'integer' },
  { varName:'airlockPruneMessage', description:'Airlock prune kick message', varType:'string' },
  { varName:'pruneTitle', description:'Prune Channel/Role Name', varType:'string' },
  //  {varName:'pruneIntroMessage', description:'Prune Channel Intro Message', varType:'string'},
  { varName:'invLogToggle', description:'Toggle __Invite Iogging__', varType:'boolean' },
  { varName:'channelInvLogs', description:'Channel for logging joins/leaves', varType:'channel' },
  { varName:'knownInvites', description:'Invite Code Descriptions', varType:'inviteCodesArray' },
  { varName:'avatarLogToggle', description:'Toggle __avatar change__ logging/reporting', varType:'boolean' },
  { varName:'channelAvatarLogs', description:'Channel for logging avatar changes', varType:'channel' },
  { varName:'avatarLogAirlockOnlyToggle', description:'Toggle __airlock exclusive__ avatar logging/reporting', varType:'boolean' },
  { varName:'channelLobby', description:'Lobby channel', varType:'channel' },
  { varName:'countingToggle', description:'Toggle counting', varType:'boolean' },
  { varName:'countingChannelId', description:'Counting channel', varType:'channel' },
  { varName:'questionChannelIds', description:'Text channel(s) for Thoughtful Question Generator', varType:'channelArray' },
  { varName:'voiceTextChannelIds', description:'Text channel(s) for voice commands', varType:'channelArray' },
  { varName:'voiceChamberDefaultSizes', description:'Default limits for size-limited channels', varType:'voiceChamberSettings' },
  { varName:'voiceChamberSnapbackDelay', description:'Minutes before cofigured voice channels revert once empty', varType:'integer' },
  { varName:'pinsToPin', description:'Number of pin reacts to pin a message', varType:'integer' },
  { varName:'pinIgnoreChannels', description:'Channel(s) to ignore for pinning', varType:'channelArray' },
  { varName:'botChannelId', description:'Bot stuff channel', varType:'channel' },
  { varName:'disboardChannelId', description:'Disboard Bumping Channel', varType:'channel' },
  { varName:'eventInfoChannelId', description:'Event announce channel', varType:'channel' },
  { varName:'starboardToggle', description:'Toggle starboard functionality', varType:'boolean' },
  { varName:'starboardChannelId', description:'Starboard channel', varType:'channel' },
  { varName:'starThreshold', description:'Number of stars to starboard a message', varType:'integer' },
  { varName:'starboardIgnoreChannels', description:'Channel(s) to ignore for starboarding', varType:'channelArray' },
  { varName:'starboardPrivateChannels', description:'Channel(s) to consider private for starboarding purposes', varType:'channelArray' }];

module.exports = {
  name: 'config',
  description: 'Access configuration options for this bot.',
  usage: '',
  cooldown: 3,
  guildOnly: true,
  staffOnly: true,
  args: false,
  async execute(message, args, client) {
    // declaring some useful functions.

    // function to get a channel name from a chanID
    function getChannelName(channelID) {
      const channelObj = client.channels.cache.get(channelID);
      if (channelObj) {return channelObj.name;}
      else {return '[invalid or deleted channel]';}
    }
    // function to get a role name from a roleID
    function getRoleName(roleID) {
      const roleObj = message.guild.roles.cache.get(roleID);
      if (roleObj) {return roleObj.name;}
      else {return '[invalid or deleted role]';}
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
        .catch(() => message.channel.send('Sorry, I waited 30 seconds with no response, please run the command again.'));
      // console.log('Reply processed...');
      return reply;
    }

    function outputConfig() {
      const ignoreChans = [];
      const questionChans = config.questionChannelIds.map((id) => getChannelName(id));
      const voiceTextChans = [];
      const cfgVoiceChans = [];
      const starboardIgnoreChans = [];
      const starboardPrivateChans = [];
      const knownInv = [];
      config.pinIgnoreChannels.forEach(chanID => ignoreChans.push(getChannelName(chanID)));
      config.voiceTextChannelIds.forEach(chanID => voiceTextChans.push(getChannelName(chanID)));
      config.starboardIgnoreChannels.forEach(chanID => starboardIgnoreChans.push(getChannelName(chanID)));
      config.starboardPrivateChannels.forEach(chanID => starboardPrivateChans.push(getChannelName(chanID)));
      if (config.knownInvites) {config.knownInvites.forEach(inv => knownInv.push('**' + inv[1] + '** (' + inv[0] + ')'));}
      //      console.log((Object.keys(config[voiceChamberDefaultSizes]).length == 0));
      if(typeof config.voiceChamberDefaultSizes == 'object') Object.keys(config.voiceChamberDefaultSizes).forEach(chanID => cfgVoiceChans.push('#' + config.voiceChamberDefaultSizes[chanID].Name + ' (Size: ' + config.voiceChamberDefaultSizes[chanID].Size + ')'));

      return `Here's my current configuration:
__General settings__
Command prefix: **${config.prefix}**
Staff role: **${config.roleStaff ? '@' + getRoleName(config.roleStaff) : 'Not set'}**
Member role: **${config.roleComrade ? '@' + getRoleName(config.roleComrade) : 'Not set'}**
Airlock role: **${config.roleAirlock ? '@' + getRoleName(config.roleAirlock) : 'Not set'}**

__Special Channels:__
Counting: **${config.countingToggle ? ('#' + getChannelName(config.countingChannelId)) : 'Off.'}**
Bot channel: **${config.botChannelId ? ('#' + getChannelName(config.botChannelId)) : 'Not set.'}**
Disboard Bump Channel: **${config.disboardChannelId ? ('#' + getChannelName(config.disboardChannelId)) : 'Not set.'}**
Event announcement channel: **${config.eventInfoChannelId ? ('#' + getChannelName(config.eventInfoChannelId)) : 'Not set.'}**
Airlock Channel Name/Prefix: **${config.airlockChannel ? config.airlockChannel : 'Not set'}**
Lobby channel: **${config.channelLobby ? ('#' + getChannelName(config.channelLobby)) : 'Not set.'}**
Prune Channel/Role Name: **${config.pruneTitle ? config.pruneTitle : 'Default (prune-limbo)'}**

__Logging/Notification Settings:__
User join/exit notifications: **${config.invLogToggle ? ('On!** In: **#' + getChannelName(config.channelInvLogs)) : 'Off.'}**
Log avatar changes: **${config.avatarLogToggle ? 'On!** In: ' + (config.channelAvatarLogs ? '**#' + getChannelName(config.channelAvatarLogs) + '**' : 'Not Set') + ' (for: ' + (config.avatarLogAirlockOnlyToggle ? '**airlock role only**)' : '**all members**)') : 'Off.**'}
Defined Invite Codes: ${(knownInv[0]) ? knownInv.join(', ') : '**None.**'}

__Voice Channel & Command Settings:__
Text channel(s) for voice commands: **${(config.voiceTextChannelIds[0]) ? '#' + voiceTextChans.join(', #') : 'None.'}**
Configured user-limited voice channels: **${(cfgVoiceChans[0]) ? cfgVoiceChans.join(', ') : 'None.'}**
Configured VC Snapback Delay: **${config.voiceChamberSnapbackDelay ? config.voiceChamberSnapbackDelay : 'Not set, defaulting to 5min.'}**

__Airlock/Lobby Settings:__
Airlock Prune Inactivity Limit: **${config.airlockPruneDays ? config.airlockPruneDays + 'day(s)' : 'Not set, defaulting to 7 days.'}**
Airlock Prune Message: **${config.airlockPruneMessage ? config.airlockPruneMessage : 'Not set.'}**

__Pins:__
Pin reacts needed to pin a message: **${config.pinsToPin}**
Channel(s) to ignore for pinning: **${(config.pinIgnoreChannels[0]) ? '#' + ignoreChans.join(', #') : 'None.'}**

__Starboard:__
Starboard: **${(config.starboardToggle) ? 'ON' : 'OFF'}**
Starboard Channel: ${config.starboardChannelId ? `**#${getChannelName(config.starboardChannelId)}**` : 'Not set. Starboard functionality disabled.'}
Star reaction threshold to post starboard: **${(config.starThreshold) ? config.starThreshold : (config.starboardChannelId) ? 'Not set. Starboard functionality disabled.' : 'N/A'}**
Channels to ignore for starboarding: **${(config.starboardIgnoreChannels[0]) ? '#' + starboardIgnoreChans.join(', #') : 'None.'}**
Channels considered private for starboarding (user must affirm they are OK with a post going to starboard): **${(config.starboardPrivateChannels[0]) ? '#' + starboardPrivateChans.join(', #') : 'None.'}**

__Miscellaneous:__
Thoughtful Question Generator channels: **${config.questionChannelIds[0] ? `#${questionChans.join(', #')}` : 'None.'}**`;
    }
    // initialize disallowed prefix characters. None of these will be permitted in any part of the command prefix.
    const disallowedPrefix = ['@', '#', '/', '\\', '\\\\', '*', '~', '_'];

    if (args[0] && args[0].toLowerCase() == 'list' && args.length == 1) {
      return message.channel.send(outputConfig());
    }
    else if (args[0]) { return message.channel.send('I\'m sorry but I couldn\'t parse `' + args.join(' ') + '`');}
    // if command has no args, start the chat wizard to modify commands.
    else {
      message.channel.send(outputConfig() + '\n\n**Would you like to change any of these settings? (Y/N)**', { split: true });
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
      // parse through all configurable properties and place their description in a list.
      configurableProps.forEach(prop => {
        i++;
        msgData.push(`${i}. ${prop.description}`);
      });
      message.channel.send(`Which item would you like to change?\n${msgData.join('\n')}\nType 0 to cancel.`, { split: true });
      reply = await msgCollector();
      if (!reply) { return; }
      else if (reply.content == 0) { return message.channel.send('Canceling!');}
      else if (!parseInt(reply.content)) { return message.channel.send('Sorry, I couldn\'t parse that. Please answer with only the number of your response.'); }
      else if (configurableProps[parseInt(reply.content) - 1]) {
        const change = configurableProps[parseInt(reply.content) - 1];
        let replyContent = `Ok, so you want to change *${change.description}*.`;
        // handle response depending on the type of entry.
        if (change.varType == 'prefix') {
          replyContent += ' What would you like to change it to? (case sensitive)';
          message.channel.send(replyContent);
          reply = await msgCollector();
          if(!reply) {return;}
          if (reply.content.includes(' ')) { return message.channel.send('Sorry, I am unable to utilize prefixes that include a space.'); }
          else if (disallowedPrefix.some(noPrefix => reply.content.toLowerCase().includes(noPrefix.toLowerCase()))) { return message.channel.send('Sorry, the characters ' + disallowedPrefix.join('') + ' cannot be used in a prefix as each will conflict with some functionality of Discord.'); }
          else {
            config[change.varName] = reply.content;
            writeConfig(message);
            return message.channel.send(`Setting ${change.description} to '**${reply.content}**'.`);
          }
        }
        else if (change.varType == 'boolean') {
          replyContent += ' Would you like to turn it on or off?';
          message.channel.send(replyContent);
          reply = await msgCollector();
          if (!reply) {return;}
          switch (reply.content.toLowerCase()) {
          case 'on':
          case 'true':
            config[change.varName] = true;
            writeConfig(message);
            return message.channel.send(`${change.description} is now '**ON**'.`);
          case 'off':
          case 'false':
            config[change.varName] = false;
            writeConfig(message);
            return message.channel.send(`${change.description} is now '**OFF**'.`);
          default:
            return message.channel.send(`I'm sorry, I couldn't parse "${reply.content}". Please use 'on' or 'off' to set this setting.`);
          }
        }
        else if (change.varType == 'channel') {
          replyContent += ' Please #mention the channel you would like it changed to, or copy/paste the channel ID.';
          message.channel.send(replyContent);
          reply = await msgCollector();
          if(!reply) {return;}
          const newChannel = await getChannel(reply.content);
          const oldChannelID = config[change.varName] || null;
          if (newChannel) {
            config[change.varName] = newChannel.id;
            writeConfig(message);
            if (change.varName == 'countingChannelId') {
              global.countingData.lastCount = 0;
              global.countingData.lastMessage = message.id;
              writeCounting();
              return message.channel.send(`${change.description} is now ${newChannel}. Count has been reset to 0.`);
            }
            if (change.varName == 'eventInfoChannelId') {
              await event.regenMsgs(oldChannelID, newChannel.id, message.guild);
              return message.channel.send(`${change.description} is now ${newChannel}. Deleting info messages from old channel (if applicable) and recreating.`);
            }
            if (change.varName == 'starboardChannelId') {
              return message.channel.send(`${change.description} is now ${newChannel}. Defaulting starboard threshold to 5 stars. This can be changed with the config command.`);
            }
            return message.channel.send(`${change.description} is now ${newChannel}.`);
          }
          else {return message.channel.send(`Sorry, I couldn't parse '${reply.content}' into a channel. Please #mention the channel or copy/paste the channel ID.`);}
        }
        else if (change.varType == 'role') {
          replyContent += ' Please @mention the role you would like it changed to, or copy/paste the role ID.';
          message.channel.send(replyContent);
          reply = await msgCollector();
          if(!reply) {return;}
          const newRole = await getRole(reply.content);
          if (newRole) {
            config[change.varName] = newRole.id;
            writeConfig(message);
            return message.channel.send(`${change.description} is now **${newRole.name}**.`);
          }
          else {return message.channel.send(`Sorry, I couldn't parse '${reply.content}' into a role. Please @mention the role or copy/paste the role ID.`);}
        }
        else if (change.varType == 'integer') {
          replyContent += ' What would you like to change it to?';
          message.channel.send(replyContent);
          reply = await msgCollector();
          if(!reply) {return;}
          if (!reply.content.includes('.') && parseInt(reply.content)) {
            config[change.varName] = parseInt(reply.content);
            writeConfig(message);
            return message.channel.send(`${change.description} is now **${parseInt(reply.content)}**.`);
          }
          else {return message.channel.send(`Sorry, I couldn't parse '${reply.content}' into a count. Please enter an integer (no decimals).`);}
        }
        else if (change.varType == 'string') {
          replyContent += ' What would you like to change it to?';
          message.channel.send(replyContent);
          reply = await msgCollector();
          if(!reply) {return;}
          config[change.varName] = reply.content.replace(/"/g, '');
          writeConfig(message);
          return message.channel.send(`${change.description} is now **${reply.content.replace(/"/g, '')}**.`);
        }


        else if (change.varType == 'voiceChamberSettings') {
          replyContent += ' Would you like to **add**, **remove**, or **change** a channel from the list?';
          message.channel.send(replyContent);
          reply = await msgCollector();
          if(!reply) {return;}
          if (reply.content.toLowerCase() == 'add') {
            message.channel.send('Please paste the channel ID.');
            reply = await msgCollector();
            if(!reply) {return;}
            const newChannel = await getChannel(reply.content);
            if (!config[change.varName]) {
              config[change.varName] = new Object();
            }
            if (!config[change.varName][newChannel.id]) {
              config[change.varName][newChannel.id] = new Object();
              message.channel.send('Please enter the default name for the channel (this should really be 24 chars or less). You can say "current" to use the name it already has');
              reply = await msgCollector();
              if(!reply) {return;}
              if(reply.content.toLowerCase() == 'current') {
                config[change.varName][newChannel.id]['Name'] = newChannel.name.replace(/"/g, '');
              }
              else {
                config[change.varName][newChannel.id]['Name'] = reply.content.replace(/"/g, '');
              }
              message.channel.send('Please send the default user limit for this channel (e.g. "4")');
              reply = await msgCollector();
              if(!reply) {return;}
              if (!reply.content.includes('.') && parseInt(reply.content) && reply.content <= 99) {
                config[change.varName][newChannel.id]['Size'] = reply.content;
                writeConfig(message);
                return message.channel.send(`Added ${newChannel} to the list of voice chambers with a default size of **${parseInt(reply.content)}**`);
              }
              else {return message.channel.send(`Sorry, I couldn't parse '${reply.content}' into a count or the entry was over 99 (discord's max). Please enter an integer (no decimals) 99 or under.`);}
            }
            else {return message.channel.send(`${newChannel} is already in the list of voice chambers`);}
          }

          else if (reply.content.toLowerCase() == 'remove') {
            if(!config.voiceChamberDefaultSizes) { return message.channel.send('No channels have been setup, you should do that first'); }
            else if(Object.keys(config[change.varName]).length == 0) { return message.channel.send('No channels have been setup, you should do that first'); }

            const chanArr = [];
            const msgArr = [];
            i = 0;
            for (const chanID in config[change.varName]) {
              i++;
              const chan = await getChannel(chanID);
              if (chan) {
                chanArr.push(chan);
                msgArr.push(`${i}. ${config[change.varName][chanID]['Name']}`);
              }
              else {
                msgArr.push(`Bad channel ID in config.json! See console for details; type ${i} to just delete this entry.`);
                console.log(`Could not find channel ID ${chanID} in ${change.varName}!`);
              }
            }
            message.channel.send(`Please choose from the following to remove:\n${msgArr.join('\n')}\ntype all to remove all items.\ntype 0 to cancel.`);
            reply = await msgCollector();
            if (!reply) { return; }
            else if (reply.content.toLowerCase() == 'all') {
              config[change.varName] = {};
              writeConfig(message);
              return message.channel.send(`Cleared all *${change.description}* entries.`);
            }
            else if (parseInt(reply.content) > Object.keys(config[change.varName]).length) {
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
              const removedChan = await getChannel(Object.keys(config[change.varName])[indexToRemove]);
              delete config[change.varName][Object.keys(config[change.varName])[indexToRemove]];
              writeConfig(message);
              if (removedChan) { return message.channel.send(`Removed ${removedChan} from *${change.description}*.`); }
              else { return message.channel.send(`Removed bad entry ${config[change.varName][indexToRemove]} from *${change.description}*`); }
            }
          }

          else if (reply.content.toLowerCase() == 'change') {
            if(!config.voiceChamberDefaultSizes) { return message.channel.send('No channels have been setup, you should do that first'); }
            else if(Object.keys(config[change.varName]).length == 0) { return message.channel.send('No channels have been setup, you should do that first'); }

            const chanArr = [];
            const msgArr = [];
            i = 0;
            for (const chanID in config[change.varName]) {
              i++;
              const chan = await getChannel(chanID);
              if (chan) {
                chanArr.push(chan);
                msgArr.push(`${i}. ${config[change.varName][chanID]['Name']} (default size: ${config[change.varName][chanID]['Size']})`);
              }
              else {
                msgArr.push(`Bad channel ID in config.json! See console for details; type ${i} to just delete this entry.`);
                console.log(`Could not find channel ID ${chanID} in ${change.varName}!`);
              }
            }
            message.channel.send(`Please choose from the following to change:\n${msgArr.join('\n')}\ntype 0 to cancel.`);
            reply = await msgCollector();
            if (!reply) { return; }
            else if (parseInt(reply.content) > Object.keys(config[change.varName]).length) {
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
              const chanID = Object.keys(config[change.varName])[indexToChange];

              message.channel.send('Do you want to change the default **name**, **size**, or **both**?');
              reply = await msgCollector();
              if (!reply) { return; }

              const type = reply.content.toLowerCase();

              if (type == 'name' || type == 'both') {
                message.channel.send('Please enter the default name for the channel (this should really be 24 chars or less)');
                reply = await msgCollector();
                if(!reply) {return;}
                config[change.varName][chanID]['Name'] = reply.content.replace(/"/g, '');
              }

              if (type == 'size' || type == 'both') {
                message.channel.send('Please send the default user limit for this channel (e.g. "4")');
                reply = await msgCollector();
                if(!reply) {return;}
                if (!reply.content.includes('.') && parseInt(reply.content) && reply.content <= 99) {
                  config[change.varName][chanID]['Size'] = reply.content;
                }
                else {
                  return message.channel.send('Sorry, I couldn\'t parse that, or the entry was over 99 (discord\'s max). Please enter an integer (no decimals) 99 or under.');
                }
              }

              writeConfig(message);
              return message.channel.send(`Updated ${config[change.varName][chanID]['Name']}'s defaults. The default size is **${config[change.varName][chanID]['Size']}**`);
            }
          }
        }
        else if (change.varType == 'inviteCodesArray') {
          if (!config[change.varName]) {config[change.varName] = [];}
          replyContent += ' Would you like to **add**, **remove**, or **change** an invite code description from the list?';
          message.channel.send(replyContent);
          reply = await msgCollector();
          if(!reply) {return;}
          if (reply.content.toLowerCase() == 'add') {
            message.channel.send('Please say the invite code you would like to add to the list.');
            reply = await msgCollector();
            if(!reply) {return;}
            const response = reply.content.split('/').pop();
            const knownInvites = new Map(config.knownInvites);
            if (!knownInvites.has(response)) {
              message.guild.fetchInvites().then(async guildInvites => {
                let invite = new Discord.Collection();
                if (guildInvites.has(response)) {
                  invite = guildInvites.get(response);
                  const inviter = client.users.cache.get(invite.inviter.id);
                  message.channel.send('Okay, what do you want the description to be?');
                  reply = await msgCollector();
                  if(!reply) {return;}
                  config[change.varName].push([invite.code, reply.content.replace(/"/g, '')]);
                  writeConfig(message);
                  return message.channel.send(`Ok! **${reply.content.replace(/"/g, '')}** (${invite.code}) by <@${inviter.id}> (${inviter.username}#${inviter.discriminator} / ${inviter.id}) has been added to the *${change.description}*`);
                }
                else {
                  return message.channel.send('The invite code you provided wasn\'t found on the server. Please make sure you pasted it in correctly!');
                }
              });
            }
            else {
              return message.channel.send(`**${knownInvites.get(response)}** (${response}) is already in *${change.description}*`);
            }
          }
          if ((reply.content.toLowerCase() == 'remove' || reply.content.toLowerCase() == 'change')) {
            if (config[change.varName].length == 0) { return message.channel.send('No invite code descriptions have been setup, you should do that first'); }
            const action = reply.content.toLowerCase();
            const invCodeArr = [];
            const msgArr = [];
            i = 0;
            for (const invcode of config[change.varName]) {
              i++;
              invCodeArr.push(invcode);
              msgArr.push(`${i}. **${invcode[1]}** (${invcode[0]})`);
            }
            if (action == 'remove') msgArr.push('\ntype all to remove all items.');
            message.channel.send(`Please choose from the following to ${action}:\n${msgArr.join('\n')}\ntype 0 to cancel.`);
            reply = await msgCollector();
            if (!reply) { return; }
            else if (reply.content.toLowerCase() == 'all' && action == 'remove') {
              config[change.varName] = [];
              writeConfig(message);
              return message.channel.send(`Cleared all *${change.description}* entries.`);
            }
            else if (parseInt(reply.content) > config[change.varName].length) {
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
              const selectedInv = config[change.varName][index];
              if (action == 'remove') {
                config[change.varName].splice(index, 1);
                writeConfig(message);
                return message.channel.send(`Removed ${selectedInv[1]} (${selectedInv[0]}) from *${change.description}*.`);
              }
              else if (action == 'change') {
                message.channel.send('What should be the new description for this invite code?');
                reply = await msgCollector();
                if(!reply) {return;}
                config[change.varName][index][1] = reply.content.replace(/"/g, '');
                writeConfig(message);
                return message.channel.send(`Changed the description for ${selectedInv[0]} from ${selectedInv[1]} to ${config[change.varName][index][1]} in the *${change.description}*.`);
              }
            }
          }
        }

        else if (change.varType == 'channelArray') {
          replyContent += ' Would you like to add or remove a channel from the list?';
          message.channel.send(replyContent);
          reply = await msgCollector();
          if(!reply) {return;}
          if (reply.content.toLowerCase() == 'add') {
            message.channel.send('Please #mention or type the channelid of the channel you would like to add to the list, or copy/paste the channel ID. You may also #mention or type the ID of a category for all channels under that category to be added.');
            reply = await msgCollector();
            if(!reply) {return;}
            const newChannel = await getChannel(reply.content);
            if (newChannel.type == 'text') {
              if (!config[change.varName].includes(newChannel.id)) {
                config[change.varName].push(newChannel.id);
                writeConfig(message);
                return message.channel.send(`Added ${newChannel} to *${change.description}*`);
              }
              else {return message.channel.send(`${newChannel} is already a part of *${change.description}*`);}
            }
            else if(newChannel.type == 'category') {
              const alreadyInListArr = [];
              const addedArr = [];
              for (const childChannel of newChannel.children.values()) {
                if (!config[change.varName].includes(childChannel.id)) {
                  config[change.varName].push(childChannel.id);
                  addedArr.push(childChannel);
                }
                else { alreadyInListArr.push(childChannel); }
              }
              writeConfig(message);
              return message.channel.send(`${addedArr.length > 0 ? `Added channels ${addedArr.join(' ')} to ${change.description}` : ''} ${alreadyInListArr.length > 0 ? `${alreadyInListArr.join(' ')} was/were already part of ${change.description}` : ' '}`);
            }
          }
          else if (reply.content.toLowerCase() == 'remove' && config[change.varName].length > 0) {
            const chanArr = [];
            const msgArr = [];
            i = 0;
            for (const chanID of config[change.varName]) {
              i++;
              const chan = await getChannel(chanID);
              if (chan) {
                chanArr.push(chan);
                msgArr.push(`${i}. ${chan}`);
              }
              else {
                msgArr.push(`Bad channel ID in config.json! See console for details; type ${i} to just delete this entry.`);
                console.log(`Could not find channel ID ${chanID} in ${change.varName}!`);
              }
            }
            message.channel.send(`Please choose from the following to remove:\n${msgArr.join('\n')}\ntype all to remove all items.\ntype 0 to cancel.`);
            reply = await msgCollector();
            if (!reply) { return; }
            else if (reply.content.toLowerCase() == 'all') {
              config[change.varName] = [];
              writeConfig(message);
              return message.channel.send(`Cleared all *${change.description}* entries.`);
            }
            else if (parseInt(reply.content) > config[change.varName].length) {
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
              const removedChan = await getChannel(config[change.varName][indexToRemove]);
              config[change.varName].splice(indexToRemove, 1);
              writeConfig(message);
              if (removedChan) { return message.channel.send(`Removed ${removedChan} from *${change.description}*.`); }
              else { return message.channel.send(`Removed bad entry ${config[change.varName][indexToRemove]} from *${change.description}*`); }
            }
          }
        }
      }
    }
    // else { message.channel.send('hmm, check your input'); }
  },
  init() {
    const updatedProps = [];
    // each entry: [varName in config.json, info string, type of entry]
    // current entry types are boolean, integer, channel, role, channelArray, and prefix
    // prefix is specifically for command prefixes. It gets run through a special filter.
    // channel and role are a single ID for their respective type and are stored as strings.
    // channelArray is an array of channelIDs.
    // boolean and integer are as labeled
    configurableProps.forEach(prop => {
      if((!config[prop.varName] && config[prop.varName] !== false) && config[prop.varName] !== '' && config[prop.varName] !== []) {
        updatedProps.push(prop.varName);
        if (prop.varType == 'boolean' || prop.varType == 'string' || prop.varType == 'integer' || prop.varType == 'channel' || prop.varType == 'role' || prop.varType == 'voiceChamberSettings') {
          config[prop.varName] = '';
        }
        else if (prop.varType == 'channelArray' || prop.varType == 'inviteCodesArray') {
          config[prop.varName] = [];
        }
      }
    });
    if (updatedProps.length > 0) {
      console.log(`config was missing ${updatedProps.join(', ')}. Initializing these to blank or empty values. Please use config commands or fill these in by hand.`);
      writeConfig();
    }
  },
};