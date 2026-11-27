-- Rol KAM heet voortaan QHSE (bestaande gebruikers behouden hun rol)
ALTER TYPE "Role" RENAME VALUE 'KAM' TO 'QHSE';

-- Gegevens uit de basisvulling meenemen
UPDATE "JobFunction" SET "name" = 'QHSE-coördinator', "updatedAt" = CURRENT_TIMESTAMP
WHERE "name" = 'KAM-coördinator' AND NOT EXISTS (SELECT 1 FROM "JobFunction" WHERE "name" = 'QHSE-coördinator');

UPDATE "Norm" SET "description" = replace("description", 'door KAM', 'door QHSE'), "updatedAt" = CURRENT_TIMESTAMP
WHERE "description" LIKE '%door KAM%';

-- Testgebruiker (alleen aanwezig in lokale omgevingen)
UPDATE "User" SET "email" = 'test.qhse@ims.local', "name" = 'Test QHSE', "updatedAt" = CURRENT_TIMESTAMP
WHERE "email" = 'test.kam@ims.local' AND NOT EXISTS (SELECT 1 FROM "User" WHERE "email" = 'test.qhse@ims.local');
