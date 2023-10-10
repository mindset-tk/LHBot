exports.init = async function(client, config) {
  client.on('raw', async (packet) => {
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
    if (!reaction || message.channel.type !== 'GUILD_TEXT') return;

    if (message == null || message.system) return;
    if (reaction.emoji.name == '📌' && reaction.count >= config.pinsToPin && !message.pinned && !config.pinIgnoreChannels.includes(message.channel.id)) {
      console.log(`Attempting to pin a message in ${message.channel}`);
      message.pin();
      return;
    }
  });
};
