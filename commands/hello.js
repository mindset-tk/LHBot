module.exports = {
  name: 'hello',
  aliases: ['ping', 'beep'],
  description: 'Pings bot to verify operation',
  cooldown: 3,
  execute(message, args, client) {
    if (message.channel.type == 'GUILD_TEXT') {
      const botguildmember = message.guild.me;
      message.channel.send('Hello, I am ' + botguildmember.displayName + '.');
    }
    else {
      message.channel.send(`Hello, I am ${client.user}`);
    }
  },
};