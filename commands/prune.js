const fs = require('fs');
const path = require('path');
const moment = require('moment-timezone');
const ExcelJS = require('exceljs');
const configPath = path.resolve('./config.json');
const config = require(configPath);
const pruneStoragePath = path.resolve('./prunestorage.json');

fs.existsSync(pruneStoragePath, (err) => {
  if (err) {
    return message.channel.send('There are no users pending prune to restore the roles for!');
  }
});

// function to create a message collector.
async function msgCollector(message) {
// let responses = 0;
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

  // Set the name of the role/channel to be used for prunes
  const pruneTitle = 'prune-limbo';

  // Get users' temporarily stored roles
  const pruneStorage = requireUncached(pruneStoragePath);
  if (Object.keys(pruneStorage).length === 0) {
    pruneCleanup(message, pruneTitle);
    return message.channel.send(`There doesn't appear to be an ongoing prune. Any necessary clean-up is completed`);
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
    else if (reply.content.toLowerCase() == 'y' || reply.content.toLowerCase() == 'yes') {
      args = Object.keys(pruneStorage);
    }
  }

  
  let erroredMembers = 0;
  let restoredMembers = new Array();
  for(arg of args) {
    const member = await getUser(arg, message);
    if (member === null || !member.manageable || !pruneStorage[member.user.id]) { 
      erroredMembers += 1;
      continue;
    }
    
    // const usrObj = memberObj.user;
    
    // restore roles for now, delete channel, etc
    await member.roles.set(pruneStorage[member.user.id], 'Restoring user roles');
    delete pruneStorage[member.user.id];
  
    writeData(pruneStoragePath, pruneStorage);
    restoredMembers.push(`<@${member.user.id}>`);
  }
  
  if (Object.keys(pruneStorage).length === 0) {
    pruneCleanup(message, pruneTitle);
  }
  
  let resultMsg = '';
  if (restoredMembers.length > 0) {
    resultMsg += `Restored roles for: ${restoredMembers.join(', ')}`;
  }
  if (erroredMembers > 0) {
    resultMsg += `\n**${erroredMembers}** member(s) were entered in error and not restored`;
  }
  return message.channel.send(resultMsg);
}

async function prunePrep(args, message, client) {
  let maxTimeSinceActive = 0;
  const usersToPrune = new Array();

  // Pull the args so we know what we're working with
  const firstArg = args.shift();
  maxTimeSinceActive = (parseInt(firstArg) ? parseInt(firstArg) : 6);

  // Set the name of the role/channel to be used for prunes. Probably will go in a config soon?
  const pruneTitle = 'prune-limbo';
  // Sets the intro message and description for the prune channel
  const pruneIntro = `If you're in this channel, you've been inactive in the server for at least ${maxTimeSinceActive} months! Rather than kick you outright, we want to give people a chance to potentially rejoin the community`;
  const discordEpoch = BigInt(1420070400000);

  // Initialize the pruneStorage map. No need to import an "old one"- we'll be starting anew either way? maybe i'll change my mind and check for the file instead
  const pruneStorage = new Map();

  // Only proceed if there isn't a prune in process
  // Todo? Potentially offer an option to let them clear out an old one instead of just saying "No"

  if (message.guild.roles.cache.find(role => role.name === pruneTitle) || message.guild.channels.cache.find(channel => channel.name === pruneTitle)) {
    //message.guild.roles.cache.find(role => role.name === pruneTitle).delete('Post-prune cleanup');
    //message.guild.channels.cache.find(channel => channel.name === pruneTitle).delete();
    return message.channel.send('It looks like there was already a prune in process. You should finish that out first using `.prunekick confirm` or `.prunekick abandon`');
  }


  // Make sure there's data to even process
  if(!global.dataLog[message.guild.id].pruneData || global.dataLogLock == 1) {
    return message.channel.send('There\'s either no prune data right now, or the datalog is still caching');
  }


  const currentTime = moment();
  const pruneData = new Map(global.dataLog[message.guild.id].pruneData.sort((a, b) => a[1] - b[1]).filter(userid => !args.includes(userid[0])));
  const xlsUsrList = new ExcelJS.Workbook;
  const listSheet = xlsUsrList.addWorksheet('User List');
  const colHeaders = ['Username', 'Display', 'Last Posted'];
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
    if (!memberObj.manageable) {continue;}

    const usrObj = memberObj.user;
    let dateLastActive = 'N/A';
    let formattedDateLastActive;
    if (usr[1] != 0) {
      const lastPostUnixDate = Number((BigInt(usr[1]) >> BigInt(22)) + discordEpoch);
      dateLastActive = moment(lastPostUnixDate);
      formattedDateLastActive = moment(lastPostUnixDate).toDate();
    }
    else {
      formattedDateLastActive = dateLastActive;
    }
    if (dateLastActive !== 'N/A') {
      const timeSinceLastActive = moment.duration(currentTime.diff(dateLastActive)).asMonths();
      if (timeSinceLastActive < maxTimeSinceActive) {break;}
    }
    // Add each user to the spreadsheet
    listSheet.addRow({ Username: usrObj.tag, Display: memberObj.nickname, 'Last Posted': formattedDateLastActive });
    // Add each userID to an array in case we go ahead with the prune
    usersToPrune.push((usr[0]));
  }
  await xlsUsrList.xlsx.writeFile('./usrs.xlsx');

  // Send the XLS out!
  message.author.send({ files: ['./usrs.xlsx'] });
  // message.channel.send({ files: ['./usrs.xlsx'] });

  // Ask if the user wants to proceed, having had a chance to look at the XLS
  message.channel.send('This will affect the **' + usersToPrune.length + '** people in the spreadsheet above. Are you sure you want to move ahead with removing all their roles (excluding pronoun roles) and put them in a pruning channel?');
  let reply = await msgCollector(message);
  if (!reply) { return; }
  if (reply.content.toLowerCase() !== 'y' && reply.content.toLowerCase() !== 'yes') {
    return message.channel.send('Prune canceled');
  }

  /* todo next:
  - check for bot permissions (adding roles, channels, https://discordjs.guide/popular-topics/permissions.html#roles-as-bot-permissions, https://discord.js.org/#/docs/main/stable/class/Permissions?scrollTo=s-FLAGS)
  */

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
            allow: ['VIEW_CHANNEL', 'SEND_MESSAGES', 'EMBED_LINKS', 'USE_EXTERNAL_EMOJIS', 'ADD_REACTIONS', 'MENTION_EVERYONE', 'MANAGE_CHANNELS', 'MANAGE_MESSAGES'],
          },
          {
            id: pruneRole.id,
            allow: ['VIEW_CHANNEL', 'SEND_MESSAGES', 'EMBED_LINKS', 'USE_EXTERNAL_EMOJIS'],
          },
          {
            id: config.roleStaff,
            allow: ['VIEW_CHANNEL', 'SEND_MESSAGES', 'EMBED_LINKS', 'USE_EXTERNAL_EMOJIS', 'ADD_REACTIONS', 'MENTION_EVERYONE'],
          },
        ],
      })
        .then(async (pruneChannel) => {
        // Set slow mode so they can't spam
          await pruneChannel.send(`@rolepinglater: ${pruneIntro}`);
          // Assign the new role to each user
          for (const usr of usersToPrune) {
          // Get the user collection
            const thisUser = await message.guild.members.cache.get(usr);
            if (thisUser.manageable) {
              let thisUserPruneRoles = [pruneRole];
              // Initialize a section of pruneStorage for this user
              pruneStorage[thisUser.id] = new Array();
              // Store the user's roles in their pruneStorage array
              thisUser.roles.cache.forEach(role => {
                pruneStorage[thisUser.id].push(role.id);
                if (role.name.includes('/') || role.name.toLowerCase().includes('pronoun')) {
                  thisUserPruneRoles.push(role.id);
                }
              });

              const fullMemberList = await message.guild.members.fetch();

              await thisUser.roles.set(thisUserPruneRoles, 'User prune prep');
              // restore roles for now, delete channel, etc
                //await thisUser.roles.set(pruneStorage[thisUser.id], 'Restoring user roles');
            }
          }
          writeData(pruneStoragePath, pruneStorage);
          return message.channel.send(`Okay, ${usersToPrune.length} members have been prepared for pruning`);

        });
    })
    .catch (e => {
      console.log('Error:', e);
      return message.channel.send('There was an error creating the prune channel, contact the bot owner.');
    });
  return;
}

