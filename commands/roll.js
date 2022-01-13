const path = require('path');
const configPath = path.resolve('./config.json');
const config = require(configPath);


// function to roll x dice with y sides
function rollDice(dice, sides) {
  const arr = [];
  for (let i = 0; i < dice; i++) {
    arr.push(Math.floor(Math.random() * sides + 1));
  }
  // sort ascending
  arr.sort((a, b) => a - b);
  return arr;
}

// func to convert to standard dnotation
function convertToD(dice, sides, mod) {
  let convertedString = `${dice}d${sides}`;
  if (mod != 0) {
    if (mod > 0) {convertedString = `${convertedString}+${mod}`;}
    if (mod < 0) {convertedString = `${convertedString}${mod}`;}
  }
  return convertedString;
}

async function getnickname(message, client) {
  const user = await client.users.fetch(message.author.id);
  const guild = message.guild;
  const guildmember = await guild.members.fetch(user);
  return guildmember.displayName;
}

module.exports = {
  name: 'roll',
  description: 'Roll dice. You can roll multiple sets of dice by separating them with a space. Decimal numbers, negative numbers, 0, and numbers larger than 1000 are not accepted.',
  cooldown: 1,
  usage: `#d#±# (ex. 2d6+1) for standard usage. You may drop the #dice to only roll 1 (ex. d6+1 will roll 1d6+1)
*${config.prefix}roll 1d#±#a* to roll 2 dice with advantage (ex. 1d20a, d20a, d20+1a are all valid)
*${config.prefix}roll 1d#±#d* to roll 2 dice with disadvantage (ex. 1d20d, d20d, d20+1d are all valid)
*Note: advantage and disadvantage must be with a single die; they will not run with more than 1 die.*
**ADVANCED USAGE**
The bot can keep or drop highest/lowest n dice:
*${config.prefix}roll #d#±#*kh*#* will keep the highest # dice. (ex 4d6+2kh3 would keep the highest 3 dice out of a 4d6+2 roll)
Replace kh above with the following options:
kh# - keep highest #
kl# - keep lowest #
dh# - drop highest #
dl# - drop lowest #`,
  async execute(message, args, client) {
    // Regex to test input against.
    // Regex groups: 1 is numdice, 2 is sides, 3 is +/-, 4 is bonus, 5 is the addendum in full (kh1/dl1/a/d etc)
    const diceRegex = new RegExp(/([0-9]+)d([0-9]+)([+-])?([0-9]+)?(.+)?/);
    // Regex to work with special addendums for keeping/dropping stuff
    // group 1 is kh/dl/kl/dh
    const advancedRegex = new RegExp(/(kh|dl|kl|dh)([0-9]+)/);
    // check for blank arguments
    if (!args.length) { return message.channel.send('You need to provide dice to roll!'); }
    // check for too many args
    else if (args.length > 10) { return message.channel.send('The maximum number of separate rolls at one time is 10.'); }


    const nickname = await getnickname(message, client);

    if (args.length > 10) { return message.channel.send('Too many separate rolls. Please make no more than 10 individual rolls at a time.'); }

    // format args in lowercase and, if any of the entries are in simplified "d##" format, append a 1 to the beginning.
    args.forEach((data, index) => {
      data = data.toLowerCase();
      if (data.charAt(0) == 'd') {
        data = '1' + data;
      }
      args[index] = data;
    });

    const resultArray = [`${nickname} made the following rolls:`];

    args.forEach((input, index) => {
      if (!input.match(diceRegex)) {
        return resultArray.push(`I couldn't interpret \`${args[index]}\`, please review your input and try again.`);
      }
      let critSuccess = false;
      let critFail = false;
      let resultStr = '';
      let diceArr = [];
      let dnotation;
      let result;
      const filteredInput = input.match(diceRegex);
      // console.log(filteredInput);
      const numDice = parseInt(filteredInput[1]);
      const sides = parseInt(filteredInput[2]);
      if (numDice > 1000 || sides > 1000) { return resultArray.push(`\`${args[index]}\` not accepted. Please do not roll more than 1000 dice or 1000 sides.`); }
      let modInt = 0;
      if (filteredInput[3] && filteredInput[4]) {
        const modSign = filteredInput[3];
        const modifier = filteredInput[4];
        // get modifier as a positive/negative int
        modInt = eval(`0 ${modSign} ${modifier}`);
      }

      if (filteredInput[5] == 'a') {
        if (numDice != 1 && numDice != 2) {
          return resultArray.push('Please only use 1 die on advantage/disadvantage rolls, (eg. d20a, 1d20a)');
        }
        else {
          resultStr = ' with advantage';
          diceArr = rollDice(2, sides);
          result = parseInt(diceArr[1]) + modInt;
          if (sides == 20 && diceArr[1] == 20) { critSuccess = true; }
          if (sides == 20 && diceArr[1] == 1) { critFail = true; }
          diceArr[0] = '~~' + diceArr[0] + '~~';
          dnotation = convertToD(numDice, sides, modInt);
        }
      }
      else if (filteredInput[5] == 'd') {
        if (numDice != 1 && numDice != 2) {
          return resultArray.push('Please only use 1 die on advantage/disadvantage rolls, (eg. d20d, 1d20d)');
        }
        else {
          resultStr = ' with disadvantage';
          diceArr = rollDice(2, sides);
          result = diceArr[0] + modInt;
          if (sides == 20 && diceArr[0] == 20) { critSuccess = true; }
          if (sides == 20 && diceArr[0] == 1) { critFail = true; }
          diceArr[1] = '~~' + diceArr[1] + '~~';
          // swap order of array so the dropped die will show up first.
          diceArr[2] = diceArr[0];
          diceArr.shift();
          dnotation = convertToD(numDice, sides, modInt);
        }
      }
      else if (filteredInput[5] && filteredInput[5].match(advancedRegex)) {
        const advData = filteredInput[5].match(advancedRegex);
        if (advData[2] > numDice) { return resultArray.push(`Invalid entry \`${args[index]}\` Please do not keep/drop more dice than you roll!`);}
        // note to self: dicearr is in ascending order
        diceArr = rollDice(numDice, sides);
        const numAdv = advData[2];
        let diceToKeep = [];
        let diceToDrop = [];
        // keep highest
        if (advData[1] == 'kh') {
          diceToKeep = diceArr.splice(numDice - numAdv, numDice + 1);
          diceToDrop = diceArr;
          if (advData[2] == 0) {
            result = 0 + modInt;
          }
          else { result = diceToKeep.reduce((a, b) => a + b) + modInt; }
          for(let i = 0; i < diceToDrop.length; i++) {
            diceToDrop[i] = '~~' + diceToDrop[i] + '~~';
          }
          diceArr = diceToDrop.concat(diceToKeep);
          dnotation = convertToD(numDice, sides, modInt);
          resultStr = `, keeping the highest ${numAdv} dice`;
        }
        else if (advData[1] == 'kl') {
          diceToKeep = diceArr.splice(0, numAdv);
          diceToDrop = diceArr;
          if (advData[2] == 0) {
            result = 0 + modInt;
          }
          else { result = diceToKeep.reduce((a, b) => a + b) + modInt; }
          for(let i = 0; i < diceToDrop.length; i++) {
            diceToDrop[i] = '~~' + diceToDrop[i] + '~~';
          }
          diceArr = diceToDrop.concat(diceToKeep);
          dnotation = convertToD(numDice, sides, modInt);
          resultStr = `, keeping the lowest ${numAdv} dice`;
        }
        else if (advData[1] == 'dh') {
          diceToKeep = diceArr.splice(0, numDice - numAdv);
          diceToDrop = diceArr;
          if (advData[2] == 0) {
            result = 0 + modInt;
          }
          else { result = diceToKeep.reduce((a, b) => a + b) + modInt; }
          for(let i = 0; i < diceToDrop.length; i++) {
            diceToDrop[i] = '~~' + diceToDrop[i] + '~~';
          }
          diceArr = diceToDrop.concat(diceToKeep);
          dnotation = convertToD(numDice, sides, modInt);
          resultStr = `, dropping the highest ${numAdv} dice`;
        }
        else if (advData[1] == 'dl') {
          diceToKeep = diceArr.splice(numAdv, numDice + 1);
          diceToDrop = diceArr;
          if (advData[2] == 0) {
            result = 0 + modInt;
          }
          else { result = diceToKeep.reduce((a, b) => a + b) + modInt; }
          for(let i = 0; i < diceToDrop.length; i++) {
            diceToDrop[i] = '~~' + diceToDrop[i] + '~~';
          }
          diceArr = diceToDrop.concat(diceToKeep);
          dnotation = convertToD(numDice, sides, modInt);
          resultStr = `, dropping the lowest ${numAdv} dice`;
        }
      }
      else if (filteredInput[5] && !filteredInput[5].match(advancedRegex)) { return resultArray.push(`Invalid entry \`${args[index]}\`. Check your syntax, I couldn't parse \`${filteredInput[5]}\`.`);}
      else {
        diceArr = rollDice(numDice, sides);
        if (numDice == 1 && sides == 20 && diceArr[0] == 20) { critSuccess = true; }
        if (numDice == 1 && sides == 20 && diceArr[0] == 1) { critFail = true; }
        result = diceArr.reduce((a, b) => a + b) + modInt;
        dnotation = convertToD(numDice, sides, modInt);
      }
      let resultDice;
      if (diceArr.length > 25) { resultDice = 'Too many dice to show.'; }
      else { resultDice = diceArr.join(', '); }
      return resultArray.push(`${dnotation}${resultStr}. [${resultDice}] Result: **${result}** ${critSuccess ? ' (Critical success!)' : '' }${critFail ? ' (Critical failure!)' : '' }`);
    });
    message.channel.send(resultArray.join('\n'), { split: true });
  },
};