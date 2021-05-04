const path = require('path');
const configPath = path.resolve('./config.json');
const config = require(configPath);
const wait = require('util').promisify(setTimeout);

async function updateChannel(type, args, message) {
  const isStaff = message.member.roles.cache.has(config.roleStaff);

  if (!isStaff && !config.voiceTextChannelIds.includes(message.channel.id)) {
    let outMsg = 'Please use this command only in these channels:';
    config.voiceTextChannelIds.forEach(channelId => outMsg += ' <#' + message.guild.channels.resolve(channelId).id + '>');
    return message.channel.send(outMsg);
  }

  // Find the channel
  let voiceChannel;
  if(args.length > 1 && isStaff) {
    // Check for second argument
    const vcArg = message.guild.channels.resolve(args[0]);
    if(vcArg && vcArg.type == 'voice') {
      voiceChannel = vcArg;
      args.shift();
    }
  }

  if(!voiceChannel) {
    voiceChannel = message.member.voice.channel;
    if (!voiceChannel) return message.channel.send('Please join a voice channel and try again!');
  }

  const mypermissions = message.guild.me.permissionsIn(voiceChannel);
  if (!mypermissions.has(['MANAGE_CHANNELS'])) {
    return message.channel.send('Sorry, I don\'t have permission to set the ' + type + ' of that channel.');
  }

  if (!config.voiceChamberDefaultSizes[voiceChannel.id]) {
    return message.channel.send('Sorry, I can only change the ' + type + ' of channels that are configured for it.');
  }

  if (type === 'size') {
    const newSize = parseInt(args[0]);
    if (isNaN(newSize)) {
      return message.channel.send('You\'ll need to give me a number to set the user limit to');
    }
    if (newSize == 0) {
      return message.channel.send('Sorry, I cannot remove the limit from a channel.');
    }
    if (newSize > 99) {
      return message.channel.send('Sorry, I cannot set a limit higher than 99.');
    }

    voiceChannel.setUserLimit(newSize);
    return message.channel.send(`Set the user limit in ${voiceChannel.name} to ${newSize}.`);
  }

  if (type === 'name') {
    const oldName = voiceChannel.name;
    const newName = args.join(' ');
    if (oldName === newName) {
      return message.channel.send('Please choose a name different from the current one');
    }
    voiceChannel.setName(newName);
    await wait(1000);
    if (oldName === voiceChannel.name) {
      return message.channel.send('Please try again in a few minutes. Discord limits how often I can change the name of voice channels');
    }
    return message.channel.send(`Set the temporary name of **${config.voiceChamberDefaultSizes[voiceChannel.id].Name}** to **${newName}**.`);
  }
}

function SnapbackCheck(oldState, newState, client) {
  if (!config.voiceChamberDefaultSizes) {return;}
  const newUserChannel = newState.channelID;
  const oldUserChannel = oldState.channelID;
  const lastVoiceChannel = client.channels.resolve(oldUserChannel);
  // Conditions for when user joins a voice channel after not being in one (not currently needed)
  //  if(!oldUserChannel && newUserChannel) {

  // If leaving or changing channels, and the old chanenl is empty
  if((!newUserChannel || (oldUserChannel && newUserChannel)) && lastVoiceChannel.members.size === 0 &&
      // And the channel is configured
      config.voiceChamberDefaultSizes[oldUserChannel] &&
      // And the channel's userlimit or name aren't the default
      (lastVoiceChannel.userLimit !== config.voiceChamberDefaultSizes[oldUserChannel].Size ||
      lastVoiceChannel.name !== config.voiceChamberDefaultSizes[oldUserChannel].Name)) {
    const snapbackDelay = ((config.voiceChamberSnapbackDelay) ? (config.voiceChamberSnapbackDelay * 60000) : 300000);
    setTimeout(snapbackIfEmpty, snapbackDelay, lastVoiceChannel);
  }
}

async function snapbackIfEmpty(channel) {
  // if channel's configured, and still empty
  if (channel.members.size === 0 && config.voiceChamberDefaultSizes[channel.id]) {
    // with a user-limit other than the default
    if (channel.userLimit !== config.voiceChamberDefaultSizes[channel.id].Size) {
      await channel.setUserLimit(config.voiceChamberDefaultSizes[channel.id].Size);
      await wait(1000);
    }
    // with a name other than the default
    if (channel.name !== config.voiceChamberDefaultSizes[channel.id].Name) {
      await channel.setName(config.voiceChamberDefaultSizes[channel.id].Name);
    }
  }
  return;
}

function OnReady(client) {
  if (!config.voiceChamberDefaultSizes) {return;}
  for (const chanID in config.voiceChamberDefaultSizes) {
    const channel = client.channels.resolve(chanID);
    if (channel) {
      snapbackIfEmpty(channel);
    }
    else {
      console.log(`Could not find channel ID ${chanID} during voice channel snapback check`);
    }
  }
}

module.exports = {
  name: 'vc',
  description: 'Sets the name or size of the voice channel that the user is in, if the channel already has a user limit. Can only be used in text channels in the VOICE CHAT category.  The maximum user limit for a channel is 99 (Discord limitation).',
  usage: `size [new size]
  ${config.prefix}vc name [new name]
  ${config.prefix}vc check (mod only!)`,
  cooldown: 2,
  guildOnly: true,
  staffOnly: false,
  args: true,
  execute(message, args, client) {
    const type = args.shift();
    switch (type) {
    case 'name':
    case 'size':
      updateChannel(type, args, message);
      break;
    case 'check':
      if (message.member.roles.cache.has(config.roleStaff)) {
        OnReady(client);
        message.channel.send('Ok! Snapping back names/sizes of any configured voice channels back to their defaults');
      }
      else {
        message.channel.send('Sorry, only moderators can use this command');
      }
      break;
    }
    return;
  },
  init(client) {
    client.on('ready', async () => { OnReady(client); });
    // set up listener to revert configured game chambers to their default sizes
    client.on('voiceStateUpdate', (oldState, newState) => {
      SnapbackCheck (oldState, newState, client);
    });
  },
};
