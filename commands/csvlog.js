const path = require('path');
const dataLogpath = path.resolve('./datalog.json');
const dataLog = require(dataLogpath);
const fs = require('fs');

module.exports = {
  name: 'csvlog',
  description: 'DMs a CSV file with log data to the command sender.',
  usage: '',
  cooldown: 3,
  guildOnly: true,
  staffOnly: true,
  args: false,
  async execute(message, args, client) {
    const dataHolder = [];
    let chanindex = 0;
    const CSVData = [];
    CSVData[0] = [];
    const creationArray = [];
    function formatDate(timestamp) {
      const messageDate = new Date(timestamp);
      const month = (messageDate.getMonth() + 1);
      const year = messageDate.getFullYear();
      const dateString = year + '-' + ((month < 10) ? ('0' + month) : month);
      return dateString;
    }

    Object.keys(dataLog).forEach(gID => {
      Object.keys(dataLog[gID]).forEach(cID => {
        if (!dataLog[gID][cID].channelName) return;
        dataHolder[chanindex] = [];
        if (dataLog[gID][cID].numMessages) {
        // get message data for each channel in the guild
          let numMsgData = new Map(dataLog[gID][cID].numMessages);
          // ensure it's sorted by the map keys (months)
          numMsgData = new Map([...numMsgData.entries()].sort());
          dataHolder[chanindex] = [...numMsgData];
          dataHolder[chanindex].forEach(i => {if (!CSVData[0].includes(i[0])) CSVData[0].push(i[0]);});
        }
        dataHolder[chanindex].splice(0, 0, ['Channel', dataLog[gID][cID].channelName]);
        const chanCreationDate = new Date((parseInt(cID) / 4194304) + 1420070400000);
        creationArray[(chanindex + 1)] = [formatDate(chanCreationDate)];
        chanindex++;
      });
    });
    // sort the column headers stored within CSVData[0], then splice Channel to the start.
    CSVData[0].sort();
    CSVData[0].splice(0, 0, 'Channel');
    let rowIndex = 1;
    // loop through the dataholder - each item in dataholder looks like [Channel, %ChannelName], [%Month1, %#messages], [%Month2, %#messages]...
    dataHolder.forEach(chandata => {
    // initialise the row
      CSVData[rowIndex] = [];
      // Convert each dataholder item to a map
      chandata = new Map(chandata);
      // Assign each Map item to the correct index compared to the row
      chandata.forEach((data, col) => {
        CSVData[rowIndex][CSVData[0].indexOf(col)] = data;
      });
      // Backfill months after channel creation with 0s in order to differentiate from months prior to channel creation.
      CSVData[0].forEach(CSVdate => {
        CSVdate = CSVdate.toString();
        if (CSVdate == 'Channel') return;
        if (CSVdate.localeCompare(creationArray[rowIndex]) >= 0) {
        // console.log(CSVdate + ' is on or after ' + creationArray[rowIndex]);
          if (!CSVData[rowIndex][CSVData[0].indexOf(CSVdate)]) CSVData[rowIndex][CSVData[0].indexOf(CSVdate)] = 0;
        }
        else if (CSVdate.localeCompare(creationArray[rowIndex]) < 0) {
        // console.log(CSVdate + ' is before ' + creationArray[rowIndex]);
        }
      });
      rowIndex++;
    });
    fs.writeFile('./stats.csv', CSVData.join('\n'), function(err) {
      if (err) {
        return console.log(err);
      }
    });
    message.author.send({ files: ['./stats.csv'] });
  },
};