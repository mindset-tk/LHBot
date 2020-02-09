module.exports = {
	name: 'ban',
	description: 'Bans a user from the server it is used on. Accepts Discord ID or an @mention.  Hand-typing the username#xxxx format is not supported due to API limitations. The bot may silently fail to ban the user if they have any roles above the role that permits the bot to ban users.',
	usage: '[ID or @mention] [ban reason (optional)]',
	cooldown: 3,
	guildOnly: true,
	staffOnly: true,
	args: true,
	async execute(message, args, client) {
		// Documentation indicates that discord snowflake IDs are a minimum of 16 characters long, given Discord's establishment date.
		let targetuser;
		const IDFormat = new RegExp('^(\\d{16,})$');
		const targetstring = args[0];
		let bantarget = args[0];
		// If the message @mentions a user instead of providing a userID, slice it down to the userID.
		if (bantarget.startsWith('<@') && bantarget.endsWith('>')) {
			bantarget = bantarget.slice(2, -1);
			if (bantarget.startsWith('!')) {
				bantarget = bantarget.slice(1);
			}
		}
		args.shift();
		const banreason = args.join(' ');
		if (IDFormat.test(bantarget)) {
			targetuser = await client.fetchUser(bantarget);
		}
		else {
			message.channel.send(targetstring + 'Does not appear to be a user ID or @mention. Please try again.');
			return;
		}
		// Test if user is already banned. If so, report it and return.
		const banList = await message.guild.fetchBans();
		let bannedUser = banList.find(user => user.id === bantarget);
		if (bannedUser) {
			message.channel.send('User ' + targetuser.username + '#' + targetuser.discriminator + ' already appears on the ban list for this server!');
			return;
		}
		// attempt to ban user. Check banlist afterward.
		try {
			await message.guild.ban(targetuser, banreason);
			bannedUser = true;
		}
		catch(err) {
			bannedUser = false;
			console.log(err);
		}
		if (!bannedUser) {
			message.channel.send('I was not able to ban ' + targetuser.username + '#' + targetuser.discriminator + '. This is likely because I do not have the right roles, or because the target has roles above mine in the heirarchy.');
			return;
		}
		if (!banreason) {
			message.channel.send('Banning ' + targetuser.username + '#' + targetuser.discriminator + '. No reason given.');
		}
		else {
			message.channel.send('Banning ' + targetuser.username + '#' + targetuser.discriminator + ' with reason **' + banreason + '**.');
		}
	},
};