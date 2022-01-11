const Discord = require('discord.js');

module.exports = {
  name: '8ball',
  description: 'magic 8-ball',
  cooldown: 5,
  usage: '[question]',
  execute(message, args) {
    if (!args.length) {
      message.channel.send('I cannot answer truly if you do not ask a question!');
      return;
    }
    const rand = [
      'It is certain.',
      'Without a doubt.',
      'Yes - definitely.',
      'As I see it, yes.',
      'Most likely.',
      'Signs point to yes.',
      'I can\'t say for certain.',
      'Reply hazy, try again.',
      'Ask again later.',
      'Better not tell you now.',
      'Cannot predict now.',
      'Concentrate and ask again.',
      'Don\'t count on it.',
      'My reply is no.',
      'My sources say no.',
      'Outlook not so good.',
      'Very doubtful.',
      'Definitely not.'];
    const answer = rand[Math.floor(Math.random() * rand.length)];
    const Magic8ballembed = new Discord.MessageEmbed()
      .setTitle('Magic 8-Ball')
      .setDescription(`${message.author} asked a question of my magic 8-ball.`)
      .addField(':question: **Question**', `*${args.join(' ')}*`)
      .addField(':8ball: **Answer**', answer);
    message.channel.send({ embeds: [Magic8ballembed] });
  },
};