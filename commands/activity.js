const { prefix } = require('../config.json');

module.exports = {
	name: 'activity',
	description: 'Change the bot\'s rich presence activity, and sends a message to the channel the command is used in. If an activity type is not specified (or invalid) it will default to \'playing\'. ' +
	'Valid activity types are: \nPlaying \nListening\\* \nWatching\n\n\\*The listening activity displays as "listening to" in the bot\'s presence, so "' + prefix + 'activity listening to music" will result in "listening to to music".',
	usage: '[activity type (optional)] [activity]',
	cooldown: 3,
	guildOnly: true,
	staffOnly: true,
	args: true,
	execute(message, args, client) {
		const activitytype = args[0].toUpperCase();
		if (activitytype === 'PLAYING' || activitytype === 'LISTENING' || activitytype === 'WATCHING') {
			args.shift();
			const activity = args.join(' ');
			client.user.setActivity(activity, { type: activitytype });
			if (activitytype === 'LISTENING') {message.channel.send ('I just started listening to **' + activity + '**. You should try it!');}
			else {message.channel.send ('I just started ' + activitytype.toLowerCase() + ' **' + activity + '**. You should try it!');}
			message.delete();
			return;
		}
		else {
			const activity = args.join(' ');
			client.user.setActivity(activity, { type: 'PLAYING' });
			message.channel.send ('I just started playing **' + activity + '**. You should try it!');
			message.delete();
			return;
		}
	},
};