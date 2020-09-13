const fs = require('fs');
const path = require('path');
const configPath = path.resolve('./config.json');
const config = require(configPath);

module.exports = {
  name: 'setuserlimit',
  description: 'Sets the size of the voice channel that the user is in, if the channel already has a user limit. Can only be used in text channels in the VOICE CHAT category',
  usage: '[new size]',
  cooldown: 3,
  guildOnly: true,
  staffOnly: true,
  args: true,
  execute(message, args, client) {
    if (!config.voiceTextChannelIds.includes(message.channel.id)) {
      return message.channel.send('Please use this command only in the #voice-chat channels.');
    }

    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel) return message.channel.send('Please join a voice channel and try again!');
    
    const mypermissions = message.guild.me.permissionsIn(voiceChannel);
    // console.log(permissions);
    if (!mypermissions.has(['MANAGE_CHANNELS'])) {
      return message.channel.send(`Sorry, I don't have permission to set the limit in that channel.`);
    }

    if (voiceChannel.userLimit == 0) {
      return message.channel.send(`Sorry, I can only set the user limit on channels that already have a limit.`);
    }

    if (!Number.isInteger(args[0])) {
      return message.channel.send(`You'll need to give me a number to set the user limit to`);
    }

    if (args[0] == 0) {
      return message.channel.send(`Sorry, I cannot remove the limit from a channel.`);
    }

    voiceChannel.setUserLimit(args[0]);

    return message.channel.send(`Set the user limit in ${voiceChannel.name} to ${args[0]}.`);
  }
};
