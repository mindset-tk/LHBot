const { roleBros } = require('../config.json');
const { botID } = require('../config.json');

module.exports = {
	name: 'bro',
	description: 'Elevates other users to bro status',
	args: true,
	usage: '<@user>',
	guildOnly: true,
	execute(message) {
		if (message.mentions.members.first()) {
			const target = message.mentions.members.first();
			if (message.member.roles.has(roleBros) && !target.roles.has(roleBros) && target.user.id !== botID) {
				message.channel.send('Elevating ' + target + ' to Bro');
				target.addRole(roleBros);
			}
			else if (target.user.id == botID) {
				message.channel.send('The Bros role is not used for bots!');
			}
			else if (target.roles.has(roleBros)) {
				message.channel.send(target + ' is already a member of the Bros role!');
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