// This file houses all the modules for playing audio through voice chat.
// Primarily it will play youtube audio, but with a little work it can be
// extended to other sources
// NOTE: currently commented out. TODO: convert for discord.js 13 - will need full rewrite.
/* const Discord = require('discord.js');
const YouTube = require('simple-youtube-api');
const ytdl = require('ytdl-core-discord');
const path = require('path');
const configPath = path.resolve('./config.json');
const config = require(configPath);
const wait = require('util').promisify(setTimeout);
const { getPermLevel } = require('../extras/common.js');
const { joinVoiceChannel } = require('@discordjs/voice'); */

// Extend guild with music details accessed by the .yt command.
// TODO: Structures removed :(
/* Discord.Structures.extend('Guild', Guild => {
  class MusicGuild extends Guild {
    constructor(client, data) {
      super(client, data);
      this.musicData = {
        queue: [],
        isPlaying: false,
        volume: 0.2,
        songDispatcher: null,
        voiceChannel: null,
        voiceTextChannel: null,
        nowPlaying: null,
      };
    }
  }
  return MusicGuild;
}); */

/* let YT;
if (!config.youTubeAPIKey) {
  console.log('No youtube API Key set! until it is set by editing config.json, the YT voice features will not work.');
}
else { YT = new YouTube(config.youTubeAPIKey); } */

