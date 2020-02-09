const { lastCount } = require('./counting.json');
const { countingChannelId } = require('./config.json');

function OnReady(client)
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
    .then(messages => console.log(`Received ${messages.size} messages`))
    .catch(console.error);
}

exports.OnReady = OnReady;
