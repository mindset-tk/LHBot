const fs = require('fs');
const path = require('path');
const countingDataPath = path.resolve('./counting.json');
if(global.countingData == null)
{
  global.countingData = require(countingDataPath);
}

function WriteState() {
  fs.writeFile(countingDataPath, JSON.stringify(global.countingData, null, 2), function(err) {
    if (err) {
      return console.log(err);
    }
  });
}

module.exports = {
	name: 'setcounting',
	description: 'Sets the current count, so that it can be restored in cases where counting was failed because of a glitch or other non-user-fail reason.',
	usage: '[new count]',
	cooldown: 0,
	guildOnly: true,
	staffOnly: true,
	args: true,
	async execute(message, args, client, config) {
    if(args.length != 1)
    {
      message.channel.send("Try using my help command to learn how to set counting.");
      return;
    }

    const number = parseInt(args[0]);
    if(!number)
    {
      message.channel.send("Sorry, I can't set counting to " + args[0] + " because it isn't a number");
      return;
    }

    const oldCount = global.countingData.lastCount;

    global.countingData.lastCount = number;
    global.countingData.lastMessage = message.id;
    WriteState();

    let countingChannel = null;
    while(countingChannel == null)
    {
      console.log('Trying to get Counting channel');
      countingChannel = client.channels.get(config.countingChannelId);
    }

    countingChannel.send("I thought we'd counted to " + oldCount + " but " + message.author + " told me we're really at " + number + "!");
  }
};

