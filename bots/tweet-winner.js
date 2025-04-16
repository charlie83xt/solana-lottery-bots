require('dotenv').config();
const { TwitterApi } = require('twitter-api-v2');

(async () => {
    const fetch = (await import('node-fetch')).default;
})

// Twitter Client
const twitterClient = new TwitterApi({
  appKey: process.env.TWITTER_API_KEY,
  appSecret: process.env.TWITTER_API_SECRET,
  accessToken: process.env.TWITTER_ACCESS_TOKEN,
  accessSecret: process.env.TWITTER_ACCESS_SECRET,
});


async function tweetWinnerClaim({ wallet, amount, lotteryId, tx }) {
  const message = `🎉 Winner Claimed!\n🏆 Lottery #${lotteryId}\n💰 ${amount/1e9} SOL\n🔑 ${wallet}\n🔗 https://explorer.solana.com/tx/${tx}?cluster=devnet`;
  await twitterClient.v2.tweet(message);
  console.log("✅ Tweeted:", message);
}
// console.log(process.env.TWITTER_API_KEY);

module.exports = tweetWinnerClaim;






