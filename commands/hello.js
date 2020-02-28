module.exports = {
  name: 'hello',
  aliases: ['ping', 'beep'],
  description: 'Pings bot to verify operation',
  cooldown: 3,
  execute(message) {
    const botguildmember = message.guild.me;
    message.channel.send('Hello, I am ' + botguildmember.displayName + '.');
  },
};