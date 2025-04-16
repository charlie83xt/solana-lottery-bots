
const { GoogleSpreadsheet } = require('google-spreadsheet');

async function logClaimToSheet({ wallet, amount, lotteryId, tx, role }) {
    const creds = JSON.parse(
      Buffer.from(process.env.GOOGLE_SERVICE_JSON_B64, 'base64').toString('utf8')
    );
    const doc = new GoogleSpreadsheet('1cANnNd5Mn0pelmdrOuR__EtYb1hV5mme4mrcQhTzD2Y')
    await doc.useServiceAccountAuth(creds);
    await doc.loadInfo();
  
    const sheet = doc.sheetsByIndex[0];
    await sheet.addRow({
      'Lottery #': lotteryId,
      'Wallet': wallet,
      'Amount (SOL)': (amount/1e9).toFixed(2),
      'TX': tx,
      'Time': new Date().toISOString(),
      'Role': role
    });
  
    console.log('✅ Logged claim to Google Sheet.')
  
  }

  module.exports = logClaimToSheet;