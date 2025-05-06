
const { GoogleSpreadsheet } = require('google-spreadsheet');

const SPREADSHEET_ID = '1cANnNd5Mn0pelmdrOuR__EtYb1hV5mme4mrcQhTzD2Y';
const PROCESS_SHEET_NAME = 'ProcessedTx';
const CLAIM_SHEET_NAME = 'Sheet1';

async function logClaimToSheet({ wallet, amount, lotteryId, tx, role }) {
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
    console.log('Attempted to add row to claimSheet.');

    await processedSheet.addRow({
      'TX Signature': tx,
      'Lottery ID': lotteryId,
      'Wallet': wallet,
      'Amount (SOL)': (amount / 1e9).toFixed(2),
      'Time': new Date().toISOString(),
    });

    console.log('Attempted to add row to processedSheet.');
  
    console.log('✅ Logged claim and processed tx to Google Sheet.')

  } catch (error) {
    console.error('❌ Error logging o Google Sheet:', error);
  }
    
}

module.exports = logClaimToSheet;