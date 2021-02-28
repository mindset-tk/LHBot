function PublicBumpReminder(config,message) {
  if(!config || !config.disboardChannelId || !config.botChannelId) {
    return;
  }
  if(message.author.bot && message.author.id == '302050872383242240' && message.content.includes('Bump done')) {
      const bumpChannel = message.guild.channels.resolve(config.disboardChannelId);
      bumpChannel.send(`Server bumped! The next reminder will be in **8 hours**`);
      setTimeout(function() {
        bumpChannel.send(`It's been 8 hours! The server can be bumped on Disboard again using \`!d bump\` in <#${config.botChannelId}>`);
      }, 28800*1000);
    }
    return;
}

exports.BumpReminder = PublicBumpReminder;
