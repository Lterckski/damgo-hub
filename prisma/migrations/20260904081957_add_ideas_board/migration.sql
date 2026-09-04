-- CreateTable
CREATE TABLE "IdeasBoard" (
    "id" TEXT NOT NULL DEFAULT 'ideas-board',
    "snapshotPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdeasBoard_pkey" PRIMARY KEY ("id")
);

-- Seed the single singleton row — see 19-ideas-board.md.
INSERT INTO "IdeasBoard" ("id", "snapshotPath", "createdAt", "updatedAt")
VALUES ('ideas-board', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
