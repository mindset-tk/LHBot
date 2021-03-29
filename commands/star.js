const path = require('path');
const starboardpath = path.resolve('./starboard.js');
const starboard = require(starboardpath);

exports.init = function(client, config) {
  client.on('raw', async (packet) => {
    // return if the event isn't a reaction add or remove.
    if (packet.t !== 'MESSAGE_REACTION_ADD' && packet.t !== 'MESSAGE_REACTION_REMOVE') {
      return;
    }
    // then check if the emoji added/removed was a star. if not, do nothing.
    else if (packet.d.emoji.name !== '⭐') {
      return;
    }
    // pulling data from packet obj
    const { d: data } = packet;
    const user = client.users.cache.get(data.user_id);
    const channel = client.channels.cache.get(data.channel_id) || await user.createDM();

    // fetch info about the message the reaction was added to.
    await channel.messages.fetch(data.message_id).then(message => {
      if (!message || message.system) return;
      starboard.onStar(client, config, message);
    });
  });
};
