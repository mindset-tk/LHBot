const { roleBros } = require('../config.json');

module.exports = {
	name: 'bro',
	description: 'Elevates other users to bro status',
	args: true,
	usage: '<@user>',
	guildOnly: true,
	execute(message, args) {
		if (message.mentions.members.first()) {
			const target = message.mentions.members.first();
			if (message.member.roles.has(roleBros) && !target.roles.has(roleBros)) {
				message.channel.send('Elevating ' + target + ' to Bro');
				target.addRole(roleBros);
			}
			else {
				message.channel.send(target + ' is already a member of the Bros role!');
			}
		}
		else {
			message.channel.send('You did not @mention a user on this server!');
		}
	},
};