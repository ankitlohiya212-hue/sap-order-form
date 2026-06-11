# Deploying SAP Order Entry Web to Vercel

## 1. Prepare the Google Sheet

1. Make sure the file is a native Google Sheet, not only an uploaded `.xlsx`.
2. Confirm these tabs exist:
   - Current month tab, for example `SMKDR June 26` or `SMKDR June 2026`
   - `SAP Codes`
   - `Item Codes`
3. In `Item Codes`, use these columns:
   - `Prod Code`
   - `Product Discription`
   - `Product Nick Name`
4. Share the Google Sheet with the service account email as **Editor**.
5. Copy the spreadsheet ID from the URL:
   - In `https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit`, copy `SPREADSHEET_ID`.

## 2. Test Locally

1. Import the existing Telegram Bot Google configuration:

```powershell
.\scripts\import-telegram-config.ps1 -Passcode "choose-a-strong-passcode"
```

2. This creates an ignored `.env.local` containing:
   - `GOOGLE_SHEET_ID`
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - `GOOGLE_PRIVATE_KEY`
   - `ORDER_ENTRY_PASSCODE`
   - `CUSTOMER_ID_PREFIX=500100`
   - `ORDER_ENTRY_TIMEZONE=Asia/Kolkata`
3. The imported private key is quoted and uses escaped newlines:

```env
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

4. Run:

```powershell
npm install
npm run dev
```

5. Open `http://127.0.0.1:3000`.

## 3. Upload to GitHub

1. Create a new GitHub repository.
2. Commit and push this `OrderEntryWeb` folder.
3. Do not commit `.env.local`, `node_modules`, or `.next`.

If you push the whole SAP Automation repository instead of only this folder, set Vercel's root directory to `OrderEntryWeb`.

## 4. Deploy on Vercel

1. Go to Vercel and choose **Add New Project**.
2. Import the GitHub repository.
3. Set:
   - Framework Preset: `Next.js`
   - Root Directory: `OrderEntryWeb` if using the larger repo
   - Build Command: `npm run build`
   - Install Command: `npm install`
4. Add the same environment variables from `.env.local`.
5. Click **Deploy**.

## 5. Smoke Test Production

1. Open the Vercel URL.
2. Enter the shared passcode.
3. Confirm the current month tab name shown at the top.
4. Submit one small test order to a copied/test spreadsheet first.
5. Confirm the order appears in the next column, with row 5 still blank.
