-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('CONCEPT', 'APPROVED');

-- AlterTable
ALTER TABLE "Action" ADD COLUMN     "managementReviewId" TEXT;

-- CreateTable
CREATE TABLE "ManagementReview" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'CONCEPT',
    "meetingDate" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "logoImageId" TEXT,
    "stripImageId" TEXT,
    "footerText" TEXT,
    "basedOnId" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManagementReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewSlide" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "layout" TEXT NOT NULL,
    "kicker" TEXT,
    "title" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "imageId" TEXT,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewSlide_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewImage" (
    "id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "name" TEXT,
    "hash" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ManagementReview_number_key" ON "ManagementReview"("number");

-- CreateIndex
CREATE INDEX "ReviewSlide_reviewId_order_idx" ON "ReviewSlide"("reviewId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewImage_hash_key" ON "ReviewImage"("hash");

-- AddForeignKey
ALTER TABLE "Action" ADD CONSTRAINT "Action_managementReviewId_fkey" FOREIGN KEY ("managementReviewId") REFERENCES "ManagementReview"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagementReview" ADD CONSTRAINT "ManagementReview_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagementReview" ADD CONSTRAINT "ManagementReview_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewSlide" ADD CONSTRAINT "ReviewSlide_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "ManagementReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

