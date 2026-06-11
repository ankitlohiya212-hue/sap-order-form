# SAP Order Entry Web

Next.js/Vercel app for adding pending orders to the current `SMKDR <month> <year>` Google Sheet tab.

## Required Google Sheet Tabs

- Monthly order tab, for example `SMKDR June 26` or `SMKDR June 2026`
- `SAP Codes`
- `Item Codes`

`Item Codes` should have these headers:

- `Prod Code`
- `Product Discription`
- `Product Nick Name`

## Environment Variables

Copy `.env.example` to `.env.local` for local development, then set the same values in Vercel:

- `GOOGLE_SHEET_ID`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_PRIVATE_KEY`
- `ORDER_ENTRY_PASSCODE`
- `CUSTOMER_ID_PREFIX`
- `ORDER_ENTRY_TIMEZONE`

To import the Google Sheet and service-account settings already used by
`Telegram Bot/config.json`, run:

```powershell
.\scripts\import-telegram-config.ps1 -Passcode "choose-a-strong-passcode"
```

## Commands

```powershell
npm install
npm run dev
npm run typecheck
npm test
npm run build
```
