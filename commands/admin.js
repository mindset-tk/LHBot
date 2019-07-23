const { roleBros, roleAdmin, channelAnnouncements } = require('../config.json');


module.exports = {
	name: 'admin',
	description: 'Toggle admin status on sender. Only works if sender has the Bros role.',
	guildOnly: true,
	execute(message, args, client) {
		const announcements = client.channels.get(channelAnnouncements);
		if (message.member.roles.has(roleBros) && !message.member.roles.has(roleAdmin)) {
			message.channel.send('Elevating you to Admin');
			announcements.send('@everyone : ' + message.author + ' has escalated to admin!');
			message.member.addRole(roleAdmin);
		}
		else if (message.member.roles.has(roleBros) && message.member.roles.has(roleAdmin)) {
			message.channel.send('De-elevating you from Admin');
			announcements.send('@everyone : ' + message.author + ' has de-escalated from admin!');
			message.member.removeRole(roleAdmin);
		}
		else {
			message.channel.send ('You do not have rights to do that!');
		}
	},
};