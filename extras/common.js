const path = require('path');
const configPath = path.resolve('./config.json');
const config = require(configPath);
const Discord = require('discord.js');

// function to determine if a user's permission level - returns null, 'comrade', or 'staff'
function getPermLevel(message) {
  if (message.channel instanceof Discord.DMChannel) return null;

  if (message.isPKMessage) {
    if (message.PKData.author.roles.cache.has(config.roleStaff)) {
      return 'staff';
    }
    else if (message.PKData.author.roles.cache.has(config.roleComrade)) {
      return 'comrade';
    }
    else {return null;}
  }
  else if (!message.isPKMessage) {
    if (message.member.roles.cache.has(config.roleStaff)) {
      return 'staff';
    }
    else if (message.member.roles.cache.has(config.roleComrade)) {
      return 'comrade';
    }
    else {return null;}
  }
  return null;
}

// function to create a message collector in a DM. Timeout is 3 minutes.
async function dmCollector(dmChannel) {
  // let responses = 0;
  let reply = false;
  // awaitmessages needs a filter but we're just going to accept the first reply it gets.
  const filter = m => (m.author.id === dmChannel.recipient.id);
  await dmChannel.awaitMessages(filter, { max: 1, time: 180000, errors: ['time'] })
    // this method creates a collection; since there is only one entry we get the data from collected.first
    .then(collected => reply = collected.first())
    .catch(err => dmChannel.send('Sorry, I waited 3 minutes with no response. You will need to start over.'));
  // console.log('Reply processed...');
  return reply;
}

/**
 * Prompts for a message using a dmCollector.
 *
 * The handler is a function which takes a `Discord.Message` and returns a value. It can optionally be async,
 * but it doesn't need to be.
 * Return 'retry' from the `handler` if you want to retry the prompt, and 'abort' to cancel the prompt.
 * Anything else will be returned as the value.
 *
 * @param dmChannel {Discord.DMChannel} The DM channel to prompt in
 * @param handler {function(Discord.Message): object|string|Promise<object|string>}} The function that handles the reply.
 * @returns {Promise<object|boolean>} Returns the result from the handler or `false` if aborted.
 ` */
async function promptForMessage(dmChannel, handler) {
  while (true) {
    const reply = await dmCollector(dmChannel);
    if (!reply) {
      return false;
    }
    const result = await handler(reply);
    if (result === 'retry') {
      continue;
    } else if (result === 'abort') {
      return false;
    } else {
      return result;
    }
  }
}

/**
 * Convenience function for a common prompt for a yes/no/cancel.
 *
 * The options object has a `messages` entry that takes messages for yes, no, cancel, and invalid.
 *
 * yes/y and no/n are considered for yes/no (case insensitive), and cancel is considered for cancel.
 *
 * @param dmChannel {Discord.DMChannel} The DM channel to prompt in
 * @param options {object} Options containing messages with strings for the above keys.
 * @returns {Promise<object|boolean>} Returns `{answer: true}` for yes, `{answer: true}` for no, or `false` if aborted.
 */
async function promptYesNo(dmChannel, options) {
  return promptForMessage(dmChannel, (reply) => {
    const content = reply.content.trim();
    switch (content.toLowerCase()) {
      case 'n':
      case 'no':
        if (options.messages.no) dmChannel.send(options.messages.no);
        return {answer: false};
      case 'y':
      case 'yes':
        if (options.messages.yes) dmChannel.send(options.messages.yes);
        return {answer: true};
      case 'cancel':
        if (options.messages.cancel) dmChannel.send(options.messages.cancel);
        return 'abort';
      case false:
        return 'retry';
      default:
        if (options.messages.invalid) dmChannel.send(options.messages.invalid);
        return 'retry';
    }
  });
}

module.exports = {
  getPermLevel,
  dmCollector,
  promptForMessage,
  promptYesNo,
};