
-- CreateEnum
CREATE TYPE "RiskCategory" AS ENUM ('STRATEGIC', 'QUALITY', 'ENVIRONMENT', 'SAFETY', 'CO2', 'COMPLIANCE', 'OTHER');

-- AlterTable
ALTER TABLE "Risk" ADD COLUMN     "category" "RiskCategory" NOT NULL DEFAULT 'OTHER',
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "number" SERIAL NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Risk_number_key" ON "Risk"("number");

-- AddForeignKey
ALTER TABLE "Risk" ADD CONSTRAINT "Risk_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
