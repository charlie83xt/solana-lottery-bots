require('dotenv').config();
const logClaimToSheet = require('./claim-sheet');
const { JWT } = require('google-auth-library');
const { Connection, PublicKey } = require('@solana/web3.js');
(async () => {
    const fetch = (await import('node-fetch')).default;
})

const fs = require('fs');
const tweetWinnerClaim = require('./tweet-winner');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { SSL_OP_SSLEAY_080_CLIENT_DH_BUG } = require('constants');

const SPREADSHEET_ID = '1cANnNd5Mn0pelmdrOuR__EtYb1hV5mme4mrcQhTzD2Y';
const SHEET_NAME = 'ProcessedTx';
const PROGRAM_ID = new PublicKey(process.env.VITE_PROGRAM_ID);
const CONNECTION = new Connection('https://api.devnet.solana.com', 'confirmed');

async function loadProcessedTxs() {
  try {
    
    const creds = JSON.parse(
      Buffer.from(process.env.GOOGLE_SERVICE_JSON_B64, 'base64').toString('utf8')
    );
    const serviceAccountAuth = new JWT({
      email: creds.client_email,
      key: creds.private_key,
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
      ],
    });

    const doc = new GoogleSpreadsheet(SPREADSHEET_ID, serviceAccountAuth);
    await doc.loadInfo();

    const sheet = doc.sheetsByTitle[SHEET_NAME];
    if (!sheet) throw new Error(`Sheet "${SHEET_NAME}" not found`);

    await sheet.loadHeaderRow();

    const rows = await sheet.getRows();

    const loadedTxs = rows.map(row => {
      const tx = String(row['TX Signature']);
      return tx.trim();
    })
    return loadedTxs;
    // return rows.map(row => String(row['TX Signature']).trim());
  } catch (e) {
    console.warn(" ⚠️ Could not load from Google sheet. Falling back to local cache.", e);
    return [];
  }
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
  let processedTxs = [];

  try {
    processedTxs = await loadProcessedTxs();
  } catch (e) {
    console.warn(" Could not load from Google sheet. Falling back to local cache.");
    processedTxs = [];
  }

  // const cache = loadCache();

  const signatures = await CONNECTION.getSignaturesForAddress(PROGRAM_ID, {
    limit: 20,
  });

  for (const sigInfo of signatures) {
    const txSig = sigInfo.signature;
    const trimmedTxSig = txSig.trim();
    // console.log(`DEBUG: Checking transaction signaure: '${trimmedTxSig}' (length: ${trimmedTxSig.length})`); //new 19/05


    if (processedTxs.includes(trimmedTxSig)) {
      // console.log(`DEBUG: Transaction ${trimmedTxSig} already processed. Skipping.`);
      continue;
    }
    
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
  }

  // saveCache(cache);
  console.log("✅ Check complete.");
}

function extractLotteryIdFromLogs(logs) {
  for (const log of logs) {
    const match = log.match(/Lottery:\s?(\d+)/i);
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
// console.log(PROGRAM_ID)

checkForWinnerClaims();




