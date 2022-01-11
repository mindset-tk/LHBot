module.exports = {
  name: 'ban',
  description: 'Bans a user from the server it is used on. Accepts Discord ID or an @mention.  Hand-typing the username#xxxx format is not supported due to API limitations.',
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
      targetuser = await client.users.fetch(bantarget);
    }
    else {
      message.channel.send(targetstring + 'Does not appear to be a user ID or @mention. Please try again.');
      return;
    }
    // Test if user is already banned. If so, report it and return.
    const banList = await message.guild.bans.fetch();
    const bannedUser = banList.get(bantarget);
    if (bannedUser) {
      message.channel.send('User ' + targetuser.tag + ' already appears on the ban list for this server!');
      return;
    }
    // attempt to ban user. If an error is thrown while banning, log the error and send error text.
    let isBanned = false;
    try {
      await message.guild.members.ban(targetuser, { reason: banreason });
      isBanned = true;
    }
    catch(err) {
      isBanned = false;
      console.log(err);
    }
    if (!isBanned) {
      message.channel.send('I was not able to ban ' + targetuser.tag + '. \n Possible reasons for this: I do not have the right roles, or the target has roles I cannot ban.\nCheck the console log for details.');
      return;
    }
    if (!banreason) {
      message.channel.send('Banning ' + targetuser.tag + '. No reason given.');
    }
    else {
      message.channel.send('Banning ' + targetuser.tag + ' with reason **' + banreason + '**.');
    }
  },
};