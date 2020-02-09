const { countingChannelId } = require('./config.json');
const { lastCountSaved } = require('./counting.json');
let lastCount = lastCountSaved;
const validCountRegex = /^[0-9]+$/;

function CheckMessages(messages)
{
  console.log(`Received ${messages.size} messages`);

  for(let [snowflake, message] of messages.entries())
  {
    if(!validCountRegex.test(message.content))
    {
      console.log('Counting failed: ' + snowflake + ': ' + message);
      continue;
    }

    console.log(message.content);
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
