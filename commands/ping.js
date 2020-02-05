module.exports = {
	name: 'ping',
	aliases: ['ping', 'beep'],
	description: 'Pings bot to verify operation',
	cooldown: 3,
	execute(message, args) {
		message.channel.send('pong!');
	},
};