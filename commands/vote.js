const Discord = require('discord.js');
const moment = require('moment-timezone');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const voteDataPath = path.resolve('./votes.json');

async function writeVoteState() {
  return fsp.writeFile(
    voteDataPath,
    JSON.stringify(global.voteData, null, 2),
  );
}

const DEFAULT_VOTE_DATA = {
  votes: {},
};

if (global.voteData == null) {
  if (!fs.existsSync(voteDataPath)) {
    fs.writeFileSync(voteDataPath, JSON.stringify(DEFAULT_VOTE_DATA));
  }
  global.voteData = require(voteDataPath);
}

class VoteManager {
  /**
   * Create a new voteManager instance.
   *
   * @param client Discord client instance
   */
  constructor(client) {
    this.client = client;
    this.timer = null;
    this.ongoingVotes = {};
  }

  /**
   * Load the state of the voteManager from the global JSON data.
   */
  async loadState() {
    if (global.voteData.votes) {
      // Convert saved date strings back into Moment datetime objects
      // and saved vote lists from an array of pairs back to an ES6 map.
      Object.entries(global.voteData.votes).forEach(([guild, votes]) => {
        this.ongoingVotes[guild] = votes.map((vote) => ({
          ...vote,
          due: moment.utc(vote.due, moment.ISO_8601, true),
          votes: new Map(vote.votes),
        }));
      });
    }
  }

  /**
   * Save the state of the voteManager to the global JSON data.
   *
   * @returns {Promise<*>} Resolves when the data file has been written out.
   */
  async saveState() {
    // Serialize moment datetimes as ISO8601 strings
    // convert votes map to json with spread
    Object.entries(this.ongoingVotes).forEach(([guild, votes]) => {
      if (votes.length !== undefined) {
        global.voteData.votes[guild] = votes.map((vote) => ({
          ...vote,
          due: vote.due.toISOString(),
          votes: [...vote.votes || ''],
        }));
      }
    });

    return writeVoteState();
  }

  /**
   * Start running the timer for recurring voteManager tasks.
   */
  start() {
    // Tick immediately at start to do cleanup
    this.tick().then(() => {
      // Ensure we're always at (or close to) the 'top' of a minute when we run our tick
      const topOfMinute = 60000 - (Date.now() % 60000);
      this.timer = this.client.setTimeout(() => {
        this.timer = this.client.setInterval(() => this.tick(), 60000);
        this.tick();
      }, topOfMinute);
    });
  }

  /**
   * Perform a single run of the checks for pending scheduled tasks.
   *
   * @returns {Promise<void>} Resolves when the work for this tick is finished.
   */
  async tick() {
    const now = moment.utc();
    const votesByGuild = Object.entries(this.ongoingVotes);

    for (const [guild, votes] of votesByGuild) {
      const endingVotes = votes.filter((vote) => vote.due.isSameOrBefore(now));
      this.ongoingVotes[guild] = votes.filter((vote) =>
        vote.due.isAfter(now),
      );
      await this.saveState();

      if (endingVotes.length > 0) {
        for (const vote of endingVotes) {
          /* const voteAge = moment.duration(now.diff(vote.due));
          // Discard votes we missed for more than 5 minutes
          if (voteAge.asMinutes() >= 5) {
            break;
          } */
          const destChannel = await this.client.channels.fetch(vote.channel);
          if (!destChannel) {
            console.log('Got vote for unknown channel', vote.channel);
            break;
          }
          console.log(vote);
          const totals = this.getResults(vote);
          let resultString = '';
          totals.forEach((v, k) => resultString += `${k} : ${v}\n`);
          // send vote results to channel
          await destChannel.send(`In the matter of '${vote.summary}', the vote results are: \n ${resultString}`);
        }
      }
    }
    await this.saveState();

  }

