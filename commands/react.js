const {Message} = require('discord.js');

module.exports = {
    name: 'react',
    description: 'Make the bot react to a message. The command must be run in the same channel as the original message.',
    usage: '[message id] [react to use]',
    cooldown: 3,
    guildOnly: true,
    staffOnly: true,
    args: true,

    async execute(message, [messageId, reactToUse], client) {
        let messageToReact = new Message(client, null, message.channel);
        messageToReact.id = messageId;
        messageToReact = await messageToReact.fetch();
        await messageToReact.react(reactToUse);
        await message.delete();
    },
}
