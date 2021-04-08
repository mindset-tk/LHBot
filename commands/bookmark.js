const Discord = require('discord.js');

exports.init = function(client) {
  client.on('raw', async(packet) => {
    if (packet.t !== 'MESSAGE_REACTION_ADD') {
      return;
    }

    const { d: data } = packet;
    const user = client.users.cache.get(data.user_id);
    const channel = client.channels.cache.get(data.channel_id) || await user.createDM();

    // fetch info about the message the reaction was added to.
    const message = await channel.messages.fetch(data.message_id);
    // custom emojis reactions are keyed in a `name:ID` format, while unicode emojis are keyed by names
    const emojiKey = (data.emoji.id) ? `${data.emoji.name}:${data.emoji.id}` : data.emoji.name;
    const reaction = message.reactions.cache.get(emojiKey);

    // If the message somehow doesn't have any reactions on it, or the channel type is not a guild text channel (like a DM for example),
    // do not emit a reaction add event.
    if (!reaction || message.channel.type !== 'text') return;

    if (message == null || message.system) return;

    if (reaction.emoji.name == '🔖') {
      console.log(`Attempting to PM a message from ${message.channel} to ${user}`);
      const messagesent = new Date(message.createdTimestamp).toLocaleString('en-US', { timeZone: 'UTC' });
      let image = '';
      let embedAuthor;
      if (message.member) {
        embedAuthor = message.member.displayName;
      }
      else {
        embedAuthor = message.author.username;
      }

      if (message.attachments.size > 0) {
        const isimage = /(jpg|jpeg|png|gif)/gi.test((message.attachments.array()[0].url).split('.'));
        if (isimage) { image = message.attachments.array()[0].url; }
      }
      const bookmarkEmbed = new Discord.MessageEmbed()
        .setColor('#0099ff')
        .setAuthor(embedAuthor, message.author.displayAvatarURL())
        .setDescription(message.content + '\n\n [jump to message](' + message.url + ')')
        .setFooter('Bookmarked message was sent at ' + messagesent + ' UTC')
        .setImage(image);
      user.send(`🔖: - from ${message.channel}`, bookmarkEmbed);
      return;
    }
  });
};
