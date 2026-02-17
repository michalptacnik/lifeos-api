-- CreateEnum
CREATE TYPE "MatrixMembershipState" AS ENUM ('JOINED', 'INVITED', 'LEFT');

-- CreateTable
CREATE TABLE "MatrixIdentity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "matrixUserId" TEXT NOT NULL,
    "displayName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatrixIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatrixRoom" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "externalRoomId" TEXT NOT NULL,
    "alias" TEXT,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatrixRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatrixRoomMembership" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "membership" "MatrixMembershipState" NOT NULL DEFAULT 'JOINED',
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "notificationCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatrixRoomMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatrixRelayEvent" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "externalEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "senderMatrixUserId" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatrixRelayEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MatrixIdentity_userId_key" ON "MatrixIdentity"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MatrixIdentity_matrixUserId_key" ON "MatrixIdentity"("matrixUserId");

-- CreateIndex
CREATE UNIQUE INDEX "MatrixRoom_householdId_externalRoomId_key" ON "MatrixRoom"("householdId", "externalRoomId");

-- CreateIndex
CREATE INDEX "MatrixRoom_householdId_name_idx" ON "MatrixRoom"("householdId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "MatrixRoomMembership_roomId_userId_key" ON "MatrixRoomMembership"("roomId", "userId");

-- CreateIndex
CREATE INDEX "MatrixRoomMembership_userId_membership_idx" ON "MatrixRoomMembership"("userId", "membership");

-- CreateIndex
CREATE UNIQUE INDEX "MatrixRelayEvent_roomId_externalEventId_key" ON "MatrixRelayEvent"("roomId", "externalEventId");

-- CreateIndex
CREATE INDEX "MatrixRelayEvent_roomId_createdAt_idx" ON "MatrixRelayEvent"("roomId", "createdAt");

-- AddForeignKey
ALTER TABLE "MatrixIdentity" ADD CONSTRAINT "MatrixIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatrixRoom" ADD CONSTRAINT "MatrixRoom_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatrixRoomMembership" ADD CONSTRAINT "MatrixRoomMembership_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "MatrixRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatrixRoomMembership" ADD CONSTRAINT "MatrixRoomMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatrixRelayEvent" ADD CONSTRAINT "MatrixRelayEvent_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "MatrixRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
