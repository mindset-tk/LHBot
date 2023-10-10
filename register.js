// slash command registrar.

const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const { discordAuthToken } = require('./apitokens.json');
const fs = require('node:fs');
const path = require('path');
const slashPath = path.resolve('./slashcommands');

async function registerSlashes(client) {
  const commands = [];
  const commandFiles = fs.readdirSync(slashPath).filter(file => file.endsWith('.js'));

  // registers commands with guild at startup.
  const clientId = client.user.id;

  for (const file of commandFiles) {
    const command = require(`${slashPath}/${file}`);
    commands.push(command.data.toJSON());
  }

  const rest = new REST({ version: '9' }).setToken(discordAuthToken);

  (async () => {
    try {
      console.log('Started registering application (/) commands.');

      /* note: to switch command registration to only one server (IE, not global), fill in your server id below;
        then uncomment lines 31 and 34, and comment/delete line 35. single-server registration is much faster and better for testing.
        see https://discordjs.guide/interactions/slash-commands.html#registering-slash-commands for details.*/
      const guildId = '674451358027350016';

      await rest.put(
        Routes.applicationGuildCommands(clientId, guildId),
        // Routes.applicationCommands(clientId),
        { body: commands },
      );

      console.log('Successfully registered application (/) commands.');
    }
    catch (error) {
      console.error(error);
    }
  })();
}

module.exports = {
  onReady: registerSlashes,
};
