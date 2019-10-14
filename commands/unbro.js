const { roleBros } = require('../config.json');

module.exports = {
	name: 'unbro',
	description: 'De-escalates users from bro status',
	args: true,
	usage: '<@user>',
	guildOnly: true,
	execute(message) {
		if (message.mentions.members.first()) {
			const target = message.mentions.members.first();
			if (message.member.roles.has(roleBros) && target.roles.has(roleBros)) {
				message.channel.send('Removing bro status from ' + target + '.');
				target.removeRole(roleBros);
			}
			else if(!target.roles.has(roleBros)) {
				message.channel.send(target + ' is not a member of the Bros role!');
			}
			else {
				message.channel.send('You don\'t have permission to do that!');
			}
		}
		else {
			message.channel.send('You did not @mention a user on this server!');
		}
	},
};