

function PublicBumpReminder(config,message) {
  if(!config || !config.disboardChannelId) {
    return;
  }
  if(message.channel.id === config.disboardChannelId && message.author.bot) {
    if (message.content.includes('Bump done')) {
      setTimeout(function() {
        message.channel.send(`It's now been 2 hours! The server can be bumped on Disboard again using \`!d bump\``);
      }, 7200*1000);
    }
    return;
  }
}

exports.BumpReminder = PublicBumpReminder;
