module.exports = {
  name: 'volume',
  description: 'Adjust voice channel song volume. Default volume is 20.',
  aliases: [],
  usage: '[number between 1 and 100]',
  guildOnly: true,
  cooldown: 0.1,
  async execute(message, args) {
    const voiceChannel = message.member.voice.channel;
    if (!message.guild.musicData.songDispatcher) { return message.channel.send('There is nothing playing!'); }
    if (!voiceChannel || voiceChannel != message.guild.musicData.voiceChannel) return message.channel.send('This command cannot be used from outside of the current voice channel.');
    if (args.length != 1 || args[0] > 100 || args[0] < 1) {
      return message.channel.send('Please provide only one number between 1 and 100.');
    }
    const volume = args[0] / 100;
    message.guild.musicData.volume = volume;
    message.guild.musicData.songDispatcher.setVolume(volume);
    message.channel.send(`Changing volume to: ${args[0]}`);
  },
};