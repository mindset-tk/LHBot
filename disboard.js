function PublicBumpReminder(config, message) {
  if(!config || !config.disboardChannelId || !config.botChannelId || message.channel.type != 'text') { return; }
  const permsRequired = ['VIEW_CHANNEL', 'MANAGE_CHANNELS', 'MANAGE_ROLES', 'SEND_MESSAGES'];
  if (!message.guild.me.hasPermission(permsRequired)) {
    return message.channel.send('Sorry, I don\'t have all the necessary permissions (' + permsRequired.join(', ') + ')');
  }

  if(message.author.bot && message.author.id == '302050872383242240' && message.content.includes('Bump done')) {
    const bumpChannel = message.guild.channels.resolve(config.disboardChannelId);
    const botChannel = message.guild.channels.resolve(config.botChannelId);
    // const disboardBot = message.guild.member('265668852275216384');

    botChannel.updateOverwrite(message.author, { 'VIEW_CHANNEL': false },
      'Disboard Bump Cooldown');

    bumpChannel.send('Server bumped! The next reminder will be in **6 hours**');
    setTimeout(function() {
      bumpChannel.send(`It's been 6 hours! The server can be bumped on Disboard again using \`!d bump\` in <#${config.botChannelId}>`);
      message.channel.updateOverwrite(message.author, { 'VIEW_CHANNEL': true },
        'Disboard Bump Cooldown');
    }, 21600 * 1000);
    return;
  }
}

exports.BumpReminder = PublicBumpReminder;
