const path = require('path');
const configPath = path.resolve('./config.json');
const config = require(configPath);

module.exports = {
  name: 'createinvite',
  description: 'Creates an invite',
  usage: '',
  cooldown: 3,
  guildOnly: true,
  staffOnly: true,
  args: false,
  async execute(message) {
    const lobby = config.channelLobby ? message.guild.channels.resolve(config.channelLobby) : message.channel;
    const invite = await lobby.createInvite(
      {
        //    maxAge: 10 * 60 * 1000, // maximum time for the invite, in milliseconds
        // maximum time for the invite, in milliseconds
        maxAge: 0,
        // maximum times it can be used
        maxUses: 0,
      },
      `Requested with command by ${message.author.tag}`,
    )
      .catch(console.log);

    message.reply(invite ? `Here's your invite: ${invite}` : 'There has been an error during the creation of the invite.');
  },
};