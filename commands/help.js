const path = require('path');
const configPath = path.resolve('./config.json');
const config = require(configPath);
const { getPermLevel } = require('../extras/common.js');

module.exports = {
  name: 'help',
  description: 'List all of my commands or info about a specific command.',
  aliases: ['commands'],
  usage: '[command name]',
  cooldown: 3,
  execute(message, args) {
    const permLevel = getPermLevel(message);
    let data = new String;
    const { commands } = message.client;
    // If the help invoker is staff, give all commands.
    if (!args.length && permLevel == 'staff') {
      data += 'Here\'s a list of all my commands:\n';
      // map all command names to an array, filter(Boolean) to remove empty values, then join for clean output
      data += commands.map(command => command.name).filter(Boolean).join('\n');
      data += `\nYou can send \`${config.prefix}help [command name]\` to get info on a specific command!`;
      return message.channel.send({ content: data });
    }
    // If the invoker is not staff, but has permission to invoke the command, give only commands available to them.
    if (!args.length && permLevel == 'comrade') {
      data += 'Here\'s a list of commands available to you:\n';
      // map all non-staffOnly command names to an array, filter(Boolean) to remove empty values, then join for clean output
      data += commands.map(command => {if (!command.staffOnly) return command.name;}).filter(Boolean).join('\n');
      data += `\nYou can send \`${config.prefix}help [command name]\` to get info on a specific command!`;

      return message.channel.send({ content: data });
    }
    const name = args[0].toLowerCase();
    const command = commands.get(name) || commands.find(c => c.aliases && c.aliases.includes(name));

    if (!command || (command.staffOnly && permLevel != 'staff')) {
      return message.reply('that\'s not a valid command, or you don\'t have permission to use it!');
    }

    data += `**Name:** ${command.name}`;

    if (command.aliases) data += (`\n**Aliases:** ${command.aliases.join(', ')}`);
    if (command.description) data += (`\n**Description:** ${command.description}`);
    if (command.usage) data += (`\n**Usage:** ${config.prefix}${command.name} ${command.usage}`);

    return message.channel.send({ content: data, split: true });
  },
};