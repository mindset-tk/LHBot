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
  async execute(message) {
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
        creationArray[chanindex] = [formatDate(chanCreationDate)];
        chanindex++;
      });
    });
    // Pad the array of channel creation dates in order to match it with the CSVData indices.
    creationArray.splice(0, 0, ' ');
    // sort the column headers stored within CSVData[0], then splice Channel to the start.
    CSVData[0].sort();
    CSVData[0].splice(0, 0, 'Channel');
    // Set rowIndex to 1; we are skipping CSVData[0] because it is our headers.
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
      // Go through all months there is data for, then fill months after channel creation with 0s in order to differentiate from months prior to channel creation.
      CSVData[0].forEach(CSVdate => {
        CSVdate = CSVdate.toString();
        if (CSVdate == 'Channel') return;
        if (CSVdate.localeCompare(creationArray[rowIndex]) >= 0) {
        // console.log(CSVdate + ' is on or after ' + creationArray[rowIndex]);
          if (!CSVData[rowIndex][CSVData[0].indexOf(CSVdate)]) CSVData[rowIndex][CSVData[0].indexOf(CSVdate)] = 0;
        }
        else if (CSVdate.localeCompare(creationArray[rowIndex]) < 0) {
          if (!CSVData[rowIndex][CSVData[0].indexOf(CSVdate)]) CSVData[rowIndex][CSVData[0].indexOf(CSVdate)] = ' ';
        }
      });
      rowIndex++;
    });

    // To total up each column - first rotate the table via forEach commands.
    const rotatedTable = [];
    rowIndex = 0;
    CSVData.forEach((chanCounts => {
      if (chanCounts[0] == 'Channel') return;
      let columnIndex = 0;
      chanCounts.forEach(monthlyCount =>{
        if (!rotatedTable[columnIndex]) rotatedTable[columnIndex] = [];
        rotatedTable[columnIndex][rowIndex] = monthlyCount;
        columnIndex++;
      });
      rowIndex++;
    }));
    // then, snip off the first row of the new table (it had Channel names in it), and sum across each row, pushing it into a new totals array
    rotatedTable.splice(0, 1);
    const totals = [];
    rotatedTable.forEach(monthlyCount => {
      // Now each item in the rotatedTable array is one month of message counts for the entire month. So we can reduce that array to sum up monthly totals.
      const monthlySum = arr => arr.reduce((a, b) => {
        if ((typeof a == 'number') && (typeof b == 'number')) return a + b;
        else if ((typeof a == 'number') && !(typeof b == 'number')) return a;
        else if (!(typeof a == 'number') && (typeof b == 'number')) return b;
        return 0;
      });
      totals.push(monthlySum(monthlyCount));
    });
    // Add a label and append the totals row to the end of CSVData [creating a new row in the process]
    totals.splice(0, 0, 'Monthly Total Messages:');
    CSVData.push(totals);
    // Initialize for a second table of user data
    CSVData.push('');
    CSVData.push('Unique User Data');
    CSVData.push(CSVData[0]);
    chanindex = CSVData.length;
    dataHolder.length = 0;
    // Now we can add user counts to the bottom of this table.
    Object.keys(dataLog).forEach(gID => {
      Object.keys(dataLog[gID]).forEach(cID => {
        if (!dataLog[gID][cID].channelName) return;
        dataHolder[chanindex] = [];
        if (dataLog[gID][cID].uniqueUsers) {
        // get user data for each channel in the guild
          let numUsrData = new Map(dataLog[gID][cID].uniqueUsers);
          // ensure it's sorted by the map keys (months)
          numUsrData = new Map([...numUsrData.entries()].sort());
          dataHolder[chanindex] = [...numUsrData];
        }
        dataHolder[chanindex].splice(0, 0, ['Channel', dataLog[gID][cID].channelName]);
        const chanCreationDate = new Date((parseInt(cID) / 4194304) + 1420070400000);
        creationArray[chanindex] = [formatDate(chanCreationDate)];
        chanindex++;
      });
    });
    // set row index such that we'll be appending new items instead of messing with old.
    // Note: why the fuck didn't I make this using CSVData.push? I forget! Hell if I'm rewriting it tho.
    rowIndex = CSVData.length;
    // loop through the dataholder - each item in dataholder looks like [Channel, %ChannelName], [%Month1, %uniqueUsers], [%Month2, %uniqueUsers]...
    dataHolder.forEach(chandata => {
      // initialise the row
      CSVData[rowIndex] = [];
      // Convert each dataholder item to a map
      chandata = new Map(chandata);
      // Assign each Map item to the correct index compared to the row
      chandata.forEach((data, col) => {
        CSVData[rowIndex][CSVData[0].indexOf(col)] = data;
      });
      // Go through all months there is data for, then fill months after channel creation with 0s in order to differentiate from months prior to channel creation.
      CSVData[0].forEach(CSVdate => {
        CSVdate = CSVdate.toString();
        if (CSVdate == 'Channel') return;
        if (CSVdate.localeCompare(creationArray[rowIndex]) >= 0) {
        // console.log(CSVdate + ' is on or after ' + creationArray[rowIndex]);
          if (!CSVData[rowIndex][CSVData[0].indexOf(CSVdate)]) CSVData[rowIndex][CSVData[0].indexOf(CSVdate)] = 0;
        }
        else if (CSVdate.localeCompare(creationArray[rowIndex]) < 0) {
          if (!CSVData[rowIndex][CSVData[0].indexOf(CSVdate)]) CSVData[rowIndex][CSVData[0].indexOf(CSVdate)] = ' ';
        }
      });
      rowIndex++;
    });
    CSVData.splice(0, 0, 'Message Data');

    fs.writeFile('./stats.csv', CSVData.join('\n'), function(err) {
      if (err) {
        return console.log(err);
      }
    });
    message.author.send({ files: ['./stats.csv'] });
  },
};