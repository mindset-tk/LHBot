const fs = require('fs');
const path = require('path');
let config = null;
const countingDataPath = path.resolve('./counting.json');
const countingData = require(countingDataPath);
const validCountRegex = /^[0-9]+$/;

// Function to write game list data to file
function WriteState() {
  fs.writeFile(countingDataPath, JSON.stringify(countingData, null, 2), function(err) {
    if (err) {
      return console.log(err);
    }
  });
}

function BuildBotMessage(userMessage, botMessages)
{
  const messageIndex = Math.floor(Math.random() * botMessages.length);
  let botMessage = botMessages[messageIndex];

  botMessage = botMessage.replace(/\$user/g, userMessage.author.username);
  return(botMessage);
}

function FailCounting(message, reason)
{
  message.channel.send(BuildBotMessage(message, config.countingFailMessages));
  message.channel.send(BuildBotMessage(message, config.countingStartMessages));
  message.channel.send("0");
  //console.log(reason);
  countingData.lastCount = 0;
  countingData.lastMessage = message.id;
}

function CheckNextMessage(message)
{
  //console.log(message);
  if(!validCountRegex.test(message.content))
  {
    FailCounting(message, 'Counting failed because invalid attempt: ' + message + ' expected ' + (countingData.lastCount + 1));
    return;
  }

  const number = parseInt(message.content);
  if(countingData.lastCount != null && number != countingData.lastCount + 1)
  {
    FailCounting(message, 'Counting failed because out of order: ' + message + ' expected ' + (countingData.lastCount + 1));
    return;
  }

  countingData.lastCount = number;
  countingData.lastMessage = message.id;
  //console.log(message.content);
}

function CheckMessages(messages)
{
  console.log(`Received ${messages.size} messages`);

  for(let snowflake of Array.from(messages.keys()).reverse())
  {
    const message = messages.get(snowflake);
    if(!message.author.bot)
    {
      CheckNextMessage(message);
    }
  }
  console.log(`Resuming counting from ${countingData.lastCount}`);
  WriteState();
}

function RestoreCountingState(client)
{
  console.log('Counting channel: ' + config.countingChannelId);

  var countingChannel;
  while(countingChannel == null)
  {
    console.log('Trying to get Counting channel');
    countingChannel = client.channels.get(config.countingChannelId);
  }
  
  console.log('Counting channel: ' + countingChannel.name);

  var queryOptions = {};

  if (countingData.lastMessage == null)
  {
    queryOptions.limit = 100;
  }
  else
  {
    queryOptions.after = countingData.lastMessage;
  }

  countingChannel.fetchMessages(queryOptions)
    .then(messages => CheckMessages(messages));
}

function InitConfig(lrConfig)
{
  config = lrConfig;
  if(config.countingFailMessages == null)
  {
    config.countingFailMessages = ["I think $user broke counting!"];
  }
  if(config.countingStartMessages == null)
  {
    config.countingStartMessages = ["I'll start us off again", "Why not try an easy one?", "Back to the beginning!"];
  }
}

function PublicOnReady(lrConfig, client)
{
  InitConfig(lrConfig);
  RestoreCountingState(client);
}

function PublicHandleMessage(message)
{
  if(message.channel.id === config.countingChannelId && !message.author.bot)
  {
    CheckNextMessage(message);
    WriteState();
    return(true);
  }
  return(false);
}

exports.OnReady = PublicOnReady;
exports.HandleMessage = PublicHandleMessage;
