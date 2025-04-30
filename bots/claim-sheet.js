
const { GoogleSpreadsheet } = require('google-spreadsheet');

const SPREADSHEET_ID = '1cANnNd5Mn0pelmdrOuR__EtYb1hV5mme4mrcQhTzD2Y';
const PROCESS_SHEET_NAME = 'ProcessedTx';
const CLAIM_SHEET_NAME = 'Sheet1';

async function logClaimToSheet({ wallet, amount, lotteryId, tx, role }) {
    const creds = JSON.parse(
      Buffer.from(process.env.GOOGLE_SERVICE_JSON_B64, 'base64').toString('utf8')
    );
    const doc = new GoogleSpreadsheet(SPREADSHEET_ID)
    await doc.useServiceAccountAuth(creds);
    await doc.loadInfo();
  
    const claimSheet = doc.sheetsByTitle[CLAIM_SHEET_NAME]; // Winner claims sheet
    const processedSheet = doc.sheetsByTitle[PROCESS_SHEET_NAME]; // Processed transactions tab

    await claimSheet.addRow({
      'Lottery #': lotteryId,
      'Wallet': wallet,
      'Amount (SOL)': (amount/1e9).toFixed(2),
      'TX': tx,
      'Time': new Date().toISOString(),
      'Role': role
    });

    await processedSheet.addRow({
      'TX Signature': tx,
      'Lottery ID': lotteryId,
      'Wallet': wallet,
      'Amount (SOL)': (amount / 1e9).toFixed(2),
      'Time': new Date().toISOString(),
    });
  
    console.log('✅ Logged claim and processed tx to Google Sheet.')
  }

  module.exports = logClaimToSheet;