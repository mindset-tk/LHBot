const fs = require('fs');
const path = require('path');
const { countingChannelId } = require('./config.json');
const countingDataPath = path.resolve('./counting.json');
const countingData = require(countingDataPath);
const validCountRegex = /^[0-9]+$/;

// Function to write game list data to file
function WriteState() {
  fs.writeFile(countingDataPath, JSON.stringify(countingData, null, 2), function(err) {
    if (err) {
      //message.channel.send('There was an error saving counting data!');
      return console.log(err);
    }
  });
}

function CheckNextMessage(message)
{
  if(!validCountRegex.test(message.content))
  {
    console.log('Counting failed because invalid attempt: ' + message + ' expected ' + (countingData.lastCount + 1));
    countingData.lastCount = 0;
    countingData.lastMessage = message.id;
    return;
  }

  const number = parseInt(message.content);
  if(countingData.lastCount != null && number != countingData.lastCount + 1)
  {
    console.log('Counting failed because out of order: ' + message + ' expected ' + (countingData.lastCount + 1));
    countingData.lastCount = 0;
    countingData.lastMessage = message.id;
    return;
  }

  countingData.lastCount = number;
  countingData.lastMessage = message.id;
  console.log(message.content);
}

function CheckMessages(messages)
{
  console.log(`Received ${messages.size} messages`);

  for(let snowflake of Array.from(messages.keys()).reverse())
  {
    const message = messages.get(snowflake);
    CheckNextMessage(message);
  }
  WriteState();
}

function RestoreCountingState(client)
{
  console.log('Counting channel: ' + countingChannelId);


  var countingChannel;
  while(countingChannel == null)
  {
    console.log('Trying to get Counting channel');
    countingChannel = client.channels.get(countingChannelId);
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

function PublicOnReady(client)
{
  RestoreCountingState(client);
}

function PublicHandleMessage(message)
{
  if(message.channel.id === countingChannelId)
  {
    CheckNextMessage(message);
    WriteState();
    return(true);
  }
  return(false);
}

exports.OnReady = PublicOnReady;
exports.HandleMessage = PublicHandleMessage;
