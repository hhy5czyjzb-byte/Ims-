-- AlterTable
ALTER TABLE "Action" ADD COLUMN     "rootCause" TEXT;

-- AlterTable
ALTER TABLE "Objective" ADD COLUMN     "acceptance" TEXT,
ADD COLUMN     "feasibility" TEXT;

