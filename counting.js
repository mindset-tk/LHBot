// TODO move anything important out of Config.json
const fs = require('fs');
const path = require('path');
let config = null;
const countingDataPath = path.resolve('./counting.json');
if(global.countingData == null) {
  global.countingData = require(countingDataPath);
}
const validCountRegex = /^[0-9]+$/;
let countingChannel = null;
let offlineCheckComplete = false;

function WriteState() {
  fs.writeFile(countingDataPath, JSON.stringify(global.countingData, null, 2), function(err) {
    if (err) {
      return console.log(err);
    }
  });
}

function BuildBotMessage(author, botMessages) {
  const messageIndex = Math.floor(Math.random() * botMessages.length);
  let botMessage = botMessages[messageIndex];

  botMessage = botMessage.replace(/\$user/g, author);
  return(botMessage);
}

function FailCounting(message, reason) {
  console.log(reason);
  global.countingData.lastCount = 0;
  global.countingData.lastMessage = message.id;
  global.countingData.lastCounters = [];
}

function CheckNextMessage(message) {
  const nextNumber = global.countingData.lastCount + 1;
  const numberString = Number(nextNumber).toString();
  // console.log(message);
  if(!validCountRegex.test(message.content)) {
    FailCounting(message, `Counting failed because invalid attempt: ${message} expected ${numberString}. MsgID: ${message.id}, Author: ${message.author.tag}`);
    return BuildBotMessage(message.author, config.countingFailMessages);
  }

  if(global.countingData.lastCount != null && message.content.localeCompare(numberString) != 0) {
    FailCounting(message, `Counting failed because out of order: ${message} expected ${numberString}. MsgID: ${message.id}, Author: ${message.author.tag}`);
    return BuildBotMessage(message.author, config.countingFailMessages);
  }

  const lastCountersSize = global.countingData.lastCounters.length;

  if(lastCountersSize > 0 && global.countingData.lastCounters[lastCountersSize - 1] == message.author.id) {
    FailCounting(message, `Counting failed because user counted twice: ${message.author.tag}`);
    return BuildBotMessage(message.author, config.countingFailRepeatMessages);
  }

  global.countingData.lastCount = nextNumber;
  global.countingData.lastMessage = message.id;

  global.countingData.lastCounters.push(message.author.id);

  let userCounts = [];
  for(let counterId of global.countingData.lastCounters) {
    if(userCounts[counterId] == null) {
      userCounts[counterId] = 0;
    }

    userCounts[counterId] = userCounts[counterId] + 1;
  }

  let relay = true;

  for(var id in userCounts) {
    var count = userCounts[id];
    if(count < 2) {
      relay = false;
    }
  }

  if(relay) {
    const reactIdx = Math.floor(Math.random() * config.repeatReacts.length);
    message.react(config.repeatReacts[reactIdx]);
  }


  if(global.countingData.lastCounters.length > 3) {
    global.countingData.lastCounters.shift();
  }

  // console.log(message.content);
  return null;
}

function CheckMessages(messages) {
  console.log(`Retrieved ${messages.size} messages from counting channel.`);
  let outputMessages = null;

  for(let snowflake of Array.from(messages.keys()).reverse()) {
    const message = messages.get(snowflake);
    if(!message.author.bot) {
      const out = CheckNextMessage(message);
      if(out) {
        if(outputMessages) {
          outputMessages += '\n';
        }
        else {
          outputMessages = '';
        }
        outputMessages += out;
      }
    }
  }
  if(outputMessages) {
    if(global.countingData.lastCount == 0) {
      outputMessages += '\n' + BuildBotMessage({ author: 'dummy' }, config.countingStartMessages);
    }
    countingChannel.send(outputMessages);
  }
  if(messages.size == 0) {
    console.log(`Resuming counting from ${global.countingData.lastCount}`);
    offlineCheckComplete = true;
  }
  WriteState();
}

function RestoreCountingState(client) {
  if (!config.countingChannelId) {
    console.log('No counting channel set!');
    return;
  }

  console.log('Counting channel: ' + config.countingChannelId);

  while(countingChannel == null) {
    console.log('Trying to get Counting channel');
    countingChannel = client.channels.cache.get(config.countingChannelId);
  }

  console.log('Counting channel: ' + countingChannel.name);

  var queryOptions = {};

  while(offlineCheckComplete == false) {

    console.log('Checking offline messages');

    if (global.countingData.lastMessage == null) {
      queryOptions.limit = 100;
    }
    else {
      queryOptions.after = global.countingData.lastMessage;
    }

    countingChannel.messages.fetch(queryOptions)
      .then(messages => CheckMessages(messages))
      .catch(offlineCheckComplete = true);
  }
}

function InitConfig(lrConfig) {
  config = lrConfig;
  if(config.countingFailMessages == null) {
    config.countingFailMessages = ['Oh my.', 'Hmm, that\'s not right.', 'No no no, that\'s not how it goes.', 'Oh dear, oh dear.', 'Wait a moment! That\'s out of order!', 'Heck!'];
  }
  if(config.countingFailRepeatMessages == null) {
    config.countingFailRepeatMessages = ['Sorry $user, you\'re not allowed to count twice in a row'];
  }
  if(config.countingStartMessages == null) {
    config.countingStartMessages = ['Time to start over', 'Back to the beginning!', 'Gimme a 1', 'What do we start with?', '0'];
  }
  if(config.repeatReacts == null) {
    config.repeatReacts = ['😠', '🤔', '😡', '🤨', '😑', '🙄', '😣', '😥', '🤐', '😫', '😒', '😓', '😔', '☹️', '🙁', '😖', '😞', '😟', '😢', '😭', '😦', '😧', '😨', '😩', '😬', '😱', '🤫', '👿', '😾', '🙅', '🤬'];
  }
}

function InitCountingData() {
  if(global.countingData.lastCounters == null) {
    global.countingData.lastCounters = [];
  }
}

function PublicOnReady(lrConfig, client) {
  if (!lrConfig.countingToggle) {return;}
  InitConfig(lrConfig);
  InitCountingData();
  RestoreCountingState(client);
}

function PublicHandleMessage(message) {
  if(!config || !config.countingToggle) {
    return;
  }
  if(message.channel.id === config.countingChannelId && !message.author.bot) {
    let output = CheckNextMessage(message);
    if(output) {
      if(global.countingData.lastCount == 0) {
        output += '\n' + BuildBotMessage(message, config.countingStartMessages);
      }
      message.channel.send(output);
    }
    WriteState();
    return(true);
  }
  return(false);
}

exports.OnReady = PublicOnReady;
exports.HandleMessage = PublicHandleMessage;
