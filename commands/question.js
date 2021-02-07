const {start} = require('thoughtful-question-generator')

module.exports = {
    name: 'question',
    cooldown: 10,

    execute(message) {
        message.channel.send(start.evaluate())
    },
}
