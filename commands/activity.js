const fs = require('fs');
const path = require('path');
const configPath = path.resolve('./config.json');
const config = require(configPath);

module.exports = {
  name: 'activity',
  description: 'Change the bot\'s rich presence activity, and sends a message about it.' + '\n If a channel is #mentioned as the first argument, the message will send to that channel; otherwise it will send to the channel the command was used in.' +
		'\nIf an activity type is not specified (or invalid) it will default to \'playing\'. ' +
		'Valid activity types are: \nPlaying \nListening\\* \nWatching\n\n\\*The listening activity displays as "listening to" in the bot\'s presence, so "' +
		config.prefix + 'activity listening to music" will result in "listening to to music".',
  usage: '[#channel(optional)] [activity type (optional)] [activity]',
  cooldown: 3,
  guildOnly: true,
  staffOnly: true,
  args: true,
  execute(message, args, client) {
    let targetChannel = message.channel;
    const channelMatch = args[0].match(/^<#(\d+)>$/);
    if (channelMatch) {
      targetChannel = message.guild.channels.get(channelMatch[1]);
      args.shift();
    }
    if (args[0].toUpperCase() === 'PLAYING' || args[0].toUpperCase() === 'LISTENING' || args[0].toUpperCase() === 'WATCHING') {
      config.currentActivity.Type = args[0].toUpperCase();
      args.shift();
      config.currentActivity.Name = args.join(' ');
    }
    else {
      config.currentActivity.Type = 'PLAYING';
      config.currentActivity.Name = args.join(' ');
    }
    client.user.setActivity(config.currentActivity.Name, { type: config.currentActivity.Type });
    if (config.currentActivity.Type === 'LISTENING') {targetChannel.send ('I just started listening to **' + config.currentActivity.Name + '**. You should try it!');}
    else {targetChannel.send ('I just started ' + config.currentActivity.Type.toLowerCase() + ' **' + config.currentActivity.Name + '**. You should try it!');}
    message.delete();
    fs.writeFile(configPath, JSON.stringify(config, null, 2), function(err) {
      if (err) return console.log(err);
    });
    return;
  },
};