const path = require('path');
const dataLogpath = path.resolve('./datalog.json');
const dataLog = require(dataLogpath);
const ExcelJS = require('exceljs');

module.exports = {
  name: 'xlslog',
  description: 'DMs an xls file with log data to the command sender.',
  usage: '',
  cooldown: 3,
  guildOnly: true,
  staffOnly: true,
  args: false,
  async execute(message) {
    const gID = message.guild.id;
    if (!dataLog[gID]) return console.log('xlsLog requested for server I have no data for.');
    // Date formatter function & storing var for the current month
    function formatDate(timestamp) {
      const messageDate = new Date(timestamp);
      const month = (messageDate.getMonth() + 1);
      const year = messageDate.getFullYear();
      const dateString = year + '-' + ((month < 10) ? ('0' + month) : month);
      return dateString;
    }

    function friendlyDate(dateString) {
      const months = [ 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec' ];
      const dateArray = dateString.split('-');
      const year = parseInt(dateArray[0]);
      const month = parseInt(dateArray[1]) - 1;
      const niceDate = months[month] + ' ' + year;
      return niceDate;
    }

    function formatSheet(worksheet) {
      worksheet.getRow(1).eachCell((cell) => {
        if (cell.value == 'Channels') return;
        else cell.value = friendlyDate(cell.value);
      });
      worksheet.getColumn(1).width = 22;
      worksheet.getColumn(1).alignment = { horizontal: 'right' };
      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).alignment = { horizontal:'center' };
      worksheet.getRow(worksheet.rowCount).getCell(1).font = { bold: true };
      worksheet.getRow(worksheet.rowCount).border = { top: { style: 'thick' } };
    }

    // initializing XLS data
    const xlsLog = new ExcelJS.Workbook;
    const msgLogSheet = xlsLog.addWorksheet('Message Data');
    const usrLogSheet = xlsLog.addWorksheet('User Data');

    // Messagedata setup.
    // init column headers, then loop through json and populate the headers.
    const msgLogColHeaders = [];
    const usrLogColHeaders = [];
    Object.keys(dataLog[gID]).forEach(cID => {
      if (dataLog[gID][cID].numMessages) {
        // get message data for each channel in the guild
        const numMsgData = new Map(dataLog[gID][cID].numMessages);
        for (const key of numMsgData.keys()) {
          if (!msgLogColHeaders.some(h => h === key)) {
            msgLogColHeaders.push(key);
            msgLogColHeaders.sort();
          }
        }
      }
      if (dataLog[gID][cID].uniqueUsers) {
        // get user data for each channel
        const usrData = new Map(dataLog[gID][cID].uniqueUsers);
        for (const key of usrData.keys()) {
          if (!usrLogColHeaders.some(h => h === key)) {
            usrLogColHeaders.push(key);
            usrLogColHeaders.sort();
          }
        }
      }
    });
    // split out the list of months for the message log; this will be used for comparing creation date.
    msgLogColHeaders.splice(0, 0, 'Channels');
    const msgColData = [];
    msgLogColHeaders.forEach(hdr => {
      msgColData.push({ header: hdr, key: hdr, width: 9 });
    });
    msgLogSheet.columns = msgColData;

    usrLogColHeaders.splice(0, 0, 'Channels');
    const usrColData = [];
    usrLogColHeaders.forEach(hdr => {
      usrColData.push({ header: hdr, key: hdr, width: 9 });
    });
    usrLogSheet.columns = usrColData;

    const msgRowData = [];
    const usrRowData = [];
    Object.keys(dataLog[gID]).forEach(cID => {
      let chanCreationDate = '';
      if (!isNaN(parseInt(cID))) { chanCreationDate = formatDate(new Date((parseInt(cID) / 4194304) + 1420070400000)); }
      if (dataLog[gID][cID].numMessages) {
        // console.log(chanCreationDate);
        const newMsgRow = {};
        // get msg data
        let numMsgData = new Map(dataLog[gID][cID].numMessages);
        for (const month of msgLogColHeaders.slice(1)) {
          // add 0ed months for months after the creationdate of the channel
          if (!numMsgData.has(month) && month.localeCompare(chanCreationDate) >= 0) {
            // month is on or after chanCreationDate
            numMsgData.set(month, 0);
          }
        }
        numMsgData = [...numMsgData.entries()];
        numMsgData.sort();
        numMsgData.splice(0, 0, ['Channels', `#${dataLog[gID][cID].channelName}`]);
        numMsgData = new Map(numMsgData);
        numMsgData.forEach((value, key) => {
          return newMsgRow[key] = value;
        });
        msgRowData.push(newMsgRow);
      }
      // message log rows are filled and will be added after this loop is over. Now do the same for user data
      if (dataLog[gID][cID].uniqueUsers) {
        const newUsrRow = {};
        // get user data for each channel
        let usrData = new Map(dataLog[gID][cID].uniqueUsers);
        for (const month of usrLogColHeaders.slice(1)) {
          if (!usrData.has(month) && month.localeCompare(chanCreationDate) >= 0) {
            // month is on or after chanCreationDate
            usrData.set(month, 0);
          }
        }
        usrData = [...usrData.entries()];
        usrData.sort();
        usrData.splice(0, 0, ['Channels', `#${dataLog[gID][cID].channelName}`]);
        usrData = new Map(usrData);
        usrData.forEach((value, key) => {
          return newUsrRow[key] = value;
        });
        usrRowData.push(newUsrRow);
      }
    });

    // Sort row data and add the totals row.
    msgRowData.sort((a, b) => a.Channels.localeCompare(b.Channels));
    msgLogSheet.addRows(msgRowData);
    const totalMsgRow = { Channels: 'Monthly Total Messages:' };
    msgLogSheet.columns.forEach((column) => {
      column.alignment = { horizontal:'center' };
      let colTot = 0;
      if (column.key == 'Channels') return;
      column.eachCell((cell) => {
        if (cell.value == column.header) return;
        else colTot += cell.value;
      });
      totalMsgRow[column.key] = colTot;
    });
    msgLogSheet.addRow(totalMsgRow);

    usrRowData.sort((a, b) => a.Channels.localeCompare(b.Channels));
    usrLogSheet.addRows(usrRowData);
    const totalUsrRow = { Channels: 'Serverwide Unique Users:' };
    const guildUniques = new Map(dataLog[gID].guildUniqueUsers);
    usrLogSheet.columns.forEach((column) => {
      column.alignment = { horizontal:'center' };
      if (column.key != 'Channels') totalUsrRow[column.key] = guildUniques.get(column.key);
    });
    usrLogSheet.addRow(totalUsrRow);

    // apply formatting
    formatSheet(msgLogSheet);
    formatSheet(usrLogSheet);

    usrLogSheet.addRow();
    const guildTotUsrRow = { Channels: 'Total users @ EOM:' };
    const guildTotUsers = new Map(dataLog[gID].guildTotalUsers);
    usrLogSheet.columns.forEach((column) => {
      if (column.key != 'Channels') guildTotUsrRow[column.key] = guildTotUsers.get(column.key);
    });
    usrLogSheet.addRow(guildTotUsrRow);
    usrLogSheet.getRow(usrLogSheet.rowCount).getCell(1).font = { bold: true };

    xlsLog.xlsx.writeFile('./stats.xlsx');
    message.author.send({ files: ['./stats.xlsx'] });
  },
};