  /**
   * Stop running the voteManager timer.
   */
  stop() {
    this.client.clearTimeout(this.timer);
    this.client.clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * Add a new vote to the voteManager.
   *
   * @param vote The data for the vote.
   * @returns {Promise<*>} Resolves once the vote has been saved persistently.
   */
  async add(vote) {
    const guild = vote.guild;
    if (!this.ongoingVotes[guild]) {
      this.ongoingVotes[guild] = [];
    }
    this.ongoingVotes[guild].push(vote);
    this.ongoingVotes[guild].sort((a, b) => a.due.diff(b.due));
    return this.saveState();
  }

  /**
   * Update votes on an object
   *
   * @param guildID Snowflake of the Guild to scope votes to.
   * @param userID Snowflake of the User whose vote will be tallied.
   * @param msgID MessageID of the vote to be updated.
   * @param emoji Emoji of the vote to be tallied; note that 🚫 will always be added to votes; this allows users to remove accidental votes.
   * @returns {boolean} Whether the user was tallied to the vote (false if already voted for the same emoji).
   */
  async updateVotes(guildID, userID, msgID, emoji) {
    const user = await this.client.users.fetch(userID);
    const vote = this.getByMsg(guildID, msgID);
    if (!vote) {
      return false;
    }
    if (emoji == '🚫' && vote.votes.has(userID)) {
      vote.votes.delete(userID);
      user.send('Your vote was removed from the following vote: \'' + vote.summary + '\'');
    }
    else if (emoji == '🚫' && !vote.votes.has(userID)) {
      user.send('You have no vote on record for \'' + vote.summary + '\'. No action was taken.');
    }
    else if (vote.emoji.includes(emoji)) {
      const DMreply = vote.votes.has(userID) ? `Your vote was changed to ${emoji}` : `You successfully voted ${emoji}`;
      vote.votes.set(userID, emoji);
      try {
        await user.send(DMreply + ` for '${vote.summary}'.`);
      }
      catch {
        console.log('Could not send a DM for vote reciept.');
      }
    }

    return true;
  }

  _indexByMsg(guildID, msgID) {
    if (!this.ongoingVotes[guildID]) {
      return undefined;
    }
    const index = this.ongoingVotes[guildID].findIndex(
      (vote) => vote.message == msgID,
    );
    return index !== -1 ? index : undefined;
  }

  /**
 * Get the vote with this messageID on a specific guild.
 *
 * @param guildId The Snowflake corresponding to the vote's guild
 * @param msgID The snowflake of the vote message
 * @returns Vote data or undefined
 */
  getByMsg(guildID, msgID) {
    const index = this._indexByMsg(guildID, msgID);
    return index !== undefined ? this.ongoingVotes[guildID][index] : index;
  }

  /**
 * Collate results of vote.
 *
 * @param vote The voteData object for a particular vote
 * @returns ES6 map of totals for each vote option.
 */
  getResults(vote) {
    const voteCounts = new Map();
    if (vote.votes && vote.votes.size > 0) {
      for (const voteEntry of vote.votes.values()) {
        if (!voteCounts.has(voteEntry)) {
          voteCounts.set(voteEntry, 1);
        }
        else if (voteCounts.has(voteEntry)) {
          voteCounts.set(voteEntry, voteCounts.get(voteEntry) + 1);
        }
      }
    }
    // filter out the abstain emoji since we simply do not count those.
    const filteredEmoji = vote.emoji.filter(e => {return e !== '🚫';});
    filteredEmoji.forEach(voteEmoji => { voteCounts.has(voteEmoji) ? true : voteCounts.set(voteEmoji, 0);});
    return voteCounts;
  }

}

let voteManager;

function getActiveVoteMessages(guildID) {
  // search through vote.json and find the message ID on each active vote.
  // then return a list of all messages as an arr.
  const messageArr = [];
  global.voteData.votes[guildID].forEach(vote => {
    messageArr.push(vote.message);
  });
  return messageArr;
}

module.exports = {
  name: 'vote',
  description: 'generates a message that can be voted on.',
  usage: '',
  cooldown: 3,
  guildOnly: true,
  staffOnly: true,
  args: false,
  async execute(message, args) {
    const voteData = JSON.parse(args.join(' '));
    const durationData = voteData.duration.split(', ');
    voteData.due = moment().add(durationData[0], durationData[1]);
    delete voteData.duration;
    voteData.channel = message.channel.id;
    voteData.creator = message.author.id;
    voteData.guild = message.guild.id;
    // create a vote embed and send to the channel.
    const voteMsg = await message.channel.send(`Please vote with the reaction buttons on the following: \n ${voteData.summary} \n If you would like to remove a vote you already made, please use the 🚫 react.`);
    voteData.message = voteMsg.id;
    voteData.emoji.push('🚫');
    voteData.emoji.forEach(async e => await voteMsg.react(e));
    voteData.votes = new Map();
    voteManager.add(voteData);
  },
  init(client) {
    const onReady = () => {
      voteManager = new VoteManager(client);
      voteManager.loadState().then(() => {
        voteManager.start();
        console.log('Vote manager ready.');
      });
    };
    if (client.status !== Discord.Constants.Status.READY) {
      client.on('ready', onReady);
    }
    else {
      onReady();
    }
    client.on('raw', async (packet) => {
      // return if the event isn't a reaction add, or if it was a bot reaction.
      if (packet.t !== 'MESSAGE_REACTION_ADD' || packet.d.user_id == client.user.id) {
        return;
      }
      // then check if the message in question is one of the vote-related messages.
      else if (!getActiveVoteMessages(packet.d.guild_id).includes(packet.d.message_id)) {
        return;
      }
      const { d: data } = packet;
      const user = client.users.cache.get(data.user_id);
      const channel = client.channels.cache.get(data.channel_id) || await user.createDM();
      const message = await channel.messages.fetch(data.message_id);
      data.emoji.id ? message.reactions.resolve(data.emoji.id).users.remove(data.user_id) : message.reactions.resolve(data.emoji.name).users.remove(data.user_id);
      voteManager.updateVotes(message.guild.id, data.user_id, message.id, data.emoji.name);
    });
  },
};