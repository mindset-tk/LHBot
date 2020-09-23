const fs = require('fs');
const path = require('path');
const configPath = path.resolve('./config.json');
const config = require(configPath);

module.exports = {
  name: 'vcname',
  description: 'Sets the temporary name of a voice channel that the user is in, if the channel already has a user limit. Can only be used in configured text channels in the VOICE CHAT category.',
  usage: '[temporary name]',
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

    //Find the channel
    var voiceChannel;
    if (args[args.length-1].match("^[0-9]{18}$"))
    {
      //Check for second argument
      var vcArg = message.guild.channels.resolve(args[args.length-1]);
      if(vcArg && vcArg.type == "voice")
      {
        voiceChannel = vcArg;
        args.pop();
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
    if (!config.voiceChamberDefaultSizes[voiceChannel.id]) {
      return message.channel.send(`Sorry, I can only set the user limit on channels that already have a configured limit.`);
    }

    if (voiceChannel.id == 0) {
    }

    voiceChannel.setName(args.join(' '));
    return message.channel.send(`Set the temporary of **${config.voiceChamberDefaultSizes[voiceChannel.id].Name}** to **${args.join(' ')}**.`);

  }
};