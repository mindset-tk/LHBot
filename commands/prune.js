const fs = require('fs');
const path = require('path');
const moment = require('moment-timezone');
const ExcelJS = require('exceljs');
const configPath = path.resolve('./config.json');
const config = require(configPath);
const pruneStoragePath = path.resolve('./prunestorage.json');

fs.existsSync(pruneStoragePath, (err) => {
  if (err) {
    return console.log('There are no users pending prune to restore the roles for!');
  }
});

// function to create a message collector.
async function msgCollector(message) {
  let reply = false;
  // create a filter to ensure output is only accepted from the author who initiated the command.
  const filter = input => (input.author.id === message.author.id);
  await message.channel.awaitMessages(filter, { max: 1, time: 60000, errors: ['time'] })
    // this method creates a collection; since there is only one entry we get the data from collected.first
    .then(collected => reply = collected.first())
    .catch(collected => message.channel.send('Sorry, I waited 60 seconds with no response, please run the command again.'));
  return reply;
}

// save disk space and increase readability
function prettyPrintJson(file) {
  const output = JSON.stringify(file, function(k, v) {
    if (v instanceof Array) {
      return JSON.stringify(v);
    }
    return v;
  }, 2).replace(/\\/g, '')
    .replace(/"\[/g, '[')
    .replace(/\]"/g, ']')
    .replace(/"\{/g, '{')
    .replace(/\}"/g, '}');
  return output;
}

// Function to write to .json file
function writeData(filePath, file) {
  fs.writeFile(filePath, prettyPrintJson(file), function(err) {
    if (err) {
      return console.log(err);
    }
  });
}

async function getUser(ID, message) {
  if (ID.startsWith('<@!') && ID.endsWith('>')) {
    ID = ID.slice(3, -1);
    return await message.guild.member(ID);
  }
  else {
    try { return await message.guild.member(ID);}
    catch { return null;}
  }
}

function requireUncached(module) {
  delete require.cache[require.resolve(module)];
  return require(module);
}

async function pruneRestore(args, message) {
  if (!message.guild.me.hasPermission(['MANAGE_CHANNELS', 'MANAGE_ROLES'])) {
    return message.channel.send('Sorry, I don\'t have the necessary permissions (manage channels and manage roles)');
  }

  // Set the name of the role/channel to be used for prunes
  const pruneTitle = config.pruneTitle ? config.pruneTitle : 'prune-limbo';

  // Get users' temporarily stored roles
  const pruneStorage = requireUncached(pruneStoragePath);
  let fullRestore = 0;

  // If the prune list is empty, do clean-up!
  if (Object.keys(pruneStorage).length === 0) {
    pruneCleanup(message, pruneTitle);
    return message.channel.send('There doesn\'t appear to be an ongoing prune. Any necessary clean-up is completed');
  }

  // Pull the args so we know what we're working with
  if (!args || args.length === 0) {
    // Do they intend to restore all people in limbo?
    message.channel.send('Restore the roles of anyone currently waiting to be pruned and clean up?');
    let reply = await msgCollector(message);
    if (!reply) { return; }
    if (reply.content.toLowerCase() == 'n' || reply.content.toLowerCase() == 'no') {
      return message.channel.send('Okay! No changes have been made');
    }
    // If they say yes, then set the args to all users currently in limbo
    else if (reply.content.toLowerCase() == 'y' || reply.content.toLowerCase() == 'yes') {
      args = Object.keys(pruneStorage);
      fullRestore = 1;
    }
  }

  // Setup variables for the numbers of successfully restored members and ones where there's an error
  let erroredMembers = 0;
  const restoredMembers = new Array();
  for(const arg of args) {
    const member = await getUser(arg, message);

    // If the member doesn't exist, isn't manageable, or isn't in the prunestore, increase 'error' count
    if (member === null || !member.manageable || !pruneStorage[member.user.id]) {
      if (fullRestore === 1) {
        delete pruneStorage[arg];
        writeData(pruneStoragePath, pruneStorage);
      }
      else {
        // console.log(member);
        erroredMembers += 1;
      }
      continue;
    }

    // Restore the roles of the selected people
    await member.roles.set(pruneStorage[member.user.id], 'Restoring user roles');

    // Clear the member out of prunestorage, write it, and add them to the array for the end-report
    delete pruneStorage[member.user.id];
    writeData(pruneStoragePath, pruneStorage);
    restoredMembers.push(`<@${member.user.id}>`);
  }

  // If we've emptied out the prunestorage, then clean-up the prune!
  if (Object.keys(pruneStorage).length === 0) {
    pruneCleanup(message, pruneTitle);
  }

  // List out the results
  let resultMsg = '';
  if (restoredMembers.length > 0) {
    resultMsg += `Restored roles for: ${restoredMembers.join(', ')}`;
  }
  if (erroredMembers > 0) {
    resultMsg += `\n**${erroredMembers}** member(s) were entered in error and not restored`;
  }
  if (resultMsg === '') {
    resultMsg += 'The only members remaining in the list have already left the server';
  }
  return message.channel.send(resultMsg);
}

async function pruneExclude(args, message) {
  // Make sure there's data to even process
  if(!global.dataLog[message.guild.id].pruneData || global.dataLogLock == 1) {
    return message.channel.send('There\'s either no prune data right now, or the datalog is still caching');
  }

  // If there are no args, error
  if (!args || args.length === 0) {
    return message.channel.send('You need to choose to either **add**, **remove**, or **list** exclusions');
  }

  // Get the prune data into a map and grab the first arg
  const pruneData = new Map(global.dataLog[message.guild.id].pruneData);
  const firstArg = (args.shift()).toLowerCase();

  // If they want to list the current exclusions
  if (firstArg === 'l' || firstArg === 'list') {

    // Initialize the array, push each member with the exclusion flag onto it
    const excluded = [];
    for (const member of pruneData) {
      if (member[1].length === 2) {
        excluded.push(`<@${member[0]}>`);
      }
    }
    if (excluded.length > 0) {
      message.channel.send(`Members currently excluded from pruning: ${excluded.join(', ')}`);
    }
    else {
      message.channel.send('There are no members currently excluded from being pruned.');
    }
  }

  // If they want to add someone,
  else if (firstArg === 'a' || firstArg === 'add') {

    // Grab the member for the ID or mention
    const member = await getUser(args[0], message);

    // Make sure they exist as a member and are in the prunedata
    if (member === null || !pruneData.has(member.user.id)) {
      return message.channel.send('This doesn\'t seem to be a member on the server. Please make sure you entered everything correctly');
    }

    // If they're not yet excluded, exclude them and save what we've done
    if (pruneData.get(member.user.id).length == 1) {
      pruneData.get(member.user.id).push(1);
      global.dataLog[message.guild.id].pruneData = [...pruneData];
      return message.channel.send(`Success! <@${member.id}> is now excluded from being pruned`);
    }
    else {
      return message.channel.send(`Hmm, it seems <@${member.id}> is already excluded from being pruned`);
    }
  }

  // If they want to remove someone,
  else if (firstArg === 'r' || firstArg === 'remove') {

    // Make sure they exist as a member and are in the prunedata
    const member = await getUser(args[0], message);
    if (member === null || !pruneData.has(member.user.id)) {
      return message.channel.send('This doesn\'t seem to be a member on the server. Please make sure you entered everything correctly');
    }

    // If they're excluded, remove that flag and save what we've done
    if (pruneData.get(member.user.id).length == 2) {
      pruneData.get(member.user.id).pop();
      global.dataLog[message.guild.id].pruneData = [...pruneData];
      return message.channel.send(`Success! <@${member.id}> is no longer excluded from being pruned`);
    }
    else {
      return message.channel.send(`Hmm, it seems <@${member.id}> wasn't excluded from being pruned to begin with`);
    }
  }
  else {
    return message.channel.send('You need to choose to either **add**, **remove**, or **list** exclusions');
  }
}

async function prunePrep(args, message, client) {

  // Make sure that all the prune data's up to date if anyone has joined or left the server
  const dataLogger = require(path.resolve('./datalog.js'));
  dataLogger.PruneDataMaintenance(client);

  // Setup the inactivity variable and intiailize the users-to-prune array
  let maxTimeSinceActive = 6;
  let kickNow = 0;
  const usersToPrune = new Array();

  // Pull the first arg so we know what we're working with
  let firstArg = args.shift();

  if (firstArg) {
    if (firstArg.toLowerCase() === 'kick') {
      kickNow = 1;
      firstArg = args.shift();
    }
    if (parseFloat(firstArg)) {
      maxTimeSinceActive = (parseFloat(firstArg));
    }
    else if (firstArg && firstArg.toLowerCase() === 'all') {
      maxTimeSinceActive = 0;
    }
  }

  const permsRequired = ['VIEW_CHANNEL', 'MANAGE_CHANNELS', 'MANAGE_ROLES', 'SEND_MESSAGES', 'READ_MESSAGE_HISTORY', 'MANAGE_MESSAGES', 'MENTION_EVERYONE'];
  if (kickNow === 0 && !message.guild.me.hasPermission(permsRequired)) {
    return message.channel.send('Sorry, I don\'t have all the necessary permissions (' + permsRequired.join(',') + ')');
  }

  // Set the name of the role/channel to be used for prunes. Probably will go in a config soon?
  const pruneTitle = config.pruneTitle ? config.pruneTitle : 'prune-limbo';
  // Sets the intro message and description for the prune channel
  const pruneIntro = `If you're in this channel, you've been inactive in the server for at least ${Math.round(maxTimeSinceActive)} months! Rather than kick you outright, this process offers a chance to potentially rejoin the community. This channel will be around for __72 hours__ to let you chime in and express that interest.`;

  // For discord snowflake processing
  const discordEpoch = BigInt(1420070400000);

  // Initialize the pruneStorage map. No need to import an "old one"- we'll be starting anew either way? maybe i'll change my mind and check for the file instead
  const pruneStorage = new Map();

  // Only proceed if there isn't a prune in process, or we're doing a full list
  if ((message.guild.roles.cache.find(role => role.name === pruneTitle) || message.guild.channels.cache.find(channel => channel.name === pruneTitle)) && maxTimeSinceActive !== 0) {
    return message.channel.send('It looks like there was already a prune in process. You should finish that out or cancel it first using `.prune finish` or `.prune cancel`');
  }

  // Make sure there's data to even process
  if(!global.dataLog[message.guild.id].pruneData || global.dataLogLock == 1) {
    return message.channel.send('There\'s either no prune data right now, or the datalog is still caching');
  }

  // Get a current timestamp and user activity data
  const currentTime = moment();
  const pruneData = new Map(global.dataLog[message.guild.id].pruneData.sort((a, b) => a[1][0] - b[1][0]));

  // Create and format the workbook
  const xlsUsrList = new ExcelJS.Workbook;
  const listSheet = xlsUsrList.addWorksheet('User List');
  const colHeaders = ['Username', 'Display', 'Last Posted', 'Excluded'];
  const colData = [];
  colHeaders.forEach(hdr => {
    if (hdr == 'Last Posted') {
      colData.push({ header: hdr, key: hdr, width: 15, style: { numFmt: 'm/d/yyyy' } });
    }
    else {
      colData.push({ header: hdr, key: hdr, width: 25 });
    }
  });
  listSheet.columns = colData;

  // Loop through the prune data, generating the spreadsheet and prune array for later
  for (const usr of pruneData) {
    const memberObj = await message.guild.member(usr[0]);

    // Make sure we can even manage this user
    if ((!memberObj.manageable || (config.roleComrade && !memberObj.roles.cache.has(config.roleComrade))) && maxTimeSinceActive !== 0) {continue;}

    // Initialize the vars for the last post ID and whether this member is excluded
    const lastPost = usr[1][0];
    const memberExcluded = (usr[1].length === 2) ? 'Yes' : '';

    const usrObj = memberObj.user;

    // Set defaults and intialize
    let dateLastActive = 'N/A';
    let formattedDateLastActive;

    // If the user's last post date isn't "never", format in general and for the spreadsheet
    if (lastPost !== 0) {
      const lastPostUnixDate = Number((BigInt(lastPost) >> BigInt(22)) + discordEpoch);
      dateLastActive = moment(lastPostUnixDate);
      formattedDateLastActive = moment(lastPostUnixDate).toDate();
    }
    else {
      formattedDateLastActive = dateLastActive;
    }

    // If the last active date isn't n/a, check it against the inactivity limit set
    if (dateLastActive !== 'N/A') {
      const timeSinceLastActive = moment.duration(currentTime.diff(dateLastActive)).asMonths();
      if (timeSinceLastActive < maxTimeSinceActive) {break;}
    }

    // Only add them to the actual prune if they're not manually excluded. Otherwise, spreadsheet only
    if (usr[1].length !== 2) {
      usersToPrune.push((usr[0]));
    }

    // Add them to the spreadsheet regardless of if they're manually excluded
    listSheet.addRow({ Username: usrObj.tag, Display: memberObj.nickname, 'Last Posted': formattedDateLastActive, Excluded: memberExcluded });
  }

  // If nobody is in the list, there's nothing else to do
  if (usersToPrune.length === 0) {
    return message.channel.send(`It seems no members have been inactive for at least **${maxTimeSinceActive} month(s)**.`);
  }

  // Otherwise, continue and write out the spreadsheet
  await xlsUsrList.xlsx.writeFile('./usrs.xlsx');

  // Send the XLS out!
  // message.author.send({ files: ['./usrs.xlsx'] });
  message.channel.send({ files: ['./usrs.xlsx'] });

  // Let them look at the XLS, check if they want to proceed (if it's time specified is anything but '0' or 'all')
  if (maxTimeSinceActive !== 0) {
    // Use a different message if we're kicking immediately rather than using the limbo system
    if (kickNow === 1) {
      message.channel.send(`This will affect **${usersToPrune.length}** member(s) in this spreadsheet that haven't posted in at least **${maxTimeSinceActive} month(s)**. Are you sure you want to move ahead with kicking them?`);
    }
    else {
      message.channel.send(`This will affect **${usersToPrune.length}** member(s) in this spreadsheet that haven't posted in at least **${maxTimeSinceActive} month(s)**. Are you sure you want to move ahead with removing all their (non-pronoun) roles and put them in a pruning channel?`);
    }
    let reply = await msgCollector(message);
    if (!reply) { return; }
    if (reply.content.toLowerCase() !== 'y' && reply.content.toLowerCase() !== 'yes') {
      return message.channel.send('Prune canceled');
    }

    // If we're kicking immediately, then let's go straight there
    if (kickNow === 1) {
      for (const usr of usersToPrune) {
      // Get the user collection
        const thisUser = await message.guild.members.cache.get(usr);
        if (thisUser.manageable) {
          // Initialize a section of pruneStorage for this user
          pruneStorage[thisUser.id] = '';
        }
      }
      // Write out the file, give it a moment, and then kick the inactive members now
      writeData(pruneStoragePath, pruneStorage);
      setTimeout(function() {
        pruneFinish(message);
      }, 1000);
      return;
    }
  }
  else {
    return message.channel.send('Here\'s a full list of the last post dates of everyone in the server.');
  }

  // Create the to-prune temp role
  message.guild.roles.create({
    data: {
      name: pruneTitle,
      // No default permissions needed
      permissions: 0,
      // Mods can mention the user roles regardless, so this way users can't ping each other
      mentionable: false,
    },
    reason: 'User prune prep',
  })
    .then(async (pruneRole) => {
    // Create the to-prune temp channel
      await message.guild.channels.create(pruneTitle, {
        type: 'text',
        position: 0,
        reason: 'User prune prep',
        topic: pruneIntro,
        rateLimitPerUser: 15,
        permissionOverwrites: [
          {
            id: client.user.id,
            allow: ['VIEW_CHANNEL', 'SEND_MESSAGES', 'READ_MESSAGE_HISTORY', 'MANAGE_CHANNELS', 'MANAGE_MESSAGES', 'MENTION_EVERYONE'],
          },
          {
            id: pruneRole.id,
            allow: ['VIEW_CHANNEL', 'SEND_MESSAGES', 'READ_MESSAGE_HISTORY'],
          },
          {
            id: config.roleStaff,
            allow: ['VIEW_CHANNEL', 'SEND_MESSAGES', 'READ_MESSAGE_HISTORY', 'MANAGE_CHANNELS', 'MANAGE_MESSAGES', 'MENTION_EVERYONE'],
          },
        ],
      })
        .then(async (pruneChannel) => {
          // Assign the new role to each user
          for (const usr of usersToPrune) {
          // Get the user collection
            const thisUser = await message.guild.members.cache.get(usr);
            if (thisUser.manageable) {
              const thisUserPruneRoles = [pruneRole];
              // Initialize a section of pruneStorage for this user
              pruneStorage[thisUser.id] = new Array();
              // Store the user's roles in their pruneStorage array
              thisUser.roles.cache.forEach(role => {
                pruneStorage[thisUser.id].push(role.id);
                if (role.name.includes('/') || role.name.toLowerCase().includes('pronoun')) {
                  thisUserPruneRoles.push(role.id);
                }
              });

              // Refresh member cache
              await message.guild.members.fetch();

              // Set the user's roles
              await thisUser.roles.set(thisUserPruneRoles, 'User prune prep');
            }
          }
          // Send the intro message, pinging the prune role
          await pruneChannel.send(`${pruneRole}: ${pruneIntro}`);

          writeData(pruneStoragePath, pruneStorage);
          return message.channel.send(`Okay, ${usersToPrune.length} members have been prepared for pruning`);

        });
    })
    .catch (e => {
      console.log('Error:', e);
      pruneCleanup(message, pruneTitle);
      console.log(e);
      return message.channel.send('There was an error creating the prune channel, contact the bot owner.');
    });
  return;
}

async function pruneFinish(message) {
  // Set the name of the role/channel to be used for prunes
  const pruneTitle = config.pruneTitle ? config.pruneTitle : 'prune-limbo';

  const toPrune = Object.keys(requireUncached(pruneStoragePath));
  const PRUNE_USER_KICKMSG = 'Pruned for inactivity.';
  const PRUNE_USER_DMREASON = 'Pruned for inactivity. You can find another invite code at https://lefthome.info/';
  const canKick = await message.guild.me.hasPermission('KICK_MEMBERS');

  // Make sure we have the necessary permissions
  if (!canKick) {return message.channel.send('You\'ll need to give me kick permissions to proceed');}

  // Make sure there's anyone to prune
  if (toPrune.length === 0) {
    return message.channel.send('There doesn\'t appear to be an ongoing prune');
  }

  // Make sure they want to kick for sure!
  message.channel.send(`Are you 100% sure you want to kick **${toPrune.length} member(s) now**?`);
  let reply = await msgCollector(message);
  if (!reply) { return; }
  if (reply.content.toLowerCase() !== 'y' && reply.content.toLowerCase() !== 'yes') {
    return message.channel.send('Okay! No changes were made.');
  }

  // If we're here, we're pruning
  message.channel.send('Beginning prune! Another message will be sent when the prune is complete.');

  // Set up up one kick per 30 seconds to avoid angering the API
  let i = 0;
  const toKick = setInterval(async function() {

    // If we've reached finished out the final kick already, then clear the timer, clean up, and report in
    if (toPrune.length === 0) {
      clearInterval(toKick);
      pruneCleanup(message, pruneTitle);
      writeData(pruneStoragePath, '{}');
      return message.channel.send(`**${i} member(s)** successfully pruned`);
    }

    // Get the next userid in the array, plus the member and user objects
    const userid = toPrune.shift();
    const memberObj = message.guild.member(userid);
    const usrObj = memberObj.user;

    // Make sure we can actually kick the person! Just in case
    if (!memberObj.kickable) {return console.log(`Couldn't kick ${usrObj.username}#${usrObj.discriminator}`);}

    // Send a DM leting them know what we've done, thn wait one second and kick them
    usrObj.send(`You've been kicked from **${message.guild.name}** with reason:\n> ${PRUNE_USER_DMREASON}`);
    setTimeout(function() {
      memberObj.kick(PRUNE_USER_KICKMSG);
    }, 1000);

    // Increment the counter for the end-message
    i++;
  }, 30000);
}

async function pruneCleanup(message, pruneTitle) {

  // Identify the prune channel/role,
  const pruneRole = message.guild.roles.cache.find(role => role.name === pruneTitle);
  const pruneChannel = message.guild.channels.cache.find(role => role.name === pruneTitle);

  // and if they exist, delete them
  if (pruneRole) await pruneRole.delete('Post-prune cleanup');
  if (pruneChannel) await pruneChannel.delete('Post-prune cleanup');
}

module.exports = {
  name: 'prune',
  aliases: ['p'],
  description: 'Handles pruning inactive members of the server',
  usage: 'with no arguments will show the command options',
  cooldown: 0,
  guildOnly: true,
  staffOnly: true,
  args: false,
  async execute(message, args, client) {

    if(args.length === 0) {
      return message.channel.send(`Options:
.prune prep <months:default 6>
> - Posts  a spreadsheet of inactive members and offers to place them into a temp channel and role until the \`.prune finish\` command is run
> - usage: \`.prune prep 3\`
.prune kick <months:default 6>
> - Posts a spreadsheet of inactive members and offers to begin kicking them
> - usage: \`.prune kick 3\`
.prune list
> - Shows the last post date for all server members without beginning a prune
.prune exclude [add/remove] [@user/UserID]
> - usage: \`.prune exclude add ${message.author.id}\`
> - List all current exclusions with \`.prune exclude list\`
.prune restore <@users/UserIDs>
> - usage: \`.prune restore @user1 @user2 userid3\` restores user1, 2, and 3
.prune cancel
> - Offers to restore all users, canceling the prune
.prune finish
> - Offers to finish the prune, kicking all users still in limbo

Note: All commands and arguments can also be shortened to just the first letter (e.g. \`.p p 6\` or \`.p r USERID\`)`);
    }

    // Get the first arg, leaving the rest for whatever else we're going to do
    const firstArg = args.shift();
    switch (firstArg) {
    case 'r':
    case 'restore':
    case 'c':
    case 'cancel':
      pruneRestore(args, message);
      break;
    case 'p':
    case 'prep':
    case 's':
    case 'start':
    case 'b':
    case 'begin':
      prunePrep(args, message, client);
      break;
    case 'list':
    case 'l':
      prunePrep(['all'], message, client);
      break;
    case 'k':
    case 'kick':
      args.unshift('kick');
      prunePrep(args, message, client);
      break;
    case 'f':
    case 'finish':
      pruneFinish(message);
      break;
    case 'e':
    case 'exclude':
    case 'exclusion':
    case 'exclusions':
      pruneExclude(args, message);
      break;
    }
  },
};

/*
    // prune dry run we aren't going to use because discord's maxes out at 30 days
    const roleList = message.guild.roles.cache
            .map(r => r.id)
            .join(",");
    message.guild.members.prune({ dry: true, days: 100, roles: [roleList], reason: PRUNE_USER_KICKMSG })
    .then(pruned => console.log(`This will prune ${pruned} people!`))
    .catch(console.error);
    */