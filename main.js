var _ = require('lodash');
var dateformat = require('dateformat');
var fetch = require('fetch');
var playSound = require('play-sound');
var q = require('q');
var terminalKit = require( 'terminal-kit' );

const APP_NAME = 'Reddit Watch';
const REFRESH_INTERVAL = 1000 * 60;
const SEEN_POSTS_SIZE = 1000;
const API_ENDPOINT_PATTERN = 'https://www.reddit.com/r/$1/new.json';
const PERMALINK_BASE = 'https://www.reddit.com';
const NOTIFICATION_SOUND_PATH = './notify.mp3';
const MAX_IMAGE_WIDTH = 400;

var seenPosts = [];
var player = playSound({});
var reddit = process.argv[2];
var terminal = terminalKit.terminal;

terminal.windowTitle(APP_NAME);
terminal.hideCursor();

if (!reddit) {
  printError('You did not specify the subreddit name.');
  return;
}

checkRedditForUpdates();
setInterval(() => checkRedditForUpdates(), REFRESH_INTERVAL);

function checkRedditForUpdates() {
  fetch.fetchUrl(reddit.replace(/(.*)/, API_ENDPOINT_PATTERN), (error, meta, body) => {
    try {
      processRedditJson(JSON.parse(body.toString()));
    } catch(e) {
      printError(e.message);
      terminal.yellow('Don\'t panic. Will try again.' + '\n');
      return;
    }
  });
}

function processRedditJson(json) {
  var newPostIds = [];
  var newPosts = {};
  var promises = [];

  json.data.children.reverse().forEach((post) => {
    if (!seenPosts.includes(post.data.id)) {
      // Normalize data
      post.data.images = post.data.preview ? post.data.preview.images : [];

      newPostIds.push(post.data.id);
      newPosts[post.data.id] = post.data;

      post.data.images.forEach((image) => {
        promises.push(fetchImage(image.source.url));
      })
    }
  });

  q.all(promises).then((fetchedImages) => {
    var images = {};

    fetchedImages.forEach((fetchedImage) => {
      images[fetchedImage.url] = fetchedImage.data;
    });

    newPostIds.forEach((postId) => {
      var newImages = [];

      newPosts[postId].images.forEach((image) => {
        newImages.push({
          width: image.source.width,
          data: images[image.source.url]
        });
      });

      newPosts[postId].images = newImages;
      printPost(newPosts[postId]);
    });

    newPostIds.length && player.play(NOTIFICATION_SOUND_PATH);
    seenPosts = seenPosts.concat(newPostIds);

    // Prevent memory leak
    if (seenPosts.length > SEEN_POSTS_SIZE) {
      seenPosts = seenPosts.slice(seenPosts.length - SEEN_POSTS_SIZE);
    }
  });
}

function fetchImage(url) {
  var deferred = q.defer();

  fetch.fetchUrl(url, (error, meta, body) => {
    deferred.resolve({
      url: url,
      data: body.toString('base64')
    });
  });

  return deferred.promise;
}

function printPost(post) {
  terminal.bold.green(_.unescape(post.title) + '\n');
  terminal.magenta(dateformat(post.created_utc * 1000, 'h:MM:ss TT'));
  post.link_flair_text ? terminal.cyan(' ' + post.link_flair_text + '\n') : terminal('\n');
  terminal.yellow('Comments: ').styleReset.dim(PERMALINK_BASE + post.permalink + '\n');
  !post.url.includes(post.permalink) && terminal.yellow('Link: ').styleReset.dim(post.url + '\n');
  post.images.forEach(printImage);
  terminal(_.unescape(post.selftext) + '\n\n');
}

function printImage(image) {
  var width = Math.min(image.width, MAX_IMAGE_WIDTH);

  terminal('\033]');
  terminal(`1337;File=;width=${width}px;inline=1:`);
  terminal(image.data);
  terminal('\u0007\n');
}

function printError(message) {
  terminal.bold.red('Error: ').styleReset(message + '\n');
}
