const {start} = require('thoughtful-question-generator')

module.exports = {
    name: 'question',
    cooldown: 10,

    execute(message, _arguments, _client, config) {
        message.channel.send(start.evaluate())
    },
}
