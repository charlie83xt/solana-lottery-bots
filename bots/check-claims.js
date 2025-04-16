require('dotenv').config();
const logClaimToSheet = require('./claim-sheet');
const { Connection, PublicKey } = require('@solana/web3.js');
(async () => {
    const fetch = (await import('node-fetch')).default;
})

const fs = require('fs');
const tweetWinnerClaim = require('./tweet-winner');

const PROGRAM_ID = new PublicKey(process.env.VITE_PROGRAM_ID);
const CONNECTION = new Connection('https://api.devnet.solana.com', 'confirmed');

// 🧠 We'll store already-processed txs to avoid repeats
const CACHE_FILE = './claimed-cache.json';

function loadCache() {
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
  } catch {
    return { txs: [] };
  }
}

function saveCache(cache) {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
}

function parseClaimLog(log) {
  const match = log.match(/CLAIM RECEIPT.+wallet:\s(.+?)\s\|\samount:\s(\d+)\s\|\sdev:\s(\w+)\s\|\swinner:\s(\w+)/);
  if (!match) return null;

  const [, wallet, amount, isDev, isWinner] = match;
  return {
    wallet,
    amount: Number(amount),
    isWinner: isWinner === 'true',
    isDev: isDev === 'true',
  };
}

async function checkForWinnerClaims() {
  const cache = loadCache();

  const signatures = await CONNECTION.getSignaturesForAddress(PROGRAM_ID, {
    limit: 20,
  });

  for (const sigInfo of signatures) {
    const txSig = sigInfo.signature;
    if (cache.txs.includes(txSig)) continue;

    const tx = await CONNECTION.getTransaction(txSig, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });

    const logs = tx?.meta?.logMessages ?? [];
    for (const log of logs) {
      if (log.includes('CLAIM RECEIPT')) {
        const parsed = parseClaimLog(log);
        if (parsed?.isWinner) {
          const lotteryId = extractLotteryIdFromLogs(logs);
          const payload = {
            wallet: parsed.wallet,
            amount: parsed.amount,
            lotteryId: lotteryId ?? 'unknown',
            tx: txSig,
          }
          await tweetWinnerClaim(payload);
          await sendTelegram(payload);
          await logClaimToSheet({
            ...payload,
            role: [
              parsed.isDev && 'Dev',
              parsed.isWinner && 'Winner',
              parsed.isParticipant && 'Participant'
            ].filter(Boolean).join(', ')
          });
        }
      }
    }

    cache.txs.push(txSig); // mark this tx as processed
  }

  saveCache(cache);
  console.log("✅ Check complete.");
}

function extractLotteryIdFromLogs(logs) {
  for (const log of logs) {
    const match = log.match(/Lottery\s#?(\d+)/i);
    if (match) return match[1];
  }
  return null;
}

async function sendTelegram({ wallet, amount, lotteryId, tx }) {
    const text = `🎉 Winner Claimed!\n🏆 Lottery #${lotteryId}\n💰 ${amount / 1e9} SOL\n🔑 ${wallet}\n🔗 https://explorer.solana.com/tx/${tx}?cluster=devnet`;

    await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-type': 'application/json' },
        body: JSON.stringify({
            chat_id: process.env.TELEGRAM_CHAT_ID,
            text,
        }),
    });
}


checkForWinnerClaims();




