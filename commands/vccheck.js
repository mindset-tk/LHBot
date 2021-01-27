const path = require('path');
const configPath = path.resolve('./config.json');
const config = require(configPath);


function PublicChannelSnapbackCheck(oldState, newState, client) {
  if (!config.voiceChamberDefaultSizes) {return;}
  const newUserChannel = newState.channelID;
  const oldUserChannel = oldState.channelID;
  const lastVoiceChannel = client.channels.resolve(oldUserChannel);
  // Conditionsl for when user joins a voice channel after not being in one (not currently needed)
  //  if(!oldUserChannel && newUserChannel) {

  // If leaving or changing channels, and the old chanenl is empty
  if((!newUserChannel || (oldUserChannel && newUserChannel)) && lastVoiceChannel.members.size === 0 &&
      // And the channel is configured
      config.voiceChamberDefaultSizes[oldUserChannel] &&
      // And the channel's userlimit or name aren't the default
      (lastVoiceChannel.userLimit !== config.voiceChamberDefaultSizes[oldUserChannel].Size ||
      lastVoiceChannel.name !== config.voiceChamberDefaultSizes[oldUserChannel].Name)) {
    // const snapbackDelay = ((config.voiceChamberSnapbackDelay) ? (config.voiceChamberSnapbackDelay * 60000) : 300000);
    const snapbackDelay = ((config.voiceChamberSnapbackDelay) ? (config.voiceChamberSnapbackDelay * 60000) : 300000);
    setTimeout(StillEmpty, snapbackDelay, lastVoiceChannel);
  }
}

function StillEmpty(channel) {
  // if channel's configured, and still empty
  if (channel.members.size === 0 && config.voiceChamberDefaultSizes[channel.id]) {
    // with a user-limit other than the default
    if (channel.userLimit !== config.voiceChamberDefaultSizes[channel.id].Size) {
      channel.setUserLimit(config.voiceChamberDefaultSizes[channel.id].Size);
    }
    // with a name other than the default
    if (channel.name !== config.voiceChamberDefaultSizes[channel.id].Name) {
      channel.setName(config.voiceChamberDefaultSizes[channel.id].Name);
    }
  }
}

function PublicOnReady(client) {
  if (!config.voiceChamberDefaultSizes) {return;}
  for (const chanID in config.voiceChamberDefaultSizes) {
    const channel = client.channels.resolve(chanID);
    if (channel) {
      // If the channel is empty
      if (channel.members.size === 0) {
        // with a user-limit other than the default
        if (channel.userLimit !== config.voiceChamberDefaultSizes[chanID].Size) {
          channel.setUserLimit(config.voiceChamberDefaultSizes[chanID].Size);
        }
        // with a name other than the default
        if (channel.name !== config.voiceChamberDefaultSizes[chanID].Name) {
          channel.setName(config.voiceChamberDefaultSizes[chanID].Name);
        }
      }
    }
    else {
      console.log(`Could not find channel ID ${chanID}!`);
    }
  }
}

module.exports = {
  name: 'vccheck',
  description: 'Checks if any of the voice channels need to be snapped back, and does that if so',
  usage: '',
  cooldown: 3,
  guildOnly: true,
  staffOnly: true,
  args: false,
  execute(message, args, client) {
    PublicOnReady (client);
  },
};

module.exports.OnReady = PublicOnReady;
module.exports.ChannelSnapbackCheck = PublicChannelSnapbackCheck;