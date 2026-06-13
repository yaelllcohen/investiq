-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ticker" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "price" REAL NOT NULL,
    "thesis" TEXT NOT NULL,
    "risk" TEXT NOT NULL,
    "target" REAL NOT NULL,
    "reviewDate" DATETIME NOT NULL,
    "outcome" TEXT,
    "closePrice" REAL,
    "emotionTag" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    CONSTRAINT "JournalEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TradeDecision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "entryPrice" REAL NOT NULL,
    "stopLoss" REAL NOT NULL,
    "target" REAL NOT NULL,
    "portfolioSize" REAL NOT NULL,
    "riskPercent" REAL NOT NULL,
    "rrRatio" REAL NOT NULL,
    "positionSize" REAL NOT NULL,
    "positionPct" REAL NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "aiSummary" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TradeDecision_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Goal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT NOT NULL,
    "targetAmount" REAL NOT NULL,
    "currentAmount" REAL NOT NULL DEFAULT 0,
    "monthlyDeposit" REAL NOT NULL DEFAULT 0,
    "targetDate" DATETIME NOT NULL,
    "expectedReturn" REAL NOT NULL DEFAULT 7,
    "currency" TEXT NOT NULL DEFAULT 'ILS',
    "icon" TEXT NOT NULL DEFAULT '💰',
    "status" TEXT NOT NULL DEFAULT 'active',
    "depositFrequency" TEXT NOT NULL DEFAULT 'monthly',
    CONSTRAINT "Goal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Holding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" REAL NOT NULL,
    "avgPrice" REAL NOT NULL,
    "purchaseDate" DATETIME NOT NULL,
    "assetType" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "manualPrice" REAL,
    CONSTRAINT "Holding_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Holding" ("assetType", "avgPrice", "id", "name", "purchaseDate", "quantity", "ticker", "userId") SELECT "assetType", "avgPrice", "id", "name", "purchaseDate", "quantity", "ticker", "userId" FROM "Holding";
DROP TABLE "Holding";
ALTER TABLE "new_Holding" RENAME TO "Holding";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