/* module.exports = {
  name: 'yt',
  description: 'Play any song or playlist from youtube in the voice channel you\'re currently in.',
  aliases: ['play'],
  usage: `video URL, or one of the following options: [play] [pause] [skip] [list [remove] [clear]].
**${config.prefix}yt (video URL)** adds the video to the end of the current playlist.
**${config.prefix}yt play** and **${config.prefix}yt pause** will unpause and pause playback, respectively. While paused the bot will wait 5 minutes before clearing the queue and leaving voice.
**${config.prefix}yt skip** will skip the current video.
**${config.prefix}yt list** by itself will list the current playlist.
**${config.prefix}yt list remove #** will remove the video at the numbered location in the playlist.
**${config.prefix}yt list clear** will clear the current playlist completely, but finish playback of the current song.
**${config.prefix}yt stop** will stop playback and clear the current playlist completely.

**${config.prefix}yt timeout #** is a staff only command to lock the ${config.prefix}yt command for # of minutes, server wide.
**${config.prefix}yt timeout stop** or 0 will both allow staff to unlock the ${config.prefix}yt command.

Volume can be set with the **${config.prefix}volume #** command, where # is a number between 1 and 100.  The default is 20.

__Notes on use:__
If the bot is not currently playing in a different voice channel, adding a video to the playlist will automatically summon the bot to the voice channel you are in.
Since the bot can only play in one channel at a time, you must **${config.prefix}yt stop** before you can summon the bot to your channel. *Abuse of the ${config.prefix}yt stop command is expressly forbidden.*
The bot will not allow users who aren't in the same voice channel to edit the playlist.
**${config.prefix}yt stop** can also be used to reset playback entirely if the playback bot is stuck, even if it's not in a channel.
If the bot is the only user in a voice channel when it finishes playback of the current song, it will automatically leave. Otherwise, if the playlist is empty, it will wait 1 minute before leaving.`,
  guildOnly: true,
  cooldown: 0.1,
  async execute(message, args, client) {
    let musicSettings = client.musicData.get(message.guild.id);
    const permLevel = getPermLevel(message);
    if (!YT) { return message.channel.send('I can\'t perform that function until a Youtube API Key is set in the config file.'); }

    function minsAndSeconds(ms) {
      const minutes = Math.floor(ms / 60000);
      const seconds = ((ms % 60000) / 1000).toFixed(0);
      return minutes + ':' + (seconds < 10 ? '0' : '') + seconds;
    }
    function resizeIfNeeded(voiceChannel, direction) {
      if (voiceChannel.userLimit === 0) { return; }
      const myPermissions = message.guild.me.permissionsIn(voiceChannel);
      if (!myPermissions.has(['MANAGE_CHANNELS'])) {
        if (direction === 'decrement') {
          console.log('Wasn\'t able to adjust user-limited channel size when leaving one we already incremented?');
        }
        return 0;
      }
      else {
        if (direction === 'increment') {
          voiceChannel.setUserLimit(voiceChannel.userLimit + 1);
        }
        if (direction === 'decrement') {
          voiceChannel.setUserLimit(voiceChannel.userLimit - 1);
        }
      }
    }
    // timeout checking
    let waitTime;
    const now = Date.now();
    if (args.length < 1) {
      return message.channel.send('You didn\'t provide any arguments!');
    }

    if (args[0].toLowerCase() == 'timeout' && permLevel == 'staff') {
      if (args[1] == 0) {
        args[1] = 'stop';
      }
      if ((!args[1] || !parseInt(args[1]) || args[1] < 0) && args[1] != 'stop') {
        return message.channel.send('Please include a time out duration in minutes to lock out the .yt command');
      }
      if (parseInt(args[1]) > 0) {
        waitTime = parseInt(args[1]) * 60000;
        message.channel.send(`Locking out ${config.prefix}yt commands for ${minsAndSeconds(waitTime)}. Use ${config.prefix}yt timeout stop or ${config.prefix}yt timeout 0 will clear the time out early.`);
        musicSettings.timeOutExp = now + waitTime;
        setTimeout(() => {
          if (musicSettings.timeOutExp != 0) {
            musicSettings.timeOutExp = 0;
            message.channel.send(`${config.prefix}yt command unlocked.`);
          }
        }, waitTime);
        musicSettings.volume = 0.2;
        musicSettings.songDispatcher = null;
        musicSettings.nowPlaying = null;
        musicSettings.isPlaying = false;
        if (musicSettings.voiceChannel) {
          musicSettings.voiceChannel.leave();
          resizeIfNeeded(musicSettings.voiceChannel, 'decrement');
          return;
        }
        return;
      }
      if (args[1].toLowerCase() == 'stop' || parseInt(args[1]) == 0) {
        musicSettings.timeOutExp = 0;
        return message.channel.send(`${config.prefix}yt command unlocked.`);
      }
    }

    if (musicSettings.timeOutExp > now && args[0].toLowerCase() != 'timeout' && permLevel != 'staff') {
      const timeLeft = (musicSettings.timeOutExp - now);
      return message.channel.send(`Sorry, the ${config.prefix}yt command is locked out for ${minsAndSeconds(timeLeft)} more minutes.`);
    }

    function formatDuration(APIDuration) {
      const duration = `${APIDuration.hours ? APIDuration.hours + ':' : ''}${
        APIDuration.minutes ? APIDuration.minutes : '00'
      }:${
        APIDuration.seconds < 10
          ? '0' + APIDuration.seconds
          : APIDuration.seconds
            ? APIDuration.seconds
            : '00'
      }`;
      return duration;
    }

    // Commands that can be permissibly used by a user that is in a different voice channel.
    const safeCommands = ['stop', 'list'];

    if (!config.voiceTextChannelIds.includes(message.channel.id) && permLevel != 'staff') {
      return message.channel.send('Please use this command only in the #voice-chat channels.');
    }
    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel && args[0] != 'list') return message.channel.send('Please join a voice channel and try again!');
    const mypermissions = message.guild.me.permissionsIn(voiceChannel);
    // console.log(mypermissions.toArray());
    if (!mypermissions.has(['VIEW_CHANNEL', 'CONNECT', 'SPEAK'])) {
      return message.channel.send(`Sorry, I don't have permissions to join ${voiceChannel}.`);
    }
    // else if (voiceChannel.full) {
    //  return message.channel.send(`Sorry, ${voiceChannel} is full!`);
    //}

    else if (!voiceChannel.joinable) {
      try { voiceChannel.join(); }
      catch(err) { console.log(`Unable to join voice channel ID ${voiceChannel.id} due to following error: ${err}`); }
      return message.channel.send(`I couldn't join ${voiceChannel}, but I'm not sure why. Please see log for details.`);
    }
    if ((musicSettings.isPlaying == true && voiceChannel != musicSettings.voiceChannel) && permLevel != 'staff') {
      if (!safeCommands.includes(args[0])) {
        return message.channel.send(`Sorry, I'm already playing in another voice channel! I can only be in one voice channel at a time. The **${config.prefix}yt stop** command will forcibly end playback, but please be conscientious of other users!`);
      }
    }

    async function playSong(queue) {
      joinVoiceChannel();
      await musicSettings.voiceChannel.join().then(async connection => {
        try {
          const dispatcher = connection
            .play(
              await ytdl(queue[0].url, {
                // pass the url to .ytdl()
                quality: 'highestaudio',
                // buffer 32MB prior to playing.
                highWaterMark: 1024 * 1024 * 32,
              }),
              { volume: musicSettings.volume, type: 'opus' },
            )
            .on('start', () => {
              dispatcher.setBitrate(96);
              musicSettings.songDispatcher = dispatcher;
              musicSettings.songDispatcher.pausedTime = null;
              // dispatcher.setVolume(musicSettings.volume);
              // ugly spacer line in the .setDescription in order to account for a known discord issue where mobile clients see embeds as long and 0-width
              const videoEmbed = new Discord.MessageEmbed()
                .setThumbnail(queue[0].thumbnail)
                .setColor('#e9f931')
                .setTitle('Youtube Playback')
                .setDescription('\u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B ')
                .addField('Now Playing:', queue[0].title)
                .addField('Duration:', queue[0].duration)
                .addField('Added by:', queue[0].addedBy)
                .addField('Link:', queue[0].url);
                // also display next song title, if there is one in queue
              if (queue[1]) videoEmbed.addField('Next Song:', queue[1].title);
              musicSettings.voiceTextChannel.send({ embeds: [videoEmbed] });
              // dequeue the song.
              return musicSettings.nowPlaying = queue.shift();
            })
            .on('finish', async () => {
              // if there are more songs in queue, and the voice channel has at least one user other than the bot, continueplaying
              const VCUsersNotMe = [];
              musicSettings.voiceChannel.members.forEach((value, key) => {
                if (key != client.user.id) {
                  VCUsersNotMe.push(key);
                }
              });
              if (queue.length >= 1 && VCUsersNotMe.length > 0) {
                return await playSong(queue);
              }
              // else if there are no more songs in queue, leave the voice channel after 60 seconds.
              else {
                musicSettings.songDispatcher = null;
                musicSettings.nowPlaying = null;
                musicSettings.isPlaying = false;
                if (VCUsersNotMe.length == 0) {
                  musicSettings.volume = 0.2;
                  musicSettings.voiceTextChannel.send('Seems like nobody is listening. Goodbye!');
                  musicSettings.voiceChannel.leave();
                }
                await wait(60000);
                if (!musicSettings.isPlaying) {
                  musicSettings.volume = 0.2;
                  musicSettings.voiceChannel.leave();
                  resizeIfNeeded(musicSettings.voiceChannel, 'decrement');
                  return;
                }
              }
            })
            .on('error', async e => {
              musicSettings.voiceTextChannel.send('Error playing a song. See console log for details. Skipping to next song...');
              console.error('Youtube playback error! Error Details: ', e);
              if (musicSettings.nowPlaying) console.error('Song playing at time of error: ', musicSettings.nowPlaying);
              if (queue[0]) console.error('Video at top of queue: ', queue[0]);
              if (queue.length > 0) {
                return await playSong(queue);
              }
              else {
                musicSettings.isPlaying = false;
                musicSettings.volume = 0.2;
                musicSettings.songDispatcher = null;
                musicSettings.nowPlaying = null;
                return musicSettings.voiceChannel.leave();
              }
            });
        }
        catch(err) {
          musicSettings.voiceTextChannel.send('Whoops, there was an error in playback. Check console log for details.  Resetting youtube queue.');
          console.log('Video playback error!', err);
          musicSettings.volume = 0.2;
          musicSettings.songDispatcher = null;
          musicSettings.nowPlaying = null;
          musicSettings.isPlaying = false;
          musicSettings.voiceChannel.leave();
          resizeIfNeeded(musicSettings.voiceChannel, 'decrement');
          return;
        }
      });
    }

    const query = args.join(' ');
    // playlist ID will match isPlaylist[1]
    const isPlaylist = new RegExp(/(?:http(?:s)?:\/\/)?(?:(?:w){3}.)?youtu(?:be|.be)?(?:\.com)?\/(?:playlist\?).*\blist=([\w-]+)(?:&.*)?/);
    // video ID will match isVideo[1] and playlistID will match isVideo[2]
    const isVideo = new RegExp(/(?:http(?:s)?:\/\/)?(?:(?:w){3}.)?youtu(?:be|.be)?(?:\.com)?\/(?:(?!playlist\?)(?:watch\?v=)?([\w-]+)(?:(?:#.+?)?|(?:&.+?)?)(?:&list=([\w-]+)(?:(?:#.+)?|(?:&.+)?))?)/);
    if (query.match(isPlaylist) && args.length == 1) {
      // const playlist = await YT.getPlaylistByID(query.match(isPlaylist)[1]);
      return message.channel.send('Sorry, that\'s a link to a playlist.  I can only add videos one at a time.');
      // message.channel.send(`Playlist title: ${playlist.title}`);
    }
    if (query.match(isVideo) && args.length == 1) {
      // Setting up song info object.
      // First, get the video data and insert it into a new song object
      let video;
      try { video = await YT.getVideoByID(query.match(isVideo)[1]); }
      catch { return message.channel.send('I couldn\'t find a video at that URL. Perhaps there is a typo, or the video is private or deleted.'); }
      if (!video.id) {
        console.log('Error parsing video. Video object:\n', video);
        return message.channel.send('Something went wrong retrieving that video, but if you try again it may work. See console log for details.');
      }
      const url = `https://www.youtube.com/watch?v=${video.id}`;
      const title = video.title;
      const addedBy = message.member.nickname ? message.member.nickname : message.author.username;
      let duration = formatDuration(video.duration);
      const thumbnail = video.thumbnails.high.url;
      if (duration == '00:00') duration = 'Live Stream';
      const song = {
        url,
        title,
        duration,
        thumbnail,
        addedBy,
      };
      // push the song into the queue.
      musicSettings.queue.push(song);
      // delete the original message to save space.
      message.delete();
      // not using YT playlists so this is debug stuff for now.
      // let playlist = null;
      // if (query.match(isVideo)[2]) { playlist = await YT.getPlaylistByID(query.match(isVideo)[2]); }
      // message.channel.send(`Video title: ${video.title} ${playlist ? `\n Playlist title: ${playlist.title}` : ''}`);

      // if nothing is playing yet
      if (!musicSettings.isPlaying) {
        musicSettings.volume = 0.2;
        // If the bot is being called to a user-capped voice channel, try to increment it.
        // Returning false means "it's limited but I can't increment the users"
        if (resizeIfNeeded(voiceChannel, 'increment') === 0) {
          return message.channel.send('Sorry, I don\'t have the permissions I need to join user-limited channels');
        }
        // edge case if staff initiated video play from outside of the #voice-chat channels, bot will default to the first voice chat channel.
        if (!config.voiceTextChannelIds.includes(message.channel.id)) {
          musicSettings.voiceTextChannel = await client.channels.fetch(config.voiceTextChannelIds[0]);
        }
        else { musicSettings.voiceTextChannel = message.channel; }
        musicSettings.voiceChannel = voiceChannel;
        musicSettings.isPlaying = true;
        return await playSong(musicSettings.queue);
      }
      // if something is already playing
      else if (musicSettings.isPlaying == true) {
        return message.channel.send(`${addedBy} added :musical_note: ${song.title} :musical_note: to the queue!`);
      }
    }
    if ((query.match(isPlaylist) || query.match(isPlaylist)) && args.length > 1) { return message.channel.send(`Too many arguments! Please try **${config.prefix}help yt** for help.`); }
    if (args[0].toLowerCase() == 'list' && !args[1]) {
      if (!musicSettings.isPlaying) { return message.channel.send('Nothing is currently playing!'); }
      const titleArray = [];
      musicSettings.queue.map(obj => {
        titleArray.push(obj.title);
      });
      const queueEmbed = new Discord.MessageEmbed()
        .setColor('#ff7373')
        .setTitle('Youtube Playlist')
        .setDescription('\u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B \u200B ')
        .addField('Now Playing', `${ musicSettings.nowPlaying.title}`);
      const queueData = [];
      if (titleArray.length == 0) {queueData.push('There are no songs in queue after the current song.'); }
      for (let i = 0; i < titleArray.length; i++) {
        queueData.push(`**${i + 1}.** ${titleArray[i]}`);
      }
      queueEmbed.addField('Up next:', queueData.join('\n'));
      return message.channel.send({ embeds: [queueEmbed] });
    }
    else if (args[0].toLowerCase() == 'list' && args[1].toLowerCase() == 'clear') {
      musicSettings.queue.length = 0;
      return message.channel.send('Cleared all songs queued after the current playing song.');
    }
    else if (args[0].toLowerCase() == 'list' && args[1].toLowerCase() == 'remove') {
      if (musicSettings.queue.length == 0) {
        return message.channel.send('There are no songs in queue!');
      }
      if (args[2] && parseInt(args[2])) {
        if (parseInt(args[2]) > musicSettings.queue.length) {
          return message.channel.send(`There are only ${ musicSettings.queue.length} songs in queue!`);
        }
        const removeIdx = parseInt(args[2]) - 1;
        message.channel.send(`Removing ${musicSettings.queue[removeIdx].title} from queue. Here is the new queue:`);
        musicSettings.queue.splice(removeIdx, 1);
        const titleArray = [];
        musicSettings.queue.map(obj => {
          titleArray.push(obj.title);
        });
        const queueEmbed = new Discord.MessageEmbed()
          .setColor('#ff7373');
        const queueData = [`**Now Playing**: ${ musicSettings.nowPlaying.title}`];
        if (titleArray.length == 0) {queueData.push('There are no songs in queue after the current song.'); }
        for (let i = 0; i < titleArray.length; i++) {
          queueData.push(`**${i + 1}.** ${titleArray[i]}`);
        }
        queueEmbed.addField('Music queue', queueData.join('\n'));
        return message.channel.send({ embeds: [queueEmbed] });
      }
      else { return message.channel.send(`Please specify a single number to be removed. Use **${config.prefix}yt list** to see queue numbers.`); }
    }
    else if (args[0].toLowerCase() == 'pause' && !args[1]) {
      if (!musicSettings.songDispatcher) { return message.channel.send('There is no song playing right now!'); }
      if (musicSettings.songDispatcher.paused) { return message.channel.send('Playback is already paused!'); }
      musicSettings.songDispatcher.paused = true;
      message.channel.send('Song paused :pause_button:');
      musicSettings.songDispatcher.pause();
      await wait(300000);
      if (musicSettings.songDispatcher.pausedTime && musicSettings.songDispatcher.pausedTime >= 290000) {
        musicSettings.volume = 0.2;
        musicSettings.queue.length = 0;
        musicSettings.songDispatcher = null;
        musicSettings.nowPlaying = null;
        musicSettings.isPlaying = false;
        musicSettings.voiceChannel.leave();
        resizeIfNeeded(musicSettings.voiceChannel, 'decrement');
        musicSettings.voiceChannel = null;
        return;
      }
    }
    else if ((args[0].toLowerCase() == 'play' || args[0].toLowerCase() == 'resume') && !args[1]) {
      if (!musicSettings.songDispatcher) { return message.channel.send('There is no song playing right now!'); }
      if (!musicSettings.songDispatcher.paused) { return message.channel.send('Playback is not paused!'); }
      musicSettings.songDispatcher.paused = false;
      message.channel.send('Song resumed :play_pause:');
      return musicSettings.songDispatcher.resume();
    }
    else if (args[0].toLowerCase() == 'skip' && !args[1]) {
      if (!musicSettings.songDispatcher) { return message.channel.send('There is no song playing right now!'); }
      message.channel.send(`Skipping ${ musicSettings.nowPlaying.title}...`);
      if (musicSettings.queue.length < 1) {
        message.channel.send('Queue is empty. I will wait 1 minute before leaving the voice channel');
        musicSettings.songDispatcher.pause();
        musicSettings.isPlaying = false;
        await wait(60000);
        if (musicSettings.isPlaying == false) {
          musicSettings.volume = 0.2;
          musicSettings.songDispatcher = null;
          musicSettings.nowPlaying = null;
          musicSettings.isPlaying = false;
          musicSettings.voiceChannel.leave();
          resizeIfNeeded(musicSettings.voiceChannel, 'decrement');
          return;
        }
      }
      return await playSong(musicSettings.queue);
    }
    else if (args[0].toLowerCase() == 'stop' && !args[1]) {
      if (!musicSettings.songDispatcher) { message.channel.send('Playback reset.'); }
      else { message.channel.send('Stopping playback. Goodbye!'); }
      musicSettings.volume = 0.2;
      musicSettings.queue.length = 0;
      musicSettings.songDispatcher = null;
      musicSettings.nowPlaying = null;
      musicSettings.isPlaying = false;
      if (musicSettings.voiceChannel) {
        musicSettings.voiceChannel.leave();
        resizeIfNeeded(musicSettings.voiceChannel, 'decrement');
        return;
      }
      return;
    }
    else { return message.channel.send(`Invalid or too many arguments! Please try **${config.prefix}help yt** for help.`); }
  },
  async init(client) {
    client.musicData = new Discord.Collection();
    const musicDefaults = {
      queue: [],
      isPlaying: false,
      volume: 0.2,
      songDispatcher: null,
      voiceChannel: null,
      voiceTextChannel: null,
      nowPlaying: null,
    };
    for (const guild of await client.guilds.fetch()) {
      client.musicData.set(guild[1].id, musicDefaults);
    }
  },
}; */