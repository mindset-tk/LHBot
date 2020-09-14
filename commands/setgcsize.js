const fs = require('fs');
const path = require('path');
const configPath = path.resolve('./config.json');
const config = require(configPath);

module.exports = {
  name: 'vcsize',
  description: 'Sets the size of the voice channel that the user is in, if the channel already has a user limit. Can only be used in text channels in the VOICE CHAT category.  The maximum user limit for a channel is 99 (Discord limitation).',
  usage: '[new size]',
  cooldown: 3,
  guildOnly: true,
  staffOnly: false,
  args: true,
  execute(message, args, client) {
    var isStaff = message.member.roles.cache.has(config.roleStaff);

    if (!isStaff && !config.voiceTextChannelIds.includes(message.channel.id)) {
      var outMsg = 'Please use this command only in these channels:';
      config.voiceTextChannelIds.forEach(channelId => outMsg += ' <#' + message.guild.channels.resolve(channelId).id + '>'); 
      return message.channel.send(outMsg);
    }

    let newSize = parseInt(args[0]);

    if (isNaN(newSize)) {
      return message.channel.send(`You'll need to give me a number to set the user limit to`);
    }

    if (newSize == 0) {
      return message.channel.send(`Sorry, I cannot remove the limit from a channel.`);
    }

    if (newSize > 99) {
      return message.channel.send('Sorry, I cannot set a limit higher than 99.');
    }

    //Find the channel
    var voiceChannel;
    if(args.length > 1 && isStaff)
    {
      //Check for second argument
      var vcArg = message.guild.channels.resolve(args[1])
      if(vcArg && vcArg.type == "voice")
      {
        voiceChannel = vcArg;
      }
    }

    if(!voiceChannel)
    {
      voiceChannel = message.member.voice.channel;
      if (!voiceChannel) return message.channel.send('Please join a voice channel and try again!');
    }
    
    const mypermissions = message.guild.me.permissionsIn(voiceChannel);
    // console.log(permissions);
    if (!mypermissions.has(['MANAGE_CHANNELS'])) {
      return message.channel.send(`Sorry, I don't have permission to set the limit in that channel.`);
    }

    if (voiceChannel.userLimit == 0) {
      return message.channel.send(`Sorry, I can only set the user limit on channels that already have a limit.`);
    }

    voiceChannel.setUserLimit(newSize);

    return message.channel.send(`Set the user limit in ${voiceChannel.name} to ${args[0]}.`);
  }
};
