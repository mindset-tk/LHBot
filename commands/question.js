const { start } = require('thoughtful-question-generator');

module.exports = {
  name: 'question',
  description: 'Generate a thoughtful question.',
  cooldown: 10,

  execute(message, _arguments, _client, config) {
    // Are we allowed to respond in this channel?
    if (config.questionChannelIds.includes(message.channel.id)) {
      message.channel.send(start.evaluate());
    }
  },
};