async function pruneFinish(args, message) {
    // Set the name of the role/channel to be used for prunes
    const pruneTitle = 'prune-limbo';

    const toPrune = Object.keys(requireUncached(pruneStoragePath));
    const PRUNE_USER_KICKMSG = `Pruned for inactivity.`;
    const PRUNE_USER_DMREASON = `Pruned for inactivity. You can find another invite code at https://lefthome.info/`;
    const canKick = await message.guild.me.hasPermission('KICK_MEMBERS');
    
    // Make sure we have the necessary permissions
    if (!canKick) {return message.channel.send(`You'll need to give me kick permissions to proceed`);}

    // Make sure there's anyone to prune
    if (toPrune.length === 0) {
      return message.channel.send(`There doesn't appear to be an ongoing prune`);
    }

    // Make sure they want to kick for sure!
    message.channel.send(`Are you 100% sure you want to kick **${toPrune.length} member(s)** with the **${pruneTitle}** role and clean up?`);
    let reply = await msgCollector(message);
    if (!reply) { return; }
    if (reply.content.toLowerCase() !== 'y' && reply.content.toLowerCase() !== 'yes') {
      return message.channel.send('Okay! No changes were made.');
    }

    // If we're here, we're pruning
    message.channel.send('Beginning prune! Another message will be sent when the prune is complete.');

    // Set up up one kick per 30 seconds to avoid angering the API
    let i = 0;
    let toKick = setInterval(async function() {
      
      // If we've reached finished out the final kick already, then clear the timer, clean up, and report in
      if (toPrune.length === 0) {
        clearInterval(toKick);
        pruneCleanup(message, pruneTitle)
        writeData(pruneStoragePath, "{}");
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
  description: 'Handles pruning inactive memberes of the server',
  usage: '',
  cooldown: 0,
  guildOnly: true,
  staffOnly: true,
  args: false,
  async execute(message, args, client) {

    if(args.length === 0) {
      return message.channel.send(`command: .prune (alias: .p)

Options:
.prune prep <months:default 6> <userids to exclude, separated by spaces>
> - alias: "p"
> - usage: \`.prune prep 6 ${message.author.id}\`
.prune restore <@userOrUserIDs, separated by spaces>
> - alias: "r"
> - usage: \`.prune restore @user1 @user2 userid3\` restores user1, 2, and 3
> - usage: \`.prune restore\` offers to restore all users
.prune finish
> - alias: "f"
> - usage: \`.prune finish\``
      );
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
      case 'k':
      case 'kick':
      case 'f':
      case 'finish':
        pruneFinish(args, message);
        break;
    }

  },
};

/* 
    // prune dry run we aren't going to use
    const roleList = message.guild.roles.cache
            .map(r => r.id)
            .join(",");
    message.guild.members.prune({ dry: true, days: 100, roles: [roleList], reason: PRUNE_USER_KICKMSG })
    .then(pruned => console.log(`This will prune ${pruned} people!`))
    .catch(console.error);
    */ 