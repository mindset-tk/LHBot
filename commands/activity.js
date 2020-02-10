const fs = require('fs');
const path = require('path');
const configPath = path.resolve('./config.json');
const config = require(configPath);

module.exports = {
	name: 'activity',
	description: 'Change the bot\'s rich presence activity, and sends a message to the channel the command is used in. If an activity type is not specified (or invalid) it will default to \'playing\'. ' +
	'Valid activity types are: \nPlaying \nListening\\* \nWatching\n\n\\*The listening activity displays as "listening to" in the bot\'s presence, so "' + config.prefix + 'activity listening to music" will result in "listening to to music".',
	usage: '[activity type (optional)] [activity]',
	cooldown: 3,
	guildOnly: true,
	staffOnly: true,
	args: true,
	execute(message, args, client) {
		config.currentActivity.Type = args[0].toUpperCase();
		if (config.currentActivity.Type === 'PLAYING' || config.currentActivity.Type === 'LISTENING' || config.currentActivity.Type === 'WATCHING') {
			args.shift();
			config.currentActivity.Name = args.join(' ');
			client.user.setActivity(config.currentActivity.Name, { type: config.currentActivity.Type });
			if (config.currentActivity.Type === 'LISTENING') {message.channel.send ('I just started listening to **' + config.currentActivity.Name + '**. You should try it!');}
			else {message.channel.send ('I just started ' + config.currentActivity.Type.toLowerCase() + ' **' + config.currentActivity.Name + '**. You should try it!');}
			message.delete();
			fs.writeFile(configPath, JSON.stringify(config, null, 1), function(err) {
				if (err) return console.log(err);
				console.log(JSON.stringify(configPath));
				console.log('writing to ' + configPath);
			});
			return config;
		}
		else {
			config.currentActivity.Type = 'PLAYING';
			config.currentActivity.Name = args.join(' ');
			client.user.setActivity(config.currentActivity.Name, { type: config.currentActivity.Type });
			message.channel.send ('I just started playing **' + config.currentActivity.Name + '**. You should try it!');
			message.delete();
			fs.writeFile(configPath, JSON.stringify(config, null, 1), function(err) {
				if (err) return console.log(err);
				console.log(JSON.stringify(configPath));
				console.log('writing to ' + configPath);
			});
			return;
		}
	},
};