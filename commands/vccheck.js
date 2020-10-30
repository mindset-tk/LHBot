const fs = require('fs');
const path = require('path');
const configPath = path.resolve('./config.json');
const config = require(configPath);


function PublicChannelSnapbackCheck(oldState, newState, client) {
  if (!config.voiceChamberDefaultSizes) {return;}
  let newUserChannel = newState.channelID;
  let oldUserChannel = oldState.channelID;
  let lastVoiceChannel = client.channels.resolve(oldUserChannel);
  //  if(!oldUserChannel && newUserChannel) {     // User Joins a voice channel after not being in one (not currently needed)
  if((!newUserChannel || (oldUserChannel && newUserChannel)) && // leaving voice or changing channels AND
      lastVoiceChannel.members.size == 0 && // channel is empty AND
      config.voiceChamberDefaultSizes[oldUserChannel] &&  // channel being left is configured AND
      (lastVoiceChannel.userLimit != config.voiceChamberDefaultSizes[oldUserChannel].Size || // (the current userlimit is different from the default OR
      lastVoiceChannel.name != config.voiceChamberDefaultSizes[oldUserChannel].Name)) // the current name is different from the default)
  {
    let snapbackDelay = ((config.voiceChamberSnapbackDelay) ? (config.voiceChamberSnapbackDelay * 60000) : 300000);
    setTimeout(StillEmpty, snapbackDelay, lastVoiceChannel, client);
  }
}

function StillEmpty(channel, client) {
  if (channel.members.size == 0 && config.voiceChamberDefaultSizes[channel.id]) {
    // if the channel is still empty, and is in the list of configged VCs
    if (channel.userLimit != config.voiceChamberDefaultSizes[channel.id].Size) { // is the current userlimit is different from the default?
      channel.setUserLimit(config.voiceChamberDefaultSizes[channel.id].Size);
    }
    if (channel.name !== config.voiceChamberDefaultSizes[channel.id].Name) { // is the current name is different from the default?
      channel.setName(config.voiceChamberDefaultSizes[channel.id].Name);
    }
  }
}

function PublicOnReady(client) {
  if (!config.voiceChamberDefaultSizes) {return;}
  for (const chanID in config.voiceChamberDefaultSizes) {
    const channel = client.channels.resolve(chanID);
    if (channel) {
      if (channel.members.size == 0) { // is channel empty?
        if (channel.userLimit != config.voiceChamberDefaultSizes[chanID].Size) { // is the current userlimit is different from the default?
          channel.setUserLimit(config.voiceChamberDefaultSizes[chanID].Size);
        }
        if (channel.name !== config.voiceChamberDefaultSizes[chanID].Name) { // is the current name is different from the default?
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