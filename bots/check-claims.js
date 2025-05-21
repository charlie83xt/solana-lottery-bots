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
const { getActiveResourcesInfo } = require('process');

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

    // Retrieve rows
    const rows = await sheet.getRows();

    // If no Rows only headers
    if (rows.length === 0) {
    //   console.log("DEBUG: No data rows found in the Google Sheet, only headers.");
      return [];
    }
    // Actual header string from Sheet
    const txSignatureActualKey = 'TX Signature';
    // Find the 0-based index of the 'TX Signature' column
    const TX_SIGNATURE_COLUMN_INDEX = sheet.headerValues.indexOf('TX Signature');

    if (TX_SIGNATURE_COLUMN_INDEX === -1) {
      // console.log("ERROR: 'TX Signature' column not found in sheet headers!");
      return [];
    }

    // console.log(`DEBUG: Idenified TX Signature column key as: '${txSignatureActualKey}'`);
    // console.log(`DEBUG: Idenified TX Signature column key as: ${TX_SIGNATURE_COLUMN_INDEX}`);

    const loadedTxs = rows.map(row => {
      let txValue;

      txValue = row.get(txSignatureActualKey);

      if (txValue === 'undefined' || txValue === null) {
        txValue = row.get(txSignatureActualKey.toLowerCase().replace(/[^a-z0-9]/g, ''));
        // console.log(`DEBUG: Attempted to get TX via normalised key, result: ${txValue}`);
      }

      if (txValue === 'undefined' || txValue === null) {
        // const TX_SIGNATURE_COLUMN_INDEX = headerValues.indexOf('TX Signaure');
        if (row._rawData && row._rawData[TX_SIGNATURE_COLUMN_INDEX] !== undefined) {
          txValue = row._rawData[TX_SIGNATURE_COLUMN_INDEX];
          // console.log(`DEBUG: Fallback: Retrieved TX from _rawData a index ${TX_SIGNATURE_COLUMN_INDEX} value: '${txValue}'`);
        } else {
          console.warn(`WARN: TX Signature column has no data at index:, ${TX_SIGNATURE_COLUMN_INDEX} for this row: ${row._rawData}`);
          txValue = 'UNDEFINED_OR_MISSING'; 
        }
      }

      const trimmedTx = String(txValue).trim();
      if (trimmedTx === '' && String(txValue || '') !== '') {
        console.warn(`WARN: TX Signature found but empty after trim for row:, ${JSON.stringify(row._rawData)}`);
      } else if (trimmedTx === 'undefined' || trimmedTx === 'null' || trimmedTx === 'UNDEFINED_OR_MISSING') {
        console.warn(`WARN: TX Signature value is still problematic:, ${trimmedTx} for row: ${JSON.stringify(row._rawData)}`);
      }

      // const tx = String(row['TX Signature']);
      // return tx.trim();
      return trimmedTx;
    });

    const filteredTxs = loadedTxs.filter(tx => tx !== '' && tx !== 'undefined' && tx !== 'null' && tx !== 'UNDEFINED_OR_MISSING');
    // console.log(`DEBUG: Filtered out: ${loadedTxs.length - filteredTxs.length} empty/undefined Tsx from sheet`);
    // console.log(`DEBUG: Final loaded TXs from sheet (length: ${filteredTxs.length}):`);
    // filteredTxs.forEach(tx => console.log(`  - '${tx}'`));

    // return loadedTxs;
    return filteredTxs;
    
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
    // console.log(`DEBUG: Total loaded processed transactions from sheet: ${processedTxs.length}`); // Temp
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
    
    // ##############
    // console.log(`\n--- Checking New Solana Transaction ---`);
    // console.log(`DEBUG: Solana TX: '${trimmedTxSig}'`);
    // console.log(`DEBUG: Solana TX Length: ${trimmedTxSig.length}`);
    // console.log(`DEBUG: Solana TX Hex: ${Buffer.from(trimmedTxSig).toString('hex')}`);

    let isFound = false;
    for (const loadedTx of processedTxs) {
        // First, check for an exact match after trimming
        if (loadedTx === trimmedTxSig) {
            isFound = true;
            // console.log(`DEBUG: *** MATCH FOUND! *** Skipping: '${trimmedTxSig}'`);
            break; // Found it, no need to check further against other loadedTxs
        } else {
            // If no exact match, log detailed differences
            // console.log(`DEBUG: Comparing: '${trimmedTxSig}' (Solana) vs '${loadedTx}' (Sheet)`);
            
            // Check lengths first
            if (loadedTx.length !== trimmedTxSig.length) {
                // console.log(`DEBUG: Length mismatch: Sheet=${loadedTx.length}, Solana=${trimmedTxSig.length}`);
            }

            // Character-by-character comparison
            let diffs = [];
            let maxLength = Math.max(loadedTx.length, trimmedTxSig.length);
            for (let i = 0; i < maxLength; i++) {
                const charSheet = loadedTx[i] || ''; // Handle shorter string
                const charSolana = trimmedTxSig[i] || ''; // Handle shorter string
                
                if (charSheet !== charSolana) {
                    diffs.push(`Idx ${i}: Sheet='${charSheet}' (Code:${charSheet.charCodeAt(0) || 'N/A'}) vs Solana='${charSolana}' (Code:${charSolana.charCodeAt(0) || 'N/A'})`);
                }
            }
            if (diffs.length > 0) {
                // console.log(`DEBUG: Character differences found:`);
                // diffs.forEach(d => console.log(`  - ${d}`));
            } else if (loadedTx.length === trimmedTxSig.length) {
                // This scenario should theoretically not happen if lengths are same and no char diffs, but no exact match.
                // Could indicate a very obscure character or comparison issue if it ever did.
                // console.log(`DEBUG: No visible character differences, but still no match (same length). This is highly unusual.`);
            }
        }
    }

    if (isFound) {
      // THIS IS WHERE THE WHOLE FLOW FOR THIS TRANSACTION SHOULD BE SKIPPED
      // The 'continue' statement correctly does this.
      continue;
    }

    // console.log(`DEBUG: Transaction '${trimmedTxSig}' not found in processedTxs. Attempting to process.`);
    // #############

    // if (processedTxs.includes(trimmedTxSig)) {
    //   // console.log(`DEBUG: Transaction ${trimmedTxSig} already processed. Skipping.`);
    //   continue;
    // }
    
    const tx = await CONNECTION.getTransaction(txSig, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });

    // #################
    if (!tx) {
      console.warn(`WARN: Could not retrieve transaction details for ${txSig}. Skipping processing.`);
      continue; // Skip if transaction details can't be fetched
    }
    // ##################

    const logs = tx?.meta?.logMessages ?? [];
    let isClaimWinnerTx = false;
    for (const log of logs) {
      if (log.includes('CLAIM RECEIPT')) {
        const parsed = parseClaimLog(log);
        if (parsed?.isWinner) {
          isClaimWinnerTx = true; 
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
          // If a winner claim is found and processed, we can break the log loop for this tx
          break;
        }
      }
    }

    if (!isClaimWinnerTx) {
      // console.log(`DEBUG: Transaction ${trimmedTxSig} is not a winner claim or logs not found.`);
    }
  } // End Iterating through signatures

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




