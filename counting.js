const { countingChannelId } = require('./config.json');
const { lastCountSaved } = require('./counting.json');
let lastCount = lastCountSaved;
const validCountRegex = /^[0-9]+$/;

function CheckNextMessage(message)
{
    if(!validCountRegex.test(message.content))
    {
      console.log('Counting failed because invalid attempt: ' + message + ' expected ' + (lastCount + 1));
      lastCount = 0;
      return;
    }

    const number = parseInt(message.content);
    if(lastCount != null && number != lastCount + 1)
    {
      console.log('Counting failed because out of order: ' + message + ' expected ' + (lastCount + 1));
      lastCount = 0;
      return;
    }

    lastCount = number;
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

  if (lastCount == null)
  {
    queryOptions.limit = 100;
  }
  else
  {
    queryOptions.after = lastCount;
  }

  countingChannel.fetchMessages(queryOptions)
    .then(messages => CheckMessages(messages));
}

function PublicOnReady(client)
{
  RestoreCountingState(client);
}

exports.OnReady = PublicOnReady;
