const { roleStaff } = require('../config.json');

module.exports = {
	name: 'activity',
	description: 'Change the bot\'s rich presence activity. If an activity type is not specified (or invalid) it will default to \'playing\'. Valid activity types are: \nPlaying \nListening \nWatching',
	usage: '[activity type (optional)] [activity]',
	cooldown: 3,
	guildOnly: true,
	staffOnly: true,
	execute(message, args, client) {
		if (!message.member.roles.has(roleStaff)) {
			return;
		}
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