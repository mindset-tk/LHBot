// const fs = require('fs');

module.exports = {
  name: 'attachtest',
  description: 'testing attachments',
  usage: 'atest',
  cooldown: 3,
  guildOnly: true,
  staffOnly: true,
  args: false,
  async execute(message, args, client) {
    message.channel.send({
      files: ['https://i.imgur.com/8n2zBFR.png', 'https://i.imgur.com/QVi6Jmm.jpg'],
    });
  },
};